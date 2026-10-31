# shellcheck shell=bash
# Sourced by every infra script: strict mode, ROOT (cwd = repo root), log/die,
# `compose` (docker compose, else podman compose; env passes through) and the
# stack selectors use_prod / use_dev / use_smoke / use_web2 / use_stack ($STACK).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# Git Bash on Windows: keep container paths (/data, /machinekey) unmangled.
export MSYS_NO_PATHCONV=1

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die() {
  log "ERROR: $*"
  exit 1
}

CTR=
if command -v docker >/dev/null 2>&1; then
  CTR=docker
elif command -v podman >/dev/null 2>&1; then
  CTR=podman
fi
compose() {
  [[ -n $CTR ]] || die "neither docker nor podman is installed"
  "$CTR" compose "$@"
}

# Pin Podman's shared-volume owner: mounting an empty Redis volume into the root-owned backup otherwise chowns it.
prepare_redis_volume() {
  if "$CTR" --version | grep -qi podman; then
    local project=${COMPOSE_PROJECT_NAME:-}
    [[ -n $project ]] || project=$(compose config | sed -n 's/^name: //p' | head -n 1)
    [[ -n $project ]] || die "cannot determine the compose project name"
    "$CTR" volume create --ignore --uid 999 --gid 999 \
      --label "com.docker.compose.project=$project" --label com.docker.compose.volume=redis_data \
      "${project}_redis_data" >/dev/null
  fi
}

export COMPOSE_PATH_SEPARATOR=:
# The db image (pinned in compose.yaml) doubles as the toolbox: zstd, GNU tar, psql.
# shellcheck disable=SC2034 # used by the sourcing scripts
PG_IMAGE=$(sed -n 's/.*image: &pg-image //p' compose.yaml)
RESTIC_IMAGE=$(sed -n 's/.*image: &restic-image //p' compose.prod.yaml)

# Value of $1 from the shell, else from the stack's env file (./.env unless COMPOSE_ENV_FILES).
envval() {
  local v=${!1:-}
  [[ -n $v ]] || v=$(sed -n "s/^$1=//p" "${COMPOSE_ENV_FILES:-.env}" 2>/dev/null | tail -n 1)
  printf '%s' "$v"
}

# Pin the restic repository (host path) and password of the current stack; values already
# exported win, so the restore drill keeps them after re-pointing the env at an archived .env.
restic_env() {
  local dir
  dir=$(envval BACKUP_DIR)
  export RESTIC_HOST_REPO=${RESTIC_HOST_REPO:-$(realpath -m "${dir:-./backups}")/restic}
  export RESTIC_PASSWORD=${RESTIC_PASSWORD:-$(envval BACKUP_PASSWORD)}
  [[ -n $RESTIC_PASSWORD ]] || die "BACKUP_PASSWORD is not set"
}

# restic_run [docker run options] -- <restic args>: one-off restic container on $RESTIC_HOST_REPO.
restic_run() {
  local opts=()
  while [[ $# -gt 0 && $1 != -- ]]; do
    opts+=("$1")
    shift
  done
  shift
  "$CTR" run --rm -i -e RESTIC_PASSWORD -e RESTIC_REPOSITORY=/repo -v "$RESTIC_HOST_REPO:/repo" \
    "${opts[@]}" "$RESTIC_IMAGE" "$@"
}

# ./.env (interpolation) + ./server.env; project name pinned inside .env.
use_prod() {
  export COMPOSE_FILE=compose.yaml:compose.prod.yaml
}

use_dev() {
  # The dev volume's superuser is dev.env's. A shell that sourced a production env (POSTGRES_USER=openu, 2026-10-29)
  # would win the interpolation, and db-init then fails at every boot: dev never takes these from the shell.
  unset POSTGRES_USER POSTGRES_PASSWORD
  export COMPOSE_FILE=compose.yaml:compose.dev.yaml
  export COMPOSE_ENV_FILES=infra/env/dev.env
  export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-ashyq-dev}
}

use_smoke() {
  export COMPOSE_FILE=compose.yaml:compose.prod.yaml:compose.smoke.yaml
  export COMPOSE_ENV_FILES=infra/env/smoke.env
  export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-ashyq-smoke}
  # Writable copy: bootstrap appends the Zitadel PAT.
  export SERVER_ENV_FILE=./tmp/smoke/server.env
  mkdir -p tmp/smoke
  [[ -f $SERVER_ENV_FILE ]] || cp infra/env/smoke.server.env "$SERVER_ENV_FILE"
}

# Stage 2 e2e stand: the smoke stack with web = ashyq-web-2, https at the edge
# (self-signed cert; the session cookie is Secure). Own project and server env.
use_web2() {
  export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-ashyq-web2}
  use_smoke
  export COMPOSE_FILE=$COMPOSE_FILE:compose.web2.yaml
  # Links as in production since the cutover (web-2 serves v2 URLs).
  export PUBLIC_SCHEME=https FORCE_HTTPS=1 WEB_LINKS=v2
  export SERVER_ENV_FILE=./tmp/web2/server.env
  mkdir -p tmp/web2
  [[ -f $SERVER_ENV_FILE ]] || cp infra/env/smoke.server.env "$SERVER_ENV_FILE"
  # Seeded accounts' password: E2E_PASSWORD (CI secret), else the one of the dev stack (`just stack up`).
  local env_file=infra/env/dev.local.env
  if [[ -z ${E2E_PASSWORD:-} ]]; then
    grep -q '^E2E_PASSWORD=.' "$env_file" 2>/dev/null ||
      echo "E2E_PASSWORD=E2e-$(openssl rand -hex 12)-Pw1" >>"$env_file"
    E2E_PASSWORD=$(sed -n 's/^E2E_PASSWORD=//p' "$env_file" | tail -n 1)
  fi
  export E2E_PASSWORD
}

# Production browser gate: match the image's baked NEXT_PUBLIC_* domain without contacting production.
use_web_e2e() {
  export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-ashyq-web-e2e}
  use_web2
  export COMPOSE_FILE=$COMPOSE_FILE:compose.web-e2e.yaml
  export NGINX_SERVER_NAME=${E2E_WEB_HOST:?set E2E_WEB_HOST to the image build domain}
  export TLS_DIR=./tmp/web-e2e/certs WEB_LINKS=legacy STACK_ENV_FILE=./infra/env/smoke.env
  export SERVER_ENV_FILE=./tmp/web-e2e/server.env
  mkdir -p tmp/web-e2e
  [[ -f $SERVER_ENV_FILE ]] || cp infra/env/smoke.server.env "$SERVER_ENV_FILE"
  export BACKUP_DIR=./tmp/restore-test-archives
}

use_stack() {
  case "${STACK:-prod}" in
    prod) use_prod ;;
    dev) use_dev ;;
    smoke) use_smoke ;;
    web2) use_web2 ;;
    web-e2e) use_web_e2e ;;
    *) die "STACK must be dev, prod, smoke, web2 or web-e2e (got '$STACK')" ;;
  esac
}
