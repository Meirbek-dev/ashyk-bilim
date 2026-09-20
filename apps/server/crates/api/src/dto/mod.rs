//! Response/request DTOs, grouped by context (one module per API tag).
//!
//! Rules: request DTOs use `#[serde(deny_unknown_fields)]` + garde; response
//! DTOs derive `ToSchema` and are built from domain types — never from DB rows
//! directly.

pub mod ai;
pub mod analytics;
pub mod assessments;
pub mod auth;
pub mod certifications;
pub mod code;
pub mod collections;
pub mod courses;
pub mod curriculum;
pub mod discussions;
pub mod file_submissions;
pub mod gamification;
pub mod grading;
pub mod health;
pub mod platform;
pub mod progress;
pub mod rbac;
pub mod search;
pub mod submissions;
pub mod uploads;
pub mod usergroups;
pub mod users;
pub mod utils;
pub mod work_queue;

/// Largest unix second a `timestamptz` holds (9999-12-31T23:59:59Z). Every
/// `*_unix` request field is bounded by it (BUG-206/212): past it Postgres
/// raises 22008 «timestamp out of range» → 500 instead of a 422.
pub(crate) const EPOCH_MAX: i64 = 253_402_300_799;

/// Distinguish an absent field (keep) from an explicit `null` (clear).
#[allow(clippy::option_option, reason = "three-state patch field")]
pub(crate) fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: serde::Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    <Option<T> as serde::Deserialize<'de>>::deserialize(deserializer).map(Some)
}
