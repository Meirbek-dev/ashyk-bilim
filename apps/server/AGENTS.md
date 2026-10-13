# Server agent guide

Rust production API (`/api/v2`) and worker. Read architecture sections relevant to your change:
`docs/ARCHITECTURE.md`; deviations need a dated entry in `docs/DECISIONS.md`.
Fixtures, auth limits, cutover switches and local services: `apps/server/docs/DEVELOPMENT.md`.

## Commands (from the repository root)

- `just setup`: pinned tools, dependencies, generated skill copies and commit hook.
- `just doctor`: verify the recipe shell, versions, dependencies and hook.
- `just server check`: format + workspace Clippy with warnings denied.
- `just server test-unit`: unit tests, no containers; add `-E 'test(name)'` to select tests.
- `just server test -E 'test(name)'`: selected unit/DB/HTTP tests; DB tests need `just dev-up`.
- `just ci-server` (or `just server ci`): all server gates, including one coverage/test run.
- `just ci`: all local app/infra gates; images, E2E and secret scans run in hosted CI.
- `just server migrate`: migrate the dev DB from `apps/server/.env`.
- `just server migration NAME`: append a migration.
- `just server prepare`: refresh `.sqlx/` after SQL/schema changes; commit the cache.
- `just server openapi`: export `openapi.v2.json`; read and commit the contract diff.
- `just contract`: export + accept its snapshots + regenerate both web clients, one step (RUNBOOK 5.5).
- `just check`: the gates for what changed (fmt, clippy, nextest of touched crates + dependents, openapi).
- `just db fresh <name>` / `test-reset`: throwaway databases cloned from `ashyq_seed` (RUNBOOK 5.6).
- `just server dev` / `serve`: watch / run the API.

Keep workspace builds: selecting a crate with `-p` changes TLS feature unification on Windows.
Use nextest filters instead. Build jobs default to 4 (`CARGO_BUILD_JOBS` overrides).
Dev debuginfo is disabled. `CARGO_TARGET_DIR` overrides the cache; Windows otherwise uses
`LOCALAPPDATA/ashyq-bilim/cargo-target`, off the checkout drive. Do not delete the cache routinely.
Rust is pinned in `rust-toolchain.toml` and Docker; tools in `tools.env`. Upgrade together.
Run coverage sequentially per cache: llvm-cov cleans the instrumented workspace artifacts.
Nextest runs four tests at once; `--test-threads` overrides. The latency stampede test runs alone.
`just server cov --no-clean -E 'test(name)'` reuses coverage artifacts for a focused follow-up.
Compilation uses the committed SQLx cache by default; `prepare` and `sqlx-check` always use the database.

## Invariants

- Work on `main`, direct commits. Run focused checks during an edit batch and `just ci-server`
  once before committing server changes. Fix a red hosted pipeline before other work.
- Never edit an applied migration. Never commit env files, keys, tokens or restored data.
- Preserve migrated legacy data: UUIDs, video thumbnails, `custom` activities, certificate layouts,
  and trail steps without projection rows. Imported users authenticate through Zitadel passwap.
- No `unwrap`, `expect`, `panic!`, `todo!`, `unimplemented!`, `dbg!`, or stdout/stderr prints outside
  tests/testkit. Return `ab_core::Error`. A lint allowance needs a one-line safety justification.
- New user-visible failures need an `ErrorCode`, English message and registry snapshot.
- Endpoints use `utoipa_axum::routes!`, validated DTOs (`deny_unknown_fields`, garde), typed
  `ToSchema` responses, and happy-path/auth-failure HTTP tests. Mutations pass the RBAC sweep.
- Permissions belong in domain services (`actor.require`), never only in handlers.
- Every route is a row of `crates/api/tests/permission_matrix.rs` (who may get a 2xx, probed as seven
  callers on a seeded world); a write checks the caller and the resource it names before the body
  (UX-311). Every `ON DELETE CASCADE` onto someone's work is listed with its reason in
  `crates/db/tests/cascade_audit.rs`. New routes and cascades fail until classified there.
- Grading math keeps its property tests (`grading/grader.rs`, proptest) green: bounds, single-answer
  multi-pick = 0, monotone partial credit, shuffle invariance, shares sum to 100.
- Upload caps live only in `files/uploads.rs::policy`; the contract exports them (`x-upload-policy`) and
  `just contract` regenerates the webs' constants.
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
Commit prefixes: `feat(domain):`, `fix:`, `chore:`, `test:`, `docs:`. Attribute actual contributors.
