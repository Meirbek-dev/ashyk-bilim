SET LOCAL lock_timeout = '5s';

-- Schema review 3, item 24: a check that existing rows violate stays on the
-- table as NOT VALID instead of being dropped. Postgres then checks every
-- new row and every updated row against it, so the violation cannot spread;
-- only the old rows are exempt until repaired. The price: an UPDATE of a
-- still-violating old row is refused too (repair those rows first, RUNBOOK
-- 2.4). The check is recorded in schema_skipped_checks as before; calling
-- schema_try_check again after the repair validates the existing constraint
-- and removes the row.

CREATE OR REPLACE FUNCTION schema_try_check(p_table regclass, p_name text, p_expr text) RETURNS boolean
    LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = p_table AND c.conname = p_name) THEN
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%s) NOT VALID', p_table, p_name, p_expr);
    END IF;
    BEGIN
        EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', p_table, p_name);
    EXCEPTION WHEN check_violation THEN
        INSERT INTO schema_skipped_checks AS s (name, table_name, expr)
        VALUES (p_name, p_table::text, p_expr)
        ON CONFLICT ON CONSTRAINT schema_skipped_checks_pkey
        DO UPDATE SET expr = EXCLUDED.expr, skipped_at = now();
        RAISE WARNING 'schema_try_check: % kept NOT VALID, existing rows violate %', p_name, p_expr;
        RETURN false;
    END;
    DELETE FROM schema_skipped_checks s WHERE s.name = p_name;
    RETURN true;
END $$;

COMMENT ON FUNCTION schema_try_check(regclass, text, text) IS
    'Add a CHECK NOT VALID and validate it; when existing rows violate it, keep it NOT VALID (new and updated rows are checked) and record it in schema_skipped_checks. Migrations only.';
COMMENT ON TABLE schema_skipped_checks IS
    'Checks kept NOT VALID because existing rows violate them (RUNBOOK 2.4); a row goes when the check validates.';

-- Checks an earlier release skipped (dropped) come back as NOT VALID. One
-- that cannot be re-added (its table or column changed since) stays
-- recorded with a WARNING.
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
