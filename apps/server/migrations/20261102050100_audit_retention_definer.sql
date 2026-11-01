-- Retention of the audit journal as its owner (schema review 2 §5.7 n6, item 42).
--
-- The app role (ashyq_app, infra/postgres/roles.sql) may append to auth_audit_log but not delete from it:
-- a mistaken or injected statement cannot erase the security trail. The daily retention sweep deletes
-- through this function instead, which runs with its owner's rights and can only remove rows older than
-- the window it is given (at least 30 days), in one bounded batch.

SET LOCAL lock_timeout = '5s';

CREATE FUNCTION prune_auth_audit_log(days integer, batch integer) RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    WITH gone AS (
        DELETE FROM public.auth_audit_log WHERE id IN (
            SELECT id FROM public.auth_audit_log
            WHERE created_at < now() - make_interval(days => greatest(days, 30))
            LIMIT least(greatest(batch, 1), 10000))
        RETURNING 1)
    SELECT count(*) FROM gone
$$;

-- Only the app role calls it: apply_role_grants (next migration) grants it to ashyq_app.
REVOKE EXECUTE ON FUNCTION prune_auth_audit_log(integer, integer) FROM PUBLIC;
