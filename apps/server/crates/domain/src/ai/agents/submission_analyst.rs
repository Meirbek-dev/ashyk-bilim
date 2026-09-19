//! Submission analyst (legacy `agents/submission_analyst.py`).
//!
//! `run_submission_analysis` / `queue_submission_analysis`: the learner
//! who owns the work or a teacher of its course; the work is an assessment
//! submission or a file-submission attempt (`AiSubjectId`).

use ab_clients::llm::OutputSchema;
use ab_core::ai::{AiFeature, AiRunKind, AiThreadRole};
use ab_core::id::{AiSubjectId, UserId};
use ab_core::{Error, Result};
use ab_db::ai::{NewSubmissionAnalysis, RunRow, SubmissionAnalysisRow};
use tokio_util::sync::CancellationToken;

use super::{Execution, draft_citation, evidence_json, metadata_language, run_user};
use crate::ai::AiService;
use crate::ai::budget::BudgetLane;
use crate::ai::context::ContextBundle;
use crate::ai::prompts::{Prompt, clipped, load_prompt};
use crate::ai::runs::RunSpec;
use crate::ai::schemas::{KnowledgeGap, Level, SubmissionAnalysisReport};
use crate::ai::subject::{Subject, run_subject};
use crate::identity::Actor;

const ARTIFACT_KIND: &str = "submission_analysis";
const FAIL_CODE: &str = "SUBMISSION_ANALYSIS_FAILED";

/// Legacy `_draft_submission_report` (verbatim strings).
#[must_use]
pub fn draft_submission_report(language: &str) -> SubmissionAnalysisReport {
    SubmissionAnalysisReport {
        summary: "ИИ еще не включен, поэтому данный черновик подчеркивает необходимость проверки преподавателем перед применением ограничений на восполнение пробелов.".into(),
        knowledge_gaps: vec![KnowledgeGap {
            concept: "Ход решения".into(),
            severity: Level::Medium,
            evidence: "Анализ с использованием провайдера не запускался.".into(),
            remediation_goal: "Проверьте отправленную работу и вручную выявите первое заблуждение.".into(),
        }],
        next_action: "Включите анализ ИИ или попросите преподавателя подтвердить тему восполнения пробелов.".into(),
        citations: vec![draft_citation(
            "submission-draft",
            "Контекст решения",
            "submission",
            "Черновик анализа решения создан без доступа к модели.",
        )],
        confidence: Level::Low,
        language: language.into(),
    }
}

/// Teacher when analysing someone else's work, student for one's own.
pub(crate) fn role_for(actor_id: UserId, subject: &Subject) -> AiThreadRole {
    if actor_id == subject.user_id() {
        AiThreadRole::Student
    } else {
        AiThreadRole::Teacher
    }
}

impl AiService {
    /// `POST /ai/submission-analysis/{subject}/analyze` — inline.
    pub async fn analyze_submission(
        &self,
        actor: &Actor,
        subject_id: AiSubjectId,
        language: &str,
    ) -> Result<SubmissionAnalysisRow> {
        self.require_feature(AiFeature::SubmissionAnalysis)?;
        let subject = self.accessible_subject(actor, subject_id).await?;
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Analysis)
            .await?;
        let (bundle, metadata) = self.subject_bundle(&subject, actor.user_id).await?;
        let rendered = bundle.render();
        let input_tokens = self.budget.assert_request(&self.pool, &rendered).await?;
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::SubmissionAnalysis,
                    role: role_for(actor.user_id, &subject),
                    queued: false,
                    course_id: Some(subject.course_id()),
                    activity_id: metadata
                        .get("activity_id")
                        .and_then(serde_json::Value::as_str)
                        .and_then(|s| s.parse().ok()),
                    metadata: merged(
                        merged(metadata, subject.metadata()),
                        serde_json::json!({
                            "course_id": subject.course_id(),
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
        self.submission_analysis_execute(
            &run,
            &watch.token,
            &bundle,
            &rendered,
            input_tokens,
            actor.user_id,
            language,
        )
        .await
    }

    /// `POST /ai/submission-analysis/{subject}/analyze/queue`.
    pub async fn queue_submission_analysis(
        &self,
        actor: &Actor,
        subject_id: AiSubjectId,
        language: &str,
    ) -> Result<RunRow> {
        self.require_feature(AiFeature::SubmissionAnalysis)?;
        let subject = self.accessible_subject(actor, subject_id).await?;
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Analysis)
            .await?;
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::SubmissionAnalysis,
                    role: role_for(actor.user_id, &subject),
                    queued: true,
                    course_id: Some(subject.course_id()),
                    activity_id: None,
                    metadata: merged(
                        subject.metadata(),
                        serde_json::json!({
                            "course_id": subject.course_id(),
                            "language": language,
                        }),
                    ),
                    thread: None,
                    title: None,
                },
            )
            .await?;
        self.enqueue_run(run.id).await?;
        self.reload_run(run.id).await
    }

    pub(crate) async fn execute_queued_submission_analysis(
        &self,
        run: &RunRow,
        token: &CancellationToken,
    ) -> Result<()> {
        let language = metadata_language(run);
        let user_id = run_user(run)?;
        let subject = self.load_subject_by(run_subject(run)?).await?;
        let (bundle, metadata) = self.subject_bundle(&subject, user_id).await?;
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
        self.submission_analysis_execute(
            run,
            token,
            &bundle,
            &rendered,
            input_tokens,
            user_id,
            &language,
        )
        .await?;
        Ok(())
    }

    #[allow(
        clippy::too_many_arguments,
        reason = "the shared step of the sync and queued paths"
    )]
    pub(crate) async fn submission_analysis_execute(
        &self,
        run: &RunRow,
        token: &CancellationToken,
        bundle: &ContextBundle,
        rendered: &str,
        input_tokens: i32,
        user_id: UserId,
        language: &str,
    ) -> Result<SubmissionAnalysisRow> {
        self.settle(run.id, FAIL_CODE, async {
            let locale = self.user_locale(user_id).await?;
            let prompt = format!(
                "Language: {language}\n\nSubmission context:\n{}",
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
                .run_structured::<SubmissionAnalysisReport>(
                    &exec,
                    ARTIFACT_KIND,
                    load_prompt(Prompt::SubmissionAnalysis, locale.as_deref()),
                    &prompt,
                    OutputSchema {
                        name: SubmissionAnalysisReport::SCHEMA_NAME.into(),
                        schema: SubmissionAnalysisReport::json_schema(),
                    },
                    |report| &report.citations,
                    || draft_submission_report(language),
                )
                .await?;
            let id = ab_db::ai::insert_submission_analysis(
                &self.pool,
                NewSubmissionAnalysis {
                    subject: run_subject(run)?,
                    run_id: run.id,
                    triggered_by: user_id,
                    language: &finished.value.language,
                    gap_count: i32::try_from(finished.value.knowledge_gaps.len())
                        .unwrap_or(i32::MAX),
                    analysis: &finished.artifact,
                    evidence: &evidence_json(&finished.citations),
                    model_name: &finished.model_name,
                },
            )
            .await?;
            ab_db::ai::get_submission_analysis(&self.pool, id)
                .await?
                .ok_or_else(|| Error::not_found("submission analysis"))
        })
        .await
    }

    /// `GET /ai/submission-analysis/{subject}/latest`.
    pub async fn latest_submission_analysis(
        &self,
        actor: &Actor,
        subject_id: AiSubjectId,
    ) -> Result<Option<SubmissionAnalysisRow>> {
        let subject = self.accessible_subject(actor, subject_id).await?;
        ab_db::ai::latest_submission_analysis(&self.pool, subject.id()).await
    }
}

/// `{**a, **b}` for two JSON objects.
pub(crate) fn merged(mut base: serde_json::Value, extra: serde_json::Value) -> serde_json::Value {
    match (base.as_object_mut(), extra) {
        (Some(map), serde_json::Value::Object(extra)) => {
            map.extend(extra);
            base
        }
        (_, extra) => extra,
    }
}
