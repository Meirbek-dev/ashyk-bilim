# Findings outside the rewrite scope

Discovered during the 2026-08-16 architecture analysis for the Rust rewrite.
None of these are fixed by the rewrite itself — they concern the running production
system, infrastructure, or repository hygiene, and need action independently of
(or before) the cutover. Ordered by severity.

## Critical

### 1. Judge0 API is exposed to the host, unauthenticated
`docker-compose.yml` publishes `2358:2358` for `judge0-server`, and `judge0.conf`
has **empty** `AUTHN_TOKEN` / `AUTHZ_TOKEN`. Anyone who can reach the VPS on port
2358 can submit and execute arbitrary code inside the privileged Judge0 containers.

**Fix:** remove the `ports:` mapping (the API reaches Judge0 over the internal
`exec-net`; nothing external needs it), set `AUTHN_TOKEN`, and verify the VPS
firewall blocks 2358 today. This is a five-minute change — do it now, not at cutover.

### 2. Postgres (5432) and Redis (6379) are published to the host; Redis has no AUTH
Both `db` and `redis` services publish their ports. Redis runs `redis:8.8-alpine`
with no `requirepass` — and Redis holds **live auth sessions**, so open access to
it is full account takeover. Postgres is one password away.

**Fix:** delete both `ports:` mappings (all consumers are on `data-net`; local
debugging can use `docker compose exec`), or at minimum bind to `127.0.0.1:`.
Add `--requirepass` to Redis regardless. Verify the VPS firewall in the meantime.

### 3. Backups never leave the machine
`offen/docker-volume-backup` writes nightly archives to `./backups` **on the same
disk** it is backing up, with 7-day retention. A disk failure, host compromise, or
`rm` mistake loses the application *and* every backup of it.

**Fix:** point offen at an offsite target (it natively supports S3-compatible
storage, WebDAV, SSH). After the rewrite, RustFS is *not* a valid offsite target
(same box) — use an external bucket (e.g. Cloudflare R2, free at this size).
Do a restore drill once.

## High

### 4. Admin credentials were shared in plaintext
The production admin password was pasted into a chat session (this one) during
rewrite planning. Rotate it now. It migrates to Zitadel at cutover anyway; enable
MFA on the admin account once Zitadel is live.

### 5. No TLS certificate automation
nginx mounts `./certs` read-only; there is no ACME/certbot service or renewal cron
in the repo. If renewal is manual, an expired cert is a full outage waiting for a
calendar reminder. **Fix:** document/automate renewal (certbot container or acme.sh
cron + `nginx -s reload`), or confirm the university provides and rotates certs.

### 6. Open registration with no email verification
Email verification was deliberately removed from the Python API (migrations
`b84feb892d7a`, `c72bd6adabed`). Anyone can register any email address, and
lockout/creation emails go out via Resend to addresses the registrant does not
own — an abuse and sender-reputation risk. Zitadel restores verified registration
at cutover; until then, consider whether open registration should stay enabled.

### 7. CI is entirely dead
All five GitHub workflows trigger on the defunct `openu` branch (default is `main`),
so **nothing runs on any push today**. Additionally, even if re-pointed:
- `api-tests.yaml` runs `pytest src/tests/security/ --cov=src.security` — that
  directory does not exist;
- `contract-sync.yaml` diffs `apps/web/src/lib/api/generated/schema.ts`, which
  Orval no longer emits (output moved to `api.schemas.ts` + tags-split dirs) —
  the check is vacuous;
- there is no web test, typecheck, or Playwright job at all.

You said you'll rename the branch yourself; the rewrite adds its own
`server-ci.yaml` (triggering on `rewrite`/`main`), but the legacy workflows should
be deleted or fixed when you do the rename.

### 8. Judge0 shares the production Postgres and Redis instances
`judge0-server`/`judge0-workers` point at the same `db` and `redis` containers as
the application (`POSTGRES_HOST: db`, `REDIS_HOST: redis`). Sandbox workloads
contend with production for the same database server, and a Judge0 compromise has
network line-of-sight to production data stores. `judge0_patch.py` also writes
directly into Judge0's tables at API boot. **Fix (post-cutover is fine):** give
Judge0 its own Postgres database+user with no grants on the app database (it
already should — verify), or its own lightweight Postgres/Redis containers on
`exec-net` only.

## Medium

### 9. No monitoring or alerting in production
Logfire is instrumented in the Python API but the project is empty (confirmed by
owner) — either disabled or misconfigured. Container healthchecks restart services
but notify no one. After the rewrite ships OTLP → Logfire: verify data actually
arrives, add alert rules (error rate, job queue depth, disk), and add an external
uptime check (the box cannot alert about itself being down).

### 10. Bootstrap admin env vars linger in `.env`
`PLATFORM_INITIAL_ADMIN_EMAIL/_PASSWORD` remain in the production `.env` after
first boot. Remove them once setup is done (the Rust stack replaces this with a
Zitadel bootstrap flow, but the same hygiene applies to its secrets).

### 11. deploy.sh residual risks (accepted by owner)
Kept by explicit decision. Residual risks worth knowing: `git reset --hard` on the
box discards any hotfix made there; image builds compete with production for CPU/RAM
during deploys; rollback means rebuilding an older commit rather than re-tagging a
previous image. A cheap mitigation that keeps the workflow: tag the current image
(`docker tag app:latest app:prev`) before each build.

### 12. `temp-restore/` (~1 GB) sits in the working tree
Gitignored but on disk in the repo. Delete after ETL rehearsals for the rewrite
are finished. Same for stray archives in `backups/` once offsite backup (finding 3)
is in place.

### 13. Frontend tests/E2E have no execution path
59 Vitest files and a Playwright suite exist but run only by hand.
`scripts/run-vitest.mjs` pins Vitest over a stale vite-plus bundle — remove the
workaround when vite-plus catches up. Wire `vp test` + Playwright into CI when
workflows are revived (finding 7).

## Low

### 14. Repo clutter
- `apps/rewrite suggestions.txt` — untracked LLM transcript; superseded by
  `docs/rewrite/`; delete.
- `apps/api-v2/` — bare `cargo new` stub; superseded by `apps/server/`; deleted
  as part of the rewrite scaffold.
- Git warns about a missing `.claude/skills/next-intl-app-router/` directory —
  skills state out of sync; re-run skill installation or prune the reference.

### 15. Backend user-facing strings are hardcoded Russian
Role display names and error messages live as Cyrillic literals in the Python
code and seeded DB rows. The rewrite fixes the API side (stable error codes,
frontend translates), but the **seeded role display names in the database** will
carry over through ETL unless normalized — tracked in the migration plan, noted
here so it isn't forgotten if seeding is re-run on the legacy system.

### 16. Legacy search exposes user emails and profiles to any caller
`GET /search` in the Python API matches against `User.email` (ILIKE) and
returns user results to **anonymous** callers, letting anyone enumerate
account holders by email fragment. The v2 search drops email matching
entirely and returns the people section only to authenticated sessions
(username/display-name matching only). No legacy-side fix planned — the
endpoint dies at cutover.

### 17. Legacy reference-solution check was open to learners
`POST /assessments/{uuid}/code-challenge/validate` ran every stored reference
solution against the full test set for anyone with **submit** access — the
same gate as taking the assessment — returning per-test pass/fail, timings and
compile output. A learner could burn Judge0 capacity at will and probe the
reference solutions. v2 exposes the check as `POST /assessments/{id}/
reference-check` for assessment authors only. No legacy-side fix planned.

### 18. The per-assessment `required` flag never reached progress
Legacy `AssessmentSettings.required` (default `false`) was stored but the
progress projection hard-coded `required = True` for every submission-backed
activity, and course completion counted every published activity. v2 keeps
the legacy behaviour (so migrated courses complete the same way) and carries
the flag as `assessments.required`. Owner decision pending on whether the flag
should start driving progress (then most existing assessments would become
optional overnight) — tracked for P9/P10 review; no legacy-side fix.

### 19. Learners could award themselves XP
Legacy `POST /gamification/xp` accepted any `source` from any signed-in user
and paid the default reward for it (only `custom_amount` demanded
`platform:manage`); the per-(source, source_id) uniqueness was the only brake,
and `source_id` was caller-chosen. A learner could script their way up the
leaderboard. v2 restricts the endpoint to platform managers and derives every
learner award server-side (progress projector, trail, login). No legacy-side
fix planned — the endpoint dies at cutover; leaderboards migrated from legacy
data may carry inflated totals (owner call whether to reset XP at cutover —
see QUESTIONS.md).


### 20. `/ai/usage` compared all-time tokens with the monthly budget
Legacy `routers/ai/token_usage.py` summed `input_tokens` + `output_tokens`
over every `ai_run` row ever written and reported `remaining_budget =
monthly_token_budget - that`, so the admin "budget" view hit zero and stayed
there after the first million lifetime tokens while the actual enforcement
(`TokenBudgetService`, month-scoped) kept accepting requests. v2 keeps a
`(month, user)` ledger and reports the current month. No legacy-side fix.

### 21. Admin AI run filters were applied after the row limit
Legacy `GET /ai/admin/runs` fetched the newest 200 runs of the window and
then filtered by `feature` / `provider` / `course_uuid` in Python, so a
filtered view could come back empty (or short) while older matching runs
existed — the page was a sample, not a query. v2 pushes every filter into
SQL and pages by keyset. No legacy-side fix.

### 22. AI capabilities leaked private course metadata
Legacy `GET /ai/capabilities/scope/{course_uuid}` loaded the course without
`require_ai_course_read` and answered with the course name, the activity
name and the context source count for any signed-in caller, including
courses they could not see. v2 answers `available=false,
reason=course_not_found` for unknown and invisible courses alike. No
legacy-side fix planned — low sensitivity, dies at cutover.
