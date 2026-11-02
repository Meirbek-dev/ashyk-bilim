#!/usr/bin/env bash
# Move Zitadel's database from the app's instance (db) into its own (zitadel-db), RUNBOOK 3.15:
#   zitadel-db-move.sh          STACK=prod by default; `just zitadel-db-move`
#   zitadel-db-move.sh --back   undo: Zitadel on db again, on the copy the move left there (later writes are lost)
# Zitadel is stopped for the copy (sign-in is unavailable for that time; the app keeps serving): pg_dump of db's
# zitadel database, pg_restore into zitadel-db as the zitadel role (infra/postgres/zitadel-restore.sh), every table's
# row count compared, the old database renamed to zitadel_moved_<UTC yyyymmdd_hhmmss> (kept until dropped by hand),
# ZITADEL_DB_HOST=zitadel-db written to the stack's env file, Zitadel started on the copy and smoke run.
# A failure before the switch starts Zitadel on db again; a failure after it runs --back.
# ZITADEL_MOVE_YES=1 skips the question, ZITADEL_MOVE_SMOKE=0 the smoke run (rehearsal: infra/tests/zitadel-db-move.sh).
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"
mode=${1:-move}
[[ $mode == move || $mode == --back ]] || die "usage: zitadel-db-move.sh [--back]"
[[ -z ${ZITADEL_DB_HOST:-} ]] || die "unset ZITADEL_DB_HOST in this shell: the move sets it in the env file"
use_stack
env_file=${COMPOSE_ENV_FILES:-.env}
[[ -f $env_file ]] || die "no env file $env_file"
grep -qx zitadel-db <<<"$(compose config --services)" || die "this stack has no zitadel-db service"
current=$(envval ZITADEL_DB_HOST)
current=${current:-db}
stamp=$(date -u +%Y%m%d_%H%M%S) # part of database names: lower case

# SQL as the superuser in a one-off db-init container (psql 18, /pg mounted, PGUSER/PGPASSWORD, both hosts).
# shellcheck disable=SC2016 # expanded in the container
sql() { compose run --rm --no-deps -T --entrypoint sh db-init -c "$1"; }
q() { sql "psql -h $1 -d ${3:-postgres} -XAtq -v ON_ERROR_STOP=1 -c \"$2\""; }
set_host() {
  local tmp=$env_file.zitadel-move
  # The copy holds every secret of .env: readable by its owner only, like .env.
  (umask 077 && grep -v '^ZITADEL_DB_HOST=' "$env_file" >"$tmp") || true
  printf 'ZITADEL_DB_HOST=%s\n' "$1" >>"$tmp"
  cat "$tmp" >"$env_file" # keep the file's owner and mode
  rm -f "$tmp"
}
start_zitadel() {
  compose up -d --wait --no-deps zitadel
}
smoke() {
  [[ ${ZITADEL_MOVE_SMOKE:-1} != 0 ]] || return 0
  local scheme origin
  scheme=$(envval PUBLIC_SCHEME)
  origin=${SMOKE_ORIGIN:-${scheme:-https}://$(envval NGINX_SERVER_NAME)}
  SMOKE_RESOLVE_IP=${SMOKE_RESOLVE_IP:-127.0.0.1} bash "$ROOT/infra/scripts/smoke.sh" "$origin"
}
confirm() {
  [[ ${ZITADEL_MOVE_YES:-} == 1 ]] && return
  local ok
  read -r -p "$1 Type yes: " ok
  [[ $ok == yes ]] || die "aborted"
}
terminate() { # terminate <host> <database>: no session may hold a database that is renamed
  q "$1" "SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity WHERE datname = '$2' AND pid <> pg_backend_pid()" >/dev/null
}

back() {
  local old
  old=$(q db "SELECT datname FROM pg_database WHERE datname LIKE 'zitadel\_moved\_%' ORDER BY datname DESC LIMIT 1")
  [[ -n $old ]] || die "db has no zitadel_moved_* database to go back to"
  [[ -z $(q db "SELECT 1 FROM pg_database WHERE datname = 'zitadel'") ]] ||
    die "db already has a zitadel database; nothing renamed back"
  log "back: Zitadel on db/$old (renamed to zitadel); writes since the move stay only in zitadel-db"
  compose stop zitadel
  terminate db "$old"
  q db "ALTER DATABASE $old RENAME TO zitadel" >/dev/null
  # The copy is kept, renamed, so a later move starts on an empty zitadel-db.
  if [[ -n $(q zitadel-db "SELECT 1 FROM pg_database WHERE datname = 'zitadel'") ]]; then
    terminate zitadel-db zitadel
    q zitadel-db "ALTER DATABASE zitadel RENAME TO zitadel_back_$stamp" >/dev/null
    log "back: the copy stays in zitadel-db as zitadel_back_$stamp"
  fi
  set_host db
  start_zitadel
  smoke
  log "Zitadel runs on db again"
}

if [[ $mode == --back ]]; then
  [[ $current == zitadel-db ]] || die "$env_file has ZITADEL_DB_HOST=$current: nothing to go back from"
  confirm "Zitadel goes back to the app's db; its writes since the move are lost."
  back
  exit 0
fi

[[ $current == db ]] || die "$env_file already has ZITADEL_DB_HOST=$current"
compose up -d --wait --no-deps db zitadel-db
[[ -n $(q db "SELECT 1 FROM pg_database WHERE datname = 'zitadel'") ]] || die "db has no zitadel database"
if [[ -n $(q zitadel-db "SELECT 1 FROM pg_database WHERE datname = 'zitadel'") ]]; then
  tables=$(q zitadel-db "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema')" zitadel)
  [[ $tables == 0 ]] || die "zitadel-db already has a zitadel database with $tables tables (an earlier attempt?):
    check it, then rename or drop it there (RUNBOOK 3.15)"
fi
size=$(q db "SELECT pg_size_pretty(pg_database_size('zitadel'))")
confirm "Zitadel stops while its database ($size) is copied from db to zitadel-db."

log "stopping Zitadel"
compose stop zitadel
log "copying db/zitadel ($size) to zitadel-db"
if ! sql 'set -e; pg_dump -h db -Fc -f /tmp/zitadel.dump zitadel; sh /pg/zitadel-restore.sh zitadel-db /tmp/zitadel.dump'; then
  start_zitadel
  die "the copy failed; Zitadel runs on db as before, zitadel-db's zitadel database is partial (drop it there)"
fi
src=$(sql 'psql -h db -d zitadel -XAtq -v ON_ERROR_STOP=1 -f /pg/zitadel-counts.sql')
dst=$(sql 'psql -h zitadel-db -d zitadel -XAtq -v ON_ERROR_STOP=1 -f /pg/zitadel-counts.sql')
if [[ $src != "$dst" ]]; then
  diff <(echo "$src") <(echo "$dst") | head -n 20 >&2 || true
  start_zitadel
  die "row counts differ; Zitadel runs on db as before"
fi
log "copy verified: $(wc -l <<<"$src") tables, $(awk '{ n += $2 } END { print n }' <<<"$src") rows"

terminate db zitadel
q db "ALTER DATABASE zitadel RENAME TO zitadel_moved_$stamp" >/dev/null
set_host zitadel-db
log "Zitadel on zitadel-db; the old database stays in db as zitadel_moved_$stamp"
if ! start_zitadel || ! smoke; then
  log "Zitadel failed on zitadel-db: going back"
  back
  die "the move was undone; see compose logs zitadel zitadel-db"
fi
log "moved. Drop db/zitadel_moved_$stamp after a week without problems (RUNBOOK 3.15)"
