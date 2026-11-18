-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS submissions_base_version_idx ON learning.submissions (base_version_id);
