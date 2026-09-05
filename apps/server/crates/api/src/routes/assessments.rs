use ab_core::id::{ActivityId, AssessmentId, AssessmentItemId, CourseId};
use ab_domain::assessments::service::{
    AssessmentChanges, CreateAssessment, ItemChanges, Readiness,
};
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;

use crate::dto::assessments::{
    Assessment, AssessmentDetail, AssessmentItem, AuditEvent, AuditQuery, CreateAssessmentRequest,
    CreateItemRequest, LifecycleRequest, Policy, ReorderItemsRequest, UpdateAssessmentRequest,
    UpdateItemRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, ValidJson};
use crate::state::AppState;

/// Create an assessment with its backing activity (appended to the chapter).
///
/// Requires `assessment:author` on the course (platform scope or course
/// creator with own scope). Code challenges start with one default code
/// item.
#[utoipa::path(
    post, path = "/assessments", tag = "assessments",
    request_body = CreateAssessmentRequest,
    responses(
        (status = 201, description = "Created (draft)", body = AssessmentDetail),
        (status = 403, description = "No authoring access", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Policy out of range", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_assessment(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ValidJson(request): ValidJson<CreateAssessmentRequest>,
) -> ApiResult<(StatusCode, Json<AssessmentDetail>)> {
    let detail = state
        .assessments
        .create(
            &actor,
            CreateAssessment {
                chapter_id: request.chapter_id,
                kind: request.kind,
                title: &request.title,
                description: request.description.as_deref().unwrap_or(""),
                weight: request.weight.unwrap_or(1.0),
                grading_type: request
                    .grading_type
                    .unwrap_or(ab_core::assessments::GradingType::Percentage),
                policy: request.policy.map(Into::into),
            },
        )
        .await?;
    Ok((StatusCode::CREATED, Json(detail.into())))
}

/// Full assessment with items and policy. Authors always; learners only
/// once published (404 otherwise — no existence leak).
#[utoipa::path(
    get, path = "/assessments/{id}", tag = "assessments",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    responses(
        (status = 200, description = "Assessment", body = AssessmentDetail),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_assessment(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Json<AssessmentDetail>> {
    Ok(Json(state.assessments.get(&actor, id).await?.into()))
}

/// The assessment behind an activity (same access rules as by id).
#[utoipa::path(
    get, path = "/activities/{id}/assessment", tag = "assessments",
    params(("id" = ActivityId, Path, description = "Activity id")),
    responses(
        (status = 200, description = "Assessment", body = AssessmentDetail),
        (status = 404, description = "No assessment or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_activity_assessment(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ActivityId>,
) -> ApiResult<Json<AssessmentDetail>> {
    Ok(Json(
        state.assessments.get_by_activity(&actor, id).await?.into(),
    ))
}

/// Course overview: authors see every assessment, others only published.
#[utoipa::path(
    get, path = "/courses/{id}/assessments", tag = "assessments",
    params(("id" = CourseId, Path, description = "Course id")),
    responses((status = 200, description = "Assessments", body = [Assessment])),
)]
pub async fn list_course_assessments(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<Vec<Assessment>>> {
    let rows = state.assessments.list_for_course(&actor, id).await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

/// Title/description/weight/grading type. Archived assessments are
/// read-only; a published one with submissions must be unpublished first.
#[utoipa::path(
    patch, path = "/assessments/{id}", tag = "assessments",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    request_body = UpdateAssessmentRequest,
    responses(
        (status = 200, description = "Updated", body = AssessmentDetail),
        (status = 409, description = "Read-only in this state", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_assessment(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    ValidJson(request): ValidJson<UpdateAssessmentRequest>,
) -> ApiResult<Json<AssessmentDetail>> {
    let detail = state
        .assessments
        .update(
            &actor,
            id,
            AssessmentChanges {
                title: request.title.as_deref(),
                description: request.description.as_deref(),
                weight: request.weight,
                grading_type: request.grading_type,
            },
        )
        .await?;
    Ok(Json(detail.into()))
}

/// Replace the whole policy block (bumps `policy_version`).
#[utoipa::path(
    put, path = "/assessments/{id}/policy", tag = "assessments",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    request_body = Policy,
    responses(
        (status = 200, description = "Updated", body = AssessmentDetail),
        (status = 422, description = "Out of range", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn set_policy(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    ValidJson(request): ValidJson<Policy>,
) -> ApiResult<Json<AssessmentDetail>> {
    let detail = state
        .assessments
        .set_policy(&actor, id, request.into())
        .await?;
    Ok(Json(detail.into()))
}

/// Lifecycle transition.
///
/// Allowed: draft→scheduled/published/archived,
/// scheduled→draft/published/archived, published→draft/archived,
/// archived→draft. Scheduling and publishing require readiness (422 with
/// the issues as field errors); scheduling needs a future time.
#[utoipa::path(
    post, path = "/assessments/{id}/lifecycle", tag = "assessments",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    request_body = LifecycleRequest,
    responses(
        (status = 200, description = "Transitioned", body = AssessmentDetail),
        (status = 409, description = "Transition not allowed", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Not ready / bad schedule", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn lifecycle(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    ValidJson(request): ValidJson<LifecycleRequest>,
) -> ApiResult<Json<AssessmentDetail>> {
    let detail = state
        .assessments
        .transition(
            &actor,
            id,
            request.to,
            request.scheduled_at_unix,
            request.note.as_deref(),
        )
        .await?;
    Ok(Json(detail.into()))
}

/// What blocks publication right now.
#[utoipa::path(
    get, path = "/assessments/{id}/readiness", tag = "assessments",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    responses((status = 200, description = "Readiness report", body = Readiness)),
)]
pub async fn readiness(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Json<Readiness>> {
    Ok(Json(state.assessments.readiness(&actor, id).await?))
}

/// Lifecycle transitions and override changes, newest first.
#[utoipa::path(
    get, path = "/assessments/{id}/audit", tag = "assessments",
    params(
        ("id" = AssessmentId, Path, description = "Assessment id"),
        ("limit" = Option<i64>, Query, description = "1..=200 (default 50)"),
    ),
    responses((status = 200, description = "Audit events", body = [AuditEvent])),
)]
pub async fn audit_trail(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    Query(query): Query<AuditQuery>,
) -> ApiResult<Json<Vec<AuditEvent>>> {
    let events = state
        .assessments
        .audit_trail(&actor, id, query.limit.unwrap_or(50))
        .await?;
    Ok(Json(events.into_iter().map(Into::into).collect()))
}

/// Append an item (kind must suit the assessment; at most 200 items).
#[utoipa::path(
    post, path = "/assessments/{id}/items", tag = "assessments",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    request_body = CreateItemRequest,
    responses(
        (status = 201, description = "Created (appended last)", body = AssessmentItem),
        (status = 422, description = "Kind unsupported / limit / bad body", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_item(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    ValidJson(request): ValidJson<CreateItemRequest>,
) -> ApiResult<(StatusCode, Json<AssessmentItem>)> {
    let item = state
        .assessments
        .add_item(
            &actor,
            id,
            request.title.as_deref().unwrap_or(""),
            request.body,
            request.max_score.unwrap_or(0.0),
            request.metadata.map(Into::into).unwrap_or_default(),
        )
        .await?;
    Ok((StatusCode::CREATED, Json(item.into())))
}

/// Partial item update. Body/max-score changes are refused (409) once a
/// published assessment has graded submissions.
#[utoipa::path(
    patch, path = "/assessment-items/{id}", tag = "assessments",
    params(("id" = AssessmentItemId, Path, description = "Item id")),
    request_body = UpdateItemRequest,
    responses(
        (status = 200, description = "Updated", body = AssessmentItem),
        (status = 409, description = "Content locked", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_item(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentItemId>,
    ValidJson(request): ValidJson<UpdateItemRequest>,
) -> ApiResult<Json<AssessmentItem>> {
    let item = state
        .assessments
        .update_item(
            &actor,
            id,
            ItemChanges {
                title: request.title,
                body: request.body,
                max_score: request.max_score,
                metadata: request.metadata.map(Into::into),
            },
        )
        .await?;
    Ok(Json(item.into()))
}

/// Delete an item; siblings renumber.
#[utoipa::path(
    delete, path = "/assessment-items/{id}", tag = "assessments",
    params(("id" = AssessmentItemId, Path, description = "Item id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 409, description = "Content locked", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_item(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentItemId>,
) -> ApiResult<StatusCode> {
    state.assessments.delete_item(&actor, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Reorder items; returns the full list in the new order.
#[utoipa::path(
    post, path = "/assessments/{id}/items/reorder", tag = "assessments",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    request_body = ReorderItemsRequest,
    responses(
        (status = 200, description = "Reordered", body = [AssessmentItem]),
        (status = 422, description = "Unknown item ids", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn reorder_items(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    ValidJson(request): ValidJson<ReorderItemsRequest>,
) -> ApiResult<Json<Vec<AssessmentItem>>> {
    let items = state
        .assessments
        .reorder_items(&actor, id, &request.items)
        .await?;
    Ok(Json(items.into_iter().map(Into::into).collect()))
}
