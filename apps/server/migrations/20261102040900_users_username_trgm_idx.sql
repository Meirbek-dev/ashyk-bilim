-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_username_trgm_idx ON users USING gin (search_fold(username) gin_trgm_ops);
