# Agent Playbook — ashyq server (Rust rewrite)

You are a coding agent working on the Rust backend. This file is your operating
manual. The design rationale lives in `docs/rewrite/ARCHITECTURE.md` (read it once
per session); the work queue lives in `docs/rewrite/EXECUTION-PLAN.md` (keep it
updated); this file tells you **how to work**.

## Ground rules

1. **Branch `rewrite`, direct commits.** No PRs. The branch must be green
   (`just ci`) at the end of every session. If you break it, fixing it is your
   next task — nothing else.
2. **`just` is the only entry point.** Never invent ad-hoc cargo invocations in
   docs, CI, or scripts — add a recipe instead. `just ci` locally is byte-for-byte
   what CI runs.
3. **Update the plan.** Before starting: mark your slice `in-progress` in
   EXECUTION-PLAN.md. After landing: `done <sha>`, plus new rows for any
   discovered work. Append one line to the session log.
4. **Deviations from ARCHITECTURE.md** require an entry in
   `docs/rewrite/DECISIONS.md` (create on first use): date, what, why, what it
   replaces. Silent divergence is the one unforgivable sin here — the next agent
   trusts these documents.
5. The legacy Python API (`apps/api`) is **read-only reference material**. Port
   semantics from it (especially: grading pipeline order, policy resolution,
   session limits, validation rules, AI prompts — copy prompts verbatim first).
   Never edit it; it is feature-frozen and dies at cutover.

## Commands

```
just check        # fmt-check + clippy(-D warnings) + sqlx offline check   — fast, run often
just test         # nextest: unit + db + http suites (needs services up)
just test-unit    # nextest: unit only — works with no DB/Docker (Windows sessions)
just ci           # everything CI runs, in CI order
just services     # compose up: db redis zitadel rustfs (dev profile)
just migrate      # sqlx migrate run (dev DB)
just migration NAME  # create a new migration file pair
just prepare      # cargo sqlx prepare — run after ANY .sql or query! change
just openapi      # export openapi.v2.json + refresh insta snapshot
just dev          # bacon watch loop (check + test-unit)
just cov          # coverage report + floor check
```

## Local dev stack — podman (this machine has podman 6, not docker)

DB integration tests (validated commands, 2026-08-16):

```
podman network create ashyq-dev
podman run -d --rm --name ashyq-test-pg --network ashyq-dev -p 5433:5432 `
  -e POSTGRES_USER=ashyq -e POSTGRES_PASSWORD=ashyq -e POSTGRES_DB=ashyq_test `
  docker.io/pgvector/pgvector:pg18
$env:DATABASE_URL='postgres://ashyq:ashyq@localhost:5433/ashyq_test'; cargo test --workspace
```

Zitadel (for auth-slice work; version pinned in docker-compose.rewrite.yml —
boots healthy in ~10s, writes a provisioning PAT to the mounted dir):

```
podman run -d --rm --name ashyq-zitadel --network ashyq-dev -p 8081:8080 `
  -v "$env:TEMP\zitadel-machinekey:/machinekey" `
  -e ZITADEL_DATABASE_POSTGRES_HOST=ashyq-test-pg -e ZITADEL_DATABASE_POSTGRES_PORT=5432 `
  -e ZITADEL_DATABASE_POSTGRES_DATABASE=zitadel `
  -e ZITADEL_DATABASE_POSTGRES_USER_USERNAME=zitadel -e ZITADEL_DATABASE_POSTGRES_USER_PASSWORD=zitadelpw `
  -e ZITADEL_DATABASE_POSTGRES_USER_SSL_MODE=disable `
  -e ZITADEL_DATABASE_POSTGRES_ADMIN_USERNAME=ashyq -e ZITADEL_DATABASE_POSTGRES_ADMIN_PASSWORD=ashyq `
  -e ZITADEL_DATABASE_POSTGRES_ADMIN_SSL_MODE=disable `
  -e ZITADEL_EXTERNALDOMAIN=localhost -e ZITADEL_EXTERNALPORT=8081 -e ZITADEL_EXTERNALSECURE=false `
  -e ZITADEL_FIRSTINSTANCE_PATPATH=/machinekey/pat.txt `
  -e ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_USERNAME=ashyq-provisioner `
  -e ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_NAME=ashyq-provisioner `
  -e ZITADEL_FIRSTINSTANCE_ORG_MACHINE_PAT_EXPIRATIONDATE=2030-01-01T00:00:00Z `
  ghcr.io/zitadel/zitadel:latest start-from-init --masterkey "MasterkeyNeedsToHave32Characters" --tlsMode disabled
```

Validated against it (keep these working): `GET /debug/healthz`;
`POST /v2/users/human` (password + pre-verified email — the ETL import path);
`POST /v2/sessions` with `checks.user.loginName` + `checks.password` → returns
`sessionId`/`sessionToken`, wrong password → typed `CredentialsCheckError` with
`failedAttempts`. Auth: `Authorization: Bearer <PAT from pat.txt>`.

If podman is somehow unavailable: work test-first with `just check` +
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

1. Read the legacy implementation (router + service + models) for the domain.
   Write down the behaviors as a checklist in the test file's doc comment —
   this is the port contract.
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

- `Transaction` doesn't impl `Executor`: pass `&mut *tx`.
- Runtime-built SQL needs `AssertSqlSafe` (+ `// SAFETY:`).
- `query!` without a live `DATABASE_URL` uses the committed `.sqlx/` cache; if you
  changed SQL and see stale-cache errors, run `just prepare` (needs services up).

## Legacy → new quick map (where to look when porting)

| Legacy (apps/api) | New home |
|---|---|
| `src/routers/X.py` | `crates/api/src/routes/x.rs` (+ `dto/x.rs`) |
| `src/services/X/` | `crates/domain/src/x/` |
| `src/db/X.py` (SQLModel) | `migrations/*.sql` + `crates/db/src/x.rs` |
| `src/worker/tasks/*.py` | `crates/jobs/src/handlers/*.rs` |
| `src/security/rbac.py` | `crates/core/src/permission.rs` + `crates/domain/src/identity/rbac.rs` |
| `src/app/errors.py` envelope | `crates/core/src/error/` + `crates/api/src/error.rs` (problem+json) |
| `src/services/ai/agents/*.py` prompts | `crates/domain/src/ai/agents/*` (prompts verbatim first) |
| `config/config.py` `PLATFORM_*` | `crates/core/src/config.rs` `AB__*` |
