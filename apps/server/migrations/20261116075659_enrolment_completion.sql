-- Course completion, switch (REWRITE 5.8 item 10, owner decision 2026-11-18): a member's completion is
-- `enrolments.completed_at`.
--
-- The projector sets it once, the first time the member's `course_progress_v` row is complete, and that
-- transition is what pays `course_completed`. It is never cleared while the enrolment exists: a course that
-- later gains a required activity keeps the completion (the course's current state stays the view's), and a
-- leave deletes the enrolment with it. The backfill copies `course_progress.completed_at`, so every completion
-- the previous release noticed reads as noticed and nothing fires for it again.
--
-- Switch release: the server no longer reads or writes `course_progress`. The previous release (the rollback
-- image) writes it and reads its `certificate_eligible` to notice a completion, so a trigger on each side
-- carries a completion across: one the previous release notices reaches `enrolments.completed_at`, and one
-- this release records marks the stored row complete (the previous release then sees no transition and pays
-- nothing again). Each copy changes nothing the second time, so it stops there. The stored row's other
-- columns go stale until the previous release re-projects the member; it reads nothing else. A contract drops
-- the table, both triggers and their functions (pending-contracts.tsv).
SET LOCAL lock_timeout = '5s';

ALTER TABLE enrolments ADD COLUMN completed_at timestamptz;
COMMENT ON COLUMN learning.enrolments.completed_at IS
    'When the member first completed the course (course_progress_v); set once by the projector, never cleared.';
UPDATE enrolments e SET completed_at = p.completed_at
  FROM course_progress p
 WHERE p.course_id = e.course_id AND p.user_id = e.user_id AND p.completed_at IS NOT NULL;

-- A completion the previous release notices (it writes `completed_at` exactly on a completed member's row).
CREATE FUNCTION course_progress_completion() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    UPDATE enrolments SET completed_at = NEW.completed_at
     WHERE course_id = NEW.course_id AND user_id = NEW.user_id AND completed_at IS NULL;
    RETURN NULL;
END $$;
CREATE TRIGGER course_progress_completion AFTER INSERT OR UPDATE OF completed_at ON course_progress
    FOR EACH ROW WHEN (NEW.completed_at IS NOT NULL)
    EXECUTE FUNCTION course_progress_completion();

-- A completion this release records: the stored row reads complete (`certificate_eligible`), the counts and
-- averages from the view. The counts are made equal: the projector set the completion on the view's rule, and
-- the row only has to say "noticed" to the previous release.
CREATE FUNCTION enrolments_completion() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    INSERT INTO course_progress (course_id, user_id, total_required_count, completed_required_count,
                                 missing_required_count, needs_grading_count, last_activity_at, grade_average,
                                 weighted_grade_average, completed_at)
    SELECT v.course_id, v.user_id, greatest(v.total_required_count, 1), greatest(v.total_required_count, 1),
           0, v.needs_grading_count, v.last_activity_at, v.grade_average, v.weighted_grade_average,
           NEW.completed_at
      FROM course_progress_v v
     WHERE v.course_id = NEW.course_id AND v.user_id = NEW.user_id
    ON CONFLICT (course_id, user_id) DO UPDATE SET
        total_required_count = EXCLUDED.total_required_count,
        completed_required_count = EXCLUDED.completed_required_count,
        missing_required_count = 0,
        needs_grading_count = EXCLUDED.needs_grading_count,
        last_activity_at = EXCLUDED.last_activity_at,
        grade_average = EXCLUDED.grade_average,
        weighted_grade_average = EXCLUDED.weighted_grade_average,
        completed_at = EXCLUDED.completed_at;
    RETURN NULL;
END $$;
CREATE TRIGGER enrolments_completion AFTER UPDATE OF completed_at ON enrolments
    FOR EACH ROW WHEN (OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL)
    EXECUTE FUNCTION enrolments_completion();
