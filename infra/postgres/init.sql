-- Roles and databases, run by the db-init job as the bootstrap superuser:
--   psql -v ashyq_password=.. -v zitadel_password=.. -v databases=ashyq[,..] -v createdb=true|false -f init.sql
-- Idempotent and additive only: existing roles and databases are left as they are
-- (prod: `ashyq` and `zitadel` exist, owned by the legacy superuser `openu`).
-- Object ownership hand-over is a separate, rehearsed step: transfer-ownership.sql.

-- pgvector is not a trusted extension: the app role cannot create it. Installing it
-- in template1 gives it to every database created later, including the per-test
-- databases of #[sqlx::test]; the migration's CREATE EXTENSION IF NOT EXISTS no-ops.
\connect template1
CREATE EXTENSION IF NOT EXISTS vector;
\connect postgres

SELECT format('CREATE ROLE ashyq LOGIN PASSWORD %L', :'ashyq_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ashyq') \gexec

-- Dev only: #[sqlx::test] creates a database per test.
SELECT 'ALTER ROLE ashyq CREATEDB'
WHERE :'createdb'::boolean
  AND NOT (SELECT rolcreatedb FROM pg_roles WHERE rolname = 'ashyq') \gexec

SELECT format('CREATE ROLE zitadel LOGIN PASSWORD %L', :'zitadel_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'zitadel') \gexec

SELECT format('CREATE DATABASE %I OWNER ashyq', btrim(d))
FROM unnest(string_to_array(:'databases', ',')) AS d
WHERE btrim(d) <> ''
  AND NOT EXISTS (SELECT FROM pg_database WHERE datname = btrim(d)) \gexec

SELECT 'CREATE DATABASE zitadel OWNER zitadel'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'zitadel') \gexec
