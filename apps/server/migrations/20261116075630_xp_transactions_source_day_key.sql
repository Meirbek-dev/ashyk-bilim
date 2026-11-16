-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS xp_transactions_user_source_day_key ON xp_transactions (user_id, source, source_day);
