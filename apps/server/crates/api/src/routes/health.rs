use ab_core::{Error, ErrorCode};
use axum::Json;
use axum::extract::State;

use crate::dto::health::Health;
use crate::error::{ApiError, ApiResult, Problem};
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

/// Readiness: Postgres and Redis (sessions, rate limits, live events) answer.
/// RustFS and Zitadel are not probed.
#[utoipa::path(
    get,
    path = "/health/ready",
    tag = "health",
    responses(
        (status = 200, description = "Ready to serve traffic", body = Health),
        (status = 503, description = "A dependency is unreachable", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn ready(State(state): State<AppState>) -> ApiResult<Json<Health>> {
    let unreachable = |what: &str| {
        ApiError(Error::app(
            ErrorCode::ServiceUnavailable,
            format!("{what} is unreachable"),
        ))
    };
    if let Err(err) = ab_db::ping(&state.pool).await {
        tracing::warn!(%err, "readiness: postgres unreachable");
        return Err(unreachable("postgres"));
    }
    let pong = tokio::time::timeout(PROBE_TIMEOUT, state.sessions.ping()).await;
    if !matches!(pong, Ok(Ok(()))) {
        tracing::warn!(?pong, "readiness: redis unreachable");
        return Err(unreachable("redis"));
    }
    Ok(Json(Health::ok()))
}

/// A dependency slower than this to answer a probe counts as down.
const PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);
