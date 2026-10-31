//! AI pre-grading around the grade assistant (docs/AI-FIRST.md 4.3-4.6).
//!
//! Queueing drafts, reading them, approving them through the ordinary grading services, settling a
//! draft when the work is graded (agreement + calibration rows), the course switch, metrics and the
//! consistency report.

use std::collections::HashMap;

use ab_clients::embed::to_pg_vector;
use ab_core::ai::{AiFeature, AiRunKind, AiThreadRole};
use ab_core::id::{
    ActivityId, AiRunId, AssessmentItemId, CourseId, FileAttemptId, GradeDraftId, SubmissionId,
    UserId,
};
use ab_core::permission::Action;
use ab_core::{Error, FieldError, Result};
use ab_db::grade_drafts::{DraftRow, NewCorrection, NewDraft, PendingWork};
use ab_db::queue::NewJob;
use serde::Serialize;
use serde_json::{Value, json};
use sqlx::PgConnection;
use utoipa::ToSchema;

use super::concepts::hide_forbidden;
use crate::ai::AiService;
use crate::ai::agents::grade_assistant::{CALIBRATION_WINDOW, Proposal, offsets};
use crate::ai::budget::BudgetLane;
use crate::ai::runs::RunSpec;
use crate::assessments::AssessmentsService;
use crate::catalog::courses::Course;
use crate::files::submissions::{FileGradeAction, FileGradeInput, FileSubmissionsService};
use crate::grading::teacher::{GradeAction, GradeInput, GradingService, ItemGrade};
use crate::identity::Actor;

/// Auto drafts: one job per handed-in work when the course has them on.
pub const AUTO_DRAFT_JOB: &str = "ai:grade-draft";
/// At most this many drafts per manual queueing (a batch is one hourly unit).
pub const MAX_QUEUE: usize = 200;
/// A final grade within this share of the maximum counts as "accepted as is".
const EXACT_SHARE: f64 = 0.005;
/// Similar answers (cosine) whose grades differ by at least this share are reported.
const SIMILAR: f64 = 0.9;
const GAP: f64 = 0.15;
/// Teacher grade further than this share from the draft: a disagreement.
const DISAGREE: f64 = 0.20;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct GradeDraftView {
    pub id: GradeDraftId,
    pub activity_id: ActivityId,
    /// The submission or file attempt.
    pub subject_id: uuid::Uuid,
    pub is_file: bool,
    pub learner_id: UserId,
    pub run_id: Option<AiRunId>,
    /// `queued`, `ready`, `applied`, `discarded`, `superseded` or `failed`.
    pub status: String,
    pub subject_version: i64,
    /// Work-level percentages (0..100) as proposed and after calibration.
    pub ai_score: Option<f64>,
    pub calibrated_score: Option<f64>,
    pub max_score: Option<f64>,
    pub confidence: Option<f32>,
    pub flags: Vec<String>,
    pub model_name: Option<String>,
    pub error_code: Option<String>,
    /// `exact` or `adjusted` once applied.
    pub agreement: Option<String>,
    pub final_score: Option<f64>,
    pub decided_at: Option<i64>,
    pub created_at: i64,
    /// Scores per part and criterion with quotes (ready drafts).
    pub proposal: Option<Proposal>,
}

fn draft_view(d: DraftRow) -> GradeDraftView {
    let proposal = (d.status != "queued" && d.status != "failed")
        .then(|| serde_json::from_value::<Proposal>(d.proposal.clone()).ok())
        .flatten();
    GradeDraftView {
        subject_id: d.subject_id(),
        is_file: d.file_attempt_id.is_some(),
        id: d.id,
        activity_id: d.activity_id,
        learner_id: d.learner_id,
        run_id: d.run_id,
        status: d.status,
        subject_version: d.subject_version,
        ai_score: d.ai_score,
        calibrated_score: d.calibrated_score,
        max_score: d.max_score,
        confidence: d.confidence,
        flags: d.flags,
        model_name: d.model_name,
        error_code: d.error_code,
        agreement: d.agreement,
        final_score: d.final_score,
        decided_at: d.decided_at,
        created_at: d.created_at,
        proposal,
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct QueueReport {
    pub queued: Vec<GradeDraftId>,
    /// Works that already have a fresh draft (or are not waiting for a grade).
    pub skipped: usize,
}

/// One draft of a batch approval.
#[derive(Debug, Clone)]
pub struct ApproveItem {
    pub draft_id: GradeDraftId,
    /// A work-level percentage to save instead of the draft's.
    pub score: Option<f64>,
    /// Overall feedback instead of the draft's.
    pub feedback: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ApproveAction {
    Save,
    Publish,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ApproveOutcome {
    pub draft_id: GradeDraftId,
    /// `applied`, `stale` (the work changed), `not_ready` or `failed`.
    pub result: String,
    /// The error code of a failed item.
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct GradingSettings {
    pub auto_grade_drafts: bool,
    pub enabled_by: Option<UserId>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ActivityDraftStats {
    pub activity_id: ActivityId,
    pub activity_name: String,
    pub drafts: i64,
    pub ready: i64,
    pub applied: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct GradingMetrics {
    pub days: i64,
    pub drafts: i64,
    pub ready: i64,
    pub applied_exact: i64,
    pub applied_adjusted: i64,
    pub discarded: i64,
    pub failed: i64,
    /// Mean |teacher - draft| in percentage points over applied drafts.
    pub mean_abs_delta: Option<f64>,
    /// Median hours from hand-in to grade, this period and the one before.
    pub median_feedback_hours: Option<f64>,
    pub previous_median_feedback_hours: Option<f64>,
    /// Applied drafts × the configured manual grading minutes.
    pub saved_hours: f64,
    pub activities: Vec<ActivityDraftStats>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct WorkRef {
    pub subject_id: uuid::Uuid,
    pub learner_id: UserId,
    pub learner_name: String,
    /// Percentage of the part's maximum.
    pub score_pct: f64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SimilarPairView {
    pub part_key: String,
    pub similarity: f64,
    pub a: WorkRef,
    pub b: WorkRef,
    /// Percentage points between the two grades.
    pub gap: f64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DisagreementView {
    pub draft_id: GradeDraftId,
    pub subject_id: uuid::Uuid,
    pub learner_id: UserId,
    pub ai_score: f64,
    pub final_score: f64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DriftView {
    pub part_key: String,
    pub criterion_key: String,
    /// Mean (teacher - ai) / max, shrunk: negative = the AI grades higher than the teacher.
    pub offset: f64,
    pub corrections: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ConsistencyReport {
    pub pairs: Vec<SimilarPairView>,
    pub disagreements: Vec<DisagreementView>,
    pub drift: Vec<DriftView>,
}

fn invalid(field: &str, code: &str, message: impl Into<String>) -> Error {
    Error::validation(vec![FieldError {
        field: field.into(),
        code: code.into(),
        message: message.into(),
    }])
}

fn median(mut values: Vec<f64>) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(f64::total_cmp);
    let mid = values.len() / 2;
    Some(if values.len().is_multiple_of(2) {
        f64::midpoint(values[mid - 1], values[mid])
    } else {
        values[mid]
    })
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

/// `exact` when the grade of record is within 0.5% of the maximum from the proposal.
#[must_use]
pub fn agreement(proposed_pct: f64, final_pct: f64) -> &'static str {
    if (proposed_pct - final_pct).abs() <= 100.0 * EXACT_SHARE {
        "exact"
    } else {
        "adjusted"
    }
}

// ── Hooks inside the grading transactions ───────────────────────────────────

/// A grade was saved for a submission: close its live draft (`applied`, agreement) and record a
/// calibration row per part the teacher scored. Runs on the grade's transaction.
pub(crate) async fn settle_submission_draft(
    conn: &mut PgConnection,
    submission: SubmissionId,
    teacher: UserId,
    item_grades: &[ItemGrade],
    raw_pct: f64,
) -> Result<()> {
    let Some(draft) = ab_db::grade_drafts::live_for_subject(conn, submission.0).await? else {
        return Ok(());
    };
    if draft.status != "ready" {
        return ab_db::grade_drafts::supersede(conn, draft.id).await;
    }
    let proposal: Proposal = serde_json::from_value(draft.proposal.clone()).unwrap_or_default();
    for part in &proposal.parts {
        let Some(grade) = item_grades
            .iter()
            .find(|g| g.item_id.to_string() == part.part_id)
        else {
            continue;
        };
        let Some(score) = grade.score else { continue };
        if part.max_score <= 0.0 {
            continue;
        }
        ab_db::grade_drafts::insert_correction(
            conn,
            &NewCorrection {
                course_id: draft.course_id,
                activity_id: draft.activity_id,
                draft_id: draft.id,
                teacher_id: teacher,
                part_key: &part.part_id,
                criterion_key: "",
                ai_score: part.ai_score,
                teacher_score: score.clamp(0.0, part.max_score),
                max_score: part.max_score,
                excerpt: &part.excerpt.chars().take(1000).collect::<String>(),
                teacher_feedback: &grade.feedback.chars().take(1000).collect::<String>(),
            },
        )
        .await?;
    }
    let proposed = draft.calibrated_score.unwrap_or_default();
    ab_db::grade_drafts::mark_applied(
        conn,
        draft.id,
        teacher,
        agreement(proposed, raw_pct),
        Some(raw_pct),
    )
    .await
}

/// Same for a file attempt: rubric scores (or the total on an `overall` draft) become calibration rows.
pub(crate) async fn settle_file_draft(
    conn: &mut PgConnection,
    attempt: FileAttemptId,
    teacher: UserId,
    raw_pct: f64,
    rubric_scores: Option<&Value>,
    feedback: Option<&str>,
) -> Result<()> {
    let Some(draft) = ab_db::grade_drafts::live_for_subject(conn, attempt.0).await? else {
        return Ok(());
    };
    if draft.status != "ready" {
        return ab_db::grade_drafts::supersede(conn, draft.id).await;
    }
    let proposal: Proposal = serde_json::from_value(draft.proposal.clone()).unwrap_or_default();
    let teacher_scores: HashMap<String, f64> = rubric_scores
        .and_then(|r| r.get("criteria"))
        .and_then(Value::as_array)
        .map(|cs| {
            cs.iter()
                .filter_map(|c| {
                    Some((
                        c.get("criterion_id")?.as_str()?.to_owned(),
                        c.get("score")?.as_f64()?,
                    ))
                })
                .collect()
        })
        .unwrap_or_default();
    let feedback: String = feedback.unwrap_or_default().chars().take(1000).collect();
    for part in &proposal.parts {
        let excerpt: String = part.excerpt.chars().take(1000).collect();
        for criterion in &part.criteria {
            let score = match teacher_scores.get(&criterion.criterion_id) {
                Some(s) => *s,
                None if criterion.criterion_id == "overall" && part.criteria.len() == 1 => {
                    raw_pct / 100.0 * criterion.max_score
                }
                None => continue,
            };
            if criterion.max_score <= 0.0 {
                continue;
            }
            ab_db::grade_drafts::insert_correction(
                conn,
                &NewCorrection {
                    course_id: draft.course_id,
                    activity_id: draft.activity_id,
                    draft_id: draft.id,
                    teacher_id: teacher,
                    part_key: &part.part_id,
                    criterion_key: &criterion.criterion_id,
                    ai_score: criterion.ai_score,
                    teacher_score: score.clamp(0.0, criterion.max_score),
                    max_score: criterion.max_score,
                    excerpt: &excerpt,
                    teacher_feedback: &feedback,
                },
            )
            .await?;
        }
    }
    let proposed = draft.calibrated_score.unwrap_or_default();
    ab_db::grade_drafts::mark_applied(
        conn,
        draft.id,
        teacher,
        agreement(proposed, raw_pct),
        Some(raw_pct),
    )
    .await
}

/// On hand-in: owe an auto draft when the course has them on (inside the hand-in's transaction).
pub(crate) async fn owe_auto_draft(
    conn: &mut PgConnection,
    activity_id: ActivityId,
    subject_id: uuid::Uuid,
) -> Result<()> {
    let on = ab_db::grade_drafts::settings_for_activity(conn, activity_id)
        .await?
        .is_some_and(|s| s.auto_grade_drafts && s.enabled_by.is_some());
    if on {
        ab_db::queue::enqueue(
            &mut *conn,
            &NewJob::new(AUTO_DRAFT_JOB, json!({ "subject_id": subject_id }))
                .delayed(std::time::Duration::from_secs(5))
                .max_attempts(3)
                .dedupe(format!("ai:grade-draft:{subject_id}")),
        )
        .await?;
    }
    Ok(())
}

impl AiService {
    /// The activity's course, if the caller may grade it (`Action::Grade`), not archived.
    async fn grading_course(&self, actor: &Actor, activity_id: ActivityId) -> Result<Course> {
        let activity = ab_db::catalog::get_activity(&self.pool, activity_id)
            .await?
            .ok_or_else(|| Error::not_found("activity"))?;
        let course = self
            .visible_course(actor, activity.course_id)
            .await
            .map_err(|e| hide_forbidden(e, "activity"))?;
        AssessmentsService::require_scoped(actor, &course, Action::Grade, "ai grading")?;
        Ok(course)
    }

    /// UX-311: the gate of an activity-level drafts route.
    pub async fn require_draft_grader(&self, actor: &Actor, activity_id: ActivityId) -> Result<()> {
        self.grading_course(actor, activity_id)
            .await?
            .ensure_not_archived()
    }

    async fn accessible_draft(&self, actor: &Actor, id: GradeDraftId) -> Result<DraftRow> {
        let draft = ab_db::grade_drafts::get_draft(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("grade draft"))?;
        self.grading_course(actor, draft.activity_id)
            .await
            .map_err(|e| hide_forbidden(e, "grade draft"))?;
        Ok(draft)
    }

    /// The gate of a draft route.
    pub async fn require_grade_draft(&self, actor: &Actor, id: GradeDraftId) -> Result<()> {
        self.accessible_draft(actor, id).await.map(drop)
    }

    /// The course-level gate (metrics, settings): course write access.
    async fn grading_owner(&self, actor: &Actor, course_id: CourseId) -> Result<Course> {
        let course = self.visible_course(actor, course_id).await?;
        crate::ai::policy::require_course_update(actor, &course)?;
        Ok(course)
    }

    pub async fn require_grading_owner(&self, actor: &Actor, course_id: CourseId) -> Result<()> {
        self.grading_owner(actor, course_id)
            .await?
            .ensure_not_archived()
    }

    /// Queue drafts for the activity's works waiting for a grade (or the listed ones).
    pub async fn queue_grade_drafts(
        &self,
        actor: &Actor,
        activity_id: ActivityId,
        subject_ids: Option<&[uuid::Uuid]>,
    ) -> Result<QueueReport> {
        self.require_feature(AiFeature::GradingAssistant).await?;
        let course = self.grading_course(actor, activity_id).await?;
        course.ensure_not_archived()?;
        if subject_ids.is_some_and(|ids| ids.len() > MAX_QUEUE) {
            return Err(invalid(
                "subject_ids",
                "too-many",
                format!("at most {MAX_QUEUE} works at once"),
            ));
        }
        self.budget
            .assert_hourly(actor.user_id, BudgetLane::Analysis)
            .await?;
        let works: Vec<PendingWork> = ab_db::grade_drafts::pending_works(&self.pool, activity_id)
            .await?
            .into_iter()
            .filter(|w| subject_ids.is_none_or(|ids| ids.contains(&w.subject_id)))
            .take(MAX_QUEUE)
            .collect();
        let wanted = subject_ids.map_or(works.len(), <[uuid::Uuid]>::len);
        let mut queued = Vec::new();
        for work in &works {
            // A learner grading their own work through a draft is never offered.
            if work.learner_id == actor.user_id {
                continue;
            }
            if let Some(id) = self
                .queue_one(actor.user_id, course.id, activity_id, work)
                .await?
            {
                queued.push(id);
            }
        }
        Ok(QueueReport {
            skipped: wanted.saturating_sub(queued.len()),
            queued,
        })
    }

    async fn queue_one(
        &self,
        requested_by: UserId,
        course_id: CourseId,
        activity_id: ActivityId,
        work: &PendingWork,
    ) -> Result<Option<GradeDraftId>> {
        let mut tx = self.pool.begin().await?;
        let Some(draft_id) = ab_db::grade_drafts::insert_queued(
            &mut tx,
            &NewDraft {
                course_id,
                activity_id,
                submission_id: (!work.is_file).then_some(SubmissionId(work.subject_id)),
                file_attempt_id: work.is_file.then_some(FileAttemptId(work.subject_id)),
                learner_id: work.learner_id,
                requested_by: Some(requested_by),
                subject_version: work.version,
            },
        )
        .await?
        else {
            return Ok(None);
        };
        tx.commit().await?;
        let subject_key = if work.is_file {
            "file_submission_attempt_id"
        } else {
            "submission_id"
        };
        let mut metadata = json!({
            "grade_draft_id": draft_id,
            "course_id": course_id,
            "activity_id": activity_id,
        });
        metadata[subject_key] = json!(work.subject_id);
        let run = match self
            .create_run(
                requested_by,
                RunSpec {
                    kind: AiRunKind::GradeDraft,
                    role: AiThreadRole::Teacher,
                    queued: true,
                    course_id: Some(course_id),
                    activity_id: Some(activity_id),
                    metadata,
                    thread: None,
                    title: None,
                },
            )
            .await
        {
            Ok(run) => run,
            Err(err) => {
                ab_db::grade_drafts::mark_failed(&self.pool, draft_id, "AI_RUN_NOT_CREATED")
                    .await?;
                return Err(err);
            }
        };
        ab_db::grade_drafts::attach_run(&self.pool, draft_id, run.id).await?;
        if let Err(err) = self.enqueue_run(run.id).await {
            ab_db::grade_drafts::mark_failed(&self.pool, draft_id, "AI_QUEUE_UNAVAILABLE").await?;
            return Err(err);
        }
        Ok(Some(draft_id))
    }

    /// Worker: an auto draft for a handed-in work, as the teacher who turned auto drafts on.
    pub async fn auto_grade_draft(&self, subject_id: uuid::Uuid) -> Result<()> {
        if self
            .require_feature(AiFeature::GradingAssistant)
            .await
            .is_err()
        {
            return Ok(());
        }
        let Some(work) = ab_db::grade_drafts::pending_work(&self.pool, subject_id).await? else {
            return Ok(());
        };
        let mut conn = self.pool.acquire().await?;
        let settings = ab_db::grade_drafts::course_settings(&mut conn, work.course_id).await?;
        drop(conn);
        let Some(teacher) = settings
            .filter(|s| s.auto_grade_drafts)
            .and_then(|s| s.enabled_by)
        else {
            return Ok(());
        };
        let actor = match Actor::current(&self.pool, teacher).await {
            Ok(actor) => actor,
            Err(err) => {
                tracing::warn!(%subject_id, %err, "auto grade draft: the enabling teacher is gone");
                return Ok(());
            }
        };
        if let Err(err) = self.grading_course(&actor, work.activity_id).await {
            tracing::warn!(%subject_id, %err, "auto grade draft: AI_ACCESS_REVOKED");
            return Ok(());
        }
        if work.work.learner_id == teacher {
            return Ok(());
        }
        self.queue_one(teacher, work.course_id, work.activity_id, &work.work)
            .await
            .map(drop)
    }

    /// The newest draft of each work of the activity.
    pub async fn activity_grade_drafts(
        &self,
        actor: &Actor,
        activity_id: ActivityId,
    ) -> Result<Vec<GradeDraftView>> {
        self.grading_course(actor, activity_id).await?;
        Ok(
            ab_db::grade_drafts::latest_for_activity(&self.pool, activity_id)
                .await?
                .into_iter()
                .map(draft_view)
                .collect(),
        )
    }

    /// The newest draft of one work (the review page), if any.
    pub async fn subject_grade_draft(
        &self,
        actor: &Actor,
        subject_id: uuid::Uuid,
    ) -> Result<Option<GradeDraftView>> {
        let Some(draft) = ab_db::grade_drafts::latest_for_subject(&self.pool, subject_id).await?
        else {
            // The work itself must be reachable either way; otherwise 404.
            let subject = ab_core::id::AiSubjectId(subject_id);
            self.load_subject(subject)
                .await
                .map_err(|e| hide_forbidden(e, "grade draft"))?;
            return Ok(None);
        };
        self.grading_course(actor, draft.activity_id)
            .await
            .map_err(|e| hide_forbidden(e, "grade draft"))?;
        Ok(Some(draft_view(draft)))
    }

    pub async fn discard_grade_draft(
        &self,
        actor: &Actor,
        id: GradeDraftId,
    ) -> Result<GradeDraftView> {
        self.accessible_draft(actor, id).await?;
        if !ab_db::grade_drafts::discard(&self.pool, id, actor.user_id).await? {
            return Err(Error::conflict(
                "only a queued or ready draft can be discarded",
            ));
        }
        let draft = ab_db::grade_drafts::get_draft(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("grade draft"))?;
        Ok(draft_view(draft))
    }

    /// Batch approval: each draft goes through the ordinary grade save (same rights, the draft's
    /// work version as `If-Match`). One item failing never stops the others.
    pub async fn approve_grade_drafts(
        &self,
        actor: &Actor,
        grading: &GradingService,
        files: &FileSubmissionsService,
        activity_id: ActivityId,
        action: ApproveAction,
        items: &[ApproveItem],
    ) -> Result<Vec<ApproveOutcome>> {
        if items.len() > MAX_QUEUE {
            return Err(invalid(
                "items",
                "too-many",
                format!("at most {MAX_QUEUE} drafts at once"),
            ));
        }
        if let Some(bad) = items
            .iter()
            .find(|i| i.score.is_some_and(|s| !(0.0..=100.0).contains(&s)))
        {
            return Err(invalid(
                "items",
                "range",
                format!("score of draft {} must be within 0..=100", bad.draft_id),
            ));
        }
        let mut out = Vec::with_capacity(items.len());
        for item in items {
            let draft = self.accessible_draft(actor, item.draft_id).await?;
            // The route names the activity; a draft of another one is not found there.
            let result = if draft.activity_id == activity_id {
                self.approve_one(actor, grading, files, action, item, &draft)
                    .await
            } else {
                Err(Error::not_found("grade draft"))
            };
            out.push(match result {
                Ok(outcome) => ApproveOutcome {
                    draft_id: item.draft_id,
                    result: outcome.into(),
                    error: None,
                },
                Err(err) => ApproveOutcome {
                    draft_id: item.draft_id,
                    result: if matches!(err.code(), ab_core::ErrorCode::PreconditionFailed) {
                        "stale".into()
                    } else {
                        "failed".into()
                    },
                    error: Some(err.code().as_str().to_owned()),
                },
            });
        }
        Ok(out)
    }

    async fn approve_one(
        &self,
        actor: &Actor,
        grading: &GradingService,
        files: &FileSubmissionsService,
        action: ApproveAction,
        item: &ApproveItem,
        draft: &DraftRow,
    ) -> Result<&'static str> {
        if draft.status != "ready" {
            return Ok("not_ready");
        }
        let proposal: Proposal = serde_json::from_value(draft.proposal.clone())
            .map_err(|e| Error::internal("reading a grade draft", e))?;
        let overall = item
            .feedback
            .clone()
            .unwrap_or_else(|| proposal.overall_feedback.clone());
        if let Some(submission) = draft.submission_id {
            let item_grades = proposal
                .parts
                .iter()
                .filter_map(|p| {
                    Some(ItemGrade {
                        item_id: p.part_id.parse::<AssessmentItemId>().ok()?,
                        score: Some(p.calibrated_score),
                        feedback: p.feedback.clone(),
                    })
                })
                .collect();
            grading
                .save_grade(
                    actor,
                    submission,
                    GradeInput {
                        action: match action {
                            ApproveAction::Save => GradeAction::Save,
                            ApproveAction::Publish => GradeAction::Publish,
                        },
                        final_score: item.score.map(|s| Some(round2(s))),
                        feedback: Some(overall),
                        item_grades,
                        audit_note: Some(format!("AI draft {}", draft.id)),
                        expected_version: Some(draft.subject_version),
                    },
                )
                .await?;
        } else if let Some(attempt) = draft.file_attempt_id {
            let criteria: Vec<Value> = proposal
                .parts
                .iter()
                .flat_map(|p| &p.criteria)
                .filter(|c| c.criterion_id != "overall")
                .map(|c| {
                    json!({
                        "criterion_id": c.criterion_id,
                        "label": c.label,
                        "score": c.calibrated_score,
                        "max_score": c.max_score,
                    })
                })
                .collect();
            let score = item
                .score
                .or(draft.calibrated_score)
                .ok_or_else(|| Error::conflict("the draft has no score"))?;
            files
                .grade(
                    actor,
                    attempt,
                    FileGradeInput {
                        action: match action {
                            ApproveAction::Save => FileGradeAction::Save,
                            ApproveAction::Publish => FileGradeAction::Publish,
                        },
                        final_score: Some(round2(score)),
                        feedback: Some(overall),
                        rubric_scores: (!criteria.is_empty())
                            .then(|| json!({ "criteria": criteria })),
                        expected_version: Some(draft.subject_version),
                    },
                )
                .await?;
        }
        Ok("applied")
    }

    pub async fn grading_settings(
        &self,
        actor: &Actor,
        course_id: CourseId,
    ) -> Result<GradingSettings> {
        self.grading_owner(actor, course_id).await?;
        let mut conn = self.pool.acquire().await?;
        let row = ab_db::grade_drafts::course_settings(&mut conn, course_id).await?;
        Ok(GradingSettings {
            auto_grade_drafts: row.as_ref().is_some_and(|r| r.auto_grade_drafts),
            enabled_by: row.and_then(|r| r.enabled_by),
        })
    }

    pub async fn set_grading_settings(
        &self,
        actor: &Actor,
        course_id: CourseId,
        auto_grade_drafts: bool,
    ) -> Result<GradingSettings> {
        self.grading_owner(actor, course_id)
            .await?
            .ensure_not_archived()?;
        if auto_grade_drafts {
            self.require_feature(AiFeature::GradingAssistant).await?;
        }
        ab_db::grade_drafts::set_course_settings(
            &self.pool,
            course_id,
            auto_grade_drafts,
            actor.user_id,
        )
        .await?;
        self.grading_settings(actor, course_id).await
    }

    pub async fn grading_metrics(
        &self,
        actor: &Actor,
        course_id: CourseId,
        days: i64,
    ) -> Result<GradingMetrics> {
        self.grading_owner(actor, course_id).await?;
        let days = days.clamp(1, 365);
        let now = jiff::Timestamp::now().as_second();
        let from = now - days * 86_400;
        let counts = ab_db::grade_drafts::draft_counts(&self.pool, course_id, from).await?;
        let current = ab_db::grade_drafts::feedback_hours(&self.pool, course_id, from, now).await?;
        let previous =
            ab_db::grade_drafts::feedback_hours(&self.pool, course_id, from - days * 86_400, from)
                .await?;
        let activities = ab_db::grade_drafts::activity_stats(&self.pool, course_id)
            .await?
            .into_iter()
            .map(|a| ActivityDraftStats {
                activity_id: a.activity_id,
                activity_name: a.activity_name,
                drafts: a.drafts,
                ready: a.ready,
                applied: a.applied,
            })
            .collect();
        #[allow(clippy::cast_precision_loss, reason = "draft counts are small")]
        let saved_hours = round2(
            (counts.applied_exact + counts.applied_adjusted) as f64
                * f64::from(self.config.manual_grading_minutes)
                / 60.0,
        );
        Ok(GradingMetrics {
            days,
            drafts: counts.total,
            ready: counts.ready,
            applied_exact: counts.applied_exact,
            applied_adjusted: counts.applied_adjusted,
            discarded: counts.discarded,
            failed: counts.failed,
            mean_abs_delta: counts.mean_abs_delta.map(round2),
            median_feedback_hours: median(current).map(round2),
            previous_median_feedback_hours: median(previous).map(round2),
            saved_hours,
            activities,
        })
    }

    /// Similar answers graded apart, drafts the teacher disagreed with, and the AI's drift.
    pub async fn grading_consistency(
        &self,
        actor: &Actor,
        activity_id: ActivityId,
    ) -> Result<ConsistencyReport> {
        self.grading_course(actor, activity_id).await?;
        let mut parts =
            ab_db::grade_drafts::graded_submission_parts(&self.pool, activity_id).await?;
        let files = ab_db::grade_drafts::graded_file_attempts(&self.pool, activity_id).await?;
        // File texts are the draft excerpts (the files themselves are not re-read here).
        let drafts = ab_db::grade_drafts::latest_for_activity(&self.pool, activity_id).await?;
        for mut file in files {
            let excerpt = drafts
                .iter()
                .find(|d| d.file_attempt_id.map(|a| a.0) == Some(file.subject_id))
                .and_then(|d| serde_json::from_value::<Proposal>(d.proposal.clone()).ok())
                .and_then(|p| p.parts.first().map(|p| p.excerpt.clone()))
                .unwrap_or_default();
            if !excerpt.trim().is_empty() {
                file.text = excerpt;
                parts.push(file);
            }
        }
        let pairs = self.similar_graded(activity_id, &parts).await?;
        let disagreements = drafts
            .iter()
            .filter(|d| d.status == "applied")
            .filter_map(|d| {
                let ai = d.calibrated_score?;
                let fin = d.final_score?;
                ((ai - fin).abs() > 100.0 * DISAGREE).then(|| DisagreementView {
                    draft_id: d.id,
                    subject_id: d.subject_id(),
                    learner_id: d.learner_id,
                    ai_score: ai,
                    final_score: fin,
                })
            })
            .collect();
        let corrections =
            ab_db::grade_drafts::recent_corrections(&self.pool, activity_id, CALIBRATION_WINDOW)
                .await?;
        let mut counts: HashMap<(String, String), i64> = HashMap::new();
        for c in &corrections {
            *counts
                .entry((c.part_key.clone(), c.criterion_key.clone()))
                .or_default() += 1;
        }
        let mut drift: Vec<DriftView> = offsets(&corrections)
            .into_iter()
            .map(|((part_key, criterion_key), offset)| DriftView {
                corrections: counts
                    .get(&(part_key.clone(), criterion_key.clone()))
                    .copied()
                    .unwrap_or_default(),
                part_key,
                criterion_key,
                offset: (offset * 1000.0).round() / 1000.0,
            })
            .collect();
        drift.sort_by(|a, b| b.offset.abs().total_cmp(&a.offset.abs()));
        Ok(ConsistencyReport {
            pairs,
            disagreements,
            drift,
        })
    }

    /// Embeds (with a cache) the graded answers and pairs alike ones graded apart.
    async fn similar_graded(
        &self,
        activity_id: ActivityId,
        parts: &[ab_db::grade_drafts::GradedPart],
    ) -> Result<Vec<SimilarPairView>> {
        let model = self.retrieval.model().to_owned();
        let mut missing: Vec<&ab_db::grade_drafts::GradedPart> = Vec::new();
        for part in parts.iter().filter(|p| p.text.trim().chars().count() >= 20) {
            let hash = text_hash(&part.text);
            if !ab_db::grade_drafts::cached_embedding(
                &self.pool,
                part.subject_id,
                &part.part_key,
                &hash,
                &model,
            )
            .await?
            {
                missing.push(part);
            }
        }
        for chunk in missing.chunks(32) {
            let texts: Vec<String> = chunk
                .iter()
                .map(|p| p.text.chars().take(4000).collect())
                .collect();
            let vectors = match self.retrieval.embedder().embed(&texts).await {
                Ok(v) => v,
                Err(err) => {
                    tracing::warn!(%err, "consistency: answers not embedded");
                    break;
                }
            };
            for (part, vector) in chunk.iter().zip(vectors) {
                ab_db::grade_drafts::store_embedding(
                    &self.pool,
                    part.subject_id,
                    &part.part_key,
                    activity_id,
                    &text_hash(&part.text),
                    &model,
                    &to_pg_vector(&vector),
                )
                .await?;
            }
        }
        let by_key: HashMap<(uuid::Uuid, &str), &ab_db::grade_drafts::GradedPart> = parts
            .iter()
            .map(|p| ((p.subject_id, p.part_key.as_str()), p))
            .collect();
        let pct = |p: &ab_db::grade_drafts::GradedPart| {
            if p.max_score > 0.0 {
                p.score / p.max_score * 100.0
            } else {
                0.0
            }
        };
        let work = |p: &ab_db::grade_drafts::GradedPart| WorkRef {
            subject_id: p.subject_id,
            learner_id: p.learner_id,
            learner_name: p.learner_name.clone(),
            score_pct: round2(pct(p)),
        };
        Ok(
            ab_db::grade_drafts::similar_pairs(&self.pool, activity_id, &model, SIMILAR)
                .await?
                .into_iter()
                .filter_map(|pair| {
                    let a = by_key.get(&(pair.a, pair.part_key.as_str()))?;
                    let b = by_key.get(&(pair.b, pair.part_key.as_str()))?;
                    let gap = (pct(a) - pct(b)).abs();
                    (gap >= 100.0 * GAP).then(|| SimilarPairView {
                        similarity: (pair.similarity * 1000.0).round() / 1000.0,
                        a: work(a),
                        b: work(b),
                        gap: round2(gap),
                        part_key: pair.part_key,
                    })
                })
                .take(50)
                .collect(),
        )
    }
}

fn text_hash(text: &str) -> String {
    use sha2::Digest;
    let digest = sha2::Sha256::digest(text.as_bytes());
    digest
        .iter()
        .take(16)
        .fold(String::with_capacity(32), |mut out, b| {
            use std::fmt::Write as _;
            let _ = write!(out, "{b:02x}");
            out
        })
}

#[cfg(test)]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::float_cmp,
    clippy::panic
)]
mod tests {
    use super::*;

    #[test]
    fn agreement_is_exact_within_half_a_percent() {
        assert_eq!(agreement(72.0, 72.4), "exact");
        assert_eq!(agreement(72.0, 73.0), "adjusted");
    }

    #[test]
    fn median_of_even_and_odd_lists() {
        assert_eq!(median(vec![]), None);
        assert_eq!(median(vec![3.0, 1.0, 2.0]), Some(2.0));
        assert_eq!(median(vec![4.0, 1.0, 2.0, 3.0]), Some(2.5));
    }
}
