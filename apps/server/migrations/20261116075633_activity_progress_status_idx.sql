-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS activity_progress_activity_status_idx ON activity_progress (activity_id, status);
