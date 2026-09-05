//! Bulk gradebook actions with a persisted audit row (`bulk_actions`) and
//! execution on the job queue. Ported from `grading/bulk.py`.
//!
//! Only deadline extensions exist so far: per target learner an override
//! carrying the new due date (other override fields untouched — the legacy
//! overwrote the note and left the rest), then every submitted attempt's
//! `is_late` is recomputed against the new date.

use ab_core::assessments::{BulkActionStatus, BulkActionType};
use ab_core::id::{AssessmentId, BulkActionId, UserId};
use ab_core::{Error, FieldError, Result};
use ab_db::assessments::OverrideValues;
use ab_db::queue::NewJob;
use sqlx::PgPool;

use crate::events::GradingEvents;
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
        self.grader_context(actor, assessment_id).await?;
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
    /// the row and not retried — the grader sees it and re-requests.
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
        let outcome = match row.action_type {
            BulkActionType::ExtendDeadline => run_deadline_extension(pool, events, &row).await,
            other => Err(Error::app(
                ab_core::ErrorCode::Internal,
                format!("bulk action type {other} is not implemented"),
            )),
        };
        match outcome {
            Ok(affected) => {
                ab_db::submissions::set_bulk_action_status(
                    pool,
                    id,
                    BulkActionStatus::Completed,
                    affected,
                    "",
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

async fn run_deadline_extension(
    pool: &PgPool,
    events: Option<&GradingEvents>,
    row: &ab_db::submissions::BulkActionRow,
) -> Result<i32> {
    let new_due_at = row.params["new_due_at"]
        .as_i64()
        .ok_or_else(|| Error::app(ab_core::ErrorCode::Internal, "malformed params"))?;
    let reason = row.params["reason"].as_str().unwrap_or_default();
    let granted_by = row
        .performed_by
        .ok_or_else(|| Error::app(ab_core::ErrorCode::Internal, "action has no performer"))?;
    let mut affected = 0;
    for &user_id in &row.target_user_ids {
        let existing = ab_db::assessments::get_override(pool, row.assessment_id, user_id).await?;
        let values = OverrideValues {
            max_attempts_override: existing.as_ref().and_then(|o| o.max_attempts_override),
            due_at_override: Some(new_due_at),
            waive_late_penalty: existing.as_ref().is_some_and(|o| o.waive_late_penalty),
            note: reason,
            expires_at: existing.as_ref().and_then(|o| o.expires_at),
            granted_by,
        };
        if existing.is_some() {
            ab_db::assessments::update_override(pool, row.assessment_id, user_id, values).await?;
        } else {
            ab_db::assessments::insert_override(pool, row.assessment_id, user_id, values).await?;
        }
        let submitted =
            ab_db::submissions::list_submitted_for_user(pool, row.assessment_id, user_id).await?;
        for submission in &submitted {
            let late = submission.submitted_at.is_some_and(|s| s > new_due_at);
            if late != submission.is_late {
                ab_db::submissions::set_is_late(pool, submission.id, late).await?;
            }
        }
        ProgressProjector::new(pool.clone())
            .after_submission(row.assessment_id, user_id)
            .await;
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
    Ok(affected)
}
