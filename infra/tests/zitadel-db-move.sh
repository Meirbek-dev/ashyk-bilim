#!/usr/bin/env bash
# Rehearsal of infra/scripts/zitadel-db-move.sh (RUNBOOK 3.15) on a throwaway project of the production files
# (compose.yaml + compose.prod.yaml, smoke's throwaway secrets, no published ports, only the data services and
# Zitadel started): Zitadel set up on db as on a stack from before 2026-11, moved to zitadel-db, back, moved
# again; then a fresh install straight on zitadel-db. After each step the provisioner PAT still authenticates
# (the same instance, not a fresh one on an empty database) and Zitadel's database is where the env file says.
# Removed on exit. `just zitadel-db-move-test` (in ci-infra); needs the Zitadel image, about two minutes.
source "$(dirname "$0")/../scripts/lib.sh"
[[ -n $CTR ]] || die "zitadel-db-move-test: no container runtime"

work=$ROOT/tmp/zitadel-move-check-$$
export STACK=custom COMPOSE_FILE=compose.yaml:compose.prod.yaml COMPOSE_PROJECT_NAME=ashyq-zmove-check-$$
export COMPOSE_ENV_FILES=$work/.env SERVER_ENV_FILE=$work/server.env IMAGE_TAG=rehearsal COMPOSE_PROFILES=
unset ZITADEL_DB_HOST
mkdir -p "$work"
# A stack from before the move: no ZITADEL_DB_HOST. The archives go under the work directory.
grep -v -e '^ZITADEL_DB_HOST=' -e '^BACKUP_DIR=' infra/env/smoke.env >"$COMPOSE_ENV_FILES"
echo "BACKUP_DIR=$work/backups" >>"$COMPOSE_ENV_FILES"
cp infra/env/smoke.server.env "$SERVER_ENV_FILE"
cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  # The archives belong to the containers' postgres user.
  "$CTR" run --rm -v "$work:/w" --entrypoint sh "$PG_IMAGE" -c 'rm -rf /w/backups' >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

project=$COMPOSE_PROJECT_NAME
redis_image=$(sed -n 's/^    image: \(docker.io\/library\/redis:.*\)/\1/p' compose.yaml | head -n 1)
host_of() { "$CTR" inspect "$(compose ps -q zitadel)" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^ZITADEL_DATABASE_POSTGRES_HOST=//p'; }
# shellcheck disable=SC2016 # expanded in the container
dbs() { compose exec -T "$1" sh -c 'psql -U "$POSTGRES_USER" -d postgres -XAtq' <<<"SELECT string_agg(datname, ',' ORDER BY datname)
  FROM pg_database WHERE datname LIKE 'zitadel%'"; }
# The PAT against Zitadel's own API, from a container on the internal network (busybox wget of the redis image).
pat_ok() {
  "$CTR" run --rm --network "${project}_data-net" -e PAT="$pat" --entrypoint sh "$redis_image" -c \
    'wget -q -O - --header "Authorization: Bearer $PAT" http://zitadel:8080/auth/v1/users/me' | grep -q ashyq-provisioner
}
expect() { # expect <step> <zitadel host> <databases in db> <databases in zitadel-db>
  [[ $(host_of) == "$2" ]] || die "zitadel-db-move-test: $1: Zitadel connects to '$(host_of)', want $2"
  [[ $(sed -n 's/^ZITADEL_DB_HOST=//p' "$COMPOSE_ENV_FILES") == "$2" ]] || die "zitadel-db-move-test: $1: env file"
  [[ $(dbs db) =~ ^$3$ ]] || die "zitadel-db-move-test: $1: db has '$(dbs db)', want /$3/"
  [[ $(dbs zitadel-db) =~ ^$4$ ]] || die "zitadel-db-move-test: $1: zitadel-db has '$(dbs zitadel-db)', want /$4/"
  pat_ok || die "zitadel-db-move-test: $1: the provisioner PAT no longer authenticates"
  log "zitadel-db-move-test: $1 ok (Zitadel on $2)"
}

log "zitadel-db-move-test: Zitadel on db (first setup takes a minute)"
compose up -d --wait zitadel >/dev/null 2>&1 || {
  compose logs --tail 30 zitadel zitadel-init db-init >&2
  die "zitadel-db-move-test: the stack did not come up"
}
pat=$("$CTR" run --rm -v "${project}_zitadel_machinekey:/m:ro" "$PG_IMAGE" cat /m/pat.txt)
[[ -n $pat ]] || die "zitadel-db-move-test: no PAT"
[[ $(host_of) == db ]] || die "zitadel-db-move-test: Zitadel does not start on db"
pat_ok || die "zitadel-db-move-test: the PAT does not authenticate before the move"

ZITADEL_MOVE_YES=1 ZITADEL_MOVE_SMOKE=0 bash infra/scripts/zitadel-db-move.sh
expect move zitadel-db 'zitadel_moved_[0-9_]+' zitadel
ZITADEL_MOVE_YES=1 ZITADEL_MOVE_SMOKE=0 bash infra/scripts/zitadel-db-move.sh --back
expect back db zitadel 'zitadel_back_[0-9_]+'
ZITADEL_MOVE_YES=1 ZITADEL_MOVE_SMOKE=0 bash infra/scripts/zitadel-db-move.sh
expect 'move again' zitadel-db 'zitadel_moved_[0-9_]+' 'zitadel,zitadel_back_[0-9_]+'
# A deploy re-runs db-init and zitadel-init: no zitadel database reappears in db, Zitadel stays healthy.
compose up -d --wait zitadel >/dev/null 2>&1 || die "zitadel-db-move-test: re-running the init jobs failed"
expect 'init jobs after the move' zitadel-db 'zitadel_moved_[0-9_]+' 'zitadel,zitadel_back_[0-9_]+'

# A fresh install (prod.env.example, smoke) starts on zitadel-db: db never gets a zitadel database.
compose down -v --remove-orphans >/dev/null 2>&1
log "zitadel-db-move-test: fresh install with ZITADEL_DB_HOST=zitadel-db"
compose up -d --wait zitadel >/dev/null 2>&1 || die "zitadel-db-move-test: a fresh install on zitadel-db failed"
pat=$("$CTR" run --rm -v "${project}_zitadel_machinekey:/m:ro" "$PG_IMAGE" cat /m/pat.txt)
expect 'fresh install' zitadel-db '' zitadel
log "zitadel-db-move-test ok"
