-- Statuses, part 1 (REWRITE 5.8 item 5): a learner's progress in an activity is a status plus `passed`.
--
-- `activity_progress.state` mixed how far the work got with how it ended: a released grade was `passed` or
-- `failed`, every other value a step. `status` keeps the steps (`released` for both outcomes) and `passed`, already
-- stored (the grade of record meets the pass mark), is the outcome. A released hand-in with no score was `failed`
-- (file tasks), so `released` with `passed` not true reads as failed.
--
-- Switch release: the server reads and writes `status`. The previous release reads and writes `state`, so a
-- trigger keeps the two equal whichever side the writer named; the index follows in the next file. A contract
-- drops `state`, its check and index, and the trigger (pending-contracts.tsv).
SET LOCAL lock_timeout = '5s';

ALTER TABLE activity_progress ADD COLUMN status text;
UPDATE activity_progress SET status = CASE WHEN state IN ('passed', 'failed') THEN 'released' ELSE state END;
ALTER TABLE activity_progress ALTER COLUMN status SET NOT NULL,
    ADD CONSTRAINT activity_progress_status_check CHECK (status IN (
        'not_started', 'in_progress', 'submitted', 'needs_grading', 'returned', 'graded', 'released', 'completed'));
COMMENT ON COLUMN learning.activity_progress.status IS
    'How far the work got; `released`: the grade is the learner''s, `passed` says how it ended.';

-- The previous release's `state`, kept equal to `status` + `passed` while it runs.
CREATE FUNCTION activity_progress_status() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.status IS NULL)
       OR (TG_OP = 'UPDATE' AND NEW.state IS DISTINCT FROM OLD.state AND NEW.status IS NOT DISTINCT FROM OLD.status) THEN
        NEW.status := CASE WHEN NEW.state IN ('passed', 'failed') THEN 'released' ELSE NEW.state END;
    ELSE
        NEW.state := CASE WHEN NEW.status <> 'released' THEN NEW.status
                          WHEN NEW.passed THEN 'passed' ELSE 'failed' END;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER activity_progress_status BEFORE INSERT OR UPDATE ON activity_progress
    FOR EACH ROW EXECUTE FUNCTION activity_progress_status();
