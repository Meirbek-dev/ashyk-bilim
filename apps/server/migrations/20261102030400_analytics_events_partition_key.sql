-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY analytics_events_id_occurred_at_key ON analytics_events (id, occurred_at);
