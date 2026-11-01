SET LOCAL lock_timeout = '5s';

-- Schema review 3, item 23: validate the keys 20261102010800 re-created
-- NOT VALID. VALIDATE takes SHARE UPDATE EXCLUSIVE: reads and writes go on
-- during the scan. The rows satisfied the same keys before, so this cannot
-- fail on data.

ALTER TABLE activities VALIDATE CONSTRAINT activities_chapter_id_fkey;
ALTER TABLE assessments VALIDATE CONSTRAINT assessments_activity_id_fkey;
ALTER TABLE file_submissions VALIDATE CONSTRAINT file_submissions_activity_id_fkey;
ALTER TABLE activity_progress VALIDATE CONSTRAINT activity_progress_activity_id_fkey;
ALTER TABLE trail_steps VALIDATE CONSTRAINT trail_steps_activity_id_fkey;
ALTER TABLE submissions VALIDATE CONSTRAINT submissions_assessment_id_fkey;
ALTER TABLE file_submission_attempts VALIDATE CONSTRAINT file_submission_attempts_file_submission_id_fkey;
ALTER TABLE course_discussions VALIDATE CONSTRAINT course_discussions_parent_id_fkey;
