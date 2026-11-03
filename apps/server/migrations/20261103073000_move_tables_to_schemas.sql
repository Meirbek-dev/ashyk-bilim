-- contract: the app's tables leave `public` for their schemas (schema review 43). A release after
-- 20261102090000: a session keeps the search_path it started with, so every running server and worker must
-- already set the schemas on its path (that release does; the release before it does not). The last file of
-- the set: tables that earlier files (contract ones included) created unqualified in `public` move too.
--
-- ALTER TABLE ... SET SCHEMA changes only the catalog (no rewrite), but takes each table's ACCESS EXCLUSIVE
-- lock until commit: a long transaction on any table stops it at lock_timeout (nothing moved; run migrate again).

SET LOCAL lock_timeout = '5s';

SELECT place_app_tables();

-- The retention function names its table: it now lives in ops.
CREATE OR REPLACE FUNCTION prune_auth_audit_log(days integer, batch integer) RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, ops, pg_temp AS $$
    WITH gone AS (
        DELETE FROM ops.auth_audit_log WHERE id IN (
            SELECT id FROM ops.auth_audit_log
            WHERE created_at < now() - make_interval(days => greatest(days, 30))
            LIMIT least(greatest(batch, 1), 10000))
        RETURNING 1)
    SELECT count(*) FROM gone
$$;

-- Functions the contract files created: the app's path with pg_temp last, as 20261102091000 gave the others.
SELECT pin_function_search_paths();
