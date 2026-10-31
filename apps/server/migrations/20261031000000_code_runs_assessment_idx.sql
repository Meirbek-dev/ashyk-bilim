-- "Activities with learner work" (unpublish instead of delete) reads an activity's code runs by assessment:
-- without this index every checked activity scanned the whole table (41k rows, one staff account, 2026-10-29).
CREATE INDEX code_runs_assessment_user_idx ON code_runs (assessment_id, user_id);
