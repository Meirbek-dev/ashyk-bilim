//! Remediation generator (legacy `agents/remediation_generator.py` +
//! `run_remediation_generation` / `queue_remediation_generation` /
//! sessions / completion / the active gate).
//!
//! Needs a submission analysis; when none exists one is produced first
//! (its own run), exactly as the legacy did inline.

use ab_clients::llm::OutputSchema;
use ab_core::ai::{AiFeature, AiRunKind, AiThreadRole, RemediationStatus};
use ab_core::id::{ActivityId, AiRemediationSessionId, SubmissionId, UserId};
use ab_core::{Error, FieldError, Result};
use ab_db::ai::{NewRemediationSession, RemediationSessionRow, RunRow, SubmissionAnalysisRow};
use ab_db::submissions::SubmissionRow;
use tokio_util::sync::CancellationToken;

use super::submission_analyst::merged;
use super::{Execution, draft_citation, metadata_id, metadata_language, run_user};
use crate::ai::AiService;
use crate::ai::budget::BudgetLane;
use crate::ai::context::{self, ContextBundle};
use crate::ai::prompts::{Prompt, clipped, load_prompt};
use crate::ai::redact;
use crate::ai::runs::RunSpec;
use crate::ai::schemas::{RemediationBundle, RemediationQuestion, SubmissionAnalysisReport};
use crate::identity::Actor;

const ARTIFACT_KIND: &str = "remediation";
const FAIL_CODE: &str = "REMEDIATION_FAILED";
/// Legacy: `passed` at 70 or above.
pub const PASS_SCORE: i32 = 70;

/// Legacy `_draft_remediation` (verbatim strings).
#[must_use]
pub fn draft_remediation(language: &str) -> RemediationBundle {
    RemediationBundle {
        title: "Черновик восполнения пробелов для проверки преподавателем".into(),
        learning_objectives: vec![
            "Подтвердить основное заблуждение".into(),
            "Потренироваться на одном исправленном примере".into(),
            "Объяснить исправление своими словами".into(),
        ],
        micro_lecture_markdown: "Восполнение пробелов с использованием ИИ еще не включено. Преподавателю следует заменить этот черновик целевой микролекцией на основе подтвержденного пробела в знаниях.".into(),
        practice_questions: vec![RemediationQuestion {
            prompt: "Какой основной концепт вам нужно повторить перед продолжением?".into(),
            choices: vec![],
            answer: "Концепт, подтвержденный преподавателем.".into(),
            explanation: "Этот вопрос-заглушка предотвращает автоматический пропуск до настройки ИИ.".into(),
        }],
        pass_threshold: 70,
        citations: vec![draft_citation(
            "remediation-draft",
            "Анализ решения",
            "submission_analysis",
            "Черновик восполнения пробелов создан без доступа к модели.",
        )],
        language: language.into(),
    }
}

fn role_for(actor_id: UserId, submission: &SubmissionRow) -> AiThreadRole {
    if actor_id == submission.user_id {
        AiThreadRole::Student
    } else {
        AiThreadRole::Teacher
    }
}

impl AiService {
    /// The activity behind a submission (via its assessment).
    async fn submission_activity(&self, submission: &SubmissionRow) -> Result<ActivityId> {
        ab_db::assessments::get_assessment(&self.pool, submission.assessment_id)
            .await?
            .map(|a| a.activity_id)
            .ok_or_else(|| Error::not_found("assessment"))
    }

    /// The newest analysis, or a fresh one produced now (own run).
    async fn analysis_for(
        &self,
        run: &RunRow,
        token: &CancellationToken,
        submission: &SubmissionRow,
        user_id: UserId,
        language: &str,
    ) -> Result<SubmissionAnalysisRow> {
        if let Some(existing) =
            ab_db::ai::latest_submission_analysis(&self.pool, submission.id).await?
        {
            return Ok(existing);
        }
        let (bundle, metadata) = context::submission_bundle(&self.pool, submission).await?;
        let rendered = bundle.render();
        let input_tokens = self.budget.assert_request(&self.pool, &rendered).await?;
        let analysis_run = self
            .create_run(
                user_id,
                RunSpec {
                    kind: AiRunKind::SubmissionAnalysis,
                    role: role_for(user_id, submission),
                    queued: false,
                    course_id: Some(submission.course_id),
                    activity_id: None,
                    metadata: merged(
                        metadata,
                        serde_json::json!({
                            "submission_id": submission.id,
                            "course_id": submission.course_id,
                            "language": language,
                            "context_source_count": bundle.sources.len(),
                            "parent_run_id": run.id,
                        }),
                    ),
                    thread: Some(run.thread_id),
                    title: None,
                },
            )
            .await?;
        self.submission_analysis_execute(
            &analysis_run,
            token,
            &bundle,
            &rendered,
            input_tokens,
            user_id,
            language,
        )
        .await
    }

    /// `POST /ai/remediation/{submission}/generate` — inline.
    pub async fn generate_remediation(
        &self,
        actor: &Actor,
        submission_id: SubmissionId,
        gate_mode: bool,
        language: &str,
    ) -> Result<RemediationSessionRow> {
        self.require_feature(AiFeature::Remediation)?;
        let (submission, _course) = self.accessible_submission(actor, submission_id).await?;
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Remediation)
            .await?;
        let (bundle, metadata) = context::submission_bundle(&self.pool, &submission).await?;
        let rendered = bundle.render();
        let input_tokens = self.budget.assert_request(&self.pool, &rendered).await?;
        let activity_id = self.submission_activity(&submission).await?;
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::Remediation,
                    role: AiThreadRole::Teacher,
                    queued: false,
                    course_id: Some(submission.course_id),
                    activity_id: Some(activity_id),
                    metadata: merged(
                        metadata,
                        serde_json::json!({
                            "submission_id": submission_id,
                            "course_id": submission.course_id,
                            "gate_mode": gate_mode,
                            "language": language,
                            "context_source_count": bundle.sources.len(),
                        }),
                    ),
                    thread: None,
                    title: None,
                },
            )
            .await?;
        let watch = self.cancel_watch(run.id);
        Box::pin(self.remediation_execute(
            &run,
            &watch.token,
            &submission,
            &bundle,
            &rendered,
            input_tokens,
            actor.user_id,
            gate_mode,
            language,
        ))
        .await
    }

    /// `POST /ai/remediation/{submission}/generate/queue`.
    pub async fn queue_remediation(
        &self,
        actor: &Actor,
        submission_id: SubmissionId,
        gate_mode: bool,
        language: &str,
    ) -> Result<RunRow> {
        self.require_feature(AiFeature::Remediation)?;
        let (submission, _course) = self.accessible_submission(actor, submission_id).await?;
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Remediation)
            .await?;
        let activity_id = self.submission_activity(&submission).await?;
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::Remediation,
                    role: role_for(actor.user_id, &submission),
                    queued: true,
                    course_id: Some(submission.course_id),
                    activity_id: Some(activity_id),
                    metadata: serde_json::json!({
                        "submission_id": submission_id,
                        "course_id": submission.course_id,
                        "gate_mode": gate_mode,
                        "language": language,
                    }),
                    thread: None,
                    title: None,
                },
            )
            .await?;
        self.enqueue_run(run.id).await?;
        self.reload_run(run.id).await
    }

    pub(crate) async fn execute_queued_remediation(
        &self,
        run: &RunRow,
        token: &CancellationToken,
    ) -> Result<()> {
        let submission_id: SubmissionId = metadata_id(run, "submission_id")?;
        let gate_mode = run
            .metadata
            .get("gate_mode")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
        let language = metadata_language(run);
        let user_id = run_user(run)?;
        let submission = ab_db::submissions::get_submission(&self.pool, submission_id)
            .await?
            .ok_or_else(|| Error::not_found("submission"))?;
        let (bundle, metadata) = context::submission_bundle(&self.pool, &submission).await?;
        ab_db::ai::merge_run_metadata(&self.pool, run.id, &metadata).await?;
        let rendered = bundle.render();
        let input_tokens = self
            .settle(
                run.id,
                FAIL_CODE,
                self.budget.assert_request(&self.pool, &rendered),
            )
            .await?;
        self.mark_running(run.id).await?;
        Box::pin(self.remediation_execute(
            run,
            token,
            &submission,
            &bundle,
            &rendered,
            input_tokens,
            user_id,
            gate_mode,
            &language,
        ))
        .await?;
        Ok(())
    }

    #[allow(
        clippy::too_many_arguments,
        reason = "the shared step of the sync and queued paths"
    )]
    async fn remediation_execute(
        &self,
        run: &RunRow,
        token: &CancellationToken,
        submission: &SubmissionRow,
        bundle: &ContextBundle,
        rendered: &str,
        input_tokens: i32,
        user_id: UserId,
        gate_mode: bool,
        language: &str,
    ) -> Result<RemediationSessionRow> {
        Box::pin(self.settle(run.id, FAIL_CODE, async {
            let analysis = self
                .analysis_for(run, token, submission, user_id, language)
                .await?;
            let report: SubmissionAnalysisReport =
                serde_json::from_value(analysis.analysis.clone()).map_err(|e| {
                    Error::conflict(format!("stored submission analysis is unreadable: {e}"))
                })?;
            let gap_text = report
                .knowledge_gaps
                .iter()
                .map(|g| format!("- {}: {}", g.concept, g.remediation_goal))
                .collect::<Vec<_>>()
                .join("\n");
            let locale = self.user_locale(user_id).await?;
            let prompt = format!(
                "Language: {language}\n\nKnowledge gaps:\n{gap_text}\n\nSubmission context:\n{}",
                clipped(rendered)
            );
            let exec = Execution {
                run,
                token,
                bundle,
                input_tokens,
                user_id,
            };
            let finished = self
                .run_structured::<RemediationBundle>(
                    &exec,
                    ARTIFACT_KIND,
                    load_prompt(Prompt::RemediationLecture, locale.as_deref()),
                    &prompt,
                    OutputSchema {
                        name: RemediationBundle::SCHEMA_NAME.into(),
                        schema: RemediationBundle::json_schema(),
                    },
                    |bundle| &bundle.citations,
                    || draft_remediation(language),
                )
                .await?;
            let questions = redact::redacted(
                serde_json::to_value(&finished.value.practice_questions)
                    .map_err(|e| Error::internal("serialising practice questions", e))?,
            );
            let activity_id = self.submission_activity(submission).await?;
            let id = ab_db::ai::insert_remediation_session(
                &self.pool,
                NewRemediationSession {
                    submission_id: submission.id,
                    activity_id,
                    student_user_id: submission.user_id,
                    analysis_id: Some(analysis.id),
                    run_id: run.id,
                    gate_mode,
                    language: &finished.value.language,
                    lecture: &finished.artifact,
                    test: &serde_json::json!({ "questions": questions }),
                },
            )
            .await?;
            ab_db::ai::get_remediation_session(&self.pool, id)
                .await?
                .ok_or_else(|| Error::not_found("remediation session"))
        }))
        .await
    }

    /// `GET /ai/remediation/sessions/{session}`.
    pub async fn remediation_session(
        &self,
        actor: &Actor,
        id: AiRemediationSessionId,
    ) -> Result<RemediationSessionRow> {
        self.accessible_remediation(actor, id).await
    }

    /// `GET /ai/remediation/student/{user}`: own sessions, or any with
    /// `platform:read`.
    pub async fn student_remediation_sessions(
        &self,
        actor: &Actor,
        student_user_id: UserId,
    ) -> Result<Vec<RemediationSessionRow>> {
        if student_user_id != actor.user_id {
            actor.require(crate::ai::policy::READ_PLATFORM)?;
        }
        ab_db::ai::list_student_remediation_sessions(&self.pool, student_user_id).await
    }

    /// `POST /ai/remediation/sessions/{session}/complete`: the learner
    /// records a score; 70+ passes (and lifts a gate).
    pub async fn complete_remediation(
        &self,
        actor: &Actor,
        id: AiRemediationSessionId,
        score: i32,
    ) -> Result<RemediationSessionRow> {
        if !(0..=100).contains(&score) {
            return Err(Error::validation(vec![FieldError {
                field: "score".into(),
                code: "out-of-range".into(),
                message: "score must be between 0 and 100".into(),
            }]));
        }
        let session = ab_db::ai::get_remediation_session(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("remediation session"))?;
        if session.student_user_id != actor.user_id {
            return Err(Error::forbidden(
                "cannot complete another learner's remediation",
            ));
        }
        let status = if score >= PASS_SCORE {
            RemediationStatus::Passed
        } else {
            RemediationStatus::Failed
        };
        ab_db::ai::complete_remediation_session(&self.pool, id, score, status).await?;
        ab_db::ai::get_remediation_session(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("remediation session"))
    }

    /// Legacy `active_remediation_gate`: the unpassed gate-mode session that
    /// blocks a learner on an activity, if any.
    pub async fn active_remediation_gate(
        &self,
        user_id: UserId,
        activity_id: ActivityId,
    ) -> Result<Option<AiRemediationSessionId>> {
        ab_db::ai::active_remediation_gate(&self.pool, user_id, activity_id).await
    }
}
