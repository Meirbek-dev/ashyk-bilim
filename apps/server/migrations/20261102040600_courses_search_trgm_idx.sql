-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS courses_search_trgm_idx ON courses USING gin (search_fold(name || ' ' || description || ' ' || coalesce(about, '')) gin_trgm_ops);
