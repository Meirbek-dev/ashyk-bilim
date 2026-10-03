use ab_core::id::{CourseId, UsergroupId};
use ab_db::versions::Versioned;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::detach::detached;
use crate::dto::usergroups::{
    CreateUsergroupRequest, UpdateUsergroupRequest, Usergroup, UsergroupCoursesRequest,
    UsergroupListQuery, UsergroupMember, UsergroupMembersRequest, UsergroupPage,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{
    CurrentActor, Path, Query, ValidJson, idempotent, require_if_match, wants_representation,
    with_etag,
};
use crate::state::AppState;

/// Create a usergroup (requires `usergroup:create:platform`).
#[utoipa::path(
    post, path = "/usergroups", tag = "usergroups",
    params(("Idempotency-Key" = Option<String>, Header, description = "Retry-safe replay key")),
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
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::identity::UsergroupsService::require_writer(&actor)?;
    let request = ValidJson::<CreateUsergroupRequest>::parse(&body)?;
    idempotent(
        state.pool.clone(),
        actor.user_id,
        "usergroup",
        &headers,
        &body,
        move || async move {
            let group = state
                .usergroups
                .create(
                    &actor,
                    &request.name,
                    request.description.as_deref().unwrap_or(""),
                )
                .await?;
            Ok((StatusCode::CREATED, Usergroup::for_actor(group, &actor)))
        },
    )
    .await
}

/// The group after a membership write, when asked for
/// (`Prefer: return=representation`); 204 otherwise.
async fn group_or_no_content(
    state: &AppState,
    actor: &ab_domain::identity::Actor,
    id: UsergroupId,
    representation: bool,
) -> ApiResult<Response> {
    if !representation {
        return Ok(StatusCode::NO_CONTENT.into_response());
    }
    let group = Usergroup::for_actor(state.usergroups.get(actor, id).await?, actor);
    Ok(with_etag(StatusCode::OK, group.version, group))
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
        items: groups
            .into_iter()
            .map(|g| Usergroup::for_actor(g, &actor))
            .collect(),
        next_cursor,
    }))
}

/// One usergroup.
#[utoipa::path(
    get, path = "/usergroups/{usergroup_id}", tag = "usergroups",
    params(("usergroup_id" = UsergroupId, Path, description = "Usergroup id")),
    responses(
        (status = 200, description = "Usergroup", body = Usergroup,
         headers(("ETag" = String, description = "Quoted `version`"))),
        (status = 404, description = "Unknown", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_usergroup(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
) -> ApiResult<Response> {
    let group = Usergroup::for_actor(state.usergroups.get(&actor, id).await?, &actor);
    Ok(with_etag(StatusCode::OK, group.version, group))
}

/// Rename/redescribe (creator or `usergroup:manage:platform`).
#[utoipa::path(
    patch, path = "/usergroups/{usergroup_id}", tag = "usergroups",
    params(
        ("usergroup_id" = UsergroupId, Path, description = "Usergroup id"),
        ("If-Match" = Option<i32>, Header, description = "Current `version`; stale → 412"),
    ),
    request_body = UpdateUsergroupRequest,
    responses(
        (status = 200, description = "Updated", body = Usergroup,
         headers(("ETag" = String, description = "Quoted new version"))),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_usergroup(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::identity::UsergroupsService::require_writer(&actor)?;
    let request = ValidJson::<UpdateUsergroupRequest>::parse(&body)?;
    require_if_match(&state.pool, Versioned::Usergroup(id), &headers).await?;
    let group = state
        .usergroups
        .update(
            &actor,
            id,
            request.name.as_deref(),
            request.description.as_deref(),
        )
        .await?;
    let group = Usergroup::for_actor(group, &actor);
    Ok(with_etag(StatusCode::OK, group.version, group))
}

/// Delete a usergroup (membership/course links cascade).
#[utoipa::path(
    delete, path = "/usergroups/{usergroup_id}", tag = "usergroups",
    params(("usergroup_id" = UsergroupId, Path, description = "Usergroup id")),
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
    // BUG-318/322: the course re-aggregation after the delete must outlive
    // the socket.
    detached(async move { Ok(state.usergroups.delete(&actor, id).await?) }).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Member profiles.
#[utoipa::path(
    get, path = "/usergroups/{usergroup_id}/members", tag = "usergroups",
    params(("usergroup_id" = UsergroupId, Path, description = "Usergroup id")),
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

/// Members as keyset pages (S-05; `GET .../members` stays the full list).
#[utoipa::path(
    get, path = "/usergroups/{usergroup_id}/members/page", tag = "usergroups",
    params(("usergroup_id" = UsergroupId, Path, description = "Usergroup id"), crate::dto::KeysetQuery),
    responses((status = 200, description = "Page of members", body = crate::dto::usergroups::UsergroupMemberPage)),
)]
pub async fn list_usergroup_members_page(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
    Query(query): Query<crate::dto::KeysetQuery>,
) -> ApiResult<Json<crate::dto::usergroups::UsergroupMemberPage>> {
    let members: Vec<UsergroupMember> = state
        .usergroups
        .members(&actor, id)
        .await?
        .into_iter()
        .map(Into::into)
        .collect();
    let (items, next_cursor) = query.page(members, |m| m.id.to_string())?;
    Ok(Json(crate::dto::usergroups::UsergroupMemberPage {
        items,
        next_cursor,
    }))
}

/// Batch-add members (duplicates ignored; unknown users 404 via FK).
#[utoipa::path(
    post, path = "/usergroups/{usergroup_id}/members", tag = "usergroups",
    params(
        ("usergroup_id" = UsergroupId, Path, description = "Usergroup id"),
        ("Prefer" = Option<String>, Header, description = "`return=representation`: answer 200 with the updated resource instead of 204"),
    ),
    request_body = UsergroupMembersRequest,
    responses(
        (status = 200, description = "Added (`Prefer: return=representation`): the group", body = Usergroup),
        (status = 204, description = "Added"),
    ),
)]
pub async fn add_usergroup_members(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::identity::UsergroupsService::require_writer(&actor)?;
    let request = ValidJson::<UsergroupMembersRequest>::parse(&body)?;
    let representation = wants_representation(&headers);
    detached(async move {
        state
            .usergroups
            .add_members(&actor, id, &request.user_ids)
            .await?;
        group_or_no_content(&state, &actor, id, representation).await
    })
    .await
}

/// Batch-remove members.
#[utoipa::path(
    delete, path = "/usergroups/{usergroup_id}/members", tag = "usergroups",
    params(
        ("usergroup_id" = UsergroupId, Path, description = "Usergroup id"),
        ("Prefer" = Option<String>, Header, description = "`return=representation`: answer 200 with the updated resource instead of 204"),
    ),
    request_body = UsergroupMembersRequest,
    responses(
        (status = 200, description = "Removed (`Prefer: return=representation`): the group", body = Usergroup),
        (status = 204, description = "Removed"),
    ),
)]
pub async fn remove_usergroup_members(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::identity::UsergroupsService::require_writer(&actor)?;
    let request = ValidJson::<UsergroupMembersRequest>::parse(&body)?;
    let representation = wants_representation(&headers);
    detached(async move {
        state
            .usergroups
            .remove_members(&actor, id, &request.user_ids)
            .await?;
        group_or_no_content(&state, &actor, id, representation).await
    })
    .await
}

/// Linked course ids.
#[utoipa::path(
    get, path = "/usergroups/{usergroup_id}/courses", tag = "usergroups",
    params(("usergroup_id" = UsergroupId, Path, description = "Usergroup id")),
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
    post, path = "/usergroups/{usergroup_id}/courses", tag = "usergroups",
    params(("usergroup_id" = UsergroupId, Path, description = "Usergroup id")),
    request_body = UsergroupCoursesRequest,
    responses((status = 204, description = "Linked")),
)]
pub async fn add_usergroup_courses(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
    body: axum::body::Bytes,
) -> ApiResult<StatusCode> {
    // UX-311: permission before the body.
    ab_domain::identity::UsergroupsService::require_writer(&actor)?;
    let request = ValidJson::<UsergroupCoursesRequest>::parse(&body)?;
    state
        .usergroups
        .add_courses(&actor, id, &request.course_ids)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Unlink courses from the group.
#[utoipa::path(
    delete, path = "/usergroups/{usergroup_id}/courses", tag = "usergroups",
    params(("usergroup_id" = UsergroupId, Path, description = "Usergroup id")),
    request_body = UsergroupCoursesRequest,
    responses((status = 204, description = "Unlinked")),
)]
pub async fn remove_usergroup_courses(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<UsergroupId>,
    body: axum::body::Bytes,
) -> ApiResult<StatusCode> {
    // UX-311: permission before the body.
    ab_domain::identity::UsergroupsService::require_writer(&actor)?;
    let request = ValidJson::<UsergroupCoursesRequest>::parse(&body)?;
    state
        .usergroups
        .remove_courses(&actor, id, &request.course_ids)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Groups linked to a course (course-settings view).
#[utoipa::path(
    get, path = "/courses/{course_id}/usergroups", tag = "usergroups",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses((status = 200, description = "Groups", body = [Usergroup])),
)]
pub async fn usergroups_for_course(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<Vec<Usergroup>>> {
    let groups = state.usergroups.for_course(&actor, id).await?;
    Ok(Json(
        groups
            .into_iter()
            .map(|g| Usergroup::for_actor(g, &actor))
            .collect(),
    ))
}
