#!/usr/bin/env bash
# Backup: fresh dumps and a Redis snapshot, then one restic snapshot of
# backup/{db_dumps,rustfs,redis,zitadel_machinekey,secrets} into ${BACKUP_DIR}/restic.
# Incremental and deduplicated: unchanged RustFS objects are not read or written again,
# the uncompressed dumps (-Z0) dedupe day to day and restic compresses them.
# Sundays (or BACKUP_PRUNE=1) also forget (14 daily, 8 weekly, 12 monthly), prune and
# read-check 5% of the data. No service is stopped. The zitadel dump comes from Zitadel's instance
# (ZITADEL_DB_HOST: db or zitadel-db). With WAL archiving on (prod), also a base backup of each instance for
# point-in-time recovery into ${BACKUP_DIR}/pitr{,-zitadel}/base (not in the restic snapshot: the same disk).
#   backup.sh                  STACK=prod by default; `just backup`; nightly via infra/host/backup.timer
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"
use_stack
restic_env
project=$(compose config | sed -n 's/^name: //p' | head -n 1)
[[ -n $project ]] || die "cannot determine the compose project name"

zhost=$(envval ZITADEL_DB_HOST)
zhost=${zhost:-db}
log "dumps"
# shellcheck disable=SC2016 # $POSTGRES_USER expands inside the db containers
dump='set -e; cd /dumps; pg_dump -U "$POSTGRES_USER" -Fc -Z0 -f "$1.dump.tmp" "$1"; mv "$1.dump.tmp" "$1.dump"'
compose exec -T db sh -c "$dump" sh ashyq
compose exec -T "$zhost" sh -c "$dump" sh zitadel
# shellcheck disable=SC2016
compose exec -T db sh -c 'set -e; cd /dumps
  pg_dumpall -U "$POSTGRES_USER" --globals-only -f globals.sql.tmp; mv globals.sql.tmp globals.sql'
compose exec -T redis redis-cli SAVE >/dev/null

# Point-in-time recovery: tonight's base backup of each instance, older bases and their WAL pruned
# (RUNBOOK 3.14). A failure does not stop the snapshot; the run still ends non-zero.
pitr_failed=0
for svc in db zitadel-db; do
  # shellcheck disable=SC2016
  if [[ $(compose exec -T "$svc" sh -c 'psql -U "$POSTGRES_USER" -d postgres -Atc "SHOW archive_mode"') == on* ]]; then
    log "base backup of $svc"
    compose exec -T "$svc" sh /pg/pitr-base.sh || pitr_failed=1
  fi
done

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
((pitr_failed == 0)) || die "backup of $project: snapshot done, but the PITR base backup failed (see above)"
log "backup of $project done"
