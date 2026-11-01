-- The worker creates next months' analytics_events partitions and drops expired ones (lane C,
-- 20261102030401). Once it connects as ashyq_app (RUNBOOK 2.5) it has no DDL: both functions run
-- as their owner, the migration role, so the partitions are the owner's and default privileges
-- give the app their rows. Only the app may call them (apply_role_grants grants EXECUTE on every
-- SECURITY DEFINER function).

SET LOCAL lock_timeout = '5s';

ALTER FUNCTION analytics_events_ensure_partitions(integer)
    SECURITY DEFINER SET search_path = pg_catalog, public;
ALTER FUNCTION analytics_events_drop_partitions(timestamptz)
    SECURITY DEFINER SET search_path = pg_catalog, public;
REVOKE EXECUTE ON FUNCTION analytics_events_ensure_partitions(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_events_drop_partitions(timestamptz) FROM PUBLIC;

SELECT apply_role_grants(current_user);
