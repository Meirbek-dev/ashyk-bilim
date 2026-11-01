-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS collections_cover_upload_id_idx ON collections (cover_upload_id) WHERE cover_upload_id IS NOT NULL;
