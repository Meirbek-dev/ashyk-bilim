#!/usr/bin/env bash
# Major upgrade of the stack's Postgres clusters (db, zitadel-db) in place, to the major of the image pinned in
# compose.yaml (RUNBOOK 3.15):
#   pg-upgrade.sh            STACK=prod by default; STACK=dev for the shared dev containers (`just dev-up`)
#   pg-upgrade.sh --pending  exit 0 when a volume still holds an older cluster (deploy.sh refuses then)
# Builds infra/postgres/upgrade.Dockerfile, stops the whole stack, runs infra/postgres/pg-upgrade.sh on every data
# volume holding an older cluster (copy mode: the old directory stays in the volume), starts db and zitadel-db,
# fills the statistics pg_upgrade does not carry over, and on prod moves the WAL archives and base backups of the
# old clusters aside (PITR cannot replay across a major; the next `just backup` takes the first base of the new
# ones). The rest comes up with `just deploy` (prod) or `just dev-up` (dev). Asks first unless PG_UPGRADE_YES=1.
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"
use_stack
from=18
to=$(sed -n 's/.*-pg\([0-9]*\)-.*/\1/p' <<<"$PG_IMAGE")
[[ -n $to ]] || die "cannot read the major of $PG_IMAGE"
project=${COMPOSE_PROJECT_NAME:-$(compose config | sed -n 's/^name: //p' | head -n 1)}
declare -A volumes=([db]=postgres_data [zitadel-db]=zitadel_pg_data)

# Services whose volume holds a Postgres $from cluster.
pending=()
for svc in db zitadel-db; do
  vol=${project}_${volumes[$svc]}
  "$CTR" volume inspect "$vol" >/dev/null 2>&1 || continue
  if "$CTR" run --rm --network none --entrypoint sh -v "$vol:/var/lib/postgresql" "$PG_IMAGE" \
    -c "test -s /var/lib/postgresql/$from/docker/PG_VERSION"; then
    pending+=("$svc")
  fi
done
if [[ ${1:-} == --pending ]]; then
  ((${#pending[@]})) || exit 1
  log "Postgres $from data in: ${pending[*]} of $project (just pg-upgrade)"
  exit 0
fi
((${#pending[@]})) || {
  log "no Postgres $from cluster in $project; nothing to upgrade"
  exit 0
}

log "upgrading ${pending[*]} of $project from Postgres $from to $to"
if [[ ${PG_UPGRADE_YES:-} != 1 ]]; then
  read -r -p "This stops every service of $project until the next deploy/dev-up. Type yes: " ok
  [[ $ok == yes ]] || die "aborted"
fi
image=ashyq-pg-upgrade:$from-$to
"$CTR" build -q -t "$image" --build-arg "BASE=$PG_IMAGE" --build-arg "FROM_MAJOR=$from" \
  -f infra/postgres/upgrade.Dockerfile infra/postgres >/dev/null
superuser=$(envval POSTGRES_USER)
compose stop
for svc in "${pending[@]}"; do
  log "$svc: pg_upgrade"
  "$CTR" run --rm --network none -e "POSTGRES_USER=${superuser:-postgres}" \
    -v "${project}_${volumes[$svc]}:/var/lib/postgresql" "$image" sh /usr/local/bin/pg-upgrade.sh
done

if grep -qx pitr-init <<<"$(compose config --services)"; then
  # The archives of the old clusters: kept beside the new ones, never replayed into a new major.
  compose run --rm --no-deps -T --entrypoint sh pitr-init -c \
    "for a in /pitr /pitr-zitadel; do [ ! -d \$a/wal ] || mv \$a/wal \$a/wal.before-pg$to; \
      [ ! -d \$a/base ] || mv \$a/base \$a/base.before-pg$to; done"
fi
compose up -d --wait db zitadel-db
for svc in "${pending[@]}"; do
  # shellcheck disable=SC2016 # expanded in the container
  compose exec -T "$svc" sh -c 'f=/var/lib/postgresql/$1/update_extensions.sql
    [ ! -f "$f" ] || { psql -U "$POSTGRES_USER" -d postgres -Xq -v ON_ERROR_STOP=1 -f "$f" && rm "$f"; }
    vacuumdb -U "$POSTGRES_USER" --all --analyze-in-stages --missing-stats-only >/dev/null' sh "$to"
done
log "Postgres $to runs ${pending[*]}; next: just deploy, then just backup (first base backup) on prod; just dev-up on dev"
