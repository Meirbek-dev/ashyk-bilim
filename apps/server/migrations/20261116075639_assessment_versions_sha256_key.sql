-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS assessment_versions_content_sha256_key
    ON assessment_versions (assessment_id, content_sha256);
