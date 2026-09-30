# Production findings

Open production/infrastructure issues, first recorded during the 2026-08-16
architecture analysis and pruned after the 2026-09-30 cutover. Items that died
with the legacy Python API, or were fixed by the v2 stack, were removed (see git
history). Ordered by severity.

## Critical

### 3. Backups never leave the machine
`offen/docker-volume-backup` writes nightly archives to `./backups` **on the same
disk** it is backing up, with 7-day retention. A disk failure, host compromise, or
`rm` mistake loses the application *and* every backup of it.

**Fix:** point offen at an offsite target (it natively supports S3-compatible
storage, WebDAV, SSH). RustFS is *not* a valid offsite target (same box) — use an
external bucket (e.g. Cloudflare R2, free at this size). Do a restore drill once.

### 2. Redis has no AUTH
Redis holds live sessions and runs without `requirepass`. It is no longer
published to the host (only `data-net` reaches it), which removes the external
exposure; add `--requirepass` anyway as defence in depth.

### 1. Judge0 has no auth token
`judge0.conf` has empty `AUTHN_TOKEN` / `AUTHZ_TOKEN`. Its port is no longer
published (only `exec-net`/`data-net` reach it); still set `AUTHN_TOKEN` and verify
the VPS firewall blocks 2358.

## High

### 4. Admin credentials were shared in plaintext
The production admin password was pasted into a chat session during rewrite
planning. Rotate it (now a Zitadel credential) and enable MFA on the admin account.

### 8. Judge0 shares the production Postgres and Redis instances
`judge0-server`/`judge0-workers` point at the same `db` and `redis` containers as
the application. Sandbox workloads contend with production for the same database
server, and a Judge0 compromise has network line-of-sight to production data
stores. **Fix:** give Judge0 its own Postgres database+user with no grants on the
app database (verify), or its own lightweight Postgres/Redis on `exec-net` only.

## Medium

### 9. No monitoring or alerting in production
The server exports OTLP (`AB__TELEMETRY__OTLP_ENDPOINT`) but nothing alerts.
Verify traces arrive in Logfire, add alert rules (error rate, job queue depth,
disk), and add an external uptime check (the box cannot alert about itself).

### 10. Legacy secrets linger in the production `.env`
The production `.env` still carries the legacy `PLATFORM_*` values (JWT secret,
bootstrap admin email/password, SQL/Redis strings). Nothing reads them now;
delete them.

### 11. deploy.sh builds on the production box
Image builds compete with production for CPU/RAM during deploys. Rollback is
cheap now (images are tagged by commit; `IMAGE_TAG=<old sha>`), but migrations
are forward-only.

### 13. Frontend tests/E2E have no CI path
Vitest and Playwright suites run only by hand. `scripts/run-vitest.mjs` pins
Vitest over a stale vite-plus bundle — remove the workaround when vite-plus
catches up. Wire `vp test` + Playwright into CI.

## Low

### 18. The per-assessment `required` flag does not drive progress
Legacy progress hard-coded `required = True` for every submission-backed
activity; v2 keeps that behaviour (so migrated courses complete the same way) and
carries the flag as `assessments.required`. Owner decision pending on whether the
flag should start driving progress (most existing assessments would become
optional overnight).

### 25. Imported data: duplicate email addresses
Two imported users shared `Nurgul287@mail.ru`; the import gave the duplicates
stable `+legacy-{id}` aliases. Tell the affected account holders which address to
retain.

### 26. Pre-assessment exam history was not imported
The legacy database had 19 `exam` and 45 `examattempt` rows from a model the
legacy app itself could no longer render; they were deliberately dropped. They
exist only in pre-cutover backups.

### 28. Leaderboards may carry inflated XP
Legacy `POST /gamification/xp` let learners award themselves XP; imported totals
may be inflated. Owner call whether to reset XP.

## Resolved by v2 (kept because code cites the numbers)

- **16.** Legacy search matched `User.email` for anonymous callers. v2 search
  never matches email and shows people only to signed-in callers.
- **20.** Legacy declared `analytics_event` but never wrote a row. v2 records
  events from the write paths.
