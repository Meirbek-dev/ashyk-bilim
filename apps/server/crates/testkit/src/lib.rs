//! `ab-testkit` — the shared test harness (dev-dependency only).
//!
//! Slice 0.9 delivers:
//! - `TestApp::spawn()` — full router against a fresh migrated database, all
//!   external HTTP faked with wiremock, typed request helpers.
//! - Session minting for arbitrary role/permission sets.
//! - `fake`-based entity factories (`factory::course()`, …).
//! - Wiremock stub library: Zitadel session API, Judge0, Resend, and an
//!   OpenAI-compatible chat-completions endpoint (including SSE streaming) —
//!   each stub asserts request shape, not just canned responses.
//!
//! Convention: tests that need Postgres/Redis live in `crates/*/tests/`
//! (integration); `just test-unit` runs lib/bin tests only and needs no
//! services (Windows sessions without Docker).
