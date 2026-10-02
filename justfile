# Single entry point for the stack. File/env selection: infra/scripts/lib.sh.
# Stacks: dev (server deps on 127.0.0.1), smoke (full prod-like, plain http on
# ashyq.test), prod (this checkout on the prod host).

set shell := ["bash", "-cu"]

lib := "source infra/scripts/lib.sh"
smoke_cert := "mkdir -p tmp/smoke/certs tmp/smoke/acme tmp/smoke/backups && { [ -f tmp/smoke/certs/cert.pem ] || MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=ashyq.test -addext subjectAltName=DNS:ashyq.test -keyout tmp/smoke/certs/key.pem -out tmp/smoke/certs/cert.pem 2>/dev/null; }"

default:
    @just --list

# Server dependencies (db redis zitadel rustfs) + init jobs; prints the Zitadel PAT path.
dev-up:
    STACK=dev bash infra/scripts/bootstrap.sh

dev-down:
    {{ lib }} && use_dev && compose down

# Drop the dev stack and its volumes.
dev-reset:
    {{ lib }} && use_dev && compose down -v --remove-orphans

# Idempotent init of the stack in $STACK (dev|prod|smoke, default prod).
bootstrap:
    bash infra/scripts/bootstrap.sh

# Full prod-like stack from scratch (needs IMAGE_TAG; WEB_IMAGE swaps the web app).
stack-up:
    {{ smoke_cert }}
    STACK=smoke bash infra/scripts/bootstrap.sh
    {{ lib }} && use_smoke && compose up -d --wait

stack-down:
    {{ lib }} && use_smoke && compose down -v --remove-orphans

smoke origin="http://ashyq.test":
    STACK=smoke SMOKE_RESOLVE_IP="${SMOKE_RESOLVE_IP:-127.0.0.1}" bash infra/scripts/smoke.sh {{ origin }}

# What the infra-gates CI job runs: compose config for every stack, bash -n, nginx -t.
ci-infra:
    #!/usr/bin/env bash
    source infra/scripts/lib.sh
    (use_dev; compose config -q)
    (use_prod; COMPOSE_ENV_FILES=infra/env/prod.env.example SERVER_ENV_FILE=./infra/env/server.env.example \
        IMAGE_TAG=ci compose config -q)
    (use_smoke; IMAGE_TAG=ci compose config -q)
    log "compose config ok: dev, prod, smoke"
    for f in infra/scripts/*.sh infra/storage/*.sh; do bash -n "$f"; done
    log "bash -n ok"
    if [[ -z $CTR ]]; then log "no container runtime: nginx -t skipped"; exit 0; fi
    {{ smoke_cert }}
    use_smoke
    export COMPOSE_PROJECT_NAME=ashyq-ci IMAGE_TAG=ci
    trap 'compose down -v >/dev/null 2>&1' EXIT
    compose run --rm --no-deps -T nginx nginx -t

preflight *args:
    bash infra/scripts/preflight.sh {{ args }}

deploy *args:
    bash infra/scripts/deploy.sh {{ args }}

rollback *args:
    bash infra/scripts/rollback.sh {{ args }}

# Run the nightly backup now.
backup:
    {{ lib }} && use_prod && compose exec backup backup

restore archive:
    bash infra/scripts/restore.sh {{ archive }}

restore-drill *archive:
    bash infra/scripts/restore-drill.sh {{ archive }}

# Recipes of apps/server/justfile against the dev stack (just server test).
server *args:
    export TEST_REDIS_URL="${TEST_REDIS_URL:-$(sed -n 's/^TEST_REDIS_URL=//p' infra/env/dev.env)}" && cd apps/server && just {{ args }}

# Scripts of apps/web/package.json (just web dev).
web *args:
    bun run --cwd apps/web {{ args }}
