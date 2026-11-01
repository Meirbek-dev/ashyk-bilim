SET LOCAL lock_timeout = '5s';

-- Schema review 3, item 23: the composite (parent_id, course_id) keys of
-- 20261101220000 said ON UPDATE CASCADE, so a parent's course_id change
-- would silently rewrite every child, learner work included (an activity
-- moved to another course would carry its submissions along). No code path
-- changes a parent's course: activities move only between chapters of their
-- course (`move_activity` answers 422 otherwise), and a course copy makes
-- new rows. The keys become ON UPDATE RESTRICT: such a change is refused
-- while children exist. Same names (the error mapping reads them), same
-- ON DELETE CASCADE.
--
-- NOT VALID here (no scan while the tables are locked);
-- 20261102010900 validates them in its own transaction, which blocks no
-- writes. New and updated rows are checked from this migration on.

ALTER TABLE activities DROP CONSTRAINT activities_chapter_id_fkey,
    ADD CONSTRAINT activities_chapter_id_fkey FOREIGN KEY (chapter_id, course_id)
        REFERENCES chapters (id, course_id) ON DELETE CASCADE ON UPDATE RESTRICT NOT VALID;
ALTER TABLE assessments DROP CONSTRAINT assessments_activity_id_fkey,
    ADD CONSTRAINT assessments_activity_id_fkey FOREIGN KEY (activity_id, course_id)
        REFERENCES activities (id, course_id) ON DELETE CASCADE ON UPDATE RESTRICT NOT VALID;
ALTER TABLE file_submissions DROP CONSTRAINT file_submissions_activity_id_fkey,
    ADD CONSTRAINT file_submissions_activity_id_fkey FOREIGN KEY (activity_id, course_id)
        REFERENCES activities (id, course_id) ON DELETE CASCADE ON UPDATE RESTRICT NOT VALID;
ALTER TABLE activity_progress DROP CONSTRAINT activity_progress_activity_id_fkey,
    ADD CONSTRAINT activity_progress_activity_id_fkey FOREIGN KEY (activity_id, course_id)
        REFERENCES activities (id, course_id) ON DELETE CASCADE ON UPDATE RESTRICT NOT VALID;
ALTER TABLE trail_steps DROP CONSTRAINT trail_steps_activity_id_fkey,
    ADD CONSTRAINT trail_steps_activity_id_fkey FOREIGN KEY (activity_id, course_id)
        REFERENCES activities (id, course_id) ON DELETE CASCADE ON UPDATE RESTRICT NOT VALID;
ALTER TABLE submissions DROP CONSTRAINT submissions_assessment_id_fkey,
    ADD CONSTRAINT submissions_assessment_id_fkey FOREIGN KEY (assessment_id, course_id)
        REFERENCES assessments (id, course_id) ON DELETE CASCADE ON UPDATE RESTRICT NOT VALID;
ALTER TABLE file_submission_attempts DROP CONSTRAINT file_submission_attempts_file_submission_id_fkey,
    ADD CONSTRAINT file_submission_attempts_file_submission_id_fkey FOREIGN KEY (file_submission_id, course_id)
        REFERENCES file_submissions (id, course_id) ON DELETE CASCADE ON UPDATE RESTRICT NOT VALID;
-- MATCH SIMPLE: a post (parent_id NULL) is not checked.
ALTER TABLE course_discussions DROP CONSTRAINT course_discussions_parent_id_fkey,
    ADD CONSTRAINT course_discussions_parent_id_fkey FOREIGN KEY (parent_id, course_id)
        REFERENCES course_discussions (id, course_id) ON DELETE CASCADE ON UPDATE RESTRICT NOT VALID;
