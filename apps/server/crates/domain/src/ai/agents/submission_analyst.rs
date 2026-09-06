//! Submission analyst (legacy `agents/submission_analyst.py` +
//! `run_submission_analysis` / `queue_submission_analysis`). The learner
//! who owns the submission or a teacher of its course.

use ab_clients::llm::OutputSchema;
use ab_core::ai::{AiFeature, AiRunKind, AiThreadRole};
use ab_core::id::{AiSubmissionAnalysisId, SubmissionId, UserId};
use ab_core::{Error, Result};
use ab_db::ai::{NewSubmissionAnalysis, RunRow, SubmissionAnalysisRow};
use ab_db::submissions::SubmissionRow;
use tokio_util::sync::CancellationToken;

use super::{Execution, draft_citation, evidence_json, metadata_id, metadata_language, run_user};
use crate::ai::AiService;
use crate::ai::budget::BudgetLane;
use crate::ai::context::{self, ContextBundle};
use crate::ai::prompts::{Prompt, clipped, load_prompt};
use crate::ai::runs::RunSpec;
use crate::ai::schemas::{KnowledgeGap, Level, SubmissionAnalysisReport};
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
fn role_for(actor_id: UserId, submission: &SubmissionRow) -> AiThreadRole {
    if actor_id == submission.user_id {
        AiThreadRole::Student
    } else {
        AiThreadRole::Teacher
    }
}

impl AiService {
    /// `POST /ai/submission-analysis/{submission}/analyze` — inline.
    pub async fn analyze_submission(
        &self,
        actor: &Actor,
        submission_id: SubmissionId,
        language: &str,
    ) -> Result<SubmissionAnalysisRow> {
        self.require_feature(AiFeature::SubmissionAnalysis)?;
        let (submission, _course) = self.accessible_submission(actor, submission_id).await?;
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Analysis)
            .await?;
        let (bundle, metadata) = context::submission_bundle(&self.pool, &submission).await?;
        let rendered = bundle.render();
        let input_tokens = self.budget.assert_request(&self.pool, &rendered).await?;
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::SubmissionAnalysis,
                    role: role_for(actor.user_id, &submission),
                    queued: false,
                    course_id: Some(submission.course_id),
                    activity_id: metadata
                        .get("activity_id")
                        .and_then(serde_json::Value::as_str)
                        .and_then(|s| s.parse().ok()),
                    metadata: merged(
                        metadata,
                        serde_json::json!({
                            "submission_id": submission_id,
                            "course_id": submission.course_id,
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

    /// `POST /ai/submission-analysis/{submission}/analyze/queue`.
    pub async fn queue_submission_analysis(
        &self,
        actor: &Actor,
        submission_id: SubmissionId,
        language: &str,
    ) -> Result<RunRow> {
        self.require_feature(AiFeature::SubmissionAnalysis)?;
        let (submission, _course) = self.accessible_submission(actor, submission_id).await?;
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Analysis)
            .await?;
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::SubmissionAnalysis,
                    role: role_for(actor.user_id, &submission),
                    queued: true,
                    course_id: Some(submission.course_id),
                    activity_id: None,
                    metadata: serde_json::json!({
                        "submission_id": submission_id,
                        "course_id": submission.course_id,
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

    pub(crate) async fn execute_queued_submission_analysis(
        &self,
        run: &RunRow,
        token: &CancellationToken,
    ) -> Result<()> {
        let submission_id: SubmissionId = metadata_id(run, "submission_id")?;
        let language = metadata_language(run);
        let user_id = run_user(run)?;
        let submission = ab_db::submissions::get_submission(&self.pool, submission_id)
            .await?
            .ok_or_else(|| Error::not_found("submission"))?;
        let (bundle, metadata) = context::submission_bundle(&self.pool, &submission).await?;
        ab_db::ai::merge_run_metadata(&self.pool, run.id, &metadata).await?;
        let rendered = bundle.render();
        let input_tokens = self
            .settle(run.id, FAIL_CODE, self.budget.assert_request(&self.pool, &rendered))
            .await?;
        self.mark_running(run.id).await?;
        self.submission_analysis_execute(run, token, &bundle, &rendered, input_tokens, user_id, &language)
            .await?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments, reason = "the shared step of the sync and queued paths")]
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
            let submission_id: SubmissionId = metadata_id(run, "submission_id")?;
            let id = ab_db::ai::insert_submission_analysis(
                &self.pool,
                NewSubmissionAnalysis {
                    submission_id,
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

    /// `GET /ai/submission-analysis/{submission}/latest`.
    pub async fn latest_submission_analysis(
        &self,
        actor: &Actor,
        submission_id: SubmissionId,
    ) -> Result<Option<SubmissionAnalysisRow>> {
        self.accessible_submission(actor, submission_id).await?;
        ab_db::ai::latest_submission_analysis(&self.pool, submission_id).await
    }

    pub(crate) async fn submission_analysis_by_id(
        &self,
        id: AiSubmissionAnalysisId,
    ) -> Result<Option<SubmissionAnalysisRow>> {
        ab_db::ai::get_submission_analysis(&self.pool, id).await
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
