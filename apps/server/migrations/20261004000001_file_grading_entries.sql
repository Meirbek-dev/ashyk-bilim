-- L-6 (S-6.1): file-submission grading history and per-learner deadline
-- extensions, at parity with assessments.
--
-- file_grading_entries: append-only ledger, one row per grade save
-- (written in the same statement as the attempt update). Existing grades
-- have no history (the attempt row keeps the latest grade).
CREATE TABLE file_grading_entries (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    attempt_id   uuid NOT NULL REFERENCES file_submission_attempts (id) ON DELETE CASCADE,
    graded_by    uuid REFERENCES users (id) ON DELETE SET NULL,
    status       text NOT NULL CHECK (status IN ('graded', 'published', 'returned')),
    raw_score    double precision CHECK (raw_score BETWEEN 0 AND 100),
    penalty_pct  double precision NOT NULL DEFAULT 0,
    final_score  double precision CHECK (final_score BETWEEN 0 AND 100),
    feedback     text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX file_grading_entries_attempt_idx ON file_grading_entries (attempt_id, id DESC);

-- A learner's own due date on one file submission (deadline extension).
CREATE TABLE file_submission_overrides (
    file_submission_id uuid NOT NULL REFERENCES file_submissions (id) ON DELETE CASCADE,
    user_id            uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    due_at             timestamptz NOT NULL,
    reason             text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 1000),
    granted_by         uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (file_submission_id, user_id)
);
CREATE TRIGGER file_submission_overrides_set_updated_at BEFORE UPDATE ON file_submission_overrides
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
