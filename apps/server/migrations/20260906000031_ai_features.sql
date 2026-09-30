-- AI feature records (P8.3–8.5): the per-agent tables from the legacy
-- `ai_qa_thread.py`, `ai_submission_analysis.py`, `ai_course_analysis.py`,
-- `ai_lecture_review.py`, `ai_remediation.py`, `ai_student_memory.py`.
-- Legacy int PKs + parallel `*_uuid` strings collapse into one uuidv7 key;
-- every reference is a real FK (the legacy declared them but SQLModel never
-- created several).

CREATE TABLE ai_qa_messages (
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    thread_id       uuid NOT NULL REFERENCES ai_threads (id) ON DELETE CASCADE,
    course_id       uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    user_id         uuid REFERENCES users (id) ON DELETE SET NULL,
    role            text NOT NULL CHECK (role IN ('user', 'assistant')),
    -- Client-generated turn id for idempotent retries of one question.
    client_turn_id  text,
    content         text NOT NULL,
    confidence      text CHECK (confidence IS NULL OR confidence IN ('low', 'medium', 'high')),
    citations       jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_qa_messages_thread_order_idx ON ai_qa_messages (thread_id, created_at, id);
CREATE INDEX ai_qa_messages_course_user_idx ON ai_qa_messages (course_id, user_id, created_at DESC);
CREATE UNIQUE INDEX ai_qa_messages_client_turn_idx
    ON ai_qa_messages (course_id, user_id, client_turn_id)
    WHERE client_turn_id IS NOT NULL;

CREATE TABLE ai_submission_analyses (
    id             uuid PRIMARY KEY DEFAULT uuidv7(),
    submission_id  uuid NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
    run_id         uuid REFERENCES ai_runs (id) ON DELETE SET NULL,
    triggered_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    status         text NOT NULL DEFAULT 'complete',
    language       text NOT NULL DEFAULT 'auto',
    gap_count      integer NOT NULL DEFAULT 0 CHECK (gap_count >= 0),
    analysis       jsonb NOT NULL DEFAULT '{}'::jsonb,
    evidence       jsonb NOT NULL DEFAULT '{}'::jsonb,
    model_name     text,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_submission_analyses_submission_idx
    ON ai_submission_analyses (submission_id, status, created_at DESC);

CREATE TABLE ai_course_analyses (
    id             uuid PRIMARY KEY DEFAULT uuidv7(),
    course_id      uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    run_id         uuid REFERENCES ai_runs (id) ON DELETE SET NULL,
    triggered_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'needs_human_review', 'published')),
    language       text NOT NULL DEFAULT 'auto',
    public_score   integer NOT NULL CHECK (public_score BETWEEN 0 AND 100),
    report         jsonb NOT NULL DEFAULT '{}'::jsonb,
    evidence       jsonb NOT NULL DEFAULT '{}'::jsonb,
    model_name     text,
    -- sha256 of the rendered course context; the latest analysis is
    -- `stale` when the course context hashes differently now.
    content_hash   text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    published_at   timestamptz
);
CREATE INDEX ai_course_analyses_course_status_idx
    ON ai_course_analyses (course_id, status, created_at DESC);

CREATE TABLE ai_lecture_reviews (
    id                       uuid PRIMARY KEY DEFAULT uuidv7(),
    course_id                uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    activity_id              uuid REFERENCES activities (id) ON DELETE CASCADE,
    run_id                   uuid REFERENCES ai_runs (id) ON DELETE SET NULL,
    triggered_by             uuid REFERENCES users (id) ON DELETE SET NULL,
    status                   text NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'superseded')),
    language                 text NOT NULL DEFAULT 'auto',
    suggestions              jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Legacy `dismissed_json` was `{suggestion_id: true}`; a set of ids is
    -- a set of ids.
    dismissed_suggestion_ids text[] NOT NULL DEFAULT '{}',
    created_at               timestamptz NOT NULL DEFAULT now(),
    superseded_at            timestamptz
);
CREATE INDEX ai_lecture_reviews_course_status_idx
    ON ai_lecture_reviews (course_id, status, created_at DESC);
CREATE INDEX ai_lecture_reviews_activity_status_idx
    ON ai_lecture_reviews (activity_id, status, created_at DESC);

CREATE TABLE ai_remediation_sessions (
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    submission_id    uuid NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
    activity_id      uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    student_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    analysis_id      uuid REFERENCES ai_submission_analyses (id) ON DELETE SET NULL,
    run_id           uuid REFERENCES ai_runs (id) ON DELETE SET NULL,
    status           text NOT NULL DEFAULT 'assigned'
                     CHECK (status IN ('assigned', 'in_progress', 'passed', 'failed')),
    gate_mode        boolean NOT NULL DEFAULT false,
    language         text NOT NULL DEFAULT 'auto',
    lecture          jsonb NOT NULL DEFAULT '{}'::jsonb,
    test             jsonb NOT NULL DEFAULT '{}'::jsonb,
    score            integer CHECK (score IS NULL OR score BETWEEN 0 AND 100),
    passed_at        timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER ai_remediation_sessions_set_updated_at BEFORE UPDATE ON ai_remediation_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX ai_remediation_sessions_student_activity_idx
    ON ai_remediation_sessions (student_user_id, activity_id, status);
CREATE INDEX ai_remediation_sessions_submission_idx
    ON ai_remediation_sessions (submission_id, created_at DESC);
CREATE INDEX ai_remediation_sessions_student_idx
    ON ai_remediation_sessions (student_user_id, created_at DESC);

-- Carried for parity with the legacy schema; no legacy code path ever wrote
-- to it (`semantic_memory_enabled` gated nothing). Write paths land when
-- semantic memory is actually built.
CREATE TABLE ai_student_memory (
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    student_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    course_id        uuid REFERENCES courses (id) ON DELETE CASCADE,
    source_type      text NOT NULL,
    source_id        text NOT NULL,
    memory_text      text NOT NULL,
    language         text NOT NULL DEFAULT 'auto',
    metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER ai_student_memory_set_updated_at BEFORE UPDATE ON ai_student_memory
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX ai_student_memory_student_course_idx
    ON ai_student_memory (student_user_id, course_id, updated_at DESC);
CREATE INDEX ai_student_memory_source_idx ON ai_student_memory (source_type, source_id);
