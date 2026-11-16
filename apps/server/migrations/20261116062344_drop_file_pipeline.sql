-- contract: since 20261115155501 a file task, its hand-ins, grades and extensions live in the assessment pipeline;
-- nothing reads or writes what this file drops (REWRITE 5.8 item 1).
SET LOCAL lock_timeout = '5s';

-- An analysis, draft or remediation of a file hand-in names its submission: every row has one.
ALTER TABLE ai_grade_drafts DROP COLUMN file_attempt_id;
ALTER TABLE ai_grade_drafts ALTER COLUMN submission_id SET NOT NULL;
ALTER TABLE ai_remediation_sessions DROP COLUMN file_submission_attempt_id;
ALTER TABLE ai_remediation_sessions ALTER COLUMN submission_id SET NOT NULL;
ALTER TABLE ai_submission_analyses DROP COLUMN file_submission_attempt_id;
ALTER TABLE ai_submission_analyses ALTER COLUMN submission_id SET NOT NULL;

DROP TABLE file_grading_entries;
DROP FUNCTION file_grading_entries_immutable();
DROP FUNCTION file_grading_entries_no_delete();
DROP FUNCTION file_grading_entries_number();
DROP TABLE file_submission_overrides;
DROP TABLE file_submission_attempts;

-- The task's policy and lifecycle are its assessments row's.
ALTER TABLE file_submissions
    DROP COLUMN due_at,
    DROP COLUMN allow_late,
    DROP COLUMN late_policy_kind,
    DROP COLUMN late_penalty_percent_per_day,
    DROP COLUMN late_penalty_max_days,
    DROP COLUMN late_cutoff_at,
    DROP COLUMN max_attempts,
    DROP COLUMN grade_release_mode,
    DROP COLUMN lifecycle,
    DROP COLUMN published_at,
    DROP COLUMN archived_at,
    DROP COLUMN creator_id;
