//! The personal trail and the learner-facing course state.

use ab_core::id::{ActivityId, CourseId};
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;

use crate::detach::detached;
use crate::dto::progress::{LearnerCourseState, Trail};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, MaybeActor, Path, Query, idempotent, wants_representation};
use crate::state::AppState;

/// `GET /trail` paging (S-05); without both, every run comes back.
#[derive(Debug, serde::Deserialize)]
pub struct TrailQuery {
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

/// The caller's trail: one run per course, one step per activity marked
/// done. Anonymous callers get an empty trail. With `limit` / `cursor` the
/// runs come in keyset pages (`next_cursor`).
#[utoipa::path(
    get, path = "/trail", tag = "progress",
    params(
        ("cursor" = Option<String>, Query, description = "`next_cursor` of the previous page"),
        ("limit" = Option<i64>, Query, description = "Runs per page, 1..=100 (default: all; 20 with `cursor`)"),
    ),
    responses((status = 200, description = "Trail", body = Trail)),
)]
pub async fn get_trail(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Query(query): Query<TrailQuery>,
) -> ApiResult<Json<Trail>> {
    let mut trail = Trail::for_actor(state.trail.get(&actor).await?, &actor);
    if query.cursor.is_some() || query.limit.is_some() {
        let (runs, next) = ab_core::page_after(
            std::mem::take(&mut trail.runs),
            query.cursor.as_deref(),
            query.limit.unwrap_or(20),
            100,
            |r| r.id.to_string(),
        )?;
        trail.runs = runs;
        trail.next_cursor = next;
    }
    Ok(Json(trail))
}

/// The trail after a write, with the course's learner state when the
/// caller asked for it (`Prefer: return=representation`).
async fn trail_reply(
    state: &AppState,
    actor: &ab_domain::identity::Actor,
    trail: ab_domain::progress::trail::Trail,
    course_id: Option<CourseId>,
) -> ApiResult<Trail> {
    let mut reply = Trail::for_actor(trail, actor);
    if let Some(course_id) = course_id {
        reply.learner_state = Some(state.learner_state.course_state(actor, course_id).await?);
    }
    Ok(reply)
}

/// Start (or keep) a run for a course the caller can access.
#[utoipa::path(
    post, path = "/trail/courses/{course_id}", tag = "progress",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("Idempotency-Key" = Option<String>, Header, description = "Retry-safe replay key"),
        ("Prefer" = Option<String>, Header, description = "`return=representation`: also answer the course's `learner_state`"),
    ),
    responses(
        (status = 200, description = "Trail", body = Trail),
        (status = 401, description = "Not signed in", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "No course access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown or invisible course", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Course staff never enrol, or the trail lock is busy",
         body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "Malformed id", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn add_course(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let with_state = wants_representation(&headers).then_some(id);
    // `idempotent` runs the enrolment on its own task (`detached`, BUG-221).
    idempotent(
        state.pool.clone(),
        actor.user_id,
        &format!("enrol:{id}"),
        &headers,
        &[],
        move || async move {
            let trail = state.trail.add_course(&actor, id).await?;
            Ok((
                StatusCode::OK,
                trail_reply(&state, &actor, trail, with_state).await?,
            ))
        },
    )
    .await
}

/// Drop the run for a course and every step in it.
///
/// Trail mutations run `detached()` (BUG-221): a client that hangs up
/// mid-request must not leave the step without its projection.
#[utoipa::path(
    delete, path = "/trail/courses/{course_id}", tag = "progress",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("Prefer" = Option<String>, Header, description = "`return=representation`: also answer the course's `learner_state`"),
    ),
    responses(
        (status = 200, description = "Trail", body = Trail),
        (status = 401, description = "Not signed in", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "No trail access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown course or no run in it", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "The trail lock is busy", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Malformed id", body = Problem,
         content_type = "application/problem+json"),
    ),
)]
pub async fn remove_course(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    headers: HeaderMap,
) -> ApiResult<Json<Trail>> {
    let with_state = wants_representation(&headers).then_some(id);
    detached(async move {
        let trail = state.trail.remove_course(&actor, id).await?;
        Ok(Json(trail_reply(&state, &actor, trail, with_state).await?))
    })
    .await
}

/// The course of an activity whose learner state a write should answer.
async fn activity_course(
    state: &AppState,
    id: ActivityId,
    headers: &HeaderMap,
) -> ApiResult<Option<CourseId>> {
    if !wants_representation(headers) {
        return Ok(None);
    }
    Ok(ab_db::catalog::get_activity(&state.pool, id)
        .await?
        .map(|a| a.course_id))
}

/// Mark an activity done (lesson-type activities also complete in the
/// canonical progress; assessments are projected by their own pipeline).
#[utoipa::path(
    post, path = "/trail/activities/{activity_id}", tag = "progress",
    params(
        ("activity_id" = ActivityId, Path, description = "Activity id"),
        ("Prefer" = Option<String>, Header, description = "`return=representation`: also answer the course's `learner_state`"),
    ),
    responses((status = 200, description = "Trail", body = Trail)),
)]
pub async fn add_activity(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ActivityId>,
    headers: HeaderMap,
) -> ApiResult<Json<Trail>> {
    detached(async move {
        let trail = state.trail.add_activity(&actor, id).await?;
        let course = activity_course(&state, id, &headers).await?;
        Ok(Json(trail_reply(&state, &actor, trail, course).await?))
    })
    .await
}

/// Un-mark an activity.
#[utoipa::path(
    delete, path = "/trail/activities/{activity_id}", tag = "progress",
    params(
        ("activity_id" = ActivityId, Path, description = "Activity id"),
        ("Prefer" = Option<String>, Header, description = "`return=representation`: also answer the course's `learner_state`"),
    ),
    responses((status = 200, description = "Trail", body = Trail)),
)]
pub async fn remove_activity(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ActivityId>,
    headers: HeaderMap,
) -> ApiResult<Json<Trail>> {
    detached(async move {
        let trail = state.trail.remove_activity(&actor, id).await?;
        let course = activity_course(&state, id, &headers).await?;
        Ok(Json(trail_reply(&state, &actor, trail, course).await?))
    })
    .await
}

/// The learner-facing course state: outline with per-activity work state,
/// canonical progress, certificate block and the single next action.
///
/// A guest gets the anonymous state of a public course (not enrolled).
#[utoipa::path(
    get, path = "/courses/{course_id}/learner-state", tag = "progress",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses(
        (status = 200, description = "Learner course state", body = LearnerCourseState),
        (status = 403, description = "No course access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn learner_course_state(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<LearnerCourseState>> {
    Ok(Json(state.learner_state.course_state(&actor, id).await?))
}

/// The course's members, newest first, with their progress (course write
/// access). Keyset pages.
#[utoipa::path(
    get, path = "/courses/{course_id}/learners", tag = "progress",
    params(("course_id" = CourseId, Path, description = "Course id"), crate::dto::KeysetQuery),
    responses(
        (status = 200, description = "Page of members", body = crate::dto::progress::CourseLearnerPage),
        (status = 403, description = "No course write access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown or inaccessible course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_course_learners(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    Query(query): Query<crate::dto::KeysetQuery>,
) -> ApiResult<Json<crate::dto::progress::CourseLearnerPage>> {
    use crate::dto::progress::{CourseLearner, CourseLearnerAction, CourseLearnerPage};
    let cursor = query
        .cursor
        .as_deref()
        .map(|c| {
            c.parse().map_err(|_| {
                ab_core::Error::validation(vec![ab_core::FieldError {
                    field: "cursor".into(),
                    code: "invalid".into(),
                    message: "not a cursor of this list".into(),
                }])
            })
        })
        .transpose()?;
    let (rows, next) = state
        .trail
        .course_learners(&actor, id, cursor, query.limit.unwrap_or(20))
        .await?;
    let removable = state
        .courses
        .require_roster_manager(&actor, id)
        .await
        .is_ok();
    Ok(Json(CourseLearnerPage {
        items: rows
            .into_iter()
            .map(|r| CourseLearner {
                user_id: r.user_id,
                username: r.username,
                display_name: r.display_name,
                avatar_key: r.avatar_key,
                progress_pct: r.progress_pct,
                completed_at_unix: r.completed_at,
                last_activity_at_unix: r.last_activity_at,
                enrolled_at_unix: r.enrolled_at,
                allowed_actions: if removable {
                    vec![CourseLearnerAction::Remove]
                } else {
                    Vec::new()
                },
            })
            .collect(),
        next_cursor: next.map(|c| c.to_string()),
    }))
}

/// Remove a learner from the course (roster managers): their membership
/// and progress go as if they had left; submissions stay.
#[utoipa::path(
    delete, path = "/courses/{course_id}/learners/{user_id}", tag = "progress",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("user_id" = ab_core::id::UserId, Path, description = "Learner"),
    ),
    responses(
        (status = 204, description = "Removed"),
        (status = 403, description = "Not a roster manager", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown course, or not a member", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "The course is archived, or the trail lock is busy", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn remove_course_learner(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((id, user_id)): Path<(CourseId, ab_core::id::UserId)>,
) -> ApiResult<StatusCode> {
    // The run delete and its un-projection outlive a hang-up (BUG-221).
    detached(async move {
        state.trail.remove_learner(&actor, id, user_id).await?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
}
