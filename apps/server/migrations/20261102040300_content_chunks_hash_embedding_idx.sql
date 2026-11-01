-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS content_chunks_embedding_hash_idx ON content_chunks USING hnsw (embedding halfvec_cosine_ops) WHERE embedding_model = 'hash-ngram-v1';
