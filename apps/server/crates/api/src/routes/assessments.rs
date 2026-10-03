use ab_core::id::{ActivityId, AssessmentId, AssessmentItemId, CourseId};
use ab_domain::assessments::service::{
    AssessmentChanges, CreateAssessment, ItemChanges, Readiness,
};
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};

use crate::detach::detached;
use crate::dto::assessments::{
    Assessment, AssessmentDetail, AssessmentItem, AuditEvent, AuditQuery, CreateAssessmentRequest,
    CreateItemRequest, DuplicateRequest, LifecycleRequest, Policy, ReorderItemsRequest,
    UpdateAssessmentRequest, UpdateItemRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{
    CurrentActor, Path, Query, ValidJson, idempotent, require_if_match, wants_representation,
    with_etag,
};
use crate::routes::curriculum::if_match;
use crate::state::AppState;
use ab_db::versions::Versioned;

/// The access view with an `ETag` carrying its version (UX-154), echoed
/// back as `If-Match` by the access tab.
fn access_with_etag(view: ab_domain::assessments::access::AccessView) -> Response {
    let etag = HeaderValue::from_str(&format!("\"{}\"", view.version))
        .unwrap_or_else(|_| HeaderValue::from_static("\"0\""));
    let mut response = Json(crate::dto::assessments::AccessView::from(view)).into_response();
    response.headers_mut().insert(header::ETAG, etag);
    response
}

/// Create an assessment with its backing activity (appended to the chapter).
///
/// Requires `assessment:author` on the course (platform scope or course
/// creator with own scope). Code challenges start with one default code
/// item.
#[utoipa::path(
    post, path = "/assessments", tag = "assessments",
    params(("Idempotency-Key" = Option<String>, Header, description = "Retry-safe replay key")),
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
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    state.assessments.require_some_authoring(&actor).await?;
    let request = ValidJson::<CreateAssessmentRequest>::parse(&body)?;
    idempotent(
        state.pool.clone(),
        actor.user_id,
        "assessment",
        &headers,
        &body,
        move || async move {
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
            Ok((
                StatusCode::CREATED,
                detail_view(&state, &actor, detail).await?,
            ))
        },
    )
    .await
}

/// The detail with its `version` as `ETag`.
fn detail_with_etag(detail: AssessmentDetail) -> Response {
    with_etag(StatusCode::OK, detail.assessment.version, detail)
}

/// Full assessment with items and policy. Authors always; learners only
/// once published (404 otherwise - no existence leak).
#[utoipa::path(
    get, path = "/assessments/{assessment_id}", tag = "assessments",
    params(("assessment_id" = AssessmentId, Path, description = "Assessment id")),
    responses(
        (status = 200, description = "Assessment", body = AssessmentDetail,
         headers(("ETag" = String, description = "Quoted `version`"))),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_assessment(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Response> {
    let detail = state.assessments.get(&actor, id).await?;
    Ok(detail_with_etag(detail_view(&state, &actor, detail).await?))
}

/// The assessment behind an activity (same access rules as by id).
#[utoipa::path(
    get, path = "/activities/{activity_id}/assessment", tag = "assessments",
    params(("activity_id" = ActivityId, Path, description = "Activity id")),
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
    let detail = state.assessments.get_by_activity(&actor, id).await?;
    Ok(Json(detail_view(&state, &actor, detail).await?))
}

/// Course overview: authors see every assessment, others only published.
#[utoipa::path(
    get, path = "/courses/{course_id}/assessments", tag = "assessments",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses((status = 200, description = "Assessments", body = [Assessment])),
)]
pub async fn list_course_assessments(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<Vec<Assessment>>> {
    let rows = state.assessments.list_for_course(&actor, id).await?;
    let actions = state.assessments.allowed_actions_for(&actor, id).await?;
    let mut out = Vec::with_capacity(rows.len());
    for a in rows {
        let lock = ab_domain::assessments::service::edit_lock(&state.pool, &a).await?;
        out.push(Assessment::new(a, actions.clone(), lock));
    }
    Ok(Json(out))
}

/// Title/description/weight/grading type. Archived assessments are
/// read-only; a published one with submissions must be unpublished first.
#[utoipa::path(
    patch, path = "/assessments/{assessment_id}", tag = "assessments",
    params(
        ("assessment_id" = AssessmentId, Path, description = "Assessment id"),
        ("If-Match" = Option<i32>, Header, description = "Assessment `version`; stale → 412 (without it nothing changes)"),
    ),
    request_body = UpdateAssessmentRequest,
    responses(
        (status = 200, description = "Updated", body = AssessmentDetail),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Read-only in this state", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_assessment(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    state.assessments.require_authorable(&actor, id).await?;
    let request = ValidJson::<UpdateAssessmentRequest>::parse(&body)?;
    require_if_match(&state.pool, Versioned::Assessment(id), &headers).await?;
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
    Ok(detail_with_etag(detail_view(&state, &actor, detail).await?))
}

/// Replace the whole policy block (bumps `policy_version`).
#[utoipa::path(
    put, path = "/assessments/{assessment_id}/policy", tag = "assessments",
    params(
        ("assessment_id" = AssessmentId, Path, description = "Assessment id"),
        ("If-Match" = Option<i32>, Header, description = "Assessment `version`; stale → 412 (without it nothing changes)"),
    ),
    request_body = Policy,
    responses(
        (status = 200, description = "Updated", body = AssessmentDetail),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Out of range", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn set_policy(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    state.assessments.require_authorable(&actor, id).await?;
    let request = ValidJson::<Policy>::parse(&body)?;
    require_if_match(&state.pool, Versioned::Assessment(id), &headers).await?;
    // Detached (BUG-313): the post-commit lateness settle outlives a hang-up.
    detached(async move {
        let detail = state
            .assessments
            .set_policy(&actor, id, request.into())
            .await?;
        Ok(detail_with_etag(detail_view(&state, &actor, detail).await?))
    })
    .await
}

/// Lifecycle transition.
///
/// Allowed: draft→scheduled/published/archived,
/// scheduled→draft/published/archived, published→draft/archived,
/// archived→draft. Scheduling and publishing require readiness (422 with
/// the issues as field errors); scheduling needs a future time.
#[utoipa::path(
    post, path = "/assessments/{assessment_id}/lifecycle", tag = "assessments",
    params(
        ("assessment_id" = AssessmentId, Path, description = "Assessment id"),
        ("If-Match" = Option<i32>, Header, description = "Assessment `version`; stale → 412 (without it nothing changes)"),
    ),
    request_body = LifecycleRequest,
    responses(
        (status = 200, description = "Transitioned", body = AssessmentDetail),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
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
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    state.assessments.require_publishable(&actor, id).await?;
    let request = ValidJson::<LifecycleRequest>::parse(&body)?;
    require_if_match(&state.pool, Versioned::Assessment(id), &headers).await?;
    // BUG-232: the projection and audit row after the commit must not die
    // with the socket.
    detached(async move {
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
        Ok(detail_with_etag(detail_view(&state, &actor, detail).await?))
    })
    .await
}

/// Deep-copy as a new draft (policy + items; not access lists or
/// per-student overrides), appended to the same or a given chapter of the
/// same course.
#[utoipa::path(
    post, path = "/assessments/{assessment_id}/duplicate", tag = "assessments",
    params(("assessment_id" = AssessmentId, Path, description = "Source assessment id")),
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
    body: axum::body::Bytes,
) -> ApiResult<(StatusCode, Json<AssessmentDetail>)> {
    // UX-311: permission before the body.
    state.assessments.require_authorable(&actor, id).await?;
    let request = ValidJson::<DuplicateRequest>::parse(&body)?;
    let detail = state
        .assessments
        .duplicate(&actor, id, request.title.as_deref(), request.chapter_id)
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(detail_view(&state, &actor, detail).await?),
    ))
}

/// What blocks publication right now.
#[utoipa::path(
    get, path = "/assessments/{assessment_id}/readiness", tag = "assessments",
    params(("assessment_id" = AssessmentId, Path, description = "Assessment id")),
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
    get, path = "/assessments/{assessment_id}/audit", tag = "assessments",
    params(
        ("assessment_id" = AssessmentId, Path, description = "Assessment id"),
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
    post, path = "/assessments/{assessment_id}/items", tag = "assessments",
    params(
        ("assessment_id" = AssessmentId, Path, description = "Assessment id"),
        ("If-Match" = Option<i32>, Header, description = "Assessment `version`; stale → 412 (without it nothing changes)"),
    ),
    request_body = CreateItemRequest,
    responses(
        (status = 201, description = "Created (appended last)", body = AssessmentItem,
         headers(("ETag" = String, description = "Quoted assessment `version` after the write"))),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Kind unsupported / limit / bad body", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_item(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    state.assessments.require_authorable(&actor, id).await?;
    let request = ValidJson::<CreateItemRequest>::parse(&body)?;
    require_if_match(&state.pool, Versioned::Assessment(id), &headers).await?;
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
    Ok(item_reply(&state, StatusCode::CREATED, id, item).await?)
}

/// Partial item update. Body/max-score changes are refused (409) once a
/// published assessment has graded submissions.
#[utoipa::path(
    patch, path = "/assessment-items/{item_id}", tag = "assessments",
    params(
        ("item_id" = AssessmentItemId, Path, description = "Item id"),
        ("If-Match" = Option<i32>, Header, description = "Assessment `version`; stale → 412 (without it nothing changes)"),
    ),
    request_body = UpdateItemRequest,
    responses(
        (status = 200, description = "Updated", body = AssessmentItem,
         headers(("ETag" = String, description = "Quoted assessment `version` after the write"))),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Content locked", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_item(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentItemId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    let assessment_id = state
        .assessments
        .require_authorable_item(&actor, id)
        .await?;
    let request = ValidJson::<UpdateItemRequest>::parse(&body)?;
    require_if_match(&state.pool, Versioned::Assessment(assessment_id), &headers).await?;
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
    Ok(item_reply(&state, StatusCode::OK, assessment_id, item).await?)
}

/// Delete an item; siblings renumber.
#[utoipa::path(
    delete, path = "/assessment-items/{item_id}", tag = "assessments",
    params(
        ("item_id" = AssessmentItemId, Path, description = "Item id"),
        ("If-Match" = Option<i32>, Header, description = "Assessment `version`; stale → 412 (without it nothing changes)"),
        ("Prefer" = Option<String>, Header, description = "`return=representation`: answer 200 with the assessment after the delete instead of 204"),
    ),
    responses(
        (status = 204, description = "Deleted", headers(("ETag" = String, description = "Quoted assessment `version` after the write"))),
        (status = 200, description = "Deleted; the assessment (with `Prefer: return=representation`)", body = AssessmentDetail,
         headers(("ETag" = String, description = "Quoted assessment `version` after the write"))),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Content locked, or the last item of a live assessment", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_item(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentItemId>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let assessment_id = state
        .assessments
        .require_authorable_item(&actor, id)
        .await?;
    require_if_match(&state.pool, Versioned::Assessment(assessment_id), &headers).await?;
    state.assessments.delete_item(&actor, id).await?;
    if wants_representation(&headers) {
        let detail = state.assessments.get(&actor, assessment_id).await?;
        return Ok(detail_with_etag(detail_view(&state, &actor, detail).await?));
    }
    let version = current_assessment_version(&state, assessment_id).await?;
    let mut response = StatusCode::NO_CONTENT.into_response();
    if let Ok(etag) = HeaderValue::from_str(&format!("\"{version}\"")) {
        response.headers_mut().insert(header::ETAG, etag);
    }
    Ok(response)
}

/// Reorder items; returns the full list in the new order.
#[utoipa::path(
    post, path = "/assessments/{assessment_id}/items/reorder", tag = "assessments",
    params(
        ("assessment_id" = AssessmentId, Path, description = "Assessment id"),
        ("If-Match" = Option<i32>, Header, description = "Assessment `version`; stale → 412 (without it nothing changes)"),
    ),
    request_body = ReorderItemsRequest,
    responses(
        (status = 200, description = "Reordered (order is presentation: the version stays)", body = [AssessmentItem]),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Unknown item ids", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn reorder_items(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Json<Vec<AssessmentItem>>> {
    // UX-311: permission before the body.
    state.assessments.require_authorable(&actor, id).await?;
    let request = ValidJson::<ReorderItemsRequest>::parse(&body)?;
    require_if_match(&state.pool, Versioned::Assessment(id), &headers).await?;
    let items = state
        .assessments
        .reorder_items(&actor, id, &request.items)
        .await?;
    let version = current_assessment_version(&state, id).await?;
    Ok(Json(
        items
            .into_iter()
            .map(|i| AssessmentItem::new(i, version))
            .collect(),
    ))
}

// ── Access lists ────────────────────────────────────────────────────────────

/// Who may take the assessment (authors only).
#[utoipa::path(
    get, path = "/assessments/{assessment_id}/access", tag = "assessments",
    params(("assessment_id" = AssessmentId, Path, description = "Assessment id")),
    responses((status = 200, description = "Access policy", body = crate::dto::assessments::AccessView,
               headers(("ETag" = String, description = "Quoted version")))),
)]
pub async fn get_access(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Response> {
    Ok(access_with_etag(
        state.assessments.access(&actor, id).await?,
    ))
}

/// Replace the access policy. Restricted lists are validated against the
/// course (users need course access, groups must be linked); switching to
/// all-course-learners wipes both lists.
///
/// With `If-Match: "<version>"` (the `ETag` of the last read) a stale tab
/// is 412 `precondition-failed` with `details {expected, actual}` instead
/// of a silent overwrite (UX-154).
#[utoipa::path(
    put, path = "/assessments/{assessment_id}/access", tag = "assessments",
    params(
        ("assessment_id" = AssessmentId, Path, description = "Assessment id"),
        ("If-Match" = Option<i32>, Header, description = "Version from the last read's ETag"),
    ),
    request_body = crate::dto::assessments::SetAccessRequest,
    responses(
        (status = 200, description = "Updated", body = crate::dto::assessments::AccessView,
         headers(("ETag" = String, description = "Quoted new version"))),
        (status = 412, description = "Stale version", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "User/group outside the course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn set_access(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    state.assessments.require_authorable(&actor, id).await?;
    let request = ValidJson::<crate::dto::assessments::SetAccessRequest>::parse(&body)?;
    let expected_version = if_match(&headers)?;
    // BUG-322: the re-aggregation after the commit must outlive the socket.
    let view = detached(async move {
        Ok(state
            .assessments
            .set_access(
                &actor,
                id,
                request.mode,
                &request.user_ids,
                &request.usergroup_ids,
                expected_version,
            )
            .await?)
    })
    .await?;
    Ok(access_with_etag(view))
}

// ── Per-student overrides ───────────────────────────────────────────────────

/// Every per-student override on the assessment.
#[utoipa::path(
    get, path = "/assessments/{assessment_id}/overrides", tag = "assessments",
    params(("assessment_id" = AssessmentId, Path, description = "Assessment id")),
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
    post, path = "/assessments/{assessment_id}/overrides/{user_id}", tag = "assessments",
    params(
        ("assessment_id" = AssessmentId, Path, description = "Assessment id"),
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
    body: axum::body::Bytes,
) -> ApiResult<(StatusCode, Json<crate::dto::assessments::StudentOverride>)> {
    // UX-311: permission before the body.
    state.assessments.require_authorable(&actor, id).await?;
    let request = ValidJson::<crate::dto::assessments::OverrideRequest>::parse(&body)?;
    // Detached (BUG-313): the settle outlives a hang-up.
    detached(async move {
        let row = state
            .assessments
            .create_override(&actor, id, user_id, request.into())
            .await?;
        Ok((StatusCode::CREATED, Json(row.into())))
    })
    .await
}

/// Replace a student's override.
#[utoipa::path(
    put, path = "/assessments/{assessment_id}/overrides/{user_id}", tag = "assessments",
    params(
        ("assessment_id" = AssessmentId, Path, description = "Assessment id"),
        ("user_id" = ab_core::id::UserId, Path, description = "Student"),
    ),
    request_body = crate::dto::assessments::OverrideRequest,
    responses((status = 200, description = "Updated", body = crate::dto::assessments::StudentOverride)),
)]
pub async fn update_override(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((id, user_id)): Path<(AssessmentId, ab_core::id::UserId)>,
    body: axum::body::Bytes,
) -> ApiResult<Json<crate::dto::assessments::StudentOverride>> {
    // UX-311: permission before the body.
    state.assessments.require_authorable(&actor, id).await?;
    let request = ValidJson::<crate::dto::assessments::OverrideRequest>::parse(&body)?;
    // Detached (BUG-313): the settle outlives a hang-up.
    detached(async move {
        let row = state
            .assessments
            .update_override(&actor, id, user_id, request.into())
            .await?;
        Ok(Json(row.into()))
    })
    .await
}

/// Remove a student's override.
#[utoipa::path(
    delete, path = "/assessments/{assessment_id}/overrides/{user_id}", tag = "assessments",
    params(
        ("assessment_id" = AssessmentId, Path, description = "Assessment id"),
        ("user_id" = ab_core::id::UserId, Path, description = "Student"),
    ),
    responses((status = 204, description = "Deleted")),
)]
pub async fn delete_override(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((id, user_id)): Path<(AssessmentId, ab_core::id::UserId)>,
) -> ApiResult<StatusCode> {
    // Detached (BUG-313): the settle outlives a hang-up.
    detached(async move {
        state
            .assessments
            .delete_override(&actor, id, user_id)
            .await?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
}

// ── Student-facing ──────────────────────────────────────────────────────────

/// What the caller may do with this assessment right now.
///
/// The effective policy (overrides applied) and any reasons an attempt is
/// blocked. Requires course access and `assessment:submit:assigned`
/// (authors preview freely); off a restricted access list it answers with
/// `ACCESS_RESTRICTED` (UX-227) - starting and submitting still 403.
#[utoipa::path(
    get, path = "/assessments/{assessment_id}/attempt-state", tag = "assessments",
    params(("assessment_id" = AssessmentId, Path, description = "Assessment id")),
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
        state.assessments.reading_state(&actor, id).await?.into(),
    ))
}

/// The detail with the caller's `allowed_actions` (one course read).
async fn detail_view(
    state: &AppState,
    actor: &ab_domain::identity::Actor,
    detail: ab_domain::assessments::service::AssessmentDetail,
) -> ab_core::Result<AssessmentDetail> {
    let actions = state
        .assessments
        .allowed_actions_for(actor, detail.assessment.course_id)
        .await?;
    let lock = ab_domain::assessments::service::edit_lock(&state.pool, &detail.assessment).await?;
    Ok(AssessmentDetail::new(detail, actions, lock))
}

/// An item write's reply: the item with the assessment's version after the
/// write, also as `ETag`.
async fn item_reply(
    state: &AppState,
    status: StatusCode,
    assessment_id: AssessmentId,
    item: ab_domain::assessments::service::Item,
) -> ab_core::Result<Response> {
    let version = current_assessment_version(state, assessment_id).await?;
    Ok(with_etag(
        status,
        version,
        AssessmentItem::new(item, version),
    ))
}

async fn current_assessment_version(state: &AppState, id: AssessmentId) -> ab_core::Result<i32> {
    ab_db::versions::current_version(&state.pool, Versioned::Assessment(id))
        .await?
        .ok_or_else(|| ab_core::Error::not_found("assessment"))
}
