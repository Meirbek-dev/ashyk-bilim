use ab_core::id::UserId;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;

use crate::dto::rbac::{AssignRoleRequest, Role};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, ValidJson};
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
    Ok(Json(roles.into_iter().map(Into::into).collect()))
}

/// Assign a role to a user (requires `role:manage:platform`). Live sessions
/// of the user pick the new grants up immediately.
#[utoipa::path(
    post,
    path = "/users/{user_id}/roles",
    tag = "rbac",
    params(("user_id" = UserId, Path, description = "Target user")),
    request_body = AssignRoleRequest,
    responses(
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
    ValidJson(request): ValidJson<AssignRoleRequest>,
) -> ApiResult<StatusCode> {
    state
        .rbac
        .assign_role(&actor, user_id, &request.role)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Remove a role from a user (requires `role:manage:platform`).
#[utoipa::path(
    delete,
    path = "/users/{user_id}/roles/{slug}",
    tag = "rbac",
    params(
        ("user_id" = UserId, Path, description = "Target user"),
        ("slug" = String, Path, description = "Role slug"),
    ),
    responses(
        (status = 204, description = "Removed"),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown user or role", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn unassign_role(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((user_id, slug)): Path<(UserId, String)>,
) -> ApiResult<StatusCode> {
    state.rbac.unassign_role(&actor, user_id, &slug).await?;
    Ok(StatusCode::NO_CONTENT)
}
