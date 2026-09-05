//! `ab-clients` — typed clients for external services.
//!
//! Populated by later slices (see EXECUTION-PLAN.md):
//! - `zitadel` — session/user APIs (this slice); IdP intents + import batching
//!   arrive with 1.5/10.3
//! - `storage` — `object_store` against RustFS (slice 2.2)
//! - `judge0`  — code execution with circuit breaker (slice 4.4)
//! - `resend`  — transactional email (slice 1.x)
//! - `llm`     — rig-core facade; rig types must not leak out of that module
//!   (slice 8.1)
//!
//! Rule: every client is tested against wiremock fixtures that assert request
//! shape, and takes its base URL from config so tests can point it anywhere.

pub mod google;
pub mod judge0;
pub mod storage;
pub mod zitadel;
