//! The run runtime: creation, guarded state transitions, journaled events
//! (Postgres, mirrored to Redis), artifacts + evidence, the token ledger,
//! cancellation, the worker entry point and the admin/usage reads.
//!
//! Legacy `operations.py` `_create_run` / `_emit_run_event` / `_finish_run`
//! / `_fail_run` / `_abort_run` / `execute_queued_ai_run`, with the status
//! machine made explicit: `queued → running → {succeeded, failed, aborted}`.

use std::time::Duration;

use ab_core::ai::{AiFeature, AiRunKind, AiRunStatus, AiThreadRole};
use ab_core::id::{ActivityId, AiRunId, AiThreadId, CourseId, UserId};
use ab_core::{Error, ErrorCode, Result};
use ab_db::ai::{
    ArtifactRow, EvalResultRow, EvalSummary, EventRow, EvidenceRow, LedgerRow, RunAggregate,
    RunFilter, RunRow,
};
use ab_db::queue::NewJob;
use tokio_util::sync::CancellationToken;

use super::AiService;
use super::context::{ContextSource, validate_citations};
use super::policy::require_admin;
use super::redact;
use crate::identity::Actor;

/// The worker job kind that executes a queued run (payload `{run_id}`).
pub const EXECUTE_RUN_JOB: &str = "ai:execute_run";

/// How often an executing run re-reads its status to notice a cancel.
const CANCEL_POLL: Duration = Duration::from_secs(1);
/// Legacy admin `stuck` heuristic: queued/running for over ten minutes.
pub const STUCK_AFTER_SECS: i64 = 10 * 60;

pub(crate) struct RunSpec<'a> {
    pub kind: AiRunKind,
    pub role: AiThreadRole,
    pub queued: bool,
    pub course_id: Option<CourseId>,
    pub activity_id: Option<ActivityId>,
    pub metadata: serde_json::Value,
    /// Continue an existing thread (Q&A) instead of opening one.
    pub thread: Option<AiThreadId>,
    pub title: Option<&'a str>,
}

pub(crate) struct FinishSpec<'a> {
    pub run_id: AiRunId,
    pub user_id: UserId,
    pub artifact_kind: &'a str,
    pub model_name: &'a str,
    pub artifact: serde_json::Value,
    pub citations: Vec<serde_json::Value>,
    pub input_tokens: i32,
    /// Provider-reported completion tokens; estimated from the artifact
    /// when absent (legacy always estimated).
    pub output_tokens: Option<u32>,
    /// `None` = citations are not validated (legacy `not_applicable`).
    pub context_sources: Option<&'a [ContextSource]>,
}

/// Cancels its token when the run is aborted underneath the executor.
pub(crate) struct CancelWatch {
    pub token: CancellationToken,
    handle: tokio::task::JoinHandle<()>,
}

impl Drop for CancelWatch {
    fn drop(&mut self) {
        self.handle.abort();
    }
}

pub(crate) fn cancelled_error() -> Error {
    Error::app(ErrorCode::AiRunCancelled, "AI run was cancelled")
}

pub(crate) fn is_cancelled(err: &Error) -> bool {
    err.code() == ErrorCode::AiRunCancelled
}

/// Run `fut` unless `token` fires first.
pub(crate) async fn with_cancel<T>(
    token: &CancellationToken,
    fut: impl Future<Output = Result<T>>,
) -> Result<T> {
    tokio::select! {
        result = fut => result,
        () = token.cancelled() => Err(cancelled_error()),
    }
}

/// Legacy `_safe_run_context` allowlist for admin views.
const SAFE_CONTEXT_KEYS: &[&str] = &[
    "activity_id",
    "citation_validation",
    "context_source_count",
    "course_id",
    "kind",
    "submission_id",
    "thread_id",
    "time_to_first_text_ms",
    "retry_count",
    "language",
    "mode",
];

#[must_use]
pub fn safe_run_context(metadata: &serde_json::Value) -> serde_json::Value {
    let Some(map) = metadata.as_object() else {
        return serde_json::json!({});
    };
    serde_json::Value::Object(
        map.iter()
            .filter(|(k, _)| SAFE_CONTEXT_KEYS.contains(&k.as_str()))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
    )
}

#[derive(Debug, Clone)]
pub struct AdminSettings {
    pub ai_enabled: bool,
    pub provider_ready: bool,
    pub model: String,
    pub monthly_token_budget: i64,
    pub max_tokens_per_request: u32,
    pub max_output_tokens: u32,
    pub draft_mode_enabled: bool,
    /// `(feature key, enabled)` in the legacy order.
    pub features: Vec<(AiFeature, bool)>,
    /// The whole section, secrets redacted.
    pub effective: serde_json::Value,
}

#[derive(Debug, Clone, Default)]
pub struct RunListQuery {
    pub days: i32,
    pub status: Option<AiRunStatus>,
    pub kind: Option<AiRunKind>,
    pub provider: Option<String>,
    pub course_id: Option<CourseId>,
    pub cursor: Option<AiRunId>,
    pub limit: i64,
}

#[derive(Debug, Clone)]
pub struct RunDetail {
    pub run: RunRow,
    pub events: Vec<EventRow>,
    pub artifacts: Vec<ArtifactRow>,
    pub evidence: Vec<EvidenceRow>,
}

#[derive(Debug, Clone)]
pub struct EvalDashboard {
    pub runs: RunAggregate,
    pub evals: EvalSummary,
    pub recent: Vec<EvalResultRow>,
}

/// Outcome of `ashyq admin ai-eval`.
#[derive(Debug, Clone)]
pub struct EvalReport {
    pub model_name: String,
    pub total: usize,
    pub passed: usize,
}

#[derive(Debug, Clone)]
pub struct UsageSummary {
    pub total_runs: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub monthly_budget: i64,
    pub remaining_budget: i64,
    pub users: Vec<LedgerRow>,
}

impl AiService {
    // ── Lifecycle ───────────────────────────────────────────────────────

    /// Open (or re-scope) the thread, insert the run, journal the first
    /// event (legacy `_create_run`).
    pub(crate) async fn create_run(&self, user_id: UserId, spec: RunSpec<'_>) -> Result<RunRow> {
        let thread_id = match spec.thread {
            Some(id) => {
                ab_db::ai::rescope_thread(
                    &self.pool,
                    id,
                    spec.role,
                    spec.course_id,
                    spec.activity_id,
                )
                .await?;
                id
            }
            None => {
                let title = spec
                    .title
                    .map_or_else(|| title_for(spec.kind), str::to_owned);
                ab_db::ai::insert_thread(
                    &self.pool,
                    user_id,
                    spec.role,
                    spec.course_id,
                    spec.activity_id,
                    Some(&title),
                )
                .await?
            }
        };
        let status = if spec.queued {
            AiRunStatus::Queued
        } else {
            AiRunStatus::Running
        };
        let mut metadata = spec.metadata;
        if let Some(map) = metadata.as_object_mut() {
            map.insert("kind".into(), spec.kind.as_str().into());
            map.insert("thread_id".into(), serde_json::json!(thread_id));
        }
        let run_id =
            ab_db::ai::insert_run(&self.pool, thread_id, spec.kind, status, user_id, &metadata)
                .await?;
        self.emit(
            run_id,
            status.as_str(),
            serde_json::json!({ "state": status.as_str() }),
        )
        .await?;
        ab_db::ai::get_run(&self.pool, run_id)
            .await?
            .ok_or_else(|| Error::not_found("ai run"))
    }

    /// Journal one event durably, then mirror it to the run's stream.
    pub(crate) async fn emit(
        &self,
        run_id: AiRunId,
        event_type: &str,
        payload: serde_json::Value,
    ) -> Result<EventRow> {
        let row = ab_db::ai::append_event(&self.pool, run_id, event_type, &payload).await?;
        if let Some(events) = &self.events {
            events
                .publish_best_effort(run_id, row.sequence, event_type, &payload)
                .await;
        }
        Ok(row)
    }

    /// Legacy `_ensure_run_not_cancelled`.
    pub(crate) async fn ensure_not_cancelled(&self, run_id: AiRunId) -> Result<()> {
        match ab_db::ai::get_run_status(&self.pool, run_id).await? {
            Some(AiRunStatus::Aborted) => Err(cancelled_error()),
            Some(_) => Ok(()),
            None => Err(Error::not_found("ai run")),
        }
    }

    /// Legacy `_mark_run_running`: a queued run starts; a running one is
    /// left alone; an aborted one refuses.
    pub(crate) async fn mark_running(&self, run_id: AiRunId) -> Result<()> {
        match ab_db::ai::get_run_status(&self.pool, run_id).await? {
            Some(AiRunStatus::Running) => Ok(()),
            Some(AiRunStatus::Queued) => {
                if !ab_db::ai::mark_running(&self.pool, run_id).await? {
                    return Err(cancelled_error());
                }
                self.emit(run_id, "running", serde_json::json!({ "state": "running" }))
                    .await?;
                Ok(())
            }
            Some(AiRunStatus::Aborted) => Err(cancelled_error()),
            Some(status) => Err(Error::conflict(format!("ai run is already {status}"))),
            None => Err(Error::not_found("ai run")),
        }
    }

    /// Legacy `_emit_execution_events`.
    pub(crate) async fn emit_execution_events(
        &self,
        run_id: AiRunId,
        source_count: usize,
        input_tokens: i32,
    ) -> Result<()> {
        self.emit(
            run_id,
            "collecting_context",
            serde_json::json!({ "state": "collecting_context", "source_count": source_count }),
        )
        .await?;
        self.emit(
            run_id,
            "budget_checked",
            serde_json::json!({ "state": "running", "input_tokens": input_tokens }),
        )
        .await?;
        self.emit(
            run_id,
            "model_started",
            serde_json::json!({ "state": "running" }),
        )
        .await?;
        Ok(())
    }

    pub(crate) async fn emit_validation_event(&self, run_id: AiRunId) -> Result<()> {
        self.emit(
            run_id,
            "validating_output",
            serde_json::json!({ "state": "checking_evidence" }),
        )
        .await?;
        Ok(())
    }

    /// Legacy `_finish_run`: validate citations, `running → succeeded`,
    /// store the artifact + evidence, account tokens. Returns the trusted
    /// citations.
    pub(crate) async fn finish_run(&self, spec: FinishSpec<'_>) -> Result<Vec<serde_json::Value>> {
        let artifact = redact::redacted(spec.artifact);
        let citations: Vec<serde_json::Value> =
            spec.citations.into_iter().map(redact::redacted).collect();
        self.ensure_not_cancelled(spec.run_id).await?;
        let (trusted, validation_meta, invalid_count) = match spec.context_sources {
            Some(sources) => {
                let validation = validate_citations(&citations, sources);
                let invalid = validation.invalid.len();
                let metadata = validation.metadata();
                (validation.valid, metadata, invalid)
            }
            None => (
                citations,
                serde_json::json!({ "validation": "not_applicable" }),
                0,
            ),
        };
        self.emit(
            spec.run_id,
            "saving_artifact",
            serde_json::json!({ "state": "checking_evidence" }),
        )
        .await?;
        let output_tokens = spec.output_tokens.map_or_else(
            || {
                self.budget
                    .estimate_for(&artifact.to_string(), spec.model_name)
            },
            |n| i32::try_from(n).unwrap_or(i32::MAX),
        );
        let moved = ab_db::ai::finish_run(
            &self.pool,
            spec.run_id,
            spec.model_name,
            spec.input_tokens,
            output_tokens,
            &serde_json::json!({ "citation_validation": validation_meta }),
        )
        .await?;
        if !moved {
            // Cancelled between the check above and the update.
            return Err(cancelled_error());
        }
        let artifact_id = ab_db::ai::insert_artifact(
            &self.pool,
            spec.run_id,
            spec.artifact_kind,
            &artifact,
            true,
        )
        .await?;
        for (index, citation) in trusted.iter().enumerate() {
            let get = |k: &str| citation.get(k).and_then(serde_json::Value::as_str);
            let fallback_id = format!("citation-{}", index + 1);
            ab_db::ai::insert_evidence(
                &self.pool,
                spec.run_id,
                artifact_id,
                ab_db::ai::NewEvidence {
                    citation_id: get("citation_id").unwrap_or(&fallback_id),
                    label: get("label").unwrap_or("AI evidence"),
                    source_type: get("source_type").unwrap_or("unknown"),
                    source_ref: get("source_uuid"),
                    excerpt: get("excerpt").unwrap_or_default(),
                    score: Some(
                        citation
                            .get("confidence")
                            .and_then(serde_json::Value::as_f64)
                            .unwrap_or(0.75)
                            .clamp(0.0, 1.0),
                    ),
                },
            )
            .await?;
        }
        ab_db::ai::ledger_record(
            &self.pool,
            spec.user_id,
            i64::from(spec.input_tokens),
            i64::from(output_tokens),
        )
        .await?;
        self.emit(
            spec.run_id,
            "finished",
            serde_json::json!({
                "state": "complete",
                "model_name": spec.model_name,
                "input_tokens": spec.input_tokens,
                "output_tokens": output_tokens,
                "citations_valid": trusted.len(),
                "citations_invalid": invalid_count,
            }),
        )
        .await?;
        Ok(trusted)
    }

    /// Legacy `_fail_run`: best-effort — an aborted run stays aborted, and
    /// a failure to record the failure is logged, not raised.
    pub(crate) async fn fail_run(&self, run_id: AiRunId, error_code: &str) {
        match ab_db::ai::fail_run(&self.pool, run_id, error_code).await {
            Ok(true) => {
                if let Err(err) = self
                    .emit(
                        run_id,
                        "failed",
                        serde_json::json!({ "state": "failed", "error_code": error_code }),
                    )
                    .await
                {
                    tracing::warn!(%run_id, %err, "failed event not journaled");
                }
            }
            Ok(false) => {}
            Err(err) => tracing::error!(%run_id, %err, "could not mark ai run failed"),
        }
    }

    /// Run `fut`; on a non-cancellation error mark the run failed with
    /// `error_code` (legacy `except Exception: _fail_run(...)`).
    pub(crate) async fn settle<T>(
        &self,
        run_id: AiRunId,
        error_code: &str,
        fut: impl Future<Output = Result<T>>,
    ) -> Result<T> {
        match fut.await {
            Ok(value) => Ok(value),
            Err(err) => {
                if !is_cancelled(&err) {
                    tracing::warn!(%run_id, error = %err, error_code, "ai run failed");
                    self.fail_run(run_id, error_code).await;
                }
                Err(err)
            }
        }
    }

    /// A watcher that cancels the token when the run is aborted from the
    /// outside (the cancel endpoint flips the status; the executor polls).
    pub(crate) fn cancel_watch(&self, run_id: AiRunId) -> CancelWatch {
        let token = CancellationToken::new();
        let pool = self.pool.clone();
        let watcher = token.clone();
        let handle = tokio::spawn(async move {
            loop {
                tokio::time::sleep(CANCEL_POLL).await;
                match ab_db::ai::get_run_status(&pool, run_id).await {
                    Ok(Some(AiRunStatus::Aborted)) => {
                        watcher.cancel();
                        break;
                    }
                    Ok(Some(status)) if status.is_terminal() => break,
                    Ok(Some(_)) => {}
                    Ok(None) => break,
                    Err(err) => tracing::warn!(%run_id, %err, "cancel watch poll failed"),
                }
            }
        });
        CancelWatch { token, handle }
    }

    /// Hand a queued run to the worker (legacy `_enqueue_or_fail`).
    pub(crate) async fn enqueue_run(&self, run_id: AiRunId) -> Result<()> {
        let job = NewJob::new(EXECUTE_RUN_JOB, serde_json::json!({ "run_id": run_id }))
            .max_attempts(3)
            .dedupe(format!("ai:run:{run_id}"));
        if let Err(err) = ab_db::queue::enqueue(&self.pool, &job).await {
            self.fail_run(run_id, "AI_QUEUE_UNAVAILABLE").await;
            return Err(err);
        }
        Ok(())
    }

    /// Worker entry point (legacy `execute_queued_ai_run`). Terminal runs
    /// are no-ops; application failures are recorded on the run and the job
    /// succeeds; infrastructure failures bubble up for a retry.
    pub async fn execute_queued(&self, run_id: AiRunId) -> Result<()> {
        let Some(run) = ab_db::ai::get_run(&self.pool, run_id).await? else {
            return Err(Error::not_found("ai run"));
        };
        if run.status.is_terminal() {
            return Ok(());
        }
        let watch = self.cancel_watch(run.id);
        let outcome = match run.kind {
            AiRunKind::CourseAnalysis => {
                self.execute_queued_course_analysis(&run, &watch.token)
                    .await
            }
            AiRunKind::SubmissionAnalysis => {
                self.execute_queued_submission_analysis(&run, &watch.token)
                    .await
            }
            AiRunKind::Remediation => self.execute_queued_remediation(&run, &watch.token).await,
            AiRunKind::StudyCompanion => {
                self.execute_queued_study_companion(&run, &watch.token)
                    .await
            }
            AiRunKind::LectureReview => {
                self.execute_queued_lecture_review(&run, &watch.token).await
            }
            AiRunKind::CourseQa => {
                self.fail_run(run.id, "AI_RUN_KIND_UNSUPPORTED").await;
                Err(Error::conflict("course_qa runs are streamed, not queued"))
            }
        };
        match outcome {
            Ok(()) => Ok(()),
            Err(err) if is_cancelled(&err) => Ok(()),
            Err(err) if err.is_public() => {
                tracing::warn!(%run_id, %err, "queued ai run failed");
                Ok(())
            }
            Err(err) => Err(err),
        }
    }

    /// Re-read the run after a step (fresh status/metadata).
    pub(crate) async fn reload_run(&self, run_id: AiRunId) -> Result<RunRow> {
        ab_db::ai::get_run(&self.pool, run_id)
            .await?
            .ok_or_else(|| Error::not_found("ai run"))
    }

    // ── Reads (owner or platform reader) ────────────────────────────────

    pub(crate) async fn accessible_run(&self, actor: &Actor, id: AiRunId) -> Result<RunRow> {
        let run = ab_db::ai::get_run(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("ai run"))?;
        self.require_run_access(actor, &run).await?;
        Ok(run)
    }

    pub async fn get_run(&self, actor: &Actor, id: AiRunId) -> Result<RunRow> {
        self.accessible_run(actor, id).await
    }

    pub async fn run_events(&self, actor: &Actor, id: AiRunId) -> Result<Vec<EventRow>> {
        self.accessible_run(actor, id).await?;
        ab_db::ai::list_events(&self.pool, id).await
    }

    pub async fn run_artifacts(&self, actor: &Actor, id: AiRunId) -> Result<Vec<ArtifactRow>> {
        self.accessible_run(actor, id).await?;
        ab_db::ai::list_artifacts(&self.pool, id).await
    }

    /// Legacy cancel: terminal runs are returned as-is; live runs flip to
    /// `aborted` with a `cancelled` event (the executor notices via its
    /// watch).
    pub async fn cancel_run(&self, actor: &Actor, id: AiRunId) -> Result<RunRow> {
        let run = self.accessible_run(actor, id).await?;
        if run.status.is_terminal() {
            return Ok(run);
        }
        if ab_db::ai::abort_run(&self.pool, id).await? {
            self.emit(
                id,
                "cancelled",
                serde_json::json!({ "state": "cancelled", "error_code": "CANCELLED" }),
            )
            .await?;
        }
        self.reload_run(id).await
    }

    // ── Admin surface (`platform:read:platform`) ────────────────────────

    pub fn admin_settings(&self, actor: &Actor) -> Result<AdminSettings> {
        require_admin(actor)?;
        let c = &self.config;
        let model = if c.openai_api_key.is_some() {
            c.openai_model.clone()
        } else {
            c.openrouter_model.clone()
        };
        let features = [
            AiFeature::CourseAnalysis,
            AiFeature::SubmissionAnalysis,
            AiFeature::Remediation,
            AiFeature::CourseQa,
            AiFeature::StudyCompanion,
            AiFeature::LectureAuthoring,
            AiFeature::SemanticMemory,
        ]
        .into_iter()
        .map(|f| (f, c.feature_enabled(f)))
        .collect();
        Ok(AdminSettings {
            ai_enabled: c.ai_enabled,
            provider_ready: c.provider_ready(),
            model,
            monthly_token_budget: c.monthly_token_budget,
            max_tokens_per_request: c.max_tokens_per_request,
            max_output_tokens: c.max_output_tokens,
            draft_mode_enabled: c.ai_draft_mode_enabled,
            features,
            effective: c.redacted(),
        })
    }

    /// Keyset page of runs; `(rows, next_cursor)`.
    pub async fn admin_runs(
        &self,
        actor: &Actor,
        query: &RunListQuery,
    ) -> Result<(Vec<RunRow>, Option<AiRunId>)> {
        require_admin(actor)?;
        let limit = query.limit.clamp(1, 200);
        let mut rows = ab_db::ai::list_runs(
            &self.pool,
            &RunFilter {
                since_days: query.days.clamp(1, 90),
                status: query.status,
                kind: query.kind,
                provider: query.provider.as_deref(),
                course_id: query.course_id,
                cursor: query.cursor,
                limit: limit + 1,
            },
        )
        .await?;
        let next = if i64::try_from(rows.len()).unwrap_or(i64::MAX) > limit {
            rows.truncate(usize::try_from(limit).unwrap_or(usize::MAX));
            rows.last().map(|r| r.id)
        } else {
            None
        };
        Ok((rows, next))
    }

    pub async fn admin_run_detail(&self, actor: &Actor, id: AiRunId) -> Result<RunDetail> {
        require_admin(actor)?;
        let run = ab_db::ai::get_run(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("ai run"))?;
        Ok(RunDetail {
            events: ab_db::ai::list_events(&self.pool, id).await?,
            artifacts: ab_db::ai::list_artifacts(&self.pool, id).await?,
            evidence: ab_db::ai::list_evidence(&self.pool, id).await?,
            run,
        })
    }

    pub async fn eval_dashboard(&self, actor: &Actor) -> Result<EvalDashboard> {
        require_admin(actor)?;
        Ok(EvalDashboard {
            runs: ab_db::ai::run_aggregate(&self.pool).await?,
            evals: ab_db::ai::eval_summary(&self.pool).await?,
            recent: ab_db::ai::list_recent_evals(&self.pool, 20).await?,
        })
    }

    /// Platform usage against the monthly budget, plus the month's heaviest
    /// users (legacy `/ai/usage` was platform totals only).
    pub async fn usage(&self, actor: &Actor) -> Result<UsageSummary> {
        require_admin(actor)?;
        let totals = ab_db::ai::usage_totals(&self.pool).await?;
        let users = ab_db::ai::ledger_month_rows(&self.pool, 50).await?;
        let used = totals.input_tokens + totals.output_tokens;
        Ok(UsageSummary {
            total_runs: totals.total_runs,
            input_tokens: totals.input_tokens,
            output_tokens: totals.output_tokens,
            monthly_budget: self.config.monthly_token_budget,
            remaining_budget: (self.config.monthly_token_budget - used).max(0),
            users,
        })
    }

    /// Record one eval outcome (the `ashyq admin ai-eval` command).
    pub async fn record_eval(
        &self,
        dataset: &str,
        evaluator: &str,
        score: Option<f64>,
        passed: Option<bool>,
        details: &serde_json::Value,
    ) -> Result<()> {
        ab_db::ai::insert_eval_result(&self.pool, None, dataset, evaluator, score, passed, details)
            .await?;
        Ok(())
    }

    /// `ashyq admin ai-eval`: one structured round trip against the live
    /// provider chain, recorded as an eval result. The fixture datasets
    /// land with the first eval corpus; this keeps the command and the
    /// table exercised end to end.
    pub async fn run_eval_smoke(&self, dataset: &str) -> Result<EvalReport> {
        let Some(llm) = self.provider() else {
            self.record_eval(
                dataset,
                "provider_smoke",
                None,
                Some(false),
                &serde_json::json!({ "reason": "provider not configured" }),
            )
            .await?;
            return Ok(EvalReport {
                model_name: "disabled".into(),
                total: 1,
                passed: 0,
            });
        };
        #[derive(serde::Deserialize)]
        struct Probe {
            ok: bool,
        }
        let request = ab_clients::llm::CompletionRequest {
            messages: vec![
                ab_clients::llm::ChatMessage::system(
                    "Reply with the JSON object {\"ok\": true} and nothing else.",
                ),
                ab_clients::llm::ChatMessage::user("ping"),
            ],
            output_schema: Some(ab_clients::llm::OutputSchema {
                name: "eval_probe".into(),
                schema: serde_json::json!({
                    "type": "object",
                    "properties": { "ok": { "type": "boolean" } },
                    "required": ["ok"]
                }),
            }),
            max_output_tokens: Some(32),
            temperature: None,
        };
        let (model_name, passed, details) = match llm.complete_structured::<Probe>(&request).await {
            Ok(reply) => (
                reply.completion.model_name.clone(),
                reply.value.ok,
                serde_json::json!({ "repaired": reply.repaired, "usage": {
                    "input_tokens": reply.completion.usage.input_tokens,
                    "output_tokens": reply.completion.usage.output_tokens,
                } }),
            ),
            Err(err) => (
                llm.selected_model_name(),
                false,
                serde_json::json!({ "error": err.to_string() }),
            ),
        };
        self.record_eval(
            dataset,
            "provider_smoke",
            Some(if passed { 1.0 } else { 0.0 }),
            Some(passed),
            &details,
        )
        .await?;
        Ok(EvalReport {
            model_name,
            total: 1,
            passed: usize::from(passed),
        })
    }

    /// Stream access is the same gate as reads.
    pub async fn stream_access(&self, actor: &Actor, id: AiRunId) -> Result<RunRow> {
        self.accessible_run(actor, id).await
    }
}

/// Legacy thread title: `kind.replace("_", " ").title()`.
fn title_for(kind: AiRunKind) -> String {
    kind.as_str()
        .split('_')
        .map(|word| {
            let mut chars = word.chars();
            chars.next().map_or_else(String::new, |first| {
                first.to_uppercase().collect::<String>() + chars.as_str()
            })
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thread_titles_match_legacy_title_case() {
        assert_eq!(title_for(AiRunKind::CourseAnalysis), "Course Analysis");
        assert_eq!(title_for(AiRunKind::CourseQa), "Course Qa");
        assert_eq!(title_for(AiRunKind::Remediation), "Remediation");
    }

    #[test]
    fn safe_context_keeps_only_the_allowlist() {
        let ctx = safe_run_context(&serde_json::json!({
            "course_id": "c", "question": "secret question", "kind": "course_qa"
        }));
        assert_eq!(ctx["course_id"], "c");
        assert_eq!(ctx["kind"], "course_qa");
        assert!(ctx.get("question").is_none());
    }
}
