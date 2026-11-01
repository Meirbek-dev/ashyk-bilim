-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS content_chunks_embedding_te3_small_idx ON content_chunks USING hnsw (embedding halfvec_cosine_ops) WHERE embedding_model = 'text-embedding-3-small';
