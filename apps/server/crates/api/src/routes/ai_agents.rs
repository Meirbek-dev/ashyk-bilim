//! The six agents.
//!
//! Course Q&A (AG-UI chat over SSE + threads), study companion, submission analysis, course analysis, lecture authoring and
//! remediation. Sync variants answer with the record; `/queue` variants
//! answer 202 with the run to follow on `/ai/runs/{id}/stream`.

use std::convert::Infallible;
use std::time::Duration;

use ab_core::id::{
    AiCourseAnalysisId, AiLectureReviewId, AiRemediationSessionId, AiThreadId, CourseId,
    SubmissionId, UserId,
};
use ab_core::{Error, FieldError};
use ab_domain::ai::{QaRequest, QaTurn};
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::Sse;
use axum::response::sse::{Event, KeepAlive};
use futures::{Stream, StreamExt};

use crate::dto::ai::{
    CourseAnalysis, DismissSuggestionRequest, FindingReviewRequest, LanguageRequest, LectureReview,
    LectureReviewRequest, QaChatRequest, QaMessage, QaThreadSummary, RemediationCompletionRequest,
    RemediationRequest, RemediationSession, RunStatus, StudyRequest, SubmissionAnalysis,
    ThreadsQuery,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, ValidJson};
use crate::state::AppState;

const KEEPALIVE: Duration = Duration::from_secs(25);

fn ag_ui(data: &serde_json::Value) -> Event {
    Event::default().data(data.to_string())
}

fn new_message_id() -> String {
    format!("msg_{}", uuid::Uuid::now_v7())
}

// ── Course Q&A ──────────────────────────────────────────────────────────────

/// AG-UI chat transport for course Q&A (consumed by `useChat`).
///
/// Access, budget and the thread/user message are settled before the stream
/// starts, so they fail as normal HTTP errors; the model call and the
/// answer's persistence happen inside the stream, where a failure is a
/// `RUN_ERROR` event. A retried `client_turn_id` replays the stored answer.
#[utoipa::path(
    post, path = "/ai/qa/{course_id}/chat", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    request_body = QaChatRequest,
    responses(
        (status = 200, description = "AG-UI event stream", content_type = "text/event-stream", body = String),
        (status = 404, description = "Unknown or inaccessible course", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Turn id reused or still in progress", body = Problem,
         content_type = "application/problem+json"),
        (status = 503, description = "AI disabled or budget exhausted", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn qa_chat(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    ValidJson(request): ValidJson<QaChatRequest>,
) -> ApiResult<Sse<impl Stream<Item = Result<Event, Infallible>>>> {
    let Some(question) = request.latest_user_question() else {
        return Err(Error::validation(vec![FieldError {
            field: "messages".into(),
            code: "required".into(),
            message: "a user message is required".into(),
        }])
        .into());
    };
    let props = &request.forwarded_props;
    let language = props.language.as_deref().unwrap_or("auto");
    let (thread_id, run_id) = (request.thread_id.clone(), request.run_id.clone());

    if let Some(turn) = props.client_turn_id.as_deref()
        && let Some(replay) = state
            .ai
            .qa_replay(&actor, course_id, turn, &question)
            .await?
    {
        let message_id = replay.assistant.id.to_string();
        let events = vec![
            serde_json::json!({ "type": "RUN_STARTED", "threadId": thread_id, "runId": run_id }),
            serde_json::json!({ "type": "TEXT_MESSAGE_START", "messageId": message_id, "role": "assistant" }),
            serde_json::json!({ "type": "TEXT_MESSAGE_CONTENT", "messageId": message_id, "delta": replay.assistant.content }),
            serde_json::json!({ "type": "TEXT_MESSAGE_END", "messageId": message_id }),
            serde_json::json!({
                "type": "RUN_FINISHED", "threadId": thread_id, "runId": run_id,
                "result": { "thread_id": replay.thread.id, "message_id": replay.assistant.id, "replayed": true },
            }),
        ];
        let stream = futures::stream::iter(events.into_iter().map(|e| Ok(ag_ui(&e))));
        return Ok(Sse::new(stream.boxed()).keep_alive(KeepAlive::new().interval(KEEPALIVE)));
    }

    let session = state
        .ai
        .prepare_qa(
            &actor,
            course_id,
            QaRequest {
                question: &question,
                thread_id: props.thread_id,
                language,
                activity_id: props.activity_id,
                client_turn_id: props.client_turn_id.as_deref(),
            },
        )
        .await?;
    let mut turns = state.ai.stream_qa(session);
    let stream = async_stream::stream! {
        let message_id = new_message_id();
        yield Ok(ag_ui(&serde_json::json!({ "type": "RUN_STARTED", "threadId": thread_id, "runId": run_id })));
        yield Ok(ag_ui(&serde_json::json!({ "type": "TEXT_MESSAGE_START", "messageId": message_id, "role": "assistant" })));
        let mut text_open = true;
        while let Some(turn) = turns.next().await {
            if text_open && !matches!(turn, QaTurn::Delta(_)) {
                text_open = false;
                yield Ok(ag_ui(&serde_json::json!({ "type": "TEXT_MESSAGE_END", "messageId": message_id })));
            }
            match turn {
                QaTurn::Delta(delta) => {
                    yield Ok(ag_ui(&serde_json::json!({
                        "type": "TEXT_MESSAGE_CONTENT", "messageId": message_id, "delta": delta,
                    })));
                }
                QaTurn::Citations(citations) => {
                    let tool_call_id = format!("tool_{}", uuid::Uuid::now_v7());
                    yield Ok(ag_ui(&serde_json::json!({
                        "type": "TOOL_CALL_START", "toolCallId": tool_call_id,
                        "toolCallName": "course_citations", "parentMessageId": message_id,
                    })));
                    yield Ok(ag_ui(&serde_json::json!({
                        "type": "TOOL_CALL_RESULT", "messageId": new_message_id(), "toolCallId": tool_call_id,
                        "content": serde_json::json!({ "citations": citations }).to_string(),
                    })));
                    yield Ok(ag_ui(&serde_json::json!({ "type": "TOOL_CALL_END", "toolCallId": tool_call_id })));
                }
                QaTurn::Finished { thread_id: thread, message_id: message, confidence, follow_up_suggestions } => {
                    yield Ok(ag_ui(&serde_json::json!({
                        "type": "RUN_FINISHED", "threadId": thread_id, "runId": run_id,
                        "result": {
                            "thread_id": thread, "message_id": message,
                            "confidence": confidence.as_str(),
                            "follow_up_suggestions": follow_up_suggestions,
                        },
                    })));
                }
                QaTurn::Error { code, message } => {
                    yield Ok(ag_ui(&serde_json::json!({ "type": "RUN_ERROR", "message": message, "code": code })));
                }
            }
        }
    };
    Ok(Sse::new(stream.boxed()).keep_alive(KeepAlive::new().interval(KEEPALIVE)))
}

#[utoipa::path(
    get, path = "/ai/qa/{course_id}/threads", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id"), ThreadsQuery),
    responses((status = 200, description = "The caller's threads, newest activity first", body = Vec<QaThreadSummary>)),
)]
pub async fn qa_threads(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    Query(query): Query<ThreadsQuery>,
) -> ApiResult<Json<Vec<QaThreadSummary>>> {
    let threads = state
        .ai
        .list_qa_threads(&actor, course_id, query.limit.unwrap_or(30))
        .await?;
    Ok(Json(threads.into_iter().map(Into::into).collect()))
}

#[utoipa::path(
    get, path = "/ai/qa/{course_id}/threads/{thread_id}", tag = "ai",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("thread_id" = AiThreadId, Path, description = "Thread id"),
    ),
    responses(
        (status = 200, description = "The transcript, oldest first", body = Vec<QaMessage>),
        (status = 404, description = "Not the caller's thread in this course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn qa_thread(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((course_id, thread_id)): Path<(CourseId, AiThreadId)>,
) -> ApiResult<Json<Vec<QaMessage>>> {
    let messages = state
        .ai
        .qa_thread_messages(&actor, course_id, thread_id)
        .await?;
    Ok(Json(messages.into_iter().map(Into::into).collect()))
}

#[utoipa::path(
    delete, path = "/ai/qa/{course_id}/threads/{thread_id}", tag = "ai",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("thread_id" = AiThreadId, Path, description = "Thread id"),
    ),
    responses(
        (status = 204, description = "Deleted"),
        (status = 404, description = "Not the caller's thread in this course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_qa_thread(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((course_id, thread_id)): Path<(CourseId, AiThreadId)>,
) -> ApiResult<StatusCode> {
    state
        .ai
        .delete_qa_thread(&actor, course_id, thread_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Study companion ─────────────────────────────────────────────────────────

/// Answer inline; the body is the `study_companion` artifact.
#[utoipa::path(
    post, path = "/ai/study/{course_id}/ask", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    request_body = StudyRequest,
    responses(
        (status = 200, description = "The answer artifact", body = Object),
        (status = 503, description = "AI disabled or budget exhausted", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn study_ask(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    ValidJson(request): ValidJson<StudyRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    Ok(Json(
        state
            .ai
            .ask_study_companion(
                &actor,
                course_id,
                &request.question,
                request.mode,
                &request.language,
            )
            .await?,
    ))
}

#[utoipa::path(
    post, path = "/ai/study/{course_id}/ask/queue", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    request_body = StudyRequest,
    responses((status = 202, description = "Queued run", body = RunStatus)),
)]
pub async fn study_ask_queue(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    ValidJson(request): ValidJson<StudyRequest>,
) -> ApiResult<(StatusCode, Json<RunStatus>)> {
    let run = state
        .ai
        .queue_study_companion(
            &actor,
            course_id,
            &request.question,
            request.mode,
            &request.language,
        )
        .await?;
    Ok((StatusCode::ACCEPTED, Json(run.into())))
}

// ── Submission analysis ─────────────────────────────────────────────────────

#[utoipa::path(
    post, path = "/ai/submission-analysis/{submission_id}/analyze", tag = "ai",
    params(("submission_id" = SubmissionId, Path, description = "Submission id")),
    request_body = LanguageRequest,
    responses(
        (status = 200, description = "The analysis", body = SubmissionAnalysis),
        (status = 404, description = "Unknown or inaccessible submission", body = Problem,
         content_type = "application/problem+json"),
        (status = 503, description = "AI disabled or budget exhausted", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn analyze_submission(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(submission_id): Path<SubmissionId>,
    ValidJson(request): ValidJson<LanguageRequest>,
) -> ApiResult<Json<SubmissionAnalysis>> {
    Ok(Json(
        state
            .ai
            .analyze_submission(&actor, submission_id, &request.language)
            .await?
            .into(),
    ))
}

#[utoipa::path(
    post, path = "/ai/submission-analysis/{submission_id}/analyze/queue", tag = "ai",
    params(("submission_id" = SubmissionId, Path, description = "Submission id")),
    request_body = LanguageRequest,
    responses((status = 202, description = "Queued run", body = RunStatus)),
)]
pub async fn queue_submission_analysis(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(submission_id): Path<SubmissionId>,
    ValidJson(request): ValidJson<LanguageRequest>,
) -> ApiResult<(StatusCode, Json<RunStatus>)> {
    let run = state
        .ai
        .queue_submission_analysis(&actor, submission_id, &request.language)
        .await?;
    Ok((StatusCode::ACCEPTED, Json(run.into())))
}

/// The newest analysis of a submission; `null` when none exists.
#[utoipa::path(
    get, path = "/ai/submission-analysis/{submission_id}/latest", tag = "ai",
    params(("submission_id" = SubmissionId, Path, description = "Submission id")),
    responses((status = 200, description = "The latest analysis or null", body = Option<SubmissionAnalysis>)),
)]
pub async fn latest_submission_analysis(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(submission_id): Path<SubmissionId>,
) -> ApiResult<Json<Option<SubmissionAnalysis>>> {
    let latest = state
        .ai
        .latest_submission_analysis(&actor, submission_id)
        .await?;
    Ok(Json(latest.map(Into::into)))
}

// ── Course analysis ─────────────────────────────────────────────────────────

#[utoipa::path(
    post, path = "/ai/course-analysis/{course_id}/analyze", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    request_body = LanguageRequest,
    responses(
        (status = 200, description = "The analysis", body = CourseAnalysis),
        (status = 403, description = "Not a course teacher", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn analyze_course(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    ValidJson(request): ValidJson<LanguageRequest>,
) -> ApiResult<Json<CourseAnalysis>> {
    Ok(Json(
        state
            .ai
            .analyze_course(&actor, course_id, &request.language)
            .await?
            .into(),
    ))
}

#[utoipa::path(
    post, path = "/ai/course-analysis/{course_id}/analyze/queue", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    request_body = LanguageRequest,
    responses((status = 202, description = "Queued run", body = RunStatus)),
)]
pub async fn queue_course_analysis(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    ValidJson(request): ValidJson<LanguageRequest>,
) -> ApiResult<(StatusCode, Json<RunStatus>)> {
    let run = state
        .ai
        .queue_course_analysis(&actor, course_id, &request.language)
        .await?;
    Ok((StatusCode::ACCEPTED, Json(run.into())))
}

/// Teachers see the latest draft; learners only a published report.
#[utoipa::path(
    get, path = "/ai/course-analysis/{course_id}/latest", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses((status = 200, description = "The latest analysis or null", body = Option<CourseAnalysis>)),
)]
pub async fn latest_course_analysis(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
) -> ApiResult<Json<Option<CourseAnalysis>>> {
    let latest = state.ai.latest_course_analysis(&actor, course_id).await?;
    Ok(Json(latest.map(Into::into)))
}

#[utoipa::path(
    post, path = "/ai/course-analysis/{analysis_id}/publish", tag = "ai",
    params(("analysis_id" = AiCourseAnalysisId, Path, description = "Analysis id")),
    responses((status = 200, description = "The published analysis", body = CourseAnalysis)),
)]
pub async fn publish_course_analysis(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(analysis_id): Path<AiCourseAnalysisId>,
) -> ApiResult<Json<CourseAnalysis>> {
    Ok(Json(
        state
            .ai
            .publish_course_analysis(&actor, analysis_id)
            .await?
            .into(),
    ))
}

/// Record the teacher's verdict on one finding
/// (`report.finding_reviews[finding_id]`).
#[utoipa::path(
    post, path = "/ai/course-analysis/{analysis_id}/findings/review", tag = "ai",
    params(("analysis_id" = AiCourseAnalysisId, Path, description = "Analysis id")),
    request_body = FindingReviewRequest,
    responses((status = 200, description = "The updated analysis", body = CourseAnalysis)),
)]
pub async fn review_course_finding(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(analysis_id): Path<AiCourseAnalysisId>,
    ValidJson(request): ValidJson<FindingReviewRequest>,
) -> ApiResult<Json<CourseAnalysis>> {
    Ok(Json(
        state
            .ai
            .review_course_finding(
                &actor,
                analysis_id,
                &request.finding_id,
                request.action,
                request.note.as_deref(),
            )
            .await?
            .into(),
    ))
}

// ── Lecture authoring ───────────────────────────────────────────────────────

#[utoipa::path(
    post, path = "/ai/lecture-authoring/{course_id}/critique", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    request_body = LectureReviewRequest,
    responses(
        (status = 200, description = "The review", body = LectureReview),
        (status = 403, description = "Not a course teacher", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn critique_lecture(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    ValidJson(request): ValidJson<LectureReviewRequest>,
) -> ApiResult<Json<LectureReview>> {
    Ok(Json(
        state
            .ai
            .critique_lecture(&actor, course_id, request.activity_id, &request.language)
            .await?
            .into(),
    ))
}

#[utoipa::path(
    post, path = "/ai/lecture-authoring/{course_id}/critique/queue", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    request_body = LectureReviewRequest,
    responses((status = 202, description = "Queued run", body = RunStatus)),
)]
pub async fn queue_lecture_review(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    ValidJson(request): ValidJson<LectureReviewRequest>,
) -> ApiResult<(StatusCode, Json<RunStatus>)> {
    let run = state
        .ai
        .queue_lecture_review(&actor, course_id, request.activity_id, &request.language)
        .await?;
    Ok((StatusCode::ACCEPTED, Json(run.into())))
}

#[utoipa::path(
    get, path = "/ai/lecture-authoring/{course_id}/reviews", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses((status = 200, description = "Active reviews, newest first", body = Vec<LectureReview>)),
)]
pub async fn lecture_reviews(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
) -> ApiResult<Json<Vec<LectureReview>>> {
    let reviews = state.ai.list_lecture_reviews(&actor, course_id).await?;
    Ok(Json(reviews.into_iter().map(Into::into).collect()))
}

#[utoipa::path(
    post, path = "/ai/lecture-authoring/reviews/{review_id}/dismiss", tag = "ai",
    params(("review_id" = AiLectureReviewId, Path, description = "Review id")),
    request_body = DismissSuggestionRequest,
    responses((status = 200, description = "The updated review", body = LectureReview)),
)]
pub async fn dismiss_lecture_suggestion(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(review_id): Path<AiLectureReviewId>,
    ValidJson(request): ValidJson<DismissSuggestionRequest>,
) -> ApiResult<Json<LectureReview>> {
    Ok(Json(
        state
            .ai
            .dismiss_lecture_suggestion(&actor, review_id, &request.suggestion_id)
            .await?
            .into(),
    ))
}

// ── Remediation ─────────────────────────────────────────────────────────────

#[utoipa::path(
    post, path = "/ai/remediation/{submission_id}/generate", tag = "ai",
    params(("submission_id" = SubmissionId, Path, description = "Submission id")),
    request_body = RemediationRequest,
    responses(
        (status = 200, description = "The remediation session", body = RemediationSession),
        (status = 404, description = "Unknown or inaccessible submission", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn generate_remediation(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(submission_id): Path<SubmissionId>,
    ValidJson(request): ValidJson<RemediationRequest>,
) -> ApiResult<Json<RemediationSession>> {
    Ok(Json(
        state
            .ai
            .generate_remediation(&actor, submission_id, request.gate_mode, &request.language)
            .await?
            .into(),
    ))
}

#[utoipa::path(
    post, path = "/ai/remediation/{submission_id}/generate/queue", tag = "ai",
    params(("submission_id" = SubmissionId, Path, description = "Submission id")),
    request_body = RemediationRequest,
    responses((status = 202, description = "Queued run", body = RunStatus)),
)]
pub async fn queue_remediation(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(submission_id): Path<SubmissionId>,
    ValidJson(request): ValidJson<RemediationRequest>,
) -> ApiResult<(StatusCode, Json<RunStatus>)> {
    let run = state
        .ai
        .queue_remediation(&actor, submission_id, request.gate_mode, &request.language)
        .await?;
    Ok((StatusCode::ACCEPTED, Json(run.into())))
}

#[utoipa::path(
    get, path = "/ai/remediation/sessions/{session_id}", tag = "ai",
    params(("session_id" = AiRemediationSessionId, Path, description = "Session id")),
    responses(
        (status = 200, description = "The session", body = RemediationSession),
        (status = 404, description = "Unknown or inaccessible session", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn remediation_session(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(session_id): Path<AiRemediationSessionId>,
) -> ApiResult<Json<RemediationSession>> {
    Ok(Json(
        state
            .ai
            .remediation_session(&actor, session_id)
            .await?
            .into(),
    ))
}

/// The learner records a score; 70 or more passes (and lifts a gate).
#[utoipa::path(
    post, path = "/ai/remediation/sessions/{session_id}/complete", tag = "ai",
    params(("session_id" = AiRemediationSessionId, Path, description = "Session id")),
    request_body = RemediationCompletionRequest,
    responses(
        (status = 200, description = "The session", body = RemediationSession),
        (status = 403, description = "Not the learner of this session", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn complete_remediation(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(session_id): Path<AiRemediationSessionId>,
    ValidJson(request): ValidJson<RemediationCompletionRequest>,
) -> ApiResult<Json<RemediationSession>> {
    Ok(Json(
        state
            .ai
            .complete_remediation(&actor, session_id, request.score)
            .await?
            .into(),
    ))
}

/// A learner's sessions: their own, or anyone's with `platform:read`.
#[utoipa::path(
    get, path = "/ai/remediation/student/{user_id}", tag = "ai",
    params(("user_id" = UserId, Path, description = "Learner id")),
    responses((status = 200, description = "Sessions, newest first", body = Vec<RemediationSession>)),
)]
pub async fn student_remediation(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(user_id): Path<UserId>,
) -> ApiResult<Json<Vec<RemediationSession>>> {
    let sessions = state
        .ai
        .student_remediation_sessions(&actor, user_id)
        .await?;
    Ok(Json(sessions.into_iter().map(Into::into).collect()))
}
