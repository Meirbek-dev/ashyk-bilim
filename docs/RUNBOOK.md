# Runbook

Operations for the stack described in `docs/INFRA.md`. Prod host: deploy dir
`~/cs-mooc`, compose project `cs-mooc`, domain `cs-mooc.tou.edu.kz`,
TLS-terminating university proxy in front. The Rust stack is live; the
Next.js frontend remains in production. Frontend replacement: `docs/STAGE-2-CUTOVER.md`.

## 0. Conventions

- Run everything from the checkout (`cd ~/cs-mooc`) as a user in the
  `docker` group, in bash.
- `dc` below is this helper (paste once per shell). It is the same file and env
  selection the scripts use:

  ```bash
  dc() { (source infra/scripts/lib.sh && use_prod && compose "$@"); }
  ```

  Never run a plain `docker compose` in the checkout: it reads
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

Keep the legacy `cs_mooc` database, `app_content` volume and `backups/legacy-final-*`
(owner decision). They are outside the new backups. Never run `docker volume prune`.

Production content is bind-mounted from `/data/cs-mooc/content`
(`RUSTFS_DATA_DIR` in `.env`). Archives use `/data/cs-mooc/backups`
(`BACKUP_DIR`); `~/cs-mooc/backups` is a compatibility symlink there.
Pre-deploy dumps use `/data/cs-mooc/dumps` through the `dumps` symlink.
The pre-move rollback copy of the former `openu-prod_rustfs_data` volume is a
tar under `/data/server-maintenance-20261019/cleanup-20261019T173732Z/`; it
receives no new writes. Restore drills use their own content volume.

## 2. Database hardening

Each item is its own maintenance window.
`restore-drill.sh` always tears its stack down, so these are rehearsed in a
scratch database inside the prod cluster (real objects, real PostgreSQL),
which is what is prod-specific here: dev, CI and the smoke stack already run
the app as the non-superuser `ashyq`.

### 2.1 Database ownership to `ashyq`

Done 2026-10-04 09:49 UTC (rehearsal clean, 306 objects transferred, API down 15 s;
rollback files `server.env.pre-ownership`, `dumps/pre-ownership-ashyq.dump`). Kept as
the procedure for a restored or new host.

Rehearsal (no downtime; needs free disk for one more copy of the database):

```bash
dc exec -T db sh -c 'createdb -U "$POSTGRES_USER" -T template0 ashyq_rehearsal && pg_dump -U "$POSTGRES_USER" -Fc ashyq | pg_restore -U "$POSTGRES_USER" -d ashyq_rehearsal --exit-on-error'
dc exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ashyq_rehearsal' < infra/postgres/transfer-ownership.sql   # "(0 rows)", COMMIT
dc exec -T db psql -U ashyq -d ashyq_rehearsal -c 'SELECT count(*) FROM users' -c 'CREATE TABLE rehearsal_probe (x int)' -c 'DROP TABLE rehearsal_probe'
dc exec -T db sh -c 'dropdb -U "$POSTGRES_USER" ashyq_rehearsal'
```

Window (2-5 min, server and worker stopped):

```bash
(umask 077 && dc exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc ashyq' > dumps/pre-ownership-ashyq.dump) && test -s dumps/pre-ownership-ashyq.dump
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
`pg_restore --create` of `dumps/pre-ownership-ashyq.dump` as in 1.4 (writes
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
sed -i "s|^\(AB__DATABASE__URL=postgres://cs_mooc:\)[^@]*@|\1$new@|" server.env
unset new
dc up -d --wait
SMOKE_RESOLVE_IP=127.0.0.1 bash infra/scripts/smoke.sh https://cs-mooc.tou.edu.kz
just backup
```

`db-init` and `zitadel-init` read `POSTGRES_PASSWORD` from `.env` on every
`up`; the db container's own variable only matters at initdb. Rollback:
`ALTER ROLE` back to the value in `.env.pre-pgpass`, restore both
`.pre-pgpass` files, `dc up -d --wait`.

### 2.3 Erasing a person

The app never deletes a `users` row: an admin disables the account, the person's own
account deletion anonymises it (`users.deleted_at`). A legal erasure request is done by hand.
Learning records reference `users` with `ON DELETE RESTRICT` (ARCHITECTURE §8 "Schema
guarantees"), so a bare `DELETE FROM users` fails while the person has submissions, file attempts,
code runs, certificates, progress, enrolments, XP or uploads. Prefer anonymising (what self-deletion
does: the row stays, the name/email/avatar go); grades and certificates others rely on stay valid.
Only when the records themselves must go, in one transaction after `just backup`:

```sql
BEGIN;
-- the person's work (grading_entries and item_feedback go with the submissions)
DELETE FROM code_runs WHERE user_id = :'uid';
DELETE FROM submissions WHERE user_id = :'uid';
DELETE FROM file_submission_attempts WHERE user_id = :'uid';
DELETE FROM certificate_users WHERE user_id = :'uid';
DELETE FROM trail_steps WHERE user_id = :'uid';
DELETE FROM trail_runs WHERE user_id = :'uid';
DELETE FROM trails WHERE user_id = :'uid';
DELETE FROM activity_progress WHERE user_id = :'uid';
DELETE FROM course_progress WHERE user_id = :'uid';
DELETE FROM xp_transactions WHERE user_id = :'uid';
DELETE FROM gamification_completions WHERE user_id = :'uid';
DELETE FROM gamification_profiles WHERE user_id = :'uid';
DELETE FROM uploads WHERE created_by = :'uid';   -- objects are reaped by uploads:reap only when unreferenced
DELETE FROM users WHERE id = :'uid';             -- the rest cascades; a remaining RESTRICT names the table
COMMIT;
```

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
dc exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d ashyq --clean --if-exists' < dumps/pre-deploy-<bad sha>.dump
just rollback --force <previous sha>
```

Rollback switches image tags only. If the bad release also changed compose or
`infra/` files, `git checkout <previous sha>` first.

### 3.3 Manual backup

```bash
just backup                       # the nightly job now: dumps + incremental snapshot
just restic snapshots             # list; `just restic stats latest`, `just restic diff <a> <b>`
```

restic runs as root in its container, so the `docker` group is enough; the
repository directory itself stays mode 700.
Contents: INFRA "Backup and restore". `BACKUP_PASSWORD` in `.env` encrypts the
repository; keep a copy outside the server, without it no backup can be read.

Nightly timer (once per host; check with `systemctl list-timers cs-mooc-backup.timer`):

```bash
sudo cp infra/host/backup.service /etc/systemd/system/cs-mooc-backup.service
sudo cp infra/host/backup.timer /etc/systemd/system/cs-mooc-backup.timer
sudo systemctl daemon-reload && sudo systemctl enable --now cs-mooc-backup.timer
journalctl -u cs-mooc-backup.service -n 30      # last run
```

### 3.4 Restore on a clean host

```bash
git clone https://github.com/Meirbek-dev/ashyk-bilim.git ~/cs-mooc && cd ~/cs-mooc
repo=/data/cs-mooc/backups/restic      # the repository (or a copy) at BACKUP_DIR/restic
read -rs RESTIC_PASSWORD && export RESTIC_PASSWORD   # BACKUP_PASSWORD, from outside the server
img=$(sed -n 's/.*image: &restic-image //p' compose.prod.yaml)
docker run --rm -e RESTIC_PASSWORD -v "$repo:/repo:ro" -v "$PWD:/out" "$img" -r /repo --no-lock \
  restore latest --target /out --include /backup/secrets
sudo chown -R "$(id -u):$(id -g)" backup
cp -p backup/secrets/.env .env && cp -p backup/secrets/server.env server.env && chmod 600 .env server.env && rm -r backup
git checkout "$(sed -n 's/^IMAGE_TAG=//p' .env)"
mkdir -p certs        # place cert.pem and key.pem in TLS_DIR (3.7)
just restore          # latest snapshot; `just restore <snapshot-id>` for an older one
just bootstrap        # judge0-tune (restore.sh skips it); PAT and migrations are no-ops
just deploy           # records .deploy-history so rollback works
```

`restore.sh` only restores into a project without a `postgres_data` volume.
On the existing prod host that means `dc down -v` first, which deletes every
data volume of the project: do it only with a snapshot that passed
`just restore-drill`. Legacy offen archives (`backup-*.tar.zst`, before
2026-10-26) still restore: `just restore <archive>`.

### 3.5 Restore drill

```bash
DRILL_HTTP_PORT=28080 DRILL_HTTPS_PORT=28443 just restore-drill                 # latest snapshot
DRILL_HTTP_PORT=28080 DRILL_HTTPS_PORT=28443 just restore-drill <snapshot-id>
```

Project `ashyq-drill`, ports 18080/18443 by default (`DRILL_HTTP_PORT`,
`DRILL_HTTPS_PORT`; on the prod host other stacks hold them), no Judge0. Prints `users`, `courses` and `drill passed in
N s` (the RTO), then tears down. Compare the counts with prod:

```bash
dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d ashyq -tAc "SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM courses)"'
```

On the prod host it runs a second stack (up to ~6 GB of memory limits): run it
when the host has the headroom, or on another machine with the archive
copied over. Monthly, and after infra changes.

The drill fails if the restored database has no users or courses. CI also runs `just restore-test` on the isolated
production browser stand: synthetic learner work, a grade, a certificate and an image are backed up with the real
backup hooks, restored, and compared by stable table counts/hashes and object SHA-256. The restored learner must
also sign in through the restored identity provider. Archives and secrets stay
outside uploaded diagnostics; only logs and hash manifests are retained. This check never opens production archives.

### 3.6 Bootstrap a fresh host from zero

```bash
git clone https://github.com/Meirbek-dev/ashyk-bilim.git ~/cs-mooc && cd ~/cs-mooc
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

The hook installs `fullchain.pem`/`privkey.pem` as `cert.pem`/`key.pem` in `TLS_DIR`
(lineage must be named after `NGINX_SERVER_NAME`) and reloads nginx. First
issue on a new host: `sudo certbot certonly --webroot -w /var/www/certbot -d
cs-mooc.tou.edu.kz`, then run the hook line above. Expiry: preflight warns 14
days ahead (it reads `TLS_DIR`); by hand `openssl x509 -enddate -noout -in certs/cert.pem`.

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

Free space with: old `dumps/pre-deploy-*.dump`, `pre-cutover`/`pre-ownership`
dumps once obsolete (nothing prunes them); `docker image prune` (deploy.sh
keeps 5 releases); `docker builder prune`. Not: `docker volume prune` (legacy
`app_content` and stopped projects' data), `backups/legacy-final-*`. Archives
grow with `rustfs_data` (a full copy each night); beyond ~20 GB switch the
backup to an incremental `rclone sync` (compose.prod.yaml comment).

### 3.12 Dual web (both frontends on one origin)

INFRA "Dual web". The new web is opt-in per user (`/ui/new`); the old one stays the default. On:

```bash
env_set() { grep -q "^$1=" .env && sed -i "s|^$1=.*|$1=$2|" .env || echo "$1=$2" >>.env; }
env_set COMPOSE_PROFILES judge0,dual-web        # keep the profiles already there
docker manifest inspect ghcr.io/meirbek-dev/ashyq-web-2:$(sed -n 's/^IMAGE_TAG=//p' .env) >/dev/null
dc up -d --no-build --wait                      # starts web2, recreates nginx (its env changed)
curl -sI https://cs-mooc.tou.edu.kz/ | grep -i 'set-cookie: ab_dual'
curl -s -o /dev/null -w '%{http_code}
' -b ab_ui=v2 https://cs-mooc.tou.edu.kz/home   # 200 from web2
```

Watch `docker stats --no-stream | grep web` (both webs) and the 3.10 logs of `web2`. Off: remove `dual-web` from
`COMPOSE_PROFILES`, `dc rm -sf web2 && dc up -d --no-build --wait`. Users who chose the new web land on the old
one; their `ab_ui` cookie does nothing until it is on again. Later deploys need `ashyq-web-2:<sha>` too
(deploy.sh checks it while `web2` is in the stack).

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
| `COMPOSE_PROJECT_NAME is not set` | `COMPOSE_PROJECT_NAME=cs-mooc` in `.env` |
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

- **Large video upload says no network / HTTP 413 at the public origin**:
  current frontends use multipart requests of at most 32 MiB for videos
  larger than 32 MiB (2026-10-13). Reload an old cached page first. A 308 MiB
  multipart storage probe through the public origin succeeded; the single
  PUT limit below still affects old clients and other large single requests.
  The university TLS proxy must allow the same 2 GiB as our `/ab-public/`
  and `/ab-private/` routes. A deployment of this stack cannot change that
  outer proxy. In its existing location forwarding these bucket paths to
  this stack, university IT must apply:

  ```nginx
  client_max_body_size 2G;
  proxy_request_buffering off;
  client_body_timeout 300s;
  proxy_send_timeout 300s;
  proxy_read_timeout 300s;
  ```

  Keep the existing upstream and forwarded Host/path unchanged (they are
  signed). Validate and reload the outer proxy using its operator's normal
  procedure. Then upload a 308 MB video through the public hostname and
  confirm PUT + finalize + activity creation succeed. A direct-host smoke
  bypasses this proxy and cannot verify its upload limit. On 2026-10-11,
  public requests declaring 100 MiB received `100 Continue`, while 308 MiB
  and 2 GiB received 413 before any bytes were sent; a signed 308 MiB PUT
  through our nginx on localhost completed with 200 in 2.7 seconds. Temporary
  diagnostic objects were deleted. Storage HTTP rejections in the web app
  now preserve their status; 413 uses the localized `payload-too-large` copy.
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

## 5. Development machine

Windows (Git Bash + PowerShell) and Linux run the same `just` recipes. `just setup` once per clone.

### 5.1 Hooks, formatting, line endings

- pre-commit (`.vite-hooks/pre-commit` -> `infra/dev/hooks.ts`) checks the index being committed in a
  checkout under `tmp/hooks/snap` (incremental, node_modules linked): format + type-aware lint of the
  staged web files, cheap web-2 gates, rustfmt of staged `.rs`, no edits to migrations on origin/main.
  Unstaged work never affects it; a failure prints the fix (`just fmt <files>`) and the log path.
- pre-push runs `just check --base <remote tip>` in `tmp/hooks/push` (a detached worktree of the pushed commit, with
  its own cargo target: the first push compiles the server there from scratch).
  Only CI skips hooks; never `--no-verify`.
- `just fmt <files>`: the root `vite.config.ts` is the one web format config (apps/web-2's block comes
  from `apps/web-2/fmt.config.ts`), so the result is the same from any cwd.
- `just eol`: CRLF working copies (Windows tools) are rewritten as LF. A CRLF migration changes its sqlx
  checksum; `ab-db`'s unit test `migrations_are_embedded_with_lf` catches it.

### 5.2 Worktrees

`just wt new <name>` -> `../ashyq-wt/<name>` on `wt/<name>` from main with its own `bun install` (root and
apps/web-2, ~45 s from bun's cache; a linked node_modules breaks turbopack's `next build`), apps/web's
`.env`/`.env.local` copied, its own cargo target `<base>-<name>` (cargo names artifacts the same in every
checkout, so a shared dir runs another tree's code; `just server`, `just check`, `just stack` and `.cargo/config.toml`
apply it, plain `cargo` with CARGO_TARGET_DIR set does not), Paraglide generated. Commit there; `just wt
land <name>` rebases onto main, runs `just check`, fast-forwards main in the main checkout and removes
the worktree. `just wt ls` shows every worktree; `just wt rm <name> [--force]` drops one. Run the
worktree's apps in their own slot (`just stack up 1`). Legacy `next build` on this machine needs
`SWC_NATIVE_BINDING_CACHE` (in `infra/env/dev.local.env`; `just stack`/`just e2e` pass it).

### 5.3 Dev stack

`just stack up [slot] [--db NAME] [--judge0] [--seed] [--without web]` starts what a slot needs: the dev
containers (`just dev-up` unless all answer; Judge0 only with `--judge0` / `just dev-judge0`), a debug
build of the server, the database (created when missing, from `ashyq_seed` if it exists, then migrated;
a new one is seeded), then API + worker + web-2 `vp dev` + legacy `next dev` under a supervisor that
restarts a crashed process with backoff. Ports: slot N = API 8000+10N, web-2 3100+10N, legacy web
3200+10N; Redis db 4+N; one Postgres/Zitadel/RustFS for all slots. CORS of the API and of both buckets
follows the running slots.

- `just stack status` (all slots + containers), `logs <api|worker|web2|web|supervisor> [slot]`, `restart
  <api|worker|server|web2|web> [slot]` (api/worker/server rebuild first), `seed [slot]`, `down [slot]`.
- Files: `tmp/stack/<slot>.json` (ports, pids, db), `tmp/stack/<slot>/*.log` (no ANSI).
- Env: `infra/env/dev.env` (committed) + `infra/env/dev.local.env` (gitignored, created by `stack up`):
  `AB__ZITADEL__PAT` (copied from `just dev-up`'s `tmp/dev/zitadel-pat.txt`) and `E2E_PASSWORD`, the
  password of the seed-e2e accounts (`e2e-admin`, `e2e-teacher`, `e2e-student1/2`, `e2e-learner-NNN`).
- `just login-as <username|email> [slot]` prints `ab_session=...` for any active account (debug build +
  `AB__ENVIRONMENT=development` + loopback only; DECISIONS 2026-10-13). For a real-data copy:
  `just stack up 1 --db ashyq_prod`, then `just login-as <their username> 1`.
- A database migrated from a CRLF checkout gets its migration checksums re-stamped on `stack up`.

### 5.4 e2e

- Debug loop: `just e2e web2 --serve` builds and starts a production stand once (leave it running), then
  `just e2e web2 --reuse --project chromium --grep B-COL-09` runs only that scenario. Reuse keeps the same API,
  worker and database; fixtures remove their own test data. Logs/results go into a separate directory per run.
  Test edits need no restart. Application/server/toolchain changes are detected and refuse reuse: run
  `just e2e web2 --stop`, then `--serve` to rebuild and reset the stand. Stop retains the disposable database;
  the next start resets it. `--slot N` selects an independent stand. Run the full suite after focused fixes pass.

- `just e2e [web2|web] [--slot N] [--keep] [--no-build] [playwright args]`: Playwright against a production build
  (web-2: `vp build` + `serve.ts` behind `e2e/prod-stand.ts`, CSP as on the stand; legacy: `next build` +
  `next start`, beside slot 0's `next dev`) with its own API + worker on a fresh database `e2e_<app>_<slot>` cloned from
  `ashyq_seed` (`just db template` first when missing). Rebuilds only when the app's sources changed. Ports: slot N =
  API 8005+10N, web-2 stand 3105+10N, legacy 3205+10N, so runs in different slots do not collide. Prints the
  summary; everything else is in `tmp/e2e/<app>-<slot>/` (playwright.log, api.log, build.log). The database is
  dropped afterwards unless `--keep`.
- `just e2e-dev [web2|web] [--slot N] [args]`: the same suites against a running slot's dev servers (web-2 warms
  every route first).
- Both take the seed password from `infra/env/dev.local.env` and hand the suites their accounts, API log and learner
  pool; nothing to export by hand.

### 5.5 Checks and the contract

- Production image gate: set `E2E_WEB_HOST` to the image's baked public domain and `IMAGE_TAG` to its image tag;
  `just web-release-e2e up`, `just web-release-e2e seed`, `just web-release-e2e test release.spec.ts --project=chromium`
  and `just web-release-e2e down` use an isolated Compose project and network alias for that domain. Browser/API
  traffic stays inside that stand. CI also selects auth/public smoke and video upload and requires it before publish.
- Web-2 CI has three regular E2E shards and a separate real-Judge0 shard (`--grep @judge0` with the executor profile).
  Accepted, wrong-answer, compilation-error and time-limit verdicts are exercised against the real sandbox.
  All 63 themes in both modes run through `g15` in CI and `just ci-web2`.

- `just ci-watch <run-id>` watches one GitHub run, prints job/step changes and one warning for a step over five
  minutes, then exits with the result. Raw status and failed logs stay in `tmp/ci/<run-id>/`. It never retries or
  cancels automatically. `just ci-retry <run-id>` retries failed/cancelled jobs and their dependents, preserving successes.
- `just diagnose <log>` prints bounded failure context (or a tail); `just diagnose --trace <extracted.trace>`
  prints action/error timestamps, excluding snapshots and resources. Full originals stay on disk. Limits:
  40 lines, 500 characters per line, 12,000 characters total.
- CI browser setup has a five-minute step limit. E2E uses the official Playwright image matching the package pin
  (browsers/system dependencies included); setup and test durations appear separately in the run summary.

- `just check` runs only the gates the change touches (vs origin/main, plus the working tree; `--staged`,
  `--base <ref>`, `--all`): server fmt + clippy + nextest of the touched crates and their dependents (all
  tests for migrations/Cargo/.sqlx) + openapi drift; legacy typecheck + lint + vitest `related`; web-2
  `vp check` + vitest `related` + gates; contract drift for both clients; infra `ci-infra` + `test-dev`.
  One line per gate, live logs in `tmp/check/<gate>.log`; an area's first failure stops its later gates.
  Server tests use 127.0.0.1 (Windows: `localhost` hangs). Pre-push adds `--isolated-db`: a disposable Postgres
  container with the pinned pgvector image and memory-backed data, removed after the checks. Run the same mode
  locally with `just check --isolated-db`. Shared development data and its durability settings are unchanged.
  For one integration test, include both `binary(...)` and `test(...)` in the nextest filter to skip unrelated
  executables. Hook checkouts share installed frontend dependencies but keep their own Vite caches in
  `tmp/node_modules/.vite/` so application compiler plugins still exclude generated dependency code.
  Browser checks use two workers alongside the other areas. Child commands reuse the active Bun runtime and
  hide Windows consoles; logs record the exit status for diagnosing native process-start failures.
- `just contract` after a DTO / route / ErrorCode / upload-policy change: exports `openapi.v2.json`, accepts
  its two snapshots, regenerates both clients (incl. the upload-policy constants), lists what changed and
  the error codes still missing a message. Generated files are `linguist-generated` (.gitattributes):
  on a merge conflict regenerate instead of merging.

### 5.6 Databases

- `just db template` builds `ashyq_seed` once (migrated + `ashyq admin seed-e2e`, ~1-2 min; the e2e accounts'
  rows are copied from `ashyq_dev` first because Zitadel is shared). `just db fresh <name>` clones it in about
  a second (`CREATE DATABASE … TEMPLATE`); `just db drop <name>`, `just db ls`.
- `just db test-reset` recreates `ashyq_test` migrated and drops leftover `_sqlx_test_*` databases; it refuses
  while tests hold them (`--force`). Integration tests need no setup: `#[sqlx::test]` creates a migrated
  database per test from `ashyq_test`'s server.
