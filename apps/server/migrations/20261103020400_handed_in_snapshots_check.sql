-- contract: the handed-in snapshot guarantee becomes a CHECK (schema review 2, item 9).
--
-- The release before this one writes both snapshots in the hand-in
-- statement itself, so the deferred `submissions_handed_in_snapshots_*`
-- triggers of 20261102020200 (which let the release before that write them
-- a statement later) can become a plain CHECK - when every handed-in row
-- already has them. A legacy row without snapshots (nothing can rebuild
-- them) keeps the deferred triggers instead, which judge only a row that is
-- being handed in, and the CHECK is recorded in schema_skipped_checks
-- (RUNBOOK 2.4) - not added NOT VALID, which would refuse every later
-- update of that row, a regrade included.

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
    expr constant text := $c$status = 'draft' OR (items_snapshot IS NOT NULL AND policy_snapshot IS NOT NULL)$c$;
BEGIN
    IF EXISTS (SELECT 1 FROM submissions
               WHERE status <> 'draft' AND (items_snapshot IS NULL OR policy_snapshot IS NULL)) THEN
        INSERT INTO schema_skipped_checks AS s (name, table_name, expr)
        VALUES ('submissions_handed_in_snapshots_check', 'submissions', expr)
        ON CONFLICT ON CONSTRAINT schema_skipped_checks_pkey
        DO UPDATE SET expr = EXCLUDED.expr, skipped_at = now();
        RAISE WARNING 'submissions_handed_in_snapshots_check skipped: handed-in rows lack snapshots; the deferred triggers stay';
    ELSE
        EXECUTE format('ALTER TABLE submissions ADD CONSTRAINT submissions_handed_in_snapshots_check CHECK (%s)', expr);
        DROP TRIGGER submissions_handed_in_snapshots_insert ON submissions;
        DROP TRIGGER submissions_handed_in_snapshots_update ON submissions;
        DROP FUNCTION submissions_handed_in_snapshots();
    END IF;
END;
$$;
