//! Learner attempts: start, draft autosave under an optimistic lock, submit
//! with `Idempotency-Key` replay, anti-cheat reports.
//!
//! Concurrency contract: `If-Match: "<draft_version>"` on draft saves
//! (required) and submits (optional); a mismatch is 409 with
//! `{expected, actual}`. Submits with an `Idempotency-Key` replay the
//! stored response for 24h; the same key with a different body is 422.

use ab_core::id::{AssessmentId, SubmissionId};
use ab_core::{Error, ErrorCode, FieldError};
use ab_domain::grading::submissions::ViolationState;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};

use crate::dto::submissions::{
    SaveDraftRequest, StudentSubmission, SubmitRequest, ViolationRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, Path, ValidJson, idempotent};
use crate::state::AppState;

/// `If-Match: "3"` or `If-Match: 3` → 3. Anything else is a validation error.
fn if_match(headers: &HeaderMap) -> ApiResult<Option<i64>> {
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
                message: "If-Match must carry the draft_version as an integer".into(),
            }])
            .into()
        })
}

fn require_if_match(headers: &HeaderMap) -> ApiResult<i64> {
    if_match(headers)?.ok_or_else(|| {
        Error::validation(vec![FieldError {
            field: "If-Match".into(),
            code: "required".into(),
            message: "If-Match with the current draft_version is required".into(),
        }])
        .into()
    })
}

/// A JSON response with an `ETag` carrying the draft version, so clients
/// can echo it as `If-Match` without reading the body.
fn with_etag(status: StatusCode, body: StudentSubmission) -> Response {
    let etag = HeaderValue::from_str(&format!("\"{}\"", body.draft_version))
        .unwrap_or_else(|_| HeaderValue::from_static("\"0\""));
    let mut response = (status, Json(body)).into_response();
    response.headers_mut().insert(header::ETAG, etag);
    response
}

/// Open a draft attempt (or return the one already open).
///
/// 201 when this call opened it, 200 when a draft already existed. Refused
/// (403) with the blocking reasons when the attempt state disallows it.
#[utoipa::path(
    post, path = "/assessments/{id}/submissions", tag = "submissions",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    responses(
        (status = 201, description = "Draft opened", body = StudentSubmission,
         headers(("ETag" = String, description = "Quoted draft_version"))),
        (status = 200, description = "Existing draft", body = StudentSubmission),
        (status = 403, description = "Attempt not allowed now", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn start_submission(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Response> {
    let started = state.submissions.start(&actor, id).await?;
    let status = if started.created {
        StatusCode::CREATED
    } else {
        StatusCode::OK
    };
    Ok(with_etag(status, started.submission.into()))
}

/// The caller's open draft for this assessment (404 when none).
#[utoipa::path(
    get, path = "/assessments/{id}/submissions/draft", tag = "submissions",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    responses(
        (status = 200, description = "Open draft", body = StudentSubmission,
         headers(("ETag" = String, description = "Quoted draft_version"))),
        (status = 404, description = "No open draft", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn current_draft(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Response> {
    let draft = state
        .submissions
        .current_draft(&actor, id)
        .await?
        .ok_or_else(|| Error::not_found("draft"))?;
    Ok(with_etag(StatusCode::OK, draft.into()))
}

/// Every attempt the caller made on this assessment, newest first.
#[utoipa::path(
    get, path = "/assessments/{id}/submissions/me", tag = "submissions",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    responses((status = 200, description = "Attempts", body = [StudentSubmission])),
)]
pub async fn my_submissions(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Json<Vec<StudentSubmission>>> {
    let rows = state.submissions.my_submissions(&actor, id).await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

/// One attempt the caller owns (404 for anyone else's).
#[utoipa::path(
    get, path = "/submissions/{id}", tag = "submissions",
    params(("id" = SubmissionId, Path, description = "Submission id")),
    responses(
        (status = 200, description = "Submission", body = StudentSubmission),
        (status = 404, description = "Unknown or not yours", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_submission(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<SubmissionId>,
) -> ApiResult<Json<StudentSubmission>> {
    Ok(Json(
        state.submissions.my_submission(&actor, id).await?.into(),
    ))
}

/// Merge answers into the open draft.
///
/// Requires `If-Match` with the draft_version you loaded; 409 carries
/// `{expected, actual}` when someone (another tab) saved in between.
/// Throttled to one save per 5 seconds per draft (429).
#[utoipa::path(
    patch, path = "/submissions/{id}/draft", tag = "submissions",
    params(
        ("id" = SubmissionId, Path, description = "Submission id"),
        ("If-Match" = i64, Header, description = "Current draft_version"),
    ),
    request_body = SaveDraftRequest,
    responses(
        (status = 200, description = "Saved", body = StudentSubmission,
         headers(("ETag" = String, description = "New quoted draft_version"))),
        (status = 403, description = "Time limit expired", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Stale draft_version or not a draft", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Unknown item / wrong answer kind", body = Problem,
         content_type = "application/problem+json"),
        (status = 429, description = "Saving too often", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn save_draft(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<SubmissionId>,
    headers: HeaderMap,
    ValidJson(request): ValidJson<SaveDraftRequest>,
) -> ApiResult<Response> {
    let expected = require_if_match(&headers)?;
    let saved = state
        .submissions
        .save_draft(&actor, id, request.answers, expected)
        .await?;
    Ok(with_etag(StatusCode::OK, saved.into()))
}

/// Report one anti-cheat event on the open draft.
///
/// Returns the server-side count and whether submitting now zeroes the
/// attempt (a detector is on and the threshold is reached).
#[utoipa::path(
    post, path = "/submissions/{id}/violations", tag = "submissions",
    params(("id" = SubmissionId, Path, description = "Submission id")),
    request_body = ViolationRequest,
    responses(
        (status = 200, description = "Recorded", body = ViolationState),
        (status = 409, description = "Not a draft", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn report_violation(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<SubmissionId>,
    ValidJson(request): ValidJson<ViolationRequest>,
) -> ApiResult<Json<ViolationState>> {
    Ok(Json(
        state
            .submissions
            .report_violation(&actor, id, &request.kind, request.detail.as_deref())
            .await?,
    ))
}

/// Submit the draft for grading.
///
/// Optionally applies a last answer patch. `If-Match` is honoured when
/// present. With an `Idempotency-Key`, a retry with the same body replays
/// the original response for 24h; the same key with a different body is
/// 422. Limited to 3 submits per 10 seconds per learner.
#[utoipa::path(
    post, path = "/submissions/{id}/submit", tag = "submissions",
    params(
        ("id" = SubmissionId, Path, description = "Submission id"),
        ("If-Match" = Option<i64>, Header, description = "Draft version guard (optional)"),
        ("Idempotency-Key" = Option<String>, Header, description = "Client retry token (optional)"),
    ),
    request_body = SubmitRequest,
    responses(
        (status = 200, description = "Graded or queued for review", body = StudentSubmission),
        (status = 403, description = "Attempt cap, time limit, or past due", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Already submitted or stale draft_version", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Idempotency-Key reused with a different body", body = Problem,
         content_type = "application/problem+json"),
        (status = 429, description = "Too many submits", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn submit_submission(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<SubmissionId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    let expected = if_match(&headers)?;
    let request: SubmitRequest = if body.is_empty() {
        SubmitRequest::default()
    } else {
        parse_and_validate(&body)?
    };
    idempotent(
        state.pool.clone(),
        actor.user_id,
        &format!("submit:{id}"),
        &headers,
        &body,
        move || async move {
            let submitted = state
                .submissions
                .submit(
                    &actor,
                    id,
                    request.answers,
                    request.violation_count,
                    expected,
                )
                .await?;
            Ok((StatusCode::OK, StudentSubmission::from(submitted)))
        },
    )
    .await
}

/// [`ValidJson`] plus the sign check on the raw body.
fn parse_and_validate(body: &[u8]) -> ApiResult<SubmitRequest> {
    let request = ValidJson::<SubmitRequest>::parse(body)?;
    if request.violation_count < 0 {
        return Err(Error::app(ErrorCode::ValidationFailed, "violation_count must be >= 0").into());
    }
    Ok(request)
}
