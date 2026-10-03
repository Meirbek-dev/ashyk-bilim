use ab_core::id::UserId;
use ab_db::versions::Versioned;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::detach::detached;
use crate::dto::rbac::{
    AssignRoleRequest, CreateRoleRequest, Role, SetRolePermissionsRequest, UpdateRoleRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{
    CurrentActor, Path, ValidJson, idempotent, require_if_match, wants_representation,
};
use crate::routes::users::user_or_no_content;
use crate::state::AppState;

/// All roles with their grants (requires `role:read:platform`).
#[utoipa::path(
    get,
    path = "/rbac/roles",
    tag = "rbac",
    responses(
        (status = 200, description = "Roles", body = [Role]),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_roles(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<Vec<Role>>> {
    let roles = state.rbac.list_roles(&actor).await?;
    Ok(Json(
        roles
            .into_iter()
            .map(|r| Role::for_actor(r, &actor))
            .collect(),
    ))
}

/// One role with its grants (requires `role:read:platform`).
#[utoipa::path(
    get,
    path = "/rbac/roles/{slug}",
    tag = "rbac",
    params(("slug" = String, Path, description = "Role slug")),
    responses(
        (status = 200, description = "Role", body = Role,
         headers(("ETag" = String, description = "Quoted `version`"))),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown role", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_role(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(slug): Path<String>,
) -> ApiResult<Response> {
    let role = Role::for_actor(state.rbac.get_role(&actor, &slug).await?, &actor);
    Ok(crate::extract::with_etag(
        StatusCode::OK,
        role.version,
        role,
    ))
}

/// The role after a write, when asked for (`Prefer: return=representation`).
async fn role_or_no_content(
    state: &AppState,
    actor: &ab_domain::identity::Actor,
    slug: &str,
    representation: bool,
) -> ApiResult<Response> {
    if !representation {
        return Ok(StatusCode::NO_CONTENT.into_response());
    }
    let role = Role::for_actor(state.rbac.get_role(actor, slug).await?, actor);
    Ok(crate::extract::with_etag(
        StatusCode::OK,
        role.version,
        role,
    ))
}

/// Assign a role to a user (requires `role:manage:platform`). Live sessions
/// of the user pick the new grants up immediately.
#[utoipa::path(
    post,
    path = "/users/{user_id}/roles",
    tag = "rbac",
    params(
        ("user_id" = UserId, Path, description = "Target user"),
        ("Prefer" = Option<String>, Header, description = "`return=representation`: answer 200 with the updated resource instead of 204"),
    ),
    request_body = AssignRoleRequest,
    responses(
        (status = 200, description = "Assigned (`Prefer: return=representation`)", body = crate::dto::users::AdminUser),
        (status = 204, description = "Assigned"),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown user or role", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn assign_role(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(user_id): Path<UserId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::identity::RbacAdminService::require_manage_roles(&actor)?;
    let request = ValidJson::<AssignRoleRequest>::parse(&body)?;
    let representation = wants_representation(&headers);
    // Grant → propagate → audit outlive the connection (BUG-214).
    detached(async move {
        state
            .rbac
            .assign_role(&actor, user_id, &request.role)
            .await?;
        user_or_no_content(&state, &actor, user_id, representation).await
    })
    .await
}

/// Remove a role from a user (requires `role:manage:platform`).
#[utoipa::path(
    delete,
    path = "/users/{user_id}/roles/{slug}",
    tag = "rbac",
    params(
        ("user_id" = UserId, Path, description = "Target user"),
        ("slug" = String, Path, description = "Role slug"),
        ("Prefer" = Option<String>, Header, description = "`return=representation`: answer 200 with the updated resource instead of 204"),
    ),
    responses(
        (status = 200, description = "Removed (`Prefer: return=representation`)", body = crate::dto::users::AdminUser),
        (status = 204, description = "Removed"),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown user or role", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "`last-admin`", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn unassign_role(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((user_id, slug)): Path<(UserId, String)>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let representation = wants_representation(&headers);
    detached(async move {
        state.rbac.unassign_role(&actor, user_id, &slug).await?;
        user_or_no_content(&state, &actor, user_id, representation).await
    })
    .await
}

/// Create a custom role (requires `role:manage:platform`).
#[utoipa::path(
    post,
    path = "/rbac/roles",
    tag = "rbac",
    params(
        ("Idempotency-Key" = Option<String>, Header, description = "Retry-safe replay key"),
        ("Prefer" = Option<String>, Header, description = "`return=representation`: answer 201 with the role instead of 204"),
    ),
    request_body = CreateRoleRequest,
    responses(
        (status = 201, description = "Created (`Prefer: return=representation`)", body = Role),
        (status = 204, description = "Created"),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "`role-slug-taken`", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_role(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::identity::RbacAdminService::require_manage_roles(&actor)?;
    let request = ValidJson::<CreateRoleRequest>::parse(&body)?;
    let representation = wants_representation(&headers);
    // `idempotent` runs the action on its own task (BUG-313 sweep: work
    // after the first commit outlives a hang-up).
    idempotent(
        state.pool.clone(),
        actor.user_id,
        "role",
        &headers,
        &body,
        move || async move {
            state
                .rbac
                .create_role(
                    &actor,
                    &request.slug,
                    &request.display_name,
                    request.description.as_deref(),
                    request.priority,
                )
                .await?;
            if !representation {
                return Ok((StatusCode::NO_CONTENT, None));
            }
            let role = state.rbac.get_role(&actor, &request.slug).await?;
            Ok((StatusCode::CREATED, Some(Role::for_actor(role, &actor))))
        },
    )
    .await
}

/// Update a custom role's metadata (system roles are seed-managed).
#[utoipa::path(
    patch,
    path = "/rbac/roles/{slug}",
    tag = "rbac",
    params(
        ("slug" = String, Path, description = "Role slug"),
        ("If-Match" = Option<i32>, Header, description = "Current `version`; stale → 412"),
        ("Prefer" = Option<String>, Header, description = "`return=representation`: answer 200 with the updated resource instead of 204"),
    ),
    request_body = UpdateRoleRequest,
    responses(
        (status = 200, description = "Updated (`Prefer: return=representation`)", body = Role),
        (status = 204, description = "Updated"),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown or system role", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_role(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::identity::RbacAdminService::require_manage_roles(&actor)?;
    let request = ValidJson::<UpdateRoleRequest>::parse(&body)?;
    require_if_match(&state.pool, Versioned::Role(&slug), &headers).await?;
    state
        .rbac
        .update_role(
            &actor,
            &slug,
            request.display_name.as_deref(),
            request.description.as_deref(),
            request.priority,
        )
        .await?;
    role_or_no_content(&state, &actor, &slug, wants_representation(&headers)).await
}

/// Delete a custom role; holders' live sessions lose it immediately.
#[utoipa::path(
    delete,
    path = "/rbac/roles/{slug}",
    tag = "rbac",
    params(("slug" = String, Path, description = "Role slug")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, description = "System role", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_role(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(slug): Path<String>,
) -> ApiResult<StatusCode> {
    detached(async move {
        state.rbac.delete_role(&actor, &slug).await?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
}

/// Replace a custom role's grant set; holders' sessions update live.
#[utoipa::path(
    put,
    path = "/rbac/roles/{slug}/permissions",
    tag = "rbac",
    params(
        ("slug" = String, Path, description = "Role slug"),
        ("If-Match" = Option<i32>, Header, description = "Current `version`; stale → 412"),
        ("Prefer" = Option<String>, Header, description = "`return=representation`: answer 200 with the updated resource instead of 204"),
    ),
    request_body = SetRolePermissionsRequest,
    responses(
        (status = 200, description = "Replaced (`Prefer: return=representation`)", body = Role),
        (status = 204, description = "Replaced"),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "System role", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Unparseable grant", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn set_role_permissions(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::identity::RbacAdminService::require_manage_roles(&actor)?;
    let request = ValidJson::<SetRolePermissionsRequest>::parse(&body)?;
    require_if_match(&state.pool, Versioned::Role(&slug), &headers).await?;
    let representation = wants_representation(&headers);
    detached(async move {
        state
            .rbac
            .set_role_permissions(&actor, &slug, request.permissions)
            .await?;
        role_or_no_content(&state, &actor, &slug, representation).await
    })
    .await
}
