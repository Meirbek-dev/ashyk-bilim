-- no-transaction
-- Schema review 3, item 34: mastery_evidence_source_idx (source_type,
-- source_id) is a prefix of the unique (source_type, source_id, concept_id,
-- part_id, user_id) key, which serves the same lookups.
DROP INDEX CONCURRENTLY IF EXISTS mastery_evidence_source_idx;
