-- Row count of every table of the connected database, one "schema.table count" line each, sorted:
-- infra/scripts/zitadel-db-move.sh compares the source and the copy. Partitions count, their parents do not.
SELECT format('SELECT %L || '' '' || count(*) FROM %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\_toast%'
ORDER BY n.nspname, c.relname \gexec
