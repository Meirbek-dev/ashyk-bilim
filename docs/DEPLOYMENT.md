# Deployment Guide

Operations reference for the Ashyq Bilim production stack (`docker-compose.yml`).

## Architecture

```
Internet
  │
  ▼
nginx (TLS termination, rate limiting, static cache)   extra/nginx.conf.template
  ├── /api/v2/*                  → server:8000  (Rust API, axum)
  ├── /content/*                 → rustfs:9000  (anonymous read of ab-public)
  ├── /ab-public/, /ab-private/  → rustfs:9000  (presigned S3, passed verbatim)
  └── /*                         → web:3000     (Next.js)

server / worker  → db (Postgres + pgvector), redis, zitadel (internal only),
                   rustfs, judge0-server
```

| Service                         | Role                                                     |
| ------------------------------- | -------------------------------------------------------- |
| `server`                        | HTTP API (`ashyq serve`)                                 |
| `worker`                        | Postgres job queue consumer (`ashyq worker`)             |
| `web`                           | Next.js standalone server                                |
| `zitadel`                       | Identity (headless Session API); no public route         |
| `rustfs`                        | S3 object storage, buckets `ab-public` / `ab-private`    |
| `db`, `redis`                   | Postgres 18 + pgvector, Redis                            |
| `judge0-server/-workers`        | Code execution sandbox (internal `exec-net`)             |
| `backup`                        | Daily volume backup, 02:00, 7-day retention              |
| `server-migrate`, `storage-admin` | `maintenance` profile: one-shot jobs, run with `run --rm` |

## Configuration

Copy `.env.example` to `.env` and fill in every `required` value. The server
reads `AB__SECTION__KEY` variables; compose sets the production values
(`AB__ENVIRONMENT=production`, CORS, storage origin, Redis DB 2) from
`NGINX_SERVER_NAME`, so `.env` carries only secrets and optional integrations.

## Release

Pull the revision to deploy, then:

```bash
bun run deploy          # = bash extra/deploy.sh
```

`deploy.sh` builds `ashyq-server:<sha>` and `ashyq-web:<sha>`, runs SQLx
migrations (`server-migrate`), starts `server worker web`, reloads nginx and
checks `/api/v2/health/ready`. Previous images are kept: roll back with
`IMAGE_TAG=<old sha> docker compose up -d --no-deps server worker web`
(migrations are forward-only — a rollback across a schema change needs a
restore).

Take a backup first when the release contains migrations:
`docker compose exec backup backup`.

## Bootstrap notes (first install)

- Before the first Zitadel start, create the `zitadel_machinekey` volume and
  give its root directory to UID/GID 1000 with mode 0700. An empty Docker volume
  belongs to root; otherwise bootstrap commits its instance but cannot write
  `pat.txt`, and retries fail with `Instance.Domain.AlreadyExists`. Put the PAT
  from `pat.txt` into `AB__ZITADEL__PAT`.
- `ZITADEL_SYSTEMDEFAULTS_PASSWORDHASHER_VERIFIERS=argon2,bcrypt` must stay:
  imported users still carry Argon2id hashes until their next login.
- Apply the public-read policy once:
  `docker compose run --rm storage-admin s3api put-bucket-policy --bucket ab-public --policy file:///policy.json`
  (`/cors.json` is mounted for `put-bucket-cors` the same way).
- `docker compose run --rm server admin judge0-tune` (needs
  `AB__JUDGE0__DATABASE_URL`) applies the sandbox-safe compiler/run commands to
  Judge0's DB. Idempotent; re-run after any Judge0 image upgrade.
  `… server admin config-check` prints the effective config (e.g. `ai.status`).
- web/server/worker resolve the public hostname through `host-gateway`: this
  host cannot reach its public IP through NAT, and signed S3 URLs must keep the
  HTTPS hostname.
- The Google callback still registered in the Google console is
  `/api/v1/auth/google/callback`; nginx forwards it to the v2 handler. After
  changing the console to `/api/v2/auth/google/callback`, drop that location
  from `extra/nginx.routes.conf`.

## Post-cutover cleanup (host, owner)

The legacy stack was replaced on 2026-09-30. Still on the production host:

- Stopped legacy containers (`api`, `taskiq-*`, `migrate`): remove with
  `docker compose up -d --remove-orphans`.
- The legacy database (`openu`, read-only since cutover) and the `app_content`
  volume are no longer used or backed up; drop them once you no longer want a
  fallback copy.
- Orphan legacy files quarantined under `ab-private/quarantine/` (see
  QUESTIONS.md for the 87 assignment files) — delete when no longer needed.

## TLS

Certificates live in `./certs/{cert,key}.pem` (git-ignored, mounted read-only).
Renewal uses the shared `/var/www/certbot` webroot (HTTP-01 paths bypass the
HTTPS redirect). Install `extra/renew-certificate.sh` as an executable Certbot
deploy hook; the host's `certbot.timer` renews and the hook reloads nginx.

## Backup

`offen/docker-volume-backup` archives `postgres_data`, `redis_data`,
`rustfs_data`, `zitadel_machinekey` and `judge0_box` daily into `./backups/` as
`backup-YYYY-MM-DDTHH-MM-SS.tar.zst`. Manual run: `docker compose exec backup backup`.
Always extract with `tar --zstd` (the `backup-latest` symlink says `.tar.gz`).

## Restore

Volume names carry the Compose project prefix (the checkout directory name).
**Confirm it first** — Docker/Podman silently create an unknown volume, so a
typo restores into a volume nothing mounts:

```bash
docker volume ls | grep _postgres_data
```

```bash
docker compose down
mkdir -p temp-restore
tar --zstd -xf ./backups/backup-YYYY-MM-DDTHH-MM-SS.tar.zst -C temp-restore
# Layout: temp-restore/backup/{postgres,redis,rustfs,zitadel_machinekey,judge0_box}

PREFIX=openu-prod   # the project prefix confirmed above
BACKUP_PATH="$(pwd)/temp-restore/backup"
for v in postgres:postgres_data redis:redis_data rustfs:rustfs_data zitadel_machinekey:zitadel_machinekey; do
  docker run --rm \
    -v "${PREFIX}_${v#*:}:/data" \
    -v "${BACKUP_PATH}/${v%%:*}:/backup:ro" \
    alpine sh -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && cp -a /backup/. /data/'
done
docker compose up -d
```

Each volume is emptied before the copy so leftovers (a stale `postmaster.pid`,
orphaned WAL) never mix in. `judge0_box` is a scratch sandbox Judge0 rebuilds.

Verify real data came back, not just healthy containers:

```bash
docker compose exec server curl -fsS http://127.0.0.1:8000/api/v2/health/ready
docker compose exec db psql -U openu -d ashyq -c "SELECT count(*) FROM users;"
```

## Troubleshooting

- **`… must be set`** during `docker compose config` — a required `.env` value is blank.
- **`migration … was previously applied but has been modified`** — a committed
  file under `apps/server/migrations/` was edited. Migrations are append-only;
  restore the file and add a new migration instead.
- **Empty database after restore** — wrong volume prefix; see Restore.
- **PostgreSQL version mismatch** — `extra/Dockerfile.db` must match the backup's major version.
- **Backup not running** — `docker compose logs backup`; check `df -h`.
