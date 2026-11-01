-- no-transaction
-- Schema review 3, item 34: assessment_items_order_idx (assessment_id, position) has the columns of
-- the unique assessment_items_position_key, which serves the same reads.
DROP INDEX CONCURRENTLY IF EXISTS assessment_items_order_idx;
