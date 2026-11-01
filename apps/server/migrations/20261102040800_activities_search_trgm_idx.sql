-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS activities_search_trgm_idx ON activities USING gin (search_fold(name) gin_trgm_ops);
