-- Completions (REWRITE 5.4, 5.6 n8; review item 12): one row per activity a
-- learner has completed, the progress fact the projection is derived from.
--
--   lessons/videos/documents: the learner marks it done (the new code writes
--     the row; un-marking and leaving the course delete it);
--   quiz/exam/code/file tasks: the projection's completed_at (a passing,
--     released grade) is mirrored here by the trigger below.
--
-- Expand step: the new code's lesson projection reads completions instead of
-- complete trail_steps, and writes both. The previous release still writes
-- trail steps and activity_progress only, so a trigger on activity_progress
-- mirrors every completed_at into completions (insert when set, delete when
-- cleared). The trigger stays until the graded writers insert completions in
-- the grade transaction themselves (REWRITE 5.6 n8 lists the remaining steps).
--
-- activity_progress and trail_steps are locked against writes while the
-- trigger is created and the table backfilled, so no completion is missed.

SET LOCAL lock_timeout = '5s';

CREATE TABLE completions (
    activity_id  uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    completed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (activity_id, user_id)
);

CREATE INDEX completions_user_idx ON completions (user_id);

COMMENT ON TABLE completions IS
    'Activities a learner completed: the progress fact. activity_progress and course_progress are derived from it (and from submissions for graded kinds).';

LOCK TABLE activity_progress, trail_steps IN SHARE ROW EXCLUSIVE MODE;

CREATE FUNCTION activity_progress_sync_completion() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.completed_at IS NOT NULL THEN
        INSERT INTO completions (activity_id, user_id, completed_at)
        VALUES (NEW.activity_id, NEW.user_id, NEW.completed_at)
        ON CONFLICT DO NOTHING;
    ELSIF TG_OP = 'UPDATE' AND OLD.completed_at IS NOT NULL THEN
        DELETE FROM completions
        WHERE activity_id = NEW.activity_id AND user_id = NEW.user_id;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER activity_progress_sync_completion
    AFTER INSERT OR UPDATE OF completed_at ON activity_progress
    FOR EACH ROW EXECUTE FUNCTION activity_progress_sync_completion();

-- Backfill: every completed projection row, plus complete trail steps of
-- lesson-type activities (ETL-migrated steps may have no projection row;
-- graded kinds complete through their submissions only, never a step).
INSERT INTO completions (activity_id, user_id, completed_at)
SELECT activity_id, user_id, min(at)
FROM (
    SELECT activity_id, user_id, completed_at AS at
    FROM activity_progress
    WHERE completed_at IS NOT NULL
    UNION ALL
    SELECT s.activity_id, s.user_id, s.created_at
    FROM trail_steps s
    JOIN activities a ON a.id = s.activity_id
    WHERE s.complete
      AND a.activity_type <> 'file_submission'
      AND NOT EXISTS (SELECT 1 FROM assessments x WHERE x.activity_id = s.activity_id)
) done
GROUP BY activity_id, user_id;
