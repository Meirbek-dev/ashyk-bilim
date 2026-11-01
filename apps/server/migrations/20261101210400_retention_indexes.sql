-- Schema review items 24-25: the retention sweeps filter append-only tables
-- by time. Rows arrive in time order, so a BRIN index (a few pages) finds
-- the old end without the full scans the sweeps did before
-- (analytics_events `occurred_at < now() - 400 days LIMIT 5000` had no
-- usable index). Jobs are swept by status and created_at through
-- jobs_status_kind_idx: an index on updated_at or heartbeat_at would make
-- every heartbeat a non-HOT update.

CREATE INDEX analytics_events_occurred_brin ON analytics_events USING brin (occurred_at);
CREATE INDEX auth_audit_log_created_brin ON auth_audit_log USING brin (created_at);
CREATE INDEX ai_events_created_brin ON ai_events USING brin (created_at);
CREATE INDEX code_runs_created_brin ON code_runs USING brin (created_at);
CREATE INDEX daily_teacher_metrics_date_brin ON daily_teacher_metrics USING brin (metric_date);
CREATE INDEX daily_course_metrics_date_brin ON daily_course_metrics USING brin (metric_date);
CREATE INDEX daily_course_engagement_date_brin ON daily_course_engagement USING brin (metric_date);
CREATE INDEX daily_assessment_metrics_date_brin ON daily_assessment_metrics USING brin (metric_date);
CREATE INDEX daily_user_course_progress_date_brin ON daily_user_course_progress USING brin (metric_date);
CREATE INDEX learner_risk_snapshots_date_brin ON learner_risk_snapshots USING brin (snapshot_date);
