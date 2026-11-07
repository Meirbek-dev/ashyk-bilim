-- A foreign key on existing rows, the way schema_try_check adds a CHECK (database review 2026-11-07).
--
-- NOT VALID enforces new and changed rows at once and never fails the deploy; VALIDATE then proves the old rows.
-- When old rows violate it the key stays NOT VALID (unlike a CHECK it refuses nothing a regrade of such a row
-- writes, because only a change of the key's columns is checked) and `just prod-report` lists it through
-- schema_skipped_checks until they are repaired.

SET LOCAL lock_timeout = '5s';

CREATE FUNCTION schema_try_fk(p_table regclass, p_name text, p_definition text) RETURNS boolean
    LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = p_table AND c.conname = p_name) THEN
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s NOT VALID', p_table, p_name, p_definition);
    END IF;
    BEGIN
        EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', p_table, p_name);
    EXCEPTION WHEN foreign_key_violation THEN
        INSERT INTO schema_skipped_checks AS s (name, table_name, expr)
        VALUES (p_name, p_table::text, p_definition)
        ON CONFLICT ON CONSTRAINT schema_skipped_checks_pkey
        DO UPDATE SET expr = EXCLUDED.expr, skipped_at = now();
        RAISE WARNING 'schema_try_fk: % stays NOT VALID, existing rows violate it', p_name;
        RETURN false;
    END;
    DELETE FROM schema_skipped_checks s WHERE s.name = p_name;
    RETURN true;
END $$;

COMMENT ON FUNCTION schema_try_fk(regclass, text, text) IS
    'Add a foreign key and validate it; when existing rows violate it, keep it NOT VALID and record it in schema_skipped_checks.';
