# Single entry point for the stack. File/env selection: infra/scripts/lib.sh.
# Stacks: dev (server deps on 127.0.0.1), smoke (full prod-like, plain http on
# ashyq.test), prod (this checkout on the prod host).

[unix]
set shell := ["bash", "-cu"]
[windows]
set shell := ["sh", "-cu"]
[unix]
set script-interpreter := ["bash", "-eu"]
[windows]
set script-interpreter := ["sh", "-eu"]
set positional-arguments := true

just_bin := quote(replace(just_executable(), '\\', '/'))
bash_bin := if os() == "windows" { "/usr/bin/bash" } else { "bash" }

lib := "source infra/scripts/lib.sh"
# Self-signed end-entity cert (CA:FALSE: rustls rejects a CA cert as the server's own, web2 stand);
# regenerated when missing, a CA, or expiring within a day.
smoke_cert := "mkdir -p tmp/smoke/certs tmp/smoke/acme tmp/smoke/backups && { { openssl x509 -in tmp/smoke/certs/cert.pem -noout -checkend 86400 && openssl x509 -in tmp/smoke/certs/cert.pem -noout -ext basicConstraints | grep -q CA:FALSE; } >/dev/null 2>&1 || MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=ashyq.test -addext subjectAltName=DNS:ashyq.test -addext basicConstraints=critical,CA:FALSE -addext extendedKeyUsage=serverAuth -keyout tmp/smoke/certs/key.pem -out tmp/smoke/certs/cert.pem 2>/dev/null; }"

default:
    @{{ just_bin }} --list

# Install pinned tools/dependencies and the commit gate. Needs Git Bash on Windows.
setup: setup-server setup-web setup-web2
    {{ just_bin }} doctor

# One app only (setup-web, setup-web2 likewise); `just doctor` checks the full set.
setup-server: _setup-repo
    {{ just_bin }} server setup

setup-web: _setup-repo
    bun install --frozen-lockfile

# Chromium: the vitest browser project in verify (Playwright e2e may need more browsers).
setup-web2: _setup-repo
    cd apps/web-2 && bun install --frozen-lockfile && bun run codegen messages && bunx playwright install chromium

_setup-repo: skills-sync
    git config --local core.hooksPath .vite-hooks

# Rewrite CRLF working copies of unmodified text files as LF (Windows tools; sqlx checksums migrations).
eol:
    bun infra/dev/eol.ts

# Format files the way the commit hook checks them (same result from any cwd): web files, infra/dev, .rs.
fmt +files:
    bun infra/dev/hooks.ts fmt "$@"

# Claude compatibility copies are generated; edit only .agents/skills.
skills-sync:
    node infra/scripts/sync-skills.mjs

# Check prerequisites in the actual recipe shell (not the calling PowerShell).
doctor:
    {{ bash_bin }} infra/scripts/doctor.sh {{ just_bin }}

# All local application and infra gates; needs dependencies and the dev stack.
# Hosted image builds, secret scans and E2E remain separate CI jobs.
ci: ci-server ci-web ci-web2 ci-infra

ci-server:
    {{ just_bin }} server ci

ci-web:
    {{ just_bin }} web lint
    {{ just_bin }} web typecheck
    {{ just_bin }} web test
    {{ just_bin }} web check:contracts
    {{ just_bin }} web check:error-codes
    {{ just_bin }} web check:messages

ci-web2:
    {{ just_bin }} web2 verify
    {{ just_bin }} web2 build

# Regression checks for this development workflow; no containers required.
test-dev:
    JUST_EXECUTABLE={{ just_bin }} node --test infra/tests/development.test.mjs

# Server dependencies (db redis zitadel rustfs) + init jobs; prints the Zitadel PAT path.
dev-up:
    STACK=dev {{ bash_bin }} infra/scripts/bootstrap.sh

dev-down:
    {{ lib }} && use_dev && compose down

# Drop the dev stack and its volumes.
dev-reset:
    {{ lib }} && use_dev && compose down -v --remove-orphans

# Idempotent init of the stack in $STACK (dev|prod|smoke, default prod).
bootstrap:
    {{ bash_bin }} infra/scripts/bootstrap.sh

# Full prod-like stack from scratch (needs IMAGE_TAG; WEB_IMAGE swaps the web app).
stack-up:
    {{ smoke_cert }}
    STACK=smoke {{ bash_bin }} infra/scripts/bootstrap.sh
    {{ lib }} && use_smoke && compose up -d --wait

stack-down:
    {{ lib }} && use_smoke && compose down -v --remove-orphans && rm -f tmp/smoke/server.env

smoke origin="http://ashyq.test":
    STACK=smoke SMOKE_RESOLVE_IP="${SMOKE_RESOLVE_IP:-127.0.0.1}" {{ bash_bin }} infra/scripts/smoke.sh "$@"

# Stage 2 e2e stand (docs/INFRA.md): smoke stack + ashyq-web-2, https on ashyq.test.
# Images: IMAGE_TAG (+ IMAGE_REPO=localhost for local builds) or WEB2_IMAGE.
web2-stand-up:
    {{ smoke_cert }}
    STACK=web2 {{ bash_bin }} infra/scripts/bootstrap.sh
    {{ lib }} && use_web2 && compose up -d --wait

# Verified pool accounts e2e-learner-NNN the suite takes instead of self-registering (capped per hour).
e2e_learners := env("E2E_LEARNERS", "250")

# seed-e2e (S-03) in the server container; password: E2E_PASSWORD, else tmp/web2/e2e-password.
web2-seed:
    {{ lib }} && use_web2 && compose exec -T -e AB__ENVIRONMENT=development -e E2E_PASSWORD server ashyq admin seed-e2e --learners {{ e2e_learners }}

# Playwright against the stand (args: playwright's, e.g. e2e/specs/auth.spec.ts). The host must
# resolve ashyq.test to 127.0.0.1; WEB2_E2E_IN_NETWORK=1 runs it in a container on the stand network.
[script]
web2-e2e *args:
    source infra/scripts/lib.sh
    use_web2
    # E2E_API_LOG: without a mailer the API logs verification codes while the suite runs.
    compose logs -f --no-color server >tmp/web2/server.log 2>&1 &
    trap "kill $! 2>/dev/null" EXIT
    # Taken pool accounts are files in tmp/web2/learners (gone with the stand).
    mkdir -p tmp/web2/learners
    e2e_env=(E2E_BASE_URL=https://ashyq.test E2E_INSECURE=1 E2E_PASSWORD="$E2E_PASSWORD" E2E_LEARNERS={{ e2e_learners }})
    if [[ -z ${WEB2_E2E_IN_NETWORK:-} ]]; then
        cd apps/web-2
        env "${e2e_env[@]}" E2E_API_LOG=../../tmp/web2/server.log E2E_LEARNERS_DIR=../../tmp/web2/learners \
            NODE_EXTRA_CA_CERTS=../../tmp/smoke/certs/cert.pem bun run e2e "$@"
    else
        root=$(pwd -W 2>/dev/null || pwd)
        pw=$(sed -n 's/.*"@playwright\/test": "\(.*\)".*/\1/p' apps/web-2/package.json)
        e2e_env+=(E2E_API_LOG=/stand/web2/server.log E2E_LEARNERS_DIR=/learners
            NODE_EXTRA_CA_CERTS=/stand/smoke/certs/cert.pem)
        "$CTR" run --rm --network "${COMPOSE_PROJECT_NAME}_edge-net" --ipc host \
            -v "$root/apps/web-2:/app" -v "$root/tmp:/stand:ro" -v "$root/tmp/web2/learners:/learners" -w /app \
            $(printf -- '-e %s ' "${e2e_env[@]}") \
            "mcr.microsoft.com/playwright:v$pw-noble" \
            node node_modules/@playwright/test/cli.js test -c e2e/playwright.config.ts "$@"
    fi

web2-stand-down:
    {{ lib }} && use_web2 && compose down -v --remove-orphans && rm -rf tmp/web2

# What the infra-gates CI job runs: compose config for every stack, bash -n, nginx -t.
[script]
ci-infra:
    source infra/scripts/lib.sh
    (use_dev; compose config -q)
    (use_prod; COMPOSE_ENV_FILES=infra/env/prod.env.example SERVER_ENV_FILE=./infra/env/server.env.example \
        IMAGE_TAG=ci compose config -q)
    (use_smoke; IMAGE_TAG=ci compose config -q)
    (use_web2; IMAGE_TAG=ci compose config -q)
    log "compose config ok: dev, prod, smoke, web2"
    for f in infra/scripts/*.sh infra/storage/*.sh; do {{ bash_bin }} -n "$f"; done
    log "bash -n ok"
    if [[ -z $CTR ]]; then log "no container runtime: nginx -t skipped"; exit 0; fi
    {{ smoke_cert }}
    use_smoke
    export COMPOSE_PROJECT_NAME=ashyq-ci-$$ IMAGE_TAG=ci
    export COMPOSE_FILE=$COMPOSE_FILE:infra/compose.nginx-check.yaml
    trap 'compose down -v >/dev/null 2>&1' EXIT
    # Detached: Podman's Compose provider cannot attach this one-off on Windows.
    check_id=$(compose run -d --no-deps nginx nginx -t)
    status=$("$CTR" wait "$check_id")
    "$CTR" logs "$check_id"
    "$CTR" rm "$check_id" >/dev/null
    [[ $status == 0 ]]

preflight *args:
    {{ bash_bin }} infra/scripts/preflight.sh "$@"

deploy *args:
    {{ bash_bin }} infra/scripts/deploy.sh "$@"

rollback *args:
    {{ bash_bin }} infra/scripts/rollback.sh "$@"

# Run the nightly backup now.
backup:
    {{ lib }} && use_prod && compose exec backup backup

restore archive:
    {{ bash_bin }} infra/scripts/restore.sh "$@"

restore-drill *archive:
    {{ bash_bin }} infra/scripts/restore-drill.sh "$@"

# Recipes of apps/server/justfile against the dev stack (just server test).
server *args:
    export TEST_REDIS_URL="${TEST_REDIS_URL:-$(sed -n 's/^TEST_REDIS_URL=//p' infra/env/dev.env)}" && cd apps/server && {{ just_bin }} "$@"

# Scripts of apps/web/package.json (just web dev).
web *args:
    bun run --cwd apps/web "$@"

# Scripts of the replacement frontend (just web2 test --project unit).
web2 *args:
    bun run --cwd apps/web-2 "$@"
