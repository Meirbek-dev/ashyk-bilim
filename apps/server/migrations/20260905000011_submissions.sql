-- Submissions & grading (P4.1). See docs/rewrite/DECISIONS.md (2026-09-05,
-- "Submissions schema") for what changed against the legacy tables.

-- The legacy attempt-penalty cap lived in activity.settings, outside the
-- policy; it is a policy knob, so it joins the assessment row.
ALTER TABLE assessments
    ADD COLUMN attempt_penalty_percent double precision NOT NULL DEFAULT 0
        CHECK (attempt_penalty_percent >= 0 AND attempt_penalty_percent <= 100);

-- ── Submissions ─────────────────────────────────────────────────────────────

CREATE TABLE submissions (
    id                    uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid           text UNIQUE,
    assessment_id         uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
    -- Denormalized for course-wide gradebook queries (assessments never
    -- move between courses).
    course_id             uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    user_id               uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'pending', 'graded', 'published', 'returned')),
    attempt_number        integer NOT NULL CHECK (attempt_number >= 1),

    -- {"<item_id>": ItemAnswer} — one canonical shape for every kind.
    answers               jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- The EFFECTIVE breakdown (teacher edits applied); the raw auto-grade
    -- lives on the grading entry that produced it.
    grading               jsonb NOT NULL DEFAULT '{}'::jsonb,
    auto_score            double precision,
    final_score           double precision,
    is_late               boolean NOT NULL DEFAULT false,
    late_penalty_pct      double precision NOT NULL DEFAULT 0
                          CHECK (late_penalty_pct >= 0 AND late_penalty_pct <= 100),

    -- Legacy metadata_json scalars, as columns.
    violation_count       integer NOT NULL DEFAULT 0 CHECK (violation_count >= 0),
    violations            jsonb NOT NULL DEFAULT '[]'::jsonb,
    auto_submit_reason    text CHECK (auto_submit_reason IS NULL
                                      OR auto_submit_reason IN ('time_expired', 'integrity_violation')),
    auto_submitted_at     timestamptz,
    auto_submit_attempts  integer NOT NULL DEFAULT 0,
    auto_submit_retry_at  timestamptz,
    duration_seconds      integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),

    started_at            timestamptz,
    submitted_at          timestamptz,
    graded_at             timestamptz,

    -- Optimistic locks: teachers bump `version`, learners `draft_version`.
    version               bigint NOT NULL DEFAULT 1,
    draft_version         bigint NOT NULL DEFAULT 1,
    grading_version       integer NOT NULL DEFAULT 1,
    -- What the learner answered against (write-once at submit).
    content_version       integer NOT NULL DEFAULT 1,
    policy_version        integer NOT NULL DEFAULT 1,
    items_snapshot        jsonb,
    policy_snapshot       jsonb,

    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER submissions_set_updated_at BEFORE UPDATE ON submissions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- The legacy enforced "one open draft" with `.first()`; the DB does now.
CREATE UNIQUE INDEX submissions_one_open_draft
    ON submissions (assessment_id, user_id) WHERE status = 'draft';
CREATE INDEX submissions_review_idx ON submissions (assessment_id, status, submitted_at DESC);
CREATE INDEX submissions_learner_idx ON submissions (assessment_id, user_id, attempt_number DESC);
CREATE INDEX submissions_course_user_idx ON submissions (course_id, user_id);
-- The auto-submit sweep scans only open timed drafts.
CREATE INDEX submissions_timer_idx ON submissions (started_at)
    WHERE status = 'draft' AND started_at IS NOT NULL;

-- ── Grading ledger (append-only) ────────────────────────────────────────────

CREATE TABLE grading_entries (
    id                  uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid         text UNIQUE,
    submission_id       uuid NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
    -- NULL = the auto-grader (legacy attributed auto-grades to the student).
    graded_by           uuid REFERENCES users (id) ON DELETE SET NULL,
    raw_score           double precision NOT NULL,
    penalty_pct         double precision NOT NULL DEFAULT 0,
    final_score         double precision NOT NULL,
    raw_breakdown       jsonb NOT NULL DEFAULT '{}'::jsonb,
    effective_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
    overall_feedback    text NOT NULL DEFAULT '',
    grading_version     integer NOT NULL DEFAULT 1,
    -- NULL = teacher-only draft; set = visible to the learner.
    published_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX grading_entries_submission_idx ON grading_entries (submission_id, id DESC);
CREATE INDEX grading_entries_published_idx ON grading_entries (submission_id, published_at);

-- Immutability the legacy enforced with ORM listeners: only `published_at`
-- may change, nothing is ever deleted (cascades from the submission excepted).
CREATE OR REPLACE FUNCTION grading_entries_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'grading_entries is append-only' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.submission_id IS DISTINCT FROM OLD.submission_id
       OR NEW.graded_by IS DISTINCT FROM OLD.graded_by
       OR NEW.raw_score IS DISTINCT FROM OLD.raw_score
       OR NEW.penalty_pct IS DISTINCT FROM OLD.penalty_pct
       OR NEW.final_score IS DISTINCT FROM OLD.final_score
       OR NEW.raw_breakdown IS DISTINCT FROM OLD.raw_breakdown
       OR NEW.effective_breakdown IS DISTINCT FROM OLD.effective_breakdown
       OR NEW.overall_feedback IS DISTINCT FROM OLD.overall_feedback
       OR NEW.grading_version IS DISTINCT FROM OLD.grading_version
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'grading_entries rows are immutable except published_at'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER grading_entries_immutable BEFORE UPDATE ON grading_entries
    FOR EACH ROW EXECUTE FUNCTION grading_entries_guard();
-- A cascade from the parent submission is a DELETE too; allow only that path
-- by checking whether the submission still exists.
CREATE OR REPLACE FUNCTION grading_entries_no_delete() RETURNS trigger AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM submissions WHERE id = OLD.submission_id) THEN
        RAISE EXCEPTION 'grading_entries is append-only' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER grading_entries_append_only BEFORE DELETE ON grading_entries
    FOR EACH ROW EXECUTE FUNCTION grading_entries_no_delete();

-- ── Inline item feedback ────────────────────────────────────────────────────

CREATE TABLE item_feedback (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    grading_entry_id  uuid NOT NULL REFERENCES grading_entries (id) ON DELETE CASCADE,
    submission_id     uuid NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
    item_id           uuid REFERENCES assessment_items (id) ON DELETE SET NULL,
    -- Survives item deletion (legacy item_ref).
    item_ref          text NOT NULL,
    comment           text NOT NULL DEFAULT '',
    score             double precision,
    max_score         double precision,
    annotation_type   text NOT NULL DEFAULT 'text'
                      CHECK (annotation_type IN ('text', 'highlight', 'audio')),
    annotation_key    text,
    graded_by         uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER item_feedback_set_updated_at BEFORE UPDATE ON item_feedback
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX item_feedback_entry_idx ON item_feedback (grading_entry_id);
CREATE INDEX item_feedback_submission_item_idx ON item_feedback (submission_id, item_ref);

-- ── Bulk actions ────────────────────────────────────────────────────────────

CREATE TABLE bulk_actions (
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    assessment_id   uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
    performed_by    uuid REFERENCES users (id) ON DELETE SET NULL,
    action_type     text NOT NULL CHECK (action_type IN
                        ('extend_deadline', 'release_grades', 'return_all',
                         'override_score', 'batch_grade')),
    params          jsonb NOT NULL DEFAULT '{}'::jsonb,
    target_user_ids uuid[] NOT NULL DEFAULT '{}',
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    affected_count  integer NOT NULL DEFAULT 0,
    error_log       text NOT NULL DEFAULT '',
    created_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz
);
CREATE INDEX bulk_actions_assessment_idx ON bulk_actions (assessment_id, status);

-- ── Code runs (Judge0) ──────────────────────────────────────────────────────
-- Legacy rows had no foreign keys at all.

CREATE TABLE code_runs (
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid     text UNIQUE,
    assessment_id   uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
    item_id         uuid NOT NULL REFERENCES assessment_items (id) ON DELETE CASCADE,
    submission_id   uuid REFERENCES submissions (id) ON DELETE SET NULL,
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose         text NOT NULL
                    CHECK (purpose IN ('custom', 'visible', 'final', 'reference_check')),
    status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'accepted', 'wrong_answer',
                                      'compile_error', 'runtime_error', 'time_limit',
                                      'internal_error', 'degraded')),
    language_id     integer NOT NULL,
    source_sha256   text NOT NULL,
    stdin_sha256    text,
    idempotency_key text,
    passed          integer NOT NULL DEFAULT 0,
    total           integer NOT NULL DEFAULT 0,
    score           double precision,
    -- Compiler output is run-level by nature; per-case output lives below.
    compile_output  text,
    error_message   text,
    started_at      timestamptz,
    finished_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, item_id, purpose, idempotency_key)
);
CREATE INDEX code_runs_item_idx ON code_runs (item_id, user_id, created_at DESC);
CREATE INDEX code_runs_submission_idx ON code_runs (submission_id);

CREATE TABLE code_run_cases (
    id                 uuid PRIMARY KEY DEFAULT uuidv7(),
    run_id             uuid NOT NULL REFERENCES code_runs (id) ON DELETE CASCADE,
    position           integer NOT NULL,
    test_id            text NOT NULL,
    judge0_token       text,
    stdin              text,
    expected_output    text,
    description        text NOT NULL DEFAULT '',
    weight             double precision NOT NULL DEFAULT 1,
    is_visible         boolean NOT NULL DEFAULT true,
    status_id          integer,
    status_description text NOT NULL DEFAULT '',
    passed             boolean NOT NULL DEFAULT false,
    stdout             text,
    stderr             text,
    compile_output     text,
    message            text,
    time_seconds       double precision,
    memory_kb          integer
);
CREATE INDEX code_run_cases_run_idx ON code_run_cases (run_id, position);

-- ── Idempotency keys (ARCHITECTURE §6) ──────────────────────────────────────
-- Scoped per user; the stored response is replayed for the same key.

CREATE TABLE idempotency_keys (
    user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    key           text NOT NULL CHECK (char_length(key) <= 200),
    request_hash  text NOT NULL,
    status_code   integer NOT NULL,
    response      jsonb NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);
CREATE INDEX idempotency_keys_sweep_idx ON idempotency_keys (created_at);
