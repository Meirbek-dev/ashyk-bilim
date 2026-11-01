-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY activity_progress_natural_key ON activity_progress (activity_id, user_id);
