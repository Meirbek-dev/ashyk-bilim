-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS discussion_posts_keyset_idx ON core.discussion_posts (course_id, id DESC) WHERE parent_id IS NULL AND deleted_at IS NULL;
