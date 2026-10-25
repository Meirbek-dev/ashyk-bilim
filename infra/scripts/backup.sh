#!/usr/bin/env bash
# Backup: fresh dumps and a Redis snapshot, then one restic snapshot of
# backup/{db_dumps,rustfs,redis,zitadel_machinekey,secrets} into ${BACKUP_DIR}/restic.
# Incremental and deduplicated: unchanged RustFS objects are not read or written again,
# the uncompressed dumps (-Z0) dedupe day to day and restic compresses them.
# Sundays (or BACKUP_PRUNE=1) also forget (14 daily, 8 weekly, 12 monthly), prune and
# read-check 5% of the data. No service is stopped.
#   backup.sh                  STACK=prod by default; `just backup`; nightly via infra/host/backup.timer
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"
use_stack
restic_env
project=$(compose config | sed -n 's/^name: //p' | head -n 1)
[[ -n $project ]] || die "cannot determine the compose project name"

log "dumps"
# shellcheck disable=SC2016 # $POSTGRES_USER expands inside the db container
compose exec -T db sh -c 'set -e; cd /dumps
  for d in ashyq zitadel; do pg_dump -U "$POSTGRES_USER" -Fc -Z0 -f $d.dump.tmp $d; mv $d.dump.tmp $d.dump; done
  pg_dumpall -U "$POSTGRES_USER" --globals-only -f globals.sql.tmp; mv globals.sql.tmp globals.sql'
compose exec -T redis redis-cli SAVE >/dev/null

r() { compose run --rm -T --no-deps backup "$@"; }
r cat config >/dev/null 2>&1 || {
  log "initialising the repository $RESTIC_HOST_REPO"
  r init
}
log "snapshot"
r backup --host "$project" --tag nightly /backup
if [[ $(date +%u) == 7 || ${BACKUP_PRUNE:-} == 1 ]]; then
  log "forget, prune, check"
  r forget --host "$project" --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
  r check --read-data-subset=5%
fi
log "backup of $project done"
