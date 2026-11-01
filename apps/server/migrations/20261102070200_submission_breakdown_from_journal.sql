SET LOCAL lock_timeout = '5s';

-- One current grade, rest (schema review 2 item 8, REWRITE 5.6 n16): the
-- breakdown of a graded submission is its latest grading_entries row's
-- effective_breakdown; submissions.grading only repeated it. What the column
-- held beyond the journal is the hand-in's own auto breakdown of work that
-- waits for a teacher (no entry yet): that is a fact of the hand-in, like
-- auto_score, and moves to submissions.auto_breakdown.
--
-- The server reads submission_breakdown(id, auto_breakdown) and never names
-- `grading`; the contract migration (20261103070100) drops it. Until then
-- triggers keep it what the previous release expects: the hand-in breakdown at
-- the hand-in, the latest entry's effective breakdown after every entry.

ALTER TABLE submissions ADD COLUMN auto_breakdown jsonb
    CHECK (auto_breakdown IS NULL OR jsonb_typeof(auto_breakdown) = 'object');

COMMENT ON COLUMN submissions.auto_breakdown IS
    'The auto-grader''s breakdown written at hand-in (NULL for a draft); the current breakdown is the latest grading entry''s, this one only while there is none.';

-- A new column filled in, not an edit of the work: keep updated_at.
SET LOCAL ab.bookkeeping = 'on';

-- Backfill: a handed-in row's breakdown as the hand-in left it. A graded row's
-- first entry starts from it (raw_breakdown of the first save); a row without
-- entries still holds it in grading.
UPDATE submissions s
SET auto_breakdown = COALESCE(
        (SELECT e.raw_breakdown FROM grading_entries e
         WHERE e.submission_id = s.id ORDER BY e.id LIMIT 1),
        s.grading)
WHERE s.status <> 'draft';

CREATE FUNCTION submission_breakdown(p_submission uuid, p_auto_breakdown jsonb) RETURNS jsonb
LANGUAGE sql STABLE PARALLEL SAFE
RETURN COALESCE(
    (SELECT e.effective_breakdown FROM grading_entries e
     WHERE e.submission_id = p_submission ORDER BY e.id DESC LIMIT 1),
    p_auto_breakdown,
    '{}'::jsonb);

COMMENT ON FUNCTION submission_breakdown(uuid, jsonb) IS
    'A submission''s current grading breakdown: its latest grade entry''s effective_breakdown, else the hand-in''s auto_breakdown, else {}.';

-- The hand-in: the server writes auto_breakdown, the previous release grading.
-- Each side gets the other's value.
CREATE FUNCTION submissions_hand_in_breakdown() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.auto_breakdown IS NULL THEN
        NEW.auto_breakdown := NEW.grading;
    ELSE
        NEW.grading := NEW.auto_breakdown;
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER submissions_hand_in_breakdown_insert BEFORE INSERT ON submissions
    FOR EACH ROW WHEN (NEW.status <> 'draft')
    EXECUTE FUNCTION submissions_hand_in_breakdown();
CREATE TRIGGER submissions_hand_in_breakdown_update BEFORE UPDATE OF status ON submissions
    FOR EACH ROW WHEN (OLD.status = 'draft' AND NEW.status <> 'draft')
    EXECUTE FUNCTION submissions_hand_in_breakdown();

-- Every entry: the previous release reads the breakdown from the row.
CREATE FUNCTION grading_entries_mirror_breakdown() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE submissions SET grading = NEW.effective_breakdown
    WHERE id = NEW.submission_id AND grading IS DISTINCT FROM NEW.effective_breakdown;
    RETURN NULL;
END
$$;

CREATE TRIGGER grading_entries_mirror_breakdown AFTER INSERT ON grading_entries
    FOR EACH ROW EXECUTE FUNCTION grading_entries_mirror_breakdown();

COMMENT ON FUNCTION submissions_hand_in_breakdown() IS
    'Expand step of 20261102070200: auto_breakdown and grading agree at a hand-in; dropped by 20261103070100.';
COMMENT ON FUNCTION grading_entries_mirror_breakdown() IS
    'Expand step of 20261102070200: submissions.grading follows the latest entry; dropped by 20261103070100.';
