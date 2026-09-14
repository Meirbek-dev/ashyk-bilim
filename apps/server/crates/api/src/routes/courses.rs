use ab_core::id::{CourseId, CourseUpdateId, UserId};
use ab_domain::catalog::contributors::Target;
use ab_domain::catalog::courses::{CourseChanges, ListParams};
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;

use crate::dto::courses::{
    AddContributorRequest, Contributor, Course, CourseLifecycleRequest, CourseListQuery,
    CoursePage, CourseReadiness, CourseUpdate, CreateCourseRequest, CreateCourseUpdateRequest,
    EditCourseUpdateRequest, UpdateContributorRequest, UpdateCourseRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, MaybeActor, Path, Query, ValidJson};
use crate::state::AppState;

/// Create a course (requires `course:create:platform`).
#[utoipa::path(
    post,
    path = "/courses",
    tag = "courses",
    request_body = CreateCourseRequest,
    responses(
        (status = 201, description = "Created", body = Course),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_course(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ValidJson(request): ValidJson<CreateCourseRequest>,
) -> ApiResult<(StatusCode, Json<Course>)> {
    let course = state
        .courses
        .create(
            &actor,
            &request.name,
            request.description.as_deref().unwrap_or(""),
            request.about.as_deref().unwrap_or(""),
            request.tags.unwrap_or_default(),
        )
        .await?;
    Ok((StatusCode::CREATED, Json(course.into())))
}

/// Course listing.
///
/// Public courses plus the caller's own and co-authored ones (platform
/// updaters/managers see everything). `mine=true` narrows to courses the
/// caller may edit and adds the `summary` block; `q`, `sort` and `preset`
/// filter/sort (see `CourseListQuery`).
#[utoipa::path(
    get,
    path = "/courses",
    tag = "courses",
    params(
        ("cursor" = Option<CourseId>, Query, description = "next_cursor from the previous page"),
        ("limit" = Option<i64>, Query, description = "Page size, 1..=100 (default 20)"),
        ("mine" = Option<bool>, Query, description = "Only courses the caller may edit (adds `summary`)"),
        ("q" = Option<String>, Query, description = "Substring filter over name/description"),
        ("sort" = Option<String>, Query, description = "`updated` (default) or `name`"),
        ("preset" = Option<String>, Query, description = "`all` | `drafts` | `published` | `recent` | `attention`"),
    ),
    responses((status = 200, description = "Page of courses", body = CoursePage)),
)]
pub async fn list_courses(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Query(query): Query<CourseListQuery>,
) -> ApiResult<Json<CoursePage>> {
    let mine = query.mine.unwrap_or(false);
    let params = ListParams {
        mine,
        q: query.q.as_deref(),
        sort: query.sort.as_deref().unwrap_or("updated"),
        preset: query.preset.as_deref().unwrap_or("all"),
    };
    let (courses, next_cursor) = state
        .courses
        .list(&actor, &params, query.cursor, query.limit.unwrap_or(20))
        .await?;
    let summary = if mine {
        Some(state.courses.summary(&actor).await?.into())
    } else {
        None
    };
    Ok(Json(CoursePage {
        items: courses.into_iter().map(Into::into).collect(),
        next_cursor,
        summary,
    }))
}

/// Publish readiness: blockers and warnings with stable codes (course write
/// access; 404 for invisible courses).
#[utoipa::path(
    get,
    path = "/courses/{id}/readiness",
    tag = "courses",
    params(("id" = CourseId, Path, description = "Course id")),
    responses(
        (status = 200, description = "Readiness", body = CourseReadiness),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn course_readiness(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<CourseReadiness>> {
    let readiness =
        ab_domain::catalog::readiness::course_readiness(&state.assessments, &actor, id).await?;
    Ok(Json(readiness.into()))
}

// ── Contributors ────────────────────────────────────────────────────────────

/// Roster, creator first (course visibility; 404 otherwise).
#[utoipa::path(
    get,
    path = "/courses/{id}/contributors",
    tag = "courses",
    params(("id" = CourseId, Path, description = "Course id")),
    responses(
        (status = 200, description = "Roster", body = [Contributor]),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_contributors(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<Vec<Contributor>>> {
    let rows = state.courses.list_contributors(&actor, id).await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

/// Add an active contributor by `user_id` or `username` (creator, active
/// maintainer, or `course:manage:platform`). 409 `conflict` when the user
/// is already on the roster (or is the creator).
#[utoipa::path(
    post,
    path = "/courses/{id}/contributors",
    tag = "courses",
    params(("id" = CourseId, Path, description = "Course id")),
    request_body = AddContributorRequest,
    responses(
        (status = 201, description = "Added", body = Contributor),
        (status = 403, description = "No roster access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown user", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Already on the roster", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn add_contributor(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    ValidJson(request): ValidJson<AddContributorRequest>,
) -> ApiResult<(StatusCode, Json<Contributor>)> {
    let target = match (request.user_id, request.username) {
        (Some(user_id), None) => Target::UserId(user_id),
        (None, Some(username)) => Target::Username(username),
        _ => {
            return Err(ab_core::Error::validation(vec![ab_core::FieldError {
                field: "user_id".into(),
                code: "required".into(),
                message: "exactly one of user_id or username is required".into(),
            }])
            .into());
        }
    };
    let row = state
        .courses
        .add_contributor(
            &actor,
            id,
            target,
            request.role.as_deref().unwrap_or("contributor"),
        )
        .await?;
    Ok((StatusCode::CREATED, Json(row.into())))
}

/// Change a contributor's role and/or status (`status: active` approves a
/// pending application; the creator cannot be changed → 409).
#[utoipa::path(
    patch,
    path = "/courses/{id}/contributors/{user_id}",
    tag = "courses",
    params(
        ("id" = CourseId, Path, description = "Course id"),
        ("user_id" = UserId, Path, description = "Contributor user id"),
    ),
    request_body = UpdateContributorRequest,
    responses(
        (status = 200, description = "Updated", body = Contributor),
        (status = 403, description = "No roster access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Not on the roster", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_contributor(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((id, user_id)): Path<(CourseId, UserId)>,
    ValidJson(request): ValidJson<UpdateContributorRequest>,
) -> ApiResult<Json<Contributor>> {
    let row = state
        .courses
        .update_contributor(
            &actor,
            id,
            user_id,
            request.role.as_deref(),
            request.status.as_deref(),
        )
        .await?;
    Ok(Json(row.into()))
}

/// Remove a contributor (reject an application, or drop an active one), or
/// withdraw one's own pending application.
#[utoipa::path(
    delete,
    path = "/courses/{id}/contributors/{user_id}",
    tag = "courses",
    params(
        ("id" = CourseId, Path, description = "Course id"),
        ("user_id" = UserId, Path, description = "Contributor user id"),
    ),
    responses(
        (status = 204, description = "Removed"),
        (status = 403, description = "No roster access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Not on the roster", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn remove_contributor(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((id, user_id)): Path<(CourseId, UserId)>,
) -> ApiResult<StatusCode> {
    state
        .courses
        .remove_contributor(&actor, id, user_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Apply to contribute (any signed-in user on an `open_to_contributors`
/// course): creates a `contributor/pending` entry. 409 `conflict` when the
/// course is closed or the caller already has a role.
#[utoipa::path(
    post,
    path = "/courses/{id}/contributors/apply",
    tag = "courses",
    params(("id" = CourseId, Path, description = "Course id")),
    responses(
        (status = 201, description = "Application recorded", body = Contributor),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Closed course or existing role", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn apply_contributor(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
) -> ApiResult<(StatusCode, Json<Contributor>)> {
    let row = state.courses.apply_contributor(&actor, id).await?;
    Ok((StatusCode::CREATED, Json(row.into())))
}

/// One course (404 for private courses the caller cannot see).
#[utoipa::path(
    get,
    path = "/courses/{id}",
    tag = "courses",
    params(("id" = CourseId, Path, description = "Course id")),
    responses(
        (status = 200, description = "Course", body = Course),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_course(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<Course>> {
    Ok(Json(state.courses.get(&actor, id).await?.into()))
}

/// Partial update (creator with `course:update:own` or platform updaters).
#[utoipa::path(
    patch,
    path = "/courses/{id}",
    tag = "courses",
    params(("id" = CourseId, Path, description = "Course id")),
    request_body = UpdateCourseRequest,
    responses(
        (status = 200, description = "Updated", body = Course),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_course(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    ValidJson(request): ValidJson<UpdateCourseRequest>,
) -> ApiResult<Json<Course>> {
    let course = state
        .courses
        .update(
            &actor,
            id,
            CourseChanges {
                name: request.name,
                description: request.description,
                about: request.about,
                tags: request.tags,
                open_to_contributors: request.open_to_contributors,
                thumbnail_upload_id: request.thumbnail_upload_id,
            },
        )
        .await?;
    Ok(Json(course.into()))
}

/// Publish/unpublish (legacy lifecycle semantics).
#[utoipa::path(
    post,
    path = "/courses/{id}/lifecycle",
    tag = "courses",
    params(("id" = CourseId, Path, description = "Course id")),
    request_body = CourseLifecycleRequest,
    responses(
        (status = 200, description = "Visibility changed", body = Course),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Publish blocked by readiness (`course-not-ready`,                                       `details.blockers`)", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn course_lifecycle(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    ValidJson(request): ValidJson<CourseLifecycleRequest>,
) -> ApiResult<Json<Course>> {
    let course = ab_domain::catalog::readiness::set_course_public(
        &state.assessments,
        &actor,
        id,
        request.action == "publish",
    )
    .await?;
    Ok(Json(course.into()))
}

/// Delete a course and everything under it (cascades).
#[utoipa::path(
    delete,
    path = "/courses/{id}",
    tag = "courses",
    params(("id" = CourseId, Path, description = "Course id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, description = "No delete access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_course(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
) -> ApiResult<StatusCode> {
    state.courses.delete(&actor, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Course announcements, newest first (read follows course visibility).
#[utoipa::path(
    get,
    path = "/courses/{id}/updates",
    tag = "courses",
    params(("id" = CourseId, Path, description = "Course id")),
    responses(
        (status = 200, description = "Announcements", body = [CourseUpdate]),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_course_updates(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<Vec<CourseUpdate>>> {
    let updates = state.courses.list_updates(&actor, id).await?;
    Ok(Json(updates.into_iter().map(Into::into).collect()))
}

/// Post an announcement (course write access).
#[utoipa::path(
    post,
    path = "/courses/{id}/updates",
    tag = "courses",
    params(("id" = CourseId, Path, description = "Course id")),
    request_body = CreateCourseUpdateRequest,
    responses(
        (status = 201, description = "Created", body = CourseUpdate),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_course_update(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    ValidJson(request): ValidJson<CreateCourseUpdateRequest>,
) -> ApiResult<(StatusCode, Json<CourseUpdate>)> {
    let update = state
        .courses
        .create_update(&actor, id, &request.title, &request.content)
        .await?;
    Ok((StatusCode::CREATED, Json(update.into())))
}

/// Edit an announcement (course write access).
#[utoipa::path(
    patch,
    path = "/course-updates/{id}",
    tag = "courses",
    params(("id" = CourseUpdateId, Path, description = "Course update id")),
    request_body = EditCourseUpdateRequest,
    responses(
        (status = 200, description = "Updated", body = CourseUpdate),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn edit_course_update(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseUpdateId>,
    ValidJson(request): ValidJson<EditCourseUpdateRequest>,
) -> ApiResult<Json<CourseUpdate>> {
    let update = state
        .courses
        .edit_update(
            &actor,
            id,
            request.title.as_deref(),
            request.content.as_deref(),
        )
        .await?;
    Ok(Json(update.into()))
}

/// Delete an announcement (course write access).
#[utoipa::path(
    delete,
    path = "/course-updates/{id}",
    tag = "courses",
    params(("id" = CourseUpdateId, Path, description = "Course update id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_course_update(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseUpdateId>,
) -> ApiResult<StatusCode> {
    state.courses.delete_update(&actor, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
