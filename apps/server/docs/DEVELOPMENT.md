# Server development reference

Server-only details: fixtures, cutover switches, auth limits, running against the
dev containers, sqlx and Zitadel notes. Dev stack, e2e, worktrees, hooks, checks
and the contract: `docs/RUNBOOK.md` 5; commands and build settings: `apps/server/AGENTS.md`.

## E2E fixtures (`ashyq admin seed-e2e`)

`ashyq admin seed-e2e [--learners N]` creates, idempotently, the accounts and
course the web e2e suites use and prints them as JSON (never the password):

- verified accounts `e2e-admin` (admin), `e2e-teacher` (instructor),
  `e2e-student1`, `e2e-student2` - emails `<key>@e2e.test`, password from
  `E2E_PASSWORD` (required; set on first creation only - `just dev-reset` to
  change it). Login is `POST /auth/login` with the username or email: it checks
  the password in Zitadel, so the stack needs Zitadel up and `AB__ZITADEL__PAT`
  set (accounts are created through Zitadel exactly like `POST /users`).
- `--learners N`: verified pool accounts `e2e-learner-001..N` the suites take
  instead of self-registering.
- `E2E seed course` owned by the teacher, published, one chapter with one
  activity of every type (dynamic page, video, document - no file, file
  submission, quiz, exam, code challenge in Python), `e2e-student1` enrolled.

It refuses `AB__ENVIRONMENT=production`. Usually run for you: `just db template`,
`just stack up --seed` / `just stack seed`, `just web2-seed` on the stand. By hand,
with the API's env (`apps/server/.env`): `E2E_PASSWORD=... just server seed-e2e`.

## Stage 2 cutover switches

- **Web links** `AB__SERVER__WEB_LINKS`: `legacy` (default, the old web's
  URLs) or `v2` (the new web's URL map). Every link the server
  builds follows it: verification / reset emails, the Google sign-in error
  redirect, the certificate PDF's QR code, `next_action.href`, work-queue
  hrefs. Set `v2` in the release that switches the web; a web rollback sets
  `legacy` again (no server rollback). Code: `ab_core::links`.
- **Data migrations** (`docs/STAGE-2-CUTOVER.md`), idempotent, `--dry-run` prints counts,
  safe while the old web runs; same env as the API:
  - `ashyq admin migrate-editor-docs [--dry-run] [--after-cutover]` - D-01:
    `blockEmbed` → `embedBlock`, plain-paragraph HTML posts → JSON documents.
    Refuses while an embed would become type `url` (the old web cannot render
    it) unless `--after-cutover`.
  - `ashyq admin migrate-themes [--dry-run]` - D-02: unknown themes → `NULL`.
  - `ashyq admin migrate-locales [--dry-run]` - D-03: `ru-RU|kk-KZ|en-US` →
    `ru|kk|en` (after migration `20261003000020`).
- **Renamed paths** (S-10): `/trail...` → `/enrollments...` and
  `/progress/activities/...`, `/usergroups...` → `/groups...`. The old
  operations are `deprecated: true` + `x-replaced-by` in `openapi.v2.json`
  (`ab_api::RENAMED`); phase 9 deletes them.
- **Phase 9 list**: [`phase9-removals.md`](phase9-removals.md) names every
  operation, field, behaviour and setting kept only for the old web, with
  its replacement. Adding a replacement or a dual path = appending a row.

## Auth throttles (`AB__AUTH__LIMITS__*`)

Sign-in throttles and the session cap are config; the defaults are the
production values, and `AB__ENVIRONMENT=production` refuses anything looser
(config error at boot / `ashyq admin config-check`). `infra/env/dev.env` raises
them for local dev and parallel e2e runs:

| Variable | Default | Counts |
| --- | --- | --- |
| `AB__AUTH__LIMITS__LOGIN_IP` | 20 | failed logins per IP / 5 min |
| `AB__AUTH__LIMITS__LOGIN_NAME` | 10 | login attempts per account / 15 min |
| `AB__AUTH__LIMITS__PASSWORD_CHECK` | 5 | wrong current-password guesses per user / 15 min |
| `AB__AUTH__LIMITS__REGISTER_IP` | 10 | accounts created per IP / hour |
| `AB__AUTH__LIMITS__REGISTER_ATTEMPT_IP` | 60 | register + verify attempts per IP / hour |
| `AB__AUTH__LIMITS__SESSIONS_PER_USER` | 10 | live sessions per user (oldest evicted) |
| `AB__AUTH__LIMITS__PASSWORD_RESET_IP` | 20 | password-reset requests + confirmations per IP / hour |
| `AB__AUTH__LIMITS__EMAIL_PER_ACCOUNT` | 3 | reset / verification-resend mails per account / hour (silent cap) |

Without Resend (`AB__RESEND__*` unset) the verification and password-reset
codes are logged (`resend not configured: … code not delivered`, field
`code`) - the web e2e reads them from the API log.

## Running against the dev containers

`just stack up` runs the API, worker and both webs (RUNBOOK 5.3, which also lists
the container ports and credentials). For cargo/sqlx alone: `just dev-up`, then
`cp apps/server/.env.example apps/server/.env` (it already matches `infra/env/dev.env`)
and paste `tmp/dev/zitadel-pat.txt` into `AB__ZITADEL__PAT`. From the repo root:
`just server migrate` (dev database), `just server test` (sets `TEST_REDIS_URL`;
`TEST_S3_ENDPOINT` defaults to `http://localhost:9002`). CI's server-test runs the
same `just dev-up`, with `DATABASE_URL` on `ashyq_test`.

Windows: Git Bash rewrites container paths (`/data` becomes
`C:/Program Files/Git/data`). `infra/scripts/lib.sh` sets `MSYS_NO_PATHCONV=1`
for every recipe; set it yourself only for ad-hoc container commands in Git Bash.

Zitadel API calls validated against the dev stack (keep these working): `GET /debug/healthz`;
`POST /v2/users/human` (password + pre-verified email);
`POST /v2/sessions` with `checks.user.loginName` + `checks.password` → returns
`sessionId`/`sessionToken`, wrong password → typed `CredentialsCheckError` with
`failedAttempts`. Auth: `Authorization: Bearer <PAT from pat.txt>`.

## sqlx 0.9 gotchas

- The `query!` macros parse **every ancestor `.env`** up to the drive root and
  hard-error if any is unparseable, including a production `.env` at the
  repo root. Unquoted values with backslashes break dotenvy; quote such
  values with single quotes (compose semantics unchanged).
- `Transaction` doesn't impl `Executor`: pass `&mut *tx`.
- Runtime-built SQL needs `AssertSqlSafe` (+ `// SAFETY:`).
- Compilation uses the committed `.sqlx/` cache (the recipes default
  `SQLX_OFFLINE=true`); after changing SQL run `just server prepare` (needs the
  dev database) and commit the cache.
