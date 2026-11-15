-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS assessment_versions_id_assessment_key
    ON learning.assessment_versions (id, assessment_id);
