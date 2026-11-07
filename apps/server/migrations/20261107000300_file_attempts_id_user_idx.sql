-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS file_submission_attempts_id_user_key ON file_submission_attempts (id, user_id);
