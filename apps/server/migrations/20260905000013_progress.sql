-- Learner progress projections + the personal trail (P6.1).
--
-- activity_progress / course_progress are the CANONICAL per-learner state,
-- rebuilt idempotently from submissions, file-submission attempts and
-- explicit completions (legacy services/progress/submissions.py). The trail
-- tables are the personal "my learning" UX (legacy trail/trailrun/trailstep):
-- never read trail_steps.complete for required progress, certificates or
-- analytics.

CREATE TABLE activity_progress (
    id                      uuid PRIMARY KEY DEFAULT uuidv7(),
    course_id               uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    activity_id             uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    user_id                 uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    state                   text NOT NULL DEFAULT 'not_started'
                            CHECK (state IN ('not_started', 'in_progress', 'submitted',
                                             'needs_grading', 'returned', 'graded', 'passed',
                                             'failed', 'completed')),
    required                boolean NOT NULL DEFAULT true,
    score                   double precision,
    passed                  boolean,
    best_submission_id      uuid REFERENCES submissions (id) ON DELETE SET NULL,
    latest_submission_id    uuid REFERENCES submissions (id) ON DELETE SET NULL,
    attempt_count           integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    started_at              timestamptz,
    last_activity_at        timestamptz,
    submitted_at            timestamptz,
    graded_at               timestamptz,
    completed_at            timestamptz,
    due_at                  timestamptz,
    is_late                 boolean NOT NULL DEFAULT false,
    teacher_action_required boolean NOT NULL DEFAULT false,
    status_reason           text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (activity_id, user_id)
);
CREATE TRIGGER activity_progress_set_updated_at BEFORE UPDATE ON activity_progress
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX activity_progress_course_user_idx ON activity_progress (course_id, user_id);
CREATE INDEX activity_progress_activity_state_idx ON activity_progress (activity_id, state);
CREATE INDEX activity_progress_teacher_action_idx
    ON activity_progress (course_id) WHERE teacher_action_required;

CREATE TABLE course_progress (
    id                       uuid PRIMARY KEY DEFAULT uuidv7(),
    course_id                uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    user_id                  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    completed_required_count integer NOT NULL DEFAULT 0,
    total_required_count     integer NOT NULL DEFAULT 0,
    progress_pct             double precision NOT NULL DEFAULT 0,
    grade_average            double precision,
    -- Weighted by assessment weight; NULL when nothing is scored.
    weighted_grade_average   double precision,
    missing_required_count   integer NOT NULL DEFAULT 0,
    needs_grading_count      integer NOT NULL DEFAULT 0,
    last_activity_at         timestamptz,
    completed_at             timestamptz,
    certificate_eligible     boolean NOT NULL DEFAULT false,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    UNIQUE (course_id, user_id)
);
CREATE TRIGGER course_progress_set_updated_at BEFORE UPDATE ON course_progress
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX course_progress_user_idx ON course_progress (user_id);

-- ── Personal trail ──────────────────────────────────────────────────────────

CREATE TABLE trails (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid text UNIQUE,
    user_id     uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trails_set_updated_at BEFORE UPDATE ON trails
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE trail_runs (
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    trail_id   uuid NOT NULL REFERENCES trails (id) ON DELETE CASCADE,
    course_id  uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status     text NOT NULL DEFAULT 'in_progress'
               CHECK (status IN ('in_progress', 'completed', 'paused', 'cancelled')),
    data       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (trail_id, course_id)
);
CREATE TRIGGER trail_runs_set_updated_at BEFORE UPDATE ON trail_runs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX trail_runs_course_user_idx ON trail_runs (course_id, user_id);

CREATE TABLE trail_steps (
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    trail_run_id     uuid NOT NULL REFERENCES trail_runs (id) ON DELETE CASCADE,
    trail_id         uuid NOT NULL REFERENCES trails (id) ON DELETE CASCADE,
    activity_id      uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    course_id        uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    complete         boolean NOT NULL DEFAULT true,
    teacher_verified boolean NOT NULL DEFAULT false,
    grade            integer NOT NULL DEFAULT 0,
    data             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (trail_run_id, activity_id)
);
CREATE TRIGGER trail_steps_set_updated_at BEFORE UPDATE ON trail_steps
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX trail_steps_trail_idx ON trail_steps (trail_id);
CREATE INDEX trail_steps_course_user_idx ON trail_steps (course_id, user_id);
