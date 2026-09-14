use ab_core::id::{CourseId, UserId};
use ab_domain::identity::NewAccount;
use ab_domain::identity::users::ProfileChanges;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use secrecy::SecretString;

use crate::dto::courses::CoursePage;
use crate::dto::search::UserHit;
use crate::dto::users::{
    AdminUser, AdminUserListQuery, AdminUserPage, CreateUserRequest, SetUserStatusRequest,
    UpdateProfileRequest, UserCoursesQuery, UserProfile,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{ClientIp, CurrentActor, MaybeActor, Path, Query, ValidJson};
use crate::routes::auth::user_agent;
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
    Ok(Json(UserProfile::from_profile(profile, actor.mfa_enabled)))
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
    Ok(Json(UserProfile::from_profile(profile, actor.mfa_enabled)))
}

/// Admin account creation (requires `platform:manage:platform`): Zitadel
/// human with a verified email + `users` row with `user` plus `roles`.
/// Without `password` the account signs in with Google only.
#[utoipa::path(
    post,
    path = "/users",
    tag = "users",
    request_body = CreateUserRequest,
    responses(
        (status = 201, description = "Created", body = AdminUser),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "`username-taken` / `email-taken`", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Validation failed (unknown role, weak password)",
         body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn create_user(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    headers: HeaderMap,
    ClientIp(ip): ClientIp,
    ValidJson(request): ValidJson<CreateUserRequest>,
) -> ApiResult<(StatusCode, Json<AdminUser>)> {
    let user = state
        .identity
        .admin_create_user(
            &actor,
            NewAccount {
                username: request.username,
                email: request.email,
                password: request.password.map(SecretString::from),
                first_name: request.first_name,
                last_name: request.last_name,
                ip,
                user_agent: user_agent(&headers),
            },
            request.roles.as_deref().unwrap_or_default(),
        )
        .await?;
    Ok((StatusCode::CREATED, Json(user.into())))
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
        (status = 409, description = "`self-disable` / `last-admin`", body = Problem,
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

/// Public profile card by username (legacy `GET /users/username/{username}`).
///
/// Id, username, display name and avatar — readable anonymously, active
/// users only. The profile page resolves its subject here instead of
/// scanning `/search`.
#[utoipa::path(
    get,
    path = "/users/{username}",
    tag = "users",
    params(("username" = String, Path, description = "Username (case-insensitive)")),
    responses(
        (status = 200, description = "Public profile", body = UserHit),
        (status = 404, description = "Unknown user", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn public_profile(
    State(state): State<AppState>,
    MaybeActor(_actor): MaybeActor,
    Path(username): Path<String>,
) -> ApiResult<Json<UserHit>> {
    let user = ab_db::search::find_user_hit_by_username(&state.pool, &username)
        .await?
        .ok_or_else(|| ab_core::Error::not_found("user"))?;
    Ok(Json(user.into()))
}

/// Courses a user created or actively co-authors, newest first (public
/// profile, readable anonymously). Private ones are included only for the
/// user themself and platform course managers.
#[utoipa::path(
    get,
    path = "/users/{username}/courses",
    tag = "users",
    params(
        ("username" = String, Path, description = "Username (case-insensitive)"),
        ("cursor" = Option<CourseId>, Query, description = "next_cursor from the previous page"),
        ("limit" = Option<i64>, Query, description = "Page size, 1..=100 (default 20)"),
    ),
    responses(
        (status = 200, description = "Page of courses", body = CoursePage),
        (status = 404, description = "Unknown user", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn user_courses(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Path(username): Path<String>,
    Query(query): Query<UserCoursesQuery>,
) -> ApiResult<Json<CoursePage>> {
    let user = ab_db::identity::find_user_id_by_username(&state.pool, &username)
        .await?
        .ok_or_else(|| ab_core::Error::not_found("user"))?;
    let (courses, next_cursor) = state
        .courses
        .list_by_user(&actor, user, query.cursor, query.limit.unwrap_or(20))
        .await?;
    Ok(Json(CoursePage {
        items: courses.into_iter().map(Into::into).collect(),
        next_cursor,
        summary: None,
    }))
}
