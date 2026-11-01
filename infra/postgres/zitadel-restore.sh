#!/bin/sh
# Load a zitadel dump (pg_dump -Fc of db's or zitadel-db's zitadel database) into Zitadel's own instance, as the
# superuser in a one-off db-init container (zitadel-db-move.sh, restore.sh):
#   zitadel-restore.sh <host> <dump file>
# Role and an empty database first (zitadel-db.sql), then every object as the zitadel role: the source's owners
# and grants (legacy cs_mooc, the app instance's roles) do not exist there. Extensions are skipped: db's template1
# carries pgvector, which Zitadel never uses and only a superuser could create.
set -eu
host=$1
dump=$2
psql -h "$host" -q -v ON_ERROR_STOP=1 -v zitadel_password="$ZITADEL_DB_PASSWORD" -f "$(dirname "$0")/zitadel-db.sql"
list=$(mktemp)
pg_restore -l "$dump" | grep -v -e ' EXTENSION - ' -e ' COMMENT - EXTENSION ' >"$list"
pg_restore -h "$host" -d zitadel --no-owner --no-acl --role=zitadel --exit-on-error -L "$list" "$dump"
rm -f "$list"
