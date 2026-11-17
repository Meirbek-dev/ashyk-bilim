-- no-transaction
-- The previous release's saved-view upsert infers its key from the old columns (20261116075644): this twin of
-- analytics_saved_views_teacher_user_id_view_type_name_key goes with those columns in the contract.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS analytics_saved_views_previous_key
    ON analytics.analytics_saved_views (teacher_user_id, view_type, name);
