-- no-transaction
-- Schema review 3, item 34: submissions_learner_idx (assessment_id, user_id,
-- attempt_number DESC) repeats submissions_attempt_number_key for counted
-- attempts; the reads that include staff previews go through
-- submissions_user_idx (a learner has few rows).
DROP INDEX CONCURRENTLY IF EXISTS submissions_learner_idx;
