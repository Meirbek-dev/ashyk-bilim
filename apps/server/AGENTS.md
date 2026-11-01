# Server agent guide

Rust production API (`/api/v2`) and worker. Read architecture sections relevant to your change:
`docs/ARCHITECTURE.md`; a deviation updates that section in place, its commit message says why (`docs/DECISIONS.md`
is frozen history).
Fixtures, auth limits, cutover switches and local services: `apps/server/docs/DEVELOPMENT.md`.

## Commands (from the repository root)

Setup, `just check`, `just contract`, `just db`, commits and worktrees: root `AGENTS.md`; details in
`docs/RUNBOOK.md` 5.5-5.6. Server recipes (`apps/server/justfile`, run as `just server <recipe>`):

- `check`: format + workspace Clippy with warnings denied.
- `test-unit`: unit tests, no containers; add `-E 'test(name)'` to select tests.
- `test -E 'test(name)'`: selected unit/DB/HTTP tests; DB tests need `just dev-up`.
- `ci` (= root `just ci-server`): all server gates, including one coverage/test run.
- `migrate`: migrate the dev DB from `apps/server/.env`; `migration NAME` (or root `just new migration NAME`)
  appends one.
- `prepare`: refresh `.sqlx/` after SQL/schema changes; commit the cache.
- `openapi`: export `openapi.v2.json`; read and commit the contract diff (`just contract` also regenerates the webs).
- `dev` / `serve`: watch (bacon) / run the API.

Keep workspace builds: selecting a crate with `-p` changes TLS feature unification on Windows.
Use nextest filters instead. Build jobs default to 4, 16 on a 24+ CPU host (`CARGO_BUILD_JOBS` overrides).
Dev debuginfo is disabled. The cache is `apps/server/target` (Windows: `LOCALAPPDATA/ashyq-bilim/cargo-target`,
off the checkout drive; `CARGO_TARGET_DIR` overrides), suffixed `-<name>` in a `just wt` worktree. Do not delete it
routinely.
Rust is pinned in `rust-toolchain.toml` and Docker; tools in `tools.env`. Upgrade together.
Run coverage sequentially per cache: llvm-cov cleans the instrumented workspace artifacts.
Nextest runs 4 tests at once, 12 on a 24+ CPU host (`NEXTEST_TEST_THREADS` / `--test-threads` override). The latency
stampede test runs alone. DB tests use `#[ab_testdb::test]` (a clone of one migrated template per migration set, ~0.2 s)
with `async fn name(pool: PgPool)`; `#[sqlx::test(migrations = false)]` only for a test that migrates itself.
`just server cov --no-clean -E 'test(name)'` reuses coverage artifacts for a focused follow-up.
Compilation uses the committed SQLx cache by default; `prepare` and `sqlx-check` always use the database.

## Invariants

- Commit and push per root `AGENTS.md` (`just commit`, `just push`; skill `ship`). Run focused checks during an
  edit batch and `just ci-server` once before committing server changes. Fix a red hosted pipeline before other work.
- Never edit an applied migration. Never commit env files, keys, tokens or restored data.
- A constraint on existing data: repair violating rows with a stated deterministic rule first, or add it with
  `SELECT schema_try_check(table, name, expr)` (NOT VALID + VALIDATE; skipped with a warning and a
  `schema_skipped_checks` row when old rows violate it). A growing value list (`kind IN (...)`) is a lookup
  table with a foreign key (`notification_kinds`, `upload_purposes`), not a CHECK rewritten per value.
  New foreign keys get an index led by their first column (`fk_index_audit.rs`).
- Migrations deploy during classes and the previous release must run on the new schema (`migration_rules.rs`):
  start with `SET LOCAL lock_timeout = '5s';`, build an index on an existing table CONCURRENTLY in its own
  `-- no-transaction` file, and DROP COLUMN / DROP TABLE / RENAME only a release after the code stopped using it,
  in a file marked `-- contract: <why>`.
- Preserve migrated legacy data: UUIDs, video thumbnails, `custom` activities, certificate layouts,
  and trail steps without projection rows. Imported users authenticate through Zitadel passwap.
- No `unwrap`, `expect`, `panic!`, `todo!`, `unimplemented!`, `dbg!`, or stdout/stderr prints outside
  tests/testkit. Return `ab_core::Error`. A lint allowance needs a one-line safety justification.
- New user-visible failures need an `ErrorCode`, English message and registry snapshot.
- Endpoints use `utoipa_axum::routes!`, validated DTOs (`deny_unknown_fields`, garde), typed
  `ToSchema` responses, and happy-path/auth-failure HTTP tests. Mutations pass the RBAC sweep
  (`crates/api/tests/rbac_sweep.rs`).
- Permissions belong in domain services (`actor.require`), never only in handlers.
- Every route is a row of `crates/api/tests/permission_matrix.rs` (who may get a 2xx, probed as seven
  callers on a seeded world); a write checks the caller and the resource it names before the body
  (UX-311). Every `ON DELETE CASCADE` onto someone's work is listed with its reason in
  `crates/db/tests/cascade_audit.rs`. New routes and cascades fail until classified there.
- Grading math keeps its property tests (`crates/domain/src/grading/grader.rs`, proptest) green: bounds,
  single-answer multi-pick = 0, monotone partial credit, shuffle invariance, shares sum to 100.
- Upload caps live only in `policy` of `crates/domain/src/files/uploads.rs`; the contract exports them
  (`x-upload-policy`) and `just contract` regenerates the webs' constants.
- Static SQL uses `query!`/`query_as!`; dynamic SQL uses `QueryBuilder`. `AssertSqlSafe` needs
  a `// SAFETY:` comment. SQL/schema edits require `prepare` and the committed `.sqlx/` cache.
- Enqueue jobs inside the transaction that creates the underlying fact.
- Use `jiff` + `timestamptz`, UUIDv7 ID newtypes, and `SecretString` for secrets.
- LLM types stay inside `ab-clients::llm`; SQLx types stay out of API DTOs.
  DB row structs never derive `Serialize`; response DTOs live in `ab-api::dto`.

## Slice loop

1. State behaviors in the test file doc comment.
2. Append migrations, then typed `ab-db` queries/rows; refresh `.sqlx/`.
3. Add Actor-first domain methods, permissions, transaction boundaries and jobs.
4. Add thin API handlers and DTOs; register routes and OpenAPI tags.
5. Reuse `ab-testkit` factories, real router/middleware and wiremock external services.
   Prefer DB constraints, HTTP envelopes and RBAC cases. See `crates/api/tests/access_flow.rs`.
6. Export the contract, inspect generated diffs, run the relevant gates and commit one slice.

Tests may allow panic/unwrap/expect. Redact UUIDs/timestamps in snapshots; wiremock asserts request
shape. Time-dependent logic uses `ab_core::time::Clock`, not sleeps. With no containers, run
`check` + `test-unit`, still write DB/HTTP tests, and report that hosted CI must validate them.
Commit prefixes as in `git log`: `feat(server):`, `fix(auth):`, `test(server):`, `chore:`, `docs:`. Attribute actual
contributors.
