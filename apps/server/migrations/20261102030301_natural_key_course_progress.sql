-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY course_progress_natural_key ON course_progress (course_id, user_id);
