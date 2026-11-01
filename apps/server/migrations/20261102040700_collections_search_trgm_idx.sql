-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS collections_search_trgm_idx ON collections USING gin (search_fold(name || ' ' || description) gin_trgm_ops);
