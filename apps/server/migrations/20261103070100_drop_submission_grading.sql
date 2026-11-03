SET LOCAL lock_timeout = '5s';

-- contract: submissions.grading repeated the latest grade entry's breakdown
-- (expand 20261102070200). The expand release reads submission_breakdown()
-- and writes the hand-in's breakdown to auto_breakdown; it never names
-- `grading`. The journal plus submissions.final_score stay the one current
-- grade (schema review 2 item 8).

-- A spelling of the same facts, not an edit of the work: keep updated_at.
SET LOCAL ab.bookkeeping = 'on';

-- Re-run the backfill for hand-ins the release before the expand one wrote.
UPDATE submissions s
SET auto_breakdown = COALESCE(
        (SELECT e.raw_breakdown FROM grading_entries e
         WHERE e.submission_id = s.id ORDER BY e.id LIMIT 1),
        s.grading)
WHERE s.status <> 'draft' AND s.auto_breakdown IS NULL;

-- A row whose stored breakdown is not its latest entry's (a legacy row the
-- current-grade check never re-judged) would lose it here: stop instead.
-- Two differences lose nothing and pass: an item's `user_answer` spelled
-- differently (legacy hand-ins store the tagged `{"kind": ...}` form while
-- their append-only entry keeps the untagged one the API already serves), and
-- a top-level `score_override` that repeats the final score.
DO $$
DECLARE
    drifted bigint;
BEGIN
    WITH current AS (
        SELECT s.final_score, s.grading AS stored,
               submission_breakdown(s.id, s.auto_breakdown) AS journal
        FROM submissions s
        WHERE EXISTS (SELECT 1 FROM grading_entries e WHERE e.submission_id = s.id)
          AND s.grading IS DISTINCT FROM submission_breakdown(s.id, s.auto_breakdown)
    )
    SELECT count(*) INTO drifted FROM current c
    WHERE c.stored IS NOT NULL AND CASE
      WHEN jsonb_typeof(c.stored) <> 'object' OR jsonb_typeof(c.journal) <> 'object' THEN true
      ELSE (c.stored ? 'score_override'
            AND round((c.stored->>'score_override')::numeric, 2) IS DISTINCT FROM c.final_score::numeric)
       OR (c.stored - 'score_override' - 'items')
          || jsonb_build_object('items', (SELECT coalesce(jsonb_agg(it - 'user_answer' ORDER BY ord), '[]')
                                          FROM jsonb_array_elements(CASE jsonb_typeof(c.stored->'items')
                                                   WHEN 'array' THEN c.stored->'items' END)
                                               WITH ORDINALITY AS x (it, ord)))
          IS DISTINCT FROM
          (c.journal - 'score_override' - 'items')
          || jsonb_build_object('items', (SELECT coalesce(jsonb_agg(it - 'user_answer' ORDER BY ord), '[]')
                                          FROM jsonb_array_elements(CASE jsonb_typeof(c.journal->'items')
                                                   WHEN 'array' THEN c.journal->'items' END)
                                               WITH ORDINALITY AS x (it, ord)))
    END;
    IF drifted > 0 THEN
        RAISE EXCEPTION '% submissions hold a breakdown their latest grade entry does not; resolve them before this contract (REWRITE 5.6 n16)', drifted
            USING ERRCODE = 'check_violation';
    END IF;
END
$$;

DROP TRIGGER submissions_hand_in_breakdown_insert ON submissions;
DROP TRIGGER submissions_hand_in_breakdown_update ON submissions;
DROP FUNCTION submissions_hand_in_breakdown();
DROP TRIGGER grading_entries_mirror_breakdown ON grading_entries;
DROP FUNCTION grading_entries_mirror_breakdown();

-- The current-grade check compares the score only; the breakdown has one home.
DROP TRIGGER submissions_current_grade ON submissions;

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
    WHERE submission_id = p_submission ORDER BY id DESC LIMIT 1;
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

ALTER TABLE submissions DROP COLUMN grading;

CREATE CONSTRAINT TRIGGER submissions_current_grade AFTER UPDATE OF final_score ON submissions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (OLD.final_score IS DISTINCT FROM NEW.final_score)
    EXECUTE FUNCTION submissions_current_grade_check();
