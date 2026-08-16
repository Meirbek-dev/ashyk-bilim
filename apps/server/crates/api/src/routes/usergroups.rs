use ab_core::id::{CourseId, UsergroupId};
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;

use crate::dto::usergroups::{
    CreateUsergroupRequest, UpdateUsergroupRequest, Usergroup, UsergroupCoursesRequest,
    UsergroupListQuery, UsergroupMember, UsergroupMembersRequest, UsergroupPage,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, ValidJson};
use crate::state::AppState;

/// Create a usergroup (requires `usergroup:create:platform`).
#[utoipa::path(
    post, path = "/usergroups", tag = "usergroups",
    request_body = CreateUsergroupRequest,
    responses(
        (status = 201, description = "Created", body = Usergroup),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_usergroup(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ValidJson(request): ValidJson<CreateUsergroupRequest>,
) -> ApiResult<(StatusCode, Json<Usergroup>)> {
    let group = state
        .usergroups
        .create(
            &actor,
            &request.name,
            request.description.as_deref().unwrap_or(""),
        )
        .await?;
    Ok((StatusCode::CREATED, Json(group.into())))
}

/// Newest-first listing (requires `usergroup:read:platform`).
#[utoipa::path(
    get, path = "/usergroups", tag = "usergroups",
    params(
        ("cursor" = Option<UsergroupId>, Query, description = "next_cursor from the previous page"),
        ("limit" = Option<i64>, Query, description = "Page size, 1..=100 (default 20)"),
    ),
    responses((status = 200, description = "Page of usergroups", body = UsergroupPage)),
)]
pub async fn list_usergroups(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<UsergroupListQuery>,
) -> ApiResult<Json<UsergroupPage>> {
    let (groups, next_cursor) = state
        .usergroups
        .list(&actor, query.cursor, query.limit.unwrap_or(20))
        .await?;
    Ok(Json(UsergroupPage {
        items: groups.into_iter().map(Into::into).collect(),
        next_cursor,
    }))
}

/// One usergroup.
#[utoipa::path(
    get, path = "/usergroups/{id}", tag = "usergroups",
    params(("id" = UsergroupId, Path, description = "Usergroup id")),
    responses(
        (status = 200, description = "Usergroup", body = Usergroup),
        (status = 404, description = "Unknown", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_usergroup(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
) -> ApiResult<Json<Usergroup>> {
    Ok(Json(state.usergroups.get(&actor, id).await?.into()))
}

/// Rename/redescribe (creator or `usergroup:manage:platform`).
#[utoipa::path(
    patch, path = "/usergroups/{id}", tag = "usergroups",
    params(("id" = UsergroupId, Path, description = "Usergroup id")),
    request_body = UpdateUsergroupRequest,
    responses(
        (status = 200, description = "Updated", body = Usergroup),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_usergroup(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
    ValidJson(request): ValidJson<UpdateUsergroupRequest>,
) -> ApiResult<Json<Usergroup>> {
    let group = state
        .usergroups
        .update(
            &actor,
            id,
            request.name.as_deref(),
            request.description.as_deref(),
        )
        .await?;
    Ok(Json(group.into()))
}

/// Delete a usergroup (membership/course links cascade).
#[utoipa::path(
    delete, path = "/usergroups/{id}", tag = "usergroups",
    params(("id" = UsergroupId, Path, description = "Usergroup id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_usergroup(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
) -> ApiResult<StatusCode> {
    state.usergroups.delete(&actor, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Member profiles.
#[utoipa::path(
    get, path = "/usergroups/{id}/members", tag = "usergroups",
    params(("id" = UsergroupId, Path, description = "Usergroup id")),
    responses((status = 200, description = "Members", body = [UsergroupMember])),
)]
pub async fn list_usergroup_members(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
) -> ApiResult<Json<Vec<UsergroupMember>>> {
    let members = state.usergroups.members(&actor, id).await?;
    Ok(Json(members.into_iter().map(Into::into).collect()))
}

/// Batch-add members (duplicates ignored; unknown users 404 via FK).
#[utoipa::path(
    post, path = "/usergroups/{id}/members", tag = "usergroups",
    params(("id" = UsergroupId, Path, description = "Usergroup id")),
    request_body = UsergroupMembersRequest,
    responses((status = 204, description = "Added")),
)]
pub async fn add_usergroup_members(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
    ValidJson(request): ValidJson<UsergroupMembersRequest>,
) -> ApiResult<StatusCode> {
    state
        .usergroups
        .add_members(&actor, id, &request.user_ids)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Batch-remove members.
#[utoipa::path(
    delete, path = "/usergroups/{id}/members", tag = "usergroups",
    params(("id" = UsergroupId, Path, description = "Usergroup id")),
    request_body = UsergroupMembersRequest,
    responses((status = 204, description = "Removed")),
)]
pub async fn remove_usergroup_members(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
    ValidJson(request): ValidJson<UsergroupMembersRequest>,
) -> ApiResult<StatusCode> {
    state
        .usergroups
        .remove_members(&actor, id, &request.user_ids)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Linked course ids.
#[utoipa::path(
    get, path = "/usergroups/{id}/courses", tag = "usergroups",
    params(("id" = UsergroupId, Path, description = "Usergroup id")),
    responses((status = 200, description = "Linked course ids", body = [CourseId])),
)]
pub async fn list_usergroup_courses(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
) -> ApiResult<Json<Vec<CourseId>>> {
    Ok(Json(state.usergroups.linked_course_ids(&actor, id).await?))
}

/// Link courses to the group.
#[utoipa::path(
    post, path = "/usergroups/{id}/courses", tag = "usergroups",
    params(("id" = UsergroupId, Path, description = "Usergroup id")),
    request_body = UsergroupCoursesRequest,
    responses((status = 204, description = "Linked")),
)]
pub async fn add_usergroup_courses(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
    ValidJson(request): ValidJson<UsergroupCoursesRequest>,
) -> ApiResult<StatusCode> {
    state
        .usergroups
        .add_courses(&actor, id, &request.course_ids)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Unlink courses from the group.
#[utoipa::path(
    delete, path = "/usergroups/{id}/courses", tag = "usergroups",
    params(("id" = UsergroupId, Path, description = "Usergroup id")),
    request_body = UsergroupCoursesRequest,
    responses((status = 204, description = "Unlinked")),
)]
pub async fn remove_usergroup_courses(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
    ValidJson(request): ValidJson<UsergroupCoursesRequest>,
) -> ApiResult<StatusCode> {
    state
        .usergroups
        .remove_courses(&actor, id, &request.course_ids)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Groups linked to a course (course-settings view).
#[utoipa::path(
    get, path = "/courses/{id}/usergroups", tag = "usergroups",
    params(("id" = CourseId, Path, description = "Course id")),
    responses((status = 200, description = "Groups", body = [Usergroup])),
)]
pub async fn usergroups_for_course(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<Vec<Usergroup>>> {
    let groups = state.usergroups.for_course(&actor, id).await?;
    Ok(Json(groups.into_iter().map(Into::into).collect()))
}
