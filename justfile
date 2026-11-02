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
smoke_cert := "mkdir -p tmp/smoke/certs tmp/smoke/acme tmp/smoke/backups/restic && { { openssl x509 -in tmp/smoke/certs/cert.pem -noout -checkend 86400 && openssl x509 -in tmp/smoke/certs/cert.pem -noout -ext basicConstraints | grep -q CA:FALSE; } >/dev/null 2>&1 || MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=ashyq.test -addext subjectAltName=DNS:ashyq.test -addext basicConstraints=critical,CA:FALSE -addext extendedKeyUsage=serverAuth -keyout tmp/smoke/certs/key.pem -out tmp/smoke/certs/cert.pem 2>/dev/null; }"

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

# Rebuild phone icons, sharing artwork and PNG wordmarks from the existing SVG brand.
brand-assets:
    node apps/web/scripts/generate-brand-assets.mjs

# jj runs no git hooks: a failed check undoes the jj commit (`jj op restore`); git runs its own hook.
# Commit with the pre-commit checks under git or jj: `just commit -m "msg" [paths | jj filesets]`.
commit *args:
    @bun infra/dev/hooks.ts commit "$@"

# `jj git push` skips the pre-push check; under jj the bookmark first moves forward to @-.
# Push through git so the pre-push check runs: `just push [bookmark, default main]`.
push *args:
    @bun infra/dev/hooks.ts push "$@"

# Scaffold a slice: `just new feature <name>` (web-2), `endpoint <tag> <op>` (server test + checklist), `migration <name>`.
new *args:
    @bun infra/dev/new.ts "$@"

# Parallel work in ../ashyq-wt/<name> (own bun install and cargo target dir): `just wt new|ls|land|rm <name>`.
wt *args:
    bun infra/dev/wt.ts "$@"

# Claude compatibility copies are generated; edit only .agents/skills.
skills-sync:
    node infra/scripts/sync-skills.mjs

# Check prerequisites in the actual recipe shell (not the calling PowerShell).
doctor:
    {{ bash_bin }} infra/scripts/doctor.sh {{ just_bin }}

# The gates for what changed vs origin/main plus the working tree (`--staged`: the index; `--wip`: only the
# uncommitted batch, mid-edit; `--base <ref>`; `--all`: every gate). One line per gate; logs in tmp/check/.
# The pre-push hook runs it.
check *args:
    @bun infra/dev/check.ts "$@"

# Export openapi.v2.json, accept its snapshots, regenerate both web clients, list the drift (tmp/contract/).
contract:
    @bun infra/dev/contract.ts

# Throwaway databases and SQL: `just db template | fresh <name> | drop <name> | test-reset | ls | sql [--slot N] [--rw] "<sql>"`
# (sql reads as ashyq_ro: no emails or secrets; --rw writes as the owner).
db *args:
    @bun infra/dev/db.ts "$@"

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
    {{ just_bin }} web2 g15
    {{ just_bin }} web2 build

# Regression checks for this development workflow; no containers required.
test-dev:
    JUST_EXECUTABLE={{ just_bin }} node --test infra/tests/development.test.mjs
    bun test ./infra/dev

# Server dependencies (db redis zitadel rustfs) + init jobs; prints the Zitadel PAT path.
dev-up:
    STACK=dev {{ bash_bin }} infra/scripts/bootstrap.sh

dev-down:
    {{ lib }} && use_dev && compose down

# Drop the dev stack and its volumes.
dev-reset:
    {{ lib }} && use_dev && compose down -v --remove-orphans

# The code runner for the dev stack (profile runner: go-judge, privileged; the ~2 GB image is built
# from infra/runner on first use), on DEV_RUNNER_PORT.
dev-runner:
    {{ lib }} && use_dev && COMPOSE_PROFILES=runner compose up -d --build --wait runner

# Apps of one slot (API, worker, web-2 dev, legacy dev; ports 8000/3100/3200 + 10*slot) under a
# supervisor, containers via dev-up: `just stack up|down|status|logs|restart [..] [slot]` (no args: usage).
stack *args:
    @JUST_EXECUTABLE={{ just_bin }} bun infra/dev/stack.ts "$@"

# `ab_session=...` for an existing account on a running slot (dev-only endpoint, no password).
login-as user slot="0":
    @bun infra/dev/stack.ts login-as "$@"

# Public media a restored database points at but local storage lacks, copied from production's /content/
# (read-only GETs): `just restore-media [--slot N] [--sample 20] [--max-mb 50] [--activity <id>]`.
restore-media *args:
    @bun infra/dev/media.ts "$@"

# Screenshots of web-2 pages on a running slot as real accounts (`--ref HEAD`: that commit's web-2, the "before"):
# `just shoot [--slot N] --pages p.json | --page name=/path [--as login] [--filter re] [--widths] [--modes] [--label]`.
shoot *args:
    @bun infra/dev/shoot.ts "$@"

# Playwright against a production build + own API on a fresh database (cloned from ashyq_seed):
# `just e2e [web2|web] [--slot N] [--keep] [--no-build] [--changed] [playwright args]` (`--changed`: the web-2 specs the
# diff reaches). Logs: tmp/e2e/<app>-<slot>/
e2e *args:
    @JUST_EXECUTABLE={{ just_bin }} bun infra/dev/e2e.ts "$@"

# Playwright against a running slot's dev servers: `just e2e-dev [web2|web] [--slot N] [playwright args]`.
e2e-dev *args:
    @JUST_EXECUTABLE={{ just_bin }} bun infra/dev/e2e.ts --dev "$@"

# One long-lived watcher; emits changes only, exits with the run's result.
ci-watch run:
    @bun infra/dev/ci-watch.ts {{ run }}

# Preserve successful jobs/shards; retry only failed/cancelled jobs and their dependents.
ci-retry run:
    @gh run rerun {{ run }} --failed

# The state before work in one call: vcs, stack, last check/e2e, owner questions, production health.
brief:
    @bun infra/dev/brief.ts

# Sizes agents read, build and keep green (code, tables, operations, docs, skills, tooling): `just metrics [--json]`.
metrics *args:
    @bun infra/dev/metrics.ts "$@"

# Read-only production health on its host (errors by message, 5xx by route, dead jobs): `just prod-report [--since 24h]`.
prod-report *args:
    @bun infra/dev/prod-report.ts "$@"

# Old e2e stands and logs; `--deep` also cargo incremental/coverage caches (`--dry-run` lists): `just clean [--deep]`.
clean *args:
    @bun infra/dev/clean.ts "$@"

# Bounded log/trace excerpts; complete originals stay on disk.
diagnose *args:
    @bun infra/dev/diagnose.ts "$@"

# Idempotent init of the stack in $STACK (dev|prod|smoke, default prod).
bootstrap:
    {{ bash_bin }} infra/scripts/bootstrap.sh

# Full prod-like stack from scratch (needs IMAGE_TAG; WEB_IMAGE swaps the web app).
stack-up:
    {{ smoke_cert }}
    STACK=smoke {{ bash_bin }} infra/scripts/bootstrap.sh
    {{ lib }} && use_smoke && compose up -d --wait

# The WAL archive goes too: the next stack is a new cluster, and the old archive would refuse its WAL. Its files
# are the container postgres user's, hence the one-off pitr-init.
stack-down:
    {{ lib }} && use_smoke && { compose run --rm --no-deps -T --entrypoint sh pitr-init -c 'rm -rf /pitr/* /pitr-zitadel/*' || true; } && compose down -v --remove-orphans && rm -f tmp/smoke/server.env

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

# seed-e2e (S-03) in the server container; password: E2E_PASSWORD, else infra/env/dev.local.env's.
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
        "$CTR" run --rm --init --network "${COMPOSE_PROJECT_NAME}_edge-net" --ipc host \
            -v "$root/apps/web-2:/app" -v "$root/tmp:/stand:ro" -v "$root/tmp/web2/learners:/learners" -w /app \
            $(printf -- '-e %s ' "${e2e_env[@]}") \
            -e CI -e PWTEST_SHARD_WEIGHTS -e PLAYWRIGHT_HTML_OPEN \
            "mcr.microsoft.com/playwright:v$pw-noble" \
            node node_modules/@playwright/test/cli.js test -c e2e/playwright.config.ts "$@"
    fi

web2-stand-down:
    {{ lib }} && use_web2 && compose down -v --remove-orphans && rm -rf tmp/web2

# Exact production image, isolated at its baked domain (E2E_WEB_HOST).
web-release-e2e action *args:
    {{ bash_bin }} infra/scripts/web-e2e.sh "$@"

redis-test:
    {{ bash_bin }} infra/tests/redis-persistence.sh

# Infra gates: compose config, shell syntax, database roles, PITR, nginx, dual-web routing, Redis persistence
# with backup mounted and the Zitadel database move.
[script]
ci-infra:
    source infra/scripts/lib.sh
    (use_dev; compose config -q)
    (use_prod; COMPOSE_ENV_FILES=infra/env/prod.env.example SERVER_ENV_FILE=./infra/env/server.env.example \
        IMAGE_TAG=ci compose config -q)
    (use_smoke; IMAGE_TAG=ci compose config -q)
    (use_web2; IMAGE_TAG=ci compose config -q)
    (export E2E_WEB_HOST=ashyq.test; use_web_e2e; IMAGE_TAG=ci compose config -q)
    log "compose config ok: dev, prod, smoke, web2, web-e2e"
    for f in infra/scripts/*.sh infra/storage/*.sh infra/tests/*.sh infra/postgres/*.sh; do {{ bash_bin }} -n "$f"; done
    log "bash -n ok"
    {{ bash_bin }} infra/tests/rollback-rule.sh
    if [[ -z $CTR ]]; then log "no container runtime: nginx -t skipped"; exit 0; fi
    # Least-privilege roles and point-in-time recovery on throwaway Postgres containers (no network): no address pool.
    {{ bash_bin }} infra/tests/db-roles.sh
    {{ bash_bin }} infra/tests/pitr.sh
    # A shared daemon can run out of bridge subnets (31 default pools, ai-server 2026-10-31): the stack checks below
    # need networks of their own, so they are skipped here and run in hosted CI.
    if ! probe=$("$CTR" network create "ashyq-ci-probe-$$" 2>&1); then
        if [[ $probe == *"address pools"* ]]; then
            log "no free container network address pool: nginx -t, dual-web and redis checks skipped (CI runs them)"
            exit 0
        fi
        echo "$probe" >&2
        exit 1
    fi
    "$CTR" network rm "ashyq-ci-probe-$$" >/dev/null
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
    {{ bash_bin }} infra/tests/dual-web.sh
    {{ bash_bin }} infra/tests/redis-persistence.sh
    {{ bash_bin }} infra/tests/zitadel-db-move.sh

preflight *args:
    {{ bash_bin }} infra/scripts/preflight.sh "$@"

deploy *args:
    {{ bash_bin }} infra/scripts/deploy.sh "$@"

rollback *args:
    {{ bash_bin }} infra/scripts/rollback.sh "$@"

# Run the nightly backup now: dumps, then an incremental restic snapshot.
backup:
    {{ bash_bin }} infra/scripts/backup.sh

# restic on the production repository, e.g. `just restic snapshots`, `just restic stats latest`.
restic *args:
    {{ lib }} && use_prod && compose run --rm -T --no-deps backup "$@"

restore archive:
    {{ bash_bin }} infra/scripts/restore.sh "$@"

# Point-in-time recovery of the production cluster in place from the WAL archive (RUNBOOK 3.14):
# `just pitr-restore '2026-11-02 10:15:00+05' [base]` or `just pitr-restore latest`.
pitr-restore target *base:
    {{ bash_bin }} infra/scripts/pitr-restore.sh "$@"

# Rehearse WAL archiving, a base backup and point-in-time recovery on throwaway containers (no network).
pitr-test:
    {{ bash_bin }} infra/tests/pitr.sh

# Move Zitadel's database from the app's db into its own instance zitadel-db (RUNBOOK 3.15); `--back` undoes it.
zitadel-db-move *args:
    {{ bash_bin }} infra/scripts/zitadel-db-move.sh "$@"

# Rehearse the move, the way back and a fresh install on a throwaway project (production files, no ports).
zitadel-db-move-test:
    {{ bash_bin }} infra/tests/zitadel-db-move.sh

restore-drill *archive:
    {{ bash_bin }} infra/scripts/restore-drill.sh "$@"

# Synthetic backup integrity on the isolated production browser stand; never uses production archives.
restore-test:
    {{ bash_bin }} infra/scripts/restore-test.sh

# Regenerate docs/agents/SCHEMA.md from the migrations (a test template on the dev Postgres); the server suite
# fails while it is stale.
schema-docs:
    UPDATE_SCHEMA_DOCS=1 {{ just_bin }} server test --no-capture -E 'binary(schema_docs) & test(schema_docs_match_the_migrations)'

# Recipes of apps/server/justfile against the dev stack (just server test).
server *args:
    export TEST_REDIS_URL="${TEST_REDIS_URL:-$(sed -n 's/^TEST_REDIS_URL=//p' infra/env/dev.env)}" && cd apps/server && {{ just_bin }} "$@"

# Scripts of apps/web/package.json (just web dev).
web *args:
    bun run --cwd apps/web "$@"

# Scripts of the replacement frontend (just web2 test --project unit).
web2 *args:
    bun run --cwd apps/web-2 "$@"
