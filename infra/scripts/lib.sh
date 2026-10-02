# shellcheck shell=bash
# Sourced by every infra script: strict mode, ROOT (cwd = repo root), log/die,
# `compose` (docker compose, else podman compose; env passes through) and the
# stack selectors use_prod / use_dev / use_smoke / use_stack ($STACK).
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

export COMPOSE_PATH_SEPARATOR=:
# The db image (pinned in compose.yaml) doubles as the toolbox: zstd, GNU tar, psql.
# shellcheck disable=SC2034 # used by the sourcing scripts
PG_IMAGE=$(sed -n 's/.*image: &pg-image //p' compose.yaml)

# ./.env (interpolation) + ./server.env; project name pinned inside .env.
use_prod() {
  export COMPOSE_FILE=compose.yaml:compose.prod.yaml
}

use_dev() {
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

use_stack() {
  case "${STACK:-prod}" in
    prod) use_prod ;;
    dev) use_dev ;;
    smoke) use_smoke ;;
    *) die "STACK must be dev, prod or smoke (got '$STACK')" ;;
  esac
}
