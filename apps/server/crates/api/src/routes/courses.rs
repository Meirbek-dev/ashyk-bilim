use ab_core::id::CourseId;
use ab_domain::catalog::courses::CourseChanges;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;

use crate::dto::courses::{
    Course, CourseLifecycleRequest, CourseListQuery, CoursePage, CreateCourseRequest,
    UpdateCourseRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, ValidJson};
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

/// Newest-first course listing: public courses plus the caller's own
/// (readers with `course:read:all` see everything).
#[utoipa::path(
    get,
    path = "/courses",
    tag = "courses",
    params(
        ("cursor" = Option<CourseId>, Query, description = "next_cursor from the previous page"),
        ("limit" = Option<i64>, Query, description = "Page size, 1..=100 (default 20)"),
    ),
    responses((status = 200, description = "Page of courses", body = CoursePage)),
)]
pub async fn list_courses(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<CourseListQuery>,
) -> ApiResult<Json<CoursePage>> {
    let (courses, next_cursor) = state
        .courses
        .list(&actor, query.cursor, query.limit.unwrap_or(20))
        .await?;
    Ok(Json(CoursePage {
        items: courses.into_iter().map(Into::into).collect(),
        next_cursor,
    }))
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
    CurrentActor(actor): CurrentActor,
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
    )
)]
pub async fn course_lifecycle(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    ValidJson(request): ValidJson<CourseLifecycleRequest>,
) -> ApiResult<Json<Course>> {
    let course = state
        .courses
        .set_public(&actor, id, request.action == "publish")
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
