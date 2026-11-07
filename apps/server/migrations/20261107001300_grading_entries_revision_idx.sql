-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS grading_entries_submission_revision_key ON grading_entries (submission_id, revision);
