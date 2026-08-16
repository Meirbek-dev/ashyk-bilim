//! Route handlers, one module per API tag. Every handler carries a
//! `#[utoipa::path]` annotation and is mounted via `routes!` in `app.rs`.

pub mod auth;
pub mod health;
