use ab_domain::identity::users::ProfileChanges;
use axum::Json;
use axum::extract::State;

use crate::dto::users::{UpdateProfileRequest, UserProfile};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, ValidJson};
use crate::state::AppState;

/// The caller's own profile.
#[utoipa::path(
    get,
    path = "/users/me",
    tag = "users",
    responses(
        (status = 200, description = "Own profile", body = UserProfile),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn my_profile(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<UserProfile>> {
    let profile = state.users.my_profile(&actor).await?;
    Ok(Json(profile.into()))
}

/// Update the caller's own profile (requires `user:update:own`).
#[utoipa::path(
    patch,
    path = "/users/me",
    tag = "users",
    request_body = UpdateProfileRequest,
    responses(
        (status = 200, description = "Updated profile", body = UserProfile),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Validation failed", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_my_profile(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ValidJson(request): ValidJson<UpdateProfileRequest>,
) -> ApiResult<Json<UserProfile>> {
    let profile = state
        .users
        .update_my_profile(
            &actor,
            ProfileChanges {
                display_name: request.display_name,
                bio: request.bio,
                locale: request.locale,
            },
        )
        .await?;
    Ok(Json(profile.into()))
}
