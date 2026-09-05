//! Route handlers, one module per API tag. Every handler carries a
//! `#[utoipa::path]` annotation and is mounted via `routes!` in `app.rs`.

pub mod assessments;
pub mod auth;
pub mod code;
pub mod collections;
pub mod courses;
pub mod curriculum;
pub mod file_submissions;
pub mod grading;
pub mod health;
pub mod platform;
pub mod rbac;
pub mod search;
pub mod sse;
pub mod submissions;
pub mod uploads;
pub mod usergroups;
pub mod users;
