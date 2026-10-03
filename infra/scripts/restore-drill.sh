#!/usr/bin/env bash
# Restore drill: restore.sh into the throwaway project ashyq-drill (prod files, the
# archive's own secrets, plain http on alternate ports, no Judge0), print row counts
# and elapsed time, tear everything down.
#   restore-drill.sh [archive]      default: newest ./backups/backup-*.tar.zst
# IMAGE_TAG comes from the archived .env unless set in the shell.
# RESTORE_DIR scratch space (default ${TMPDIR:-/tmp}/ashyq-restore); DRILL_HTTP_PORT (18080).
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"

# shellcheck disable=SC2012 # names are backup-<timestamp>
archive=${1:-$(ls -1t backups/backup-*.tar.zst 2>/dev/null | head -n 1)}
[[ -n $archive && -f $archive ]] || die "no archive given and none in ./backups"
archive="$(cd "$(dirname "$archive")" && pwd)/$(basename "$archive")"
start=$SECONDS

work=${RESTORE_DIR:-${TMPDIR:-/tmp}/ashyq-restore}/drill
rm -rf "$work"
mkdir -p "$work/certs" "$work/acme"
"$CTR" run --rm -i "$PG_IMAGE" zstd -dc <"$archive" | tar -xf - --no-anchored -C "$work" backup/secrets
cp "$work/backup/secrets/server.env" "$work/server.env"
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=drill \
  -keyout "$work/certs/key.pem" -out "$work/certs/cert.pem" 2>/dev/null

export STACK=prod COMPOSE_PROJECT_NAME=ashyq-drill COMPOSE_PROFILES=
export COMPOSE_ENV_FILES=$work/backup/secrets/.env STACK_ENV_FILE=$work/backup/secrets/.env
export SERVER_ENV_FILE=$work/server.env
export PUBLIC_SCHEME=http FORCE_HTTPS=0 HTTP_PORT=${DRILL_HTTP_PORT:-18080} HTTPS_PORT=${DRILL_HTTPS_PORT:-18443}
export TLS_DIR=$work/certs ACME_WEBROOT=$work/acme
domain=$(sed -n 's/^NGINX_SERVER_NAME=//p' "$COMPOSE_ENV_FILES" | tail -n 1)
export SMOKE_ORIGIN=http://$domain:$HTTP_PORT

use_prod
trap 'log "tearing down"; compose down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

bash "$ROOT/infra/scripts/restore.sh" "$archive"

count() { compose exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d ashyq -tAc 'SELECT count(*) FROM $1'"; }
log "users:   $(count users)"
log "courses: $(count courses)"
log "drill passed in $((SECONDS - start)) s (restore + start + smoke)"
