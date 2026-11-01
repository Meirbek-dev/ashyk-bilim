-- Roles and databases, run by the db-init job as the bootstrap superuser:
--   psql -v ashyq_password=.. -v zitadel_password=.. -v databases=ashyq[,..] -v createdb=true|false \
--        -v zitadel_here=true|false -f init.sql
-- zitadel_here: Zitadel's role and database belong in this instance (ZITADEL_DB_HOST=db); with its own
-- instance (zitadel-db) they are created there by zitadel-db.sql instead.
-- Idempotent and additive only: existing roles and databases are left as they are
-- (prod: `ashyq` and `zitadel` exist, owned by the legacy superuser `cs_mooc`).
-- Object ownership hand-over is a separate, rehearsed step: transfer-ownership.sql.

-- pgvector is not a trusted extension: the app role cannot create it. Installing it
-- in template1 gives it to every database created later, including the per-test
-- databases of #[sqlx::test]; the migration's CREATE EXTENSION IF NOT EXISTS no-ops.
\connect template1
CREATE EXTENSION IF NOT EXISTS vector;
-- Schema review 43 (preparation): extensions get a schema of their own, out of the app's namespace. Created empty
-- in template1 (every later database) and by db-init.sh in each app database; moving pgvector into it is a
-- superuser step, not done yet (infra/postgres/vector-to-extensions.sql, RUNBOOK 2.6).
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO PUBLIC;
\connect postgres
-- Statement statistics of every database (`just prod-report`), read by the superuser from `postgres`.
-- Needs shared_preload_libraries (the db command); a server started without it skips this.
SELECT 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements'
WHERE current_setting('shared_preload_libraries') ~ 'pg_stat_statements' \gexec

SELECT format('CREATE ROLE ashyq LOGIN PASSWORD %L', :'ashyq_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ashyq') \gexec

-- Dev only: #[sqlx::test] creates a database per test.
SELECT 'ALTER ROLE ashyq CREATEDB'
WHERE :'createdb'::boolean
  AND NOT (SELECT rolcreatedb FROM pg_roles WHERE rolname = 'ashyq') \gexec

SELECT format('CREATE ROLE zitadel LOGIN PASSWORD %L', :'zitadel_password')
WHERE :'zitadel_here'::boolean AND NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'zitadel') \gexec

SELECT format('CREATE DATABASE %I OWNER ashyq', btrim(d))
FROM unnest(string_to_array(:'databases', ',')) AS d
WHERE btrim(d) <> ''
  AND NOT EXISTS (SELECT FROM pg_database WHERE datname = btrim(d)) \gexec

SELECT 'CREATE DATABASE zitadel OWNER zitadel'
WHERE :'zitadel_here'::boolean AND NOT EXISTS (SELECT FROM pg_database WHERE datname = 'zitadel') \gexec
