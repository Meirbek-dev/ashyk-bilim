-- no-transaction
-- Schema review 3, item 34: file_submission_attempts_learner_idx repeats
-- file_submission_attempts_attempt_number_key for counted attempts; the reads
-- that include staff previews go through file_submission_attempts_user_idx
-- (a learner has few rows).
DROP INDEX CONCURRENTLY IF EXISTS file_submission_attempts_learner_idx;
