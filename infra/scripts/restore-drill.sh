#!/usr/bin/env bash
# Restore drill: restore.sh into the throwaway project ashyq-drill (prod files, the
# archive's own secrets, plain http on alternate ports, no Judge0), print row counts
# and elapsed time, tear everything down.
#   restore-drill.sh [snapshot]     restic snapshot in ${BACKUP_DIR}/restic, default latest
#   restore-drill.sh <backup-*.tar.zst>   legacy offen archive
# IMAGE_TAG comes from the archived .env unless set in the shell.
# RESTORE_DIR scratch space (default ${TMPDIR:-/tmp}/ashyq-restore); DRILL_HTTP_PORT (18080).
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"

src=${1:-latest}
if [[ $src == *.tar.zst ]]; then
  [[ -f $src ]] || die "no such archive: $src"
  src="$(cd "$(dirname "$src")" && pwd)/$(basename "$src")"
else
  # The repository of the current stack; restore.sh inherits it after the env is re-pointed below.
  restic_env
fi
start=$SECONDS

work=${RESTORE_DIR:-${TMPDIR:-/tmp}/ashyq-restore}/drill
rm -rf "$work"
mkdir -p "$work/certs" "$work/acme" "$work/backups"
if [[ $src == *.tar.zst ]]; then
  "$CTR" run --rm -i "$PG_IMAGE" zstd -dc <"$src" | tar -xf - --no-anchored -C "$work" backup/secrets
else
  restic_run -v "$work:/out" -- restore "$src" --target /out --include /backup/secrets
  "$CTR" run --rm -v "$work:/out" --entrypoint chown "$RESTIC_IMAGE" -R "$(id -u):$(id -g)" /out
fi
cp "$work/backup/secrets/server.env" "$work/server.env"
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=drill \
  -keyout "$work/certs/key.pem" -out "$work/certs/cert.pem" 2>/dev/null

export STACK=prod COMPOSE_PROJECT_NAME=ashyq-drill COMPOSE_PROFILES=
export COMPOSE_ENV_FILES=$work/backup/secrets/.env STACK_ENV_FILE=$work/backup/secrets/.env
export SERVER_ENV_FILE=$work/server.env
export PUBLIC_SCHEME=http FORCE_HTTPS=0 HTTP_PORT=${DRILL_HTTP_PORT:-18080} HTTPS_PORT=${DRILL_HTTPS_PORT:-18443}
export TLS_DIR=$work/certs ACME_WEBROOT=$work/acme
# Archived production paths must never be mounted by the throwaway stack.
export RUSTFS_DATA_DIR=rustfs_data BACKUP_DIR=$work/backups
domain=$(sed -n 's/^NGINX_SERVER_NAME=//p' "$COMPOSE_ENV_FILES" | tail -n 1)
export NGINX_SERVER_NAME=$domain
export SMOKE_ORIGIN=http://$domain:$HTTP_PORT

use_prod
trap 'log "tearing down"; compose down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

bash "$ROOT/infra/scripts/restore.sh" "$src"

count() { compose exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d ashyq -tAc 'SELECT count(*) FROM $1'"; }
log "users:   $(count users)"
log "courses: $(count courses)"
[[ $(count users) -gt 0 && $(count courses) -gt 0 ]] || die "restored database has no users or courses"
if [[ -n ${EXPECTED_RESTORE_MANIFEST:-} ]]; then
  actual=$ROOT/tmp/restore-test/actual.manifest
  compose exec -T db sh -c 'psql -XAtq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ashyq' \
    <"$ROOT/infra/tests/restore-manifest.sql" >"$actual"
  diff -u "$EXPECTED_RESTORE_MANIFEST" "$actual" || die "restored user data differs from the source"
fi
if [[ -n ${RESTORE_OBJECT_KEY:-} ]]; then
  hash=$(curl -fsS --resolve "$domain:$HTTP_PORT:127.0.0.1" \
    "$SMOKE_ORIGIN/content/$RESTORE_OBJECT_KEY" | sha256sum | cut -d' ' -f1)
  [[ $hash == "${RESTORE_OBJECT_SHA256:?expected object hash required}" ]] || die "restored object bytes differ"
fi
if [[ -n ${RESTORE_TEST_PASSWORD:-} ]]; then
  login_status=$(node -e 'process.stdout.write(JSON.stringify({login:"e2e-student1",password:process.env.RESTORE_TEST_PASSWORD}))' |
    curl -fsS --resolve "$domain:$HTTP_PORT:127.0.0.1" -H 'Content-Type: application/json' \
      --data-binary @- -o "$work/login-response.json" -w '%{http_code}' "$SMOKE_ORIGIN/api/v2/auth/login")
  [[ $login_status == 200 ]] || die "restored learner sign-in returned HTTP $login_status"
  log "restored learner sign-in ok"
fi
log "drill passed in $((SECONDS - start)) s (restore + start + smoke)"
