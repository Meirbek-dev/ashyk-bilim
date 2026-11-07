-- A grade journal's order is its own number, not the id's clock (database review 2026-11-07).
--
-- "Latest entry" meant ORDER BY id DESC: a uuidv7 orders by the generating host's wall clock and only within one
-- backend, so a clock step could make an old grade current. revision counts entries per attempt and is unique.
-- Insert-time trigger: the previous release inserts without it. Grading holds the attempt's row, so two entries
-- of one attempt never read the same maximum; the key refuses it if one ever does.

SET LOCAL lock_timeout = '5s';

ALTER TABLE grading_entries ADD COLUMN revision integer;
ALTER TABLE file_grading_entries ADD COLUMN revision integer;

ALTER TABLE grading_entries DISABLE TRIGGER grading_entries_immutable;
UPDATE grading_entries e SET revision = n.r
  FROM (SELECT id, row_number() OVER (PARTITION BY submission_id ORDER BY id) AS r FROM grading_entries) n
 WHERE n.id = e.id;
ALTER TABLE grading_entries ENABLE TRIGGER grading_entries_immutable;

ALTER TABLE file_grading_entries DISABLE TRIGGER file_grading_entries_immutable;
UPDATE file_grading_entries e SET revision = n.r
  FROM (SELECT id, row_number() OVER (PARTITION BY attempt_id ORDER BY id) AS r FROM file_grading_entries) n
 WHERE n.id = e.id;
ALTER TABLE file_grading_entries ENABLE TRIGGER file_grading_entries_immutable;

CREATE FUNCTION grading_entries_number() RETURNS trigger AS $$
BEGIN
    -- Two graders saving at once take turns on the submission, so the second reads the first's number.
    PERFORM 1 FROM submissions WHERE id = NEW.submission_id FOR NO KEY UPDATE;
    SELECT COALESCE(max(revision), 0) + 1 INTO NEW.revision
      FROM grading_entries WHERE submission_id = NEW.submission_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER grading_entries_number BEFORE INSERT ON grading_entries
    FOR EACH ROW EXECUTE FUNCTION grading_entries_number();

CREATE FUNCTION file_grading_entries_number() RETURNS trigger AS $$
BEGIN
    PERFORM 1 FROM file_submission_attempts WHERE id = NEW.attempt_id FOR NO KEY UPDATE;
    SELECT COALESCE(max(revision), 0) + 1 INTO NEW.revision
      FROM file_grading_entries WHERE attempt_id = NEW.attempt_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER file_grading_entries_number BEFORE INSERT ON file_grading_entries
    FOR EACH ROW EXECUTE FUNCTION file_grading_entries_number();

ALTER TABLE grading_entries ALTER COLUMN revision SET NOT NULL;
ALTER TABLE file_grading_entries ALTER COLUMN revision SET NOT NULL;
COMMENT ON COLUMN grading_entries.revision IS 'Number of the entry within its submission (1, 2, ...); the highest is the current grade.';
COMMENT ON COLUMN file_grading_entries.revision IS 'Number of the entry within its attempt (1, 2, ...); the highest is the current grade.';

CREATE OR REPLACE FUNCTION submission_grade_matches_journal(p_submission uuid) RETURNS void AS $$
DECLARE
    sub record;
    entry record;
BEGIN
    SELECT final_score INTO sub FROM submissions WHERE id = p_submission;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT final_score INTO entry FROM grading_entries
    WHERE submission_id = p_submission ORDER BY revision DESC LIMIT 1;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    IF sub.final_score IS DISTINCT FROM entry.final_score THEN
        RAISE EXCEPTION 'submission % final_score % differs from its latest grade entry (%)',
            p_submission, sub.final_score, entry.final_score
            USING ERRCODE = 'check_violation';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION submission_breakdown(p_submission uuid, p_auto_breakdown jsonb) RETURNS jsonb
LANGUAGE sql STABLE PARALLEL SAFE
RETURN COALESCE(
    (SELECT e.effective_breakdown FROM grading_entries e
     WHERE e.submission_id = p_submission ORDER BY e.revision DESC LIMIT 1),
    p_auto_breakdown,
    '{}'::jsonb);
