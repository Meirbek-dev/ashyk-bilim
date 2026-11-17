-- contract: since 20261116075637 and 20261116075638 the server reads and writes durations in seconds and hashes as
-- sha256 bytes; the previous release's minutes, hours, milliseconds and hex copies go with the triggers that kept
-- them equal (REWRITE 5.8 item 6). Each column's checks go with it.
SET LOCAL lock_timeout = '5s';

-- No grace period unless one is set: the server's course-copy and file-task inserts name none and got 0 from the
-- minutes' default through the trigger (this release's and the previous one's).
ALTER TABLE learning.assessments ALTER COLUMN grace_period_seconds SET DEFAULT 0;
DROP TRIGGER assessments_grace_period ON learning.assessments;
DROP FUNCTION assessments_grace_period();
ALTER TABLE learning.assessments DROP COLUMN grace_period_minutes;

DROP TRIGGER assessment_items_estimate ON learning.assessment_items;
DROP FUNCTION assessment_items_estimate();
ALTER TABLE learning.assessment_items DROP COLUMN estimated_minutes;

DROP TRIGGER daily_assessment_metrics_latency ON analytics.daily_assessment_metrics;
DROP FUNCTION daily_assessment_metrics_latency();
ALTER TABLE analytics.daily_assessment_metrics DROP COLUMN grading_latency_hours_p50,
    DROP COLUMN grading_latency_hours_p90;

-- A run's duration is completed_at - started_at.
DROP TRIGGER ai_runs_duration ON ai.ai_runs;
DROP FUNCTION ai_runs_duration();
ALTER TABLE ai.ai_runs DROP COLUMN duration_ms;

DROP TRIGGER code_runs_sha256 ON learning.code_runs;
DROP FUNCTION code_runs_sha256();
ALTER TABLE learning.code_runs DROP COLUMN source_sha256, DROP COLUMN stdin_sha256;

DROP TRIGGER idempotency_keys_sha256 ON ops.idempotency_keys;
DROP FUNCTION idempotency_keys_sha256();
ALTER TABLE ops.idempotency_keys DROP COLUMN request_hash;

DROP TRIGGER ai_work_embeddings_sha256 ON ai.ai_work_embeddings;
DROP FUNCTION ai_work_embeddings_sha256();
ALTER TABLE ai.ai_work_embeddings DROP COLUMN text_hash;

DROP TRIGGER ai_course_analyses_sha256 ON ai.ai_course_analyses;
DROP FUNCTION ai_course_analyses_sha256();
ALTER TABLE ai.ai_course_analyses DROP COLUMN content_hash;

-- A version is found by its sha256 (assessment_versions_content_sha256_key); the md5, its key and function go.
CREATE OR REPLACE FUNCTION assessment_versions_points() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    NEW.max_points := snapshot_max_points(NEW.items);
    RETURN NEW;
END;
$$;
ALTER TABLE learning.assessment_versions DROP COLUMN content_hash;
DROP FUNCTION assessment_content_hash(jsonb, jsonb);
