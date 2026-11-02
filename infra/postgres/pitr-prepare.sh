#!/bin/sh
# Lay a base backup into $PGDATA for point-in-time recovery, in a one-off container of the db image with the data
# volume at /var/lib/postgresql and the archive at /pitr (infra/scripts/pitr-restore.sh, infra/tests/pitr.sh):
#   pitr-prepare.sh <base stamp | latest> <target: 'YYYY-MM-DD HH:MM:SS+ZZ' | latest>
# An existing data directory is moved aside to $PGDATA.before-pitr-<UTC stamp> (same volume, nothing deleted).
# On its next start Postgres replays the archived WAL up to the target and promotes (a new timeline).
set -eu
base=$1
target=$2
[ "$base" != latest ] || base=$(find /pitr/base -mindepth 1 -maxdepth 1 -type d ! -name '*.tmp' -exec basename {} \; | sort | tail -n 1)
src=/pitr/base/$base
[ -f "$src/base.tar.gz" ] || { echo "pitr-prepare: no base backup $src" >&2; exit 1; }
if [ -n "$(ls -A "$PGDATA" 2>/dev/null)" ]; then
  aside=$PGDATA.before-pitr-$(date -u +%Y%m%dT%H%M%SZ)
  mv "$PGDATA" "$aside"
  echo "pitr-prepare: the old data directory is kept at $aside"
fi
mkdir -p "$PGDATA"
tar -xzf "$src/base.tar.gz" -C "$PGDATA"
# The WAL streamed during the backup (pitr-base.sh: -X stream); the archive holds it too.
[ ! -f "$src/pg_wal.tar.gz" ] || tar -xzf "$src/pg_wal.tar.gz" -C "$PGDATA/pg_wal"
# A base taken after an earlier recovery carries that recovery's settings (they stay in postgresql.auto.conf
# after promote): an old recovery_target_time would stop this replay at the old point.
sed -i -e '/^# point-in-time recovery from base /d' -e '/^restore_command[[:space:]]*=/d' \
  -e '/^recovery_target[a-z_]*[[:space:]]*=/d' "$PGDATA/postgresql.auto.conf"
{
  echo "# point-in-time recovery from base $base ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
  echo "restore_command = 'gzip -dc /pitr/wal/%f.gz > %p'"
  if [ "$target" = latest ]; then
    echo "recovery_target_timeline = 'latest'"
  else
    echo "recovery_target_time = '$target'"
    echo "recovery_target_inclusive = off"
  fi
  echo "recovery_target_action = 'promote'"
} >>"$PGDATA/postgresql.auto.conf"
touch "$PGDATA/recovery.signal"
chown -R postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"
echo "pitr-prepare: $PGDATA from base $base, target $target; start the db to replay"
