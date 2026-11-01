#!/bin/sh
# The db-init job (compose.yaml), as the bootstrap superuser (PGHOST/PGUSER/PGPASSWORD): roles and databases
# (init.sql), then the least-privilege roles and grants (roles.sql) on template1 - inherited by every database
# created later - and on each database of ASHYQ_DATABASES. Zitadel's role and database go where ZITADEL_DB_HOST
# (default db = PGHOST) says. Idempotent; infra/tests/db-roles.sh runs it too.
set -eu
dir=$(dirname "$0")
zhost=${ZITADEL_DB_HOST:-db}
zitadel_here=false
[ "$zhost" != db ] || zitadel_here=true
psql -v ON_ERROR_STOP=1 \
  -v ashyq_password="$ASHYQ_DB_PASSWORD" -v zitadel_password="$ZITADEL_DB_PASSWORD" \
  -v databases="$ASHYQ_DATABASES" -v createdb="${ASHYQ_DB_CREATEDB:-false}" -v zitadel_here="$zitadel_here" \
  -f "$dir/init.sql"
if [ "$zhost" != db ]; then
  psql -h "$zhost" -q -v ON_ERROR_STOP=1 -v zitadel_password="$ZITADEL_DB_PASSWORD" -f "$dir/zitadel-db.sql"
fi
for d in template1 $(echo "$ASHYQ_DATABASES" | tr ',' ' '); do
  # The (still empty) extensions schema of init.sql, also in databases created before it (RUNBOOK 2.6).
  psql -q -v ON_ERROR_STOP=1 -d "$d" -c 'CREATE SCHEMA IF NOT EXISTS extensions' -c 'GRANT USAGE ON SCHEMA extensions TO PUBLIC'
  psql -q -v ON_ERROR_STOP=1 -d "$d" -v owner=ashyq \
    -v app_password="${ASHYQ_APP_DB_PASSWORD:-}" -v ro_password="${ASHYQ_RO_DB_PASSWORD:-}" -f "$dir/roles.sql"
done
