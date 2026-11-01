-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS chapters_thumbnail_upload_id_idx ON chapters (thumbnail_upload_id) WHERE thumbnail_upload_id IS NOT NULL;
