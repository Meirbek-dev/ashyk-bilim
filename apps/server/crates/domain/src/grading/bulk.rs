//! Bulk gradebook actions with a persisted audit row (`bulk_actions`) and
//! execution on the job queue. Ported from `grading/bulk.py`.
//!
//! Only deadline extensions exist so far: per target learner an override
//! carrying the new due date (other override fields untouched — the legacy
//! overwrote the note and left the rest), then every submitted attempt's
//! `is_late` is recomputed against the new date. A hand-in that becomes on
//! time also loses its late penalty: graded rows get a new ledger entry
//! with the penalty cleared and the final score recomputed (the legacy kept
//! deducting — DECISIONS.md, BUG-139).

use ab_core::assessments::{BulkActionStatus, BulkActionType};
use ab_core::id::{AssessmentId, BulkActionId, UserId};
use ab_core::permission::Action;
use ab_core::{Error, FieldError, Result};
use ab_db::queue::NewJob;
use ab_db::submissions::NewGradingEntry;
use sqlx::PgPool;

use crate::assessments::service::AssessmentsService;
use crate::events::GradingEvents;
use crate::grading::penalties::attempt_cap;
use crate::grading::teacher::GradingService;
use crate::identity::Actor;
use crate::progress::ProgressProjector;

/// Job kind carrying `{ "action_id": … }`.
pub const BULK_ACTION_JOB: &str = "grading:bulk-action";
/// Learners per deadline extension (legacy cap).
pub const MAX_EXTENSION_TARGETS: usize = 500;

#[derive(Debug, Clone)]
pub struct BulkAction {
    pub id: BulkActionId,
    pub assessment_id: AssessmentId,
    pub performed_by: Option<UserId>,
    pub action_type: BulkActionType,
    pub status: BulkActionStatus,
    pub params: serde_json::Value,
    pub target_user_ids: Vec<UserId>,
    pub affected_count: i32,
    pub error_log: String,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

impl From<ab_db::submissions::BulkActionRow> for BulkAction {
    fn from(r: ab_db::submissions::BulkActionRow) -> Self {
        Self {
            id: r.id,
            assessment_id: r.assessment_id,
            performed_by: r.performed_by,
            action_type: r.action_type,
            status: r.status,
            params: r.params,
            target_user_ids: r.target_user_ids,
            affected_count: r.affected_count,
            error_log: r.error_log,
            created_at: r.created_at,
            completed_at: r.completed_at,
        }
    }
}

pub struct DeadlineExtension<'a> {
    pub user_ids: &'a [UserId],
    pub new_due_at: i64,
    pub reason: &'a str,
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

impl GradingService {
    /// Record a deadline extension and queue its execution (202 semantics:
    /// poll [`Self::bulk_action`]). The row and the job commit together.
    pub async fn extend_deadline(
        &self,
        actor: &Actor,
        assessment_id: AssessmentId,
        input: DeadlineExtension<'_>,
    ) -> Result<BulkAction> {
        let (_, course) = self.grader_context(actor, assessment_id).await?;
        let mut errors = Vec::new();
        if input.user_ids.is_empty() || input.user_ids.len() > MAX_EXTENSION_TARGETS {
            errors.push(FieldError {
                field: "user_ids".into(),
                code: "length".into(),
                message: format!("between 1 and {MAX_EXTENSION_TARGETS} learners"),
            });
        }
        if input.new_due_at <= now_unix() {
            errors.push(FieldError {
                field: "new_due_at_unix".into(),
                code: "past".into(),
                message: "the new due date must be in the future".into(),
            });
        }
        if !errors.is_empty() {
            return Err(Error::validation(errors));
        }
        let mut targets = input.user_ids.to_vec();
        targets.sort();
        targets.dedup();
        let known = ab_db::identity::list_user_summaries(&self.pool, &targets).await?;
        if known.len() != targets.len() {
            let known_ids: Vec<UserId> = known.iter().map(|u| u.id).collect();
            let missing: Vec<UserId> = targets
                .iter()
                .filter(|id| !known_ids.contains(id))
                .copied()
                .collect();
            return Err(Error::app_with_details(
                ab_core::ErrorCode::ValidationFailed,
                "unknown learners in user_ids",
                serde_json::json!({ "unknown_user_ids": missing }),
            ));
        }
        // BUG-247: the same rule as `POST overrides/{user}` — an extension
        // is for a member of the course, named per id; never the caller's
        // own attempts (BUG-288).
        let mut outsiders = Vec::new();
        for &user_id in &targets {
            if user_id == actor.user_id {
                outsiders.push(FieldError {
                    field: format!("user_ids.{user_id}"),
                    code: "own-attempt".into(),
                    message: crate::grading::teacher::GRADE_OWN_ATTEMPT.into(),
                });
                continue;
            }
            if let Some(e) = AssessmentsService::not_member(
                &self.pool,
                course.id,
                user_id,
                format!("user_ids.{user_id}"),
            )
            .await?
            {
                outsiders.push(e);
            }
        }
        if !outsiders.is_empty() {
            return Err(Error::validation(outsiders));
        }
        let params = serde_json::json!({
            "new_due_at": input.new_due_at, "reason": input.reason,
        });
        let mut tx = self.pool.begin().await?;
        let id = ab_db::submissions::insert_bulk_action(
            &mut *tx,
            assessment_id,
            actor.user_id,
            BulkActionType::ExtendDeadline,
            &params,
            &targets,
        )
        .await?;
        ab_db::queue::enqueue(
            &mut *tx,
            &NewJob::new(BULK_ACTION_JOB, serde_json::json!({ "action_id": id })),
        )
        .await?;
        tx.commit().await?;
        ab_db::assessments::insert_audit_event(
            &self.pool,
            assessment_id,
            Some(actor.user_id),
            "deadline-extension-requested",
            serde_json::json!({
                "action_id": id, "learners": targets.len(), "new_due_at": input.new_due_at,
            }),
        )
        .await?;
        self.bulk_action(actor, id).await
    }

    /// A bulk action's status (graders of its assessment).
    pub async fn bulk_action(&self, actor: &Actor, id: BulkActionId) -> Result<BulkAction> {
        let row = ab_db::submissions::get_bulk_action(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("bulk action"))?;
        self.grader_context(actor, row.assessment_id).await?;
        Ok(row.into())
    }

    /// Run a queued action (job handler + tests). A failure is recorded on
    /// the row and not retried — the grader sees it and re-requests. The
    /// performer's grading access is checked again here (UX-136: a
    /// maintainer demoted between the enqueue and the worker run).
    pub async fn execute_bulk_action(
        pool: &PgPool,
        events: Option<&GradingEvents>,
        id: BulkActionId,
    ) -> Result<()> {
        let Some(row) = ab_db::submissions::get_bulk_action(pool, id).await? else {
            tracing::warn!(%id, "bulk action vanished before execution");
            return Ok(());
        };
        if row.status != BulkActionStatus::Pending {
            return Ok(());
        }
        ab_db::submissions::set_bulk_action_status(pool, id, BulkActionStatus::Running, 0, "")
            .await?;
        let outcome = match performer_may_grade(pool, &row).await {
            Err(err) => Err(err),
            Ok(course) => match row.action_type {
                BulkActionType::ExtendDeadline => {
                    run_deadline_extension(pool, events, &row, &course).await
                }
                other => Err(Error::app(
                    ab_core::ErrorCode::Internal,
                    format!("bulk action type {other} is not implemented"),
                )),
            },
        };
        match outcome {
            Ok((affected, log)) => {
                ab_db::submissions::set_bulk_action_status(
                    pool,
                    id,
                    BulkActionStatus::Completed,
                    affected,
                    &log,
                )
                .await
            }
            Err(err) => {
                tracing::error!(%id, %err, "bulk action failed");
                ab_db::submissions::set_bulk_action_status(
                    pool,
                    id,
                    BulkActionStatus::Failed,
                    0,
                    &err.to_string(),
                )
                .await
            }
        }
    }
}

/// The performer's grading access on the action's course as of now.
async fn performer_may_grade(
    pool: &PgPool,
    row: &ab_db::submissions::BulkActionRow,
) -> Result<ab_db::catalog::CourseRow> {
    let performer = row
        .performed_by
        .ok_or_else(|| Error::app(ab_core::ErrorCode::Internal, "action has no performer"))?;
    let assessment = ab_db::assessments::get_assessment(pool, row.assessment_id)
        .await?
        .ok_or_else(|| Error::not_found("assessment"))?;
    let course = ab_db::catalog::get_course(pool, assessment.course_id)
        .await?
        .ok_or_else(|| Error::not_found("course"))?;
    let actor = Actor::current(pool, performer).await?;
    AssessmentsService::require_scoped(&actor, &course, Action::Grade, "grading").map_err(
        |_| Error::forbidden("the performer no longer has grading access to this course"),
    )?;
    Ok(course)
}

/// One submission's lateness after a deadline change. BUG-216: the scoring
/// fields are re-read under the row lock a concurrent grade save contends
/// for, and the re-score lands in the same transaction — a save that priced
/// the old penalty either waits and sees the bumped version (412) or landed
/// first and is re-scored here.
async fn settle_lateness(
    pool: &PgPool,
    assessment: &ab_db::assessments::AssessmentRow,
    submission: &ab_db::submissions::SubmissionRow,
    late: bool,
    granted_by: UserId,
) -> Result<()> {
    let mut tx = pool.begin().await?;
    let Some(locked) = ab_db::submissions::lock_for_lateness(&mut tx, submission.id).await? else {
        return Ok(());
    };
    if late == locked.is_late {
        return Ok(());
    }
    // On time now: the penalty goes, and a row with a score of record is
    // re-scored from its ledger (raw score, attempt cap, no late deduction).
    // BUG-206: a pending row (feedback-only saved, no final) keeps its
    // `NULL` — the ledger entry is not a grade.
    let mut penalty_pct = locked.late_penalty_pct;
    let mut final_score = None;
    if !late && penalty_pct > 0.0 {
        penalty_pct = 0.0;
        if locked.final_score.is_some()
            && let Some(entry) =
                ab_db::submissions::latest_grading_entry(&mut *tx, submission.id).await?
        {
            let rescored = attempt_cap(
                entry.raw_score,
                assessment.attempt_penalty_percent,
                submission.attempt_number,
            );
            ab_db::submissions::insert_grading_entry(
                &mut *tx,
                NewGradingEntry {
                    submission_id: submission.id,
                    graded_by: Some(granted_by),
                    raw_score: entry.raw_score,
                    penalty_pct: 0.0,
                    final_score: Some(rescored),
                    raw_breakdown: &entry.raw_breakdown,
                    effective_breakdown: &entry.effective_breakdown,
                    overall_feedback: &entry.overall_feedback,
                    published: entry.published_at.is_some(),
                },
            )
            .await?;
            final_score = Some(rescored);
        }
    }
    ab_db::submissions::set_lateness(&mut *tx, submission.id, late, penalty_pct, final_score)
        .await?;
    tx.commit().await?;
    Ok(())
}

/// BUG-284: the lateness step behind every override writer (create/update
/// and the bulk extension, each right after its override commits): the
/// learner's hand-ins are re-judged by [`EffectivePolicy::is_late`] against
/// the policy the write left behind — a new due date or a waiver alike.
/// Returns the learner's submitted attempts (previews skipped: their policy
/// never had a penalty).
///
/// [`EffectivePolicy::is_late`]: crate::assessments::access::EffectivePolicy::is_late
pub(crate) async fn settle_override(
    pool: &PgPool,
    assessment: &ab_db::assessments::AssessmentRow,
    user_id: UserId,
    granted_by: UserId,
) -> Result<Vec<ab_db::submissions::SubmissionRow>> {
    let effective =
        AssessmentsService::effective_policy_for(pool, assessment, user_id, false).await?;
    let submitted =
        ab_db::submissions::list_submitted_for_user(pool, assessment.id, user_id).await?;
    for submission in submitted.iter().filter(|s| !s.preview) {
        let late = submission
            .submitted_at
            .is_some_and(|at| effective.is_late(at));
        settle_lateness(pool, assessment, submission, late, granted_by).await?;
    }
    // BUG-251: only a target with work has lateness to re-project, and an
    // override never enrols (no trail run from a grader's action).
    if !submitted.is_empty() {
        ProgressProjector::new(pool.clone())
            .reproject_submission(assessment.id, user_id)
            .await;
    }
    Ok(submitted)
}

async fn run_deadline_extension(
    pool: &PgPool,
    events: Option<&GradingEvents>,
    row: &ab_db::submissions::BulkActionRow,
    course: &ab_db::catalog::CourseRow,
) -> Result<(i32, String)> {
    let new_due_at = row.params["new_due_at"]
        .as_i64()
        .ok_or_else(|| Error::app(ab_core::ErrorCode::Internal, "malformed params"))?;
    let reason = row.params["reason"].as_str().unwrap_or_default();
    let granted_by = row
        .performed_by
        .ok_or_else(|| Error::app(ab_core::ErrorCode::Internal, "action has no performer"))?;
    let assessment = ab_db::assessments::get_assessment(pool, row.assessment_id)
        .await?
        .ok_or_else(|| Error::not_found("assessment"))?;
    // BUG-247: membership is re-checked per learner (left between the
    // request and the run → skipped and named in the log); BUG-271: the
    // check and the override commit under the member's trail lock, so a
    // leave lands wholly before or after.
    let mut affected = 0;
    let mut skipped = Vec::new();
    for &user_id in &row.target_user_ids {
        // BUG-288: never the performer's own attempts.
        if user_id == granted_by {
            skipped.push(user_id.to_string());
            continue;
        }
        let Some(mut tx) =
            crate::progress::trail::lock_member(pool, user_id, course.id, false).await?
        else {
            skipped.push(user_id.to_string());
            continue;
        };
        ab_db::assessments::upsert_override_due(
            &mut *tx,
            row.assessment_id,
            user_id,
            new_due_at,
            reason,
            granted_by,
        )
        .await?;
        tx.commit().await?;
        let submitted = settle_override(pool, &assessment, user_id, granted_by).await?;
        if let (Some(events), Some(latest)) = (events, submitted.first()) {
            events
                .publish_best_effort(
                    latest.id,
                    "deadline.extended",
                    serde_json::json!({ "new_due_at": new_due_at, "reason": reason }),
                )
                .await;
        }
        affected += 1;
    }
    ab_db::assessments::insert_audit_event(
        pool,
        row.assessment_id,
        row.performed_by,
        "deadline-extended",
        serde_json::json!({
            "action_id": row.id, "learners": affected, "new_due_at": new_due_at,
        }),
    )
    .await?;
    let log = if skipped.is_empty() {
        String::new()
    } else {
        format!("skipped, not enrolled: {}", skipped.join(", "))
    };
    Ok((affected, log))
}
