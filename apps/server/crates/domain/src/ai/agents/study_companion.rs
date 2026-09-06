//! Study companion (legacy `agents/study_companion.py` +
//! `run_study_companion` / `queue_study_companion`). Any learner who can
//! see the course; published content only. The artifact is the answer.

use ab_clients::llm::OutputSchema;
use ab_core::ai::{AiFeature, AiRunKind, AiThreadRole, StudyMode};
use ab_core::id::{CourseId, UserId};
use ab_core::{Error, FieldError, Result};
use ab_db::ai::RunRow;
use tokio_util::sync::CancellationToken;

use super::{Execution, draft_citation, metadata_id, metadata_language, run_user};
use crate::ai::AiService;
use crate::ai::budget::BudgetLane;
use crate::ai::context::{self, ContextBundle};
use crate::ai::prompts::{Prompt, clipped, load_prompt};
use crate::ai::runs::RunSpec;
use crate::ai::schemas::{Level, StudyCompanionAnswer};
use crate::identity::Actor;

const ARTIFACT_KIND: &str = "study_companion";
const FAIL_CODE: &str = "STUDY_COMPANION_FAILED";
const MAX_QUESTION_CHARS: usize = 4000;

/// Legacy `_draft_study_answer` (verbatim strings).
#[must_use]
pub fn draft_study_answer(mode: StudyMode) -> StudyCompanionAnswer {
    StudyCompanionAnswer {
        mode,
        answer_markdown: "Помощь в обучении с использованием ИИ еще не включена. Используйте цитируемые материалы курса и обратитесь к преподавателю за руководством.".into(),
        practice_items: vec![],
        flashcards: vec![],
        follow_up_suggestions: vec![
            "Какой раздел лекции мне следует изучить в первую очередь?".into(),
            "Могу ли я попробовать один практический вопрос?".into(),
        ],
        citations: vec![draft_citation(
            "study-draft",
            "Контекст курса",
            "course",
            "Черновик ответа помощника создан без доступа к модели.",
        )],
        confidence: Level::Low,
    }
}

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

impl AiService {
    /// `POST /ai/study/{course}/ask` — inline; returns the artifact.
    pub async fn ask_study_companion(
        &self,
        actor: &Actor,
        course_id: CourseId,
        question: &str,
        mode: StudyMode,
        language: &str,
    ) -> Result<serde_json::Value> {
        self.require_feature(AiFeature::StudyCompanion)?;
        let question = validate_question(question)?;
        self.visible_course(actor, course_id).await?;
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Analysis)
            .await?;
        let bundle = context::course_bundle(&self.pool, course_id, false, None).await?;
        let rendered = bundle.render();
        let input_tokens = self
            .budget
            .assert_request(&self.pool, &format!("{question}\n{rendered}"))
            .await?;
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::StudyCompanion,
                    role: AiThreadRole::Student,
                    queued: false,
                    course_id: Some(course_id),
                    activity_id: None,
                    metadata: serde_json::json!({
                        "course_id": course_id,
                        "question": question,
                        "mode": mode.as_str(),
                        "language": language,
                        "context_source_count": bundle.sources.len(),
                    }),
                    thread: None,
                    title: None,
                },
            )
            .await?;
        let watch = self.cancel_watch(run.id);
        self.study_companion_execute(
            &run,
            &watch.token,
            &bundle,
            &rendered,
            input_tokens,
            actor.user_id,
            question,
            mode,
            language,
        )
        .await
    }

    /// `POST /ai/study/{course}/ask/queue`.
    pub async fn queue_study_companion(
        &self,
        actor: &Actor,
        course_id: CourseId,
        question: &str,
        mode: StudyMode,
        language: &str,
    ) -> Result<RunRow> {
        self.require_feature(AiFeature::StudyCompanion)?;
        let question = validate_question(question)?;
        self.visible_course(actor, course_id).await?;
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Analysis)
            .await?;
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::StudyCompanion,
                    role: AiThreadRole::Student,
                    queued: true,
                    course_id: Some(course_id),
                    activity_id: None,
                    metadata: serde_json::json!({
                        "course_id": course_id,
                        "question": question,
                        "mode": mode.as_str(),
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

    pub(crate) async fn execute_queued_study_companion(
        &self,
        run: &RunRow,
        token: &CancellationToken,
    ) -> Result<()> {
        let course_id: CourseId = metadata_id(run, "course_id")?;
        let language = metadata_language(run);
        let user_id = run_user(run)?;
        let question = run
            .metadata
            .get("question")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let mode = run
            .metadata
            .get("mode")
            .and_then(serde_json::Value::as_str)
            .and_then(StudyMode::parse)
            .unwrap_or(StudyMode::Explain);
        let bundle = context::course_bundle(&self.pool, course_id, false, None).await?;
        let rendered = bundle.render();
        let input_tokens = self
            .settle(
                run.id,
                FAIL_CODE,
                self.budget
                    .assert_request(&self.pool, &format!("{question}\n{rendered}")),
            )
            .await?;
        self.mark_running(run.id).await?;
        self.study_companion_execute(
            run,
            token,
            &bundle,
            &rendered,
            input_tokens,
            user_id,
            &question,
            mode,
            &language,
        )
        .await?;
        Ok(())
    }

    #[allow(
        clippy::too_many_arguments,
        reason = "the shared step of the sync and queued paths"
    )]
    async fn study_companion_execute(
        &self,
        run: &RunRow,
        token: &CancellationToken,
        bundle: &ContextBundle,
        rendered: &str,
        input_tokens: i32,
        user_id: UserId,
        question: &str,
        mode: StudyMode,
        language: &str,
    ) -> Result<serde_json::Value> {
        self.settle(run.id, FAIL_CODE, async {
            let locale = self.user_locale(user_id).await?;
            let prompt = format!(
                "Mode: {mode}\nLanguage: {language}\nStudent question: {question}\n\nCourse context:\n{}",
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
                .run_structured::<StudyCompanionAnswer>(
                    &exec,
                    ARTIFACT_KIND,
                    load_prompt(Prompt::StudyCompanion, locale.as_deref()),
                    &prompt,
                    OutputSchema {
                        name: StudyCompanionAnswer::SCHEMA_NAME.into(),
                        schema: StudyCompanionAnswer::json_schema(),
                    },
                    |answer| &answer.citations,
                    || draft_study_answer(mode),
                )
                .await?;
            Ok(finished.artifact)
        })
        .await
    }
}
