-- The model is the run's fact (schema review 43): results read it through run_id from this release on, and a later
-- one drops their copies. A run that lost the name to a finish path gets it from its result.

SET LOCAL lock_timeout = '5s';

-- data-fix: a run without a model takes the one its result copied.
UPDATE ai_runs r SET model_name = x.model_name FROM ai_submission_analyses x
 WHERE x.run_id = r.id AND r.model_name IS NULL AND x.model_name IS NOT NULL;
-- data-fix: a run without a model takes the one its result copied.
UPDATE ai_runs r SET model_name = x.model_name FROM ai_course_analyses x
 WHERE x.run_id = r.id AND r.model_name IS NULL AND x.model_name IS NOT NULL;
-- data-fix: a run without a model takes the one its result copied.
UPDATE ai_runs r SET model_name = x.model_name FROM ai_grade_drafts x
 WHERE x.run_id = r.id AND r.model_name IS NULL AND x.model_name IS NOT NULL;
