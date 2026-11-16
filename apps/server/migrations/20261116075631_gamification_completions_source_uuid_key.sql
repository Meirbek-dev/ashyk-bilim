-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS gamification_completions_user_kind_source_uuid_key ON gamification_completions (user_id, kind, source_uuid);
