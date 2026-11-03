-- contract: scores become exact numeric (schema review 2, items 7 and 31).
--
-- Every score, penalty, weight and passing score of the grading tables moves
-- from double precision to its domain (20261102020100_score_domains): a
-- percentage `percent` numeric(5,2) 0..100, points `score_points` and weights
-- `score_weight` numeric(8,2) >= 0. The release before this one already reads
-- and writes these columns through `::float8` casts, so it runs on either
-- type; the release before that decodes float8 and must not see this file.
--
-- Values are converted by `score_repair`: rounded to two decimals, clamped
-- into the domain's range, 'NaN'/infinity -> the given fallback (NULL, or the
-- column default where the column is NOT NULL). A column the old CHECKs
-- guarded is clamped only where they were skipped (schema_skipped_checks);
-- columns without one before (item_feedback scores, code run scores and case
-- weights, AI draft scores, file-grading penalties) may hold any value. The
-- migrate log names how many values were clamped beyond the rounding (a
-- WARNING; `just prod-report` cannot see it afterwards). Rounding alone moves
-- a weight like 0.125 to 0.13.
-- The domain's CHECK replaces each column's own double-precision CHECK.
--
-- ALTER COLUMN TYPE rewrites each table under an ACCESS EXCLUSIVE lock:
-- deploy it outside class hours (submissions and grading_entries are the
-- large ones). Row triggers (the grade-journal guards) do not fire on a
-- rewrite.

SET LOCAL lock_timeout = '5s';

-- score_repair of 20261102020100, counting what it changes beyond the rounding into ab.scores_clamped.
CREATE OR REPLACE FUNCTION score_repair(x double precision, lo numeric, hi numeric, fallback numeric)
RETURNS numeric LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, pg_temp AS $$
DECLARE
    repaired numeric;
BEGIN
    IF x IS NULL THEN
        RETURN NULL;
    END IF;
    IF x = 'NaN' OR x = 'Infinity' OR x = '-Infinity' THEN
        repaired := fallback;
    ELSE
        repaired := least(greatest(round(x::numeric, 2), lo), coalesce(hi, round(x::numeric, 2)));
    END IF;
    IF repaired IS NULL OR x = 'NaN' OR x = 'Infinity' OR x = '-Infinity' OR repaired <> round(x::numeric, 2) THEN
        PERFORM set_config('ab.scores_clamped',
            (coalesce(nullif(current_setting('ab.scores_clamped', true), ''), '0')::bigint + 1)::text, true);
    END IF;
    RETURN repaired;
END $$;

-- The current-grade check names submissions.final_score in its definition,
-- which blocks a type change: re-created below, unchanged.
DROP TRIGGER submissions_current_grade ON submissions;

ALTER TABLE assessment_items DROP CONSTRAINT IF EXISTS assessment_items_max_score_check;
ALTER TABLE assessment_items
    ALTER COLUMN max_score TYPE score_points USING score_repair(max_score, 0, 999999.99, 0);

ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_attempt_penalty_percent_check;
ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_late_penalty_percent_per_day_check;
ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_negative_marking_percent_check;
ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_passing_score_check;
ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_weight_check;
ALTER TABLE assessments
    ALTER COLUMN attempt_penalty_percent TYPE percent USING score_repair(attempt_penalty_percent, 0, 100, 0),
    ALTER COLUMN late_penalty_percent_per_day TYPE percent USING score_repair(late_penalty_percent_per_day, 0, 100, NULL),
    ALTER COLUMN negative_marking_percent TYPE percent USING score_repair(negative_marking_percent, 0, 100, 0),
    ALTER COLUMN passing_score TYPE percent USING score_repair(passing_score, 0, 100, 60),
    ALTER COLUMN weight TYPE score_weight USING score_repair(weight, 0, 999999.99, 1);

ALTER TABLE file_submissions DROP CONSTRAINT IF EXISTS file_submissions_late_penalty_percent_per_day_check;
ALTER TABLE file_submissions
    ALTER COLUMN late_penalty_percent_per_day TYPE percent USING score_repair(late_penalty_percent_per_day, 0, 100, NULL);

ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_auto_score_check;
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_final_score_check;
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_late_penalty_pct_check;
ALTER TABLE submissions
    ALTER COLUMN auto_score TYPE percent USING score_repair(auto_score, 0, 100, NULL),
    ALTER COLUMN final_score TYPE percent USING score_repair(final_score, 0, 100, NULL),
    ALTER COLUMN late_penalty_pct TYPE percent USING score_repair(late_penalty_pct, 0, 100, 0);

ALTER TABLE grading_entries DROP CONSTRAINT IF EXISTS grading_entries_final_score_check;
ALTER TABLE grading_entries DROP CONSTRAINT IF EXISTS grading_entries_penalty_pct_check;
ALTER TABLE grading_entries DROP CONSTRAINT IF EXISTS grading_entries_raw_score_check;
ALTER TABLE grading_entries
    ALTER COLUMN raw_score TYPE percent USING score_repair(raw_score, 0, 100, 0),
    ALTER COLUMN penalty_pct TYPE percent USING score_repair(penalty_pct, 0, 100, 0),
    ALTER COLUMN final_score TYPE percent USING score_repair(final_score, 0, 100, NULL);

ALTER TABLE file_submission_attempts DROP CONSTRAINT IF EXISTS file_submission_attempts_final_score_check;
ALTER TABLE file_submission_attempts DROP CONSTRAINT IF EXISTS file_submission_attempts_late_penalty_pct_check;
ALTER TABLE file_submission_attempts DROP CONSTRAINT IF EXISTS file_submission_attempts_raw_score_check;
ALTER TABLE file_submission_attempts
    ALTER COLUMN raw_score TYPE percent USING score_repair(raw_score, 0, 100, NULL),
    ALTER COLUMN late_penalty_pct TYPE percent USING score_repair(late_penalty_pct, 0, 100, 0),
    ALTER COLUMN final_score TYPE percent USING score_repair(final_score, 0, 100, NULL);

ALTER TABLE file_grading_entries DROP CONSTRAINT IF EXISTS file_grading_entries_final_score_check;
ALTER TABLE file_grading_entries DROP CONSTRAINT IF EXISTS file_grading_entries_raw_score_check;
ALTER TABLE file_grading_entries
    ALTER COLUMN raw_score TYPE percent USING score_repair(raw_score, 0, 100, NULL),
    ALTER COLUMN penalty_pct TYPE percent USING score_repair(penalty_pct, 0, 100, 0),
    ALTER COLUMN final_score TYPE percent USING score_repair(final_score, 0, 100, NULL);

ALTER TABLE item_feedback
    ALTER COLUMN score TYPE score_points USING score_repair(score, 0, 999999.99, NULL),
    ALTER COLUMN max_score TYPE score_points USING score_repair(max_score, 0, 999999.99, NULL);

ALTER TABLE code_runs
    ALTER COLUMN score TYPE percent USING score_repair(score, 0, 100, NULL);

ALTER TABLE code_run_cases
    ALTER COLUMN weight TYPE score_weight USING score_repair(weight, 0, 999999.99, 1);

ALTER TABLE ai_grade_drafts DROP CONSTRAINT IF EXISTS ai_grade_drafts_ai_score_check;
ALTER TABLE ai_grade_drafts DROP CONSTRAINT IF EXISTS ai_grade_drafts_calibrated_score_check;
ALTER TABLE ai_grade_drafts DROP CONSTRAINT IF EXISTS ai_grade_drafts_max_score_check;
ALTER TABLE ai_grade_drafts
    ALTER COLUMN ai_score TYPE score_points USING score_repair(ai_score, 0, 999999.99, NULL),
    ALTER COLUMN calibrated_score TYPE score_points USING score_repair(calibrated_score, 0, 999999.99, NULL),
    ALTER COLUMN final_score TYPE score_points USING score_repair(final_score, 0, 999999.99, NULL),
    ALTER COLUMN max_score TYPE score_points USING score_repair(max_score, 0, 999999.99, NULL);

ALTER TABLE ai_grade_corrections DROP CONSTRAINT IF EXISTS ai_grade_corrections_ai_score_check;
ALTER TABLE ai_grade_corrections DROP CONSTRAINT IF EXISTS ai_grade_corrections_teacher_score_check;
ALTER TABLE ai_grade_corrections DROP CONSTRAINT IF EXISTS ai_grade_corrections_max_score_check;
ALTER TABLE ai_grade_corrections
    ALTER COLUMN ai_score TYPE score_points USING score_repair(ai_score, 0, 999999.99, 0),
    ALTER COLUMN teacher_score TYPE score_points USING score_repair(teacher_score, 0, 999999.99, 0),
    ALTER COLUMN max_score TYPE score_points USING score_repair(max_score, 0, 999999.99, 0);
SELECT schema_try_check('ai_grade_corrections', 'ai_grade_corrections_max_score_check', 'max_score > 0');

DO $$
BEGIN
    IF coalesce(nullif(current_setting('ab.scores_clamped', true), ''), '0')::bigint > 0 THEN
        RAISE WARNING 'scores_numeric: % score values were out of range or not finite and were clamped',
            current_setting('ab.scores_clamped');
    END IF;
END $$;

DROP FUNCTION score_repair(double precision, numeric, numeric, numeric);

CREATE CONSTRAINT TRIGGER submissions_current_grade AFTER UPDATE OF final_score, grading ON submissions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (OLD.final_score IS DISTINCT FROM NEW.final_score OR OLD.grading IS DISTINCT FROM NEW.grading)
    EXECUTE FUNCTION submissions_current_grade_check();
