#!/usr/bin/env bash
# Idempotent initialization of the stack in STACK=dev|prod|smoke (default prod):
# data services + init jobs (roles/DBs, Zitadel, buckets), Zitadel PAT into the
# server env, migrations, Judge0 tuning. Safe to re-run; changes nothing when done.
# The app tier is started by `just stack-up` / `just deploy`, not here.
source "$(dirname "$0")/lib.sh"
use_stack
stack=${STACK:-prod}

services=(db redis zitadel rustfs)
judge0=false
if compose config --services | grep -qx judge0-server; then
  judge0=true
  services+=(judge0-server judge0-workers)
fi

log "data services and init jobs: ${services[*]}"
compose up -d --wait "${services[@]}"
# Nothing depends on storage-init in dev, and `up --wait` rejects exited one-shots.
compose run --rm -T storage-init

pat=$(compose run --rm -T --no-deps --entrypoint cat volume-init /machinekey/pat.txt | tr -d '\r') ||
  die "no pat.txt in the zitadel_machinekey volume (see: compose logs zitadel)"
[[ -n $pat ]] || die "pat.txt is empty"

if [[ $stack == dev ]]; then
  mkdir -p tmp/dev
  printf '%s\n' "$pat" >tmp/dev/zitadel-pat.txt
  log "dev ready. Zitadel PAT: tmp/dev/zitadel-pat.txt -> AB__ZITADEL__PAT in apps/server/.env"
  log "migrations: just server migrate"
  exit 0
fi

env_file=${SERVER_ENV_FILE:-server.env}
[[ -f $env_file ]] || die "$env_file is missing (template: infra/env/server.env.example)"
if grep -q '^AB__ZITADEL__PAT=.' "$env_file"; then
  log "AB__ZITADEL__PAT already set in $env_file"
else
  sed -i '/^AB__ZITADEL__PAT=$/d' "$env_file"
  [[ -z $(tail -c 1 "$env_file") ]] || echo >>"$env_file"
  echo "AB__ZITADEL__PAT=$pat" >>"$env_file"
  log "AB__ZITADEL__PAT appended to $env_file"
fi

log "migrations"
compose run --rm -T server-migrate

if $judge0; then
  log "judge0-tune"
  compose run --rm -T --no-deps server admin judge0-tune
fi
log "bootstrap ($stack) done"
