//! File-submission activities.
//!
//! Authoring (create, patch, publish), the learner's attempt (draft, files,
//! submit, history), grading (queue, attempt, grade, CSV) and signed file
//! downloads.

use ab_core::id::{ActivityId, FileAttemptFileId, FileAttemptId, FileSubmissionId};
use ab_core::{Error, FieldError};
use ab_domain::files::submissions::{FileGradeInput, FileRef, ReviewFilter};
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};

use crate::dto::file_submissions::{
    Attempt, ConfigPatch, CreateFileSubmissionRequest, DraftRequest, FileGradeAction,
    FileGradeRequest, FileRefRequest, FileReviewPage, FileReviewQuery, FileSubmission,
    SignedDownload, SubmitRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, ValidJson};
use crate::state::AppState;

const DEFAULT_REVIEW_PAGE: i64 = 25;

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
                message: "If-Match must carry the version as an integer".into(),
            }])
            .into()
        })
}

fn require_if_match(headers: &HeaderMap) -> ApiResult<i64> {
    if_match(headers)?.ok_or_else(|| {
        Error::validation(vec![FieldError {
            field: "If-Match".into(),
            code: "required".into(),
            message: "If-Match with the attempt's current version is required".into(),
        }])
        .into()
    })
}

fn refs(files: Vec<FileRefRequest>) -> Vec<FileRef> {
    files
        .into_iter()
        .map(|f| FileRef {
            upload_id: f.upload_id,
            display_name: f.display_name,
        })
        .collect()
}

/// Create a file-submission activity in a chapter (authors).
#[utoipa::path(
    post, path = "/file-submissions", tag = "file-submissions",
    request_body = CreateFileSubmissionRequest,
    responses(
        (status = 201, description = "Created (draft)", body = FileSubmission),
        (status = 403, description = "No authoring access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_file_submission(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ValidJson(request): ValidJson<CreateFileSubmissionRequest>,
) -> ApiResult<(StatusCode, Json<FileSubmission>)> {
    let created = state
        .file_submissions
        .create(
            &actor,
            request.chapter_id,
            &request.title,
            request.config.into(),
        )
        .await?;
    Ok((StatusCode::CREATED, Json(created.into())))
}

/// The activity with the caller's attempts (authors always; learners once
/// published).
#[utoipa::path(
    get, path = "/file-submissions/{id}", tag = "file-submissions",
    params(("id" = FileSubmissionId, Path, description = "File submission id")),
    responses((status = 200, description = "File submission", body = FileSubmission)),
)]
pub async fn get_file_submission(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
) -> ApiResult<Json<FileSubmission>> {
    Ok(Json(state.file_submissions.get(&actor, id).await?.into()))
}

/// The file submission behind an activity.
#[utoipa::path(
    get, path = "/activities/{id}/file-submission", tag = "file-submissions",
    params(("id" = ActivityId, Path, description = "Activity id")),
    responses((status = 200, description = "File submission", body = FileSubmission)),
)]
pub async fn get_activity_file_submission(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ActivityId>,
) -> ApiResult<Json<FileSubmission>> {
    Ok(Json(
        state
            .file_submissions
            .get_by_activity(&actor, id)
            .await?
            .into(),
    ))
}

/// Partial update of title and configuration (authors; archived = read-only).
#[utoipa::path(
    patch, path = "/file-submissions/{id}", tag = "file-submissions",
    params(("id" = FileSubmissionId, Path, description = "File submission id")),
    request_body = ConfigPatch,
    responses((status = 200, description = "Updated", body = FileSubmission)),
)]
pub async fn update_file_submission(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
    ValidJson(request): ValidJson<ConfigPatch>,
) -> ApiResult<Json<FileSubmission>> {
    Ok(Json(
        state
            .file_submissions
            .update(&actor, id, request.into())
            .await?
            .into(),
    ))
}

/// Publish (title and instructions required); the activity goes live.
#[utoipa::path(
    post, path = "/file-submissions/{id}/publish", tag = "file-submissions",
    params(("id" = FileSubmissionId, Path, description = "File submission id")),
    responses(
        (status = 200, description = "Published", body = FileSubmission),
        (status = 422, description = "Missing title or instructions", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn publish_file_submission(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
) -> ApiResult<Json<FileSubmission>> {
    Ok(Json(
        state.file_submissions.publish(&actor, id).await?.into(),
    ))
}

/// The caller's open attempt (draft or returned), 404 when none.
#[utoipa::path(
    get, path = "/file-submissions/{id}/draft", tag = "file-submissions",
    params(("id" = FileSubmissionId, Path, description = "File submission id")),
    responses(
        (status = 200, description = "Open attempt", body = Attempt),
        (status = 404, description = "No open attempt", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_draft(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
) -> ApiResult<Json<Attempt>> {
    let draft = state
        .file_submissions
        .draft(&actor, id)
        .await?
        .ok_or_else(|| Error::not_found("draft"))?;
    Ok(Json(draft.into()))
}

/// Open a draft attempt (201) or return the open one (200).
#[utoipa::path(
    post, path = "/file-submissions/{id}/draft", tag = "file-submissions",
    params(("id" = FileSubmissionId, Path, description = "File submission id")),
    responses(
        (status = 201, description = "Draft opened", body = Attempt),
        (status = 200, description = "Existing open attempt", body = Attempt),
        (status = 409, description = "Not published or attempt cap reached", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn start_draft(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
) -> ApiResult<(StatusCode, Json<Attempt>)> {
    let (attempt, created) = state.file_submissions.start(&actor, id).await?;
    let status = if created {
        StatusCode::CREATED
    } else {
        StatusCode::OK
    };
    Ok((status, Json(attempt.into())))
}

/// Replace the draft's attached files (opens a draft when there is none).
///
/// Uploads must be the caller's own finalized `file-submission` uploads.
/// `If-Match` is optional; a stale version is 412.
#[utoipa::path(
    patch, path = "/file-submissions/{id}/draft", tag = "file-submissions",
    params(
        ("id" = FileSubmissionId, Path, description = "File submission id"),
        ("If-Match" = Option<i64>, Header, description = "Attempt version (optional)"),
    ),
    request_body = DraftRequest,
    responses(
        (status = 200, description = "Saved", body = Attempt),
        (status = 412, description = "Stale version", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Too many / duplicate / not-ready / disallowed files",
         body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn save_draft(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
    headers: HeaderMap,
    ValidJson(request): ValidJson<DraftRequest>,
) -> ApiResult<Json<Attempt>> {
    let expected = if_match(&headers)?;
    let saved = state
        .file_submissions
        .save_draft(&actor, id, &refs(request.files), expected)
        .await?;
    Ok(Json(saved.into()))
}

/// Submit the open attempt (optionally replacing files first).
///
/// At least one file is required; late work is refused when the activity
/// does not allow it and penalised by the late policy otherwise.
#[utoipa::path(
    post, path = "/file-submissions/{id}/submit", tag = "file-submissions",
    params(
        ("id" = FileSubmissionId, Path, description = "File submission id"),
        ("If-Match" = Option<i64>, Header, description = "Attempt version (optional)"),
    ),
    request_body = SubmitRequest,
    responses(
        (status = 200, description = "Submitted", body = Attempt),
        (status = 409, description = "Not published, cap reached, or late work closed",
         body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "No files", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn submit(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
    headers: HeaderMap,
    ValidJson(request): ValidJson<SubmitRequest>,
) -> ApiResult<Json<Attempt>> {
    let expected = if_match(&headers)?;
    let files = request.files.map(refs);
    let submitted = state
        .file_submissions
        .submit(&actor, id, files.as_deref(), expected)
        .await?;
    Ok(Json(submitted.into()))
}

/// Every attempt the caller made, newest first.
#[utoipa::path(
    get, path = "/file-submissions/{id}/me", tag = "file-submissions",
    params(("id" = FileSubmissionId, Path, description = "File submission id")),
    responses((status = 200, description = "Attempts", body = [Attempt])),
)]
pub async fn my_attempts(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
) -> ApiResult<Json<Vec<Attempt>>> {
    let attempts = state.file_submissions.my_attempts(&actor, id).await?;
    Ok(Json(attempts.into_iter().map(Into::into).collect()))
}

/// Submitted attempts for grading, newest first (keyset).
#[utoipa::path(
    get, path = "/file-submissions/{id}/submissions", tag = "file-submissions",
    params(("id" = FileSubmissionId, Path, description = "File submission id"), FileReviewQuery),
    responses((status = 200, description = "Review page", body = FileReviewPage)),
)]
pub async fn review_queue(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
    Query(query): Query<FileReviewQuery>,
) -> ApiResult<Json<FileReviewPage>> {
    let page = state
        .file_submissions
        .review_queue(
            &actor,
            id,
            ReviewFilter {
                status: query.status,
                search: query.search.as_deref().filter(|s| !s.trim().is_empty()),
                cursor: query.cursor,
                limit: query.limit.unwrap_or(DEFAULT_REVIEW_PAGE),
            },
        )
        .await?;
    Ok(Json(page.into()))
}

/// Every attempt as CSV (graders).
#[utoipa::path(
    get, path = "/file-submissions/{id}/submissions/export", tag = "file-submissions",
    params(("id" = FileSubmissionId, Path, description = "File submission id")),
    responses((status = 200, description = "CSV", content_type = "text/csv", body = String)),
)]
pub async fn export_csv(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
) -> ApiResult<Response> {
    let csv = state.file_submissions.export_csv(&actor, id).await?;
    let mut response = (StatusCode::OK, csv).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/csv; charset=utf-8"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!(
            "attachment; filename=\"file-submissions-{id}.csv\""
        ))
        .unwrap_or_else(|_| HeaderValue::from_static("attachment")),
    );
    Ok(response)
}

/// One attempt: its owner (grade redacted until released) or a grader.
#[utoipa::path(
    get, path = "/file-submission-attempts/{id}", tag = "file-submissions",
    params(("id" = FileAttemptId, Path, description = "Attempt id")),
    responses((status = 200, description = "Attempt", body = Attempt)),
)]
pub async fn get_attempt(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileAttemptId>,
) -> ApiResult<Json<Attempt>> {
    Ok(Json(
        state.file_submissions.attempt(&actor, id).await?.into(),
    ))
}

/// Save, publish or return a grade (graders). Requires `If-Match`.
#[utoipa::path(
    patch, path = "/file-submission-attempts/{id}/grade", tag = "file-submissions",
    params(
        ("id" = FileAttemptId, Path, description = "Attempt id"),
        ("If-Match" = i64, Header, description = "Current version"),
    ),
    request_body = FileGradeRequest,
    responses(
        (status = 200, description = "Graded", body = Attempt),
        (status = 412, description = "Stale version", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Score required", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn grade_attempt(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileAttemptId>,
    headers: HeaderMap,
    ValidJson(request): ValidJson<FileGradeRequest>,
) -> ApiResult<Json<Attempt>> {
    let expected_version = require_if_match(&headers)?;
    let graded = state
        .file_submissions
        .grade(
            &actor,
            id,
            FileGradeInput {
                action: match request.action {
                    FileGradeAction::Save => ab_domain::files::submissions::FileGradeAction::Save,
                    FileGradeAction::Publish => {
                        ab_domain::files::submissions::FileGradeAction::Publish
                    }
                    FileGradeAction::Return => {
                        ab_domain::files::submissions::FileGradeAction::Return
                    }
                },
                final_score: request.final_score,
                feedback: request.feedback,
                rubric_scores: request.rubric_scores,
                expected_version,
            },
        )
        .await?;
    Ok(Json(graded.into()))
}

/// A short-lived download URL for an attached file (owner or grader).
#[utoipa::path(
    get, path = "/file-submission-files/{id}/url", tag = "file-submissions",
    params(("id" = FileAttemptFileId, Path, description = "Attached file id")),
    responses((status = 200, description = "Signed URL (1h)", body = SignedDownload)),
)]
pub async fn file_url(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileAttemptFileId>,
) -> ApiResult<Json<SignedDownload>> {
    let signed = state.file_submissions.download(&actor, id).await?;
    Ok(Json(SignedDownload {
        file_id: id,
        url: signed.url,
        expires_at_unix: signed.expires_at,
        filename: signed.filename,
        content_type: signed.content_type,
    }))
}
