-- no-transaction
-- The previous release's metrics upsert infers its key from the old column (20261116075644): this twin of
-- daily_teacher_metrics_metric_date_teacher_user_id_key goes with that column in the contract.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS daily_teacher_metrics_previous_key
    ON analytics.daily_teacher_metrics (metric_date, teacher_user_id) NULLS NOT DISTINCT;
