-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS discussion_posts_replies_keyset_idx ON core.discussion_posts (parent_id, id) WHERE deleted_at IS NULL;
