use axum::Json;
use axum::extract::State;

use ab_domain::catalog::platform::PlatformChanges;

use crate::dto::platform::{Platform, UpdatePlatformRequest};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, ValidJson};
use crate::state::AppState;

/// The platform singleton. Intentionally public: the frontend bootstraps
/// navigation, auth pages, and landing content from it before any session
/// exists.
#[utoipa::path(
    get,
    path = "/platform",
    tag = "platform",
    responses((status = 200, description = "Platform settings", body = Platform)),
)]
pub async fn get_platform(State(state): State<AppState>) -> ApiResult<Json<Platform>> {
    Ok(Json(state.platform.get().await?.into()))
}

/// Update platform settings (requires `platform:update:platform` — admins).
/// Branding changes claim finalized `platform-logo` / `platform-thumbnail`
/// uploads; the replaced object is released for reaping.
#[utoipa::path(
    patch,
    path = "/platform",
    tag = "platform",
    request_body = UpdatePlatformRequest,
    responses(
        (status = 200, description = "Updated", body = Platform),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_platform(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ValidJson(request): ValidJson<UpdatePlatformRequest>,
) -> ApiResult<Json<Platform>> {
    let platform = state
        .platform
        .update(
            &actor,
            PlatformChanges {
                name: request.name.as_deref(),
                description: request.description.as_deref(),
                about: request.about.as_deref(),
                email: request.email.as_deref(),
                label: request.label.as_deref(),
            },
            request.logo_upload_id,
            request.thumbnail_upload_id,
        )
        .await?;
    Ok(Json(platform.into()))
}
