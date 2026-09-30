-- AI runtime (P8.2): the durable run model from the legacy `ai_runtime.py`
-- (threads, runs, events, artifacts, evidence, approvals, eval results) plus
-- the monthly token ledger that replaces "sum every ai_run row this month".
--
-- Run lifecycle is a state machine — queued → running → {succeeded, failed,
-- aborted} — and every transition in the domain is a guarded
-- `UPDATE … WHERE status = $expected` (ARCHITECTURE §12).

CREATE TABLE ai_threads (
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    user_id         uuid REFERENCES users (id) ON DELETE SET NULL,
    role            text NOT NULL DEFAULT 'student'
                    CHECK (role IN ('student', 'teacher', 'author', 'admin')),
    course_id       uuid REFERENCES courses (id) ON DELETE SET NULL,
    activity_id     uuid REFERENCES activities (id) ON DELETE SET NULL,
    title           text,
    retention_class text NOT NULL DEFAULT 'generated_ai'
                    CHECK (retention_class IN ('transient', 'generated_ai', 'educational_record', 'audit')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER ai_threads_set_updated_at BEFORE UPDATE ON ai_threads
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX ai_threads_user_role_idx ON ai_threads (user_id, role, updated_at DESC);
CREATE INDEX ai_threads_course_activity_idx ON ai_threads (course_id, activity_id, updated_at DESC);
-- Thread listing per course and user, newest activity first.
CREATE INDEX ai_threads_course_user_idx ON ai_threads (course_id, user_id, updated_at DESC);

CREATE TABLE ai_runs (
    id             uuid PRIMARY KEY DEFAULT uuidv7(),
    thread_id      uuid NOT NULL REFERENCES ai_threads (id) ON DELETE CASCADE,
    kind           text NOT NULL CHECK (kind IN (
                       'course_analysis', 'submission_analysis', 'remediation',
                       'study_companion', 'lecture_review', 'course_qa')),
    status         text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'aborted')),
    -- Legacy `run_metadata.triggered_by_user_id` (a string in a JSON blob),
    -- now a real column so hourly limits and admin filters are indexed.
    triggered_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    model_name     text,
    duration_ms    integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
    input_tokens   integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
    output_tokens  integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
    cost_estimate  numeric(12, 6),
    safety_state   text,
    error_code     text,
    -- Kind-specific request context (course/submission/activity ids,
    -- language, question, client_turn_id, citation validation summary…).
    metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at     timestamptz NOT NULL DEFAULT now(),
    completed_at   timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_runs_thread_status_idx ON ai_runs (thread_id, status, started_at DESC);
CREATE INDEX ai_runs_triggered_by_idx ON ai_runs (triggered_by, started_at DESC);
CREATE INDEX ai_runs_started_idx ON ai_runs (started_at DESC, id DESC);
CREATE INDEX ai_runs_status_idx ON ai_runs (status, started_at DESC);

CREATE TABLE ai_events (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    run_id      uuid NOT NULL REFERENCES ai_runs (id) ON DELETE CASCADE,
    sequence    integer NOT NULL CHECK (sequence >= 1),
    event_type  text NOT NULL,
    payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, sequence)
);

CREATE TABLE ai_artifacts (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    run_id      uuid NOT NULL REFERENCES ai_runs (id) ON DELETE CASCADE,
    kind        text NOT NULL,
    content     jsonb NOT NULL DEFAULT '{}'::jsonb,
    final       boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_artifacts_run_kind_idx ON ai_artifacts (run_id, kind, created_at);

CREATE TABLE ai_evidence (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    run_id       uuid NOT NULL REFERENCES ai_runs (id) ON DELETE CASCADE,
    artifact_id  uuid REFERENCES ai_artifacts (id) ON DELETE SET NULL,
    citation_id  text NOT NULL,
    label        text NOT NULL,
    source_type  text NOT NULL,
    -- Legacy stuffed this into `evidence_metadata.source_uuid`.
    source_ref   text,
    excerpt      text NOT NULL DEFAULT '',
    score        double precision CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
    metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_evidence_run_idx ON ai_evidence (run_id, source_type, created_at);

CREATE TABLE ai_approvals (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    run_id        uuid NOT NULL REFERENCES ai_runs (id) ON DELETE CASCADE,
    action_type   text NOT NULL,
    status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
    requested_by  uuid REFERENCES users (id) ON DELETE SET NULL,
    resolved_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    resolved_at   timestamptz,
    expires_at    timestamptz
);
CREATE INDEX ai_approvals_status_idx ON ai_approvals (status, expires_at);

CREATE TABLE ai_eval_results (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    run_id      uuid REFERENCES ai_runs (id) ON DELETE SET NULL,
    dataset     text NOT NULL,
    evaluator   text NOT NULL,
    score       double precision CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
    passed      boolean,
    details     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_eval_results_dataset_idx ON ai_eval_results (dataset, created_at DESC);

-- Monthly token ledger: one row per (calendar month, user), upserted when a
-- run finishes. The platform budget check is a SUM over the current month;
-- the legacy scanned every ai_run of the month on each request.
CREATE TABLE ai_token_ledger (
    month          date NOT NULL CHECK (month = date_trunc('month', month)::date),
    user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    input_tokens   bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens  bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    run_count      integer NOT NULL DEFAULT 0 CHECK (run_count >= 0),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (month, user_id)
);
