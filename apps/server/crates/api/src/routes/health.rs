use axum::Json;
use axum::extract::State;

use crate::dto::health::Health;
use crate::error::{ApiResult, Problem};
use crate::state::AppState;

/// Liveness: the process is up.
#[utoipa::path(
    get,
    path = "/health",
    tag = "health",
    responses((status = 200, description = "Process is alive", body = Health))
)]
pub async fn live() -> Json<Health> {
    Json(Health::ok())
}

/// Readiness: dependencies are reachable (Postgres; Redis/RustFS/Zitadel probes
/// join as their clients land).
#[utoipa::path(
    get,
    path = "/health/ready",
    tag = "health",
    responses(
        (status = 200, description = "Ready to serve traffic", body = Health),
        (status = 500, description = "A dependency is unreachable", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn ready(State(state): State<AppState>) -> ApiResult<Json<Health>> {
    ab_db::ping(&state.pool).await?;
    Ok(Json(Health::ok()))
}
