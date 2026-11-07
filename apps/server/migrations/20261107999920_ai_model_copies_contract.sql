-- contract: which model produced a result is on its run (schema review 43). The release before this one reads
-- ai_runs.model_name and stopped writing these copies; 20261107999600 moved what only they held.

SET LOCAL lock_timeout = '5s';

ALTER TABLE ai_submission_analyses DROP COLUMN model_name;
ALTER TABLE ai_course_analyses DROP COLUMN model_name;
ALTER TABLE ai_grade_drafts DROP COLUMN model_name;
