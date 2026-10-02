#!/usr/bin/env bash
# Deploy a CI-published release to the prod host:
#   deploy.sh [sha]                        default: the checked-out HEAD
#   deploy.sh --rollback [--force] [sha]   default: the previous .deploy-history entry
# CI pushes <sha> tags only after the gates and the stack smoke passed, so
# "image exists in the registry" == "release is green".
set -euo pipefail
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"
use_prod

HISTORY=.deploy-history
MIGRATIONS=apps/server/migrations
KEEP_RELEASES=5

env_get() { sed -n "s/^$1=//p" .env | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
short_sha() { git rev-parse --verify --quiet "$1^{commit}" | cut -c1-8; }
# Nth entry from the end of the history (1 = current release).
deployed() { if [[ -f $HISTORY ]]; then tail -n "$1" "$HISTORY" | head -n 1 | awk '{ print $2 }'; fi; }
# False (= "migrations changed") also when either sha is empty or unknown to git.
same_migrations() { [[ -n $1 && -n $2 ]] && git diff --quiet "$1" "$2" -- "$MIGRATIONS" 2>/dev/null; }

IMAGE_REPO=${IMAGE_REPO:-$(env_get IMAGE_REPO)}
export IMAGE_REPO=${IMAGE_REPO:-ghcr.io/meirbek-dev}
domain=$(env_get NGINX_SERVER_NAME)
[[ -n $domain ]] || die ".env: NGINX_SERVER_NAME is not set"
# The host cannot reach its own public IP through NAT; smoke via local nginx.
export SMOKE_RESOLVE_IP=${SMOKE_RESOLVE_IP:-127.0.0.1}

# Export for compose and persist in .env, so a later plain `compose up`
# keeps the deployed tag.
set_tag() {
  export IMAGE_TAG=$1
  if grep -q '^IMAGE_TAG=' .env; then
    sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$1/" .env
  else
    [[ -z $(tail -c 1 .env) ]] || echo >>.env
    echo "IMAGE_TAG=$1" >>.env
  fi
}

# Chained with && so it stays correct when called from an `if` (no errexit there).
up_and_smoke() {
  compose up -d --no-build --wait --remove-orphans &&
    compose exec -T nginx nginx -t &&
    compose exec -T nginx nginx -s reload &&
    "$ROOT/infra/scripts/smoke.sh" "https://$domain"
}

record() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >>"$HISTORY"; }

# rollback <force 0|1> <target> <current>
rollback() {
  local force=$1 target=$2 current=$3
  [[ -n $target && $target != "$current" ]] || die "no previous release to roll back to"
  if ! same_migrations "$target" "$current"; then
    ((force)) || die "migrations differ between $current and $target (or a sha is unknown to git); restore the pre-deploy dump instead (RUNBOOK), or pass --force"
    log "WARN: migrations differ between $current and $target (--force)"
  fi
  log "rolling back $current -> $target"
  set_tag "$target"
  up_and_smoke || die "smoke failed after rolling back to $target"
  record "$target"
  log "rolled back to $target"
}

prune_images() {
  local keep
  keep=$({ awk '{ print $2 }' "$HISTORY" | tail -n "$KEEP_RELEASES"; echo "$IMAGE_TAG"; } | paste -sd'|' -)
  docker images --format '{{.Repository}}:{{.Tag}}' |
    grep -E "^$IMAGE_REPO/ashyq-(server|web):" |
    grep -vE ":($keep)\$" |
    xargs -r docker rmi || true
}

# One deploy/rollback at a time; the automatic rollback runs inside this lock.
exec 9>"$ROOT/.deploy.lock"
flock -n 9 || die "another deploy or rollback is running"

if [[ ${1:-} == --rollback ]]; then
  shift
  force=0
  if [[ ${1:-} == --force ]]; then force=1 && shift; fi
  current=$(deployed 1)
  # Most recent release that differs from the current one.
  target=$([[ -f $HISTORY ]] && awk '{ print $2 }' "$HISTORY" | grep -vxF "$current" | tail -n 1 || true)
  if [[ -n ${1:-} ]]; then
    target=$(short_sha "$1")
    [[ -n $target ]] || die "unknown commit: $1"
  fi
  IMAGE_TAG=$target "$ROOT/infra/scripts/preflight.sh"
  rollback "$force" "$target" "$current"
  exit 0
fi

sha=$(short_sha "${1:-HEAD}")
[[ -n $sha ]] || die "unknown commit: ${1:-HEAD} (git fetch first)"
for img in server web; do
  docker manifest inspect "$IMAGE_REPO/ashyq-$img:$sha" >/dev/null 2>&1 ||
    die "$IMAGE_REPO/ashyq-$img:$sha is not in the registry (CI red or not finished)"
done

export IMAGE_TAG=$sha
"$ROOT/infra/scripts/preflight.sh"

prev=$(deployed 1)
log "deploying $sha (previous: ${prev:-none})"
compose pull --quiet

migrations=0
same_migrations "$prev" "$sha" || migrations=1
dump=backups/pre-deploy-$sha.dump
if ((migrations)); then
  log "migrations changed since ${prev:-the unknown previous release}; dumping database ashyq to $dump"
  mkdir -p backups
  compose up -d --no-build --wait db
  # shellcheck disable=SC2016 # expanded by the container's shell
  (umask 077 && compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc ashyq' >"$dump.tmp")
  [[ -s $dump.tmp ]] || die "pre-deploy dump is empty"
  mv "$dump.tmp" "$dump"
fi
compose run --rm server-migrate

set_tag "$sha"
if ! up_and_smoke; then
  if ((migrations)); then
    log "FAIL: smoke failed on a release with migrations; no automatic rollback."
    log "To restore the pre-deploy state (RUNBOOK: restore from pre-deploy dump):"
    log "  compose stop server worker"
    log "  compose exec -T db sh -c 'pg_restore -U \"\$POSTGRES_USER\" -d ashyq --clean --if-exists' < $dump"
    log "  infra/scripts/rollback.sh --force ${prev:-<previous sha>}"
    exit 1
  fi
  [[ -n $prev ]] || die "smoke failed and there is no previous release to roll back to"
  log "FAIL: smoke failed; rolling back to $prev"
  rollback 0 "$prev" "$sha"
  exit 1
fi
record "$sha"
log "deployed $sha"
prune_images
