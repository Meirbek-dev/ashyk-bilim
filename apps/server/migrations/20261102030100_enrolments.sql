-- Enrolments (REWRITE 5.6 n5, 5.4): course membership is its own row instead
-- of "holds a trail run". The trail stays the learner's list of runs and
-- marked steps (steps are the progress fact until completions land).
--
-- Expand step: the new code reads membership from enrolments and writes it
-- next to the run in the same transaction. The previous release still
-- creates and deletes trail runs only, so a trigger mirrors those writes into
-- enrolments until the lane C contract migration drops it. trail_runs is
-- locked against writes while the trigger is created and the table backfilled,
-- so no run is missed between the two.

SET LOCAL lock_timeout = '5s';

CREATE TABLE enrolments (
    course_id   uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    enrolled_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id, user_id)
);

CREATE INDEX enrolments_user_idx ON enrolments (user_id);

COMMENT ON TABLE enrolments IS
    'Course membership (a learner joined or was enrolled). The course''s staff are never members, even with a row: readers add NOT is_course_staff(course_id, user_id).';

LOCK TABLE trail_runs IN SHARE ROW EXCLUSIVE MODE;

CREATE FUNCTION trail_runs_sync_enrolment() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO enrolments (course_id, user_id, enrolled_at)
        VALUES (NEW.course_id, NEW.user_id, NEW.created_at)
        ON CONFLICT DO NOTHING;
    ELSE
        DELETE FROM enrolments e
        WHERE e.course_id = OLD.course_id AND e.user_id = OLD.user_id
          AND NOT EXISTS (SELECT 1 FROM trail_runs r
                          WHERE r.course_id = OLD.course_id AND r.user_id = OLD.user_id);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trail_runs_sync_enrolment
    AFTER INSERT OR DELETE ON trail_runs
    FOR EACH ROW EXECUTE FUNCTION trail_runs_sync_enrolment();

INSERT INTO enrolments (course_id, user_id, enrolled_at)
SELECT course_id, user_id, min(created_at)
FROM trail_runs
GROUP BY course_id, user_id;

-- An archived course stays visible to its members (COURSE_ARCHIVING 8):
-- members are enrolments now. Same body as 20261002000001 otherwise.
CREATE OR REPLACE FUNCTION course_visible(c courses, p_viewer uuid, p_see_all boolean)
    RETURNS boolean
    LANGUAGE sql STABLE AS $$
  SELECT c.public OR p_see_all OR c.creator_id = p_viewer
      OR EXISTS (SELECT 1 FROM resource_authors ra
                 WHERE ra.course_id = c.id AND ra.user_id = p_viewer AND ra.status = 'active')
      OR EXISTS (SELECT 1 FROM usergroup_courses uc
                 JOIN usergroup_members m ON m.usergroup_id = uc.usergroup_id
                 WHERE uc.course_id = c.id AND m.user_id = p_viewer)
      OR (c.archived_at IS NOT NULL
          AND EXISTS (SELECT 1 FROM enrolments e
                      WHERE e.course_id = c.id AND e.user_id = p_viewer))
$$;
