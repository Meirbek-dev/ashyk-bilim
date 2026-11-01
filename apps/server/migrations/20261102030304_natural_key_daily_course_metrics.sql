-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY daily_course_metrics_natural_key ON daily_course_metrics (metric_date, course_id);
