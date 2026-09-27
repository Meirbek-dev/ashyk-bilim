//! The six agents.
//!
//! The six agents (legacy `services/ai/agents/*` + the `run_*`/`queue_*`
//! operations). Each module owns one feature end to end: gates, context,
//! the model call (or its draft-mode stand-in), the artifact, the feature
//! record, and the reads/mutations of that record.
//!
//! [`AiService::run_structured`] is the shared non-streaming pipeline:
//! execution events → structured completion → validation event →
//! redaction → [`AiService::finish_run`]; the agent adds its feature record
//! to the open completion and commits it ([`AiService::commit_finish`]).

pub mod course_analyst;
pub mod course_qa;
pub mod lecture_author;
pub mod remediation_generator;
pub mod study_companion;
pub mod submission_analyst;

use ab_clients::llm::{ChatMessage, CompletionRequest, OutputSchema, Usage};
use ab_core::id::{AiRunId, UserId};
use ab_core::{Error, ErrorCode, Result};
use ab_db::ai::RunRow;
use serde::Serialize;
use serde::de::DeserializeOwned;
use tokio_util::sync::CancellationToken;

use super::AiService;
use super::budget::Reservation;
use super::context::{ContextBundle, ContextSource};
use super::runs::{Completion, FinishSpec, with_cancel};
use super::schemas::Citation;

/// Legacy `model_name` for the deterministic fallbacks.
pub const DRAFT_MODEL: &str = "draft-mode";

/// One request as it will be sent, admitted (BUG-325 / BUG-349): the
/// context fitted so the whole message set fits the per-request cap, and
/// that estimate plus the output bound reserved against the month.
pub(crate) struct Admitted {
    pub instructions: &'static str,
    /// The fitted context rendering.
    pub context: String,
    /// The user turn, built around `context`.
    pub prompt: String,
    /// The sources `context` lists — the only citable ones.
    pub sources: Vec<ContextSource>,
    pub reservation: Reservation,
}

/// What one agent step needs to execute against a run.
pub(crate) struct Execution<'a> {
    pub run: &'a RunRow,
    pub token: &'a CancellationToken,
    pub admitted: &'a Admitted,
    pub user_id: UserId,
}

/// A parsed model reply plus its accounting.
pub(crate) struct ModelOutcome<T> {
    pub value: T,
    pub model_name: String,
    pub usage: Usage,
}

/// The result of one finished structured step, not yet committed.
pub(crate) struct Finished<T> {
    pub value: T,
    /// The redacted artifact as stored.
    pub artifact: serde_json::Value,
    pub model_name: String,
    /// The run's success; the feature record joins it before the commit.
    pub completion: Completion,
}

fn metadata_str<'a>(run: &'a RunRow, key: &str) -> Option<&'a str> {
    run.metadata.get(key).and_then(serde_json::Value::as_str)
}

/// A typed id stored in the run metadata (`course_id`, `submission_id`, …).
pub(crate) fn metadata_id<T: std::str::FromStr>(run: &RunRow, key: &str) -> Result<T> {
    metadata_str(run, key)
        .and_then(|s| s.parse::<T>().ok())
        .ok_or_else(|| Error::conflict(format!("ai run metadata lacks {key}")))
}

pub(crate) fn metadata_optional_id<T: std::str::FromStr>(run: &RunRow, key: &str) -> Option<T> {
    metadata_str(run, key).and_then(|s| s.parse::<T>().ok())
}

pub(crate) fn metadata_language(run: &RunRow) -> String {
    metadata_str(run, "language")
        .filter(|l| !l.is_empty())
        .unwrap_or("auto")
        .to_owned()
}

/// The user a queued run acts for (legacy `_public_user_for_run`).
pub(crate) fn run_user(run: &RunRow) -> Result<UserId> {
    run.triggered_by
        .ok_or_else(|| Error::conflict("ai run has no triggering user"))
}

impl AiService {
    /// Admit one request: cut `bundle` so the system prompt, `history` and
    /// the user turn `prompt(context)` — exactly what is sent — fit the
    /// per-request cap (only a turn too large on its own is refused), then
    /// reserve it (BUG-349). `run` ties the reservation to an existing run.
    pub(crate) async fn admit(
        &self,
        bundle: ContextBundle,
        instructions: &'static str,
        history: &[ChatMessage],
        run: Option<AiRunId>,
        prompt: impl Fn(&str) -> String,
    ) -> Result<Admitted> {
        let head = std::iter::once(instructions)
            .chain(history.iter().map(|m| m.content.as_str()))
            .collect::<Vec<_>>()
            .join("\n");
        let (context, sources) =
            bundle.fitted(|context| self.budget.fits(&format!("{head}\n{}", prompt(context))));
        let prompt = prompt(&context);
        let reservation = self
            .budget
            .reserve(&self.pool, &format!("{head}\n{prompt}"), run)
            .await?;
        Ok(Admitted {
            instructions,
            context,
            prompt,
            sources,
            reservation,
        })
    }

    /// One structured completion, or the deterministic draft when no
    /// provider is configured and draft mode is on (legacy
    /// `except AIProviderUnavailable: if ai_draft_mode_enabled`).
    pub(crate) async fn structured_or_draft<T>(
        &self,
        token: &CancellationToken,
        instructions: &str,
        prompt: &str,
        schema: OutputSchema,
        history: Vec<ChatMessage>,
        draft: impl FnOnce() -> T,
    ) -> Result<ModelOutcome<T>>
    where
        T: DeserializeOwned,
    {
        let Some(llm) = self.provider() else {
            if self.config.ai_draft_mode_enabled {
                return Ok(ModelOutcome {
                    value: draft(),
                    model_name: DRAFT_MODEL.to_owned(),
                    usage: Usage::default(),
                });
            }
            return Err(Error::app(
                ErrorCode::AiDisabled,
                "AI provider is not configured and draft mode is off",
            ));
        };
        let mut messages = Vec::with_capacity(history.len() + 2);
        messages.push(ChatMessage::system(instructions));
        messages.extend(history);
        messages.push(ChatMessage::user(prompt));
        let request = CompletionRequest {
            messages,
            output_schema: Some(schema),
            max_output_tokens: Some(self.config.max_output_tokens),
            temperature: None,
        };
        let structured = with_cancel(token, async {
            llm.complete_structured::<T>(&request)
                .await
                .map_err(Error::from)
        })
        .await?;
        Ok(ModelOutcome {
            value: structured.value,
            model_name: structured.completion.model_name,
            usage: structured.completion.usage,
        })
    }

    /// The shared non-streaming pipeline around one structured completion.
    pub(crate) async fn run_structured<T>(
        &self,
        exec: &Execution<'_>,
        artifact_kind: &str,
        schema: OutputSchema,
        citations_of: impl Fn(&T) -> &[Citation],
        draft: impl FnOnce() -> T,
    ) -> Result<Finished<T>>
    where
        T: DeserializeOwned + Serialize,
    {
        let run_id = exec.run.id;
        let admitted = exec.admitted;
        ab_db::ai::attach_reservation(&self.pool, admitted.reservation.id, run_id).await?;
        self.emit_execution_events(
            run_id,
            admitted.sources.len(),
            admitted.reservation.input_tokens,
        )
        .await?;
        self.ensure_not_cancelled(run_id).await?;
        let outcome = self
            .structured_or_draft::<T>(
                exec.token,
                admitted.instructions,
                &admitted.prompt,
                schema,
                Vec::new(),
                draft,
            )
            .await?;
        self.emit_validation_event(run_id).await?;
        let artifact = serde_json::to_value(&outcome.value)
            .map_err(|e| Error::internal("serialising ai artifact", e))?;
        let citations = citations_of(&outcome.value)
            .iter()
            .map(|c| {
                let mut c = c.clone();
                c.normalize();
                serde_json::to_value(c).unwrap_or(serde_json::Value::Null)
            })
            .collect();
        let completion = self
            .finish_run(FinishSpec {
                run_id,
                user_id: exec.user_id,
                artifact_kind,
                model_name: &outcome.model_name,
                artifact: artifact.clone(),
                citations,
                estimated_input_tokens: admitted.reservation.input_tokens,
                usage: outcome.usage,
                context_sources: Some(&admitted.sources),
            })
            .await?;
        Ok(Finished {
            value: outcome.value,
            artifact: super::redact::redacted(artifact),
            model_name: outcome.model_name,
            completion,
        })
    }
}

/// The evidence blob stored next to feature records.
pub(crate) fn evidence_json(citations: &[serde_json::Value]) -> serde_json::Value {
    serde_json::json!({ "citations": citations })
}

/// Legacy draft citation (all six agents share the shape).
pub(crate) fn draft_citation(id: &str, label: &str, source_type: &str, excerpt: &str) -> Citation {
    Citation {
        citation_id: id.into(),
        label: label.into(),
        source_type: source_type.into(),
        source_uuid: None,
        excerpt: excerpt.into(),
        confidence: 0.4,
    }
}
