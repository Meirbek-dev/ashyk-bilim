-- Database review 2026-11-15: what one release can take (no code reads any of it).
SET LOCAL lock_timeout = '5s';

-- Each of these rollups has a primary key led by its date, which already serves the retention sweep.
DROP INDEX IF EXISTS daily_assessment_metrics_date_brin;
DROP INDEX IF EXISTS daily_course_engagement_date_brin;
DROP INDEX IF EXISTS daily_course_metrics_date_brin;
DROP INDEX IF EXISTS daily_user_course_progress_date_brin;
DROP INDEX IF EXISTS learner_risk_snapshots_date_brin;

-- The column's domain (percent) states the same bounds.
ALTER TABLE activity_progress DROP CONSTRAINT IF EXISTS activity_progress_score_check;

-- 0 never passed collection_courses_position_check; every insert names its position.
ALTER TABLE collection_courses ALTER COLUMN position DROP DEFAULT;

-- The API's limits (MAX_ATTEMPTS, the garde lengths), stated by the database too.
SELECT schema_try_check('assessments', 'assessments_max_attempts_cap', 'max_attempts IS NULL OR max_attempts <= 10');
SELECT schema_try_check('assessments', 'assessments_description_check', 'char_length(description) <= 20000');
SELECT schema_try_check('assessment_overrides', 'assessment_overrides_note_check', 'char_length(note) <= 1000');
SELECT schema_try_check('users', 'users_bio_check', 'char_length(bio) <= 2000');
SELECT schema_try_check('users', 'users_organization_check', 'char_length(organization) <= 200');
SELECT schema_try_check('usergroups', 'usergroups_description_check', 'char_length(description) <= 5000');
SELECT schema_try_check('teacher_interventions', 'teacher_interventions_notes_check', 'char_length(notes) <= 4000');
SELECT schema_try_check('teacher_interventions', 'teacher_interventions_outcome_check', 'char_length(outcome) <= 2000');
