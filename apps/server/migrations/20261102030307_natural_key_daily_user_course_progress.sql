-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY daily_user_course_progress_natural_key ON daily_user_course_progress (metric_date, user_id, course_id);
