# Server development reference

Read the relevant section for fixtures, auth limits, cutover, or local services.

### E2E fixtures (`just seed-e2e`)

`ashyq admin seed-e2e` creates, idempotently, the accounts and course the web
e2e suites use and prints them as JSON (never the password):

- verified accounts `e2e-admin` (admin), `e2e-teacher` (instructor),
  `e2e-student1`, `e2e-student2` - emails `<key>@e2e.test`, password from
  `E2E_PASSWORD` (required; set on first creation only - `just dev-reset` to
  change it). Login is `POST /auth/login` with the username or email: it checks
  the password in Zitadel, so the stack needs Zitadel up and `AB__ZITADEL__PAT`
  set (accounts are created through Zitadel exactly like `POST /users`).
- `E2E seed course` owned by the teacher, published, one chapter with one
  activity of every type (dynamic page, video, document - no file, file
  submission, quiz, exam, code challenge in Python), `e2e-student1` enrolled.

It refuses `AB__ENVIRONMENT=production`. Run from `apps/server` with the same
env as the API (`.env`): `E2E_PASSWORD=... just seed-e2e`.

### Stage 2 cutover switches

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
    it; 1 on the restored copy) unless `--after-cutover`.
  - `ashyq admin migrate-themes [--dry-run]` - D-02: unknown themes → `NULL`.
  - `ashyq admin migrate-locales [--dry-run]` - D-03: `ru-RU|kk-KZ|en-US` →
    `ru|kk|en` (after migration `20261003000020`).
- **Renamed paths** (S-10): `/trail...` → `/enrollments...` and
  `/progress/activities/...`, `/usergroups...` → `/groups...`. The old
  operations are `deprecated: true` + `x-replaced-by` in `openapi.v2.json`
  (`ab_api::RENAMED`); phase 9 deletes them.
- **Phase 9 list**: `docs/phase9-removals.md` (this crate) names every
  operation, field, behaviour and setting kept only for the old web, with
  its replacement. Adding a replacement or a dual path = appending a row.

### Auth throttles (`AB__AUTH__LIMITS__*`)

Sign-in throttles and the session cap are config; the defaults are the
production values, and `AB__ENVIRONMENT=production` refuses anything looser
(config error at boot / `ashyq admin config-check`). Parallel e2e runs and
local dev raise them:

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

From the repo root the same recipes run as `just server <recipe>` (e.g.
`just server test`; it also sets `TEST_REDIS_URL` from `infra/env/dev.env`).

## Local dev stack

One command from the repo root, docker or podman (auto-detected; on this
machine podman with the docker-compose provider):

```
just dev-up       # db redis zitadel rustfs + init jobs; ~30 s from zero, re-run = no-op
just dev-down     # stop, keep data
just dev-reset    # drop the stack and its volumes
```

It publishes on 127.0.0.1 (values: `infra/env/dev.env`, the single source;
override `DEV_*_PORT` in the shell for a second copy):

| Service | Port | Credentials |
| --- | --- | --- |
| Postgres 18 + pgvector | 5433 | role `ashyq` / `ashyq` (CREATEDB, not superuser); databases `ashyq_dev`, `ashyq_test` |
| Redis | 6380 | password `ashyq-dev` |
| Zitadel | 8081 | PAT written to `tmp/dev/zitadel-pat.txt` (repo root) |
| RustFS | 9002 | `ashyq-dev` / `ashyq-dev-secret`; buckets `ab-public`, `ab-private` |

To run the API, worker and both webs against it: `just stack up` (docs/RUNBOOK.md 5.3; env from
`infra/env/dev.env` + the gitignored `infra/env/dev.local.env`, `just login-as <user>` for a session).
For cargo/sqlx alone, point the server at it: `cp apps/server/.env.example apps/server/.env` (the
example already matches `dev.env`) and paste the PAT into `AB__ZITADEL__PAT`.
Then from the repo root: `just server migrate` (dev database), `just server
test` (sets `TEST_REDIS_URL`; `TEST_S3_ENDPOINT` defaults to
`http://localhost:9002`). CI runs the same `just dev-up`, with `DATABASE_URL`
on `ashyq_test`.

Gotchas (this machine):

- **Build location.** Recipes honor `CARGO_TARGET_DIR`; Windows defaults to
  `LOCALAPPDATA/ashyq-bilim/cargo-target` rather than the small checkout drive.
  This machine already sets `CARGO_TARGET_DIR=E:\dev-caches\cargo-target`,
  `CARGO_HOME=E:\dev-caches\cargo`, `RUSTUP_HOME=E:\dev-caches\rustup`.
  Check free space before building; do not delete the cache routinely.
- **Page file.** Linking the ~15 `ab-api` integration-test binaries in
  parallel can exhaust the Windows page file (`os error 1455`, surfacing as
  bogus `can't find crate` errors). Recipes default `CARGO_BUILD_JOBS` to 4 (16 on a 24+ CPU
  host); override it only when the machine has enough memory. Dev debuginfo is disabled.
- **Git Bash mangles container paths** (`/data` becomes
  `C:/Program Files/Git/data`). `infra/scripts/lib.sh` sets
  `MSYS_NO_PATHCONV=1` for every recipe; set it yourself only for ad-hoc
  container commands in Git Bash.
- Build with `--workspace`. A `-p <crate>` subset changes feature
  unification and pulls in `aws-lc-sys`, whose C build fails on this
  machine; the workspace build never needs it.

Zitadel API calls validated against the dev stack (keep these working): `GET /debug/healthz`;
`POST /v2/users/human` (password + pre-verified email);
`POST /v2/sessions` with `checks.user.loginName` + `checks.password` → returns
`sessionId`/`sessionToken`, wrong password → typed `CredentialsCheckError` with
`failedAttempts`. Auth: `Authorization: Bearer <PAT from pat.txt>`.

If no container runtime is available: use root `just server check` +
`just server test-unit`, write the DB/HTTP tests anyway, and note that CI
validates them. Never skip writing the tests.

## sqlx 0.9 gotchas (will bite you)

- The `query!` macros parse **every ancestor `.env`** up to the drive root and
  hard-error if any is unparseable — including the production `.env` at the
  repo root. Unquoted values with backslashes break dotenvy; quote such
  values with single quotes (compose semantics unchanged). Fixed once
  2026-08-16 (`PLATFORM_ALLOWED_REGEXP`).

- `Transaction` doesn't impl `Executor`: pass `&mut *tx`.
- Runtime-built SQL needs `AssertSqlSafe` (+ `// SAFETY:`).
- `query!` without a live `DATABASE_URL` uses the committed `.sqlx/` cache; if you
  changed SQL and see stale-cache errors, run `just prepare` (needs services up).
