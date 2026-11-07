-- A row naming a learner's attempt names that learner's attempt (database review 2026-11-07).
--
-- Each column held a valid id on its own, so a code run of one learner could point at another's submission, a
-- progress row at another's best attempt, a grade draft at another's hand-in. Composite keys make the wrong
-- combination impossible for new rows; schema_try_fk records any old row that already is one.

SET LOCAL lock_timeout = '5s';

ALTER TABLE submissions ADD CONSTRAINT submissions_id_user_key UNIQUE USING INDEX submissions_id_user_key;
ALTER TABLE file_submission_attempts
    ADD CONSTRAINT file_submission_attempts_id_user_key UNIQUE USING INDEX file_submission_attempts_id_user_key;
ALTER TABLE assessment_items
    ADD CONSTRAINT assessment_items_id_assessment_key UNIQUE USING INDEX assessment_items_id_assessment_key;
ALTER TABLE grading_entries
    ADD CONSTRAINT grading_entries_id_submission_key UNIQUE USING INDEX grading_entries_id_submission_key;
ALTER TABLE code_run_cases
    ADD CONSTRAINT code_run_cases_run_position_key UNIQUE USING INDEX code_run_cases_run_position_key;
ALTER TABLE item_feedback
    ADD CONSTRAINT item_feedback_entry_item_key UNIQUE USING INDEX item_feedback_entry_item_key;

ALTER TABLE code_runs
    DROP CONSTRAINT code_runs_item_id_fkey,
    DROP CONSTRAINT code_runs_submission_id_fkey;
SELECT schema_try_fk('code_runs', 'code_runs_item_id_fkey',
    'FOREIGN KEY (item_id, assessment_id) REFERENCES assessment_items (id, assessment_id) ON DELETE CASCADE');
SELECT schema_try_fk('code_runs', 'code_runs_submission_id_fkey',
    'FOREIGN KEY (submission_id, user_id) REFERENCES submissions (id, user_id) ON DELETE SET NULL (submission_id)');

ALTER TABLE activity_progress
    DROP CONSTRAINT activity_progress_best_submission_id_fkey,
    DROP CONSTRAINT activity_progress_latest_submission_id_fkey;
SELECT schema_try_fk('activity_progress', 'activity_progress_best_submission_id_fkey',
    'FOREIGN KEY (best_submission_id, user_id) REFERENCES submissions (id, user_id) ON DELETE SET NULL (best_submission_id)');
SELECT schema_try_fk('activity_progress', 'activity_progress_latest_submission_id_fkey',
    'FOREIGN KEY (latest_submission_id, user_id) REFERENCES submissions (id, user_id) ON DELETE SET NULL (latest_submission_id)');

ALTER TABLE ai_grade_drafts
    DROP CONSTRAINT ai_grade_drafts_submission_id_fkey,
    DROP CONSTRAINT ai_grade_drafts_file_attempt_id_fkey,
    DROP CONSTRAINT ai_grade_drafts_activity_id_fkey;
SELECT schema_try_fk('ai_grade_drafts', 'ai_grade_drafts_submission_id_fkey',
    'FOREIGN KEY (submission_id, learner_id) REFERENCES submissions (id, user_id) ON DELETE CASCADE');
SELECT schema_try_fk('ai_grade_drafts', 'ai_grade_drafts_file_attempt_id_fkey',
    'FOREIGN KEY (file_attempt_id, learner_id) REFERENCES file_submission_attempts (id, user_id) ON DELETE CASCADE');
SELECT schema_try_fk('ai_grade_drafts', 'ai_grade_drafts_activity_id_fkey',
    'FOREIGN KEY (activity_id, course_id) REFERENCES activities (id, course_id) ON DELETE CASCADE');

ALTER TABLE ai_remediation_sessions
    DROP CONSTRAINT ai_remediation_sessions_submission_id_fkey,
    DROP CONSTRAINT ai_remediation_sessions_file_submission_attempt_id_fkey;
SELECT schema_try_fk('ai_remediation_sessions', 'ai_remediation_sessions_submission_id_fkey',
    'FOREIGN KEY (submission_id, student_user_id) REFERENCES submissions (id, user_id) ON DELETE CASCADE');
SELECT schema_try_fk('ai_remediation_sessions', 'ai_remediation_sessions_file_submission_attempt_id_fkey',
    'FOREIGN KEY (file_submission_attempt_id, student_user_id) REFERENCES file_submission_attempts (id, user_id) ON DELETE CASCADE');

-- A draft's activity is the activity of the attempt it grades (a key would need the activity copied onto the attempt).
CREATE FUNCTION ai_grade_drafts_same_activity() RETURNS trigger AS $$
BEGIN
    IF NEW.submission_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM submissions s JOIN assessments a ON a.id = s.assessment_id
         WHERE s.id = NEW.submission_id AND a.activity_id = NEW.activity_id) THEN
        RAISE EXCEPTION 'a grade draft names the activity of its submission' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.file_attempt_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM file_submission_attempts t JOIN file_submissions f ON f.id = t.file_submission_id
         WHERE t.id = NEW.file_attempt_id AND f.activity_id = NEW.activity_id) THEN
        RAISE EXCEPTION 'a grade draft names the activity of its file attempt' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ai_grade_drafts_same_activity BEFORE INSERT ON ai_grade_drafts
    FOR EACH ROW EXECUTE FUNCTION ai_grade_drafts_same_activity();

-- Per-item feedback belongs to the entry it was written with and is frozen with it.
SELECT schema_try_fk('item_feedback', 'item_feedback_entry_submission_fkey',
    'FOREIGN KEY (grading_entry_id, submission_id) REFERENCES grading_entries (id, submission_id) ON DELETE CASCADE');
ALTER TABLE item_feedback DROP CONSTRAINT item_feedback_grading_entry_id_fkey;

CREATE FUNCTION item_feedback_frozen() RETURNS trigger AS $$
DECLARE
    -- What erasure and deletes may clear: the grader, the item and the annotation's upload.
    cleared constant text[] := ARRAY['graded_by', 'item_id', 'annotation_upload_id', 'updated_at'];
BEGIN
    IF (to_jsonb(NEW) - cleared) IS DISTINCT FROM (to_jsonb(OLD) - cleared)
       OR (NEW.graded_by IS DISTINCT FROM OLD.graded_by AND NEW.graded_by IS NOT NULL)
       OR (NEW.item_id IS DISTINCT FROM OLD.item_id AND NEW.item_id IS NOT NULL) THEN
        RAISE EXCEPTION 'item_feedback rows are part of their grade entry: append a new entry'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER item_feedback_frozen BEFORE UPDATE ON item_feedback
    FOR EACH ROW EXECUTE FUNCTION item_feedback_frozen();

-- Code run bookkeeping that was only the runner's word.
SELECT schema_try_check('code_runs', 'code_runs_counts_check', $c$passed >= 0 AND total >= 0 AND passed <= total$c$);
SELECT schema_try_check('code_runs', 'code_runs_finished_check',
    $c$status IN ('queued', 'running') OR finished_at IS NOT NULL$c$);
