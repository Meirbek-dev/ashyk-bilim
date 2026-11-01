-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS platforms_thumbnail_upload_id_idx ON platforms (thumbnail_upload_id) WHERE thumbnail_upload_id IS NOT NULL;
