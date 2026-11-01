-- no-transaction
-- Schema review 3, item 34: chapters_course_idx (course_id, position) has the columns of
-- the unique chapters_position_key, which serves the same reads.
DROP INDEX CONCURRENTLY IF EXISTS chapters_course_idx;
