//! Lecture author.
//!
//! Lecture author (legacy `agents/lecture_author.py` + `run_lecture_review`
//! / `queue_lecture_review` / reviews listing / suggestion dismissal).
//! Teachers only. A critique covers the whole course context (the legacy
//! did too - `activity_id` only scopes the review record).

use ab_clients::llm::OutputSchema;
use ab_core::ai::{AiFeature, AiRunKind, AiThreadRole};
use ab_core::id::{ActivityId, AiLectureReviewId, AiRunId, CourseId, UserId};
use ab_core::{Error, FieldError, Result};
use ab_db::ai::{LectureReviewRow, NewLectureReview, RunRow};
use tokio_util::sync::CancellationToken;

use super::{
    Admitted, Execution, draft_citation, metadata_id, metadata_language, metadata_optional_id,
    run_user,
};
use crate::ai::AiService;
use crate::ai::budget::BudgetLane;
use crate::ai::context;
use crate::ai::policy;
use crate::ai::prompts::{Prompt, load_prompt};
use crate::ai::runs::RunSpec;
use crate::ai::schemas::{LectureReviewReport, LectureSuggestion, Level};
use crate::identity::Actor;

const ARTIFACT_KIND: &str = "lecture_review";
const FAIL_CODE: &str = "LECTURE_REVIEW_FAILED";

/// Legacy `_draft_lecture_review` (verbatim strings).
#[must_use]
pub fn draft_lecture_review(language: &str) -> LectureReviewReport {
    LectureReviewReport {
        summary: "Критика лекции с использованием ИИ еще не включена. Этот черновик поддерживает интерфейс рецензирования активным без применения изменений.".into(),
        suggestions: vec![LectureSuggestion {
            suggestion_id: format!("sug_{}", uuid::Uuid::new_v4().simple()),
            location: "Текст лекции".into(),
            title: "Запустить критику с использованием провайдера".into(),
            rationale: "Постоянные предложения должны генерироваться на основе реального контекста лекции перед тем, как преподаватель применит изменения.".into(),
            replacement_markdown: None,
            priority: Level::High,
        }],
        citations: vec![draft_citation(
            "lecture-draft",
            "Контекст лекции",
            "activity",
            "Черновик обзора лекции создан без доступа к модели.",
        )],
        language: language.into(),
    }
}

impl AiService {
    /// The activity must belong to the course (legacy filtered on both).
    async fn course_activity(
        &self,
        course_id: CourseId,
        activity_id: Option<ActivityId>,
    ) -> Result<Option<ActivityId>> {
        let Some(activity_id) = activity_id else {
            return Ok(None);
        };
        let activity = ab_db::catalog::get_activity(&self.pool, activity_id).await?;
        match activity {
            Some(a) if a.course_id == course_id => Ok(Some(a.id)),
            // The legacy silently dropped an unknown activity; v2 says so.
            _ => Err(Error::validation(vec![FieldError {
                field: "activity_id".into(),
                code: "not-in-course".into(),
                message: "activity does not belong to this course".into(),
            }])),
        }
    }

    /// `POST /ai/lecture-authoring/{course}/critique` - inline.
    pub async fn critique_lecture(
        &self,
        actor: &Actor,
        course_id: CourseId,
        activity_id: Option<ActivityId>,
        language: &str,
    ) -> Result<LectureReviewRow> {
        self.require_feature(AiFeature::LectureAuthoring)?;
        let course = self.visible_course(actor, course_id).await?;
        policy::require_course_update(actor, &course)?;
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Analysis)
            .await?;
        let activity_id = self.course_activity(course_id, activity_id).await?;
        let admitted = self
            .admit_lecture_review(course_id, actor.user_id, language, None)
            .await?;
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::LectureReview,
                    role: AiThreadRole::Teacher,
                    queued: false,
                    course_id: Some(course_id),
                    activity_id,
                    metadata: serde_json::json!({
                        "course_id": course_id,
                        "activity_id": activity_id,
                        "language": language,
                        "context_source_count": admitted.sources.len(),
                    }),
                    thread: None,
                    title: None,
                },
            )
            .await?;
        let watch = self.cancel_watch(run.id);
        self.lecture_review_execute(&run, &watch.token, &admitted, actor.user_id, language)
            .await
    }

    /// `POST /ai/lecture-authoring/{course}/critique/queue`.
    pub async fn queue_lecture_review(
        &self,
        actor: &Actor,
        course_id: CourseId,
        activity_id: Option<ActivityId>,
        language: &str,
    ) -> Result<RunRow> {
        self.require_feature(AiFeature::LectureAuthoring)?;
        let course = self.visible_course(actor, course_id).await?;
        policy::require_course_update(actor, &course)?;
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Analysis)
            .await?;
        let activity_id = self.course_activity(course_id, activity_id).await?;
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::LectureReview,
                    role: AiThreadRole::Teacher,
                    queued: true,
                    course_id: Some(course_id),
                    activity_id,
                    metadata: serde_json::json!({
                        "course_id": course_id,
                        "activity_id": activity_id,
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

    pub(crate) async fn execute_queued_lecture_review(
        &self,
        run: &RunRow,
        token: &CancellationToken,
    ) -> Result<()> {
        let course_id: CourseId = metadata_id(run, "course_id")?;
        let language = metadata_language(run);
        let user_id = run_user(run)?;
        let admitted = self
            .settle(
                run.id,
                FAIL_CODE,
                self.admit_lecture_review(course_id, user_id, &language, Some(run.id)),
            )
            .await?;
        self.mark_running(run.id).await?;
        self.lecture_review_execute(run, token, &admitted, user_id, &language)
            .await?;
        Ok(())
    }

    /// The course context admitted as sent (BUG-349).
    async fn admit_lecture_review(
        &self,
        course_id: CourseId,
        user_id: UserId,
        language: &str,
        run: Option<AiRunId>,
    ) -> Result<Admitted> {
        let bundle = context::course_bundle(&self.pool, course_id, true, None).await?;
        let locale = self.user_locale(user_id).await?;
        self.admit(
            bundle,
            load_prompt(Prompt::LectureCritique, locale.as_deref()),
            &[],
            run,
            |context| format!("Language: {language}\n\nLecture context:\n{context}"),
        )
        .await
    }

    async fn lecture_review_execute(
        &self,
        run: &RunRow,
        token: &CancellationToken,
        admitted: &Admitted,
        user_id: UserId,
        language: &str,
    ) -> Result<LectureReviewRow> {
        self.settle(run.id, FAIL_CODE, async {
            let exec = Execution {
                run,
                token,
                admitted,
                user_id,
            };
            let mut finished = self
                .run_structured::<LectureReviewReport>(
                    &exec,
                    ARTIFACT_KIND,
                    OutputSchema {
                        name: LectureReviewReport::SCHEMA_NAME.into(),
                        schema: LectureReviewReport::json_schema(),
                    },
                    |report| &report.citations,
                    || draft_lecture_review(language),
                )
                .await?;
            let course_id: CourseId = metadata_id(run, "course_id")?;
            let id = ab_db::ai::insert_lecture_review(
                &mut *finished.completion.tx,
                NewLectureReview {
                    course_id,
                    activity_id: metadata_optional_id(run, "activity_id"),
                    run_id: run.id,
                    triggered_by: user_id,
                    language: &finished.value.language,
                    suggestions: &finished.artifact,
                },
            )
            .await?;
            self.commit_finish(finished.completion).await?;
            ab_db::ai::get_lecture_review(&self.pool, id)
                .await?
                .ok_or_else(|| Error::not_found("lecture review"))
        })
        .await
    }

    /// `GET /ai/lecture-authoring/{course}/reviews` - active reviews.
    pub async fn list_lecture_reviews(
        &self,
        actor: &Actor,
        course_id: CourseId,
    ) -> Result<Vec<LectureReviewRow>> {
        let course = self.visible_course(actor, course_id).await?;
        policy::require_course_update(actor, &course)?;
        ab_db::ai::list_active_lecture_reviews(&self.pool, course_id).await
    }

    /// `POST /ai/lecture-authoring/reviews/{review}/dismiss`.
    pub async fn dismiss_lecture_suggestion(
        &self,
        actor: &Actor,
        review_id: AiLectureReviewId,
        suggestion_id: &str,
    ) -> Result<LectureReviewRow> {
        let review = ab_db::ai::get_lecture_review(&self.pool, review_id)
            .await?
            .ok_or_else(|| Error::not_found("lecture review"))?;
        let course = self.visible_course(actor, review.course_id).await?;
        policy::require_course_update(actor, &course)?;
        course.ensure_not_archived()?;
        let suggestion_id = suggestion_id.trim();
        if suggestion_id.is_empty() || suggestion_id.chars().count() > 200 {
            return Err(Error::validation(vec![FieldError {
                field: "suggestion_id".into(),
                code: "invalid".into(),
                message: "suggestion_id must be 1–200 characters".into(),
            }]));
        }
        // BUG-141: only an id the review actually carries may be dismissed.
        let known = review.suggestions["suggestions"]
            .as_array()
            .is_some_and(|list| list.iter().any(|s| s["suggestion_id"] == suggestion_id));
        if !known {
            return Err(Error::validation(vec![FieldError {
                field: "suggestion_id".into(),
                code: "unknown".into(),
                message: format!("suggestion {suggestion_id} is not part of this review"),
            }]));
        }
        ab_db::ai::dismiss_lecture_suggestion(&self.pool, review_id, suggestion_id).await?;
        ab_db::ai::get_lecture_review(&self.pool, review_id)
            .await?
            .ok_or_else(|| Error::not_found("lecture review"))
    }
}
