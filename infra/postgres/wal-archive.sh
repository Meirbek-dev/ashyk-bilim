#!/bin/sh
# archive_command of the db service (compose.prod.yaml): `sh /pg/wal-archive.sh %p %f`.
# Copies one WAL segment (or a .history/.backup file) gzip'd into /pitr/wal, atomically (temp file, fsync,
# rename). A file archived before is accepted again only with the same content (Postgres retries after a crash);
# any other existing file is an error, so the archive of one timeline is never overwritten. Non-zero = Postgres
# keeps the segment and retries.
set -eu
src=$1
dst=/pitr/wal/$2.gz
# One archive per cluster: a new cluster (a logical restore, a fresh volume) reuses segment names. Postgres runs
# this in the data directory.
id=$(pg_controldata . | sed -n 's/^Database system identifier: *//p')
if [ ! -f /pitr/wal/SYSTEM_ID ]; then
  echo "$id" >/pitr/wal/SYSTEM_ID
elif [ "$(cat /pitr/wal/SYSTEM_ID)" != "$id" ]; then
  echo "wal-archive: /pitr/wal belongs to cluster $(cat /pitr/wal/SYSTEM_ID), this is $id: move it aside (RUNBOOK 3.14)" >&2
  exit 1
fi
if [ -f "$dst" ]; then
  if gzip -dc "$dst" | cmp -s - "$src"; then exit 0; fi
  echo "wal-archive: $dst exists with other content" >&2
  exit 1
fi
gzip -1 -c "$src" >"$dst.tmp"
sync "$dst.tmp"
mv "$dst.tmp" "$dst"
sync /pitr/wal
