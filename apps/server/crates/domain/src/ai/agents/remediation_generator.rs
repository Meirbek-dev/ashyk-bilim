//! Remediation generator (legacy `agents/remediation_generator.py` +
//! `run_remediation_generation` / `queue_remediation_generation` /
//! sessions / completion / the active gate).
//!
//! Needs a submission analysis; when none exists one is produced first
//! (its own run), exactly as the legacy did inline.

use ab_clients::llm::OutputSchema;
use ab_core::ai::{AiFeature, AiRunKind, AiThreadRole, RemediationStatus};
use ab_core::id::{ActivityId, AiRemediationSessionId, AiSubjectId, UserId};
use ab_core::{Error, ErrorCode, FieldError, Result};
use ab_db::ai::{NewRemediationSession, RemediationSessionRow, RunRow, SubmissionAnalysisRow};
use tokio_util::sync::CancellationToken;

use super::submission_analyst::{merged, role_for};
use super::{Execution, draft_citation, metadata_language, run_user};
use crate::ai::AiService;
use crate::ai::budget::BudgetLane;
use crate::ai::context::ContextBundle;
use crate::ai::policy;
use crate::ai::prompts::{Prompt, clipped, load_prompt};
use crate::ai::redact;
use crate::ai::runs::RunSpec;
use crate::ai::schemas::{RemediationBundle, RemediationQuestion, SubmissionAnalysisReport};
use crate::ai::subject::{Subject, run_subject};
use crate::identity::Actor;

const ARTIFACT_KIND: &str = "remediation";
const FAIL_CODE: &str = "REMEDIATION_FAILED";
/// Legacy: `passed` at 70 or above.
pub const PASS_SCORE: i32 = 70;

/// The owner reads (and builds on) only analyses produced from the
/// learner's view — their own runs; graders see every run (BUG-185).
pub(crate) fn learner_only(subject: &Subject, viewer: UserId) -> Option<UserId> {
    Some(viewer).filter(|v| *v == subject.user_id())
}

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

impl AiService {
    /// The newest analysis, or a fresh one produced now (own run).
    async fn analysis_for(
        &self,
        run: &RunRow,
        token: &CancellationToken,
        subject: &Subject,
        user_id: UserId,
        language: &str,
    ) -> Result<SubmissionAnalysisRow> {
        if let Some(existing) = ab_db::ai::latest_submission_analysis(
            &self.pool,
            subject.id(),
            learner_only(subject, user_id),
        )
        .await?
        {
            return Ok(existing);
        }
        let (bundle, metadata) = self.subject_bundle(subject, user_id).await?;
        let rendered = bundle.render();
        let input_tokens = self.budget.assert_request(&self.pool, &rendered).await?;
        let analysis_run = self
            .create_run(
                user_id,
                RunSpec {
                    kind: AiRunKind::SubmissionAnalysis,
                    role: role_for(user_id, subject),
                    queued: false,
                    course_id: Some(subject.course_id()),
                    activity_id: None,
                    metadata: merged(
                        merged(metadata, subject.metadata()),
                        serde_json::json!({
                            "course_id": subject.course_id(),
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

    /// `POST /ai/remediation/{subject}/generate` — inline.
    pub async fn generate_remediation(
        &self,
        actor: &Actor,
        subject_id: AiSubjectId,
        gate_mode: bool,
        language: &str,
    ) -> Result<RemediationSessionRow> {
        self.require_feature(AiFeature::Remediation)?;
        let subject = self.accessible_subject(actor, subject_id).await?;
        self.require_gate_rights(actor, &subject, gate_mode).await?;
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Remediation)
            .await?;
        let (bundle, metadata) = self.subject_bundle(&subject, actor.user_id).await?;
        let rendered = bundle.render();
        let input_tokens = self.budget.assert_request(&self.pool, &rendered).await?;
        let activity_id = self.subject_activity(&subject).await?;
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::Remediation,
                    role: AiThreadRole::Teacher,
                    queued: false,
                    course_id: Some(subject.course_id()),
                    activity_id: Some(activity_id),
                    metadata: merged(
                        merged(metadata, subject.metadata()),
                        serde_json::json!({
                            "course_id": subject.course_id(),
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
            &subject,
            &bundle,
            &rendered,
            input_tokens,
            actor.user_id,
            gate_mode,
            language,
        ))
        .await
    }

    /// BUG-141: a gate (`gate_mode`) blocks the learner's next attempt, so
    /// only someone who grades the course may set one — never the learner.
    async fn require_gate_rights(
        &self,
        actor: &Actor,
        subject: &Subject,
        gate_mode: bool,
    ) -> Result<()> {
        if !gate_mode {
            return Ok(());
        }
        let course = self.courses.get(actor, subject.course_id()).await?;
        policy::require_course_update(actor, &course)?;
        // BUG-179: one blocking gate per learner and activity — a second one
        // would stack behind the first and outlive it in `latest`.
        let activity_id = self.subject_activity(subject).await?;
        self.refuse_stacked_gate(subject, activity_id).await
    }

    /// 409 `conflict` naming the gate that already blocks the learner.
    async fn refuse_stacked_gate(&self, subject: &Subject, activity_id: ActivityId) -> Result<()> {
        match ab_db::ai::active_remediation_gate(&self.pool, subject.user_id(), activity_id).await?
        {
            Some(existing) => Err(Error::app_with_details(
                ErrorCode::Conflict,
                "an unpassed remediation gate already blocks this learner",
                serde_json::json!({ "session_id": existing }),
            )),
            None => Ok(()),
        }
    }

    /// `POST /ai/remediation/{subject}/generate/queue`.
    pub async fn queue_remediation(
        &self,
        actor: &Actor,
        subject_id: AiSubjectId,
        gate_mode: bool,
        language: &str,
    ) -> Result<RunRow> {
        self.require_feature(AiFeature::Remediation)?;
        let subject = self.accessible_subject(actor, subject_id).await?;
        self.require_gate_rights(actor, &subject, gate_mode).await?;
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Remediation)
            .await?;
        let activity_id = self.subject_activity(&subject).await?;
        let run = self
            .create_run(
                actor.user_id,
                RunSpec {
                    kind: AiRunKind::Remediation,
                    role: role_for(actor.user_id, &subject),
                    queued: true,
                    course_id: Some(subject.course_id()),
                    activity_id: Some(activity_id),
                    metadata: merged(
                        subject.metadata(),
                        serde_json::json!({
                            "course_id": subject.course_id(),
                            "gate_mode": gate_mode,
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

    pub(crate) async fn execute_queued_remediation(
        &self,
        run: &RunRow,
        token: &CancellationToken,
    ) -> Result<()> {
        let gate_mode = run
            .metadata
            .get("gate_mode")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
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
        Box::pin(self.remediation_execute(
            run,
            token,
            &subject,
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
        subject: &Subject,
        bundle: &ContextBundle,
        rendered: &str,
        input_tokens: i32,
        user_id: UserId,
        gate_mode: bool,
        language: &str,
    ) -> Result<RemediationSessionRow> {
        Box::pin(self.settle(run.id, FAIL_CODE, async {
            // BUG-185: the enqueue-time check cannot see a sibling job still
            // in flight — refuse before spending the model call, and the
            // partial unique index decides the race at the insert.
            let activity_id = self.subject_activity(subject).await?;
            if gate_mode {
                self.refuse_stacked_gate(subject, activity_id).await?;
            }
            let analysis = self
                .analysis_for(run, token, subject, user_id, language)
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
            let inserted = ab_db::ai::insert_remediation_session(
                &self.pool,
                NewRemediationSession {
                    subject: subject.id(),
                    activity_id,
                    student_user_id: subject.user_id(),
                    analysis_id: Some(analysis.id),
                    run_id: run.id,
                    gate_mode,
                    language: &finished.value.language,
                    lecture: &finished.artifact,
                    test: &serde_json::json!({ "questions": questions }),
                },
            )
            .await?;
            // The race loser's run is already `succeeded` by `run_structured`
            // (artifact saved, no session): `settle` → `fail_run` flips it to
            // `failed` (BUG-189).
            let Some(id) = inserted else {
                self.refuse_stacked_gate(subject, activity_id).await?;
                return Err(Error::conflict(
                    "a remediation gate was assigned concurrently",
                ));
            };
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

    /// `GET /ai/remediation/{subject}/latest`: the newest **blocking** session
    /// on the work if one exists (BUG-179), else the newest, for whoever may
    /// read the work (UX-115: the grader's gate card reads the status here —
    /// the learner's session list is admin-only).
    pub async fn latest_remediation(
        &self,
        actor: &Actor,
        subject_id: AiSubjectId,
    ) -> Result<Option<RemediationSessionRow>> {
        let subject = self.accessible_subject(actor, subject_id).await?;
        ab_db::ai::latest_remediation_session(&self.pool, subject.id()).await
    }

    /// `GET /ai/remediation/student/{user}`: own sessions, or any with the
    /// platform-scoped `platform:read` (admins only — course staff get 403).
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
        // UX-134 / UX-141: a stranger sees an unknown session (404); a reader
        // who is not the learner — the grader — may not complete it (403).
        let session = self.accessible_remediation(actor, id).await?;
        if session.student_user_id != actor.user_id {
            return Err(Error::forbidden(
                "only the learner of this session can complete it",
            ));
        }
        // UX-099: a passed session is final — re-completing it with a lower
        // score must not re-lock the gate.
        if session.status == RemediationStatus::Passed {
            return Err(Error::conflict("remediation session already passed"));
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
