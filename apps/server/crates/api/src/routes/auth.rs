use axum::Json;

use crate::dto::auth::SessionInfo;
use crate::error::Problem;
use crate::extract::CurrentActor;

/// The caller's current session (also the cheapest "am I logged in?" probe).
#[utoipa::path(
    get,
    path = "/auth/session",
    tag = "auth",
    responses(
        (status = 200, description = "Current session", body = SessionInfo),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn current_session(CurrentActor(actor): CurrentActor) -> Json<SessionInfo> {
    Json(SessionInfo {
        user_id: actor.user_id,
        roles: actor.roles,
        permissions: actor.permission_strings,
    })
}
