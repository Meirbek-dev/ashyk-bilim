-- Analytics (P7): the event log, the five daily rollup tables, learner risk
-- snapshots, teacher interventions and saved dashboard views (legacy
-- db/analytics.py). See docs/rewrite/DECISIONS.md "Analytics (2026-09-06, P7)".
--
-- Deltas vs the legacy DDL: uuidv7 ids and real FKs everywhere (legacy rows
-- had bare int columns and composite PKs), Numeric(x,2) → double precision
-- (values are rounded in the domain), reason_codes as text[] instead of JSON,
-- the platform-wide teacher aggregate is `teacher_user_id IS NULL` (legacy
-- used the magic id 0), and every daily table is keyed by (metric_date, key)
-- through a UNIQUE constraint so rollups are re-runnable upserts.

-- ── Event log ───────────────────────────────────────────────────────────────
-- Written best-effort by the write paths (submit / grade / publish / return,
-- explicit or projected activity completion, discussion posts, logins). The
-- legacy declared this table and never wrote a single row (FINDINGS #20).

CREATE TABLE analytics_events (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    event_type    text NOT NULL CHECK (event_type IN (
                      'submission.submitted', 'submission.graded', 'submission.published',
                      'submission.returned', 'activity.completed', 'discussion.posted',
                      'login')),
    course_id     uuid REFERENCES courses (id) ON DELETE CASCADE,
    activity_id   uuid REFERENCES activities (id) ON DELETE CASCADE,
    assessment_id uuid REFERENCES assessments (id) ON DELETE CASCADE,
    submission_id uuid REFERENCES submissions (id) ON DELETE SET NULL,
    -- The learner the event is about.
    user_id       uuid REFERENCES users (id) ON DELETE CASCADE,
    -- Who caused it when not the learner (the grading teacher).
    actor_id      uuid REFERENCES users (id) ON DELETE SET NULL,
    payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_course_time_idx ON analytics_events (course_id, occurred_at DESC);
CREATE INDEX analytics_events_user_time_idx ON analytics_events (user_id, occurred_at DESC);

-- ── Daily rollups ───────────────────────────────────────────────────────────

CREATE TABLE daily_teacher_metrics (
    id                               uuid PRIMARY KEY DEFAULT uuidv7(),
    metric_date                      date NOT NULL,
    -- NULL = the platform-wide aggregate.
    teacher_user_id                  uuid REFERENCES users (id) ON DELETE CASCADE,
    managed_course_count             integer NOT NULL DEFAULT 0,
    active_learners_7d               integer NOT NULL DEFAULT 0,
    active_learners_28d              integer NOT NULL DEFAULT 0,
    active_learners_90d              integer NOT NULL DEFAULT 0,
    returning_learners_28d           integer NOT NULL DEFAULT 0,
    completion_rate                  double precision,
    avg_progress_pct                 double precision,
    at_risk_learners                 integer NOT NULL DEFAULT 0,
    ungraded_submissions             integer NOT NULL DEFAULT 0,
    courses_with_negative_engagement integer NOT NULL DEFAULT 0,
    certificates_issued_28d          integer NOT NULL DEFAULT 0,
    generated_at                     timestamptz NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (metric_date, teacher_user_id)
);

CREATE TABLE daily_course_metrics (
    id                     uuid PRIMARY KEY DEFAULT uuidv7(),
    metric_date            date NOT NULL,
    course_id              uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    teacher_user_id        uuid REFERENCES users (id) ON DELETE SET NULL,
    enrolled_learners      integer NOT NULL DEFAULT 0,
    active_learners_7d     integer NOT NULL DEFAULT 0,
    active_learners_28d    integer NOT NULL DEFAULT 0,
    completion_rate        double precision,
    avg_progress_pct       double precision,
    at_risk_learners       integer NOT NULL DEFAULT 0,
    ungraded_submissions   integer NOT NULL DEFAULT 0,
    certificates_issued    integer NOT NULL DEFAULT 0,
    content_health_score   double precision,
    engagement_delta_pct   double precision,
    last_content_update_at timestamptz,
    generated_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (metric_date, course_id)
);
CREATE INDEX daily_course_metrics_course_idx ON daily_course_metrics (course_id, metric_date DESC);

CREATE TABLE daily_course_engagement (
    id                        uuid PRIMARY KEY DEFAULT uuidv7(),
    metric_date               date NOT NULL,
    course_id                 uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    chapter_id                uuid REFERENCES chapters (id) ON DELETE SET NULL,
    activity_id               uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    step_order                integer,
    started_learners          integer NOT NULL DEFAULT 0,
    completed_learners        integer NOT NULL DEFAULT 0,
    dropoff_from_previous_pct double precision,
    generated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (metric_date, activity_id)
);
CREATE INDEX daily_course_engagement_course_idx ON daily_course_engagement (course_id, metric_date DESC);

CREATE TABLE daily_assessment_metrics (
    id                        uuid PRIMARY KEY DEFAULT uuidv7(),
    metric_date               date NOT NULL,
    assessment_id             uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
    course_id                 uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    activity_id               uuid REFERENCES activities (id) ON DELETE SET NULL,
    assessment_kind           text NOT NULL CHECK (assessment_kind IN ('quiz', 'exam', 'code_challenge')),
    eligible_learners         integer NOT NULL DEFAULT 0,
    submitted_learners        integer NOT NULL DEFAULT 0,
    submission_rate           double precision,
    completion_rate           double precision,
    pass_rate                 double precision,
    median_score              double precision,
    avg_score                 double precision,
    avg_attempts              double precision,
    grading_latency_hours_p50 double precision,
    grading_latency_hours_p90 double precision,
    difficulty_score          double precision,
    generated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (metric_date, assessment_id)
);
CREATE INDEX daily_assessment_metrics_course_idx ON daily_assessment_metrics (course_id, metric_date DESC);

CREATE TABLE daily_user_course_progress (
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    metric_date      date NOT NULL,
    user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    course_id        uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    trail_run_id     uuid REFERENCES trail_runs (id) ON DELETE SET NULL,
    progress_pct     double precision NOT NULL DEFAULT 0,
    completed_steps  integer NOT NULL DEFAULT 0,
    total_steps      integer NOT NULL DEFAULT 0,
    last_activity_at timestamptz,
    is_completed     boolean NOT NULL DEFAULT false,
    has_certificate  boolean NOT NULL DEFAULT false,
    generated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (metric_date, user_id, course_id)
);
CREATE INDEX daily_user_course_progress_course_idx
    ON daily_user_course_progress (course_id, metric_date DESC);

-- ── Risk snapshots ──────────────────────────────────────────────────────────

CREATE TABLE learner_risk_snapshots (
    id                           uuid PRIMARY KEY DEFAULT uuidv7(),
    snapshot_date                date NOT NULL,
    user_id                      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    course_id                    uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    teacher_user_id              uuid REFERENCES users (id) ON DELETE SET NULL,
    progress_pct                 double precision NOT NULL DEFAULT 0,
    days_since_last_activity     integer,
    failed_assessments           integer NOT NULL DEFAULT 0,
    missing_required_assessments integer NOT NULL DEFAULT 0,
    open_grading_blocks          integer NOT NULL DEFAULT 0,
    risk_score                   double precision NOT NULL DEFAULT 0,
    risk_level                   text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    reason_codes                 text[] NOT NULL DEFAULT '{}',
    recommended_action           text,
    generated_at                 timestamptz NOT NULL DEFAULT now(),
    UNIQUE (snapshot_date, user_id, course_id)
);
CREATE INDEX learner_risk_snapshots_pair_idx
    ON learner_risk_snapshots (course_id, user_id, snapshot_date DESC);

-- ── Teacher interventions ───────────────────────────────────────────────────

CREATE TABLE teacher_interventions (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    teacher_user_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    course_id         uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    intervention_type text NOT NULL CHECK (intervention_type IN (
                          'message_sent', 'submission_graded', 'extension_granted',
                          'meeting_scheduled', 'learner_recovered')),
    status            text NOT NULL DEFAULT 'planned'
                      CHECK (status IN ('planned', 'completed', 'resolved')),
    outcome           text,
    notes             text,
    risk_score_before double precision,
    risk_score_after  double precision,
    payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    resolved_at       timestamptz
);
CREATE TRIGGER teacher_interventions_set_updated_at BEFORE UPDATE ON teacher_interventions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX teacher_interventions_teacher_idx
    ON teacher_interventions (teacher_user_id, course_id, created_at DESC);
CREATE INDEX teacher_interventions_learner_idx ON teacher_interventions (user_id, course_id);

-- ── Saved dashboard views ───────────────────────────────────────────────────

CREATE TABLE analytics_saved_views (
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    teacher_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    view_type       text NOT NULL DEFAULT 'overview' CHECK (char_length(view_type) BETWEEN 1 AND 50),
    query           jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    -- Saving the same name again for the same view type updates it (legacy).
    UNIQUE (teacher_user_id, view_type, name)
);
CREATE TRIGGER analytics_saved_views_set_updated_at BEFORE UPDATE ON analytics_saved_views
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
