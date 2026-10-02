-- Hand every object of the current database to role `ashyq` (spec 5.3, step 4.6).
-- Run as superuser, only after a drill rehearsal, with a fresh pg_dump at hand:
--   psql -v ON_ERROR_STOP=1 -U openu -d ashyq -f transfer-ownership.sql
-- REASSIGN OWNED BY <bootstrap superuser> is refused by PostgreSQL, hence per-object ALTERs.
-- Idempotent: only objects not yet owned by ashyq are touched. One transaction.
-- Not covered (none exist today): extensions (no ALTER EXTENSION .. OWNER; they stay
-- with the superuser), collations, operators, text search objects, publications.
\set ON_ERROR_STOP on
BEGIN;

ALTER DATABASE :"DBNAME" OWNER TO ashyq;

DO $$
DECLARE
  r record;
  ashyq_oid oid := 'ashyq'::regrole;
BEGIN
  -- Schemas (public is owned by pg_database_owner on PG15+; make it explicit).
  FOR r IN
    SELECT n.oid, n.nspname FROM pg_namespace n
    WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
      AND n.nspowner <> ashyq_oid
      AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_namespace'::regclass
                      AND d.objid = n.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER SCHEMA %I OWNER TO ashyq', r.nspname);
  END LOOP;

  -- Relations. Tables first: ALTER TABLE also moves their indexes and the
  -- sequences owned by their columns (serial/identity), which ALTER SEQUENCE refuses.
  FOR r IN
    SELECT c.oid::regclass AS obj,
           CASE c.relkind
             WHEN 'r' THEN 'TABLE' WHEN 'p' THEN 'TABLE'
             WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
             WHEN 'f' THEN 'FOREIGN TABLE' WHEN 'c' THEN 'TYPE'
           END AS kind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'c')
      AND n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
      AND c.relowner <> ashyq_oid
      AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
                      AND d.objid = c.oid AND d.deptype = 'e')
    ORDER BY c.relkind = 'p' DESC, c.relkind
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO ashyq', r.kind, r.obj);
  END LOOP;

  -- Standalone sequences (the column-owned ones moved with their tables above).
  FOR r IN
    SELECT c.oid::regclass AS obj
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S'
      AND n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
      AND c.relowner <> ashyq_oid
      AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
                      AND d.objid = c.oid AND d.deptype IN ('e', 'a', 'i'))
  LOOP
    EXECUTE format('ALTER SEQUENCE %s OWNER TO ashyq', r.obj);
  END LOOP;

  -- Enums, domains, ranges (composite types went with relkind 'c'; array and
  -- multirange types follow their base type).
  FOR r IN
    SELECT t.oid::regtype AS obj, CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END AS kind
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typtype IN ('e', 'd', 'r')
      AND n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
      AND t.typowner <> ashyq_oid
      AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_type'::regclass
                      AND d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO ashyq', r.kind, r.obj);
  END LOOP;

  -- Functions, procedures, aggregates.
  FOR r IN
    SELECT p.oid::regprocedure AS obj
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
      AND p.proowner <> ashyq_oid
      AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass
                      AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO ashyq', r.obj);
  END LOOP;
END
$$;

-- Anything still not owned by ashyq (outside extensions) is listed here; expect 0 rows.
SELECT c.oid::regclass AS not_transferred, c.relkind
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
  AND c.relowner <> 'ashyq'::regrole
  AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
                  AND d.objid = c.oid AND d.deptype = 'e')
  AND c.relkind NOT IN ('i', 'I', 't');

COMMIT;
