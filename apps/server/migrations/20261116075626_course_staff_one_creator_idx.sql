-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS course_staff_one_creator_idx ON course_staff (course_id) WHERE authorship = 'creator';
