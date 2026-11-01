-- Move pgvector from public into the extensions schema (schema review 43; RUNBOOK 2.6). NOT applied anywhere yet:
-- a superuser step for a window with server and worker stopped, per database:
--   psql -v ON_ERROR_STOP=1 -d <database> -f vector-to-extensions.sql     (ashyq, then template1, test databases)
-- Columns keep their type (types are referenced by OID, no table is rewritten); SQL that names `vector`, its
-- operators (<=>) or functions unqualified resolves them through search_path, which the roles get here. Sessions
-- opened before keep the old path and fail on such SQL: start server and worker only afterwards. Idempotent;
-- infra/tests/db-roles.sh rehearses it.
\set ON_ERROR_STOP on
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO PUBLIC;
-- Role-level, so every database of the cluster (tests clone template1) sees the same path. A role setting
-- overrides the database one of migration 20261102090000: it is the same path (ab_db::SEARCH_PATH), app
-- schemas included (schema review 43).
SELECT format('ALTER ROLE %I SET search_path = public, core, learning, ai, analytics, ops, extensions', rolname)
FROM pg_roles WHERE rolname IN ('ashyq', 'ashyq_app', 'ashyq_ro') \gexec
SELECT 'ALTER EXTENSION vector SET SCHEMA extensions'
FROM pg_extension WHERE extname = 'vector' AND extnamespace <> 'extensions'::regnamespace \gexec
SELECT format('vector-to-extensions: %s has vector %s in schema %s', current_database(), extversion,
              extnamespace::regnamespace)
FROM pg_extension WHERE extname = 'vector';
