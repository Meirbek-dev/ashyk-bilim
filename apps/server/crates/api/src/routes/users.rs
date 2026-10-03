use ab_core::id::{CourseId, UserId};
use ab_domain::identity::NewAccount;
use ab_domain::identity::users::ProfileChanges;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use secrecy::SecretString;

use crate::detach::detached;
use crate::dto::courses::CoursePage;
use crate::dto::users::{
    AdminUser, AdminUserListQuery, AdminUserPage, CreateUserRequest, PublicProfile,
    SetUserStatusRequest, UpdateProfileRequest, UserCoursesQuery, UserProfile,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{
    ClientIp, CurrentActor, MaybeActor, Path, Query, ValidJson, idempotent, wants_representation,
};
use crate::routes::auth::user_agent;
use crate::routes::curriculum::if_match;
use crate::state::AppState;

/// The own profile with an `ETag` carrying `profile_version`, echoed back as
/// `If-Match` by the profile builder (BUG-367).
fn me_with_etag(
    profile: ab_domain::identity::users::Profile,
    actor: &ab_domain::identity::Actor,
) -> Response {
    let etag = HeaderValue::from_str(&format!("\"{}\"", profile.profile_version))
        .unwrap_or_else(|_| HeaderValue::from_static("\"0\""));
    let mut response = Json(UserProfile::for_actor(profile, actor)).into_response();
    response.headers_mut().insert(header::ETAG, etag);
    response
}

/// The caller's own profile.
#[utoipa::path(
    get,
    path = "/users/me",
    tag = "users",
    responses(
        (status = 200, description = "Own profile", body = UserProfile,
         headers(("ETag" = String, description = "Quoted profile document version"))),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn my_profile(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Response> {
    let profile = state.users.my_profile(&actor).await?;
    Ok(me_with_etag(profile, &actor))
}

/// Update the caller's own profile (requires `user:update:own`): names,
/// bio, locale, avatar, the profile builder `profile` document and the UI
/// `theme`.
///
/// With `If-Match: "<version>"` (the `ETag` of the last read) a write from a
/// stale tab is 412 `precondition-failed` with `details {expected, actual}`
/// instead of silently replacing the document (BUG-367). Only a `profile`
/// write moves the version.
#[utoipa::path(
    patch,
    path = "/users/me",
    tag = "users",
    params(
        ("If-Match" = Option<i32>, Header, description = "Profile version from the last read's ETag"),
    ),
    request_body = UpdateProfileRequest,
    responses(
        (status = 200, description = "Updated profile", body = UserProfile,
         headers(("ETag" = String, description = "Quoted new profile version"))),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
        (status = 412, description = "Stale profile version", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Validation failed", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_my_profile(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::identity::UsersService::require_update_own(&actor)?;
    let request = ValidJson::<UpdateProfileRequest>::parse(&body)?;
    let expected_version = if_match(&headers)?;
    // Detached (BUG-313 sweep): work after the first commit outlives a
    // hang-up.
    detached(async move {
        let profile = state
            .users
            .update_my_profile(
                &actor,
                ProfileChanges {
                    display_name: request.display_name,
                    bio: request.bio,
                    locale: request.locale,
                    organization: request.organization,
                    avatar_upload_id: request.avatar_upload_id,
                    profile: request.profile,
                    theme: request.theme,
                    expected_version,
                },
            )
            .await?;
        Ok(me_with_etag(profile, &actor))
    })
    .await
}

/// Admin account creation (requires `platform:manage:platform`): Zitadel
/// human with a verified email + `users` row with `user` plus `roles`.
/// Without `password` the account signs in with Google only.
#[utoipa::path(
    post,
    path = "/users",
    tag = "users",
    params(("Idempotency-Key" = Option<String>, Header, description = "Retry-safe replay key")),
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
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::identity::RbacAdminService::require_manage_platform(&actor)?;
    let request = ValidJson::<CreateUserRequest>::parse(&body)?;
    let agent = user_agent(&headers);
    // Zitadel create → `users` row → roles as one unit (BUG-213); `idempotent`
    // runs it on its own task. Only the body hash is stored, never the password.
    idempotent(
        state.pool.clone(),
        actor.user_id,
        "user",
        &headers,
        &body,
        move || async move {
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
                        organization: String::new(),
                        ip,
                        user_agent: agent,
                        language: None,
                    },
                    request.roles.as_deref().unwrap_or_default(),
                )
                .await?;
            Ok((StatusCode::CREATED, AdminUser::for_actor(user, &actor)))
        },
    )
    .await
}

/// Admin listing of all users with roles (requires `platform:read:platform`).
#[utoipa::path(
    get,
    path = "/users",
    tag = "users",
    params(
        ("q" = Option<String>, Query, description = "Substring filter (username/name/email)"),
        ("sort" = Option<crate::dto::enums::AdminUserSort>, Query, description = "`newest` (default) or `name`"),
        ("status" = Option<crate::dto::enums::UserStatus>, Query, description = "Only accounts in this status"),
        ("role" = Option<String>, Query, description = "Only holders of this role slug"),
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
            ab_db::identity::UserFilter {
                q: query.q.as_deref(),
                status: query.status.as_deref(),
                role: query.role.as_deref(),
                sort: query.sort.as_deref().unwrap_or("newest"),
            },
            query.cursor,
            query.limit.unwrap_or(20),
        )
        .await?;
    Ok(Json(AdminUserPage {
        items: users
            .into_iter()
            .map(|u| AdminUser::for_actor(u, &actor))
            .collect(),
        next_cursor,
    }))
}

/// One account in the admin directory (requires `platform:read:platform`).
#[utoipa::path(
    get,
    path = "/users/by-id/{user_id}/admin",
    tag = "users",
    params(("user_id" = UserId, Path, description = "User id")),
    responses(
        (status = 200, description = "Account", body = AdminUser),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown user", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_admin_user(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(user_id): Path<UserId>,
) -> ApiResult<Json<AdminUser>> {
    let user = state.rbac.get_user(&actor, user_id).await?;
    Ok(Json(AdminUser::for_actor(user, &actor)))
}

/// The account after a write, when the caller asked for it
/// (`Prefer: return=representation`); 204 otherwise.
pub(crate) async fn user_or_no_content(
    state: &AppState,
    actor: &ab_domain::identity::Actor,
    user_id: UserId,
    representation: bool,
) -> ApiResult<Response> {
    if !representation {
        return Ok(StatusCode::NO_CONTENT.into_response());
    }
    let user = state.rbac.get_user(actor, user_id).await?;
    Ok(Json(AdminUser::for_actor(user, actor)).into_response())
}

/// Disable (revokes every live session) or re-enable an account
/// (requires `platform:manage:platform`; self-disable is refused).
#[utoipa::path(
    patch,
    path = "/users/{user_id}/status",
    tag = "users",
    params(
        ("user_id" = UserId, Path, description = "Target user"),
        ("Prefer" = Option<String>, Header, description = "`return=representation`: answer 200 with the updated resource instead of 204"),
    ),
    request_body = SetUserStatusRequest,
    responses(
        (status = 200, description = "Status changed (`Prefer: return=representation`)", body = AdminUser),
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
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::identity::RbacAdminService::require_manage_platform(&actor)?;
    let request = ValidJson::<SetUserStatusRequest>::parse(&body)?;
    let representation = wants_representation(&headers);
    // Commit → revoke_all → audit outlive the connection (BUG-214).
    detached(async move {
        state
            .rbac
            .set_user_status(&actor, user_id, request.disabled)
            .await?;
        user_or_no_content(&state, &actor, user_id, representation).await
    })
    .await
}

/// Public profile card by username (legacy `GET /users/username/{username}`).
///
/// Id, username, display name, bio, avatar and the profile builder sections
/// - readable anonymously, active users only. The profile page resolves its subject here instead of
/// scanning `/search`.
#[utoipa::path(
    get,
    path = "/users/{username}",
    tag = "users",
    params(("username" = String, Path, description = "Username (case-insensitive)")),
    responses(
        (status = 200, description = "Public profile", body = PublicProfile),
        (status = 404, description = "Unknown user", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn public_profile(
    State(state): State<AppState>,
    MaybeActor(_actor): MaybeActor,
    Path(username): Path<String>,
) -> ApiResult<Json<PublicProfile>> {
    let user = ab_db::identity::find_public_profile(&state.pool, &username)
        .await?
        .ok_or_else(|| ab_core::Error::not_found("user"))?;
    Ok(Json(user.into()))
}

/// Public profile card by id - same card as `GET /users/{username}`.
///
/// Editor user blocks store the user id; every reader of the page (learners,
/// anonymous visitors of a public course) resolves the card here.
#[utoipa::path(
    get,
    path = "/users/by-id/{user_id}",
    tag = "users",
    params(("user_id" = UserId, Path, description = "User id")),
    responses(
        (status = 200, description = "Public profile", body = PublicProfile),
        (status = 404, description = "Unknown or inactive user", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn public_profile_by_id(
    State(state): State<AppState>,
    MaybeActor(_actor): MaybeActor,
    Path(user_id): Path<UserId>,
) -> ApiResult<Json<PublicProfile>> {
    let user = ab_db::identity::find_public_profile_by_id(&state.pool, user_id)
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
        items: crate::routes::courses::list_items(&state, &actor, courses).await?,
        next_cursor,
        summary: None,
    }))
}
