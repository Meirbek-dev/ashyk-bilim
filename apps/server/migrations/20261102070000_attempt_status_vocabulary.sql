SET LOCAL lock_timeout = '5s';

-- One attempt status vocabulary (schema review 2 item 2, REWRITE 5.6 n16):
-- draft -> submitted -> graded -> released -> returned for quiz/exam/code
-- submissions and file attempts alike. Submissions said `pending` where file
-- attempts said `submitted`; both said `published` for a released grade.
-- The API keeps its spellings (`pending`, `published`): the server maps them
-- at the database boundary (`attempt_status_enum!` in ab-core).
--
-- Expand: the checks accept both spellings; the server writes the new ones and
-- reads either. Until the contract migration (20261103070000) rewrites the
-- rows, these triggers store the previous spelling, so the previous release,
-- which knows only `pending` / `published`, reads every row the new one wrote.

ALTER TABLE submissions DROP CONSTRAINT submissions_status_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_status_check
    CHECK (status IN ('draft', 'pending', 'submitted', 'graded', 'published', 'released', 'returned'));

ALTER TABLE file_submission_attempts DROP CONSTRAINT file_submission_attempts_status_check;
ALTER TABLE file_submission_attempts ADD CONSTRAINT file_submission_attempts_status_check
    CHECK (status IN ('draft', 'submitted', 'graded', 'published', 'released', 'returned'));

ALTER TABLE file_grading_entries DROP CONSTRAINT file_grading_entries_status_check;
ALTER TABLE file_grading_entries ADD CONSTRAINT file_grading_entries_status_check
    CHECK (status IN ('graded', 'published', 'released', 'returned'));

CREATE FUNCTION attempt_status_previous_spelling() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'released' THEN
        NEW.status := 'published';
    ELSIF NEW.status = 'submitted' AND TG_TABLE_NAME = 'submissions' THEN
        NEW.status := 'pending';
    END IF;
    RETURN NEW;
END
$$;

COMMENT ON FUNCTION attempt_status_previous_spelling() IS
    'Expand step of the attempt status vocabulary: stores pending/published for the previous release; dropped by 20261103070000.';

CREATE TRIGGER submissions_status_previous_spelling
    BEFORE INSERT OR UPDATE OF status ON submissions
    FOR EACH ROW EXECUTE FUNCTION attempt_status_previous_spelling();
CREATE TRIGGER file_submission_attempts_status_previous_spelling
    BEFORE INSERT OR UPDATE OF status ON file_submission_attempts
    FOR EACH ROW EXECUTE FUNCTION attempt_status_previous_spelling();
CREATE TRIGGER file_grading_entries_status_previous_spelling
    BEFORE INSERT ON file_grading_entries
    FOR EACH ROW EXECUTE FUNCTION attempt_status_previous_spelling();

COMMENT ON TABLE submissions IS
    'An attempt at an assessment by a learner: answers, frozen items/policy snapshots, status draft -> submitted -> graded -> released / returned (pending / published until contract B2). preview rows are staff test runs.';
