-- The job queue (ARCHITECTURE §9). Enqueue is an INSERT in the caller's
-- transaction; claim is FOR UPDATE SKIP LOCKED; wakeup via NOTIFY 'jobs_new'.

CREATE TABLE jobs (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    kind         text NOT NULL,
    payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
    status       text NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'dead')),
    priority     smallint NOT NULL DEFAULT 0,
    run_at       timestamptz NOT NULL DEFAULT now(),
    attempts     integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 5,
    dedupe_key   text,
    locked_by    text,
    locked_at    timestamptz,
    heartbeat_at timestamptz,
    last_error   text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Claim scan: only queued jobs that are due, cheapest-first.
CREATE INDEX jobs_claim_idx ON jobs (priority DESC, run_at)
    WHERE status = 'queued';

-- Reaper scan: running jobs whose worker stopped heartbeating.
CREATE INDEX jobs_reaper_idx ON jobs (heartbeat_at)
    WHERE status = 'running';

-- Dedupe: at most one live (queued/running) job per dedupe_key.
CREATE UNIQUE INDEX jobs_dedupe_live_idx ON jobs (dedupe_key)
    WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running');

-- Ops queries: dead-letter inspection, kind dashboards.
CREATE INDEX jobs_status_kind_idx ON jobs (status, kind, created_at);

CREATE TRIGGER jobs_set_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Cron schedules: the worker holding the leader advisory lock enqueues due
-- jobs and advances next_run_at (slice 0.8 wires the ticker).
CREATE TABLE job_schedules (
    kind         text PRIMARY KEY,
    cron_expr    text NOT NULL,
    payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
    enabled      boolean NOT NULL DEFAULT true,
    next_run_at  timestamptz NOT NULL,
    last_run_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER job_schedules_set_updated_at BEFORE UPDATE ON job_schedules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
