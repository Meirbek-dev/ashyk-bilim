use ab_core::id::{ActivityId, AssessmentId, AssessmentItemId, CourseId};
use ab_domain::assessments::service::{
    AssessmentChanges, CreateAssessment, ItemChanges, Readiness,
};
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;

use crate::dto::assessments::{
    Assessment, AssessmentDetail, AssessmentItem, AuditEvent, AuditQuery, CreateAssessmentRequest,
    CreateItemRequest, DuplicateRequest, LifecycleRequest, Policy, ReorderItemsRequest,
    UpdateAssessmentRequest, UpdateItemRequest,
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

/// Deep-copy as a new draft (policy + items; not access lists or
/// per-student overrides), appended to the same or a given chapter of the
/// same course.
#[utoipa::path(
    post, path = "/assessments/{id}/duplicate", tag = "assessments",
    params(("id" = AssessmentId, Path, description = "Source assessment id")),
    request_body = DuplicateRequest,
    responses(
        (status = 201, description = "The copy", body = AssessmentDetail),
        (status = 422, description = "Chapter outside the course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn duplicate_assessment(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    ValidJson(request): ValidJson<DuplicateRequest>,
) -> ApiResult<(StatusCode, Json<AssessmentDetail>)> {
    let detail = state
        .assessments
        .duplicate(&actor, id, request.title.as_deref(), request.chapter_id)
        .await?;
    Ok((StatusCode::CREATED, Json(detail.into())))
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

// ── Access lists ────────────────────────────────────────────────────────────

/// Who may take the assessment (authors only).
#[utoipa::path(
    get, path = "/assessments/{id}/access", tag = "assessments",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    responses((status = 200, description = "Access policy", body = crate::dto::assessments::AccessView)),
)]
pub async fn get_access(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Json<crate::dto::assessments::AccessView>> {
    Ok(Json(state.assessments.access(&actor, id).await?.into()))
}

/// Replace the access policy. Restricted lists are validated against the
/// course (users need course access, groups must be linked); switching to
/// all-course-learners wipes both lists.
#[utoipa::path(
    put, path = "/assessments/{id}/access", tag = "assessments",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    request_body = crate::dto::assessments::SetAccessRequest,
    responses(
        (status = 200, description = "Updated", body = crate::dto::assessments::AccessView),
        (status = 422, description = "User/group outside the course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn set_access(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    ValidJson(request): ValidJson<crate::dto::assessments::SetAccessRequest>,
) -> ApiResult<Json<crate::dto::assessments::AccessView>> {
    let view = state
        .assessments
        .set_access(
            &actor,
            id,
            request.mode,
            &request.user_ids,
            &request.usergroup_ids,
        )
        .await?;
    Ok(Json(view.into()))
}

// ── Per-student overrides ───────────────────────────────────────────────────

/// Every per-student override on the assessment.
#[utoipa::path(
    get, path = "/assessments/{id}/overrides", tag = "assessments",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    responses((status = 200, description = "Overrides", body = [crate::dto::assessments::StudentOverride])),
)]
pub async fn list_overrides(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Json<Vec<crate::dto::assessments::StudentOverride>>> {
    let rows = state.assessments.overrides(&actor, id).await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

/// Grant a student more attempts / a later due date / a late-penalty waiver.
#[utoipa::path(
    post, path = "/assessments/{id}/overrides/{user_id}", tag = "assessments",
    params(
        ("id" = AssessmentId, Path, description = "Assessment id"),
        ("user_id" = ab_core::id::UserId, Path, description = "Student"),
    ),
    request_body = crate::dto::assessments::OverrideRequest,
    responses(
        (status = 201, description = "Created", body = crate::dto::assessments::StudentOverride),
        (status = 409, description = "Already overridden", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Attempts outside 1..=10", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_override(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((id, user_id)): Path<(AssessmentId, ab_core::id::UserId)>,
    ValidJson(request): ValidJson<crate::dto::assessments::OverrideRequest>,
) -> ApiResult<(StatusCode, Json<crate::dto::assessments::StudentOverride>)> {
    let row = state
        .assessments
        .create_override(&actor, id, user_id, request.into())
        .await?;
    Ok((StatusCode::CREATED, Json(row.into())))
}

/// Replace a student's override.
#[utoipa::path(
    put, path = "/assessments/{id}/overrides/{user_id}", tag = "assessments",
    params(
        ("id" = AssessmentId, Path, description = "Assessment id"),
        ("user_id" = ab_core::id::UserId, Path, description = "Student"),
    ),
    request_body = crate::dto::assessments::OverrideRequest,
    responses((status = 200, description = "Updated", body = crate::dto::assessments::StudentOverride)),
)]
pub async fn update_override(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((id, user_id)): Path<(AssessmentId, ab_core::id::UserId)>,
    ValidJson(request): ValidJson<crate::dto::assessments::OverrideRequest>,
) -> ApiResult<Json<crate::dto::assessments::StudentOverride>> {
    let row = state
        .assessments
        .update_override(&actor, id, user_id, request.into())
        .await?;
    Ok(Json(row.into()))
}

/// Remove a student's override.
#[utoipa::path(
    delete, path = "/assessments/{id}/overrides/{user_id}", tag = "assessments",
    params(
        ("id" = AssessmentId, Path, description = "Assessment id"),
        ("user_id" = ab_core::id::UserId, Path, description = "Student"),
    ),
    responses((status = 204, description = "Deleted")),
)]
pub async fn delete_override(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((id, user_id)): Path<(AssessmentId, ab_core::id::UserId)>,
) -> ApiResult<StatusCode> {
    state
        .assessments
        .delete_override(&actor, id, user_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Student-facing ──────────────────────────────────────────────────────────

/// What the caller may do with this assessment right now.
///
/// The effective policy (overrides applied) and any reasons an attempt is
/// blocked. Requires course access, the allowlist when restricted, and
/// `assessment:submit:assigned` (authors preview freely).
#[utoipa::path(
    get, path = "/assessments/{id}/attempt-state", tag = "assessments",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    responses(
        (status = 200, description = "Attempt state", body = crate::dto::assessments::AttemptState),
        (status = 403, description = "No access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn attempt_state(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Json<crate::dto::assessments::AttemptState>> {
    Ok(Json(
        state.assessments.attempt_state(&actor, id).await?.into(),
    ))
}
