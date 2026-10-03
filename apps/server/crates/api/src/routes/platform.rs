use ab_db::versions::Versioned;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;

use ab_domain::catalog::platform::PlatformChanges;

use crate::dto::platform::{Platform, UpdatePlatformRequest};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, MaybeActor, ValidJson, require_if_match, with_etag};
use crate::state::AppState;

/// The platform singleton. Intentionally public: the frontend bootstraps
/// navigation, auth pages, and landing content from it before any session
/// exists.
#[utoipa::path(
    get,
    path = "/platform",
    tag = "platform",
    responses((status = 200, description = "Platform settings", body = Platform,
               headers(("ETag" = String, description = "Quoted `version`")))),
)]
pub async fn get_platform(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
) -> ApiResult<Response> {
    let platform = Platform::for_actor(state.platform.get().await?, &actor);
    Ok(with_etag(StatusCode::OK, platform.version, platform))
}

/// Update platform settings (requires `platform:update:platform` - admins).
/// Branding changes claim finalized `platform-logo` / `platform-thumbnail`
/// uploads; the replaced object is released for reaping.
#[utoipa::path(
    patch,
    path = "/platform",
    tag = "platform",
    params(("If-Match" = Option<i32>, Header, description = "Current `version`; stale → 412")),
    request_body = UpdatePlatformRequest,
    responses(
        (status = 200, description = "Updated", body = Platform,
         headers(("ETag" = String, description = "Quoted new version"))),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_platform(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::catalog::PlatformService::require_update(&actor)?;
    let request = ValidJson::<UpdatePlatformRequest>::parse(&body)?;
    require_if_match(&state.pool, Versioned::Platform, &headers).await?;
    let platform = state
        .platform
        .update(
            &actor,
            PlatformChanges {
                name: request.name.as_deref(),
                description: request.description.as_deref(),
                about: request.about.as_deref(),
                email: request.email.as_deref(),
                label: request.label.as_ref().map(Option::as_deref),
            },
            request.logo_upload_id,
            request.thumbnail_upload_id,
        )
        .await?;
    let platform = Platform::for_actor(platform, &actor);
    Ok(with_etag(StatusCode::OK, platform.version, platform))
}
