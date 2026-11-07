-- no-transaction
-- Replaces content_chunks_course_idx before content_chunks.published goes (20261107999410).
CREATE INDEX CONCURRENTLY IF NOT EXISTS content_chunks_course_audience_idx ON content_chunks (course_id, audience);
