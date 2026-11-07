-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS assessment_items_id_assessment_key ON assessment_items (id, assessment_id);
