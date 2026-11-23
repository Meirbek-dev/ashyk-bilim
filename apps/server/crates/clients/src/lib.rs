//! `ab-clients` — typed clients for external services.
//!
//! Contents:
//! - `zitadel` — session/user APIs
//! - `storage` — `object_store` against RustFS (slice 2.2)
//! - `gojudge` — code execution in the go-judge sandbox, with circuit breaker
//! - `email`   — `Mailer`: Resend first, SMTP (lettre) second, for account codes
//! - `resend`  — the Resend HTTP client the mailer uses
//! - `link_preview` — the SSRF-guarded OpenGraph fetch behind
//!   `GET /utils/link-preview`
//! - `llm`     — the `LlmClient` facade over OpenAI-compatible chat
//!   completions (primary + fallback chain, streaming, structured output,
//!   token estimates); provider wire types never leave that module (slice 8.1)
//!
//! Rule: every client is tested against wiremock fixtures that assert request
//! shape, and takes its base URL from config so tests can point it anywhere.

pub mod email;
pub mod embed;
pub mod gojudge;
pub mod google;
pub mod link_preview;
pub mod llm;
pub mod resend;
pub mod storage;
pub mod zitadel;
