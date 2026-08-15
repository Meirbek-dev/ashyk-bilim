# Deployment Guide

Authoritative operations reference for the Ashyk Bilim platform.

## Architecture

```
Internet
  │
  ▼
nginx (TLS termination, rate limiting, static cache)
  ├── /api/v1/*   → api:8000  (FastAPI)
  ├── /content/*  → api:8000  (user uploads)
  └── /*          → web:3000  (Next.js)

Networks
  app-net   — nginx ↔ web ↔ api
  data-net  — api ↔ db ↔ redis   (internal)
  exec-net  — api ↔ judge0       (internal)
```

## Compose Profiles

| Profile       | What it adds                                          |
| ------------- | ----------------------------------------------------- |
| _(none)_      | nginx, web, api, db, redis — always started with `up` |
| `code-runner` | judge0-server, judge0-workers                         |
| `ops`         | backup cron                                           |
| `migrate`     | one-shot migration container (use with `run --rm`)    |

---

## First-Time Setup

### 1. Clone the repository

```bash
git clone <repo-url> ashyq-bilim
cd ashyq-bilim
```

### 2. Configure environment

```bash
cp example.env .env
# Edit .env — fill in every blank value (search for "# required")
```

Required secrets to generate:

```bash
openssl rand -hex 32    # POSTGRES_PASSWORD
```

Generate the JWT signing key (run once; store value in `.env`):

```bash
python -c "import secrets; print('PLATFORM_JWT_SECRET:', secrets.token_hex(64))"
```

Also set the domain variables (`NGINX_SERVER_NAME`, `NEXT_PUBLIC_SITE_URL`, `PLATFORM_DOMAIN`, etc.) to your actual hostname.

### 3. Provision TLS certificates

Place certificates in `./certs/` (git-ignored, mounted read-only into nginx):

```
certs/
  cert.pem   — full-chain certificate
  key.pem    — private key
```

**Let's Encrypt (Certbot):**

```bash
sudo certbot certonly --standalone -d cs-mooc.tou.edu.kz
sudo cp /etc/letsencrypt/live/cs-mooc.tou.edu.kz/fullchain.pem ./certs/cert.pem
sudo cp /etc/letsencrypt/live/cs-mooc.tou.edu.kz/privkey.pem   ./certs/key.pem
sudo chmod 644 ./certs/cert.pem ./certs/key.pem
```

Add a Certbot deploy hook to reload nginx after renewal:

```bash
docker-compose exec nginx nginx -s reload
```

### 4. Build images

```bash
docker-compose build
```

### 5. Start the database and apply migrations

```bash
docker-compose up -d db redis
docker-compose ps db                  # wait until (healthy)
docker-compose run --rm migrate
```

### 6. Start all services

```bash
docker-compose up -d
```

### 8. Verify

```bash
docker-compose ps
curl -fsS https://cs-mooc.tou.edu.kz/api/health
curl -fsS https://cs-mooc.tou.edu.kz/api/v1/health
```

---

## Release Procedure

```bash
# 1. Backup first
docker-compose exec backup backup

# 2. Pull and build
git pull
docker-compose build

# 3. Apply migrations (only if this release includes schema changes)
docker-compose ps db                  # confirm healthy
docker-compose run --rm --entrypoint "" migrate \
  uv run --no-sync python scripts/check_migration_graph.py --require-single-head
docker-compose run --rm migrate
docker-compose run --rm --entrypoint "" migrate \
  uv run --no-sync alembic current   # verify revision

# 4. Restart application containers
docker-compose up -d --no-deps web api nginx

# 5. Verify
docker-compose ps
docker-compose logs --tail=50 api
curl -fsS https://cs-mooc.tou.edu.kz/api/v1/health
```

---

## Migrations

Migrations are **always manual** — never applied automatically on start.
The `migrate` service reuses the `ashyq-bilim-api` image.

**Apply:**

```bash
docker-compose run --rm migrate
```

**Verify current revision:**

```bash
docker-compose run --rm --entrypoint "" migrate \
  uv run --no-sync alembic current
```

**Rollback one step:**

```bash
docker-compose run --rm --entrypoint "" migrate \
  uv run --no-sync alembic downgrade -1
```

**Rollback from the current head:**

The current schema head is `44e39d920b74`. To roll back only that migration,
downgrade to its parent revision:

```bash
docker-compose run --rm --entrypoint "" migrate \
  uv run --no-sync alembic downgrade c4d5e6f7a8b9
```

**Rollback to a specific revision:**

```bash
docker-compose run --rm --entrypoint "" migrate \
  uv run --no-sync alembic downgrade <revision_id>
```

> If a migration is not backward-compatible (e.g. drops a column the previous
> release still reads), redeploy the previous release first, then downgrade the
> schema.

---

## Rollback

```bash
# 1. Downgrade schema if needed (see Migrations above)
# 2. Check out / re-tag the previous image
# 3. Restart
docker-compose up -d --no-deps web api
```

---

## Backup

Backups run daily at 02:00 via `offen/docker-volume-backup`. Start the service:

```bash
docker-compose up -d backup
```

**Trigger a manual backup:**

```bash
docker-compose exec backup backup
```

**What gets backed up:**

| Volume          | Contents                                    |
| --------------- | ------------------------------------------- |
| `postgres_data` | PostgreSQL (includes pgvector)              |
| `redis_data`    | Redis                                       |
| `app_content`   | User uploads and media                      |
| `judge0_box`    | Judge0 sandbox (when code-runner is active) |

Files land in `./backups/` as `backup-YYYY-MM-DDTHH-MM-SS.tar.zst`.
Retention: 7 days.

**Optional — remote storage or notifications:**
Add environment variables to the `backup` service in `docker-compose.yml`:

```yaml
# S3
AWS_S3_BUCKET_NAME: my-bucket
AWS_ACCESS_KEY_ID: ...
AWS_SECRET_ACCESS_KEY: ...

# Notifications (Slack, Discord, etc.)
NOTIFICATION_URLS: 'slack://token@channel'

# Encryption
GPG_PASSPHRASE: ...
```

---

## Restore

Volume names are prefixed with the Compose project name, which defaults to the
directory name — `ashyq-bilim` (note the `q`), unless `COMPOSE_PROJECT_NAME` says
otherwise. **Confirm the prefix before you copy anything:** Docker and Podman
create an unknown volume name silently instead of failing, so a typo restores the
backup into a fresh volume nothing mounts, and the stack comes up on an empty
database.

```bash
docker volume ls | grep _postgres_data   # podman volume ls
```

**1. Stop the application**

```bash
docker-compose down
```

**2. Extract the backup**

```bash
mkdir -p temp-restore
# Example copy from server to Windows PC:
# scp user@192.186.12.34:~/openu-prod/backups/backup-YYYY-MM-DDTHH-00-00.tar.zst .
tar --zstd -xf ./backups/backup-YYYY-MM-DDTHH-MM-SS.tar.zst -C temp-restore
# Layout: temp-restore/backup/{postgres,redis,app_content,judge0_box}
```

Windows (Git Bash or WSL): same commands work as-is. Windows (7-Zip):

```powershell
& "C:\Program Files\7-Zip\7z.exe" x ".\backups\backup-YYYY-MM-DDT02-00-00.tar.zst" "-o.\"
& "C:\Program Files\7-Zip\7z.exe" x ".\backup-YYYY-MM-DDT02-00-00.tar" "-o.\temp-restore" -snl
```

> The backup-latest symlink has a `.tar.gz` extension but is zstd-compressed.
> Always use `tar --zstd`, never `tar -z`.

**3. Restore volumes**

Each volume is emptied before the copy. A bare `cp -a` overlays instead of
replacing, so leftovers from a previously initialized cluster (a stale
`postmaster.pid`, orphaned WAL segments) would mix into the restored data
directory.

```bash
BACKUP_PATH="$(pwd)/temp-restore/backup"

for v in postgres:postgres_data redis:redis_data app_content:app_content; do
  docker run --rm \
    -v "ashyq-bilim_${v#*:}:/data" \
    -v "${BACKUP_PATH}/${v%%:*}:/backup:ro" \
    alpine sh -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && cp -a /backup/. /data/'
done
```

`judge0_box` is a scratch sandbox that Judge0 rebuilds on start — restore it the
same way only if you need it byte-identical.

PowerShell (Podman):

```powershell
$BACKUP_PATH = ($PWD.ProviderPath -replace '\','/') + "/temp-restore/backup"

foreach ($v in @('postgres:postgres_data','redis:redis_data','app_content:app_content')) {
  $src, $vol = $v -split ':'
  podman run --rm -v "ashyq-bilim_${vol}:/data" -v "${BACKUP_PATH}/${src}:/backup:ro" alpine sh -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && cp -a /backup/. /data/'
}
```

**4. Start**

```bash
docker-compose up -d
```

**5. Verify**

Check that real application data came back, not just that the container is
healthy — an empty cluster passes `pg_isready` and only fails later at API
startup.

```bash
docker-compose ps
docker-compose exec db psql -U openu -d openu -c "SELECT version_num FROM alembic_version;"
docker-compose exec db psql -U openu -d openu -c "SELECT COUNT(*) FROM roles;"
```

`version_num` must match `alembic heads` in `apps/api`; if the backup predates
the current code, run the migration step from [Migrations](#migrations).

**6. Clean up**

```bash
rm -rf temp-restore
```

---

## Volumes

| Volume          | Contents            | Backed up       |
| --------------- | ------------------- | --------------- |
| `postgres_data` | PostgreSQL database | Yes             |
| `redis_data`    | Redis               | Yes             |
| `app_content`   | User uploads, media | Yes             |
| `judge0_box`    | Judge0 sandbox      | Yes (when used) |
| `nginx_cache`   | Nginx proxy cache   | No (ephemeral)  |

---

## Troubleshooting

**`POSTGRES_PASSWORD must be set in .env`** — `.env` is missing or the variable is blank. Copy `example.env` and fill it in.

**`gzip: stdin: not in gzip format` during restore** — the archive is zstd-compressed despite the `.tar.gz` symlink. Use `tar --zstd`.

**`relation "roles" does not exist` at API startup after a restore** — the backup went into a volume the stack does not mount, usually a typo in the project-name prefix (`ashyk-` instead of `ashyq-`), and the API is talking to a fresh empty cluster. `docker volume ls` will show both names. Stop the stack and redo step 3 of [Restore](#restore) against the correct volumes.

**PostgreSQL version mismatch after restore** — the image in `extra/Dockerfile.db` must match the major version in the backup. Run `pg_upgrade` or pin the image version.

**Backup not running** — `docker-compose logs backup` to inspect. Check disk space with `df -h`.
