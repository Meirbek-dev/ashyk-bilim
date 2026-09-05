-- File-submission activities (legacy file_submission_activity /
-- file_submission_attempt / file_submission_attempt_file), P5.1.
--
-- Deltas from the legacy shape:
--   * late_policy_json becomes CHECKed columns (same shape as assessments);
--   * grade_release_mode / lifecycle / status / scan_status get CHECKs;
--   * feedback_json splits into `feedback` (text) + `rubric_scores` (jsonb);
--   * one open (draft or returned) attempt per learner is a partial unique
--     index, not a `.first()`; attempts carry a denormalized course_id;
--   * files reference `uploads` (RESTRICT) and keep the storage key so the
--     grader can download after the upload row's grace bookkeeping.

CREATE TABLE file_submissions (
    id                 uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid        text UNIQUE,
    activity_id        uuid NOT NULL UNIQUE REFERENCES activities (id) ON DELETE CASCADE,
    course_id          uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    instructions       text NOT NULL DEFAULT '',
    rubric             jsonb NOT NULL DEFAULT '{}'::jsonb,
    allowed_mime_types text[] NOT NULL DEFAULT '{}',
    max_files          integer NOT NULL DEFAULT 1 CHECK (max_files BETWEEN 1 AND 25),
    max_file_size_mb   integer CHECK (max_file_size_mb BETWEEN 1 AND 500),
    due_at             timestamptz,
    allow_late         boolean NOT NULL DEFAULT true,
    late_policy_kind   text NOT NULL DEFAULT 'none'
                       CHECK (late_policy_kind IN ('none', 'penalty', 'cutoff')),
    late_penalty_percent_per_day double precision
                       CHECK (late_penalty_percent_per_day BETWEEN 0 AND 100),
    late_penalty_max_days integer CHECK (late_penalty_max_days >= 1),
    late_cutoff_at     timestamptz,
    max_attempts       integer CHECK (max_attempts BETWEEN 1 AND 50),
    grade_release_mode text NOT NULL DEFAULT 'immediate'
                       CHECK (grade_release_mode IN ('immediate', 'batch')),
    lifecycle          text NOT NULL DEFAULT 'draft'
                       CHECK (lifecycle IN ('draft', 'published', 'archived')),
    published_at       timestamptz,
    archived_at        timestamptz,
    settings           jsonb NOT NULL DEFAULT '{}'::jsonb,
    creator_id         uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT file_submissions_late_policy_shape CHECK (
        (late_policy_kind = 'none' AND late_penalty_percent_per_day IS NULL
            AND late_penalty_max_days IS NULL AND late_cutoff_at IS NULL)
        OR (late_policy_kind = 'penalty' AND late_penalty_percent_per_day IS NOT NULL
            AND late_penalty_max_days IS NOT NULL AND late_cutoff_at IS NULL)
        OR (late_policy_kind = 'cutoff' AND late_cutoff_at IS NOT NULL
            AND late_penalty_percent_per_day IS NULL AND late_penalty_max_days IS NULL)
    )
);
CREATE TRIGGER file_submissions_set_updated_at BEFORE UPDATE ON file_submissions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX file_submissions_course_idx ON file_submissions (course_id);

CREATE TABLE file_submission_attempts (
    id                 uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid        text UNIQUE,
    file_submission_id uuid NOT NULL REFERENCES file_submissions (id) ON DELETE CASCADE,
    course_id          uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    user_id            uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'submitted', 'graded', 'published', 'returned')),
    attempt_number     integer NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
    started_at         timestamptz,
    submitted_at       timestamptz,
    graded_at          timestamptz,
    is_late            boolean NOT NULL DEFAULT false,
    late_penalty_pct   double precision NOT NULL DEFAULT 0,
    final_score        double precision CHECK (final_score BETWEEN 0 AND 100),
    feedback           text NOT NULL DEFAULT '',
    rubric_scores      jsonb NOT NULL DEFAULT '{}'::jsonb,
    graded_by          uuid REFERENCES users (id) ON DELETE SET NULL,
    -- Optimistic lock shared by the learner's file edits and the grader.
    version            bigint NOT NULL DEFAULT 1,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER file_submission_attempts_set_updated_at BEFORE UPDATE ON file_submission_attempts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- A returned attempt is edited in place and resubmitted, so it is "open" too.
CREATE UNIQUE INDEX file_submission_attempts_one_open
    ON file_submission_attempts (file_submission_id, user_id)
    WHERE status IN ('draft', 'returned');
CREATE INDEX file_submission_attempts_review_idx
    ON file_submission_attempts (file_submission_id, status, submitted_at DESC);
CREATE INDEX file_submission_attempts_learner_idx
    ON file_submission_attempts (file_submission_id, user_id, attempt_number DESC);
CREATE INDEX file_submission_attempts_course_idx
    ON file_submission_attempts (course_id, user_id);

CREATE TABLE file_submission_files (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid   text UNIQUE,
    attempt_id    uuid NOT NULL REFERENCES file_submission_attempts (id) ON DELETE CASCADE,
    upload_id     uuid NOT NULL REFERENCES uploads (id) ON DELETE RESTRICT,
    display_name  text NOT NULL DEFAULT '',
    content_type  text NOT NULL DEFAULT '',
    size_bytes    bigint,
    storage_key   text NOT NULL,
    position      integer NOT NULL DEFAULT 0,
    scan_status   text NOT NULL DEFAULT 'pending'
                  CHECK (scan_status IN ('pending', 'clean', 'flagged', 'error')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (attempt_id, upload_id)
);
CREATE INDEX file_submission_files_attempt_idx ON file_submission_files (attempt_id, position);
