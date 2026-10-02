# Production findings

Open production/infrastructure issues, first recorded during the 2026-08-16
architecture analysis and pruned after the 2026-09-30 cutover. Items that died
with the legacy Python API, or were fixed by the v2 stack, were removed (see git
history). Ordered by severity.

"Fixed in repo" = done by the stage 1 modernization (`docs/INFRA.md`); prod
gets it with the stage 1 cutover (`docs/RUNBOOK.md` section 1). Delete those
items once the cutover has run.

## Critical

### 3. Backups never leave the machine (accepted risk)
`offen/docker-volume-backup` writes nightly archives to `./backups` **on the same
disk** it is backing up, with 7-day retention. A disk failure, host compromise, or
`rm` mistake loses the application *and* every backup of it.

**Owner decision 2026-10-02: no offsite backups.** Kept here as an accepted
risk. Stage 1 reduced what it can: archives are logical dumps plus volumes and
secrets, restorable by one script and checked by `just restore-drill`
(RUNBOOK 3.5). Copying an archive off the host by hand before risky work is
the only offsite protection left.

### 2. Redis has no AUTH
**Fixed in repo, takes effect at cutover (RUNBOOK).** Redis runs with
`--requirepass` (`REDIS_PASSWORD`); the server URL carries it.

### 1. Judge0 has no auth token
**Fixed in repo, takes effect at cutover (RUNBOOK).** Judge0 requires
`AUTHN_TOKEN` (`JUDGE0_AUTHN_TOKEN`, sent by the server as
`AB__JUDGE0__API_KEY`); smoke checks that a request without it gets 401. Its
port is not published.

## High

### 4. Admin credentials were shared in plaintext
The production admin password was pasted into a chat session during rewrite
planning. Rotate it (now a Zitadel credential) and enable MFA on the admin account.

### 30. The production SSH password was written into a repository file
On 2026-10-02 the host's SSH password was pasted into `docs/MODERNIZATION-STAGE-1.md`
(staged, never committed or pushed; scrubbed before the first commit). Rotate it and
switch the host to key-only authentication (`PasswordAuthentication no`).

### 8. Judge0 shares the production Postgres and Redis instances
**Fixed in repo, takes effect at cutover (RUNBOOK).** Judge0 gets its own
`judge0-db` and `judge0-redis` on the internal `exec-net` and has no network
path to the app's `db` or `redis`.

## Medium

### 9. No monitoring or alerting in production (accepted risk)
The server exports OTLP (`AB__TELEMETRY__OTLP_ENDPOINT`) but nothing alerts.
**Owner decision 2026-10-02: no external monitoring services** (no uptime
check, no dead-man ping). Covered at deploy time only: `preflight` warns on
Zitadel PAT expiry (30 days), TLS certificate expiry (14 days) and disk over
85%, and `smoke` checks readiness after every deploy and rollback. Between
deploys an outage, a failed nightly backup or a filling disk goes unnoticed
until someone looks.

### 10. Legacy secrets linger in the production `.env`
**Fixed in repo, takes effect at cutover (RUNBOOK).** `split-env.sh` moves
the `PLATFORM_*` values out of `.env` into `.env.legacy-removed`, preflight
fails while any remain in `.env`, and RUNBOOK 1.5 deletes that file.

### 11. deploy.sh builds on the production box
**Fixed in repo, takes effect at cutover (RUNBOOK).** CI builds both images,
smoke-tests the full stack and publishes `<sha>` tags to GHCR; `just deploy`
pulls them and refuses a sha without images. Migrations are still
forward-only: deploy dumps the database before a release that changes them.

### 13. Frontend tests/E2E have no CI path
Half closed: lint, typecheck, unit tests, the API contract and the error-code
check run in CI (`ci.yaml`, web-gates). Still open: Playwright runs only by
hand, and `scripts/run-vitest.mjs` pins Vitest over a stale vite-plus bundle
(remove when vite-plus catches up).

### 29. Flaky server test under coverage
`ab-api::mfa_flow::fenced_totp_login_retries_without_replaying_the_code`
(`crates/api/tests/mfa_flow.rs:580`, "the retry ran": left 0, right 1) failed once in
the `Coverage floor` step (CI run 37062388407) after passing in the plain test step of
the same run and in five other runs. Timing-dependent under llvm-cov instrumentation.
A red server gate blocks `publish`; re-run the job until the test is made deterministic.

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
