# Single entry point for the stack. File/env selection: infra/scripts/lib.sh.
# Stacks: dev (server deps on 127.0.0.1), smoke (full prod-like, plain http on
# ashyq.test), prod (this checkout on the prod host).

set shell := ["bash", "-cu"]

lib := "source infra/scripts/lib.sh"
# Self-signed end-entity cert (CA:FALSE: rustls rejects a CA cert as the server's own, web2 stand);
# regenerated when missing, a CA, or expiring within a day.
smoke_cert := "mkdir -p tmp/smoke/certs tmp/smoke/acme tmp/smoke/backups && { { openssl x509 -in tmp/smoke/certs/cert.pem -noout -checkend 86400 && openssl x509 -in tmp/smoke/certs/cert.pem -noout -ext basicConstraints | grep -q CA:FALSE; } >/dev/null 2>&1 || MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=ashyq.test -addext subjectAltName=DNS:ashyq.test -addext basicConstraints=critical,CA:FALSE -addext extendedKeyUsage=serverAuth -keyout tmp/smoke/certs/key.pem -out tmp/smoke/certs/cert.pem 2>/dev/null; }"

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
    {{ lib }} && use_smoke && compose down -v --remove-orphans && rm -f tmp/smoke/server.env

smoke origin="http://ashyq.test":
    STACK=smoke SMOKE_RESOLVE_IP="${SMOKE_RESOLVE_IP:-127.0.0.1}" bash infra/scripts/smoke.sh {{ origin }}

# Stage 2 e2e stand (docs/INFRA.md): smoke stack + ashyq-web-2, https on ashyq.test.
# Images: IMAGE_TAG (+ IMAGE_REPO=localhost for local builds) or WEB2_IMAGE.
web2-stand-up:
    {{ smoke_cert }}
    STACK=web2 bash infra/scripts/bootstrap.sh
    {{ lib }} && use_web2 && compose up -d --wait

# seed-e2e (S-03) in the server container; password: E2E_PASSWORD, else tmp/web2/e2e-password.
web2-seed:
    {{ lib }} && use_web2 && compose exec -T -e AB__ENVIRONMENT=development -e E2E_PASSWORD server ashyq admin seed-e2e

# Playwright against the stand (args: playwright's, e.g. e2e/specs/auth.spec.ts). The host must
# resolve ashyq.test to 127.0.0.1; WEB2_E2E_IN_NETWORK=1 runs it in a container on the stand network.
web2-e2e *args:
    #!/usr/bin/env bash
    source infra/scripts/lib.sh
    use_web2
    # E2E_API_LOG: without a mailer the API logs verification codes while the suite runs.
    compose logs -f --no-color server >tmp/web2/server.log 2>&1 &
    trap "kill $! 2>/dev/null" EXIT
    e2e_env=(E2E_BASE_URL=https://ashyq.test E2E_INSECURE=1 E2E_PASSWORD="$E2E_PASSWORD")
    if [[ -z ${WEB2_E2E_IN_NETWORK:-} ]]; then
        cd apps/web-2
        env "${e2e_env[@]}" E2E_API_LOG=../../tmp/web2/server.log \
            NODE_EXTRA_CA_CERTS=../../tmp/smoke/certs/cert.pem bun run e2e {{ args }}
    else
        root=$(pwd -W 2>/dev/null || pwd)
        pw=$(sed -n 's/.*"@playwright\/test": "\(.*\)".*/\1/p' apps/web-2/package.json)
        e2e_env+=(E2E_API_LOG=/stand/web2/server.log NODE_EXTRA_CA_CERTS=/stand/smoke/certs/cert.pem)
        "$CTR" run --rm --network "${COMPOSE_PROJECT_NAME}_edge-net" --ipc host \
            -v "$root/apps/web-2:/app" -v "$root/tmp:/stand:ro" -w /app \
            $(printf -- '-e %s ' "${e2e_env[@]}") \
            "mcr.microsoft.com/playwright:v$pw-noble" \
            node node_modules/@playwright/test/cli.js test -c e2e/playwright.config.ts {{ args }}
    fi

web2-stand-down:
    {{ lib }} && use_web2 && compose down -v --remove-orphans && rm -rf tmp/web2

# What the infra-gates CI job runs: compose config for every stack, bash -n, nginx -t.
ci-infra:
    #!/usr/bin/env bash
    source infra/scripts/lib.sh
    (use_dev; compose config -q)
    (use_prod; COMPOSE_ENV_FILES=infra/env/prod.env.example SERVER_ENV_FILE=./infra/env/server.env.example \
        IMAGE_TAG=ci compose config -q)
    (use_smoke; IMAGE_TAG=ci compose config -q)
    (use_web2; IMAGE_TAG=ci compose config -q)
    log "compose config ok: dev, prod, smoke, web2"
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
