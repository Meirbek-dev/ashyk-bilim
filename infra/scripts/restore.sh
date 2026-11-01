#!/usr/bin/env bash
# Restore a backup (layout backup/{db_dumps,rustfs,redis,zitadel_machinekey,secrets})
# into an EMPTY project of the STACK (default prod), then start it and run smoke:
#   restore.sh [snapshot]            restic snapshot in ${BACKUP_DIR}/restic (default latest)
#   restore.sh <backup-*.tar.zst>    legacy offen archive (taken before 2026-10-26)
# On a new host, first put backup/secrets/{.env,server.env} next to the compose files (RUNBOOK 3.4).
# Volume data is unpacked as root straight into the volumes: owners and modes survive.
# Legacy archives are decompressed inside the db image (zstd + GNU tar there, nothing on
# the host); their member names are absolute (/backup/...), hence --no-anchored.
# RESTORE_DIR  scratch space for the dumps (default ${TMPDIR:-/tmp}/ashyq-restore, outside the repo)
# The zitadel dump goes where the stack's ZITADEL_DB_HOST says: into db as it was dumped, or into zitadel-db with
# every object owned by zitadel (a dump taken before the move restores there too).
# SMOKE_ORIGIN smoke target (default <PUBLIC_SCHEME>://<NGINX_SERVER_NAME>, resolved to 127.0.0.1)
# shellcheck disable=SC2016 # $POSTGRES_USER expands inside the db container
src=${1:-latest}
legacy=false
if [[ $src == *.tar.zst ]]; then
  legacy=true
  src="$(cd "$(dirname "$src")" && pwd)/$(basename "$src")"
fi
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"
use_stack
if $legacy; then
  [[ -f $src ]] || die "no such archive: $src"
else
  restic_env
fi

project=$(compose config | sed -n 's/^name: //p' | head -n 1)
[[ -n $project ]] || die "cannot determine the compose project name"
zhost=$(envval ZITADEL_DB_HOST)
zhost=${zhost:-db}
for v in postgres_data zitadel_pg_data; do
  if "$CTR" volume inspect "${project}_$v" >/dev/null 2>&1; then
    die "project $project already has a $v volume; restore only into an empty project"
  fi
done

dir=${RESTORE_DIR:-${TMPDIR:-/tmp}/ashyq-restore}/$(basename "$src" .tar.zst)
rm -rf "$dir"
mkdir -p "$dir"
log "extracting the dumps into $dir"
if $legacy; then
  "$CTR" run --rm -i "$PG_IMAGE" zstd -dc <"$src" | tar -xf - --no-anchored -C "$dir" backup/db_dumps
else
  restic_run -v "$dir:/out" -- restore "$src" --target /out --include /backup/db_dumps
  "$CTR" run --rm -v "$dir:/out" --entrypoint chown "$RESTIC_IMAGE" -R "$(id -u):$(id -g)" /out
fi
dumps=$dir/backup/db_dumps
[[ -f $dumps/ashyq.dump ]] || die "$src has no backup/db_dumps/ashyq.dump"

log "databases"
prepare_redis_volume
# A logical restore starts a new cluster: the WAL archive of the old one moves aside (wal-archive.sh would refuse
# to mix them and pg_wal would grow). Only stacks with the archive (compose.prod.yaml) have pitr-init.
if grep -qx pitr-init <<<"$(compose config --services)"; then
  compose run --rm --no-deps -T --entrypoint sh pitr-init -c 'set -e
    for a in /pitr /pitr-zitadel; do
      mkdir -p $a/wal $a/base
      if [ -n "$(find $a/wal $a/base -mindepth 1 | head -n 1)" ]; then
        aside=$a/before-restore-$(date -u +%Y%m%dT%H%M%SZ); mkdir "$aside"; mv $a/wal $a/base "$aside"/
        echo "the previous WAL archive is kept at ${aside#/}"; fi
    done'
fi
compose up -d --wait db zitadel-db
# Globals first (roles + passwords); "role already exists" for the superuser is expected.
compose exec -T db sh -c 'psql -q -U "$POSTGRES_USER" -d postgres' <"$dumps/globals.sql" || true
compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d postgres --create --exit-on-error' <"$dumps/ashyq.dump"
if [[ $zhost == db ]]; then
  compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d postgres --create --exit-on-error' \
    <"$dumps/zitadel.dump"
else
  compose run --rm --no-deps -T --entrypoint sh db-init -c 'set -e
    cat >/tmp/zitadel.dump; sh /pg/zitadel-restore.sh "$ZITADEL_DB_HOST" /tmp/zitadel.dump' <"$dumps/zitadel.dump"
fi

log "volumes"
compose up --no-start rustfs redis zitadel
content=$("$CTR" inspect "$(compose ps -aq rustfs)" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}')
[[ -n $content ]] || die "cannot determine the RustFS data mount"
if $legacy; then
  "$CTR" run --rm -i \
    -v "$content:/v/rustfs" \
    -v "${project}_redis_data:/v/redis" \
    -v "${project}_zitadel_machinekey:/v/zitadel_machinekey" \
    "$PG_IMAGE" sh -c 'zstd -dc | tar -xpf - --numeric-owner --no-anchored -C /v --strip-components=1 \
      backup/rustfs backup/redis backup/zitadel_machinekey' <"$src"
else
  restic_run \
    -v "$content:/backup/rustfs" \
    -v "${project}_redis_data:/backup/redis" \
    -v "${project}_zitadel_machinekey:/backup/zitadel_machinekey" \
    -- restore "$src" --target / \
    --include /backup/rustfs --include /backup/redis --include /backup/zitadel_machinekey
fi

log "starting the stack"
compose up -d --wait

scheme=$(envval PUBLIC_SCHEME)
origin=${SMOKE_ORIGIN:-${scheme:-https}://$(envval NGINX_SERVER_NAME)}
SMOKE_RESOLVE_IP=${SMOKE_RESOLVE_IP:-127.0.0.1} bash "$ROOT/infra/scripts/smoke.sh" "$origin"
rm -rf "$dir"
log "restore of $(basename "$src") into $project done"
