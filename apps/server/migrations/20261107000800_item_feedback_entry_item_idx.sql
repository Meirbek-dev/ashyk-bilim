-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS item_feedback_entry_item_key ON item_feedback (grading_entry_id, item_ref);
