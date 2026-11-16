-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS xp_transactions_user_source_uuid_key ON xp_transactions (user_id, source, source_uuid);
