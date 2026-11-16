-- Pipeline merge, the switch release (REWRITE 5.6 n6 / n16, 5.8 item 1).
--
-- From this release a file task is an `assessments` row with the id of its `file_submissions` row (which stays as
-- the task's typed extension: instructions, rubric, file caps), a hand-in is a `submissions` row, its grades are
-- `grading_entries` and a learner's extension is an `assessment_overrides` row. Nothing reads or writes
-- `file_submission_attempts`, `file_grading_entries`, `file_submission_overrides` or the policy / lifecycle
-- columns of `file_submissions` any more; a later release drops them (pending-contracts.tsv).
-- Production held 23 file tasks, all draft, and no hand-in, file, grade entry or extension (2026-11-15): only the
-- tasks are mapped and nothing mirrors the old tables.
SET LOCAL lock_timeout = '5s';

-- Nothing below carries a hand-in over: a database that has one stops here instead of losing it.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM file_submission_attempts) OR EXISTS (SELECT 1 FROM file_grading_entries)
       OR EXISTS (SELECT 1 FROM file_submission_overrides) OR EXISTS (SELECT 1 FROM file_submission_files) THEN
        RAISE EXCEPTION 'file hand-ins exist; this migration maps file tasks only (REWRITE 5.8 item 1)';
    END IF;
END
$$;

-- A file task takes up to 50 attempts (files/submissions.rs); the server keeps each kind's own limit.
ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_max_attempts_cap;
SELECT schema_try_check('assessments', 'assessments_max_attempts_cap', 'max_attempts IS NULL OR max_attempts <= 50');

-- One assessment per file task, same id. The policy the file pipeline hard-coded (projector, file branch): a
-- teacher grades it (manual), it always counts toward the course (required), a released grade completes it
-- whatever the score (completion_rule graded) and 60 passes. The other columns keep their defaults: a file task
-- has no timer, draw, proctoring or review settings, and weight 1 is what an activity without a weight counted as.
INSERT INTO assessments
    (id, activity_id, course_id, lifecycle, published_at, archived_at, due_at, allow_late,
     late_policy_kind, late_penalty_percent_per_day, late_penalty_max_days, late_cutoff_at,
     max_attempts, grade_release_mode, grading_mode, completion_rule, passing_score, required,
     creator_id, created_at, updated_at)
SELECT f.id, f.activity_id, f.course_id, f.lifecycle,
       CASE WHEN f.lifecycle = 'published' THEN COALESCE(f.published_at, f.updated_at) ELSE f.published_at END,
       CASE WHEN f.lifecycle = 'archived' THEN COALESCE(f.archived_at, f.updated_at) ELSE f.archived_at END,
       f.due_at, f.allow_late,
       f.late_policy_kind, f.late_penalty_percent_per_day, f.late_penalty_max_days, f.late_cutoff_at,
       f.max_attempts, f.grade_release_mode, 'manual', 'graded', 60, true,
       f.creator_id, f.created_at, f.updated_at
FROM file_submissions f;

-- The extension row belongs to its assessment (file_submissions is empty of orphans after the insert above).
SELECT schema_try_fk('file_submissions', 'file_submissions_assessment_fkey',
                     'FOREIGN KEY (id, course_id) REFERENCES assessments (id, course_id) ON UPDATE RESTRICT ON DELETE CASCADE');

-- A hand-in's files hang on its submission. The table was empty in production; rows of an attempt that is no
-- submission would fail the validation and keep the key NOT VALID (schema_skipped_checks names it).
ALTER TABLE file_submission_files DROP CONSTRAINT IF EXISTS file_submission_files_attempt_id_fkey;
SELECT schema_try_fk('file_submission_files', 'file_submission_files_attempt_id_fkey',
                     'FOREIGN KEY (attempt_id) REFERENCES submissions (id) ON DELETE CASCADE');

-- The file API's grading history says which saves sent the work back; a quiz return says so too.
ALTER TABLE grading_entries ADD COLUMN returned boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN learning.grading_entries.returned IS
    'This save returned the work for revision (the attempt went to status returned).';

COMMENT ON TABLE learning.file_submissions IS
    'The typed body of a file task: instructions, rubric and file caps. Its id is its assessments row''s; policy and lifecycle live there.';

-- A hand-in of a file task (its files are in file_submission_files): what tells the two kinds of submissions
-- apart where only the id is known (the AI tables).
CREATE FUNCTION submission_is_file_hand_in(p_submission uuid) RETURNS boolean
    LANGUAGE sql STABLE PARALLEL SAFE
    RETURN EXISTS (SELECT 1 FROM submissions s
                   JOIN file_submissions f ON f.id = s.assessment_id
                   WHERE s.id = p_submission);

-- The SQL objects that named the old tables.
CREATE OR REPLACE VIEW learning.learner_visible_activities AS
    SELECT a.id AS activity_id, a.course_id
    FROM activities a
    WHERE a.published
      AND NOT EXISTS (SELECT 1 FROM assessments s WHERE s.activity_id = a.id AND s.lifecycle <> 'published');

CREATE OR REPLACE FUNCTION course_has_learner_work(p_course uuid) RETURNS boolean
    LANGUAGE sql STABLE PARALLEL SAFE
    RETURN EXISTS (SELECT 1 FROM submissions WHERE course_id = p_course AND NOT preview)
        OR EXISTS (SELECT 1 FROM certificate_users WHERE course_id = p_course);

-- A draft of a file hand-in names it in submission_id; file_attempt_id stays empty until its contract.
CREATE OR REPLACE FUNCTION ai_grade_drafts_same_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.submission_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM submissions s JOIN assessments a ON a.id = s.assessment_id
         WHERE s.id = NEW.submission_id AND a.activity_id = NEW.activity_id) THEN
        RAISE EXCEPTION 'a grade draft names the activity of its submission' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;
SELECT pin_function_search_paths();

-- ashyq_ro reads the new column (its grants on grading_entries are per column).
SELECT apply_role_grants(current_user);
