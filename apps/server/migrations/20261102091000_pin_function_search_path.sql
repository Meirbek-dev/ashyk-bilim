-- Every plpgsql function of the app runs with the app's search_path and pg_temp last (schema review of
-- the roles, 2026-11-02). Without a pinned path a function resolves its unqualified tables through the
-- caller's path, where pg_temp comes first: ashyq_app could create a TEMP table named like the one a
-- trigger checks (grading_entries for the grade-matches-journal guard) and pass the check with rows of
-- its own. The path is the session's (app_search_path), so nothing else a function finds changes.
-- A function created later gets `SET search_path` itself; schema_review.rs fails on one that does not,
-- and the last migration of a release may call pin_function_search_paths() again.

SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pin_function_search_paths() RETURNS integer
LANGUAGE plpgsql SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    f regprocedure;
    pinned integer := 0;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure FROM pg_proc p
        JOIN pg_language l ON l.oid = p.prolang
        WHERE p.pronamespace::regnamespace::name = ANY (ARRAY['public']::name[] || app_schemas())
          AND l.lanname = 'plpgsql'
          AND pg_has_role(p.proowner, 'USAGE')
          AND NOT EXISTS (SELECT FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%')
          -- ensure_app_search_path sets the caller's path: a pinned one would be restored on return
          AND p.prosrc NOT LIKE '%search\_path%'
          AND NOT EXISTS (SELECT FROM pg_depend d
                          WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = %s, pg_temp', f, app_search_path());
        pinned := pinned + 1;
    END LOOP;
    RETURN pinned;
END
$$;

SELECT pin_function_search_paths();
