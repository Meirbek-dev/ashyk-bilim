-- One touch trigger (REWRITE 5.6 n13): touch_row() replaces each table's set_updated_at + bump_version pair,
-- whose effect hung on the order of their names. It bumps `version` first, from the row as every other BEFORE
-- trigger left it (when the table's trigger says 'version' and the caller did not set it), then sets
-- `updated_at` unless `ab.bookkeeping` is on. Further arguments name the columns whose change bumps the
-- version (course_discussions: content and status, as its column-scoped trigger did); without them any change
-- does. Behaviour is the pair's, so the previous release runs on it unchanged.
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION touch_row() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    changed boolean := false;
BEGIN
    IF TG_ARGV[0] = 'version' THEN
        IF NEW.version = OLD.version THEN
            IF TG_NARGS = 1 THEN
                changed := NEW IS DISTINCT FROM OLD;
            ELSE
                FOR i IN 1 .. TG_NARGS - 1 LOOP
                    changed := changed
                        OR to_jsonb(NEW) -> TG_ARGV[i] IS DISTINCT FROM to_jsonb(OLD) -> TG_ARGV[i];
                END LOOP;
            END IF;
            IF changed THEN
                NEW.version := OLD.version + 1;
            END IF;
        END IF;
    END IF;
    IF current_setting('ab.bookkeeping', true) IS DISTINCT FROM 'on' THEN
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END $$;

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT t.tgrelid::regclass AS tbl, c.relname,
               array_agg(t.tgname) AS old_triggers,
               bool_or(p.proname = 'bump_version') AS versioned,
               (SELECT string_agg(format(', %L', a.attname), '' ORDER BY a.attnum)
                FROM pg_trigger b JOIN pg_proc bp ON bp.oid = b.tgfoid
                JOIN pg_attribute a ON a.attrelid = b.tgrelid AND a.attnum = ANY (b.tgattr)
                WHERE b.tgrelid = t.tgrelid AND bp.proname = 'bump_version') AS columns
        FROM pg_trigger t
        JOIN pg_proc p ON p.oid = t.tgfoid
        JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND p.proname IN ('set_updated_at', 'bump_version')
        GROUP BY t.tgrelid, c.relname
    LOOP
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION touch_row(%s)',
                       r.relname || '_touch', r.tbl,
                       CASE WHEN r.versioned THEN '''version''' || coalesce(r.columns, '') ELSE '' END);
        FOR i IN 1 .. cardinality(r.old_triggers) LOOP
            EXECUTE format('DROP TRIGGER %I ON %s', r.old_triggers[i], r.tbl);
        END LOOP;
    END LOOP;
END $$;

DROP FUNCTION set_updated_at();
DROP FUNCTION bump_version();
