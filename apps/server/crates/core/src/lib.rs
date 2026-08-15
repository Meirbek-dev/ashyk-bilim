//! `ab-core` — foundation types shared by every other crate.
//!
//! Contains: the [`Error`]/[`ErrorCode`] model, typed configuration, typed ids,
//! time abstractions, the RBAC permission model, and telemetry initialization.
//! This crate is framework-free: no axum, no HTTP types.

pub mod config;
pub mod error;
pub mod id;
pub mod permission;
pub mod telemetry;
pub mod time;

pub use error::{Error, ErrorCode, FieldError, Result};
