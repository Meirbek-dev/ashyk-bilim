# Infrastructure (as built)

Stage 1 modernization, implemented in commit `40e0512` and the files below.
Spec (Russian): `docs/MODERNIZATION-STAGE-1.md`. Deviations from it, with
reasons: `docs/DECISIONS.md`, "Stage 1 modernization" (2026-10-02).
Operations: `docs/RUNBOOK.md`.

**Status 2026-10-04:** prod (`cs-mooc.tou.edu.kz`, `~/openu-prod`) runs this
stack since 2026-10-03 (release `f5e493c4`) and the current web since 2026-10-04
(release `9c88be2c`, then published as `ashyq-web-2`): `docs/STAGE-2-CUTOVER.md`.

## Layout

```
compose.yaml          shared tier: db, redis, zitadel, rustfs, judge0-* (profile judge0), init jobs
compose.prod.yaml     nginx, web, server, worker, server-migrate, backup; prod overrides
compose.dev.yaml      dev overrides: ports on 127.0.0.1, data-net not internal
compose.smoke.yaml    smoke and e2e stand overrides: nginx ports on 127.0.0.1, stand cert, Zitadel hash cost
justfile              single entry point (recipes below)
infra/
  env/                prod.env.example, server.env.example, dev.env, smoke.env, smoke.server.env
  nginx/              nginx.conf.template, routes.conf, security-headers.conf
  postgres/           init.sql (db-init job), transfer-ownership.sql (manual hardening step)
  judge0/             judge0.conf (non-default, non-secret settings only)
  storage/            init.sh (storage-init job), cors.json.template, public-policy.json
  smoke/stub-web/     stand-in web image for the edge-independence smoke (R-09)
  scripts/            lib.sh, bootstrap, deploy, rollback, preflight, smoke, restore,
                      restore-drill, renew-certificate, host-inventory, split-env
.github/workflows/ci.yaml   gates, images, stack smoke, e2e, publish
```

The legacy stack (`docker-compose.yml`, `extra/`, `judge0.conf`,
`docs/DEPLOYMENT.md`) was deleted after the 2026-10-03 cutover; last version in
git at `f5e493c4`.

Root `justfile` recipes: `dev-up`, `dev-down`, `dev-reset`, `bootstrap`,
`stack-up`, `stack-down`, `smoke`, `ci-infra`, `preflight`, `deploy`,
`rollback`, `backup`, `restore`, `restore-drill`, `server *args` (runs
`apps/server/justfile` recipes with `TEST_REDIS_URL` from `dev.env`),
`web-stand-up`, `web-seed`, `web-e2e`, `web-stand-down` (e2e stand below),
`web *args` (`bun run --cwd apps/web`).

## Stacks

`infra/scripts/lib.sh` is sourced by every script and recipe. It `cd`s to the
repo root, sets `set -euo pipefail`, `MSYS_NO_PATHCONV=1` (Git Bash) and
`COMPOSE_PATH_SEPARATOR=:`, picks `docker`, else `podman` (`compose` =
`$CTR compose`), reads the pinned db image into `PG_IMAGE`, and provides the
selectors below. `use_stack` maps `STACK=dev|prod|smoke|e2e` (default `prod`).

| Stack | `COMPOSE_FILE` | Interpolation env | Server env | Project | Recipes |
| --- | --- | --- | --- | --- | --- |
| dev | `compose.yaml:compose.dev.yaml` | `infra/env/dev.env` (`COMPOSE_ENV_FILES`) | none: the server runs on the host with `apps/server/.env` | `ashyq-dev` | `dev-up`, `dev-down`, `dev-reset` |
| smoke | `compose.yaml:compose.prod.yaml:compose.smoke.yaml` | `infra/env/smoke.env` | `tmp/smoke/server.env` (copied from `infra/env/smoke.server.env`) | `ashyq-smoke` | `stack-up`, `smoke`, `stack-down` |
| e2e | smoke files | `infra/env/smoke.env` + `PUBLIC_SCHEME=https`, `FORCE_HTTPS=1` | `tmp/e2e/server.env` | `ashyq-e2e` | `web-stand-up`, `web-seed`, `web-e2e`, `web-stand-down` |
| prod | `compose.yaml:compose.prod.yaml` | `./.env` (compose default) | `./server.env` | from `.env`: `openu-prod` | `bootstrap`, `preflight`, `deploy`, `rollback`, `backup`, `restore` |
| drill | prod files | the archive's `.env` | the archive's `server.env` | `ashyq-drill` | `restore-drill` |

A `COMPOSE_PROJECT_NAME` in the shell overrides the dev and smoke defaults
(`ci-infra` uses `ashyq-ci`). Smoke serves plain http on `ashyq.test`
(`PUBLIC_SCHEME=http`, `FORCE_HTTPS=0`), self-signed cert in `tmp/smoke/certs`,
Judge0 off.

A plain `docker compose` in the checkout reads `compose.yaml` alone (the
shared tier without the prod overlay). Always go through `just` or `lib.sh`.

## Services, networks, trust zones

Networks: `edge-net` (ordinary bridge, has egress), `data-net` (`internal`; dev
makes it non-internal to publish ports), `exec-net` (`internal`).

| Service | File | Networks | Notes |
| --- | --- | --- | --- |
| nginx | prod | edge-net, alias `${NGINX_SERVER_NAME}` | the only published ports (`HTTP_PORT`/`HTTPS_PORT`, 80/443) |
| web | prod | edge-net | image `ashyq-web` (`apps/web`); env `PUBLIC_ORIGIN`, `INTERNAL_API_URL` only; healthcheck from the image |
| server | prod | edge-net, data-net, exec-net | `env_file: server.env` + `x-server-env`; liveness healthcheck from the image |
| worker | prod | edge-net, data-net, exec-net | same env; no healthcheck; `stop_grace_period: 60s` |
| server-migrate | prod, profile `maintenance` | data-net | one-shot `ashyq migrate` |
| db | shared | data-net | `pgvector/pgvector:0.8.7-pg18-trixie` by digest (trixie = glibc collation of the prod cluster); prod adds the `db_dumps` volume and the backup hook |
| db-init | shared | data-net | one-shot `init.sql` as the superuser |
| redis | shared | data-net | `--requirepass`; prod adds the backup hook (`redis-cli SAVE`) |
| volume-init | shared | none | one-shot: `zitadel_machinekey` to uid 1000, mode 0700 |
| zitadel-init | shared | data-net | one-shot `zitadel init`; the only holder of the Postgres admin login for Zitadel |
| zitadel | shared | data-net | `start-from-setup`, TLS off, no public route; healthcheck `zitadel ready` |
| rustfs | shared | edge-net, data-net | S3; buckets `ab-public`, `ab-private` |
| storage-init | shared | data-net | one-shot `infra/storage/init.sh` |
| judge0-server, judge0-workers | shared, profile `judge0` | exec-net | `judge0/judge0:1.13.1`, privileged, `AUTHN_TOKEN` |
| judge0-db, judge0-redis | shared, profile `judge0` | exec-net | Judge0's own Postgres and Redis (passwords set); not backed up |
| backup | prod | none | `offen/docker-volume-backup`; reaches containers through the Docker socket |

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
db, server, worker, zitadel 1g; web, rustfs 512m; nginx, redis 256m.

Volumes (`<project>_<name>`; the names are load-bearing, a rename means empty
volumes): `postgres_data`, `redis_data`, `rustfs_data`, `zitadel_machinekey`,
`judge0_box` (shared); `nginx_cache`, `db_dumps` (prod). Prod also keeps the
legacy `app_content` volume and the legacy `openu` database (owner decision
2026-10-02: do not drop); nothing in the new stack uses or backs them up.

## Postgres roles and databases

| Role | Superuser | Created by | Used by |
| --- | --- | --- | --- |
| `${POSTGRES_USER}` (`openu` in prod, `postgres` in dev) | yes | initdb on an empty volume | db-init, zitadel-init, backup hook and dumps (local socket); prod server until the ownership transfer |
| `ashyq` | no | db-init, password `ASHYQ_DB_PASSWORD`, only if missing; `CREATEDB` when `ASHYQ_DB_CREATEDB=true` (dev, for `#[sqlx::test]`) | server, worker, server-migrate (dev, smoke, new installs; prod after RUNBOOK 2.1) |
| `zitadel` | no | db-init, password `ZITADEL_DB_PASSWORD`, only if missing | zitadel |
| `judge0` | yes, in `judge0-db` only | judge0-db image | Judge0 |

| Database | Owner | Notes |
| --- | --- | --- |
| `ashyq` (`ASHYQ_DATABASES`; dev: `ashyq_dev,ashyq_test`) | `ashyq` on new installs; prod: `openu` until `transfer-ownership.sql` | |
| `zitadel` | `zitadel` | |
| `openu` | `openu` | prod only, legacy; kept, unused, not in new backups |
| `judge0` (in judge0-db) | `judge0` | |

`init.sql` is idempotent and additive: it never alters an existing role or
database (password changes are manual, RUNBOOK 3.8). It installs `vector` into
`template1`, because pgvector is not a trusted extension and the non-superuser
`ashyq` cannot create it; every later database, including per-test ones,
inherits it.

`transfer-ownership.sql` hands every object of the current database to
`ashyq` with per-object `ALTER ... OWNER` (PostgreSQL refuses `REASSIGN OWNED`
from the bootstrap superuser), in one transaction, and lists leftovers
(expect 0 rows). Extensions stay with the superuser. Run manually: RUNBOOK 2.1.

## Secrets and config

Two files on the host, both `chmod 600`, git-ignored, both copied into every
backup archive (unencrypted, local only):

- `./.env` (template `infra/env/prod.env.example`): read only by compose for
  `${VAR}` interpolation. No service has `env_file: .env`.
- `./server.env` (template `infra/env/server.env.example`): `env_file` of
  server, worker and server-migrate. Only `AB__*` plus
  `OTEL_EXPORTER_OTLP_HEADERS`.

Secrets embedded in URLs are hex (`openssl rand -hex 32`).

### `.env`

| Group | Variable | Consumers |
| --- | --- | --- |
| Project | `COMPOSE_PROJECT_NAME=openu-prod` | compose (volume prefix); preflight checks it is set and its `postgres_data` volume exists |
| | `COMPOSE_PROFILES=judge0` | compose; bootstrap detects Judge0 from it |
| Edge | `NGINX_SERVER_NAME` | nginx `server_name` and edge-net alias; server CORS, `WEB_URL`, storage endpoint; web `PUBLIC_ORIGIN`; storage-init CORS origin; deploy smoke target |
| | `PUBLIC_SCHEME` (default `https`) | same consumers as above |
| | `FORCE_HTTPS` (default `1`) | nginx :80 redirect |
| | `TRUSTED_PROXY_CIDR` (empty = `127.0.0.1/32`) | nginx `set_real_ip_from` |
| | `TLS_DIR` (default `./certs`, holds `cert.pem` + `key.pem`) | nginx directory mount; `renew-certificate.sh` |
| | `ACME_WEBROOT` (default `/var/www/certbot`), `HTTP_PORT`, `HTTPS_PORT` | nginx |
| Release | `IMAGE_REPO` (default `ghcr.io/meirbek-dev`) | image names; deploy.sh |
| | `IMAGE_TAG` | image tag; written by deploy.sh |
| Postgres | `POSTGRES_USER`, `POSTGRES_PASSWORD` | db (initdb only), db-init, zitadel-init |
| | `ASHYQ_DB_PASSWORD`, `ASHYQ_DATABASES` | db-init |
| Zitadel | `ZITADEL_MASTERKEY` (exactly 32 chars; losing it loses every account) | zitadel; preflight |
| | `ZITADEL_DB_PASSWORD` | db-init, zitadel-init, zitadel |
| | `ZITADEL_PAT_EXPIRATION` | zitadel first-instance setup; preflight expiry check |
| RustFS | `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY` | rustfs, storage-init, server/worker (`AB__STORAGE__*`) |
| Redis | `REDIS_PASSWORD` | redis, server/worker (`AB__REDIS__URL`) |
| Judge0 | `JUDGE0_AUTHN_TOKEN` | Judge0 `AUTHN_TOKEN`; server `AB__JUDGE0__API_KEY` |
| | `JUDGE0_DB_PASSWORD` | judge0-db, Judge0, server `AB__JUDGE0__DATABASE_URL` (judge0-tune) |
| | `JUDGE0_REDIS_PASSWORD` | judge0-redis, Judge0 |

Not in the template (overrides; path values must start with `./` or `/`):
`SERVER_ENV_FILE` (default `./server.env`), `STACK_ENV_FILE` (the `.env` the
backup copies), `BACKUP_DIR` (default `./backups`), `DOCKER_SOCKET`,
`WEB_IMAGE` (full image ref of web: smoke stub, local builds), `ASHYQ_DB_CREATEDB`, `STORAGE_CORS_ORIGINS` (dev;
prod derives it), `DEV_PG_PORT`, `DEV_REDIS_PORT`, `DEV_ZITADEL_PORT`,
`DEV_RUSTFS_PORT`.

### `server.env`

| Key | Notes |
| --- | --- |
| `AB__DATABASE__URL` | `postgres://ashyq:<ASHYQ_DB_PASSWORD>@db:5432/ashyq` (prod switched from the legacy superuser on 2026-10-04, RUNBOOK 2.1) |
| `AB__ZITADEL__PAT` | appended by bootstrap from `zitadel_machinekey/pat.txt` |
| `AB__GOOGLE__CLIENT_ID`, `AB__GOOGLE__CLIENT_SECRET`, `AB__GOOGLE__REDIRECT_URI` | optional, all or none |
| `AB__RESEND__API_KEY`, `AB__RESEND__FROM` | optional, all or none (`FROM` has no default) |
| `AB__AI__OPENAI_API_KEY`, `AB__AI__OPENROUTER_API_KEY` | optional; models default in the server config |
| `AB__TELEMETRY__OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | optional |

Compose sets these for server, worker and server-migrate (`x-server-env`,
wins over `server.env`): `AB__ENVIRONMENT`, `AB__SERVER__HOST`,
`AB__SERVER__PORT`, `AB__SERVER__CORS_ORIGINS`, `AB__SERVER__WEB_URL`,
`AB__SERVER__WEB_LINKS` (literal `v2`; the setting goes with S-12),
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
`AB__RESEND__API_KEY` without `AB__RESEND__FROM`; unset `COMPOSE_PROJECT_NAME`; masterkey length other than 32; missing or past
`ZITADEL_PAT_EXPIRATION`; missing `<project>_postgres_data` on a host that has
run the stack before. Warns on: PAT expiry under 30 days, certificate expiry
under 14 days (`TLS_DIR/cert.pem`, else `/etc/letsencrypt/live/<domain>/fullchain.pem`), disk of the Docker root over 85%. Prints key names, never values.

## Edge

`infra/nginx/routes.conf`, shared by both server blocks:

| Location | Upstream | Rules |
| --- | --- | --- |
| `= /api/v1/auth/google/callback` | server, rewritten to `/api/v2/auth/google/callback` | `auth_limit`; drop once the Google console uses the v2 path |
| `/api/v2/auth` | server | `auth_limit` 10 r/s, burst 20 |
| `/api/v2` | server | `api_limit` 30 r/s, burst 60; `proxy_buffering off`, 300 s timeouts (SSE) |
| `/content/` | rustfs, rewritten to `/ab-public/` (query dropped) | anonymous read; `content_cache` 7 days; `Cache-Control: public, max-age=604800, immutable`; user-content headers |
| `~ ^/(ab-public\|ab-private)/` | rustfs, verbatim (SigV4 signs host and path) | presigned URLs; 500M bodies, no request buffering, 300 s; 403 for a query without a signature (no `X-Amz-Signature`, no `Authorization`); user-content headers |
| `/` | web | `app_cache` only when the upstream says `immutable` |

- **Server blocks.** `:80` serves ACME challenges from `ACME_WEBROOT`,
  redirects to https when `FORCE_HTTPS=1` unless the request carries
  `X-Forwarded-Proto: https` (already terminated by the proxy in front), and
  otherwise serves the routes (the university proxy talks to this block).
  `:443` serves the routes with TLS 1.2/1.3 and HTTP/2.
- **Caching rule.** `map $upstream_http_cache_control $skip_cache` (1 unless
  the value contains `immutable`) + `proxy_no_cache $skip_cache`. No
  framework paths in the config. `app_cache` (1g) lives on the `nginx_cache`
  volume; `content_cache` (5g) is not on a volume.
- **Real IP.** `real_ip_header X-Forwarded-For`, `real_ip_recursive on`,
  `set_real_ip_from ${TRUSTED_PROXY_CIDR}` (one CIDR). The default
  `127.0.0.1/32` trusts nobody: behind the university proxy every client then
  has the proxy's address, so all users share one rate-limit bucket and the
  logs lose client addresses.
- **Upstreams** use `resolve` + `zone` with the container resolver
  (`NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1`, `valid=10s`): a recreated container
  needs no reload. deploy.sh still runs `nginx -t` and a reload.
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
  not touch. Verified in Chromium on the real config: images, video and PDF
  preview (public and signed) work; an HTML upload renders without script.
  The server decides the served type on every presigned GET (only images,
  PDF, audio, video, plain text as themselves; the rest
  `application/octet-stream` + `attachment`), and RustFS's anonymous
  `response-*` overrides are cut off by the query rules above. DECISIONS
  2026-10-04 "User content is inert on the web origin". The two maps live in
  the template, which is rendered only when the container starts: the release
  that first ships them needs `compose up -d --force-recreate nginx` (a
  reload alone fails `nginx -t` on the unknown variables).
- **Limits.** 10M request bodies except `/ab-*`; `limit_req_status 429`.
- **Logs.** JSON access log to stdout with `request_id`, also sent upstream as
  `X-Request-ID`.
- **TLS files.** `TLS_DIR` (default `./certs`) is a directory mount holding
  `cert.pem` + `key.pem`. `renew-certificate.sh` (certbot deploy hook) installs
  the renewed lineage there and reloads nginx. The legacy root-owned hook
  (`/etc/letsencrypt/renewal-hooks/deploy/openu-prod.sh`) does the same and
  keeps working as long as the project is `openu-prod`.

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
   `just server migrate`).
5. prod/smoke: appends `AB__ZITADEL__PAT` to the server env file unless set;
   `run --rm server-migrate`; with Judge0, `run --rm --no-deps server admin
   judge0-tune` (sandbox-safe compile/run commands in Judge0's DB).

It does not start the app tier: `just stack-up` / `just deploy` do. Dev from
zero takes about 30 s on the owner's machine; a second run changes nothing.

## Build and release

`.github/workflows/ci.yaml` (`push` to `main`, `ci/**`, `release/**`; `pull_request`;
PRs run the gates only, a newer PR push cancels the running one, `main` runs are
never cancelled mid-run; `ci/**` runs everything but `publish`):

| Job | When | What |
| --- | --- | --- |
| changes | always | path filters `server`, `web` (`apps/web/**`, `openapi.v2.json`, `.node-version`, `compose.smoke.yaml`, `justfile`, `ci.yaml`), `infra`; all true on `release/**`; `sha` = first 8 chars of the commit |
| server-lint | server or infra changed | `apps/server` recipes against the committed `.sqlx`: `fmt-check`, `clippy`, `deny`, `machete`, `openapi-check` |
| server-test | server or infra changed | `just dev-up` (Postgres with `DEV_PG_ARGS`: fsync off), then `migrate`, `sqlx-check`, `cov` (the nextest suite once, instrumented, plus the line floor; `just test` is the same suite without coverage) |
| web-gates | web changed | in `apps/web`: `bun install`, Playwright chromium, `codegen`, `verify` (check, tests, `gates.ts all`), `build` with chunk budgets |
| infra-gates | always | `just ci-infra` (compose config for dev/prod/smoke/e2e, `bash -n`, `nginx -t`), shellcheck, actionlint, gitleaks |
| images | push, in parallel with the gates | `ci-<sha>` of `ashyq-server` and `ashyq-web` (no build args) |
| stack-smoke | after images | `just stack-up` with `IMAGE_TAG=ci-<sha>`, `just smoke`, then web swapped for `infra/smoke/stub-web` and `just smoke` again (R-09) |
| web-e2e | after images, web changed | three shards, each on its own e2e stand below, `just web-e2e --grep-invert @judge0 --shard=N/3` |
| publish | `main` and `release/**`; no gate failed (path-filtered ones may be skipped), stack-smoke green | `imagetools create`, no rebuild: `ashyq-server` and `ashyq-web` `ci-<sha>` -> `<sha>`/`latest` |

Tags: `ci-<sha>` = built, not verified; `<sha>` = gates and stack smoke passed;
`latest` = newest green `main`. GHCR packages are public: the host pulls
without credentials.

`deploy.sh [sha]` (`just deploy`, default `HEAD` of the checkout):

1. Takes `flock` on `.deploy.lock`.
2. Resolves `sha` to 8 chars (must be known to git).
3. Refuses unless `ashyq-server:<sha>` and `ashyq-web:<sha>` exist in the
   registry (`docker manifest inspect`).
4. Runs preflight with `IMAGE_TAG=<sha>`.
5. `compose pull`.
6. If `apps/server/migrations` differs between the last `.deploy-history` entry
   and `sha` (or there is no history), writes `backups/pre-deploy-<sha>.dump`
   (`pg_dump -Fc ashyq`, mode 600).
7. `run --rm server-migrate`.
8. Writes `IMAGE_TAG=<sha>` into `.env`.
9. `up -d --no-build --wait --remove-orphans`, `nginx -t`, reload, then
   `smoke.sh https://<NGINX_SERVER_NAME>` against 127.0.0.1.
10. On success appends `<UTC time> <sha>` to `.deploy-history` and removes
    local `ashyq-*` images outside the last 5 releases.
11. On smoke failure: without migrations, rolls back automatically to the
    previous release; with migrations, stops and prints the restore commands.

Rollback (`just rollback [--force] [sha]`, = `deploy.sh --rollback`): target
is the given sha or the newest history entry that differs from the current one;
preflight; refuses when the migrations differ unless `--force`; sets the tag,
`up --wait`, smoke, records history. Rollback switches images only; the
compose files stay those of the checkout.

`smoke.sh <origin>` (deploy, rollback, CI, restore, drills): `GET
/api/v2/health/ready` 200, `GET /` 200 (follows redirects), `GET
/content/_probe/smoke.txt` 200, and, when `judge0-server` runs, Judge0
`/languages` without a token from the server container = 401. Retries each
check for about 30 s. `SMOKE_RESOLVE_IP` pins DNS, `SMOKE_INSECURE=1` accepts a
self-signed cert. Not covered: presigned PUT/GET.

## Backup and restore

`backup` service, daily at 02:00, `./backups/backup-<timestamp>.tar.zst`,
retention 7 days, local only and unencrypted (owner decision 2026-10-02). No
service is stopped. Pre-archive hooks (`docker-volume-backup.archive-pre`
labels):

- db: `pg_dump -Fc` of `ashyq` and `zitadel` plus `pg_dumpall --globals-only`
  into the `db_dumps` volume (written to `.tmp`, then renamed).
- redis: `redis-cli SAVE`.

Archive layout: `backup/db_dumps/{ashyq.dump,zitadel.dump,globals.sql}`,
`backup/rustfs` (live copy of the whole volume; object keys are immutable;
switch to an incremental `rclone sync` beyond about 20 GB),
`backup/redis`, `backup/zitadel_machinekey` (includes `pat.txt`),
`backup/secrets/{.env,server.env}`. Not archived: `postgres_data` (the dumps
are), Judge0, nginx cache, the legacy `openu` database and `app_content`
volume. `backups/pre-deploy-*.dump` files from deploy.sh are not pruned.

`restore.sh <archive>` (`just restore`): refuses if the project already has a
`postgres_data` volume. Unpacks the dumps (zstd and GNU tar run inside the db
image), starts `db`, loads `globals.sql`, `pg_restore --create` of `ashyq` and
`zitadel`, unpacks rustfs, redis and zitadel_machinekey into their volumes as
root (owners and modes kept), starts the stack, runs smoke. On a new host the
archive's `backup/secrets` files go next to the compose files first.

`restore-drill.sh [archive]` (`just restore-drill`, default the newest
archive): restore.sh into project `ashyq-drill` with the archive's own secrets,
plain http on port 18080 (`DRILL_HTTP_PORT`), self-signed cert, no Judge0;
prints `users`/`courses` counts and elapsed time, then tears everything down.
`RESTORE_DIR` sets the scratch dir (default `${TMPDIR:-/tmp}/ashyq-restore`).

## Gates baseline

Recorded 2026-10-02 (HEAD `e1117fe` plus the stage 1 tree), Windows 11, bun
1.4.2, Rust 1.98.1. Every gate below is required in CI; none carries
`continue-on-error`.

Web (`apps/web`): `bun run verify` (check, tests, gates) and `bun run build`
(chunk budgets), CI job `web-gates`. The old Next.js web's baseline is in git
at `f5e493c4`.

Server (`apps/server`): `fmt-check`, `clippy`, `openapi-check` green locally;
`sqlx-check`, `test`, `deny`, `machete`, `cov` need the dev stack and run in CI.
`just ci` runs the same list in CI order.

## Web

`apps/web` (TanStack Start, `apps/web/AGENTS.md`), image `ashyq-web` built from
`apps/web/Dockerfile` with no build args: one image for any domain. Contract
with the stack:

| Aspect | Contract |
| --- | --- |
| Container | listens on `:3000`, non-root, drains on SIGTERM, `HEALTHCHECK` (`/healthz`) inside the image; 512m |
| Configuration | runtime variables only: `PUBLIC_ORIGIN`, `INTERNAL_API_URL` (its origin is used) |
| Network | talks only to `server` via `INTERNAL_API_URL`; never to the DB, Redis, Zitadel or RustFS |
| Browser | same origin: API at `/api/v2`, media at `/content/<key>`, uploads via presigned URLs; session = the `ab_session` cookie the server sets |
| Cache | content-hashed assets carry `Cache-Control: public, max-age=31536000, immutable`; nothing else is `immutable` |
| Headers | baseline headers come from the edge; CSP (with a nonce) is the web app's |
| API contract | the client is generated from `apps/server/openapi.v2.json`; drift = red CI (G-09) |

## e2e stand

Gate G-06: Playwright against the `ashyq-web` image on the smoke files.
`STACK=e2e` (`lib.sh use_e2e`) = the smoke stack in project `ashyq-e2e`,
server env `tmp/e2e/server.env`, `PUBLIC_SCHEME=https`, `FORCE_HTTPS=1`,
self-signed cert of the smoke stack. `compose.smoke.yaml` serves both stacks
(no separate e2e file: prod's web block already is the stand's).

- `web`: `ashyq-web:${IMAGE_TAG}` (`WEB_IMAGE` overrides), as in prod.
- Origin `https://ashyq.test`. The server presigns S3 URLs for
  `AB__STORAGE__ENDPOINT` (already the public origin), so uploads stay
  same-origin; it reaches storage through nginx and trusts the self-signed cert
  via `SSL_CERT_FILE` (server and worker).
- No Judge0: `AB__JUDGE0__BASE_URL` is blank (`E2E_JUDGE0_URL` sets it for
  `@judge0` specs with the judge0 profile on).
- The server runs with `AB__ENVIRONMENT=production` (Secure session cookie).
  `seed-e2e` refuses production, so `web-seed` runs it with
  `-e AB__ENVIRONMENT=development` in the running server container.
- Password: `E2E_PASSWORD` (CI secret `E2E_PASSWORD`, optional), else a random
  one per stand in `tmp/e2e/e2e-password`. Failure traces contain it in
  clear (filled inputs), so leave the secret unset.

| Recipe | Does |
| --- | --- |
| `web-stand-up` | cert, `bootstrap.sh`, `up -d --wait` |
| `web-seed` | `ashyq admin seed-e2e --learners $E2E_LEARNERS` (default 250) in the server container |
| `web-e2e [playwright args]` | follows the server log into `tmp/e2e/server.log` (`E2E_API_LOG`), runs `bun run e2e` with `E2E_LEARNERS` + `E2E_LEARNERS_DIR=tmp/e2e/learners`, `E2E_BASE_URL=https://ashyq.test`, `E2E_INSECURE=1` (browser `ignoreHTTPSErrors`), `NODE_EXTRA_CA_CERTS` (fixtures' fetch) |
| `web-stand-down` | `down -v`, removes `tmp/e2e` |

Learner pool: nginx sets the client address, so the stand allows 10
self-registrations per hour in total. `seed-e2e --learners N` creates verified
`e2e-learner-001..N` (`learner-NNN@e2e.test`, "E2E Account", `E2E_PASSWORD`);
the fixture `registerAccount` takes the next untaken one (a file per taken
account in `tmp/e2e/learners`, so reruns on the same stand never reuse one).
Only the email-verification specs still register for real.

Run it locally: `just web-stand-up && just web-seed && just web-e2e
--grep-invert @judge0`, then `just web-stand-down`.

The host must resolve `ashyq.test` to 127.0.0.1 (CI appends it to
`/etc/hosts`). Without that, or where published ports misbehave (podman on
Windows), `WEB_E2E_IN_NETWORK=1 just web-e2e` runs the suite in
`mcr.microsoft.com/playwright:v<version>-noble` on the stand's `edge-net`,
where `ashyq.test` is the nginx alias. Local images: `podman build --format
docker -f apps/web/Dockerfile -t localhost/ashyq-web:dev .` (same for the
server; OCI format drops `HEALTHCHECK` and `up --wait` fails), then
`IMAGE_REPO=localhost IMAGE_TAG=dev just web-stand-up`.

CI job `web-e2e` (after `images`, when `web` changed; three shards, 30 min
each): the four recipes; on failure the HTML report, traces and server log as
an artifact. A red shard withholds `publish`.

## Verified in CI (2026-10-03)

Branch `ci/stage1-verify` (run 37062396376, `main` at 39eabe9 plus the worker
healthcheck and workflow fixes): infra gates, server gates on the `just dev-up`
stack, both images, full-stack smoke from zero with the real images, and the
second smoke with the stub web (R-09). Web gates were green on `main` at 39eabe9
(run 37053137010). The GHCR packages are public (anonymous pull works).
Any `ci/**` branch runs gates, images and stack smoke without publishing.

## Known gaps

- **The proxy in front of prod limits response headers to 4k.** A larger response
  is a 502 at the proxy while the stack itself answers 200 (hit on 2026-10-04 by the
  web app's `Link` header on the home page). The edge drops `Link` on web responses
  and smoke fails when the home page headers exceed 3500 bytes; smoke still does
  not go through the proxy itself.

- ~~Prod cutover pending~~ - done 2026-10-03: release `f5e493c4` (branch
  `release/stage1`), downtime 91 s, smoke green, real client addresses in the
  nginx log (proxy `192.168.1.46/32`), Judge0 healthy on its own db/redis.
  The host checkout is a `release/**` branch; `main` publishes again since the web rename.
  First backup with the pg_dump hooks: 1.16 GB, no service stopped. Restore drill
  on it: 160 s, row counts match prod (RTO target 2 h met with margin).
- **`publish` does not wait for e2e on server-only changes.** `web-e2e` runs when
  `web` changed (incl. `openapi.v2.json`); `release/**` forces it.
- **Judge0 in CI smoke is off** (privileged). Verified on prod at the cutover:
  healthy, 401 without token, `judge0-tune` applied.
- **No external monitoring** (owner decision 2026-10-02: no external
  services). preflight checks PAT/cert expiry and disk at deploy time only.
- **Backups are local only and unencrypted** (owner decision 2026-10-02). A
  disk failure or host compromise loses the site and its backups (FINDINGS #3).
- **Presigned PUT/GET not in smoke** (needs a verified login; the session
  cookie is `Secure`). Checked by hand after a deploy.
- `restore.sh` does not run `judge0-tune`; run `just bootstrap` after a
  restore on a host with Judge0.
- `restore-drill.sh` always tears down; there is no persistent drill stack for
  rehearsals (RUNBOOK 2 rehearses in a scratch database instead).
- The `:80` redirect decision trusts `X-Forwarded-Proto` from any client, not
  only from `TRUSTED_PROXY_CIDR`.
- judge0-db and judge0-redis have no named volumes, but their images declare
  anonymous ones, which survive container recreation (relevant for password
  rotation, RUNBOOK 3.8).
