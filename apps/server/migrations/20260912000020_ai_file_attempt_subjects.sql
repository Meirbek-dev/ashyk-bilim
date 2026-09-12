-- AI analysis and remediation accept file-submission attempts (DECISIONS
-- 2026-09-12, Q-2026-09-12-2 #7): a record is about exactly one subject —
-- an assessment submission or a file-submission attempt.

ALTER TABLE ai_submission_analyses
    ALTER COLUMN submission_id DROP NOT NULL,
    ADD COLUMN file_submission_attempt_id uuid
        REFERENCES file_submission_attempts (id) ON DELETE CASCADE,
    ADD CONSTRAINT ai_submission_analyses_one_subject
        CHECK ((submission_id IS NULL) <> (file_submission_attempt_id IS NULL));
CREATE INDEX ai_submission_analyses_attempt_idx
    ON ai_submission_analyses (file_submission_attempt_id, status, created_at DESC)
    WHERE file_submission_attempt_id IS NOT NULL;

ALTER TABLE ai_remediation_sessions
    ALTER COLUMN submission_id DROP NOT NULL,
    ADD COLUMN file_submission_attempt_id uuid
        REFERENCES file_submission_attempts (id) ON DELETE CASCADE,
    ADD CONSTRAINT ai_remediation_sessions_one_subject
        CHECK ((submission_id IS NULL) <> (file_submission_attempt_id IS NULL));
CREATE INDEX ai_remediation_sessions_attempt_idx
    ON ai_remediation_sessions (file_submission_attempt_id, created_at DESC)
    WHERE file_submission_attempt_id IS NOT NULL;
