-- Zitadel's role and database in its own instance (zitadel-db), as the superuser; db-init runs it when
-- ZITADEL_DB_HOST=zitadel-db, zitadel-db-move.sh and restore.sh before loading a dump:
--   psql -h zitadel-db -v zitadel_password=.. -f zitadel-db.sql
-- Idempotent: an existing role keeps its password, an existing database is left as it is.
\set ON_ERROR_STOP on
SELECT format('CREATE ROLE zitadel LOGIN PASSWORD %L', :'zitadel_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'zitadel') \gexec
SELECT 'CREATE DATABASE zitadel OWNER zitadel'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'zitadel') \gexec
