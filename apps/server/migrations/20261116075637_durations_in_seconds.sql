-- Language, units, hashes, part 2 (REWRITE 5.8 item 6): durations are seconds.
--
-- An assessment's grace period was minutes, an item's estimate minutes, a rollup's grading latency hours: each gets
-- a `*_seconds` integer (backfilled) that the server reads and writes; the API keeps its minutes and hours. An AI
-- run's `duration_ms` repeated `completed_at - started_at`: the server reads the difference and stops writing it.
--
-- Switch release: the previous release reads and writes the old columns, so triggers keep each pair equal whichever
-- side the writer named, and fill an AI run's `duration_ms` when it ends. A contract drops the old columns and the
-- triggers (pending-contracts.tsv).
SET LOCAL lock_timeout = '5s';
-- The backfills keep each row's `updated_at` (touch_row).
SET LOCAL ab.bookkeeping = 'on';

ALTER TABLE assessments ADD COLUMN grace_period_seconds integer;
UPDATE assessments SET grace_period_seconds = grace_period_minutes * 60;
ALTER TABLE assessments ALTER COLUMN grace_period_seconds SET NOT NULL,
    ADD CONSTRAINT assessments_grace_period_seconds_check CHECK (grace_period_seconds >= 0);
COMMENT ON COLUMN learning.assessments.grace_period_seconds IS
    'How long after the time limit a timed attempt is still accepted.';

CREATE FUNCTION assessments_grace_period() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.grace_period_seconds IS NULL)
       OR (TG_OP = 'UPDATE' AND NEW.grace_period_minutes IS DISTINCT FROM OLD.grace_period_minutes
           AND NEW.grace_period_seconds IS NOT DISTINCT FROM OLD.grace_period_seconds) THEN
        NEW.grace_period_seconds := NEW.grace_period_minutes * 60;
    ELSE
        NEW.grace_period_minutes := NEW.grace_period_seconds / 60;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER assessments_grace_period BEFORE INSERT OR UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION assessments_grace_period();

ALTER TABLE assessment_items ADD COLUMN estimated_seconds integer CHECK (estimated_seconds >= 0);
UPDATE assessment_items SET estimated_seconds = estimated_minutes * 60 WHERE estimated_minutes IS NOT NULL;

CREATE FUNCTION assessment_items_estimate() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.estimated_seconds IS NULL)
       OR (TG_OP = 'UPDATE' AND NEW.estimated_minutes IS DISTINCT FROM OLD.estimated_minutes
           AND NEW.estimated_seconds IS NOT DISTINCT FROM OLD.estimated_seconds) THEN
        NEW.estimated_seconds := NEW.estimated_minutes * 60;
    ELSE
        NEW.estimated_minutes := NEW.estimated_seconds / 60;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER assessment_items_estimate BEFORE INSERT OR UPDATE ON assessment_items
    FOR EACH ROW EXECUTE FUNCTION assessment_items_estimate();

ALTER TABLE daily_assessment_metrics ADD COLUMN grading_latency_seconds_p50 integer,
    ADD COLUMN grading_latency_seconds_p90 integer;
UPDATE daily_assessment_metrics SET grading_latency_seconds_p50 = round(grading_latency_hours_p50 * 3600),
    grading_latency_seconds_p90 = round(grading_latency_hours_p90 * 3600);

CREATE FUNCTION daily_assessment_metrics_latency() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.grading_latency_seconds_p50 IS NULL AND NEW.grading_latency_seconds_p90 IS NULL)
       OR (TG_OP = 'UPDATE'
           AND (NEW.grading_latency_hours_p50, NEW.grading_latency_hours_p90)
               IS DISTINCT FROM (OLD.grading_latency_hours_p50, OLD.grading_latency_hours_p90)
           AND (NEW.grading_latency_seconds_p50, NEW.grading_latency_seconds_p90)
               IS NOT DISTINCT FROM (OLD.grading_latency_seconds_p50, OLD.grading_latency_seconds_p90)) THEN
        NEW.grading_latency_seconds_p50 := round(NEW.grading_latency_hours_p50 * 3600);
        NEW.grading_latency_seconds_p90 := round(NEW.grading_latency_hours_p90 * 3600);
    ELSE
        NEW.grading_latency_hours_p50 := NEW.grading_latency_seconds_p50 / 3600.0;
        NEW.grading_latency_hours_p90 := NEW.grading_latency_seconds_p90 / 3600.0;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER daily_assessment_metrics_latency BEFORE INSERT OR UPDATE ON daily_assessment_metrics
    FOR EACH ROW EXECUTE FUNCTION daily_assessment_metrics_latency();

-- The previous release's `duration_ms`, derived when a run ends.
CREATE FUNCTION ai_runs_duration() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    NEW.duration_ms := (extract(epoch FROM NEW.completed_at - NEW.started_at) * 1000)::integer;
    RETURN NEW;
END $$;
CREATE TRIGGER ai_runs_duration BEFORE INSERT OR UPDATE OF completed_at, started_at ON ai_runs
    FOR EACH ROW EXECUTE FUNCTION ai_runs_duration();
