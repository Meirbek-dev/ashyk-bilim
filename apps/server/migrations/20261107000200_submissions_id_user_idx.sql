-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS submissions_id_user_key ON submissions (id, user_id);
