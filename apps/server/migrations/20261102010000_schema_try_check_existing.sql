SET LOCAL lock_timeout = '5s';

-- schema_try_check also takes a check that is already on the table: it validates it (a repair migration calls
-- it again, RUNBOOK 2.4). A check that existing rows violate is still dropped again and recorded in
-- schema_skipped_checks, as since 20261101220200: kept NOT VALID it would refuse every later UPDATE of such a
-- row, the backfills of this very release included (schema review 3 item 24 tried that; the release review of
-- 2026-11-02 reverted it: a legacy course's learnings failed the upload_references backfill).

CREATE OR REPLACE FUNCTION schema_try_check(p_table regclass, p_name text, p_expr text) RETURNS boolean
    LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = p_table AND c.conname = p_name) THEN
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%s) NOT VALID', p_table, p_name, p_expr);
    END IF;
    BEGIN
        EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', p_table, p_name);
    EXCEPTION WHEN check_violation THEN
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, p_name);
        INSERT INTO schema_skipped_checks AS s (name, table_name, expr)
        VALUES (p_name, p_table::text, p_expr)
        ON CONFLICT ON CONSTRAINT schema_skipped_checks_pkey
        DO UPDATE SET expr = EXCLUDED.expr, skipped_at = now();
        RAISE WARNING 'schema_try_check: % skipped, existing rows violate %', p_name, p_expr;
        RETURN false;
    END;
    DELETE FROM schema_skipped_checks s WHERE s.name = p_name;
    RETURN true;
END $$;

COMMENT ON FUNCTION schema_try_check(regclass, text, text) IS
    'Add a CHECK (or take the existing one) and validate it; when existing rows violate it, drop it and record it in schema_skipped_checks. Migrations only.';
COMMENT ON TABLE schema_skipped_checks IS
    'Checks not on their table because existing rows violate them (RUNBOOK 2.4); a row goes when the check is added.';

-- Checks an earlier release skipped are tried again: added where the rows were repaired since, recorded
-- again otherwise. One that cannot be added (its table or column changed since) stays recorded with a WARNING.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT s.name, s.table_name, s.expr FROM schema_skipped_checks s ORDER BY s.name LOOP
        IF to_regclass(r.table_name) IS NULL THEN
            RAISE WARNING 'schema_try_check: % not re-added, table % is gone', r.name, r.table_name;
            CONTINUE;
        END IF;
        BEGIN
            PERFORM schema_try_check(to_regclass(r.table_name), r.name, r.expr);
        EXCEPTION WHEN lock_not_available THEN
            RAISE;
        WHEN OTHERS THEN
            RAISE WARNING 'schema_try_check: % not re-added: %', r.name, SQLERRM;
        END;
    END LOOP;
END $$;
