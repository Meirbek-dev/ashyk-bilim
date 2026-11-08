---
name: server-slice
description: Add or change an ashyq-bilim API endpoint, query, migration or job in apps/server (Rust, axum + sqlx). Use for any server feature or server bug fix in this repo.
---

# Server slice

Rules live in `apps/server/AGENTS.md` (invariants, slice loop); this is the shortest path through them.

1. Read `apps/server/AGENTS.md`. Use `just brief` once per session if useful; a dev-stack issue does not block unrelated work.
2. New endpoint: `just new endpoint <tag> <operation>`. It writes `crates/api/tests/<tag>_<op>_flow.rs` and prints every
   place to touch with its current `file:line`. A fix: write the failing test first in the existing `*_flow.rs`.
3. DB tests: `#[ab_testdb::test] async fn name(pool: PgPool)` (template clone, ~0.2 s). HTTP through `TestApp::spawn(pool)`
   and its `get_as/post_as/...` helpers; sessions via `mint_session_for`. External services are wiremock (`app.zitadel`,
   `app.runner`, `app.llm`, `app.resend`).
4. Iterate with one test: `just server test -E 'test(<name>)'`. Schema change: `just new migration <name>`, then
   `just server prepare` and commit `.sqlx/`.
5. Access: decide in the domain service (`actor.require`), not the handler; then the route's row in
   `crates/api/tests/permission_matrix.rs` (the test names unclassified routes).
6. Contract: `just contract` regenerates the web client; read the printed drift.
7. Validate the changed behavior with focused checks; full server CI is not required before every commit. Then
   `just commit -m "fix(<domain>): ..."` (the `ship` skill).

Don'ts that cost a review round: `unwrap`/`expect`/prints outside tests, SQLx types in DTOs, `Serialize` on row structs,
editing an applied migration, a job enqueued outside the transaction that creates its fact.
