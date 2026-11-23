-- no-transaction
-- docs/AI-FIRST.md 1.6: typo-tolerant lexical search, `search_fold(label || ' ' || body) %> word` (pg_trgm,
-- enabled by 20261102040500). search_fold is IMMUTABLE; changing its body needs a REINDEX of this index too.
CREATE INDEX CONCURRENTLY IF NOT EXISTS content_chunks_trgm_idx ON content_chunks USING gin (search_fold(label || ' ' || body) gin_trgm_ops);
