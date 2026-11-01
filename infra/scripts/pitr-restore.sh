#!/usr/bin/env bash
# Point-in-time recovery of the stack's Postgres cluster in place (RUNBOOK 3.14):
#   pitr-restore.sh '<YYYY-MM-DD HH:MM:SS+05>' [base stamp]    replay the WAL archive up to that moment
#   pitr-restore.sh latest [base stamp]                       replay everything archived (lost data dir, same disk)
# STACK=prod by default. Stops server and worker, then db; lays the newest base backup older than the target
# (or the given one) into the data volume with infra/postgres/pitr-prepare.sh, which keeps the current data
# directory beside it (<PGDATA>.before-pitr-<stamp>, same volume); starts db, waits until recovery has
# promoted, starts the stack and runs smoke. The whole cluster goes back: ashyq and, while Zitadel shares the
# instance, zitadel too. Asks before stopping anything unless PITR_YES=1.
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"
target=${1:?usage: pitr-restore.sh <target time | latest> [base stamp]}
base=${2:-}
use_stack
grep -qx pitr-init <<<"$(compose config --services)" || die "this stack has no WAL archive (compose.prod.yaml)"

bases=$(compose run --rm --no-deps -T --entrypoint sh pitr-init -c \
  'for b in $(ls -1 /pitr/base | grep -v "\.tmp$" | sort); do echo "$b $(cat /pitr/base/$b/finished-at)"; done')
[[ -n $bases ]] || die "no base backup in the archive (backup.sh takes one nightly)"
if [[ -z $base ]]; then
  if [[ $target == latest ]]; then
    base=$(tail -n 1 <<<"$bases" | cut -d' ' -f1)
  else
    want=$(date -u -d "$target" +%Y-%m-%dT%H:%M:%SZ) || die "cannot read the target time '$target'"
    # A base can serve a target after it finished; the newest such base replays the least WAL.
    base=$(awk -v t="$want" '$2 < t { b = $1 } END { print b }' <<<"$bases")
    [[ -n $base ]] || die "no base backup finished before $want; oldest: $(head -n 1 <<<"$bases") (older points: RUNBOOK 3.4)"
  fi
fi
grep -q "^$base " <<<"$bases" || die "no base backup $base; have: $(cut -d' ' -f1 <<<"$bases" | tr '\n' ' ')"

log "recovering to $target from base $base (bases: $(cut -d' ' -f1 <<<"$bases" | tr '\n' ' '))"
if [[ ${PITR_YES:-} != 1 ]]; then
  read -r -p "This stops the app and the database of $(compose config | sed -n 's/^name: //p' | head -n 1). Type yes: " ok
  [[ $ok == yes ]] || die "aborted"
fi
compose stop server worker
compose stop db
compose run --rm --no-deps -T --entrypoint sh db /pg/pitr-prepare.sh "$base" "$target"
compose up -d --no-deps db
log "replaying WAL"
for _ in $(seq 1800); do
  # shellcheck disable=SC2016 # expanded in the container
  state=$(compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -Atc "SELECT pg_is_in_recovery()"' 2>/dev/null || true)
  [[ $state == f ]] && break
  sleep 2
done
[[ $state == f ]] || die "the database is still recovering after an hour: compose logs db"
# shellcheck disable=SC2016
compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d ashyq -Atc "SELECT '\''recovered; newest submission: '\'' || coalesce(max(updated_at)::text, '\''none'\'') FROM submissions"'
compose up -d --wait
scheme=$(envval PUBLIC_SCHEME)
origin=${SMOKE_ORIGIN:-${scheme:-https}://$(envval NGINX_SERVER_NAME)}
SMOKE_RESOLVE_IP=${SMOKE_RESOLVE_IP:-127.0.0.1} bash "$ROOT/infra/scripts/smoke.sh" "$origin"
log "point-in-time recovery done; the replaced data directory stays in the volume until removed (RUNBOOK 3.14)"
