-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY daily_assessment_metrics_natural_key ON daily_assessment_metrics (metric_date, assessment_id);
