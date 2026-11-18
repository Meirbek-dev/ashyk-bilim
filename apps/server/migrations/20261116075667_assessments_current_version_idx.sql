-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS assessments_current_version_idx ON learning.assessments (current_version_id);
