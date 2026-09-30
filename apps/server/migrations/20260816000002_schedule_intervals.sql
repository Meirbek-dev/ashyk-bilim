-- Interval-based scheduling (see docs/rewrite/DECISIONS.md 2026-08-16):
-- every current schedule is a plain interval; cron syntax added nothing but a
-- chrono dependency. next_run_at stays the single source of "when".

ALTER TABLE job_schedules DROP COLUMN cron_expr;
ALTER TABLE job_schedules ADD COLUMN interval_seconds bigint NOT NULL DEFAULT 60
    CHECK (interval_seconds > 0);
