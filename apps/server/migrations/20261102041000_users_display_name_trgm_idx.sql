-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_display_name_trgm_idx ON users USING gin (search_fold(display_name) gin_trgm_ops);
