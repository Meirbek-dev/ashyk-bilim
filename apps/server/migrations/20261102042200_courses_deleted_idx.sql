-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS courses_deleted_idx ON courses (deleted_at) WHERE deleted_at IS NOT NULL;
