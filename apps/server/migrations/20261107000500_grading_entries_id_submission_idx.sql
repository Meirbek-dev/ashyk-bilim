-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS grading_entries_id_submission_key ON grading_entries (id, submission_id);
