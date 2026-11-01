-- One current grade (schema review 2, item 8).
--
-- `grading_entries` is the grade journal; `submissions.final_score` is its
-- one denormalized current value (what lists, progress and analytics read)
-- and `submissions.grading` the current breakdown. Every writer appends an
-- entry and updates the submission in the same transaction; nothing checked
-- that the two agree. Now, at COMMIT, a submission with at least one entry
-- has the final score and the effective breakdown of its latest entry
-- (latest = highest uuidv7 id, the order `latest_grading_entry` reads).
-- A submission without entries (a hand-in awaiting review, legacy rows) is
-- not checked: it has no grade of record yet.
--
-- Deferred, because writers order the two statements either way. Checked
-- when an entry is appended and when a submission's score or breakdown
-- changes, so untouched legacy rows are never re-judged.

SET LOCAL lock_timeout = '5s';

CREATE FUNCTION submission_grade_matches_journal(p_submission uuid) RETURNS void AS $$
DECLARE
    sub record;
    entry record;
BEGIN
    SELECT final_score, grading INTO sub FROM submissions WHERE id = p_submission;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT final_score, effective_breakdown INTO entry FROM grading_entries
    WHERE submission_id = p_submission ORDER BY id DESC LIMIT 1;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    IF sub.final_score IS DISTINCT FROM entry.final_score THEN
        RAISE EXCEPTION 'submission % final_score % differs from its latest grade entry (%)',
            p_submission, sub.final_score, entry.final_score
            USING ERRCODE = 'check_violation';
    END IF;
    IF sub.grading IS DISTINCT FROM entry.effective_breakdown THEN
        RAISE EXCEPTION 'submission % breakdown differs from its latest grade entry', p_submission
            USING ERRCODE = 'check_violation';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION grading_entries_current_check() RETURNS trigger AS $$
BEGIN
    PERFORM submission_grade_matches_journal(NEW.submission_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER grading_entries_current AFTER INSERT ON grading_entries
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION grading_entries_current_check();

CREATE FUNCTION submissions_current_grade_check() RETURNS trigger AS $$
BEGIN
    PERFORM submission_grade_matches_journal(NEW.id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER submissions_current_grade AFTER UPDATE OF final_score, grading ON submissions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (OLD.final_score IS DISTINCT FROM NEW.final_score OR OLD.grading IS DISTINCT FROM NEW.grading)
    EXECUTE FUNCTION submissions_current_grade_check();
