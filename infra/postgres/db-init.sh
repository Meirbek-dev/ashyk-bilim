#!/bin/sh
# The db-init job (compose.yaml), as the bootstrap superuser (PGHOST/PGUSER/PGPASSWORD): roles and databases
# (init.sql), then the least-privilege roles and grants (roles.sql) on template1 - inherited by every database
# created later - and on each database of ASHYQ_DATABASES. Idempotent; infra/tests/db-roles.sh runs it too.
set -eu
dir=$(dirname "$0")
psql -v ON_ERROR_STOP=1 \
  -v ashyq_password="$ASHYQ_DB_PASSWORD" -v zitadel_password="$ZITADEL_DB_PASSWORD" \
  -v databases="$ASHYQ_DATABASES" -v createdb="${ASHYQ_DB_CREATEDB:-false}" -f "$dir/init.sql"
for d in template1 $(echo "$ASHYQ_DATABASES" | tr ',' ' '); do
  psql -q -v ON_ERROR_STOP=1 -d "$d" -v owner=ashyq \
    -v app_password="${ASHYQ_APP_DB_PASSWORD:-}" -v ro_password="${ASHYQ_RO_DB_PASSWORD:-}" -f "$dir/roles.sql"
done
