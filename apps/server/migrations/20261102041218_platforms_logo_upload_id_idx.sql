-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS platforms_logo_upload_id_idx ON platforms (logo_upload_id) WHERE logo_upload_id IS NOT NULL;
