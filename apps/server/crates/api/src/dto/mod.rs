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

/// Every `*_unix` request field is bounded by it (BUG-206/212): past it
/// Postgres raises 22008 «timestamp out of range» → 500 instead of a 422.
pub(crate) use ab_core::time::EPOCH_MAX;

/// Distinguish an absent field (keep) from an explicit `null` (clear).
#[allow(clippy::option_option, reason = "three-state patch field")]
pub(crate) fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: serde::Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    <Option<T> as serde::Deserialize<'de>>::deserialize(deserializer).map(Some)
}

/// The one rule for a password the user sets (register, admin create,
/// change — BUG-293): at least 8 characters and at most 72 UTF-8 **bytes**,
/// bcrypt's input limit in Zitadel (past it Zitadel answers an opaque error).
// garde's custom-validator contract fixes this signature (&field, &context).
#[allow(clippy::trivially_copy_pass_by_ref)]
pub(crate) fn new_password(value: &str, _ctx: &()) -> garde::Result {
    if value.chars().count() < 8 {
        return Err(garde::Error::new("length is lower than 8"));
    }
    if value.len() > 72 {
        return Err(garde::Error::new(
            "password-too-long: at most 72 bytes in UTF-8",
        ));
    }
    Ok(())
}
