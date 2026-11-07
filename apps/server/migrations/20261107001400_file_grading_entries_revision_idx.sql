-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS file_grading_entries_attempt_revision_key ON file_grading_entries (attempt_id, revision);
