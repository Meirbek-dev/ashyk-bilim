#!/usr/bin/env bash
# Restore a backup archive (layout backup/{db_dumps,rustfs,redis,zitadel_machinekey,secrets})
# into an EMPTY project of the STACK (default prod), then start it and run smoke:
#   restore.sh <backup-*.tar.zst>
# On a new host, first copy backup/secrets/{.env,server.env} next to the compose files.
# The archive is decompressed inside the db image (zstd + GNU tar there, nothing on the host)
# and volume data is unpacked as root straight into the volumes: owners and modes survive.
# Member names in offen archives are absolute (/backup/...), hence --no-anchored.
# RESTORE_DIR  scratch space for the dumps (default ${TMPDIR:-/tmp}/ashyq-restore, outside the repo)
# SMOKE_ORIGIN smoke target (default <PUBLIC_SCHEME>://<NGINX_SERVER_NAME>, resolved to 127.0.0.1)
# shellcheck disable=SC2016 # $POSTGRES_USER expands inside the db container
archive=${1:?usage: restore.sh <archive>}
archive="$(cd "$(dirname "$archive")" && pwd)/$(basename "$archive")"
source "$(dirname "$0")/lib.sh"
use_stack
[[ -f $archive ]] || die "no such archive: $archive"

project=$(compose config | sed -n 's/^name: //p' | head -n 1)
[[ -n $project ]] || die "cannot determine the compose project name"
if "$CTR" volume inspect "${project}_postgres_data" >/dev/null 2>&1; then
  die "project $project already has a postgres_data volume; restore only into an empty project"
fi

dir=${RESTORE_DIR:-${TMPDIR:-/tmp}/ashyq-restore}/$(basename "$archive" .tar.zst)
rm -rf "$dir"
mkdir -p "$dir"
log "extracting the dumps into $dir"
"$CTR" run --rm -i "$PG_IMAGE" zstd -dc <"$archive" | tar -xf - --no-anchored -C "$dir" backup/db_dumps
dumps=$dir/backup/db_dumps
[[ -f $dumps/ashyq.dump ]] || die "$archive has no backup/db_dumps/ashyq.dump (old-format archive?)"

log "databases"
compose up -d --wait db
# Globals first (roles + passwords); "role already exists" for the superuser is expected.
compose exec -T db sh -c 'psql -q -U "$POSTGRES_USER" -d postgres' <"$dumps/globals.sql" || true
for db in ashyq zitadel; do
  compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d postgres --create --exit-on-error' \
    <"$dumps/$db.dump"
done

log "volumes"
compose up --no-start rustfs redis zitadel
"$CTR" run --rm -i \
  -v "${project}_rustfs_data:/v/rustfs" \
  -v "${project}_redis_data:/v/redis" \
  -v "${project}_zitadel_machinekey:/v/zitadel_machinekey" \
  "$PG_IMAGE" sh -c 'zstd -dc | tar -xpf - --numeric-owner --no-anchored -C /v --strip-components=1 \
    backup/rustfs backup/redis backup/zitadel_machinekey' <"$archive"

log "starting the stack"
compose up -d --wait

envval() { sed -n "s/^$1=//p" "${COMPOSE_ENV_FILES:-.env}" | tail -n 1; }
scheme=${PUBLIC_SCHEME:-$(envval PUBLIC_SCHEME)}
origin=${SMOKE_ORIGIN:-${scheme:-https}://${NGINX_SERVER_NAME:-$(envval NGINX_SERVER_NAME)}}
SMOKE_RESOLVE_IP=${SMOKE_RESOLVE_IP:-127.0.0.1} bash "$ROOT/infra/scripts/smoke.sh" "$origin"
rm -rf "$dir"
log "restore of $(basename "$archive") into $project done"
