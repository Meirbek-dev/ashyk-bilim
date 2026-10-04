//! File-submission activities.
//!
//! Authoring (create, patch, publish), the learner's attempt (draft, files,
//! submit, history), grading (queue, attempt, grade, CSV) and signed file
//! downloads.

use ab_core::Error;
use ab_core::id::{ActivityId, FileAttemptFileId, FileAttemptId, FileSubmissionId};
use ab_domain::files::submissions::{FileGradeInput, FileRef, ReviewFilter};
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};

use crate::detach::detached;
use crate::dto::file_submissions::{
    Attempt, BulkGradeSummary, ConfigPatch, CreateFileSubmissionRequest, Disposition, DraftRequest,
    FileGradeAction, FileGradeRequest, FileGradingEntry, FileRefRequest, FileReviewPage,
    FileReviewQuery, FileReviewStats, FileReviewStatsQuery, FileSubmission, FileUrlQuery,
    ReturnAttemptsRequest, SignedDownload, SubmitRequest,
};
use crate::dto::grading::{DeadlineExtensionRequest, SortOrder};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, Path, Query, ValidJson, idempotent, require_if_match};
use crate::routes::grading::{csv_language, if_match};
use crate::state::AppState;
use ab_db::versions::Versioned;

const DEFAULT_REVIEW_PAGE: i64 = 25;

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
    body: axum::body::Bytes,
) -> ApiResult<(StatusCode, Json<FileSubmission>)> {
    // UX-311: permission before the body.
    state.assessments.require_some_authoring(&actor).await?;
    let request = ValidJson::<CreateFileSubmissionRequest>::parse(&body)?;
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
    get, path = "/file-submissions/{file_submission_id}", tag = "file-submissions",
    params(("file_submission_id" = FileSubmissionId, Path, description = "File submission id")),
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
    get, path = "/activities/{activity_id}/file-submission", tag = "file-submissions",
    params(("activity_id" = ActivityId, Path, description = "Activity id")),
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
    patch, path = "/file-submissions/{file_submission_id}", tag = "file-submissions",
    params(
        ("file_submission_id" = FileSubmissionId, Path, description = "File submission id"),
        ("If-Match" = Option<i32>, Header, description = "Row `version`; stale -> 412"),
    ),
    request_body = ConfigPatch,
    responses(
        (status = 200, description = "Updated", body = FileSubmission),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
    ),
)]
pub async fn update_file_submission(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Json<FileSubmission>> {
    // UX-311: permission before the body.
    state
        .file_submissions
        .require_authorable(&actor, id)
        .await?;
    let request = ValidJson::<ConfigPatch>::parse(&body)?;
    require_if_match(&state.pool, Versioned::FileSubmission(id), &headers).await?;
    // BUG-322: the lateness re-price after the commit must outlive the socket.
    detached(async move {
        Ok(Json(
            state
                .file_submissions
                .update(&actor, id, request.into())
                .await?
                .into(),
        ))
    })
    .await
}

/// Publish (title and instructions required); the activity goes live.
#[utoipa::path(
    post, path = "/file-submissions/{file_submission_id}/publish", tag = "file-submissions",
    params(("file_submission_id" = FileSubmissionId, Path, description = "File submission id")),
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
    // BUG-232: the projection after the commit must not die with the socket.
    detached(async move {
        Ok(Json(
            state.file_submissions.publish(&actor, id).await?.into(),
        ))
    })
    .await
}

/// Take a published task back to draft (authors): the activity leaves the
/// learners' view; hand-ins stay, new ones wait until it is published again.
#[utoipa::path(
    post, path = "/file-submissions/{file_submission_id}/unpublish", tag = "file-submissions",
    params(("file_submission_id" = FileSubmissionId, Path, description = "File submission id")),
    responses(
        (status = 200, description = "Back to draft", body = FileSubmission),
        (status = 403, description = "Not an author", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Not published, or the course is archived", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn unpublish_file_submission(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
) -> ApiResult<Json<FileSubmission>> {
    // BUG-232: the projection after the commit must not die with the socket.
    detached(async move {
        Ok(Json(
            state.file_submissions.unpublish(&actor, id).await?.into(),
        ))
    })
    .await
}

/// The caller's open attempt (draft or returned), 404 when none.
#[utoipa::path(
    get, path = "/file-submissions/{file_submission_id}/draft", tag = "file-submissions",
    params(("file_submission_id" = FileSubmissionId, Path, description = "File submission id")),
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
    post, path = "/file-submissions/{file_submission_id}/draft", tag = "file-submissions",
    params(("file_submission_id" = FileSubmissionId, Path, description = "File submission id")),
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
    // BUG-241: the attempt and its projection must not die with the socket.
    detached(async move {
        let (attempt, created) = state.file_submissions.start(&actor, id).await?;
        let status = if created {
            StatusCode::CREATED
        } else {
            StatusCode::OK
        };
        Ok((status, Json(attempt.into())))
    })
    .await
}

/// Replace the draft's attached files (opens a draft when there is none).
///
/// Uploads must be the caller's own finalized `file-submission` uploads.
/// `If-Match` is optional; a stale version is 412.
#[utoipa::path(
    operation_id = "save_file_submission_draft",
    patch, path = "/file-submissions/{file_submission_id}/draft", tag = "file-submissions",
    params(
        ("file_submission_id" = FileSubmissionId, Path, description = "File submission id"),
        ("If-Match" = Option<i64>, Header, description = "Attempt version (optional)"),
    ),
    request_body = DraftRequest,
    responses(
        (status = 200, description = "Saved", body = Attempt),
        (status = 409, description = "Not published or attempt cap reached", body = Problem,
         content_type = "application/problem+json"),
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
    body: axum::body::Bytes,
) -> ApiResult<Json<Attempt>> {
    // UX-311: permission before the body.
    state
        .file_submissions
        .require_submittable(&actor, id)
        .await?;
    let request = ValidJson::<DraftRequest>::parse(&body)?;
    let expected = if_match(&headers)?;
    // BUG-241: a hang-up mid-save must not cut the attach short.
    detached(async move {
        let saved = state
            .file_submissions
            .save_draft(&actor, id, &refs(request.files), expected)
            .await?;
        Ok(Json(saved.into()))
    })
    .await
}

/// Submit the open attempt (optionally replacing files first).
///
/// At least one file is required; late work is refused when the activity
/// does not allow it and penalised by the late policy otherwise. With an
/// `Idempotency-Key`, a retry with the same body replays the original
/// response for 24h instead of opening a new attempt; the same key with a
/// different body is 422.
#[utoipa::path(
    post, path = "/file-submissions/{file_submission_id}/submit", tag = "file-submissions",
    params(
        ("file_submission_id" = FileSubmissionId, Path, description = "File submission id"),
        ("If-Match" = Option<i64>, Header, description = "Attempt version (optional)"),
        ("Idempotency-Key" = Option<String>, Header, description = "Client retry token (optional)"),
    ),
    request_body = SubmitRequest,
    responses(
        (status = 200, description = "Submitted", body = Attempt),
        (status = 409, description = "Not published, cap reached, or late work closed",
         body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "No files, or Idempotency-Key reused with a different body",
         body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn submit(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    state
        .file_submissions
        .require_submittable(&actor, id)
        .await?;
    let expected = if_match(&headers)?;
    let request = if body.is_empty() {
        SubmitRequest::default()
    } else {
        ValidJson::<SubmitRequest>::parse(&body)?
    };
    let files = request.files.map(refs);
    idempotent(
        state.pool.clone(),
        actor.user_id,
        &format!("file-submit:{id}"),
        &headers,
        &body,
        move || async move {
            let submitted = state
                .file_submissions
                .submit(&actor, id, files.as_deref(), expected)
                .await?;
            Ok((StatusCode::OK, Attempt::from(submitted)))
        },
    )
    .await
}

/// Every attempt the caller made, newest first.
#[utoipa::path(
    get, path = "/file-submissions/{file_submission_id}/me", tag = "file-submissions",
    params(("file_submission_id" = FileSubmissionId, Path, description = "File submission id")),
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

/// Submitted attempts for grading, newest first unless `sort` / `order`
/// say otherwise (keyset: `next_cursor` back as `cursor`, same filters).
#[utoipa::path(
    operation_id = "file_submission_review_queue",
    get, path = "/file-submissions/{file_submission_id}/submissions", tag = "file-submissions",
    params(("file_submission_id" = FileSubmissionId, Path, description = "File submission id"), FileReviewQuery),
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
                late_only: query.late_only,
                search: query.search.as_deref().filter(|s| !s.trim().is_empty()),
                group_id: query.group_id,
                sort: query.sort,
                ascending: matches!(query.order, Some(SortOrder::Asc)),
                cursor: query.cursor,
                limit: query.limit.unwrap_or(DEFAULT_REVIEW_PAGE),
            },
        )
        .await?;
    Ok(Json(page.into()))
}

/// Every attempt as CSV (graders). Header and status words follow
/// `Accept-Language` (ru / kk / en, Russian by default); UTF-8 with BOM.
#[utoipa::path(
    operation_id = "export_file_submission_csv",
    get, path = "/file-submissions/{file_submission_id}/submissions/export", tag = "file-submissions",
    params(
        ("file_submission_id" = FileSubmissionId, Path, description = "File submission id"),
        ("Accept-Language" = Option<String>, Header, description = "ru / kk / en (default ru)"),
        ("lang" = Option<crate::dto::enums::UiLanguage>, Query, description = "Overrides `Accept-Language` (for links)"),
    ),
    responses((status = 200, description = "CSV", content_type = "text/csv", body = String)),
)]
pub async fn export_csv(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let csv = state
        .file_submissions
        .export_csv(&actor, id, csv_language(&headers))
        .await?;
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
    get, path = "/file-submission-attempts/{attempt_id}", tag = "file-submissions",
    params(("attempt_id" = FileAttemptId, Path, description = "Attempt id")),
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
    patch, path = "/file-submission-attempts/{attempt_id}/grade", tag = "file-submissions",
    params(
        ("attempt_id" = FileAttemptId, Path, description = "Attempt id"),
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
    body: axum::body::Bytes,
) -> ApiResult<Json<Attempt>> {
    // UX-311: permission before the body.
    state.file_submissions.require_gradable(&actor, id).await?;
    let request = ValidJson::<FileGradeRequest>::parse(&body)?;
    let expected_version = if_match(&headers)?;
    // Detached (BUG-314): the progress projection and the SSE event outlive
    // a hang-up.
    detached(async move {
        let graded = state
            .file_submissions
            .grade(
                &actor,
                id,
                FileGradeInput {
                    action: match request.action {
                        FileGradeAction::Save => {
                            ab_domain::files::submissions::FileGradeAction::Save
                        }
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
    })
    .await
}

/// A short-lived download URL for an attached file (owner or grader).
#[utoipa::path(
    get, path = "/file-submission-files/{file_id}/url", tag = "file-submissions",
    params(("file_id" = FileAttemptFileId, Path, description = "Attached file id"), FileUrlQuery),
    responses((status = 200, description = "Signed URL (1h)", body = SignedDownload)),
)]
pub async fn file_url(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileAttemptFileId>,
    Query(query): Query<FileUrlQuery>,
) -> ApiResult<Json<SignedDownload>> {
    let inline = query.disposition == Some(Disposition::Inline);
    let signed = state.file_submissions.download(&actor, id, inline).await?;
    Ok(Json(SignedDownload {
        file_id: id,
        path: origin_relative(&signed.url),
        url: signed.url,
        expires_at_unix: signed.expires_at,
        filename: signed.filename,
        content_type: signed.content_type,
    }))
}

/// `scheme://host` stripped: the path and query of a presigned URL.
fn origin_relative(url: &str) -> String {
    url.split_once("://")
        .and_then(|(_, rest)| rest.find('/').map(|i| rest[i..].to_owned()))
        .unwrap_or_else(|| url.to_owned())
}

/// Queue counts (graders), optionally for one group's members.
#[utoipa::path(
    operation_id = "file_submission_review_stats",
    get, path = "/file-submissions/{file_submission_id}/submissions/stats", tag = "file-submissions",
    params(("file_submission_id" = FileSubmissionId, Path, description = "File submission id"), FileReviewStatsQuery),
    responses(
        (status = 200, description = "Counts", body = FileReviewStats),
        (status = 403, description = "No grading access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn review_stats(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
    Query(query): Query<FileReviewStatsQuery>,
) -> ApiResult<Json<FileReviewStats>> {
    Ok(Json(
        state
            .file_submissions
            .review_stats(&actor, id, query.group_id)
            .await?,
    ))
}

/// The attempt's grading ledger, newest first (graders). Grades saved
/// before the ledger existed (2026-10-04) have no entry.
#[utoipa::path(
    operation_id = "file_grading_history",
    get, path = "/file-submission-attempts/{attempt_id}/grading-history", tag = "file-submissions",
    params(("attempt_id" = FileAttemptId, Path, description = "Attempt id")),
    responses(
        (status = 200, description = "Entries", body = [FileGradingEntry]),
        (status = 404, description = "Unknown attempt or no grading access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn grading_history(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileAttemptId>,
) -> ApiResult<Json<Vec<FileGradingEntry>>> {
    Ok(Json(
        state.file_submissions.grading_history(&actor, id).await?,
    ))
}

/// Release every held (`graded`) grade (batch release mode).
///
/// One publish save per row at its current version; a row changed
/// meanwhile or the caller's own is skipped. Runs detached.
#[utoipa::path(
    operation_id = "publish_file_grades",
    post, path = "/file-submissions/{file_submission_id}/publish-grades", tag = "file-submissions",
    params(("file_submission_id" = FileSubmissionId, Path, description = "File submission id")),
    responses(
        (status = 200, description = "Per-row outcome counts", body = BulkGradeSummary),
        (status = 403, description = "No grading access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn publish_grades(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
) -> ApiResult<Json<BulkGradeSummary>> {
    detached(async move { Ok(Json(state.file_submissions.publish_all(&actor, id).await?)) }).await
}

/// Return the selected attempts for revision in one call (graders).
///
/// One `return` save per row at its current version; a published, stale,
/// own or foreign row counts as skipped. Runs detached.
#[utoipa::path(
    operation_id = "return_file_grades",
    post, path = "/file-submissions/{file_submission_id}/return-grades", tag = "file-submissions",
    params(("file_submission_id" = FileSubmissionId, Path, description = "File submission id")),
    request_body = ReturnAttemptsRequest,
    responses(
        (status = 200, description = "Per-row outcome counts", body = BulkGradeSummary),
        (status = 403, description = "No grading access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn return_grades(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
    body: axum::body::Bytes,
) -> ApiResult<Json<BulkGradeSummary>> {
    // UX-311: permission before the body.
    state
        .file_submissions
        .review_stats(&actor, id, None)
        .await?;
    let request = ValidJson::<ReturnAttemptsRequest>::parse(&body)?;
    detached(async move {
        Ok(Json(
            state
                .file_submissions
                .return_many(&actor, id, &request.attempt_ids)
                .await?,
        ))
    })
    .await
}

/// Move the due date of selected learners (graders).
///
/// Synchronous: the learners' own due date replaces the activity's (the
/// closed gate, lateness, their view of `due_at_unix`); work they already
/// handed in is re-judged. Each learner gets a `deadline.extended` event.
/// `done_count` = learners extended. Retry-safe with `Idempotency-Key`.
#[utoipa::path(
    operation_id = "extend_file_deadline",
    post, path = "/file-submissions/{file_submission_id}/deadline-extensions", tag = "file-submissions",
    params(("file_submission_id" = FileSubmissionId, Path, description = "File submission id")),
    request_body = DeadlineExtensionRequest,
    responses(
        (status = 200, description = "Extended", body = BulkGradeSummary),
        (status = 422, description = "Not members, the caller, or a past date", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn extend_deadline(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<FileSubmissionId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    state
        .file_submissions
        .review_stats(&actor, id, None)
        .await?;
    let request = ValidJson::<DeadlineExtensionRequest>::parse(&body)?;
    idempotent(
        state.pool.clone(),
        actor.user_id,
        &format!("file-deadline-extension:{id}"),
        &headers,
        &body,
        move || async move {
            let summary = state
                .file_submissions
                .extend_deadline(
                    &actor,
                    id,
                    &request.user_ids,
                    request.new_due_at_unix,
                    request.reason.trim(),
                )
                .await?;
            Ok((StatusCode::OK, summary))
        },
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::origin_relative;

    #[test]
    fn presigned_url_becomes_origin_relative() {
        assert_eq!(
            origin_relative("https://ashyq.kz/ab-private/a/b.pdf?X-Amz-Signature=1"),
            "/ab-private/a/b.pdf?X-Amz-Signature=1"
        );
        assert_eq!(
            origin_relative("http://localhost:9002/ab-private/k?x=1"),
            "/ab-private/k?x=1"
        );
    }
}
