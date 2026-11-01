-- Least-privilege roles of the app database, run by db-init as the superuser on template1 and on every
-- database of ASHYQ_DATABASES (RUNBOOK 2.5):
--   psql -v ON_ERROR_STOP=1 -v app_password=.. -v ro_password=.. -v owner=ashyq -d <db> -f roles.sql
--
--   owner (`ashyq`)   migrations (server-migrate): owns every object, the only role that runs DDL.
--   ashyq_app         server + worker: rows only, no DDL; insert-only grade/audit journals.
--   ashyq_ro          agents (`just db sql`), analytics, ad-hoc psql: read-only, no secrets or contact data.
--
-- What each role may touch is schema: apply_role_grants(owner) from migration 20261102050200, re-run here.
-- A database without it (template1, a database not migrated yet) gets the default privileges only: new
-- tables of the owner are readable/writable, and the migration that creates the function applies the rest.
-- Idempotent: a missing role is created with the given password (an existing role keeps its password,
-- RUNBOOK 3.8); settings and grants are re-applied on every run. Without passwords (a host whose .env
-- predates the roles) and no roles yet, it does nothing.
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE ashyq_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ashyq_app') AND :'app_password' <> '' \gexec
SELECT format('CREATE ROLE ashyq_ro LOGIN PASSWORD %L', :'ro_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ashyq_ro') AND :'ro_password' <> '' \gexec

SELECT count(*) = 2 AS have_roles FROM pg_roles WHERE rolname IN ('ashyq_app', 'ashyq_ro') \gset
\if :have_roles
\else
  \echo 'roles.sql: ashyq_app/ashyq_ro not created (ASHYQ_APP_DB_PASSWORD/ASHYQ_RO_DB_PASSWORD unset): skipped'
  \quit
\endif

-- Timeouts: a request gives up at 30 s, but jobs (analytics rollup, retention, reconciliation) run
-- longer statements; 2 min bounds a runaway query without cutting those. An idle transaction holds
-- locks and blocks vacuum: 1 min is far past any code path's think time.
ALTER ROLE ashyq_app SET statement_timeout = '120s';
ALTER ROLE ashyq_app SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE ashyq_app SET lock_timeout = '30s';
ALTER ROLE ashyq_ro SET statement_timeout = '30s';
ALTER ROLE ashyq_ro SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE ashyq_ro SET default_transaction_read_only = on;

BEGIN;
SELECT format('GRANT CONNECT ON DATABASE %I TO ashyq_app, ashyq_ro', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO ashyq_app, ashyq_ro;
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
                 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ashyq_app', :'owner') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
                 GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ashyq_app', :'owner') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
                 GRANT SELECT ON TABLES TO ashyq_ro', :'owner') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
                 GRANT SELECT ON SEQUENCES TO ashyq_ro', :'owner') \gexec
SELECT format('SELECT apply_role_grants(%L)', :'owner')
WHERE to_regprocedure('public.apply_role_grants(name)') IS NOT NULL \gexec
COMMIT;
