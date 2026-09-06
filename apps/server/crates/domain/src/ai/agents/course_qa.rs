//! Course Q&A (legacy `agents/course_qa.py` + `prepare_course_question_stream`
//! / `stream_course_question_events` / `get_course_question_replay`).
//!
//! One turn is prepared eagerly — gates, budget, thread and user message,
//! the run — so failures surface as a normal HTTP status; only the model
//! call and the final persistence happen inside the stream, where failures
//! become a terminal error item. The model is asked for the
//! [`CourseQaAnswer`] JSON object; `answer_markdown` is its first key, so
//! the answer text streams out as it arrives while the rest of the object
//! is still in flight (see [`super::super::partial`]).

use std::pin::Pin;
use std::time::Instant;

use ab_clients::llm::{
    ChatMessage, CompletionRequest, OutputSchema, StreamChunk, Usage, extract_json,
};
use ab_core::ai::{AiFeature, AiRunKind, AiThreadRole, QaMessageRole};
use ab_core::id::{ActivityId, AiMessageId, AiThreadId, CourseId, UserId};
use ab_core::{Error, ErrorCode, FieldError, Result};
use ab_db::ai::{NewQaMessage, QaMessageRow, RunRow, ThreadRow, ThreadSummaryRow};
use futures::{Stream, StreamExt};
use tokio_util::sync::CancellationToken;

use super::{DRAFT_MODEL, draft_citation};
use crate::ai::AiService;
use crate::ai::budget::BudgetLane;
use crate::ai::context::{self, ContextSource};
use crate::ai::partial::partial_string_field;
use crate::ai::policy;
use crate::ai::prompts::{Prompt, clipped, load_prompt};
use crate::ai::redact;
use crate::ai::runs::{FinishSpec, RunSpec, cancelled_error, is_cancelled};
use crate::ai::schemas::{CourseQaAnswer, Level};
use crate::identity::Actor;

const ARTIFACT_KIND: &str = "course_qa";
const FAIL_CODE: &str = "COURSE_QA_FAILED";
const MAX_QUESTION_CHARS: usize = 8000;
/// Legacy `QA_HISTORY_MESSAGE_LIMIT` / `QA_HISTORY_CHARACTER_LIMIT`.
const HISTORY_MESSAGE_LIMIT: i64 = 12;
const HISTORY_CHARACTER_LIMIT: usize = 12_000;
/// Legacy `title=question[:80]`.
const TITLE_CHARS: usize = 80;

/// Legacy `_draft_course_answer` (verbatim strings).
#[must_use]
pub fn draft_course_answer() -> CourseQaAnswer {
    CourseQaAnswer {
        answer_markdown: "Вопросы и ответы по курсу с использованием ИИ еще не включены. Вопрос был записан, но ответ от провайдера не был сгенерирован.".into(),
        citations: vec![draft_citation(
            "qa-draft",
            "Контекст курса",
            "course",
            "Черновик ответа на вопрос создан без доступа к модели.",
        )],
        confidence: Level::Low,
        out_of_scope: false,
        follow_up_suggestions: vec![
            "Попросить преподавателя ответить на этот вопрос".into(),
            "Просмотреть текущие конспекты лекций".into(),
        ],
    }
}

/// One question as the client sent it.
#[derive(Debug, Clone)]
pub struct QaRequest<'a> {
    pub question: &'a str,
    /// Continue this thread (must be the caller's, in this course).
    pub thread_id: Option<AiThreadId>,
    pub language: &'a str,
    /// Narrow the context to one activity of the course.
    pub activity_id: Option<ActivityId>,
    /// Client-generated turn id for idempotent retries.
    pub client_turn_id: Option<&'a str>,
}

/// An earlier answer to the same client turn (legacy replay).
#[derive(Debug, Clone)]
pub struct QaReplay {
    pub thread: ThreadRow,
    pub user_message: QaMessageRow,
    pub assistant: QaMessageRow,
}

/// Everything a streamed turn needs, prepared and committed before the
/// first byte goes out.
pub struct QaSession {
    pub thread: ThreadRow,
    pub user_message: QaMessageRow,
    pub run: RunRow,
    role: AiThreadRole,
    rendered: String,
    sources: Vec<ContextSource>,
    language: String,
    locale: Option<String>,
    user_id: UserId,
    input_tokens: i32,
    history: Vec<ChatMessage>,
    started: Instant,
}

/// One item of a streamed turn, in order: deltas, then optionally the
/// trusted citations, then exactly one of `Finished` / `Error`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QaTurn {
    Delta(String),
    Citations(Vec<serde_json::Value>),
    Finished {
        thread_id: AiThreadId,
        message_id: AiMessageId,
        confidence: Level,
        follow_up_suggestions: Vec<String>,
    },
    Error {
        code: &'static str,
        message: &'static str,
    },
}

pub type QaStream = Pin<Box<dyn Stream<Item = QaTurn> + Send>>;

enum Step {
    Delta(String),
    Final {
        answer: CourseQaAnswer,
        model_name: String,
        usage: Usage,
    },
}

type StepStream = Pin<Box<dyn Stream<Item = Result<Step>> + Send>>;

fn validate_question(question: &str) -> Result<&str> {
    let trimmed = question.trim();
    if trimmed.is_empty() || trimmed.chars().count() > MAX_QUESTION_CHARS {
        return Err(Error::validation(vec![FieldError {
            field: "question".into(),
            code: "invalid".into(),
            message: format!("question must be 1–{MAX_QUESTION_CHARS} characters"),
        }]));
    }
    Ok(trimmed)
}

fn turn_reused() -> Error {
    Error::conflict("client_turn_id was already used for a different question")
}

/// Aborts the run and keeps the partial answer when the stream is dropped
/// before it settled (client went away — legacy `asyncio.CancelledError`).
struct IncompleteGuard {
    service: AiService,
    session_ids: (AiThreadId, CourseId, UserId, AiMessageId),
    run_id: ab_core::id::AiRunId,
    text: String,
    settled: bool,
}

impl IncompleteGuard {
    fn record(&mut self, text: &str) {
        self.text.clear();
        self.text.push_str(text);
    }

    const fn settle(&mut self) {
        self.settled = true;
    }
}

impl Drop for IncompleteGuard {
    fn drop(&mut self) {
        if self.settled {
            return;
        }
        let service = self.service.clone();
        let (thread_id, course_id, user_id, reply_to) = self.session_ids;
        let run_id = self.run_id;
        let text = std::mem::take(&mut self.text);
        tokio::spawn(async move {
            if !text.is_empty() {
                let result = ab_db::ai::insert_qa_message(
                    &service.pool,
                    NewQaMessage {
                        thread_id,
                        course_id,
                        user_id,
                        role: QaMessageRole::Assistant,
                        client_turn_id: None,
                        content: &redact::redact_text(&text),
                        confidence: None,
                        citations: &serde_json::json!({ "citations": [] }),
                        metadata: &serde_json::json!({
                            "incomplete": true,
                            "reply_to_message_id": reply_to,
                        }),
                    },
                )
                .await;
                if let Err(err) = result {
                    tracing::warn!(%run_id, %err, "partial qa answer not saved");
                }
            }
            match ab_db::ai::abort_run(&service.pool, run_id).await {
                Ok(true) => {
                    if let Err(err) = service
                        .emit(
                            run_id,
                            "cancelled",
                            serde_json::json!({ "state": "cancelled", "error_code": "CANCELLED" }),
                        )
                        .await
                    {
                        tracing::warn!(%run_id, %err, "cancel event not journaled");
                    }
                }
                Ok(false) => {}
                Err(err) => tracing::warn!(%run_id, %err, "could not abort abandoned qa run"),
            }
        });
    }
}

struct QaFinished {
    message_id: AiMessageId,
    citations: Vec<serde_json::Value>,
    confidence: Level,
    follow_up_suggestions: Vec<String>,
}

impl AiService {
    /// Legacy `get_course_question_replay`: the stored answer to this
    /// client turn, `None` when the turn is new. 409 when the id was reused
    /// for another question or the turn is still being answered.
    pub async fn qa_replay(
        &self,
        actor: &Actor,
        course_id: CourseId,
        client_turn_id: &str,
        question: &str,
    ) -> Result<Option<QaReplay>> {
        self.visible_course(actor, course_id).await?;
        let Some(user_message) = ab_db::ai::find_user_message_by_turn(
            &self.pool,
            course_id,
            actor.user_id,
            client_turn_id,
        )
        .await?
        else {
            return Ok(None);
        };
        if user_message.content != question.trim() {
            return Err(turn_reused());
        }
        let thread = ab_db::ai::get_thread(&self.pool, user_message.thread_id)
            .await?
            .filter(|t| t.course_id == Some(course_id) && t.user_id == Some(actor.user_id))
            .ok_or_else(|| Error::not_found("ai thread"))?;
        if let Some(assistant) =
            ab_db::ai::find_assistant_reply(&self.pool, thread.id, user_message.id).await?
        {
            return Ok(Some(QaReplay {
                thread,
                user_message,
                assistant,
            }));
        }
        if let Some(run) =
            ab_db::ai::find_run_by_turn(&self.pool, thread.id, client_turn_id).await?
            && !run.status.is_terminal()
        {
            return Err(Error::conflict("this question is still being answered"));
        }
        Ok(None)
    }

    /// Legacy `prepare_course_question_stream`: gates, context, budget, the
    /// thread + user message, and the run — all committed before streaming.
    pub async fn prepare_qa(
        &self,
        actor: &Actor,
        course_id: CourseId,
        request: QaRequest<'_>,
    ) -> Result<QaSession> {
        self.require_feature(AiFeature::CourseQa)?;
        let question = validate_question(request.question)?;
        let course = self.visible_course(actor, course_id).await?;
        let role = policy::derive_course_role(actor, &course);
        let include_unpublished = role.sees_unpublished();
        let activity = match request.activity_id {
            Some(id) => Some(
                ab_db::catalog::get_activity(&self.pool, id)
                    .await?
                    .filter(|a| a.course_id == course_id && (include_unpublished || a.published))
                    .ok_or_else(|| Error::not_found("ai context"))?,
            ),
            None => None,
        };
        let activity_id = activity.as_ref().map(|a| a.id);
        let bundle =
            context::course_bundle(&self.pool, course_id, include_unpublished, activity_id).await?;
        let rendered = bundle.render();
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Analysis)
            .await?;
        let input_tokens = self
            .budget
            .assert_request(&self.pool, &format!("{question}\n{rendered}"))
            .await?;

        let existing = match request.client_turn_id {
            Some(turn) => {
                ab_db::ai::find_user_message_by_turn(&self.pool, course_id, actor.user_id, turn)
                    .await?
            }
            None => None,
        };
        if existing.as_ref().is_some_and(|m| m.content != question) {
            return Err(turn_reused());
        }
        let thread_id = self
            .resolve_qa_thread(
                actor,
                course_id,
                &request,
                existing.as_ref(),
                role,
                activity_id,
            )
            .await?;
        let history = self
            .qa_history(thread_id, existing.as_ref().map(|m| m.id))
            .await?;
        let retry_count = i32::from(existing.is_some());
        let user_message = if let Some(message) = existing {
            message
        } else {
            self.insert_qa_question(thread_id, course_id, actor.user_id, &request)
                .await?
        };
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::CourseQa,
                    role,
                    queued: false,
                    course_id: Some(course_id),
                    activity_id,
                    metadata: serde_json::json!({
                        "course_id": course_id,
                        "question": question,
                        "language": request.language,
                        "context_source_count": bundle.sources.len(),
                        "activity_id": activity_id,
                        "client_turn_id": request.client_turn_id,
                        "retry_count": retry_count,
                    }),
                    thread: Some(thread_id),
                    title: None,
                },
            )
            .await?;
        let thread = ab_db::ai::get_thread(&self.pool, thread_id)
            .await?
            .ok_or_else(|| Error::not_found("ai thread"))?;
        let locale = self.user_locale(actor.user_id).await?;
        Ok(QaSession {
            thread,
            user_message,
            run,
            role,
            rendered,
            sources: bundle.sources,
            language: request.language.to_owned(),
            locale,
            user_id: actor.user_id,
            input_tokens,
            history,
            started: Instant::now(),
        })
    }

    /// The thread a turn continues: the retried message's thread, else the
    /// requested thread (the caller's, in this course), else a new one
    /// titled with the question.
    async fn resolve_qa_thread(
        &self,
        actor: &Actor,
        course_id: CourseId,
        request: &QaRequest<'_>,
        existing: Option<&QaMessageRow>,
        role: AiThreadRole,
        activity_id: Option<ActivityId>,
    ) -> Result<AiThreadId> {
        if let Some(message) = existing {
            return ab_db::ai::get_thread(&self.pool, message.thread_id)
                .await?
                .filter(|t| t.course_id == Some(course_id) && t.user_id == Some(actor.user_id))
                .map(|t| t.id)
                .ok_or_else(|| Error::not_found("ai thread"));
        }
        if let Some(id) = request.thread_id {
            return ab_db::ai::find_owned_course_thread(&self.pool, id, actor.user_id, course_id)
                .await?
                .map(|t| t.id)
                .ok_or_else(|| Error::not_found("ai thread"));
        }
        let title: String = request.question.trim().chars().take(TITLE_CHARS).collect();
        ab_db::ai::insert_thread(
            &self.pool,
            actor.user_id,
            role,
            Some(course_id),
            activity_id,
            Some(&title),
        )
        .await
    }

    async fn insert_qa_question(
        &self,
        thread_id: AiThreadId,
        course_id: CourseId,
        user_id: UserId,
        request: &QaRequest<'_>,
    ) -> Result<QaMessageRow> {
        let id = ab_db::ai::insert_qa_message(
            &self.pool,
            NewQaMessage {
                thread_id,
                course_id,
                user_id,
                role: QaMessageRole::User,
                client_turn_id: request.client_turn_id,
                content: request.question.trim(),
                confidence: None,
                citations: &serde_json::json!([]),
                metadata: &serde_json::json!({}),
            },
        )
        .await?;
        ab_db::ai::get_qa_message(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("ai message"))
    }

    /// Legacy `_qa_message_history`: the newest messages of the thread,
    /// oldest first, capped by count and characters.
    async fn qa_history(
        &self,
        thread_id: AiThreadId,
        exclude: Option<AiMessageId>,
    ) -> Result<Vec<ChatMessage>> {
        let stored = ab_db::ai::recent_thread_messages(
            &self.pool,
            thread_id,
            exclude,
            HISTORY_MESSAGE_LIMIT,
        )
        .await?;
        let mut selected: Vec<QaMessageRow> = Vec::new();
        let mut characters = 0usize;
        for message in stored {
            if message.content.trim().is_empty() {
                continue;
            }
            let next = characters + message.content.chars().count();
            if !selected.is_empty() && next > HISTORY_CHARACTER_LIMIT {
                break;
            }
            selected.push(message);
            characters = next;
        }
        Ok(selected
            .into_iter()
            .rev()
            .map(|m| match m.role {
                QaMessageRole::User => ChatMessage::user(m.content),
                QaMessageRole::Assistant => ChatMessage::assistant(m.content),
            })
            .collect())
    }

    /// The model side of one turn: answer-text deltas, then the parsed
    /// answer. Draft mode stands in for a missing or failing provider.
    fn answer_steps(&self, session: &QaSession, token: CancellationToken) -> StepStream {
        let llm = self.provider().cloned();
        let draft_mode = self.config.ai_draft_mode_enabled;
        let prompt = format!(
            "Role: {}\nLanguage: {}\nQuestion: {}\n\nCourse context:\n{}",
            session.role,
            session.language,
            session.user_message.content,
            clipped(&session.rendered)
        );
        let mut messages = Vec::with_capacity(session.history.len() + 2);
        messages.push(ChatMessage::system(load_prompt(
            Prompt::CourseQa,
            session.locale.as_deref(),
        )));
        messages.extend(session.history.iter().cloned());
        messages.push(ChatMessage::user(prompt));
        let request = CompletionRequest {
            messages,
            output_schema: Some(OutputSchema {
                name: CourseQaAnswer::SCHEMA_NAME.into(),
                schema: CourseQaAnswer::json_schema(),
            }),
            max_output_tokens: Some(self.config.max_output_tokens),
            temperature: None,
        };
        Box::pin(async_stream::stream! {
            let Some(llm) = llm else {
                if draft_mode {
                    let draft = draft_course_answer();
                    yield Ok(Step::Delta(draft.answer_markdown.clone()));
                    yield Ok(Step::Final { answer: draft, model_name: DRAFT_MODEL.into(), usage: Usage::default() });
                } else {
                    yield Err(Error::app(ErrorCode::AiDisabled, "AI provider is not configured and draft mode is off"));
                }
                return;
            };
            let opened = tokio::select! {
                opened = llm.stream(&request) => opened,
                () = token.cancelled() => { yield Err(cancelled_error()); return; }
            };
            let mut chunks = match opened {
                Ok(chunks) => chunks,
                Err(err) if draft_mode => {
                    tracing::warn!(%err, "qa provider unavailable; answering in draft mode");
                    let draft = draft_course_answer();
                    yield Ok(Step::Delta(draft.answer_markdown.clone()));
                    yield Ok(Step::Final { answer: draft, model_name: DRAFT_MODEL.into(), usage: Usage::default() });
                    return;
                }
                Err(err) => { yield Err(Error::from(err)); return; }
            };
            let mut buffer = String::new();
            let mut sent = String::new();
            let mut done = None;
            loop {
                let next = tokio::select! {
                    next = chunks.next() => next,
                    () = token.cancelled() => { yield Err(cancelled_error()); return; }
                };
                match next {
                    Some(Ok(StreamChunk::Delta(text))) => {
                        buffer.push_str(&text);
                        if let Some(partial) = partial_string_field(&buffer, "answer_markdown")
                            && partial.len() > sent.len()
                            && partial.starts_with(&sent)
                        {
                            let delta = partial[sent.len()..].to_owned();
                            sent = partial;
                            yield Ok(Step::Delta(delta));
                        }
                    }
                    Some(Ok(StreamChunk::Done { model_name, usage })) => {
                        done = Some((model_name, usage));
                        break;
                    }
                    Some(Err(err)) => { yield Err(Error::from(err)); return; }
                    None => break,
                }
            }
            let Some((model_name, usage)) = done else {
                yield Err(Error::app(ErrorCode::AiProviderUnavailable, "stream ended before completion"));
                return;
            };
            let parsed = extract_json(&buffer)
                .and_then(|value| serde_json::from_value::<CourseQaAnswer>(value).map_err(|e| e.to_string()));
            let answer = match parsed {
                Ok(answer) => answer,
                Err(err) => {
                    yield Err(Error::app(ErrorCode::AiProviderUnavailable, format!("unusable model reply: {err}")));
                    return;
                }
            };
            if answer.answer_markdown.len() > sent.len() && answer.answer_markdown.starts_with(&sent) {
                yield Ok(Step::Delta(answer.answer_markdown[sent.len()..].to_owned()));
            }
            yield Ok(Step::Final { answer, model_name, usage });
        })
    }

    /// Legacy tail of `stream_course_question_events`: validation, the
    /// run's artifact + evidence + ledger, the assistant message.
    async fn qa_finish(
        &self,
        session: &QaSession,
        mut answer: CourseQaAnswer,
        model_name: &str,
        usage: Usage,
    ) -> Result<QaFinished> {
        let run_id = session.run.id;
        self.emit_validation_event(run_id).await?;
        for citation in &mut answer.citations {
            citation.normalize();
        }
        let artifact = serde_json::to_value(&answer)
            .map_err(|e| Error::internal("serialising qa artifact", e))?;
        let citations = answer
            .citations
            .iter()
            .map(|c| serde_json::to_value(c).unwrap_or(serde_json::Value::Null))
            .collect();
        let trusted = self
            .finish_run(FinishSpec {
                run_id,
                user_id: session.user_id,
                artifact_kind: ARTIFACT_KIND,
                model_name,
                artifact: artifact.clone(),
                citations,
                input_tokens: session.input_tokens,
                output_tokens: usage.output_tokens,
                context_sources: Some(&session.sources),
            })
            .await?;
        let artifact = redact::redacted(artifact);
        let content = artifact
            .get("answer_markdown")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        let message_id = ab_db::ai::insert_qa_message(
            &self.pool,
            NewQaMessage {
                thread_id: session.thread.id,
                course_id: session
                    .thread
                    .course_id
                    .unwrap_or(session.user_message.course_id),
                user_id: session.user_id,
                role: QaMessageRole::Assistant,
                client_turn_id: None,
                content,
                confidence: Some(answer.confidence.as_str()),
                citations: &serde_json::json!({ "citations": trusted }),
                metadata: &serde_json::json!({
                    "model_name": model_name,
                    "out_of_scope": answer.out_of_scope,
                    "reply_to_message_id": session.user_message.id,
                }),
            },
        )
        .await?;
        ab_db::ai::touch_thread(&self.pool, session.thread.id).await?;
        Ok(QaFinished {
            message_id,
            citations: trusted,
            confidence: answer.confidence,
            follow_up_suggestions: answer.follow_up_suggestions,
        })
    }

    /// Stream one prepared turn. Dropping the stream before it settles
    /// aborts the run and keeps the partial answer (client disconnect).
    #[must_use]
    pub fn stream_qa(&self, session: QaSession) -> QaStream {
        let service = self.clone();
        Box::pin(async_stream::stream! {
            let run_id = session.run.id;
            let thread_id = session.thread.id;
            let watch = service.cancel_watch(run_id);
            let mut guard = IncompleteGuard {
                service: service.clone(),
                session_ids: (
                    thread_id,
                    session.user_message.course_id,
                    session.user_id,
                    session.user_message.id,
                ),
                run_id,
                text: String::new(),
                settled: false,
            };
            if let Err(err) = service
                .emit_execution_events(run_id, session.sources.len(), session.input_tokens)
                .await
            {
                tracing::warn!(%run_id, %err, "qa execution events not journaled");
                service.fail_run(run_id, FAIL_CODE).await;
                guard.settle();
                yield QaTurn::Error { code: FAIL_CODE, message: FAIL_CODE };
                return;
            }
            let mut steps = service.answer_steps(&session, watch.token.clone());
            let mut text = String::new();
            let mut outcome: Option<Result<(CourseQaAnswer, String, Usage)>> = None;
            while let Some(step) = steps.next().await {
                match step {
                    Ok(Step::Delta(delta)) => {
                        if text.is_empty() {
                            let ms = i64::try_from(session.started.elapsed().as_millis()).unwrap_or(i64::MAX);
                            if let Err(err) = ab_db::ai::merge_run_metadata(
                                &service.pool,
                                run_id,
                                &serde_json::json!({ "time_to_first_text_ms": ms }),
                            )
                            .await
                            {
                                tracing::warn!(%run_id, %err, "time_to_first_text not recorded");
                            }
                        }
                        text.push_str(&delta);
                        guard.record(&text);
                        yield QaTurn::Delta(delta);
                    }
                    Ok(Step::Final { answer, model_name, usage }) => {
                        outcome = Some(Ok((answer, model_name, usage)));
                        break;
                    }
                    Err(err) => {
                        outcome = Some(Err(err));
                        break;
                    }
                }
            }
            drop(steps);
            let result = match outcome {
                Some(Ok((answer, model_name, usage))) => {
                    service.qa_finish(&session, answer, &model_name, usage).await
                }
                Some(Err(err)) => Err(err),
                None => Err(Error::app(
                    ErrorCode::AiProviderUnavailable,
                    "the answer stream ended without a final answer",
                )),
            };
            guard.settle();
            match result {
                Ok(finished) => {
                    if !finished.citations.is_empty() {
                        yield QaTurn::Citations(finished.citations);
                    }
                    yield QaTurn::Finished {
                        thread_id,
                        message_id: finished.message_id,
                        confidence: finished.confidence,
                        follow_up_suggestions: finished.follow_up_suggestions,
                    };
                }
                Err(err) if is_cancelled(&err) => {
                    yield QaTurn::Error { code: "CANCELLED", message: "AI_RUN_CANCELLED" };
                }
                Err(err) => {
                    tracing::warn!(%run_id, %err, "course qa turn failed");
                    service.fail_run(run_id, FAIL_CODE).await;
                    yield QaTurn::Error { code: FAIL_CODE, message: FAIL_CODE };
                }
            }
        })
    }

    // ── Threads ─────────────────────────────────────────────────────────

    /// `GET /ai/qa/{course}/threads`: the caller's threads with messages,
    /// newest activity first.
    pub async fn list_qa_threads(
        &self,
        actor: &Actor,
        course_id: CourseId,
        limit: i64,
    ) -> Result<Vec<ThreadSummaryRow>> {
        self.visible_course(actor, course_id).await?;
        ab_db::ai::list_course_threads(&self.pool, course_id, actor.user_id, limit.clamp(1, 50))
            .await
    }

    async fn owned_qa_thread(
        &self,
        actor: &Actor,
        course_id: CourseId,
        thread_id: AiThreadId,
    ) -> Result<ThreadRow> {
        let thread =
            ab_db::ai::find_owned_course_thread(&self.pool, thread_id, actor.user_id, course_id)
                .await?
                .ok_or_else(|| Error::not_found("ai thread"))?;
        self.visible_course(actor, course_id).await?;
        Ok(thread)
    }

    /// `GET /ai/qa/{course}/threads/{thread}`: the transcript, oldest first.
    pub async fn qa_thread_messages(
        &self,
        actor: &Actor,
        course_id: CourseId,
        thread_id: AiThreadId,
    ) -> Result<Vec<QaMessageRow>> {
        self.owned_qa_thread(actor, course_id, thread_id).await?;
        ab_db::ai::list_thread_messages(&self.pool, thread_id).await
    }

    /// `DELETE /ai/qa/{course}/threads/{thread}` (messages and runs cascade).
    pub async fn delete_qa_thread(
        &self,
        actor: &Actor,
        course_id: CourseId,
        thread_id: AiThreadId,
    ) -> Result<()> {
        self.owned_qa_thread(actor, course_id, thread_id).await?;
        ab_db::ai::delete_thread(&self.pool, thread_id).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn draft_answer_is_the_legacy_text() {
        let draft = draft_course_answer();
        assert!(draft.answer_markdown.starts_with("Вопросы и ответы"));
        assert_eq!(draft.citations[0].citation_id, "qa-draft");
        assert_eq!(draft.follow_up_suggestions.len(), 2);
        assert!(!draft.out_of_scope);
    }

    #[test]
    fn questions_are_trimmed_and_bounded() {
        assert_eq!(validate_question("  hi  ").unwrap_or_default(), "hi");
        assert!(validate_question("   ").is_err());
        assert!(validate_question(&"x".repeat(MAX_QUESTION_CHARS + 1)).is_err());
    }
}
