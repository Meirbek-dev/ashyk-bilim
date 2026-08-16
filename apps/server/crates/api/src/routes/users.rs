use ab_core::id::UserId;
use ab_domain::identity::users::ProfileChanges;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;

use crate::dto::users::{
    AdminUserListQuery, AdminUserPage, SetUserStatusRequest, UpdateProfileRequest, UserProfile,
};
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
                avatar_upload_id: request.avatar_upload_id,
            },
        )
        .await?;
    Ok(Json(profile.into()))
}

/// Admin listing of all users with roles (requires `platform:read:platform`).
#[utoipa::path(
    get,
    path = "/users",
    tag = "users",
    params(
        ("q" = Option<String>, Query, description = "Substring filter (username/name/email)"),
        ("cursor" = Option<UserId>, Query, description = "next_cursor from the previous page"),
        ("limit" = Option<i64>, Query, description = "Page size, 1..=100 (default 20)"),
    ),
    responses(
        (status = 200, description = "Page of users", body = AdminUserPage),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_users(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AdminUserListQuery>,
) -> ApiResult<Json<AdminUserPage>> {
    let (users, next_cursor) = state
        .rbac
        .list_users(
            &actor,
            query.q.as_deref(),
            query.cursor,
            query.limit.unwrap_or(20),
        )
        .await?;
    Ok(Json(AdminUserPage {
        items: users.into_iter().map(Into::into).collect(),
        next_cursor,
    }))
}

/// Disable (revokes every live session) or re-enable an account
/// (requires `platform:manage:platform`; self-disable is refused).
#[utoipa::path(
    patch,
    path = "/users/{user_id}/status",
    tag = "users",
    params(("user_id" = UserId, Path, description = "Target user")),
    request_body = SetUserStatusRequest,
    responses(
        (status = 204, description = "Status changed"),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Self-disable refused", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn set_user_status(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(user_id): Path<UserId>,
    ValidJson(request): ValidJson<SetUserStatusRequest>,
) -> ApiResult<StatusCode> {
    state
        .rbac
        .set_user_status(&actor, user_id, request.disabled)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
