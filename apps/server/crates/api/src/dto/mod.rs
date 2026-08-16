//! Response/request DTOs, grouped by context (one module per API tag).
//!
//! Rules: request DTOs use `#[serde(deny_unknown_fields)]` + garde; response
//! DTOs derive `ToSchema` and are built from domain types — never from DB rows
//! directly.

pub mod auth;
pub mod health;
