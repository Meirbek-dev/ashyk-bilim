//! Response/request DTOs, grouped by context (one module per API tag).
//!
//! Rules: request DTOs use `#[serde(deny_unknown_fields)]` + garde; response
//! DTOs derive `ToSchema` and are built from domain types — never from DB rows
//! directly.

pub mod assessments;
pub mod auth;
pub mod code;
pub mod collections;
pub mod courses;
pub mod curriculum;
pub mod grading;
pub mod health;
pub mod platform;
pub mod rbac;
pub mod search;
pub mod submissions;
pub mod uploads;
pub mod usergroups;
pub mod users;
