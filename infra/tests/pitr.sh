#!/usr/bin/env bash
# Point-in-time recovery rehearsal on throwaway Postgres containers of the stack's image (no network, own
# volumes, all removed on exit): archive WAL with infra/postgres/wal-archive.sh, take a base backup with
# pitr-base.sh, write before and after a target time, then pitr-prepare.sh restores
#   1. in place (the data directory moved aside, as RUNBOOK 3.14 does on production) to the target time:
#      the rows before it are back, the row after it is not;
#   2. into a new volume to the end of the archive: every row is back;
#   3. a new cluster (a logical restore, a fresh volume) is refused by the archive of the old one.
# Never touches a compose project. `just pitr-test`.
source "$(dirname "$0")/../scripts/lib.sh"
[[ -n $CTR ]] || die "pitr-test: no container runtime"

id=ashyq-pitr-check-$$
root=$(pwd -W 2>/dev/null || pwd)
archive=$id-archive
cleanup() {
  "$CTR" rm -f "$id-db" >/dev/null 2>&1 || true
  "$CTR" volume rm -f "$id-data" "$id-data2" "$id-data3" "$archive" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# The archive flags of compose.prod.yaml's db command.
archive_flags=(-c archive_mode=on -c 'archive_command=sh /pg/wal-archive.sh %p %f' -c archive_timeout=60)
q() { "$CTR" exec -e PGPASSWORD=check "$id-db" psql -X -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
start() { # start <data volume> [postgres flags...]
  local volume=$1
  shift
  "$CTR" run -d --name "$id-db" --network none -e POSTGRES_PASSWORD=check \
    -v "$volume:/var/lib/postgresql" -v "$archive:/pitr" -v "$root/infra/postgres:/pg:ro" \
    "$PG_IMAGE" postgres "$@" >/dev/null
  for _ in $(seq 120); do
    # TCP: the initdb-time server of a fresh volume listens on the socket only.
    if [[ $(q 'SELECT NOT pg_is_in_recovery()' 2>/dev/null) == t ]]; then
      return
    fi
    sleep 1
  done
  "$CTR" logs "$id-db" 2>&1 | tail -n 20 >&2
  die "pitr-test: Postgres did not come up out of recovery"
}
stop() { "$CTR" rm -f "$id-db" >/dev/null; }
prepare() { # prepare <data volume> <base> <target>
  "$CTR" run --rm --network none -v "$1:/var/lib/postgresql" -v "$archive:/pitr:ro" \
    -v "$root/infra/postgres:/pg:ro" "$PG_IMAGE" sh /pg/pitr-prepare.sh "$2" "$3"
}

"$CTR" run --rm -v "$archive:/pitr" "$PG_IMAGE" \
  sh -c 'mkdir -p /pitr/wal /pitr/base && chown -R postgres:postgres /pitr && chmod 700 /pitr'
start "$id-data" "${archive_flags[@]}"
q "CREATE TABLE marks (label text PRIMARY KEY, at timestamptz NOT NULL DEFAULT clock_timestamp())" >/dev/null
q "INSERT INTO marks (label) VALUES ('before-base')" >/dev/null
# Three nights with PITR_BASE_KEEP=2: two bases stay, WAL before the older one is gone.
for _ in 1 2 3; do
  "$CTR" exec -e PITR_BASE_KEEP=2 "$id-db" sh /pg/pitr-base.sh
  q "INSERT INTO marks (label) VALUES ('night-' || clock_timestamp()) RETURNING 1" >/dev/null
  q "SELECT pg_switch_wal()" >/dev/null
done
# shellcheck disable=SC2016 # expanded in the container
kept=$("$CTR" exec "$id-db" sh -c 'ls /pitr/base | wc -l; oldest=$(ls /pitr/base | sort | head -n 1)
  start=$(cat /pitr/base/$oldest/start-wal); ls /pitr/wal | grep -E "^[0-9A-F]{24}\.gz$" |
  awk -v s="$start" "\$0 < s" | wc -l')
[[ $(echo "$kept" | tr '\n' ' ') == "2 0 " ]] || die "pitr-test: retention left '$kept' (want 2 bases, 0 older WAL)"
q "DELETE FROM marks WHERE label LIKE 'night-%'" >/dev/null
q "INSERT INTO marks (label) VALUES ('kept')" >/dev/null
sleep 1
target=$(q "SELECT clock_timestamp()")
sleep 1
q "INSERT INTO marks (label) VALUES ('lost')" >/dev/null
switched=$(q "SELECT pg_walfile_name(pg_switch_wal())")
for _ in $(seq 60); do
  [[ $(q "SELECT last_archived_wal FROM pg_stat_archiver") > "$switched" ||
    $(q "SELECT last_archived_wal FROM pg_stat_archiver") == "$switched" ]] && break
  sleep 1
done
[[ $(q "SELECT coalesce(failed_count, 0) FROM pg_stat_archiver") == 0 ]] || die "pitr-test: archiving failed"
stop
log "pitr-test: archived up to $switched; restoring in place to $target"

prepare "$id-data" latest "$target"
start "$id-data"
got=$(q "SELECT string_agg(label, ',' ORDER BY label) FROM marks")
[[ $got == before-base,kept ]] || die "pitr-test: in-place restore to $target has rows '$got', want 'before-base,kept'"
aside=$("$CTR" exec "$id-db" sh -c 'ls -d "$PGDATA".before-pitr-* | wc -l')
[[ $aside == 1 ]] || die "pitr-test: the replaced data directory was not kept"
stop
log "pitr-test: in place ok ($got; old data directory kept)"

prepare "$id-data2" latest latest
start "$id-data2"
got=$(q "SELECT string_agg(label, ',' ORDER BY label) FROM marks")
[[ $got == before-base,kept,lost ]] || die "pitr-test: restore to the archive end has rows '$got'"
stop

start "$id-data3" "${archive_flags[@]}"
q "SELECT pg_switch_wal()" >/dev/null
# The container log trails pg_stat_archiver: wait for the refusal itself.
refused=
for _ in $(seq 30); do
  if "$CTR" logs "$id-db" 2>&1 | grep -q 'belongs to cluster'; then
    refused=1
    break
  fi
  sleep 1
done
[[ -n $refused ]] || die "pitr-test: a new cluster archived into the old archive"
q "SELECT current_setting('archive_mode'), archived_count, failed_count, (SELECT count(*) FROM pg_ls_waldir())
     FROM pg_stat_archiver" >/dev/null
stop
log "pitr-test ok (target time, end of archive, foreign cluster refused)"
