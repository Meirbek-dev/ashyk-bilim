-- Least-privilege roles for the app database (schema review item 30). NOT run by db-init: switching the
-- server to them is an owner decision (QUESTIONS Q-2026-11-01-2, RUNBOOK 2.5). Run as the superuser:
--   psql -v ON_ERROR_STOP=1 -v app_password=.. -v ro_password=.. -v owner=ashyq -d ashyq -f roles.sql
--
--   owner (`ashyq`)   migrations (server-migrate): owns every object, the only role that runs DDL.
--   ashyq_app         server + worker: read/write rows, no DDL, no TRUNCATE, no migration ledger writes.
--   ashyq_ro          analytics, agents, ad-hoc psql: read-only transactions.
--
-- Idempotent: roles are created when missing (an existing role keeps its password, RUNBOOK 3.8), the
-- per-role settings and grants are re-applied. Default privileges follow objects the owner creates
-- later, so a new migration's tables need no extra step - as long as `owner` is the role that runs
-- migrations (prod: only after transfer-ownership.sql, RUNBOOK 2.1).
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE ashyq_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ashyq_app') \gexec
SELECT format('CREATE ROLE ashyq_ro LOGIN PASSWORD %L', :'ro_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ashyq_ro') \gexec

-- Timeouts: a request gives up at 30 s, but jobs (analytics rollup, retention, reconciliation) run
-- longer statements; 2 min bounds a runaway query without cutting those. An idle transaction holds
-- locks and blocks vacuum: 1 min is far past any code path's think time.
ALTER ROLE ashyq_app SET statement_timeout = '120s';
ALTER ROLE ashyq_app SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE ashyq_app SET lock_timeout = '30s';
ALTER ROLE ashyq_ro SET statement_timeout = '30s';
ALTER ROLE ashyq_ro SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE ashyq_ro SET default_transaction_read_only = on;

SELECT format('GRANT CONNECT ON DATABASE %I TO ashyq_app, ashyq_ro', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO ashyq_app, ashyq_ro;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ashyq_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ashyq_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ashyq_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ashyq_ro;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ashyq_ro;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ashyq_ro;
-- The migration ledger is the owner's: the app may read it, never rewrite it.
REVOKE INSERT, UPDATE, DELETE ON TABLE _sqlx_migrations FROM ashyq_app;

SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
                 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ashyq_app', :'owner') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
                 GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ashyq_app', :'owner') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
                 GRANT SELECT ON TABLES TO ashyq_ro', :'owner') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
                 GRANT SELECT ON SEQUENCES TO ashyq_ro', :'owner') \gexec
