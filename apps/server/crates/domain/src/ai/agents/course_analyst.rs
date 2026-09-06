//! Course analyst.
//!
//! Course analyst (legacy `agents/course_analyst.py` + `run_course_analysis`
//! / `queue_course_analysis` / `publish_course_analysis` / findings review).
//! Teachers only (course write access). The report lands as
//! `needs_human_review` and is published explicitly.

use ab_clients::llm::OutputSchema;
use ab_core::ai::{AiFeature, AiRunKind, AiThreadRole, CourseAnalysisStatus, FindingReviewAction};
use ab_core::id::{AiCourseAnalysisId, CourseId, UserId};
use ab_core::{Error, FieldError, Result};
use ab_db::ai::{CourseAnalysisRow, NewCourseAnalysis, RunRow};
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

use super::{Execution, draft_citation, evidence_json, metadata_id, metadata_language, run_user};
use crate::ai::AiService;
use crate::ai::budget::BudgetLane;
use crate::ai::context::{self, ContextBundle};
use crate::ai::policy;
use crate::ai::prompts::{Prompt, clipped, load_prompt};
use crate::ai::runs::RunSpec;
use crate::ai::schemas::{CourseQualityReport, Level, Recommendation};
use crate::identity::Actor;

const ARTIFACT_KIND: &str = "course_analysis";
const FAIL_CODE: &str = "COURSE_ANALYSIS_FAILED";

/// The latest analysis with the legacy read-time extras.
#[derive(Debug, Clone)]
pub struct LatestCourseAnalysis {
    pub analysis: CourseAnalysisRow,
    /// The course context hashes differently now.
    pub stale: bool,
    pub previous_public_score: Option<i32>,
}

/// Legacy `_draft_course_report` (verbatim strings).
#[must_use]
pub fn draft_course_report(language: &str) -> CourseQualityReport {
    CourseQualityReport {
        public_score: 72,
        summary: "Анализ ИИ еще не включен, поэтому этот черновик отчета отмечает, что курс готов только для проверки человеком.".into(),
        strengths: vec!["Материалы курса присутствуют и могут быть проверены конвейером анализа.".into()],
        risks: vec![
            "Ключи провайдера или флаги функций ИИ не включены. Запустите полный анализ перед публикацией оценки ИИ.".into(),
        ],
        recommendations: vec![Recommendation {
            title: "Включить анализ с использованием провайдера".into(),
            rationale: "Текущий результат является детерминированным черновиком.".into(),
            priority: Level::High,
            action: "Настройте флаги функций ИИ и ключи провайдера, затем запустите анализ курса повторно.".into(),
        }],
        citations: vec![draft_citation(
            "course-draft",
            "Контекст курса",
            "course",
            "Черновик анализа создан без доступа к модели.",
        )],
        confidence: Level::Low,
        language: language.into(),
    }
}

fn content_hash(rendered: &str) -> String {
    use std::fmt::Write;
    let digest = Sha256::digest(rendered.as_bytes());
    let mut out = String::with_capacity(64);
    for byte in digest {
        let _ = write!(out, "{byte:02x}");
    }
    out
}

impl AiService {
    /// `POST /ai/course-analysis/{course}/analyze` — inline.
    pub async fn analyze_course(
        &self,
        actor: &Actor,
        course_id: CourseId,
        language: &str,
    ) -> Result<CourseAnalysisRow> {
        self.require_feature(AiFeature::CourseAnalysis)?;
        let course = self.visible_course(actor, course_id).await?;
        policy::require_course_update(actor, &course)?;
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Analysis)
            .await?;
        let bundle = context::course_bundle(&self.pool, course_id, true, None).await?;
        let rendered = bundle.render();
        let input_tokens = self.budget.assert_request(&self.pool, &rendered).await?;
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::CourseAnalysis,
                    role: AiThreadRole::Teacher,
                    queued: false,
                    course_id: Some(course_id),
                    activity_id: None,
                    metadata: serde_json::json!({
                        "course_id": course_id,
                        "language": language,
                        "context_source_count": bundle.sources.len(),
                    }),
                    thread: None,
                    title: None,
                },
            )
            .await?;
        let watch = self.cancel_watch(run.id);
        self.course_analysis_execute(
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

    /// `POST /ai/course-analysis/{course}/analyze/queue`.
    pub async fn queue_course_analysis(
        &self,
        actor: &Actor,
        course_id: CourseId,
        language: &str,
    ) -> Result<RunRow> {
        self.require_feature(AiFeature::CourseAnalysis)?;
        let course = self.visible_course(actor, course_id).await?;
        policy::require_course_update(actor, &course)?;
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Analysis)
            .await?;
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::CourseAnalysis,
                    role: AiThreadRole::Teacher,
                    queued: true,
                    course_id: Some(course_id),
                    activity_id: None,
                    metadata: serde_json::json!({ "course_id": course_id, "language": language }),
                    thread: None,
                    title: None,
                },
            )
            .await?;
        self.enqueue_run(run.id).await?;
        self.reload_run(run.id).await
    }

    pub(crate) async fn execute_queued_course_analysis(
        &self,
        run: &RunRow,
        token: &CancellationToken,
    ) -> Result<()> {
        let course_id: CourseId = metadata_id(run, "course_id")?;
        let language = metadata_language(run);
        let user_id = run_user(run)?;
        let bundle = context::course_bundle(&self.pool, course_id, true, None).await?;
        let rendered = bundle.render();
        let input_tokens = self
            .settle(
                run.id,
                FAIL_CODE,
                self.budget.assert_request(&self.pool, &rendered),
            )
            .await?;
        self.mark_running(run.id).await?;
        self.course_analysis_execute(
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
    async fn course_analysis_execute(
        &self,
        run: &RunRow,
        token: &CancellationToken,
        bundle: &ContextBundle,
        rendered: &str,
        input_tokens: i32,
        user_id: UserId,
        language: &str,
    ) -> Result<CourseAnalysisRow> {
        self.settle(run.id, FAIL_CODE, async {
            let locale = self.user_locale(user_id).await?;
            let prompt = format!(
                "Language: {language}\n\nCourse context:\n{}",
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
                .run_structured::<CourseQualityReport>(
                    &exec,
                    ARTIFACT_KIND,
                    load_prompt(Prompt::CourseAnalysis, locale.as_deref()),
                    &prompt,
                    OutputSchema {
                        name: CourseQualityReport::SCHEMA_NAME.into(),
                        schema: CourseQualityReport::json_schema(),
                    },
                    |report| &report.citations,
                    || draft_course_report(language),
                )
                .await?;
            let course_id: CourseId = metadata_id(run, "course_id")?;
            let id = ab_db::ai::insert_course_analysis(
                &self.pool,
                NewCourseAnalysis {
                    course_id,
                    run_id: run.id,
                    triggered_by: user_id,
                    status: CourseAnalysisStatus::NeedsHumanReview,
                    language: &finished.value.language,
                    public_score: finished.value.public_score.clamp(0, 100),
                    report: &finished.artifact,
                    evidence: &evidence_json(&finished.citations),
                    model_name: &finished.model_name,
                    content_hash: &content_hash(rendered),
                },
            )
            .await?;
            ab_db::ai::get_course_analysis(&self.pool, id)
                .await?
                .ok_or_else(|| Error::not_found("course analysis"))
        })
        .await
    }

    /// `GET /ai/course-analysis/{course}/latest`: teachers see drafts,
    /// learners only published reports; `None` when nothing exists.
    pub async fn latest_course_analysis(
        &self,
        actor: &Actor,
        course_id: CourseId,
    ) -> Result<Option<LatestCourseAnalysis>> {
        let course = self.visible_course(actor, course_id).await?;
        let teacher = policy::can_update_course(actor, &course);
        let mut analyses =
            ab_db::ai::latest_course_analyses(&self.pool, course_id, !teacher, 2).await?;
        if analyses.is_empty() {
            return Ok(None);
        }
        let latest = analyses.remove(0);
        let previous_public_score = analyses.first().map(|a| a.public_score);
        let current = context::course_bundle(&self.pool, course_id, teacher, None)
            .await?
            .render();
        let stale = latest
            .content_hash
            .as_deref()
            .is_some_and(|h| h != content_hash(&current));
        Ok(Some(LatestCourseAnalysis {
            analysis: latest,
            stale,
            previous_public_score,
        }))
    }

    async fn writable_analysis(
        &self,
        actor: &Actor,
        id: AiCourseAnalysisId,
    ) -> Result<CourseAnalysisRow> {
        let analysis = ab_db::ai::get_course_analysis(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course analysis"))?;
        let course = self.visible_course(actor, analysis.course_id).await?;
        policy::require_course_update(actor, &course)?;
        Ok(analysis)
    }

    /// `POST /ai/course-analysis/{analysis}/publish`.
    pub async fn publish_course_analysis(
        &self,
        actor: &Actor,
        id: AiCourseAnalysisId,
    ) -> Result<CourseAnalysisRow> {
        self.writable_analysis(actor, id).await?;
        ab_db::ai::publish_course_analysis(&self.pool, id).await?;
        ab_db::ai::get_course_analysis(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course analysis"))
    }

    /// `POST /ai/course-analysis/{analysis}/findings/review`: records the
    /// teacher's verdict under `report.finding_reviews[finding_id]`.
    pub async fn review_course_finding(
        &self,
        actor: &Actor,
        id: AiCourseAnalysisId,
        finding_id: &str,
        action: FindingReviewAction,
        note: Option<&str>,
    ) -> Result<CourseAnalysisRow> {
        let finding_id = finding_id.trim();
        if finding_id.is_empty() || finding_id.chars().count() > 200 {
            return Err(Error::validation(vec![FieldError {
                field: "finding_id".into(),
                code: "invalid".into(),
                message: "finding_id must be 1–200 characters".into(),
            }]));
        }
        let analysis = self.writable_analysis(actor, id).await?;
        let mut report = analysis.report;
        if !report.is_object() {
            report = serde_json::json!({});
        }
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX));
        let review = serde_json::json!({
            "action": action.as_str(),
            "note": note,
            "reviewed_at": now,
            "reviewed_by_user_id": actor.user_id,
        });
        if let Some(map) = report.as_object_mut() {
            let reviews = map
                .entry("finding_reviews")
                .or_insert_with(|| serde_json::json!({}));
            if !reviews.is_object() {
                *reviews = serde_json::json!({});
            }
            if let Some(reviews) = reviews.as_object_mut() {
                reviews.insert(finding_id.to_owned(), review);
            }
        }
        ab_db::ai::set_course_analysis_report(&self.pool, id, &report).await?;
        ab_db::ai::get_course_analysis(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course analysis"))
    }
}
