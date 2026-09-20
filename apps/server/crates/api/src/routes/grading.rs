//! Teacher grading.
//!
//! Review queue, stats, item analytics, CSV export, the grader's submission
//! view, grade save/publish/return under `If-Match`, grading history, bulk
//! release, deadline extensions, the course gradebook; plus the learner's
//! released item feedback.

use ab_core::id::{AssessmentId, BulkActionId, CourseId, SubmissionId};
use ab_core::{Error, FieldError};
use ab_domain::grading::bulk::DeadlineExtension;
use ab_domain::grading::teacher::{
    CsvLanguage, GradeInput, ItemFeedbackView, ItemGrade, ReviewFilter,
};
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};

use crate::dto::grading::{
    BulkAction, DeadlineExtensionRequest, GradeRequest, GradebookPage, GradebookQuery,
    GradingEntry, ItemAnalytics, PublishSummary, ReviewPage, ReviewQuery, Stats, TeacherSubmission,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, Path, Query, ValidJson, idempotent};
use crate::state::AppState;

const DEFAULT_REVIEW_PAGE: i64 = 25;
const DEFAULT_GRADEBOOK_PAGE: i64 = 200;

/// `If-Match` as the expected version; `None` when absent (the domain
/// requires it after its authz gate — UX-108), 422 when not an integer.
pub(crate) fn if_match(headers: &HeaderMap) -> ApiResult<Option<i64>> {
    let Some(raw) = headers.get(header::IF_MATCH) else {
        return Ok(None);
    };
    raw.to_str()
        .ok()
        .map(|s| s.trim().trim_matches('"'))
        .and_then(|s| s.parse::<i64>().ok())
        .map(Some)
        .ok_or_else(|| {
            Error::validation(vec![FieldError {
                field: "If-Match".into(),
                code: "invalid".into(),
                message: "If-Match must carry the version as an integer".into(),
            }])
            .into()
        })
}

/// Submitted work awaiting or holding a grade, newest first.
///
/// Needs `assessment:grade` on the course. `status=needs_grading` is the
/// pending queue. Keyset-paged: pass `next_cursor` back as `cursor`.
#[utoipa::path(
    get, path = "/assessments/{id}/submissions", tag = "grading",
    params(("id" = AssessmentId, Path, description = "Assessment id"), ReviewQuery),
    responses(
        (status = 200, description = "Review page", body = ReviewPage),
        (status = 403, description = "No grading access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn review_queue(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    Query(query): Query<ReviewQuery>,
) -> ApiResult<Json<ReviewPage>> {
    let page = state
        .grading
        .review_queue(
            &actor,
            id,
            ReviewFilter {
                status: query.status.map(Into::into),
                late_only: query.late_only,
                search: query.search.as_deref().filter(|s| !s.trim().is_empty()),
                cursor: query.cursor,
                limit: query.limit.unwrap_or(DEFAULT_REVIEW_PAGE),
            },
        )
        .await?;
    Ok(Json(page.into()))
}

/// Counts, average, pass rate and a ten-bucket score distribution.
#[utoipa::path(
    get, path = "/assessments/{id}/submissions/stats", tag = "grading",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    responses((status = 200, description = "Stats", body = Stats)),
)]
pub async fn stats(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Json<Stats>> {
    Ok(Json(state.grading.stats(&actor, id).await?.into()))
}

/// Per-item response counts, average score, correctness and discrimination.
#[utoipa::path(
    get, path = "/assessments/{id}/item-analytics", tag = "grading",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    responses((status = 200, description = "Per-item analytics", body = [ItemAnalytics])),
)]
pub async fn item_analytics(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Json<Vec<ItemAnalytics>>> {
    Ok(Json(state.grading.item_analytics(&actor, id).await?))
}

/// Every submitted attempt as CSV (one column per item).
///
/// The header and status words follow `Accept-Language` (`ru` default,
/// `kk`, `en`), like the gradebook CSV.
#[utoipa::path(
    get, path = "/assessments/{id}/submissions/export", tag = "grading",
    params(
        ("id" = AssessmentId, Path, description = "Assessment id"),
        ("Accept-Language" = Option<String>, Header, description = "ru (default), kk or en"),
    ),
    responses((status = 200, description = "CSV", content_type = "text/csv", body = String)),
)]
pub async fn export_csv(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let language = csv_language(&headers);
    let csv = state.grading.export_csv(&actor, id, language).await?;
    let mut response = (StatusCode::OK, csv).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/csv; charset=utf-8"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"grades-{id}.csv\""))
            .unwrap_or_else(|_| HeaderValue::from_static("attachment")),
    );
    Ok(response)
}

/// A submission with answers, breakdown, versions and feedback (graders).
#[utoipa::path(
    get, path = "/submissions/{id}/review", tag = "grading",
    params(("id" = SubmissionId, Path, description = "Submission id")),
    responses(
        (status = 200, description = "Submission", body = TeacherSubmission),
        (status = 403, description = "No grading access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn review_submission(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<SubmissionId>,
) -> ApiResult<Json<TeacherSubmission>> {
    Ok(Json(state.grading.submission(&actor, id).await?.into()))
}

/// Save, publish or return a grade.
///
/// Requires `If-Match: "<version>"`; a mismatch is 412 with
/// `{expected, actual}`. Item scores merge into the breakdown, the raw
/// score is given or computed from them, and the late penalty recorded at
/// submit applies on top. Each save appends to the grading history.
#[utoipa::path(
    patch, path = "/submissions/{id}/grade", tag = "grading",
    params(
        ("id" = SubmissionId, Path, description = "Submission id"),
        ("If-Match" = i64, Header, description = "Current version"),
    ),
    request_body = GradeRequest,
    responses(
        (status = 200, description = "Saved", body = TeacherSubmission),
        (status = 409, description = "Draft cannot be graded", body = Problem,
         content_type = "application/problem+json"),
        (status = 412, description = "Stale version", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Transition not allowed / bad score", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn save_grade(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<SubmissionId>,
    headers: HeaderMap,
    ValidJson(request): ValidJson<GradeRequest>,
) -> ApiResult<Json<TeacherSubmission>> {
    let expected_version = if_match(&headers)?;
    let saved = state
        .grading
        .save_grade(
            &actor,
            id,
            GradeInput {
                action: request.action.into(),
                final_score: request.final_score,
                feedback: request.feedback,
                audit_note: request.audit_note,
                item_grades: request
                    .item_grades
                    .into_iter()
                    .map(|g| ItemGrade {
                        item_id: g.item_id,
                        score: g.score,
                        feedback: g.feedback,
                    })
                    .collect(),
                expected_version,
            },
        )
        .await?;
    Ok(Json(saved.into()))
}

/// The append-only grading ledger of a submission, newest first.
#[utoipa::path(
    get, path = "/submissions/{id}/grading-history", tag = "grading",
    params(("id" = SubmissionId, Path, description = "Submission id")),
    responses((status = 200, description = "Entries", body = [GradingEntry])),
)]
pub async fn grading_history(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<SubmissionId>,
) -> ApiResult<Json<Vec<GradingEntry>>> {
    let entries = state.grading.grading_history(&actor, id).await?;
    Ok(Json(entries.into_iter().map(Into::into).collect()))
}

/// Released item feedback on one of the caller's own submissions.
#[utoipa::path(
    get, path = "/submissions/{id}/feedback", tag = "submissions",
    params(("id" = SubmissionId, Path, description = "Submission id")),
    responses((status = 200, description = "Feedback", body = [ItemFeedbackView])),
)]
pub async fn my_feedback(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<SubmissionId>,
) -> ApiResult<Json<Vec<ItemFeedbackView>>> {
    Ok(Json(state.grading.learner_feedback(&actor, id).await?))
}

/// Release every held grade of a batch-mode assessment.
#[utoipa::path(
    post, path = "/assessments/{id}/publish-grades", tag = "grading",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    responses((status = 200, description = "Release counts", body = PublishSummary)),
)]
pub async fn publish_grades(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Json<PublishSummary>> {
    Ok(Json(state.grading.publish_all(&actor, id).await?))
}

/// Extend the due date for selected learners.
///
/// Recorded as a bulk action and executed by the worker; poll
/// `GET /bulk-actions/{id}` for the outcome. Retry-safe with
/// `Idempotency-Key`: a replay returns the stored 202 (BUG-206).
#[utoipa::path(
    post, path = "/assessments/{id}/deadline-extensions", tag = "grading",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    request_body = DeadlineExtensionRequest,
    responses(
        (status = 202, description = "Queued", body = BulkAction),
        (status = 422, description = "Unknown learners or a past date", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn extend_deadline(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    let request = ValidJson::<DeadlineExtensionRequest>::parse(&body)?;
    idempotent(
        state.pool.clone(),
        actor.user_id,
        &format!("deadline-extension:{id}"),
        &headers,
        &body,
        move || async move {
            let action = state
                .grading
                .extend_deadline(
                    &actor,
                    id,
                    DeadlineExtension {
                        user_ids: &request.user_ids,
                        new_due_at: request.new_due_at_unix,
                        reason: request.reason.trim(),
                    },
                )
                .await?;
            Ok((StatusCode::ACCEPTED, BulkAction::from(action)))
        },
    )
    .await
}

/// A bulk action's status.
#[utoipa::path(
    get, path = "/bulk-actions/{id}", tag = "grading",
    params(("id" = BulkActionId, Path, description = "Bulk action id")),
    responses((status = 200, description = "Bulk action", body = BulkAction)),
)]
pub async fn get_bulk_action(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<BulkActionId>,
) -> ApiResult<Json<BulkAction>> {
    Ok(Json(state.grading.bulk_action(&actor, id).await?.into()))
}

/// The gradebook matrix as CSV (graders).
///
/// UTF-8 with BOM; the header and status words follow `Accept-Language`
/// (`ru` default, `kk`, `en`); one column per assessment and file
/// submission, a scored cell is its number.
#[utoipa::path(
    get, path = "/courses/{id}/gradebook/export", tag = "grading",
    params(
        ("id" = CourseId, Path, description = "Course id"),
        ("Accept-Language" = Option<String>, Header, description = "ru (default), kk or en"),
    ),
    responses(
        (status = 200, description = "CSV", content_type = "text/csv", body = String),
        (status = 403, description = "No grading access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn export_gradebook_csv(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let language = csv_language(&headers);
    let csv = state.grading.gradebook_csv(&actor, id, language).await?;
    let mut response = (StatusCode::OK, csv).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/csv; charset=utf-8"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"gradebook-{id}.csv\""))
            .unwrap_or_else(|_| HeaderValue::from_static("attachment")),
    );
    Ok(response)
}

/// Course gradebook: the grade-of-record attempt per (learner, activity).
///
/// The attempt learner progress scores (best-scored submission, latest
/// scored file attempt) — assessment submissions and file-submission
/// attempts alike.
#[utoipa::path(
    get, path = "/courses/{id}/gradebook", tag = "grading",
    params(("id" = CourseId, Path, description = "Course id"), GradebookQuery),
    responses((status = 200, description = "Gradebook page", body = GradebookPage)),
)]
pub async fn gradebook(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    Query(query): Query<GradebookQuery>,
) -> ApiResult<Json<GradebookPage>> {
    let page = state
        .grading
        .gradebook(
            &actor,
            id,
            query.cursor.as_deref(),
            query.limit.unwrap_or(DEFAULT_GRADEBOOK_PAGE),
        )
        .await?;
    Ok(Json(page.into()))
}

pub(crate) fn csv_language(headers: &HeaderMap) -> CsvLanguage {
    CsvLanguage::from_accept_language(
        headers
            .get(header::ACCEPT_LANGUAGE)
            .and_then(|v| v.to_str().ok()),
    )
}
