#!/bin/sh
# Nightly base backup for point-in-time recovery, inside the db container as the superuser
# (infra/scripts/pitr-base.sh runs it): pg_basebackup into /pitr/base/<UTC stamp>/ (tar, gzip, WAL streamed beside it),
# then keeps the newest PITR_BASE_KEEP (default 3) and drops archived WAL older than the oldest kept base.
# The recovery window is therefore the last PITR_BASE_KEEP nights; older points come from the restic dumps.
set -eu
keep=${PITR_BASE_KEEP:-3}
user=${POSTGRES_USER:-postgres}
[ "$(psql -U "$user" -d postgres -Atc 'SHOW archive_mode')" = on ] || {
  echo "pitr-base: archive_mode is off (db command in compose.prod.yaml)" >&2
  exit 1
}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dir=/pitr/base/$stamp
mkdir -p /pitr/base
# -X stream: the WAL of the backup comes over a temporary slot, so a checkpoint cannot recycle it mid-backup.
pg_basebackup -U "$user" -D "$dir.tmp" -Ft -z -X stream --checkpoint=fast --label "pitr-$stamp"
start=$(sed -n 's/.*"Start-LSN": "\([^"]*\)".*/\1/p' "$dir.tmp/backup_manifest" | head -n 1)
[ -n "$start" ] || { echo "pitr-base: no Start-LSN in backup_manifest" >&2; exit 1; }
psql -U "$user" -d postgres -Atc "SELECT pg_walfile_name('$start')" >"$dir.tmp/start-wal"
date -u +%Y-%m-%dT%H:%M:%SZ >"$dir.tmp/finished-at"
mv "$dir.tmp" "$dir"
# A crash mid-backup leaves a *.tmp directory: never a restore candidate, removed here.
find /pitr/base -mindepth 1 -maxdepth 1 -name '*.tmp' -type d -exec rm -rf {} +
ls -1 /pitr/base | sort -r | tail -n +"$((keep + 1))" | while read -r old; do rm -rf "/pitr/base/$old"; done
oldest=$(ls -1 /pitr/base | sort | head -n 1)
pg_archivecleanup -x .gz /pitr/wal "$(cat "/pitr/base/$oldest/start-wal")"
echo "pitr-base: $stamp ($(du -sh "$dir" | cut -f1)); bases: $(ls -1 /pitr/base | tr '\n' ' '); wal: $(du -sh /pitr/wal | cut -f1)"
