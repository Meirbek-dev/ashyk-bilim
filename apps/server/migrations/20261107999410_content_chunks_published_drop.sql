-- contract: content_chunks.published was written by a trigger and read by nothing since 20261102000300 moved
-- visibility to the query (schema review 48). The running release does not name the column.

SET LOCAL lock_timeout = '5s';

DROP TRIGGER content_chunks_published ON content_chunks;
DROP FUNCTION content_chunks_published();
ALTER TABLE content_chunks DROP COLUMN published;
