//! `ab-api` — the HTTP layer: state, extractors, middleware, routes, OpenAPI.
//!
//! Handlers are thin: extract → call `ab-domain` → map to a response DTO.
//! Every route is registered through `utoipa_axum::routes!` so the OpenAPI
//! document and the router cannot drift (ARCHITECTURE §6). Response DTOs live
//! in [`dto`]; database row types never derive `Serialize`.

pub mod app;
pub mod dto;
pub mod error;
pub mod routes;
pub mod state;

pub use app::{build_router, openapi_doc};
pub use error::{ApiError, ApiResult};
pub use state::AppState;
