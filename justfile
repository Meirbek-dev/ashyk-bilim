# Single entry point for the stack. File/env selection: infra/scripts/lib.sh.
# Stacks: dev (server deps on 127.0.0.1), smoke (full prod-like, plain http on
# ashyq.test), e2e (smoke files, https, own project), prod (this checkout on the prod host).

set shell := ["bash", "-cu"]

lib := "source infra/scripts/lib.sh"
# Self-signed end-entity cert (CA:FALSE: rustls rejects a CA cert as the server's own, e2e stand);
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

# e2e stand (docs/INFRA.md): the smoke files in project ashyq-e2e, https on ashyq.test.
# Images: IMAGE_TAG (+ IMAGE_REPO=localhost for local builds); WEB_IMAGE overrides the web.
web-stand-up:
    {{ smoke_cert }}
    STACK=e2e bash infra/scripts/bootstrap.sh
    {{ lib }} && use_e2e && compose up -d --wait

# Verified pool accounts e2e-learner-NNN the suite takes instead of self-registering (capped per hour).
e2e_learners := env("E2E_LEARNERS", "250")

# seed-e2e (S-03) in the server container; password: E2E_PASSWORD, else tmp/e2e/e2e-password.
web-seed:
    {{ lib }} && use_e2e && compose exec -T -e AB__ENVIRONMENT=development -e E2E_PASSWORD server ashyq admin seed-e2e --learners {{ e2e_learners }}

# Playwright against the stand (args: playwright's, e.g. e2e/specs/auth.spec.ts). The host must
# resolve ashyq.test to 127.0.0.1; WEB_E2E_IN_NETWORK=1 runs it in a container on the stand network.
web-e2e *args:
    #!/usr/bin/env bash
    source infra/scripts/lib.sh
    use_e2e
    # E2E_API_LOG: without a mailer the API logs verification codes while the suite runs.
    compose logs -f --no-color server >tmp/e2e/server.log 2>&1 &
    trap "kill $! 2>/dev/null" EXIT
    # Taken pool accounts are files in tmp/e2e/learners (gone with the stand).
    mkdir -p tmp/e2e/learners
    e2e_env=(E2E_BASE_URL=https://ashyq.test E2E_INSECURE=1 E2E_PASSWORD="$E2E_PASSWORD" E2E_LEARNERS={{ e2e_learners }})
    if [[ -z ${WEB_E2E_IN_NETWORK:-} ]]; then
        cd apps/web
        env "${e2e_env[@]}" E2E_API_LOG=../../tmp/e2e/server.log E2E_LEARNERS_DIR=../../tmp/e2e/learners \
            NODE_EXTRA_CA_CERTS=../../tmp/smoke/certs/cert.pem bun run e2e {{ args }}
    else
        root=$(pwd -W 2>/dev/null || pwd)
        pw=$(sed -n 's/.*"@playwright\/test": "\(.*\)".*/\1/p' apps/web/package.json)
        e2e_env+=(E2E_API_LOG=/stand/e2e/server.log E2E_LEARNERS_DIR=/learners
            NODE_EXTRA_CA_CERTS=/stand/smoke/certs/cert.pem)
        "$CTR" run --rm --network "${COMPOSE_PROJECT_NAME}_edge-net" --ipc host \
            -v "$root/apps/web:/app" -v "$root/tmp:/stand:ro" -v "$root/tmp/e2e/learners:/learners" -w /app \
            $(printf -- '-e %s ' "${e2e_env[@]}") \
            "mcr.microsoft.com/playwright:v$pw-noble" \
            node node_modules/@playwright/test/cli.js test -c e2e/playwright.config.ts {{ args }}
    fi

web-stand-down:
    {{ lib }} && use_e2e && compose down -v --remove-orphans && rm -rf tmp/e2e

# What the infra-gates CI job runs: compose config for every stack, bash -n, nginx -t.
ci-infra:
    #!/usr/bin/env bash
    source infra/scripts/lib.sh
    (use_dev; compose config -q)
    (use_prod; COMPOSE_ENV_FILES=infra/env/prod.env.example SERVER_ENV_FILE=./infra/env/server.env.example \
        IMAGE_TAG=ci compose config -q)
    (use_smoke; IMAGE_TAG=ci compose config -q)
    (use_e2e; IMAGE_TAG=ci compose config -q)
    log "compose config ok: dev, prod, smoke, e2e"
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
