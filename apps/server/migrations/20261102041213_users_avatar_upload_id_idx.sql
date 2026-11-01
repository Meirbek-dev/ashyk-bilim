-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_avatar_upload_id_idx ON users (avatar_upload_id) WHERE avatar_upload_id IS NOT NULL;
