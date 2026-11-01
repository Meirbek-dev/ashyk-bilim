-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY daily_course_engagement_natural_key ON daily_course_engagement (metric_date, activity_id);
