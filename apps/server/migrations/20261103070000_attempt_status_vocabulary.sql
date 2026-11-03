SET LOCAL lock_timeout = '5s';

-- contract: one attempt status vocabulary (expand 20261102070000). The release
-- before the expand one read only `pending` / `published`; the expand release
-- reads both and writes the new spellings, so the rows move now and the checks
-- narrow. The API spellings do not change (ab-core `attempt_status_enum!`).

DROP TRIGGER submissions_status_previous_spelling ON submissions;
DROP TRIGGER file_submission_attempts_status_previous_spelling ON file_submission_attempts;
DROP TRIGGER file_grading_entries_status_previous_spelling ON file_grading_entries;
DROP FUNCTION attempt_status_previous_spelling();

-- A spelling change, not an edit of the work: keep updated_at.
SET LOCAL ab.bookkeeping = 'on';

UPDATE submissions SET status = CASE status WHEN 'pending' THEN 'submitted' ELSE 'released' END
WHERE status IN ('pending', 'published');
UPDATE file_submission_attempts SET status = 'released' WHERE status = 'published';

-- The journal is append-only; its guard is lifted for this one rename only
-- (same meaning, new word), inside this transaction.
ALTER TABLE file_grading_entries DISABLE TRIGGER file_grading_entries_immutable;
UPDATE file_grading_entries SET status = 'released' WHERE status = 'published';
ALTER TABLE file_grading_entries ENABLE TRIGGER file_grading_entries_immutable;

ALTER TABLE submissions DROP CONSTRAINT submissions_status_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_status_check
    CHECK (status IN ('draft', 'submitted', 'graded', 'released', 'returned'));
ALTER TABLE file_submission_attempts DROP CONSTRAINT file_submission_attempts_status_check;
ALTER TABLE file_submission_attempts ADD CONSTRAINT file_submission_attempts_status_check
    CHECK (status IN ('draft', 'submitted', 'graded', 'released', 'returned'));
ALTER TABLE file_grading_entries DROP CONSTRAINT file_grading_entries_status_check;
ALTER TABLE file_grading_entries ADD CONSTRAINT file_grading_entries_status_check
    CHECK (status IN ('graded', 'released', 'returned'));
