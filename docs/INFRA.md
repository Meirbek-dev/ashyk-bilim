# Infrastructure (as built)

Production runs the Rust API and Next.js frontend at `cs-mooc.tou.edu.kz`
from `~/cs-mooc`, behind the university TLS proxy. The replacement
TanStack frontend is pending cutover (`docs/STAGE-2-CUTOVER.md`).
Operations: `docs/RUNBOOK.md`; design rationale: `docs/DECISIONS.md`.

## Layout

```
compose.yaml          shared tier: db, redis, zitadel, rustfs, judge0-* (profile judge0), init jobs
compose.prod.yaml     nginx, web, web2 (profile dual-web), server, worker, server-migrate, backup; prod overrides
compose.dev.yaml      dev overrides: ports on 127.0.0.1, data-net and exec-net not internal
compose.smoke.yaml    smoke overrides: nginx ports on 127.0.0.1 only
compose.web2.yaml     Stage 2 e2e stand: web = ashyq-web-2
compose.web-e2e.yaml  production web image stand at its baked domain
justfile              single entry point (`just --list`)
infra/
  env/                prod.env.example, server.env.example, dev.env, smoke.env, smoke.server.env
  nginx/              nginx.conf, nginx.conf.template, routes.conf, security-headers.conf
  postgres/           init.sql (db-init job), transfer-ownership.sql (legacy restores only)
  judge0/             judge0.conf (non-default, non-secret settings only)
  storage/            init.sh (storage-init job), cors.json.template, public-policy.json
  host/               backup.service, backup.timer (nightly systemd timer)
  smoke/stub-web/     stand-in web image for the edge-independence smoke (R-09)
  compose.*-check.yaml  overlays for the ci-infra nginx, dual-web and Redis checks
  tests/              dual-web.sh, redis-persistence.sh, restore fixtures, development.test.mjs
  scripts/            lib.sh, bootstrap, deploy, rollback, preflight, smoke, backup, restore,
                      restore-drill, restore-test, web-e2e, renew-certificate, split-env, doctor
  dev/                Bun dev tooling behind `just stack|e2e|check|db|wt|...` (RUNBOOK 5)
.github/workflows/ci.yaml   gates, images, stack smoke, e2e, publish
```

Ops recipes: `bootstrap`, `preflight`, `deploy`, `rollback`, `backup`, `restic`, `restore`,
`restore-drill`. Stacks: `dev-up`, `dev-down`, `dev-reset`, `dev-judge0`, `stack-up`, `stack-down`,
`smoke`, `web2-stand-up`/`-seed`/`-e2e`/`-stand-down`, `web-release-e2e`, `restore-test`, `ci-infra`.
App recipes: `server *args` (`apps/server/justfile`, with `TEST_REDIS_URL` from `dev.env`), `web *args`,
`web2 *args`.

## Stacks

`infra/scripts/lib.sh` is sourced by every script and recipe. It `cd`s to the
repo root, sets `set -euo pipefail`, `MSYS_NO_PATHCONV=1` (Git Bash) and
`COMPOSE_PATH_SEPARATOR=:`, picks `docker`, else `podman` (`compose` =
`$CTR compose`), reads the pinned db and restic images into `PG_IMAGE` and
`RESTIC_IMAGE`, and provides the selectors below. `use_stack` maps
`STACK=dev|prod|smoke|web2|web-e2e` (default `prod`).

| Stack | `COMPOSE_FILE` | Interpolation env | Server env | Project | Recipes |
| --- | --- | --- | --- | --- | --- |
| dev | `compose.yaml:compose.dev.yaml` | `infra/env/dev.env` (`COMPOSE_ENV_FILES`); the shell's `POSTGRES_USER`/`POSTGRES_PASSWORD` are ignored | none: the apps run on the host (RUNBOOK 5.3) | `ashyq-dev` | `dev-up`, `dev-down`, `dev-reset`, `dev-judge0` |
| smoke | `compose.yaml:compose.prod.yaml:compose.smoke.yaml` | `infra/env/smoke.env` | `tmp/smoke/server.env` (copied from `infra/env/smoke.server.env`) | `ashyq-smoke` | `stack-up`, `smoke`, `stack-down` |
| web2 | smoke files + `compose.web2.yaml` | `infra/env/smoke.env` | `tmp/web2/server.env` | `ashyq-web2` | `web2-stand-up`, `web2-seed`, `web2-e2e`, `web2-stand-down` |
| web-e2e | web2 files + `compose.web-e2e.yaml` | `infra/env/smoke.env` | `tmp/web-e2e/server.env` | `ashyq-web-e2e` | `web-release-e2e up\|seed\|test\|down`, `restore-test` |
| prod | `compose.yaml:compose.prod.yaml` | `./.env` (compose default) | `./server.env` | from `.env`: `cs-mooc` | `bootstrap`, `preflight`, `deploy`, `rollback`, `backup`, `restore` |
| drill | prod files | the snapshot's `.env` | the snapshot's `server.env` | `ashyq-drill` | `restore-drill` |

A `COMPOSE_PROJECT_NAME` in the shell overrides the non-prod defaults
(`ci-infra` uses `ashyq-ci-<pid>`, its dual-web check `ashyq-dual-<pid>`).
Smoke serves plain http on `ashyq.test` (`PUBLIC_SCHEME=http`, `FORCE_HTTPS=0`),
self-signed cert in `tmp/smoke/certs`, Judge0 off.

A plain `docker compose` in the checkout reads `compose.yaml` alone (the
shared tier without the prod overlay). Always go through `just` or `lib.sh`.

## Services, networks, trust zones

Networks: `edge-net` (ordinary bridge, has egress), `data-net` (`internal`; dev
makes it non-internal to publish ports), `exec-net` (`internal`; same in dev).

| Service | File | Networks | Notes |
| --- | --- | --- | --- |
| nginx | prod | edge-net, alias `${NGINX_SERVER_NAME}` | the only published ports (`HTTP_PORT`/`HTTPS_PORT`, 80/443) |
| web | prod | edge-net | env: `PUBLIC_ORIGIN`, `INTERNAL_API_URL`, `APP_URL`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`; healthcheck from the image |
| web2 | prod, profile `dual-web` | edge-net | `ashyq-web-2`, env `PUBLIC_ORIGIN`, `INTERNAL_API_URL` ("Dual web") |
| server | prod | edge-net, data-net, exec-net | `env_file: server.env` + `x-server-env`; liveness healthcheck from the image |
| worker | prod | edge-net, data-net, exec-net | same env; healthcheck `true`; `stop_grace_period: 60s` |
| server-migrate | prod, profile `maintenance` | data-net | one-shot `ashyq migrate` |
| db | shared | data-net | `pgvector/pgvector:0.8.7-pg18-trixie` by digest (trixie = glibc collation of the prod cluster); prod adds the `db_dumps` volume |
| db-init | shared | data-net | one-shot `init.sql` as the superuser |
| redis | shared | data-net | `--requirepass` |
| volume-init | shared | none | one-shot: `zitadel_machinekey` to uid 1000, mode 0700 |
| zitadel-init | shared | data-net | one-shot `zitadel init`; the only holder of the Postgres admin login for Zitadel |
| zitadel | shared | data-net | `start-from-setup`, TLS off, no public route; healthcheck `zitadel ready` |
| rustfs | shared | edge-net, data-net | S3; buckets `ab-public`, `ab-private`; data in `${RUSTFS_DATA_DIR:-rustfs_data}` |
| storage-init | shared | data-net | one-shot `infra/storage/init.sh` |
| judge0-server, judge0-workers | shared, profile `judge0` | exec-net | `judge0/judge0:1.13.1`, privileged, `AUTHN_TOKEN` |
| judge0-db, judge0-redis | shared, profile `judge0` | exec-net | Judge0's own Postgres and Redis (passwords set); not backed up |
| backup | prod, profile `backup` | none | `restic/restic`: run by `infra/scripts/backup.sh` and `just restic`, never by `up`; no Docker socket |

Trust zones:

- Internet: only nginx. Zitadel, Postgres, Redis and Judge0 have no public route.
- web: edge-net only. Reaches server, rustfs and nginx; not db, redis, zitadel.
- Judge0: exec-net only. Reaches its own db/redis and is reached by server and
  worker; no path to the app database or Redis, no internet.
- Data stores (data-net): no egress.
- server and worker: all three networks; internet egress (AI providers,
  Resend, OTLP, Google) through edge-net.
- Inside the stack the public hostname resolves to nginx (network alias on
  edge-net). The server signs S3 URLs for the public origin and calls storage
  through it, without NAT loopback or `host-gateway`.

All services log through `x-logging` (json-file, 10 MB x 5). Memory limits:
web 2g (`WEB_MEMORY`), web2 512m; db, server, worker, zitadel, nginx 1g; rustfs 512m; redis 256m.
Nginx uses two workers with its one-CPU quota (`infra/nginx/nginx.conf`),
128k response-header buffers and eight 32k response-body buffers per proxied request.

Volumes (`<project>_<name>`; the names are load-bearing, a rename means empty
volumes): `postgres_data`, `redis_data`, `rustfs_data` (unless `RUSTFS_DATA_DIR`),
`zitadel_machinekey`, `judge0_box` (shared); `nginx_cache`, `nginx_content_cache`,
`db_dumps`, `restic_cache` (prod). Prod also keeps the legacy `app_content` volume
and the legacy `cs_mooc` database (owner decision 2026-10-02: do not drop); nothing
in the stack uses or backs them up.

## Postgres roles and databases

The shared `db` service logs statements taking at least 300 ms to stderr (the
rotating container log), with timestamp, PID, user, database and application.
`PG_LOG_MIN_DURATION_STATEMENT` overrides the threshold in milliseconds (`-1`
disables it; `0` logs every statement). Bound parameter values are suppressed;
SQL text, including any inline literals, is still logged. Startup flags apply to
existing volumes too; changing them requires recreating the `db` container.

| Role | Superuser | Created by | Used by |
| --- | --- | --- | --- |
| `${POSTGRES_USER}` (`cs_mooc` in prod, `postgres` in dev) | yes | initdb on an empty volume | db-init, zitadel-init, backup and pre-deploy dumps (local socket) |
| `ashyq` | no | db-init, password `ASHYQ_DB_PASSWORD`, only if missing; `CREATEDB` when `ASHYQ_DB_CREATEDB=true` (dev, for test databases) | server, worker, server-migrate |
| `zitadel` | no | db-init, password `ZITADEL_DB_PASSWORD`, only if missing | zitadel |
| `judge0` | yes, in `judge0-db` only | judge0-db image | Judge0 |

| Database | Owner | Notes |
| --- | --- | --- |
| `ashyq` (`ASHYQ_DATABASES`; dev: `ashyq_dev,ashyq_test`) | `ashyq` | |
| `zitadel` | `zitadel` | |
| `cs_mooc` (`openu` until 2026-10-25) | `cs_mooc` | prod only, legacy; kept, unused, not backed up |
| `judge0` (in judge0-db) | `judge0` | |

`infra/postgres/init.sql` is idempotent and additive: it never alters an existing role or
database (password changes are manual, RUNBOOK 3.8). It installs `vector` into
`template1`, because pgvector is not a trusted extension and the non-superuser
`ashyq` cannot create it; every later database, including per-test ones,
inherits it.

`infra/postgres/transfer-ownership.sql` hands every object of the current database to
`ashyq` with per-object `ALTER ... OWNER` (PostgreSQL refuses `REASSIGN OWNED`
from the bootstrap superuser), in one transaction, and lists leftovers
(expect 0 rows); extensions stay with the superuser. Only a dump taken before
2026-10-04 (legacy offen archives) restores superuser-owned objects and needs it;
run it as the superuser with server and worker stopped.

## Secrets and config

Two files on the host, both `chmod 600`, git-ignored, both copied into every
backup snapshot (restic-encrypted with `BACKUP_PASSWORD`, local only):

- `./.env` (template `infra/env/prod.env.example`): read only by compose for
  `${VAR}` interpolation. No service has `env_file: .env`.
- `./server.env` (template `infra/env/server.env.example`): `env_file` of
  server, worker and server-migrate. Only `AB__*` plus
  `OTEL_EXPORTER_OTLP_HEADERS`.

Secrets embedded in URLs are hex (`openssl rand -hex 32`).

### `.env`

| Group | Variable | Consumers |
| --- | --- | --- |
| Project | `COMPOSE_PROJECT_NAME=cs-mooc` | compose (volume prefix); preflight checks it is set and its `postgres_data` volume exists |
| | `COMPOSE_PROFILES=judge0` | compose; bootstrap detects Judge0 from it; nginx turns dual web on for `dual-web` |
| Edge | `NGINX_SERVER_NAME` | nginx `server_name` and edge-net alias; server CORS, `WEB_URL`, storage endpoint; web `PUBLIC_ORIGIN`, `APP_URL` and build args; storage-init CORS origin; deploy smoke target |
| | `PUBLIC_SCHEME` (default `https`) | same consumers as above |
| | `FORCE_HTTPS` (default `1`) | nginx :80 redirect |
| | `TRUSTED_PROXY_CIDR` (empty = `127.0.0.1/32`) | nginx `set_real_ip_from` and trusted `X-Forwarded-Proto` |
| | `TLS_DIR` (default `./certs`, holds `cert.pem` + `key.pem`) | nginx directory mount; `renew-certificate.sh`; preflight |
| | `ACME_WEBROOT` (default `/var/www/certbot`), `HTTP_PORT`, `HTTPS_PORT` | nginx |
| Release | `IMAGE_REPO` (default `ghcr.io/meirbek-dev`) | image names; deploy.sh |
| | `IMAGE_TAG` | image tag; written by deploy.sh |
| Web | `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | web |
| Postgres | `POSTGRES_USER`, `POSTGRES_PASSWORD` | db (initdb only), db-init, zitadel-init |
| | `PG_LOG_MIN_DURATION_STATEMENT` (default `300` ms) | db slow-query log |
| | `ASHYQ_DB_PASSWORD`, `ASHYQ_DATABASES` | db-init |
| Zitadel | `ZITADEL_MASTERKEY` (exactly 32 chars; losing it loses every account) | zitadel; preflight |
| | `ZITADEL_DB_PASSWORD` | db-init, zitadel-init, zitadel |
| | `ZITADEL_PAT_EXPIRATION` | zitadel first-instance setup; preflight expiry check |
| Storage | `RUSTFS_DATA_DIR` (prod `/data/cs-mooc/content`; default the `rustfs_data` volume) | rustfs, backup |
| | `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY` | rustfs, storage-init, server/worker (`AB__STORAGE__*`) |
| Backup | `BACKUP_DIR` (default `./backups`; prod `/data/cs-mooc/backups`) | restic repository `${BACKUP_DIR}/restic` |
| | `BACKUP_PASSWORD` | restic repository encryption |
| Redis | `REDIS_PASSWORD` | redis, server/worker (`AB__REDIS__URL`) |
| Judge0 | `JUDGE0_AUTHN_TOKEN` | Judge0 `AUTHN_TOKEN`; server `AB__JUDGE0__API_KEY` |
| | `JUDGE0_DB_PASSWORD` | judge0-db, Judge0, server `AB__JUDGE0__DATABASE_URL` (judge0-tune) |
| | `JUDGE0_REDIS_PASSWORD` | judge0-redis, Judge0 |

Not in the template (overrides; path values must start with `./` or `/`):
`SERVER_ENV_FILE` (default `./server.env`), `STACK_ENV_FILE` (the `.env` the
backup copies), `WEB_IMAGE` (smoke stub), `WEB_IMAGE_NAME` (default `ashyq-web`;
`ashyq-web-2` at the stage 2 cutover), `WEB_MEMORY` (web limit, default `2g`),
`WEB2_IMAGE` (web2 / stand image), `WEB_LINKS` (server `AB__SERVER__WEB_LINKS`,
default `legacy`), `ASHYQ_DB_CREATEDB`, `STORAGE_CORS_ORIGINS` (dev; prod derives
it), `DEV_PG_PORT`, `DEV_REDIS_PORT`, `DEV_ZITADEL_PORT`, `DEV_RUSTFS_PORT`,
`DEV_JUDGE0_PORT`, `DEV_PG_ARGS` (extra Postgres flags, CI: fsync off).

### `server.env`

| Key | Notes |
| --- | --- |
| `AB__DATABASE__URL` | `postgres://ashyq:<ASHYQ_DB_PASSWORD>@db:5432/ashyq` |
| `AB__ZITADEL__PAT` | appended by bootstrap from `zitadel_machinekey/pat.txt` |
| `AB__GOOGLE__CLIENT_ID`, `AB__GOOGLE__CLIENT_SECRET`, `AB__GOOGLE__REDIRECT_URI` | optional, all or none |
| `AB__RESEND__API_KEY`, `AB__RESEND__FROM` | optional, all or none (`FROM` has no default) |
| `AB__AI__CLAUDE_API_KEY`, `AB__AI__OPENAI_API_KEY`, `AB__AI__OPENROUTER_API_KEY` | optional; tried in that order; models default in the server config |
| `AB__TELEMETRY__OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | optional |

Compose sets these for server, worker and server-migrate (`x-server-env`,
wins over `server.env`): `AB__ENVIRONMENT`, `AB__SERVER__HOST`,
`AB__SERVER__PORT`, `AB__SERVER__CORS_ORIGINS`, `AB__SERVER__WEB_URL`,
`AB__SERVER__WEB_LINKS` (from `WEB_LINKS`),
`AB__REDIS__URL`, `AB__ZITADEL__BASE_URL`, `AB__STORAGE__ENDPOINT`,
`AB__STORAGE__ACCESS_KEY`, `AB__STORAGE__SECRET_KEY`,
`AB__STORAGE__PUBLIC_BUCKET`, `AB__STORAGE__PRIVATE_BUCKET`,
`AB__TELEMETRY__JSON_LOGS`, `AB__JUDGE0__BASE_URL`, `AB__JUDGE0__API_KEY`,
`AB__JUDGE0__DATABASE_URL`.

### preflight (`just preflight`, also run by deploy and rollback)

Fails on: missing `.env`/`server.env`; invalid `compose config` (needs
`IMAGE_TAG` in `.env` or the shell); `CHANGE_ME` in either file; `PLATFORM_*`
keys; mode other than 600 (warning only on Windows); empty values in
`server.env`; unset `AB__DATABASE__URL` or `AB__ZITADEL__PAT`;
`AB__RESEND__API_KEY` without `AB__RESEND__FROM`; unset `COMPOSE_PROJECT_NAME`;
masterkey length other than 32; missing or past `ZITADEL_PAT_EXPIRATION`; missing
`<project>_postgres_data` on a host that has run the stack before. Warns on: PAT
expiry under 30 days, certificate expiry under 14 days (`TLS_DIR/cert.pem`, else
`/etc/letsencrypt/live/<domain>/fullchain.pem`), disk of the Docker root over 85%.
Prints key names, never values.

## Edge

`infra/nginx/routes.conf`, shared by both server blocks:

| Location | Upstream | Rules |
| --- | --- | --- |
| `= /api/v1/auth/google/callback` | server, rewritten to `/api/v2/auth/google/callback` | `auth_limit`; drop once the Google console uses the v2 path |
| `/api/v2/auth` | server | `auth_limit` 10 r/s, burst 20 |
| SSE: `/api/v2/me/events`, submission/course grading events, AI run streams and Q&A chat | server | `api_limit` 30 r/s, burst 60; no buffering, 300 s timeouts |
| `/api/v2` | server | `api_limit` 30 r/s, burst 60; buffering enabled, 60 s timeouts |
| `/content/` | rustfs, rewritten to `/ab-public/` (query dropped) | anonymous read; `content_cache` 7 days in 1 MB slices; `Cache-Control: public, max-age=604800, immutable`; user-content headers |
| `~ ^/(ab-public\|ab-private)(/\|$)` | rustfs, verbatim (SigV4 signs host and path) | presigned URLs; 2G bodies, no request buffering, 300 s; 403 for a query without a signature (no `X-Amz-Signature`, no `Authorization`); user-content headers |
| `= /ui/new`, `= /ui/classic` | none | dual-web switch cookie, `302 /` |
| `/` | web (or web2, "Dual web") | `app_cache` only when the upstream says `immutable`; `Link` response header dropped |

- **Server blocks.** `:80` serves ACME challenges from `ACME_WEBROOT`,
  redirects to https when `FORCE_HTTPS=1` unless the request carries
  `X-Forwarded-Proto: https` from the configured trusted TCP peer (checked via
  `$realip_remote_addr`, before real-IP rewriting), and
  otherwise serves the routes (the university proxy talks to this block).
  `:443` serves the routes with TLS 1.2/1.3 and HTTP/2. Separate default
  servers reject unknown Host/SNI names. Redirects use the configured domain.
- **Caching rule.** `map $upstream_http_cache_control $skip_cache` (1 unless
  the value contains `immutable`) + `proxy_no_cache $skip_cache`. No
  framework paths in the config. `app_cache` (1g) lives on the `nginx_cache`
  volume; `content_cache` (5g) lives on the `nginx_content_cache` volume.
- **Real IP.** `real_ip_header X-Forwarded-For`, `real_ip_recursive on`,
  `set_real_ip_from ${TRUSTED_PROXY_CIDR}` (one CIDR). The default
  `127.0.0.1/32` trusts nobody: behind the university proxy every client then
  has the proxy's address, so all users share one rate-limit bucket and the
  logs lose client addresses.
- **Upstreams** use `resolve` + `zone` with the container resolver
  (`NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1`, `valid=10s`): a recreated container
  needs no reload. The config files are single-file bind mounts, so deploy.sh
  recreates nginx on every deploy and rollback (a reload would not see a changed file).
- **Headers.** `security-headers.conf` (HSTS, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`) is included in each server and in
  every location with its own `add_header`. CSP belongs to the web app,
  except on user content.
- **User content** (both storage locations) is inert on this origin:
  `Cross-Origin-Resource-Policy: same-origin`, `nosniff`, and
  `Content-Security-Policy` by response type (`map $sent_http_content_type
  $user_content_csp`): `default-src 'none'; img-src 'self' data:; media-src
  'self'; style-src 'unsafe-inline'; sandbox` for everything; audio/video
  without `sandbox` (it stops the browser's media page from loading the
  file); PDF none (`sandbox` disables the built-in viewers; PDF script runs in
  the viewer). App pages embed media as subresources, which the header does
  not touch. The server decides the served type on every presigned GET (only images,
  PDF, audio, video, plain text as themselves; the rest
  `application/octet-stream` + `attachment`), and RustFS's anonymous
  `response-*` overrides are cut off by the query rules above. DECISIONS
  2026-10-04 "User content is inert on the web origin".
- **Limits.** 10M request bodies except `/ab-*`; `limit_req_status 429`.
- **Logs.** JSON access log to stdout with `request_id`, also sent upstream as
  `X-Request-ID`.
- **TLS files.** `TLS_DIR` (default `./certs`) is a directory mount holding
  `cert.pem` + `key.pem`. `renew-certificate.sh` (certbot deploy hook) installs
  the renewed lineage there and reloads nginx. The legacy root-owned hook
  (`/etc/letsencrypt/renewal-hooks/deploy/cs-mooc.sh`) does the same and
  keeps working as long as the project is `cs-mooc`.

## Bootstrap

One-shot jobs, chained with `depends_on: service_completed_successfully`:

| Job | Action |
| --- | --- |
| volume-init | `zitadel_machinekey` owned by uid 1000, mode 0700 (Zitadel must write `pat.txt`) |
| db-init | `infra/postgres/init.sql`: `vector` in `template1`, roles `ashyq`/`zitadel`, databases |
| zitadel-init | `zitadel init` with the superuser login |
| storage-init | buckets, public-read policy on `ab-public`, CORS for `STORAGE_CORS_ORIGINS` (prod: the public origin), probe object `_probe/smoke.txt` |
| server-migrate | SQLx migrations (profile `maintenance`, run by bootstrap and deploy) |

`infra/scripts/bootstrap.sh` (`just bootstrap`, `STACK` default prod), safe to
re-run:

1. `up -d --wait db redis zitadel rustfs` (+ `judge0-server judge0-workers` when
   the `judge0` profile is active); this runs volume-init, db-init and
   zitadel-init.
2. `run --rm storage-init`.
3. Reads `pat.txt` from `zitadel_machinekey`.
4. dev: writes it to `tmp/dev/zitadel-pat.txt` and stops (migrations:
   `just server migrate`, or `just stack up`).
5. Other stacks: appends `AB__ZITADEL__PAT` to the server env file unless set;
   `run --rm server-migrate`; with Judge0, `run --rm --no-deps server admin
   judge0-tune` (sandbox-safe compile/run commands in Judge0's DB).

It does not start the app tier: `just stack-up` / `just deploy` do. Dev from
zero takes about 30 s; a second run changes nothing.

## Build and release

`.github/workflows/ci.yaml` (`push` to `main`, `ci/**`, `release/**`;
`pull_request`). PRs run the gates only. A newer push to the same ref cancels
the running run, `main` included: only the newest commit is deployed. `ci/**`
builds and smokes images without publishing. `coverage.yaml` runs the server's
line floor (`just cov`) nightly.

| Job | When | What |
| --- | --- | --- |
| changes | always | path filters `server`, `web` (`apps/web/**`, root `package.json`/`bun.lock`, `openapi.v2.json`, the web-e2e/restore scripts, `ci.yaml`), `web2` (`apps/web-2/**`, `openapi.v2.json`, `.node-version`, `compose.web2.yaml`, `justfile`, `ci.yaml`), `infra`; all true on `main` and `release/**`; `sha` = first 8 chars of the commit |
| server-lint | server or infra changed | `apps/server` recipes against the committed `.sqlx`: `fmt-check`, `clippy`, `deny`, `machete`, `openapi-check` |
| server-test | server or infra changed | `just dev-up` (Postgres with `DEV_PG_ARGS`: fsync off), then `migrate`, `sqlx-check`, `test --partition hash:N/2` in two jobs (`sqlx-check` in the first only); nextest profile `ci`, JUnit report uploaded on failure. The line floor (`just cov`) runs nightly in `coverage.yaml` |
| web-gates | web changed | `just ci-web`: lint, typecheck, unit tests, `check:contracts`, `check:error-codes`, `check:messages` |
| web2-gates | web2 changed | in the Playwright image, `apps/web-2`: `bun install`, `codegen messages`, `verify` (check, tests, gates; its codegen gate diffs the committed SDK and route tree), `build`, `g15` (contrast of every theme and mode) |
| infra-gates | always | `just ci-infra` (compose config for dev/prod/smoke/web2/web-e2e, `bash -n`, `nginx -t`, dual-web routing, Redis persistence), `just test-dev`, shellcheck, actionlint, gitleaks |
| images | push, in parallel with the gates | `ci-<sha>` of `ashyq-server` always, `ashyq-web` when `web` changed, `ashyq-web-2` when `web2` changed (all three on `main` and `release/**`); web build args from the repo variable `PROD_DOMAIN` |
| stack-smoke | after images | `just stack-up` with `IMAGE_TAG=ci-<sha>`, `just smoke`, then web swapped for `infra/smoke/stub-web` and `just smoke` again; without an `ashyq-web` build the stub web from the start (on `release/**` also `ashyq-web:latest`, the rollback target, smoked against the release server); when `ashyq-web-2` was built, web swapped for it via `WEB_IMAGE_NAME` and `just smoke` again |
| web2-e2e | after images, web2 changed | six stands ("Stage 2 e2e stand"): shards 1-5 `just web2-e2e --grep-invert @judge0 --shard=N/5` (`PWTEST_SHARD_WEIGHTS`), shard `judge0` with the `judge0` profile `--grep @judge0`; Playwright retries a failed test once on CI (reported as flaky) |
| web-release-e2e | after images, web changed | the `ashyq-web:ci-<sha>` image at `PROD_DOMAIN` ("Production web image stand"): smoke, auth, release and video-upload specs, then `just restore-test` |
| publish | `main` or `release/**`, every gate, stack-smoke and web-release-e2e green (not web2-e2e) | `imagetools create`, no rebuild: `ashyq-server` `ci-<sha>` -> `<sha>`/`latest`; `ashyq-web` the same when built, else `<sha>` = `ashyq-web:latest` |
| publish-web2 | after publish, web2-e2e green | `ashyq-web-2` `ci-<sha>` -> `<sha>`/`latest` |

Tags: `ci-<sha>` = built, not verified; `<sha>` = gates and stack smoke passed;
`latest` = newest green `main`. GHCR packages are public: the host pulls
without credentials.

`deploy.sh [sha]` (`just deploy`, default `HEAD` of the checkout):

1. Takes `flock` on `.deploy.lock`.
2. Resolves `sha` to 8 chars (must be known to git).
3. Refuses unless `ashyq-server:<sha>` and `ashyq-web:<sha>` (and
   `ashyq-web-2:<sha>` while `web2` is in the stack) exist in the registry
   (`docker manifest inspect`).
4. Runs preflight with `IMAGE_TAG=<sha>`.
5. `compose pull`.
6. If `apps/server/migrations` differs between the last `.deploy-history` entry
   and `sha` (or there is no history), writes `dumps/pre-deploy-<sha>.dump`
   (`pg_dump -Fc ashyq`, mode 600).
7. `run --rm server-migrate`.
8. Writes `IMAGE_TAG=<sha>` into `.env`.
9. `up -d --no-build --wait --remove-orphans`, recreates nginx, then
   `smoke.sh https://<NGINX_SERVER_NAME>` against 127.0.0.1.
10. On success appends `<UTC time> <sha>` to `.deploy-history` and removes
    local `ashyq-*` images outside the last 5 releases.
11. On smoke failure: without migrations, rolls back automatically to the
    previous release; with migrations, stops and prints the restore commands.

Rollback (`just rollback [--force] [sha]`, = `deploy.sh --rollback`): target
is the given sha or the newest history entry that differs from the current one;
preflight; refuses when the migrations differ unless `--force`; sets the tag,
`up --wait`, recreates nginx, smoke, records history. Rollback switches images only;
the compose files stay those of the checkout.

`smoke.sh <origin>` (deploy, rollback, CI, restore, drills): `GET
/api/v2/health/ready` 200, `GET /` 200 (follows redirects), `GET
/content/_probe/smoke.txt` 200, response headers of the final `/` page under
3500 bytes (the proxy's 4k buffer), and, when `judge0-server` runs, Judge0
`/languages` without a token from the server container = 401. Retries each
check for about 30 s. `SMOKE_RESOLVE_IP` pins DNS, `SMOKE_INSECURE=1` accepts a
self-signed cert. Not covered: presigned PUT/GET.

## Backup and restore

restic, local only (owner decision 2026-10-02: no offsite): one repository in
`${BACKUP_DIR}/restic` (prod `/data/cs-mooc/backups/restic`, the data disk),
encrypted with `BACKUP_PASSWORD` from `.env`. `infra/scripts/backup.sh` (`just
backup`) runs nightly at 02:00 from the host timer `infra/host/backup.timer`.
Each run is one snapshot, and only new chunks are written: unchanged objects
cost a metadata read, the uncompressed dumps dedupe day to day, restic
compresses. Sundays (or `BACKUP_PRUNE=1`) also `forget` (14 daily, 8 weekly,
12 monthly snapshots), `prune` and `check --read-data-subset=5%`. `just restic
<args>` runs restic on the prod repository (`snapshots`, `stats`, `diff`). No
service is stopped. Before each snapshot backup.sh:

- db: `pg_dump -Fc -Z0` of `ashyq` and `zitadel` plus `pg_dumpall --globals-only`
  into the `db_dumps` volume (written to `.tmp`, then renamed).
- redis: `redis-cli SAVE`.

Production storage lives on the data disk: `RUSTFS_DATA_DIR=/data/cs-mooc/content`
and `BACKUP_DIR=/data/cs-mooc/backups` in `.env`. RustFS and the backup
service mount the same content directory; other stacks default to a named volume.
Restore drills override both paths to keep production storage isolated.

Snapshot layout: `backup/db_dumps/{ashyq.dump,zitadel.dump,globals.sql}`,
`backup/rustfs` (the whole content directory),
`backup/redis`, `backup/zitadel_machinekey` (includes `pat.txt`),
`backup/secrets/{.env,server.env}`. Not backed up: `postgres_data` (the dumps
are), Judge0, nginx caches, the legacy `cs_mooc` database and `app_content`
volume. `dumps/pre-deploy-*.dump` files from deploy.sh are not pruned.

`restore.sh [snapshot]` (`just restore <snapshot-id|latest>`; a legacy offen
`backup-*.tar.zst` archive also works): refuses if the project already has a
`postgres_data` volume. Restores the dumps (restic in its own container; legacy
archives: zstd and GNU tar inside the db image), starts `db`, loads `globals.sql`,
`pg_restore --create` of `ashyq` and `zitadel`, unpacks rustfs, redis and
zitadel_machinekey into their volumes as root (owners and modes kept), starts the
stack, runs smoke. On a new host the snapshot's `backup/secrets` files go next to
the compose files first.

`restore-drill.sh [snapshot]` (`just restore-drill`, default the latest
snapshot): restore.sh into project `ashyq-drill` with the snapshot's own secrets,
plain http on port 18080 (`DRILL_HTTP_PORT`/`DRILL_HTTPS_PORT`; the prod host
needs 28080/28443, its 18080/18443 are taken), self-signed cert, no Judge0;
prints `users`/`courses` counts and elapsed time, fails on zero rows, then tears
everything down. `RESTORE_DIR` sets the scratch dir (default
`${TMPDIR:-/tmp}/ashyq-restore`).

`restore-test.sh` (`just restore-test`, CI web-release-e2e) runs the real
backup.sh and restore-drill.sh on the web-e2e stand with synthetic learner work
(a grade, a certificate, an image) and compares table counts/hashes
(`infra/tests/restore-manifest.sql`) and the object's SHA-256; never a production archive.

## Quality gates

Local gates: root `AGENTS.md` (`just check`, `just ci*`) and RUNBOOK 5.5; hosted
CI: "Build and release".

## Web contract for stage 2

What the stage 1 infrastructure guarantees the web app and requires from it:

| Aspect | Contract |
| --- | --- |
| Container | listens on `:3000`, non-root, exits cleanly on SIGTERM, `HEALTHCHECK` inside the image |
| Configuration | runtime variables only: `PUBLIC_ORIGIN`, `INTERNAL_API_URL`. One image for any domain; no build args carrying a domain |
| Network | talks only to `server` via `INTERNAL_API_URL`; never to the DB, Redis, Zitadel or RustFS |
| Browser | same origin: API at `/api/v2`, media at `/content/<key>`, uploads via presigned URLs; session = the `ab_session` cookie the server sets |
| Cache | content-hashed assets carry `Cache-Control: public, max-age=31536000, immutable`; nothing else is `immutable` |
| Headers | baseline headers come from the edge; CSP is the web app's job; no preload `Link` headers (FINDINGS 31) |
| CI | package scripts only: `codegen`, `verify`, `build`, `g15`, `e2e` |
| API contract | the client is generated from `apps/server/openapi.v2.json`; drift = red CI |
| Acceptance | the Stage 2 e2e stand below |

Next.js leftovers stage 2 must remove:

- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MEDIA_URL` build
  args: `compose.prod.yaml` (web `build.args`), `ci.yaml` (images job
  `build-args`, repo variable `PROD_DOMAIN`), `apps/web/Dockerfile` (`ARG`s).
  Today the published web image is bound to `cs-mooc.tou.edu.kz`.
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`: `compose.prod.yaml` web env,
  `compose.web-e2e.yaml`, `infra/env/prod.env.example`, `infra/env/smoke.env`.
  It is the one secret in the web container.
- `APP_URL`: `compose.prod.yaml` web env (cookie domain derivation).
- Hard-coded `cs-mooc.tou.edu.kz` in `apps/web/next.config.ts`
  (`serverActions.allowedOrigins`, `allowedDevOrigins`) and the dev-only
  `CONTENT_REWRITE_TARGET` rewrite.

## Stage 2 e2e stand

Playwright against the `ashyq-web-2` image on the smoke stack. `STACK=web2`
(`lib.sh use_web2`) = the smoke files plus `compose.web2.yaml`, project
`ashyq-web2`, server env `tmp/web2/server.env`, `PUBLIC_SCHEME=https`,
`FORCE_HTTPS=1`, `WEB_LINKS=v2`, self-signed cert of the smoke stack.

- `web`: `ashyq-web-2:${IMAGE_TAG}` (`WEB2_IMAGE` overrides), env `PUBLIC_ORIGIN`
  and `INTERNAL_API_URL` only, 512m.
- Origin `https://ashyq.test`. The server presigns S3 URLs for
  `AB__STORAGE__ENDPOINT` (already the public origin), so uploads stay
  same-origin; it reaches storage through nginx and trusts the self-signed cert
  via `SSL_CERT_FILE` (server and worker).
- Judge0 off (blank `AB__JUDGE0__BASE_URL`) unless `COMPOSE_PROFILES=judge0` and
  `WEB2_JUDGE0_URL=http://judge0-server:2358` (the CI `judge0` shard).
- Zitadel hashes with bcrypt cost 10 (its floor) instead of 14: seeding and
  sign-ins would otherwise queue on its one CPU.
- The server runs with `AB__ENVIRONMENT=production` (Secure session cookie).
  `seed-e2e` refuses production, so `web2-seed` runs it with
  `-e AB__ENVIRONMENT=development` in the running server container.
- Password: `E2E_PASSWORD` (CI secret `E2E_PASSWORD`, optional), else the dev
  stack's `E2E_PASSWORD` in the gitignored `infra/env/dev.local.env` (created
  when missing; the one seed password for seed-e2e, `just e2e` and the stand).
  Failure traces contain it in clear (filled inputs), so leave the secret unset.

| Recipe | Does |
| --- | --- |
| `web2-stand-up` | cert, `bootstrap.sh`, `up -d --wait` |
| `web2-seed` | `ashyq admin seed-e2e --learners $E2E_LEARNERS` (default 250) in the server container |
| `web2-e2e [playwright args]` | follows the server log into `tmp/web2/server.log` (`E2E_API_LOG`), runs `bun run e2e` with `E2E_LEARNERS` + `E2E_LEARNERS_DIR=tmp/web2/learners`, `E2E_BASE_URL=https://ashyq.test`, `E2E_INSECURE=1` (browser `ignoreHTTPSErrors`), `NODE_EXTRA_CA_CERTS` (fixtures' fetch) |
| `web2-stand-down` | `down -v`, removes `tmp/web2` |

Learner pool: nginx sets the client address, so the stand allows 10
self-registrations per hour in total. `seed-e2e --learners N` creates verified
`e2e-learner-001..N` (`learner-NNN@e2e.test`, "E2E Account", `E2E_PASSWORD`);
the fixture `registerAccount` takes the next untaken one (a file per taken
account in `tmp/web2/learners`, so reruns on the same stand never reuse one).
Only the email-verification specs still register for real.

Run it locally: `just web2-stand-up && just web2-seed && just web2-e2e
--grep-invert @judge0`, then `just web2-stand-down`.

The host must resolve `ashyq.test` to 127.0.0.1 (CI appends it to
`/etc/hosts`). Without that, or where published ports misbehave (Podman on
Windows), `WEB2_E2E_IN_NETWORK=1 just web2-e2e` runs the suite in
`mcr.microsoft.com/playwright:v<version>-noble` on the stand's `edge-net`,
where `ashyq.test` is the nginx alias (CI does this). Local images: `docker build
-f apps/web-2/Dockerfile -t localhost/ashyq-web-2:dev .` (same for the server;
Podman needs `--format docker`: OCI drops `HEALTHCHECK` and `up --wait` fails),
then `IMAGE_REPO=localhost IMAGE_TAG=dev just web2-stand-up`.

CI job `web2-e2e`: the four recipes per stand (30 min, the `judge0` stand 45);
on failure the HTML report, traces and server and compose logs as an artifact.
Gates only the `ashyq-web-2` retag (`publish-web2`).

## Production web image stand

`just web-release-e2e up|seed|test|down` (`infra/scripts/web-e2e.sh`,
`STACK=web-e2e`): the web2 stand with `web` = the exact `ashyq-web:${IMAGE_TAG}`
image, served at its baked domain `E2E_WEB_HOST` (CI: `PROD_DOMAIN`) through an
nginx alias on the isolated `edge-net`, so browser and API traffic never leave the
stand. Own cert (`tmp/web-e2e/certs`), `WEB_LINKS=legacy`, backups in
`tmp/restore-test-archives`. `seed` creates the seed-e2e accounts with two pool
learners; `test <specs>` runs `apps/web`'s Playwright in a container on the
stand network.

## Dual web

Both webs on one origin, the new one by default and the old one opt-in (RUNBOOK 3.12). `dual-web` in
`COMPOSE_PROFILES` starts `web2` (`ashyq-web-2:${IMAGE_TAG}`, `WEB2_IMAGE`
overrides, 512m) and switches the edge's routing on; without it everything goes
to `web` and the cookies below mean nothing.

| Request | Goes to |
| --- | --- |
| `/_next/*`, `/api/*` (not `/api/v2`), `/app_logo*`, `/empty_*` | `web` (old) |
| `/home`, `/learning`, `/achievements`, `/notifications`, `/login`, `/signup`, `/reset-password`, `/verify-email`, `/_client-error`, `/learn/*`, `/teach/*`, `/admin/*`, `/settings/*`, `/assets/*`, `/themes/*`, `/courses/<id>`, `/collections/<id>`, `/users/<name>` | `web2` (new): only it has them, so a link someone copied in the new web always opens |
| everything else (`/`, `/courses`, `/search`, `/<locale>/...`, `/certificates/...`) | `web` with cookie `ab_ui=classic`, else `web2` |

- `/ui/classic` sets `ab_ui=classic` (a year), `/ui/new` clears it; both answer `302 /`
  (relative). Each web's profile menu links the other while the edge sets
  `ab_dual=1` (readable, 1 day) on web responses.
- One session for both: same origin, same `ab_session`, same `/api/v2`. Emails
  keep `WEB_LINKS=legacy`; the new web answers those addresses with a 301 to its pages.
- Documents: the old web renders the new web's `embedBlock {type: 'url'}` by host
  (its embed catalog); an address off that catalog shows "unknown embed" there.
  Step 2.8 of the cutover still waits for the end.
- Old-web answers kept only in the browser do not move across a switch (server
  drafts do): switch outside an attempt.
- Gate: `infra/tests/dual-web.sh` (in `just ci-infra`) checks this table against
  stub webs, on and off.

## Known gaps

- **The proxy in front of prod limits response headers to 4k** (FINDINGS 31).
  A larger response is a 502 at the proxy while the stack itself answers 200.
  The edge drops `Link` on web responses and smoke fails when the home page
  headers exceed 3500 bytes; smoke still does not go through the proxy itself.
- **The proxy rejects single request bodies over about 100 MiB with 413**
  (FINDINGS 32). Both webs upload videos above 32 MiB as 32 MiB multipart parts;
  owner decision 2026-10-31: multipart is the permanent answer, the proxy stays as is.
- **Releases come from `main` or `release/**`** (all gates run before
  publishing). Stage 2 cutover: `docs/STAGE-2-CUTOVER.md`.
- **stack-smoke runs without Judge0** (privileged); only the web2-e2e `judge0`
  stand starts it.
- **No external monitoring** (owner decision 2026-10-02: no external
  services). preflight checks PAT/cert expiry and disk at deploy time only.
- **Backups are local only** (owner decision 2026-10-02). A disk failure or host
  compromise loses the site and its backups (FINDINGS 3).
- **Presigned PUT/GET not in smoke** (needs a verified login; the session
  cookie is `Secure`). CI covers them in web-release-e2e (video upload) and
  web2-e2e; on prod check by hand after a deploy.
- `restore.sh` does not run `judge0-tune`; run `just bootstrap` after a
  restore on a host with Judge0.
- `restore-drill.sh` always tears down; there is no persistent drill stack.
- judge0-db and judge0-redis have no named volumes, but their images declare
  anonymous ones, which survive container recreation (relevant for password
  rotation, RUNBOOK 3.8).
