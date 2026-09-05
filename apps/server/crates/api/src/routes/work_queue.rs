//! The unified inbox: what the caller should act on next, as a learner or
//! as a teacher.

use ab_domain::progress::work_queue::DEFAULT_PAGE;
use axum::Json;
use axum::extract::{Query, State};

use crate::dto::work_queue::{WorkQueue, WorkQueueQuery, WorkRole};
use crate::error::{ApiResult, Problem};
use crate::extract::CurrentActor;
use crate::state::AppState;

/// Ranked work items for the caller.
///
/// `role=learner` (default) lists the caller's own open activities; `role=teacher` lists submissions to grade
/// or release across the courses the caller created or co-authors. Sorted
/// by priority, then due/created time, then id; paged by an opaque cursor.
#[utoipa::path(
    get, path = "/work", tag = "work-queue",
    params(WorkQueueQuery),
    responses(
        (status = 200, description = "Work queue page", body = WorkQueue),
        (status = 401, description = "No session", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Invalid cursor or limit", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn work_queue(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<WorkQueueQuery>,
) -> ApiResult<Json<WorkQueue>> {
    let queue = state
        .work_queue
        .list(
            &actor,
            query.role.unwrap_or(WorkRole::Learner),
            query.limit.unwrap_or(DEFAULT_PAGE),
            query.cursor.as_deref(),
        )
        .await?;
    Ok(Json(queue.into()))
}
