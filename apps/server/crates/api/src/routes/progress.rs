//! The personal trail and the learner-facing course state.

use ab_core::id::{ActivityId, CourseId};
use axum::Json;
use axum::extract::State;

use crate::detach::detached;
use crate::dto::progress::{LearnerCourseState, Trail};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, MaybeActor, Path};
use crate::state::AppState;

/// The caller's trail: one run per course, one step per activity marked
/// done. Anonymous callers get an empty trail.
#[utoipa::path(
    get, path = "/trail", tag = "progress",
    responses((status = 200, description = "Trail", body = Trail)),
)]
pub async fn get_trail(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
) -> ApiResult<Json<Trail>> {
    Ok(Json(state.trail.get(&actor).await?.into()))
}

/// Start (or keep) a run for a course the caller can access.
#[utoipa::path(
    post, path = "/trail/courses/{id}", tag = "progress",
    params(("id" = CourseId, Path, description = "Course id")),
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
) -> ApiResult<Json<Trail>> {
    detached(async move { Ok(Json(state.trail.add_course(&actor, id).await?.into())) }).await
}

/// Drop the run for a course and every step in it.
///
/// Trail mutations run `detached()` (BUG-221): a client that hangs up
/// mid-request must not leave the step without its projection.
#[utoipa::path(
    delete, path = "/trail/courses/{id}", tag = "progress",
    params(("id" = CourseId, Path, description = "Course id")),
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
) -> ApiResult<Json<Trail>> {
    detached(async move { Ok(Json(state.trail.remove_course(&actor, id).await?.into())) }).await
}

/// Mark an activity done (lesson-type activities also complete in the
/// canonical progress; assessments are projected by their own pipeline).
#[utoipa::path(
    post, path = "/trail/activities/{id}", tag = "progress",
    params(("id" = ActivityId, Path, description = "Activity id")),
    responses((status = 200, description = "Trail", body = Trail)),
)]
pub async fn add_activity(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ActivityId>,
) -> ApiResult<Json<Trail>> {
    detached(async move { Ok(Json(state.trail.add_activity(&actor, id).await?.into())) }).await
}

/// Un-mark an activity.
#[utoipa::path(
    delete, path = "/trail/activities/{id}", tag = "progress",
    params(("id" = ActivityId, Path, description = "Activity id")),
    responses((status = 200, description = "Trail", body = Trail)),
)]
pub async fn remove_activity(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ActivityId>,
) -> ApiResult<Json<Trail>> {
    detached(async move { Ok(Json(state.trail.remove_activity(&actor, id).await?.into())) }).await
}

/// The learner-facing course state: outline with per-activity work state,
/// canonical progress, certificate block and the single next action.
#[utoipa::path(
    get, path = "/courses/{id}/learner-state", tag = "progress",
    params(("id" = CourseId, Path, description = "Course id")),
    responses(
        (status = 200, description = "Learner course state", body = LearnerCourseState),
        (status = 403, description = "No course access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn learner_course_state(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<LearnerCourseState>> {
    Ok(Json(state.learner_state.course_state(&actor, id).await?))
}
