-- no-transaction
-- docs/AI-FIRST.md 1.3: the HNSW index of Voyage `voyage-3.5` vectors, the default embedder with a key.
CREATE INDEX CONCURRENTLY IF NOT EXISTS content_chunks_embedding_voyage_3_5_idx ON content_chunks USING hnsw (embedding halfvec_cosine_ops) WHERE embedding_model = 'voyage-3.5';
