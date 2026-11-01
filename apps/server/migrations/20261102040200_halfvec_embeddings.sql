-- Embeddings as halfvec(1024) (schema review item 36).
--
-- Half precision halves the heap and the HNSW index (2 KB instead of 4 KB per vector) with no
-- measurable recall loss for cosine search over 1024 dimensions. The one HNSW index mixed every
-- embedding model's vectors, though a query only ever compares vectors of one model: it is
-- replaced by one partial index per model (20261102040300, 20261102040400), which the search
-- reaches with a custom plan (`plan_cache_mode`, set beside `hnsw.iterative_scan`).
--
-- The previous release keeps working: it binds `$n::text::vector`, and pgvector casts vector to
-- halfvec implicitly, both on insert and for `halfvec <=> vector`. The rewrite takes the tables'
-- lock for its duration (content_chunks: a few seconds); lock_timeout bounds the wait for it.

SET LOCAL lock_timeout = '5s';

DROP INDEX content_chunks_embedding_idx;
ALTER TABLE content_chunks ALTER COLUMN embedding TYPE halfvec(1024) USING embedding::halfvec(1024);
ALTER TABLE ai_work_embeddings ALTER COLUMN embedding TYPE halfvec(1024) USING embedding::halfvec(1024);
