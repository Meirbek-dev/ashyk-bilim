# Runbook

Operations for the stack described in `docs/INFRA.md`. Prod host: deploy dir
`~/openu-prod`, compose project `openu-prod`, domain `cs-mooc.tou.edu.kz`,
TLS-terminating university proxy in front. Until section 1 has been executed
the host runs the legacy stack (`docs/DEPLOYMENT.md`).

## 0. Conventions

- Run everything from the checkout (`cd ~/openu-prod`) as a user in the
  `docker` group, in bash.
- `dc` below is this helper (paste once per shell). It is the same file and env
  selection the scripts use:

  ```bash
  dc() { (source infra/scripts/lib.sh && use_prod && compose "$@"); }
  ```

  Never run a plain `docker compose` in the checkout after the cutover: it reads
  `compose.yaml` alone, without the prod overlay.
- `dc` needs `IMAGE_TAG`. `just deploy` writes it into `.env`; before the first
  deploy, export it or prefix the command.
- Smoke on the host (the `just smoke` recipe targets the smoke stack only):

  ```bash
  SMOKE_RESOLVE_IP=127.0.0.1 bash infra/scripts/smoke.sh https://cs-mooc.tou.edu.kz
  ```

- `ALTER ROLE` with a secret, without putting it on a command line:

  ```bash
  printf "ALTER ROLE <role> PASSWORD '%s';\n" "$new" | dc exec -T db sh -c 'psql -q -U "$POSTGRES_USER" -d postgres'
  ```

## 1. Cutover from the legacy stack

One maintenance window. Downtime 5-10 min, from step 8 to the end of step 10;
step 1 adds a short outage while the legacy backup stops the data services.
Every step has its rollback; past step 8 the rollback is 1.4.

### 1.1 Before the window (no downtime)

P1. Tools: `docker version`, `docker compose version` (v2), `git --version`,
`just --version`, `flock --version`, `openssl version`. Install what is
missing (just: distro package or https://just.systems).

P2. Pick the release: the newest `main` commit whose CI run finished `publish`.

```bash
cd ~/openu-prod && git fetch
NEW_SHA=$(git rev-parse --short=8 origin/main)
for img in server web; do docker manifest inspect ghcr.io/meirbek-dev/ashyq-$img:$NEW_SHA >/dev/null && echo "$img ok"; done
```

Run it without `docker login`: success means the GHCR packages are public and
the release is green. `unauthorized` = packages still private (make them public
in the GitHub package settings); `manifest unknown` = CI not green or not
finished for that commit. The web image is built for the repo variable
`PROD_DOMAIN`; it must be `cs-mooc.tou.edu.kz`.

P3. Record the legacy state (needed by every rollback, survives a new shell):

```bash
LEGACY_SHA=$(git rev-parse --short=8 HEAD)
LEGACY_TAG=$(docker inspect -f '{{.Config.Image}}' openu-prod-server-1 | sed 's/.*://')
printf 'LEGACY_SHA=%s\nLEGACY_TAG=%s\nNEW_SHA=%s\n' "$LEGACY_SHA" "$LEGACY_TAG" "$NEW_SHA" > ~/cutover.env
git diff --stat "$LEGACY_SHA" "$NEW_SHA" -- apps/server/migrations
```

An empty diff means the cutover runs no migrations and rollback needs no
database restore. In a new shell: `source ~/cutover.env`.

P4. pgvector in the database must not be newer than the new image's 0.8.7:

```bash
IMAGE_TAG=$LEGACY_TAG docker compose -f docker-compose.yml exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d ashyq -tAc "SELECT extversion FROM pg_extension WHERE extname = '\''vector'\''"'
```

### 1.2 Window checklist

1. **Legacy backup** (short outage: the legacy labels stop db, redis, rustfs and
   Judge0 while archiving). Keep it out of the 7-day pruning:

   ```bash
   IMAGE_TAG=$LEGACY_TAG docker compose -f docker-compose.yml exec backup backup
   a=$(ls -1t backups/backup-*.tar.zst | head -n 1) && mv "$a" "backups/legacy-final-${a#backups/}" && ls -l backups/legacy-final-*
   ```

   It is a raw volume copy (legacy format, restore recipe in `docs/DEPLOYMENT.md`
   at `$LEGACY_SHA`). It is also the only remaining copy of the legacy `openu`
   database. Rollback: none needed.

2. **Update the checkout.**

   ```bash
   git pull --ff-only && git rev-parse --short=8 HEAD   # must print $NEW_SHA
   ```

   From here on, legacy compose commands need `-f docker-compose.yml`.
   Rollback: `git checkout $LEGACY_SHA`.

3. **Inventory** (read-only, prints key names only):

   ```bash
   bash infra/scripts/host-inventory.sh | tee ~/cutover-inventory.txt
   ```

   Read from it: the `docker compose version`; the `.env` key names; `POSTGRES_PASSWORD
   equals 'openu'` (yes = do 2.2 later); the certbot hooks under
   `/etc/letsencrypt/renewal-hooks/deploy`; free disk. The proxy address: in
   the nginx section, "TCP peers of nginx (candidates for TRUSTED_PROXY_CIDR)"
   (the log-address counts above it are already rewritten by the legacy
   real-ip config). The dominant peer is the university proxy: `PROXY_CIDR=<addr>/32` (or the
   smallest CIDR covering its pool), used in step 5. If the only peer is the
   Docker bridge gateway (`172.x.0.1`), ask university IT for the proxy
   addresses. Rollback: none.

4. **Split the env file.**

   ```bash
   bash infra/scripts/split-env.sh --dry-run
   bash infra/scripts/split-env.sh
   ```

   `AB__*` and `OTEL_*` move to `server.env`, `PLATFORM_*` to
   `.env.legacy-removed`, `COMPOSE_PROJECT_NAME=openu-prod` is added, the
   original stays as `.env.pre-split`; all mode 600. With a Resend key and no
   sender it appends `AB__RESEND__FROM=Ashyq Bilim <noreply@<NGINX_SERVER_NAME>>`
   (the legacy compose default; preflight fails without it). Rollback: `cp -p .env.pre-split .env && rm server.env`.

5. **Add the keys the new compose needs.** Compare names (no values printed):

   ```bash
   diff <(grep -oE '^[A-Z0-9_]+=' infra/env/prod.env.example | sort) <(grep -oE '^[A-Z0-9_]+=' .env | sort)
   ```

   `<` lines are missing from `.env`. Expected: `COMPOSE_PROFILES`,
   `TRUSTED_PROXY_CIDR`, `TLS_CERT_FILE`, `TLS_KEY_FILE`, `ASHYQ_DB_PASSWORD`,
   `REDIS_PASSWORD`, `JUDGE0_AUTHN_TOKEN`, `JUDGE0_DB_PASSWORD`,
   `JUDGE0_REDIS_PASSWORD`. If `POSTGRES_USER` is listed, add
   `POSTGRES_USER=openu` (the new default would be `postgres`). `>` lines are
   extra: `POSTGRES_DB` is unused now (delete it); anything else, find its
   consumer before deleting.

   ```bash
   for k in ASHYQ_DB_PASSWORD REDIS_PASSWORD JUDGE0_AUTHN_TOKEN JUDGE0_DB_PASSWORD JUDGE0_REDIS_PASSWORD; do
     grep -q "^$k=" .env || echo "$k=$(openssl rand -hex 32)" >> .env
   done
   cat >> .env <<EOF
   COMPOSE_PROFILES=judge0
   TRUSTED_PROXY_CIDR=$PROXY_CIDR
   TLS_CERT_FILE=./certs/cert.pem
   TLS_KEY_FILE=./certs/key.pem
   EOF
   ```

   `TRUSTED_PROXY_CIDR` left empty means "trust nobody": every user then has
   the proxy's address, shares one rate-limit bucket (429s under normal load)
   and the logs lose client addresses. The TLS paths are the legacy
   `./certs/{cert,key}.pem`. Existing keys stay as they are
   (`ZITADEL_MASTERKEY` must be exactly 32 chars, `ZITADEL_PAT_EXPIRATION`
   set). Rollback: `cp -p .env.pre-split .env`.

6. **Review `server.env`.** Show names only: `cut -d= -f1 server.env`.
   Remove the keys compose now sets (they would be overridden anyway;
   `AB__JUDGE0__DATABASE_URL` pointed at the legacy `openu` database):

   ```bash
   for k in AB__ENVIRONMENT AB__SERVER__HOST AB__SERVER__PORT AB__SERVER__CORS_ORIGINS AB__SERVER__WEB_URL \
     AB__REDIS__URL AB__ZITADEL__BASE_URL AB__STORAGE__ENDPOINT AB__STORAGE__ACCESS_KEY AB__STORAGE__SECRET_KEY \
     AB__STORAGE__PUBLIC_BUCKET AB__STORAGE__PRIVATE_BUCKET AB__TELEMETRY__JSON_LOGS \
     AB__JUDGE0__BASE_URL AB__JUDGE0__API_KEY AB__JUDGE0__DATABASE_URL; do
     sed -i "/^$k=/d" server.env
   done
   ```

   Then check:
   - No empty values (preflight fails on them):
     `grep -E '^[A-Za-z_][A-Za-z0-9_]*=[[:space:]]*$' server.env | cut -d= -f1`
     prints nothing.
   - `AB__DATABASE__URL` stays the legacy superuser URL (2.1 changes it later):
     `sed -n 's|^AB__DATABASE__URL=postgres://\([^:]*\):[^@]*@\(.*\)|\1 \2|p' server.env`
     prints `openu db:5432/ashyq`.
   - `AB__ZITADEL__PAT` is set.

   Rollback: `rm server.env` and redo step 4 from `.env.pre-split`.

7. **Preflight and pre-pull** (legacy still serving):

   ```bash
   IMAGE_TAG=$NEW_SHA just preflight
   IMAGE_TAG=$NEW_SHA dc pull
   ```

   Must end with `preflight: ok`. Any FAIL: section 4. Rollback: none.

8. **Stop the legacy stack** (downtime starts). Dump first: it is the
   rollback point if migrations run in step 9.

   ```bash
   legacy() { IMAGE_TAG=$LEGACY_TAG docker compose -f docker-compose.yml --env-file .env.pre-split "$@"; }
   (umask 077 && legacy exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc ashyq' > backups/pre-cutover-ashyq.dump)
   test -s backups/pre-cutover-ashyq.dump && legacy down
   docker volume ls | grep openu-prod_      # all volumes still there
   ```

   `down` removes the legacy containers and networks (the new compose
   recreates `data-net` as internal); volumes stay. The stopped legacy orphans
   (`api`, `taskiq-*`, `migrate`) stay until step 10. Rollback: `legacy up -d`.

9. **Bootstrap.**

   ```bash
   IMAGE_TAG=$NEW_SHA just bootstrap
   ```

   What it changes: `db` is recreated on the `pgvector/pgvector:0.8.7-pg18-trixie`
   image (same `postgres_data`, plus the `db_dumps` volume and the backup
   hook); db-init installs `vector` in `template1` and creates role `ashyq`
   (password `ASHYQ_DB_PASSWORD`; existing `zitadel` role and databases are
   left alone); `redis` restarts with `--requirepass` on the same `redis_data`
   (sessions survive); zitadel-init runs `zitadel init` (idempotent), zitadel
   starts with `start-from-setup`; storage-init re-applies the bucket policy,
   CORS for `https://cs-mooc.tou.edu.kz` and the probe object; new
   `judge0-db`/`judge0-redis` start empty and Judge0 starts with the token;
   `AB__ZITADEL__PAT` is kept; `server-migrate` applies the migrations listed
   in P3; `judge0-tune` writes the sandbox commands into the new Judge0
   database. Judge0 has a 180 s start period, so this can take 3-4 min. Ends
   with `bootstrap (prod) done`. Rollback: 1.4.

10. **Deploy.**

    ```bash
    just deploy $NEW_SHA
    ```

    First deploy: no `.deploy-history`, so deploy.sh treats migrations as
    changed, writes `backups/pre-deploy-$NEW_SHA.dump`, runs `server-migrate`
    (no-op), writes `IMAGE_TAG` into `.env`, starts everything with
    `--remove-orphans` (removes the stopped legacy containers, not their
    volumes), reloads nginx and runs smoke. It never rolls back automatically
    on this first run. Ends with `deployed <sha>` (downtime ends). Rollback: 1.4.

### 1.3 Verification

```bash
SMOKE_RESOLVE_IP=127.0.0.1 bash infra/scripts/smoke.sh https://cs-mooc.tou.edu.kz   # incl. "ok 401 judge0 without token"
dc ps                                                       # all running/healthy, one-shots exited 0
dc exec -T web env | cut -d= -f1 | sort                     # no AB__*, POSTGRES_*, REDIS_*, RUSTFS_*, ZITADEL_*, JUDGE0_*
dc exec -T redis sh -c 'unset REDISCLI_AUTH; redis-cli ping'                                  # NOAUTH Authentication required.
dc exec -T server curl -sS -o /dev/null -w '%{http_code}\n' http://judge0-server:2358/languages  # 401
dc exec -T judge0-server getent hosts db || echo 'db unreachable from judge0: ok'
dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT rolname, rolsuper FROM pg_roles WHERE rolname IN ('\''ashyq'\'', '\''zitadel'\'')"'   # both f
dc logs --tail 20 nginx                                     # remote_addr = public client addresses, not the proxy
```

`web env` legitimately holds `INTERNAL_API_URL`, `APP_URL` and
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (the one web secret until stage 2) plus
image defaults. Then in a browser, through the proxy: log in, open a course
with images (`/content`), upload a file (presigned PUT), run code in a code
challenge (Judge0 token and `judge0-tune`). Finally `just backup` and check the
new archive appears in `backups/`.

### 1.4 Rollback of the whole cutover

```bash
source ~/cutover.env
IMAGE_TAG=$NEW_SHA dc down                # new stack; volumes stay
git checkout "$LEGACY_SHA"
cp -p .env.pre-split .env
legacy() { IMAGE_TAG=$LEGACY_TAG docker compose -f docker-compose.yml --env-file .env.pre-split "$@"; }
```

Only if the P3 migration diff was not empty (the database is migrated past
what the legacy binary accepts), restore the step 8 dump:

```bash
legacy up -d db
legacy exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE ashyq WITH (FORCE)"'
legacy exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d postgres --create --exit-on-error' < backups/pre-cutover-ashyq.dump
```

Then `legacy up -d` and check the site. What carries over: `postgres_data`
(same PostgreSQL 18; the legacy image opens it), `redis_data` (sessions),
`rustfs_data`, `zitadel_machinekey`. Judge0 goes back to the legacy `openu`
database, which the new stack never touched. Writes made on the new stack
survive unless the dump was restored. Leftovers are harmless: role `ashyq`,
`vector` in `template1`, Judge0's anonymous volumes, `server.env`.
Legacy images (`ashyq-server:$LEGACY_TAG`, `ashyq-web:$LEGACY_TAG`,
`openu-prod-db`) must still exist: do not prune images before 1.5.

### 1.5 After a successful cutover

- Same day: replace the certbot hook (3.7). The legacy hook uses `install`
  (new inode), which the new single-file bind mounts would not see.
- Within the week, when the host has spare RAM: `just restore-drill` (3.5).
- Repo (dev machine, one commit): delete `docker-compose.yml`,
  `docker-compose.dev.yml`, root `.env.example`, root `judge0.conf`,
  `extra/Dockerfile.db`, `extra/deploy.sh`, `extra/nginx.conf.template`,
  `extra/nginx.routes.conf`, `extra/renew-certificate.sh`,
  `extra/storage-cors.json`, `extra/storage-public-policy.json`,
  `docs/DEPLOYMENT.md`, and the root `package.json` scripts `services` and
  `deploy`; drop the "until section 1" note at the top of this file; mark
  FINDINGS #1, #2, #8, #10, #11 closed. Then `git pull` on the host.
- After a week without rollback: `rm .env.pre-split .env.legacy-removed`
  (the legacy `PLATFORM_*` secrets, FINDINGS #10), `docker image rm
  ashyq-server:$LEGACY_TAG ashyq-web:$LEGACY_TAG openu-prod-db`, `docker
  builder prune` (host build caches).
- Keep the legacy `openu` database, the `app_content` volume and
  `backups/legacy-final-*` (owner decision 2026-10-02). Never run `docker
  volume prune`.

## 2. Later hardening

Each item is its own window, after the cutover has run cleanly for a while.
`restore-drill.sh` always tears its stack down, so these are rehearsed in a
scratch database inside the prod cluster (real objects, real PostgreSQL),
which is what is prod-specific here: dev, CI and the smoke stack already run
the app as the non-superuser `ashyq`.

### 2.1 Database ownership to `ashyq`

Rehearsal (no downtime; needs free disk for one more copy of the database):

```bash
dc exec -T db sh -c 'createdb -U "$POSTGRES_USER" -T template0 ashyq_rehearsal && pg_dump -U "$POSTGRES_USER" -Fc ashyq | pg_restore -U "$POSTGRES_USER" -d ashyq_rehearsal --exit-on-error'
dc exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ashyq_rehearsal' < infra/postgres/transfer-ownership.sql   # "(0 rows)", COMMIT
dc exec -T db psql -U ashyq -d ashyq_rehearsal -c 'SELECT count(*) FROM users' -c 'CREATE TABLE rehearsal_probe (x int)' -c 'DROP TABLE rehearsal_probe'
dc exec -T db sh -c 'dropdb -U "$POSTGRES_USER" ashyq_rehearsal'
```

Window (2-5 min, server and worker stopped):

```bash
(umask 077 && dc exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc ashyq' > backups/pre-ownership-ashyq.dump) && test -s backups/pre-ownership-ashyq.dump
cp -p server.env server.env.pre-ownership
dc stop server worker
dc exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ashyq' < infra/postgres/transfer-ownership.sql   # "(0 rows)", COMMIT
new=$(sed -n 's/^ASHYQ_DB_PASSWORD=//p' .env)     # the role may predate db-init: set its password explicitly
printf "ALTER ROLE ashyq PASSWORD '%s';\n" "$new" | dc exec -T db sh -c 'psql -q -U "$POSTGRES_USER" -d postgres'
sed -i "s|^AB__DATABASE__URL=.*|AB__DATABASE__URL=postgres://ashyq:$new@db:5432/ashyq|" server.env; unset new
dc up -d --wait server worker
SMOKE_RESOLVE_IP=127.0.0.1 bash infra/scripts/smoke.sh https://cs-mooc.tou.edu.kz
```

Verify:

```bash
dc exec -T db psql -U ashyq -d ashyq -tAc 'SELECT rolsuper FROM pg_roles WHERE rolname = current_user'   # f
dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d ashyq -tAc "SELECT DISTINCT a.usename, r.rolsuper FROM pg_stat_activity a JOIN pg_roles r ON r.rolname = a.usename WHERE a.datname = current_database() AND a.pid <> pg_backend_pid()"'   # ashyq|f
```

Rollback: `cp -p server.env.pre-ownership server.env && dc up -d --wait server worker`
(the superuser works whatever the owners are). Only if the database itself is
damaged: `dc stop server worker`, then `DROP DATABASE ashyq WITH (FORCE)` and
`pg_restore --create` of `backups/pre-ownership-ashyq.dump` as in 1.4 (writes
since the dump are lost). The first later deploy with a migration is the first
migration run as `ashyq`; deploy.sh dumps before it.

### 2.2 Rotate the Postgres superuser password

Only if the inventory said `POSTGRES_PASSWORD equals 'openu': yes` (the value
committed in the legacy `judge0.conf`). One `ALTER ROLE`, so no separate
rehearsal. Window: seconds (the db container is recreated).

```bash
cp -p .env .env.pre-pgpass && cp -p server.env server.env.pre-pgpass
new=$(openssl rand -hex 32)
printf "ALTER ROLE %s PASSWORD '%s';\n" "$(sed -n 's/^POSTGRES_USER=//p' .env)" "$new" | dc exec -T db sh -c 'psql -q -U "$POSTGRES_USER" -d postgres'
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$new/" .env
# Only while the server still connects as the superuser (2.1 not done):
sed -i "s|^\(AB__DATABASE__URL=postgres://openu:\)[^@]*@|\1$new@|" server.env
unset new
dc up -d --wait
SMOKE_RESOLVE_IP=127.0.0.1 bash infra/scripts/smoke.sh https://cs-mooc.tou.edu.kz
just backup
```

`db-init` and `zitadel-init` read `POSTGRES_PASSWORD` from `.env` on every
`up`; the db container's own variable only matters at initdb. Rollback:
`ALTER ROLE` back to the value in `.env.pre-pgpass`, restore both
`.pre-pgpass` files, `dc up -d --wait`.

## 3. Routine

### 3.1 Deploy

Push to `main`, wait for the CI run to finish `publish`, then on the host:

```bash
git pull --ff-only
just deploy
```

Deploys `HEAD` (the compose files and the images must belong to the same
commit). Steps and auto-rollback rules: INFRA "Build and release". History:
`tail .deploy-history`.

### 3.2 Rollback

```bash
just rollback                 # to the previous .deploy-history entry
just rollback <sha>           # to a given release
just rollback --force <sha>   # migrations differ, and the older binary is known to tolerate the newer schema
```

When migrations differ and the schema change is not backward compatible,
restore the pre-deploy dump of the release being undone (deploy.sh prints
these lines when it stops):

```bash
dc stop server worker
dc exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d ashyq --clean --if-exists' < backups/pre-deploy-<bad sha>.dump
just rollback --force <previous sha>
```

Rollback switches image tags only. If the bad release also changed compose or
`infra/` files, `git checkout <previous sha>` first.

### 3.3 Manual backup

```bash
just backup
ls -lt backups | head -n 3
```

Runs the nightly job now: dumps, then the archive
`backups/backup-<timestamp>.tar.zst`. Contents: INFRA "Backup and restore".
Archives hold `.env` and `server.env` in clear: keep `backups/` mode 700.

### 3.4 Restore on a clean host

```bash
git clone https://github.com/Meirbek-dev/ashyk-bilim.git ~/openu-prod && cd ~/openu-prod
archive=/path/to/backup-<timestamp>.tar.zst
img=$(sed -n 's/.*image: &pg-image //p' compose.yaml)
docker run --rm -i "$img" zstd -dc < "$archive" | tar -xf - --no-anchored backup/secrets
cp -p backup/secrets/.env .env && cp -p backup/secrets/server.env server.env && chmod 600 .env server.env && rm -r backup
git checkout "$(sed -n 's/^IMAGE_TAG=//p' .env)"
mkdir -p certs        # place the TLS files at TLS_CERT_FILE / TLS_KEY_FILE (3.7)
just restore "$archive"
just bootstrap        # judge0-tune (restore.sh skips it); PAT and migrations are no-ops
just deploy           # records .deploy-history so rollback works
```

`restore.sh` only restores into a project without a `postgres_data` volume.
On the existing prod host that means `dc down -v` first, which deletes every
data volume of the project: do it only with an archive that passed
`just restore-drill`.

### 3.5 Restore drill

```bash
just restore-drill                                   # newest backups/backup-*.tar.zst
just restore-drill backups/backup-<timestamp>.tar.zst
```

Project `ashyq-drill`, ports 18080/18443 (`DRILL_HTTP_PORT`,
`DRILL_HTTPS_PORT`), no Judge0. Prints `users`, `courses` and `drill passed in
N s` (the RTO), then tears down. Compare the counts with prod:

```bash
dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d ashyq -tAc "SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM courses)"'
```

On the prod host it runs a second stack (up to ~6 GB of memory limits): run it
when the host has the headroom, or on another machine with the archive
copied over. Monthly, and after infra changes.

### 3.6 Bootstrap a fresh host from zero

```bash
git clone https://github.com/Meirbek-dev/ashyk-bilim.git ~/openu-prod && cd ~/openu-prod
cp infra/env/prod.env.example .env && cp infra/env/server.env.example server.env && chmod 600 .env server.env
for k in POSTGRES_PASSWORD ASHYQ_DB_PASSWORD ZITADEL_DB_PASSWORD RUSTFS_ACCESS_KEY RUSTFS_SECRET_KEY \
  REDIS_PASSWORD JUDGE0_AUTHN_TOKEN JUDGE0_DB_PASSWORD JUDGE0_REDIS_PASSWORD; do
  sed -i "s/^$k=CHANGE_ME$/$k=$(openssl rand -hex 32)/" .env
done
sed -i "s/^ZITADEL_MASTERKEY=CHANGE_ME$/ZITADEL_MASTERKEY=$(openssl rand -hex 16)/" .env
sed -i "s|^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=CHANGE_ME$|NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env
pw=$(sed -n 's/^ASHYQ_DB_PASSWORD=//p' .env); sed -i "s|CHANGE_ME|$pw|" server.env; unset pw
```

Edit `NGINX_SERVER_NAME`, `TRUSTED_PROXY_CIDR`, and `COMPOSE_PROJECT_NAME`
(choose once, never change), uncomment the optional `server.env` groups you
use, place the TLS files (3.7), then:

```bash
IMAGE_TAG=$(git rev-parse --short=8 HEAD) just bootstrap
just deploy
just backup
```

Keep a copy of `.env` (above all `ZITADEL_MASTERKEY`) somewhere you control.

### 3.7 Certificates

certbot on the host, webroot `/var/www/certbot` (`ACME_WEBROOT`; HTTP-01 paths
bypass the https redirect and pass through the university proxy on port 80).

Install the deploy hook (the script resolves its own symlink to find `lib.sh`):

```bash
sudo ln -sf "$PWD/infra/scripts/renew-certificate.sh" /etc/letsencrypt/renewal-hooks/deploy/ashyq
ls /etc/letsencrypt/renewal-hooks/deploy/; sudo grep -rn hook /etc/letsencrypt/renewal/   # remove the legacy hook found here
sudo RENEWED_LINEAGE=/etc/letsencrypt/live/cs-mooc.tou.edu.kz /etc/letsencrypt/renewal-hooks/deploy/ashyq   # "certificate reloaded"
sudo certbot renew --dry-run      # ACME reachability (hooks do not run)
```

The hook copies `fullchain.pem`/`privkey.pem` over `TLS_CERT_FILE`/`TLS_KEY_FILE`
(lineage must be named after `NGINX_SERVER_NAME`) and reloads nginx. First
issue on a new host: `sudo certbot certonly --webroot -w /var/www/certbot -d
cs-mooc.tou.edu.kz`, then run the hook line above. Expiry: preflight warns 14
days ahead (it reads `TLS_CERT_FILE`); by hand `openssl x509 -enddate -noout -in certs/cert.pem`.

### 3.8 Rotating secrets

After every rotation: smoke, then `just backup` (older archives carry the old
values together with the matching database roles, so restoring one stays
consistent). `ALTER ROLE` uses the helper from section 0.

- **`POSTGRES_PASSWORD`**: 2.2.
- **`ASHYQ_DB_PASSWORD`**: `new=$(openssl rand -hex 32)`, `ALTER ROLE ashyq`,
  set it in `.env` and, after 2.1, in `AB__DATABASE__URL`; `dc up -d --wait
  server worker`. db-init never changes an existing role's password.
- **`ZITADEL_DB_PASSWORD`**: `ALTER ROLE zitadel`, set it in `.env`, `dc up -d
  --wait zitadel` (logins fail for the few seconds Zitadel restarts).
- **`ZITADEL_MASTERKEY`**: never. It encrypts Zitadel's keys; a new value loses
  every account. The backups hold it.
- **`AB__ZITADEL__PAT`**: 3.9.
- **`REDIS_PASSWORD`**: `sed -i "s/^REDIS_PASSWORD=.*/REDIS_PASSWORD=$(openssl rand -hex 32)/" .env`,
  `dc up -d --wait` (redis, server, worker recreated; sessions survive on
  `redis_data`).
- **`JUDGE0_AUTHN_TOKEN`**, **`JUDGE0_REDIS_PASSWORD`**: same `sed` pattern,
  `dc up -d --wait`.
- **`JUDGE0_DB_PASSWORD`**: same `sed`, then `dc rm -sfv judge0-db` (its
  anonymous volume keeps the old password; Judge0 state is disposable) and
  `just bootstrap` (recreates it and reruns `judge0-tune`).
- **`RUSTFS_ACCESS_KEY`/`RUSTFS_SECRET_KEY`**: same `sed` for both, `dc up -d
  --wait` (rustfs, server, worker recreated; storage-init reruns). In-flight
  presigned URLs fail. Not exercised yet: take `just backup` first; rollback =
  the old values from that archive's `.env`.
- **`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`**:
  `sed -i "s|^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=.*|NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env`,
  `dc up -d --wait web` (open pages must reload once).
- **`server.env` integrations** (Google, Resend, AI keys, OTLP header): edit
  `server.env`, `dc up -d --wait server worker`.
- **TLS key**: 3.7.

### 3.9 Zitadel PAT expiry

preflight warns 30 days before `ZITADEL_PAT_EXPIRATION` and fails after it.
Mint a new PAT for the provisioner with the current one, from inside the
server container (Zitadel has no public route):

```bash
dc exec -T server sh -c 'curl -fsS -H "Authorization: Bearer $AB__ZITADEL__PAT" http://zitadel:8080/auth/v1/users/me'   # note user.id
dc exec -T server sh -c 'curl -fsS -X POST -H "Authorization: Bearer $AB__ZITADEL__PAT" -H "Content-Type: application/json" \
  -d "{\"expirationDate\":\"2028-12-31T00:00:00Z\"}" http://zitadel:8080/management/v1/users/<user id>/pats'   # returns "token"
```

Put the token into `AB__ZITADEL__PAT` in `server.env`, set
`ZITADEL_PAT_EXPIRATION=2028-12-31T00:00:00Z` in `.env`, `dc up -d --wait
server worker`, smoke, `just backup`. Do it before expiry: with an expired PAT
there is no scripted way in. Not exercised yet.

### 3.10 Logs

```bash
dc ps
dc logs -f --tail 100 server worker
dc logs --since 1h nginx | grep '"status":5'
dc logs nginx server | grep <request id>       # nginx request_id = X-Request-ID upstream
dc logs backup                                 # nightly job
```

Container logs rotate at 10 MB x 5 per container. Server traces go to OTLP
when `AB__TELEMETRY__OTLP_ENDPOINT` is set.

### 3.11 Disk pressure

preflight warns at 85% on the Docker root.

```bash
df -h / "$(docker info -f '{{.DockerRootDir}}')"
du -sh backups/* | sort -h | tail
docker system df
```

Free space with: old `backups/pre-deploy-*.dump`, `pre-cutover`/`pre-ownership`
dumps once obsolete (nothing prunes them); `docker image prune` (deploy.sh
keeps 5 releases); `docker builder prune`. Not: `docker volume prune` (legacy
`app_content` and stopped projects' data), `backups/legacy-final-*`. Archives
grow with `rustfs_data` (a full copy each night); beyond ~20 GB switch the
backup to an incremental `rclone sync` (compose.prod.yaml comment).

## 4. Troubleshooting

### deploy / rollback

| Message | Meaning, action |
| --- | --- |
| `... ashyq-<img>:<sha> is not in the registry (CI red or not finished)` | CI has not finished `publish` for that commit, or it failed. Check the run; deploy a green commit |
| `unknown commit: <x> (git fetch first)` | `git fetch` / `git pull` |
| `another deploy or rollback is running` | `flock` on `.deploy.lock` is held; find it with `pgrep -af deploy.sh` |
| `no previous release to roll back to` | `.deploy-history` has no other release; give a sha |
| `migrations differ between A and B ...` | 3.2: restore the pre-deploy dump, or `--force` if the old binary tolerates the schema |
| `FAIL: smoke failed on a release with migrations; no automatic rollback.` | Follow the printed lines (= 3.2) or fix forward |
| `smoke failed after rolling back to <sha>` | The previous release fails too: infrastructure, not the release. Smoke section below |
| `pre-deploy dump is empty` | db not reachable or disk full: `dc logs db`, `df -h` |

### preflight

| FAIL | Action |
| --- | --- |
| `.env is missing` / `server.env is missing` | 1.2 steps 4-6, or 3.6 |
| `compose config is invalid` | `IMAGE_TAG=<sha> dc config -q` names the missing variable (`must be set` = blank or absent in `.env`) |
| `CHANGE_ME placeholder in: ...` | fill the listed keys |
| `legacy PLATFORM_* keys present` | `bash infra/scripts/split-env.sh` |
| `mode is N, want 600` | `chmod 600 <file>` |
| `server.env: empty values: ...` | delete the line or set a value (an empty `AB__` key counts as configured) |
| `server.env: AB__RESEND__API_KEY is set without AB__RESEND__FROM` | add `AB__RESEND__FROM=Ashyq Bilim <noreply@cs-mooc.tou.edu.kz>` (or remove the key) |
| `server.env: AB__ZITADEL__PAT is not set` | `just bootstrap` appends it |
| `COMPOSE_PROJECT_NAME is not set` | `COMPOSE_PROJECT_NAME=openu-prod` in `.env` |
| `ZITADEL_MASTERKEY must be exactly 32 characters` | restore the original from `.env.pre-split` or a backup; never generate a new one on an existing install |
| `ZITADEL_PAT_EXPIRATION is missing or not a date` / `Zitadel PAT expired` | 3.9 |
| `volume <proj>_postgres_data is missing on a host that already ran the stack` | wrong `COMPOSE_PROJECT_NAME`. Stop: continuing boots an empty site. `docker volume ls \| grep _postgres_data` shows the right prefix |

WARNs (deploy continues): PAT under 30 days (3.9), certificate under 14 days
(3.7), disk over 85% (3.11), docker not reachable (volume and disk checks
skipped).

### smoke

| FAIL | Action |
| --- | --- |
| every check `no response` | nginx down (`dc ps`, `dc logs nginx`), or the cert is not valid for the domain (smoke verifies TLS on 127.0.0.1): retry with `SMOKE_INSECURE=1` to tell them apart |
| `/api/v2/health/ready` | readiness pings Postgres, Redis, RustFS, Zitadel: `dc exec -T server curl -sS http://127.0.0.1:8000/api/v2/health/ready`, `dc logs --tail 100 server` |
| `/` | web: `dc logs web`; a 301 loop = the proxy sends no `X-Forwarded-Proto: https` to port 80 (fix the proxy, or `FORCE_HTTPS=0`) |
| `/content/_probe/smoke.txt` | `dc run --rm -T storage-init` (bucket, policy, probe) |
| `judge0 without token: expected 401, got 200` | the token is not enforced: `infra/judge0/judge0.conf` must not set `AUTHN_TOKEN`; check `JUDGE0_AUTHN_TOKEN` in `.env` |
| `judge0 ... got no response` | `dc logs judge0-server` |

### Other

- **Judge0 never gets healthy** (privileged, cgroups): `dc logs judge0-server
  judge0-workers`. To bring the site up without code execution, remove
  `COMPOSE_PROFILES=judge0` from `.env` and rerun the step; code runs fail
  until it is back.
- **429s for everyone / proxy address in the logs**: `TRUSTED_PROXY_CIDR`
  does not cover the proxy (1.2 step 3), then `dc up -d nginx`.
- **`migration ... was previously applied but has been modified`**: a
  committed file under `apps/server/migrations/` was edited. Migrations are
  append-only; restore the file and add a new migration.
- **Zitadel `Instance.Domain.AlreadyExists` on a fresh install**: the first
  boot could not write `pat.txt` (volume-init normally prevents it). New
  install only: `dc down -v` and bootstrap again.
- **Zitadel healthcheck fails while Zitadel runs**: `zitadel ready` reads only
  the config; `ZITADEL_TLS_ENABLED=false` must stay in `compose.yaml`.
- **Imported users cannot log in**:
  `ZITADEL_SYSTEMDEFAULTS_PASSWORDHASHER_VERIFIERS=argon2,bcrypt` must stay.
- **Code runs fail after a Judge0 image upgrade or a fresh judge0-db**:
  `dc run --rm -T --no-deps server admin judge0-tune` (idempotent).
  `dc run --rm -T --no-deps server admin config-check` prints the effective
  config with secrets redacted.
- **Google login**: the console still has `/api/v1/auth/google/callback`;
  nginx forwards it to v2. After the console is switched to
  `/api/v2/auth/google/callback`, delete that location in
  `infra/nginx/routes.conf`.
- **Backup missing in the morning**: `dc logs backup`, `df -h`; run `just
  backup` to see the error live.
- **Restore refuses: `already has a postgres_data volume`**: by design; 3.4.
