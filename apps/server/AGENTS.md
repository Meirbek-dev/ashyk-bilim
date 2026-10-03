# Agent Playbook — ashyq server (Rust)

You are a coding agent working on the Rust backend — the production API since
the 2026-09-30 cutover (the legacy Python API is gone; tag `legacy-final` keeps
it in git history). The design rationale lives in `docs/ARCHITECTURE.md`
(read it once per session); this file tells you **how to work**.

## Ground rules

1. **Branch `main`, direct commits.** No PRs; `main` is the only branch. It
   must be green (`just ci`) at the end of every session. If you break it,
   fixing it is your next task — nothing else.
2. **`just` is the only entry point.** Never invent ad-hoc cargo invocations in
   docs, CI, or scripts — add a recipe instead. `just ci` locally is byte-for-byte
   what CI runs.
3. **Deviations from ARCHITECTURE.md** require an entry in
   `docs/DECISIONS.md`: date, what, why, what it replaces. Silent
   divergence is the one unforgivable sin here — the next agent trusts these
   documents.
4. **Production data is migrated legacy data.** Keep the code paths that serve
   it (legacy uuids, legacy video thumbnails, the `custom` activity kind,
   legacy certificate code layouts, trail steps without projection rows).
   Imported users log in with their argon2/bcrypt hashes, verified by
   Zitadel's passwap (`ZITADEL_SYSTEMDEFAULTS_PASSWORDHASHER_VERIFIERS`).

## Commands

```
just check        # fmt-check + clippy(-D warnings) - fast, run often
just test         # nextest: unit + db + http suites (needs the dev stack)
just test-unit    # nextest: unit only - works with no DB/containers (Windows sessions)
just ci           # = CI server-gates: fmt-check clippy sqlx-check test deny machete cov openapi-check
just services     # = root `just dev-up` (db redis zitadel rustfs + init jobs)
just migrate      # sqlx migrate run (DATABASE_URL from apps/server/.env)
just migration NAME  # create a new migration file pair
just prepare      # cargo sqlx prepare - run after ANY .sql or query! change
just sqlx-check   # committed .sqlx cache matches schema + queries
just openapi      # export openapi.v2.json
just openapi-check   # fail if the committed openapi.v2.json differs from a fresh export
just dev          # bacon watch loop
just cov          # coverage report + floor check
just seed-e2e     # web e2e fixtures (see below)
```

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

Point the server at it: `cp apps/server/.env.example apps/server/.env` (the
example already matches `dev.env`) and paste the PAT into `AB__ZITADEL__PAT`.
Then from the repo root: `just server migrate` (dev database), `just server
test` (sets `TEST_REDIS_URL`; `TEST_S3_ENDPOINT` defaults to
`http://localhost:9002`). CI runs the same `just dev-up`, with `DATABASE_URL`
on `ashyq_test`.

Gotchas (this machine):

- **Build location.** X: is small and the debug target dir grows to 30+ GB
  (X: ran out of disk once, 2026-08-16; symptom: LNK1180/LNK1318 / "IO failure
  on output stream: no space on device"). Set
  `$env:CARGO_TARGET_DIR = 'E:\dev-caches\cargo-target\ashyq-server'` at the
  start of every session before building. If builds still fail on space,
  delete that dir and rebuild. Since 2026-09-29 all Rust caches live on E:
  (user env vars): `CARGO_HOME=E:\dev-caches\cargo` (registry + installed
  tools, on PATH), `RUSTUP_HOME=E:\dev-caches\rustup`, default
  `CARGO_TARGET_DIR=E:\dev-caches\cargo-target`.
- **Page file.** Linking the ~15 `ab-api` integration-test binaries in
  parallel can exhaust the Windows page file (`os error 1455`, surfacing as
  bogus `can't find crate` errors). Cap build parallelism for test builds:
  `cargo nextest run --workspace --build-jobs 4`.
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

If no container runtime is available: work test-first with `just check` +
`just test-unit`, write the DB/HTTP tests anyway, and note in the plan that CI
validates them. Never skip writing the tests.

## Hard invariants (violations = defects, most are lint/CI-enforced)

- No `unwrap` / `expect` / `panic!` / `todo!` / `unimplemented!` / `dbg!` /
  `println!` outside `#[cfg(test)]` and the `testkit` crate. Return
  `ab_core::Error`. (Workspace lints deny these — don't `#[allow]` around them;
  fix the design instead. An `#[allow]` needs a `// SAFETY:`-style justification
  comment and is grep-audited.)
- Every fallible path returns `Result<_, ab_core::Error>`; new user-visible
  failure modes get a new `ErrorCode` in `ab-core/src/error/code.rs` (one place),
  English message, and the registry snapshot updated.
- Every endpoint: registered via `utoipa_axum::routes!` (never bare `Router::route`),
  typed request DTO with `#[serde(deny_unknown_fields)]` + garde, typed response
  DTO with `ToSchema`, at least one happy-path and one auth-failure HTTP test.
- Permission checks live in `ab-domain` service methods (`actor.require(...)`),
  never only in handlers. New mutating routes must pass the RBAC sweep test.
- SQL: `query!`/`query_as!` for static SQL; `QueryBuilder` for dynamic;
  `AssertSqlSafe` requires a `// SAFETY:` comment. After any query/schema change:
  `just prepare` and commit `.sqlx/` — CI fails otherwise.
- Migrations are append-only once committed. Fixing a migration = a new migration.
- Jobs enqueue inside the transaction of the fact that caused them.
- All timestamps `jiff` + `timestamptz`; all ids UUIDv7 newtypes from `ab_core::id`
  (never bare `Uuid` in domain signatures — `CourseId`, `UserId`, …).
- Secrets are `SecretString`; if you can `Debug`-print it, it's a bug.
- rig/LLM types stay inside `ab-clients::llm`. sqlx types stay out of `ab-api` DTOs.
- Response DTOs live in `ab-api::dto`; DB row structs never derive `Serialize`.

## How to build a slice (the standard loop)

1. Write down the behaviors as a checklist in the test file's doc comment —
   this is the contract.
2. Migration: new numbered SQL in `migrations/` (schema per ARCHITECTURE §8 rules:
   uuidv7 PK, timestamptz pair, text+CHECK enums, deliberate FKs).
3. `ab-db` queries module: typed row structs + query fns. `just prepare`.
4. `ab-domain` service: `Actor`-first methods, permission checks, tx boundaries,
   domain events/jobs.
5. `ab-api`: DTOs + handlers (thin: extract → call domain → map to DTO) +
   `routes!` registration + OpenAPI tag.
6. Tests, in this order of value: DB tests (`#[sqlx::test]`) for queries and
   constraints; HTTP tests via `ab_testkit::TestApp` with insta snapshots for
   success and error envelopes; RBAC cases. Factories go in testkit, not inline.
7. `just openapi` (snapshot will show your contract — read the diff, it's your
   review), `just ci`, commit, update plan.

Commit style: `feat(domain): summary`, `fix:`, `chore:`, `test:`, `docs:` —
one slice per commit where practical. End every commit message with:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Testing patterns

```rust
// DB test — fresh migrated database per test, transaction-isolated:
#[sqlx::test(migrations = "../../migrations")]
async fn attempt_limit_enforced(pool: PgPool) { /* … */ }

// HTTP test — full app, fakes for external HTTP, minted session:
#[tokio::test]
async fn teacher_publishes_grades() {
    let app = TestApp::spawn().await;            // DB + wiremock Zitadel/Judge0/LLM/Resend
    let teacher = app.actor_with(&["assessment:grade:assigned"]).await;
    let res = app.post_as(&teacher, "/api/v2/…", json!({ … })).await;
    assert_eq!(res.status(), 200);
    insta::assert_json_snapshot!(res.json().await, { ".id" => "[uuid]", ".created_at" => "[ts]" });
}
```

- Integration test files (`crates/*/tests/*.rs`) start with
  `#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]` —
  panics ARE failures there. Production code never gets these allows.
- Snapshot redactions for ids/timestamps are mandatory (deterministic snapshots).
- Wiremock stubs assert request shape (method, path, key fields), not just replies.
- Time in tests goes through `ab_core::time::Clock` (injectable); never sleep to
  test time-dependent logic.

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
