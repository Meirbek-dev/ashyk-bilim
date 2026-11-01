-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS submissions_assessment_version_idx ON submissions (assessment_version_id);
