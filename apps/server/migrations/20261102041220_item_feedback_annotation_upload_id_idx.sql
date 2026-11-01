-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS item_feedback_annotation_upload_id_idx ON item_feedback (annotation_upload_id) WHERE annotation_upload_id IS NOT NULL;
