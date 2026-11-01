-- no-transaction
-- Schema review 3, item 34: activities_chapter_idx (chapter_id, position) has the columns of
-- the unique activities_position_key, which serves the same reads.
DROP INDEX CONCURRENTLY IF EXISTS activities_chapter_idx;
