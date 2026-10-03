use ab_core::id::{CourseId, CourseUpdateId, UserId};
use ab_db::versions::Versioned;
use ab_domain::catalog::contributors::Target;
use ab_domain::catalog::courses::{CourseChanges, ListParams};
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;

use crate::detach::detached;
use crate::dto::courses::{
    AddContributorRequest, Contributor, Course, CourseArchivePreview, CourseAuthor,
    CourseLifecycleRequest, CourseListItem, CourseListProgress, CourseListQuery, CoursePage,
    CourseReadiness, CourseUpdate, CreateCourseRequest, CreateCourseUpdateRequest,
    DuplicateCourseRequest, EditCourseUpdateRequest, UpdateContributorRequest, UpdateCourseRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{
    CurrentActor, MaybeActor, Path, Query, ValidJson, idempotent, require_if_match, with_etag,
};
use crate::state::AppState;

/// Create a course (requires `course:create:platform`). Honours
/// `Idempotency-Key` (a retry replays the 201 instead of a second course).
#[utoipa::path(
    post,
    path = "/courses",
    tag = "courses",
    params(("Idempotency-Key" = Option<String>, Header, description = "Retry-safe replay key")),
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
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::catalog::CoursesService::require_create(&actor)?;
    let request = ValidJson::<CreateCourseRequest>::parse(&body)?;
    idempotent(
        state.pool.clone(),
        actor.user_id,
        "course",
        &headers,
        &body,
        move || async move {
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
            Ok((StatusCode::CREATED, Course::for_actor(course, &actor)))
        },
    )
    .await
}

/// Copy a course as a private draft for the caller.
///
/// Chapters, unpublished
/// activities with their blocks, file-submission configs and assessments
/// (draft copies with policy and items). Uploaded media is shared by key,
/// not duplicated (one more reference per use). Learners, grades,
/// submissions, discussions, announcements, contributors and group links
/// stay behind. Needs `course:create:platform` and write access to the
/// source. Honours `Idempotency-Key`.
#[utoipa::path(
    post,
    path = "/courses/{course_id}/duplicate",
    tag = "courses",
    params(
        ("course_id" = CourseId, Path, description = "Source course id"),
        ("Idempotency-Key" = Option<String>, Header, description = "Retry-safe replay key"),
    ),
    request_body = DuplicateCourseRequest,
    responses(
        (status = 201, description = "The copy", body = Course),
        (status = 403, description = "No create right or no write access to the source", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown or invisible course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn duplicate_course(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::catalog::CoursesService::require_create(&actor)?;
    let request = ValidJson::<DuplicateCourseRequest>::parse(&body)?;
    idempotent(
        state.pool.clone(),
        actor.user_id,
        &format!("course-copy:{id}"),
        &headers,
        &body,
        move || async move {
            let course = state
                .assessments
                .duplicate_course(&actor, id, request.name.as_deref())
                .await?;
            Ok((StatusCode::CREATED, Course::for_actor(course, &actor)))
        },
    )
    .await
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
        ("sort" = Option<crate::dto::enums::CourseListSort>, Query, description = "`progress`: the caller's in-progress courses first; default `updated`"),
        ("preset" = Option<crate::dto::enums::CourseListPreset>, Query, description = "Default `all`; `archived` needs `mine=true`"),
    ),
    responses(
        (status = 200, description = "Page of courses", body = CoursePage),
        (status = 422, description = "`preset=archived` without `mine=true`", body = Problem,
         content_type = "application/problem+json"),
    ),
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
    let items = list_items(&state, &actor, courses).await?;
    Ok(Json(CoursePage {
        items,
        next_cursor,
        summary,
    }))
}

/// Authors' names and the caller's progress for a page.
pub(crate) async fn list_items(
    state: &AppState,
    actor: &ab_domain::identity::Actor,
    courses: Vec<ab_domain::catalog::courses::Course>,
) -> ApiResult<Vec<CourseListItem>> {
    let mut extras = state.courses.list_extras(actor, &courses).await?;
    Ok(courses
        .into_iter()
        .map(|c| {
            let mut ids: Vec<UserId> = c.creator_id.into_iter().collect();
            ids.extend(
                c.contributor_ids
                    .iter()
                    .filter(|id| Some(**id) != c.creator_id),
            );
            let authors = ids
                .iter()
                .filter_map(|id| extras.users.get(id))
                .map(|u| CourseAuthor {
                    user_id: u.id,
                    username: u.username.clone(),
                    display_name: u.display_name.clone(),
                })
                .collect();
            CourseListItem {
                progress: extras.progress.remove(&c.id).map(|p| CourseListProgress {
                    progress_pct: p.progress_pct,
                    completed_at_unix: p.completed_at,
                }),
                authors,
                course: Course::for_actor(c, actor),
            }
        })
        .collect())
}

/// Publish readiness: blockers and warnings with stable codes (course write
/// access; 404 for invisible courses).
#[utoipa::path(
    get,
    path = "/courses/{course_id}/readiness",
    tag = "courses",
    params(("course_id" = CourseId, Path, description = "Course id")),
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

/// Roster, creator first (course visibility; 404 otherwise). Public for a
/// public course - the course page names its authors to every visitor;
/// anonymous visitors see active authors only.
#[utoipa::path(
    get,
    path = "/courses/{course_id}/contributors",
    tag = "courses",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses(
        (status = 200, description = "Roster", body = [Contributor]),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_contributors(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<Vec<Contributor>>> {
    let rows = state.courses.list_contributors(&actor, id).await?;
    let course = state.courses.get(&actor, id).await?;
    Ok(Json(
        rows.into_iter()
            .map(|row| Contributor::for_actor(row, &actor, &course))
            .collect(),
    ))
}

/// Add an active contributor by `user_id` or `username` (creator, active
/// maintainer, or `course:manage:platform`). 409 `conflict` when the user
/// is already on the roster (or is the creator).
///
/// Honours `Idempotency-Key`.
#[utoipa::path(
    post,
    path = "/courses/{course_id}/contributors",
    tag = "courses",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("Idempotency-Key" = Option<String>, Header, description = "Retry-safe replay key"),
    ),
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
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    state.courses.require_roster_manager(&actor, id).await?;
    let request = ValidJson::<AddContributorRequest>::parse(&body)?;
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
    // Roster insert → BUG-303 access sweep outlive the connection (BUG-305):
    // `idempotent` runs the action on its own task.
    idempotent(
        state.pool.clone(),
        actor.user_id,
        &format!("contributor:{id}"),
        &headers,
        &body,
        move || async move {
            let row = state
                .courses
                .add_contributor(
                    &actor,
                    id,
                    target,
                    request.role.as_deref().unwrap_or("contributor"),
                )
                .await?;
            let course = state.courses.get(&actor, id).await?;
            Ok((
                StatusCode::CREATED,
                Contributor::for_actor(row, &actor, &course),
            ))
        },
    )
    .await
}

/// Change a contributor's role and/or status (`status: active` approves a
/// pending application; the creator cannot be changed → 409).
#[utoipa::path(
    patch,
    path = "/courses/{course_id}/contributors/{user_id}",
    tag = "courses",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("user_id" = UserId, Path, description = "Contributor user id"),
        ("If-Match" = Option<i32>, Header, description = "Row `version`; stale → 412"),
    ),
    request_body = UpdateContributorRequest,
    responses(
        (status = 200, description = "Updated", body = Contributor),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
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
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Json<Contributor>> {
    // UX-311: permission before the body.
    state.courses.require_roster_manager(&actor, id).await?;
    let request = ValidJson::<UpdateContributorRequest>::parse(&body)?;
    require_if_match(&state.pool, Versioned::Contributor(id, user_id), &headers).await?;
    // Roster write → member re-projection outlive the connection (BUG-291).
    detached(async move {
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
        let course = state.courses.get(&actor, id).await?;
        Ok(Json(Contributor::for_actor(row, &actor, &course)))
    })
    .await
}

/// Remove a contributor (reject an application, or drop an active one), or
/// withdraw one's own pending application.
#[utoipa::path(
    delete,
    path = "/courses/{course_id}/contributors/{user_id}",
    tag = "courses",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
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
    detached(async move {
        state
            .courses
            .remove_contributor(&actor, id, user_id)
            .await?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
}

/// Apply to contribute (any signed-in user on an `open_to_contributors`
/// course): creates a `contributor/pending` entry. 409 `conflict` when the
/// course is closed or the caller already has a role.
#[utoipa::path(
    post,
    path = "/courses/{course_id}/contributors/apply",
    tag = "courses",
    params(("course_id" = CourseId, Path, description = "Course id")),
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
    let course = state.courses.get(&actor, id).await?;
    Ok((
        StatusCode::CREATED,
        Json(Contributor::for_actor(row, &actor, &course)),
    ))
}

/// One course (404 for private courses the caller cannot see).
#[utoipa::path(
    get,
    path = "/courses/{course_id}",
    tag = "courses",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses(
        (status = 200, description = "Course", body = Course,
         headers(("ETag" = String, description = "Quoted `version`"))),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_course(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Response> {
    let course = Course::for_actor(state.courses.get(&actor, id).await?, &actor);
    Ok(with_etag(StatusCode::OK, course.version, course))
}

/// Partial update (creator with `course:update:own` or platform updaters).
#[utoipa::path(
    patch,
    path = "/courses/{course_id}",
    tag = "courses",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("If-Match" = Option<i32>, Header, description = "Current `version`; stale â†’ 412"),
    ),
    request_body = UpdateCourseRequest,
    responses(
        (status = 200, description = "Updated", body = Course,
         headers(("ETag" = String, description = "Quoted new version"))),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
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
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    state.courses.require_writable(&actor, id).await?;
    let request = ValidJson::<UpdateCourseRequest>::parse(&body)?;
    require_if_match(&state.pool, Versioned::Course(id), &headers).await?;
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
                learnings: request
                    .learnings
                    .map(|items| items.into_iter().map(Into::into).collect()),
            },
        )
        .await?;
    let course = Course::for_actor(course, &actor);
    Ok(with_etag(StatusCode::OK, course.version, course))
}

/// Lifecycle: `publish` / `unpublish` (course write access, readiness
/// gated), `archive` / `restore` (creator, active maintainer or
/// `course:manage:platform`; see docs/COURSE_ARCHIVING.md).
///
/// 409 `conflict`: `archive` on an archived course, `restore` on an active
/// one. 409 `course-archived`: `publish` / `unpublish` on an archived one.
#[utoipa::path(
    post,
    path = "/courses/{course_id}/lifecycle",
    tag = "courses",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("If-Match" = Option<i32>, Header, description = "Current `version`; stale â†’ 412"),
    ),
    request_body = CourseLifecycleRequest,
    responses(
        (status = 200, description = "Lifecycle changed", body = Course,
         headers(("ETag" = String, description = "Quoted new version"))),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "No write / roster access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Already in that state (`conflict`) or archived (`course-archived`)", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Publish blocked by readiness (`course-not-ready`,                                       `details.blockers`)", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn course_lifecycle(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: visibility before the body; the action picks its gate.
    state.courses.get(&actor, id).await?;
    let request = ValidJson::<CourseLifecycleRequest>::parse(&body)?;
    require_if_match(&state.pool, Versioned::Course(id), &headers).await?;
    let course = match request.action.as_str() {
        "archive" => state.courses.archive(&actor, id).await?,
        "restore" => state.courses.restore(&actor, id).await?,
        action => {
            ab_domain::catalog::readiness::set_course_public(
                &state.assessments,
                &actor,
                id,
                action == "publish",
            )
            .await?
        }
    };
    let course = Course::for_actor(course, &actor);
    Ok(with_etag(StatusCode::OK, course.version, course))
}

/// What archiving the course would freeze - the numbers for the
/// confirmation dialog (creator, active maintainer or
/// `course:manage:platform`; warnings, never blockers).
#[utoipa::path(
    get,
    path = "/courses/{course_id}/archive-preview",
    tag = "courses",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses(
        (status = 200, description = "Archive preview", body = CourseArchivePreview),
        (status = 403, description = "No roster access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn course_archive_preview(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<CourseArchivePreview>> {
    Ok(Json(
        state.courses.archive_preview(&actor, id).await?.into(),
    ))
}

/// Delete a course and everything under it (cascades).
#[utoipa::path(
    delete,
    path = "/courses/{course_id}",
    tag = "courses",
    params(("course_id" = CourseId, Path, description = "Course id")),
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
    detached(async move {
        state.courses.delete(&actor, id).await?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
}

/// Announcements as keyset pages (S-05; `GET .../updates` stays the full list).
#[utoipa::path(
    get,
    path = "/courses/{course_id}/updates/page",
    tag = "courses",
    params(("course_id" = CourseId, Path, description = "Course id"), crate::dto::KeysetQuery),
    responses(
        (status = 200, description = "Page of announcements", body = crate::dto::courses::CourseUpdatePage),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_course_updates_page(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Path(id): Path<CourseId>,
    Query(query): Query<crate::dto::KeysetQuery>,
) -> ApiResult<Json<crate::dto::courses::CourseUpdatePage>> {
    let updates = state.courses.list_updates(&actor, id).await?;
    let actions = update_actions(&state, &actor, id).await?;
    let all = updates
        .into_iter()
        .map(|u| CourseUpdate::new(u, actions.clone()))
        .collect();
    let (items, next_cursor) = query.page(all, |u| u.id.to_string())?;
    Ok(Json(crate::dto::courses::CourseUpdatePage {
        items,
        next_cursor,
    }))
}

/// The roster as keyset pages (S-05; `GET .../contributors` stays the full list).
#[utoipa::path(
    get,
    path = "/courses/{course_id}/contributors/page",
    tag = "courses",
    params(("course_id" = CourseId, Path, description = "Course id"), crate::dto::KeysetQuery),
    responses(
        (status = 200, description = "Page of the roster", body = crate::dto::courses::ContributorPage),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_contributors_page(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Path(id): Path<CourseId>,
    Query(query): Query<crate::dto::KeysetQuery>,
) -> ApiResult<Json<crate::dto::courses::ContributorPage>> {
    let rows = state.courses.list_contributors(&actor, id).await?;
    let course = state.courses.get(&actor, id).await?;
    let all = rows
        .into_iter()
        .map(|row| Contributor::for_actor(row, &actor, &course))
        .collect();
    let (items, next_cursor) = query.page(all, |c| c.user_id.to_string())?;
    Ok(Json(crate::dto::courses::ContributorPage {
        items,
        next_cursor,
    }))
}

/// Course announcements, newest first (read follows course visibility).
#[utoipa::path(
    get,
    path = "/courses/{course_id}/updates",
    tag = "courses",
    params(("course_id" = CourseId, Path, description = "Course id")),
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
    let actions = update_actions(&state, &actor, id).await?;
    Ok(Json(
        updates
            .into_iter()
            .map(|u| CourseUpdate::new(u, actions.clone()))
            .collect(),
    ))
}

/// The caller's announcement actions on a course they can read.
async fn update_actions(
    state: &AppState,
    actor: &ab_domain::identity::Actor,
    course_id: CourseId,
) -> ApiResult<Vec<ab_domain::catalog::courses::CourseUpdateAction>> {
    let course = state.courses.get(actor, course_id).await?;
    Ok(ab_domain::catalog::CoursesService::update_actions(
        actor, &course,
    ))
}

/// Post an announcement (course write access). Honours `Idempotency-Key`.
#[utoipa::path(
    post,
    path = "/courses/{course_id}/updates",
    tag = "courses",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("Idempotency-Key" = Option<String>, Header, description = "Retry-safe replay key"),
    ),
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
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    state.courses.require_writable(&actor, id).await?;
    let request = ValidJson::<CreateCourseUpdateRequest>::parse(&body)?;
    idempotent(
        state.pool.clone(),
        actor.user_id,
        &format!("course-update:{id}"),
        &headers,
        &body,
        move || async move {
            let update = state
                .courses
                .create_update(&actor, id, &request.title, &request.content)
                .await?;
            let actions = update_actions(&state, &actor, id).await?;
            Ok((StatusCode::CREATED, CourseUpdate::new(update, actions)))
        },
    )
    .await
}

/// Edit an announcement (course write access).
#[utoipa::path(
    patch,
    path = "/course-updates/{update_id}",
    tag = "courses",
    params(
        ("update_id" = CourseUpdateId, Path, description = "Course update id"),
        ("If-Match" = Option<i32>, Header, description = "Current `version`; stale → 412"),
    ),
    request_body = EditCourseUpdateRequest,
    responses(
        (status = 200, description = "Updated", body = CourseUpdate),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn edit_course_update(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseUpdateId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Json<CourseUpdate>> {
    // UX-311: permission before the body.
    state.courses.require_writable_update(&actor, id).await?;
    let request = ValidJson::<EditCourseUpdateRequest>::parse(&body)?;
    require_if_match(&state.pool, Versioned::CourseUpdate(id), &headers).await?;
    let update = state
        .courses
        .edit_update(
            &actor,
            id,
            request.title.as_deref(),
            request.content.as_deref(),
        )
        .await?;
    let actions = update_actions(&state, &actor, update.course_id).await?;
    Ok(Json(CourseUpdate::new(update, actions)))
}

/// Delete an announcement (course write access).
#[utoipa::path(
    delete,
    path = "/course-updates/{update_id}",
    tag = "courses",
    params(("update_id" = CourseUpdateId, Path, description = "Course update id")),
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
