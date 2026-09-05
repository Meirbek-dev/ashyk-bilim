//! Who may take an assessment, and what they see when they open it.
//!
//! Access (ported from `_require_submit_access`): teacher-preview users
//! (course creator / platform authors) bypass everything; otherwise the
//! learner needs course access (public course, or a usergroup linked to the
//! course), the assessment's allowlist when restricted, and
//! `assessment:submit:assigned`. Per-student overrides layer on the policy:
//! `max_attempts` and `due_at` (the legacy never let overrides touch the
//! time limit).

use ab_core::assessments::{AccessMode, Lifecycle};
use ab_core::id::{AssessmentId, UserId, UsergroupId};
use ab_core::permission::{Action, Scope};
use ab_core::{Error, FieldError, Result};
use ab_db::assessments::OverrideValues;

pub use ab_db::assessments::{
    AccessGroupRow as AccessGroup, AccessUserRow as AccessUser, OverrideRow as Override,
};

use crate::assessments::service::{Assessment, AssessmentsService, LatePolicy, perm};
use crate::catalog::courses::Course;
use crate::identity::Actor;

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

pub struct AccessView {
    pub mode: AccessMode,
    pub users: Vec<AccessUser>,
    pub usergroups: Vec<AccessGroup>,
    pub effective_user_count: i64,
}

#[derive(Debug, Clone)]
pub struct OverrideInput {
    pub max_attempts_override: Option<i32>,
    pub due_at_override: Option<i64>,
    pub waive_late_penalty: bool,
    pub note: String,
    pub expires_at: Option<i64>,
}

impl OverrideInput {
    /// Legacy ceilings: at most 10 attempts by override.
    fn validate(&self) -> Result<()> {
        if self
            .max_attempts_override
            .is_some_and(|n| !(1..=10).contains(&n))
        {
            return Err(Error::validation(vec![FieldError {
                field: "max_attempts_override".into(),
                code: "out-of-range".into(),
                message: "override attempts must be between 1 and 10".into(),
            }]));
        }
        Ok(())
    }
}

/// The policy as it applies to one learner right now.
#[derive(Debug, Clone)]
pub struct EffectivePolicy {
    pub max_attempts: Option<i32>,
    pub due_at: Option<i64>,
    pub time_limit_seconds: Option<i32>,
    pub allow_late: bool,
    pub passing_score: f64,
    pub late_policy: LatePolicy,
    pub waive_late_penalty: bool,
    pub override_applied: bool,
}

/// Why a learner cannot act right now (legacy `disabled_action_reasons`;
/// the attempt/timer-based ones arrive with submissions in P4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DisabledReason {
    NotPublished,
    ScheduledNotOpen,
    Archived,
    PastDue,
    MaxAttemptsReached,
    TimeLimitExpired,
}

#[derive(Debug, Clone)]
pub struct AttemptState {
    pub lifecycle: Lifecycle,
    pub opens_at: Option<i64>,
    pub is_teacher_preview: bool,
    pub effective: EffectivePolicy,
    pub disabled_reasons: Vec<DisabledReason>,
    /// No open draft and nothing blocks.
    pub can_start: bool,
    /// An open draft exists and nothing blocks.
    pub can_continue: bool,
    pub draft_id: Option<ab_core::id::SubmissionId>,
    pub attempts_used: i64,
    /// `None` = unlimited.
    pub attempts_remaining: Option<i64>,
}

impl AssessmentsService {
    /// Public course, course creator, or membership of a linked usergroup.
    pub(crate) async fn user_has_course_access(
        &self,
        course: &Course,
        user_id: UserId,
    ) -> Result<bool> {
        if course.public || course.creator_id == Some(user_id) {
            return Ok(true);
        }
        ab_db::usergroups::user_in_course_group(&self.pool, course.id, user_id).await
    }

    /// Course creators and platform authors preview without limits.
    fn is_teacher_preview(actor: &Actor, course: &Course) -> bool {
        Self::require_scoped(actor, course, Action::Author, "preview").is_ok()
    }

    /// Legacy `_require_submit_access`. Returns whether the actor is a
    /// teacher previewing.
    pub(crate) async fn require_submit_access(
        &self,
        actor: &Actor,
        assessment: &Assessment,
        course: &Course,
    ) -> Result<bool> {
        if Self::is_teacher_preview(actor, course) {
            return Ok(true);
        }
        if !self.user_has_course_access(course, actor.user_id).await? {
            return Err(Error::forbidden("no access to this course"));
        }
        if assessment.access_mode == AccessMode::Restricted
            && !ab_db::assessments::access_allows(&self.pool, assessment.id, actor.user_id).await?
        {
            return Err(Error::forbidden("not on this assessment's access list"));
        }
        if !(actor.has(perm(Action::Submit, Scope::Assigned))
            || actor.has(perm(Action::Submit, Scope::Platform)))
        {
            return Err(Error::forbidden("missing permission assessment:submit"));
        }
        Ok(false)
    }

    // ── Access lists ────────────────────────────────────────────────────

    pub async fn access(&self, actor: &Actor, id: AssessmentId) -> Result<AccessView> {
        let assessment = self.load_for_author(actor, id).await?;
        Ok(AccessView {
            mode: assessment.access_mode,
            users: ab_db::assessments::list_access_users(&self.pool, id).await?,
            usergroups: ab_db::assessments::list_access_usergroups(&self.pool, id).await?,
            effective_user_count: ab_db::assessments::effective_access_count(&self.pool, id)
                .await?,
        })
    }

    /// Replace the access policy. Restricted lists are validated against
    /// the course: users must already have course access, groups must be
    /// linked to it (the legacy's "no linked groups → every group is
    /// eligible" fallback is gone). Switching to all-course-learners wipes
    /// both lists (legacy).
    pub async fn set_access(
        &self,
        actor: &Actor,
        id: AssessmentId,
        mode: AccessMode,
        user_ids: &[UserId],
        usergroup_ids: &[UsergroupId],
    ) -> Result<AccessView> {
        let assessment = self.load_for_author(actor, id).await?;
        let course = self.courses.get(actor, assessment.course_id).await?;
        let (users, groups): (Vec<UserId>, Vec<UsergroupId>) = match mode {
            AccessMode::AllCourseLearners => (Vec::new(), Vec::new()),
            AccessMode::Restricted => {
                let mut errors = Vec::new();
                for user_id in user_ids {
                    if !self.user_has_course_access(&course, *user_id).await? {
                        errors.push(FieldError {
                            field: "user_ids".into(),
                            code: "not-in-course".into(),
                            message: format!("user {user_id} has no access to this course"),
                        });
                    }
                }
                for group_id in usergroup_ids {
                    if !ab_db::assessments::usergroup_linked_to_course(
                        &self.pool, course.id, *group_id,
                    )
                    .await?
                    {
                        errors.push(FieldError {
                            field: "usergroup_ids".into(),
                            code: "not-in-course".into(),
                            message: format!("usergroup {group_id} is not linked to this course"),
                        });
                    }
                }
                if !errors.is_empty() {
                    return Err(Error::validation(errors));
                }
                (user_ids.to_vec(), usergroup_ids.to_vec())
            }
        };
        ab_db::assessments::set_access_mode(&self.pool, id, mode).await?;
        ab_db::assessments::replace_access_lists(&self.pool, id, &users, &groups).await?;
        ab_db::assessments::insert_audit_event(
            &self.pool,
            id,
            Some(actor.user_id),
            "access-changed",
            serde_json::json!({ "mode": mode, "users": users.len(), "usergroups": groups.len() }),
        )
        .await?;
        self.access(actor, id).await
    }

    // ── Overrides ───────────────────────────────────────────────────────

    pub async fn overrides(&self, actor: &Actor, id: AssessmentId) -> Result<Vec<Override>> {
        self.load_for_author(actor, id).await?;
        ab_db::assessments::list_overrides(&self.pool, id).await
    }

    pub async fn create_override(
        &self,
        actor: &Actor,
        id: AssessmentId,
        user_id: UserId,
        input: OverrideInput,
    ) -> Result<Override> {
        self.load_for_author(actor, id).await?;
        input.validate()?;
        let created = ab_db::assessments::insert_override(
            &self.pool,
            id,
            user_id,
            OverrideValues {
                max_attempts_override: input.max_attempts_override,
                due_at_override: input.due_at_override,
                waive_late_penalty: input.waive_late_penalty,
                note: &input.note,
                expires_at: input.expires_at,
                granted_by: actor.user_id,
            },
        )
        .await?;
        if created.is_none() {
            return Err(Error::conflict("this student already has an override"));
        }
        self.audit_override(actor, id, user_id, "override-created")
            .await?;
        self.override_row(id, user_id).await
    }

    pub async fn update_override(
        &self,
        actor: &Actor,
        id: AssessmentId,
        user_id: UserId,
        input: OverrideInput,
    ) -> Result<Override> {
        self.load_for_author(actor, id).await?;
        input.validate()?;
        let updated = ab_db::assessments::update_override(
            &self.pool,
            id,
            user_id,
            OverrideValues {
                max_attempts_override: input.max_attempts_override,
                due_at_override: input.due_at_override,
                waive_late_penalty: input.waive_late_penalty,
                note: &input.note,
                expires_at: input.expires_at,
                granted_by: actor.user_id,
            },
        )
        .await?;
        if !updated {
            return Err(Error::not_found("override"));
        }
        self.audit_override(actor, id, user_id, "override-updated")
            .await?;
        self.override_row(id, user_id).await
    }

    pub async fn delete_override(
        &self,
        actor: &Actor,
        id: AssessmentId,
        user_id: UserId,
    ) -> Result<()> {
        self.load_for_author(actor, id).await?;
        if !ab_db::assessments::delete_override(&self.pool, id, user_id).await? {
            return Err(Error::not_found("override"));
        }
        self.audit_override(actor, id, user_id, "override-deleted")
            .await
    }

    async fn override_row(&self, id: AssessmentId, user_id: UserId) -> Result<Override> {
        ab_db::assessments::get_override(&self.pool, id, user_id)
            .await?
            .ok_or_else(|| Error::not_found("override"))
    }

    async fn audit_override(
        &self,
        actor: &Actor,
        id: AssessmentId,
        user_id: UserId,
        event: &str,
    ) -> Result<()> {
        ab_db::assessments::insert_audit_event(
            &self.pool,
            id,
            Some(actor.user_id),
            event,
            serde_json::json!({ "user_id": user_id }),
        )
        .await
    }

    // ── Student-facing ──────────────────────────────────────────────────

    /// The policy for one learner: the active (unexpired) override wins for
    /// attempts and due date; teacher preview lifts the attempt cap.
    /// Pool-level so system actors (the timer sweep) can use it too.
    pub async fn effective_policy_for(
        pool: &sqlx::PgPool,
        assessment: &Assessment,
        user_id: UserId,
        teacher_preview: bool,
    ) -> Result<EffectivePolicy> {
        let now = now_unix();
        let active = if teacher_preview {
            None
        } else {
            ab_db::assessments::get_override(pool, assessment.id, user_id)
                .await?
                .filter(|o| o.expires_at.is_none_or(|exp| exp > now))
        };
        Ok(EffectivePolicy {
            max_attempts: if teacher_preview {
                None
            } else {
                active
                    .as_ref()
                    .and_then(|o| o.max_attempts_override)
                    .or(assessment.max_attempts)
            },
            due_at: active
                .as_ref()
                .and_then(|o| o.due_at_override)
                .or(assessment.due_at),
            time_limit_seconds: assessment.time_limit_seconds,
            allow_late: assessment.allow_late,
            passing_score: assessment.passing_score,
            late_policy: LatePolicy::from_columns(
                assessment.late_policy_kind,
                assessment.late_penalty_percent_per_day,
                assessment.late_penalty_max_days,
                assessment.late_cutoff_at,
            ),
            waive_late_penalty: active.as_ref().is_some_and(|o| o.waive_late_penalty),
            override_applied: active.is_some(),
        })
    }

    /// What the learner may do right now (legacy `_build_attempt_state`).
    pub async fn attempt_state(&self, actor: &Actor, id: AssessmentId) -> Result<AttemptState> {
        let assessment = self.load(id).await?;
        let course = self.courses.get(actor, assessment.course_id).await?;
        let teacher_preview = self
            .require_submit_access(actor, &assessment, &course)
            .await?;
        let effective =
            Self::effective_policy_for(&self.pool, &assessment, actor.user_id, teacher_preview)
                .await?;
        let draft = ab_db::submissions::open_draft(&self.pool, id, actor.user_id).await?;
        let attempts_used =
            ab_db::submissions::count_completed_attempts(&self.pool, id, actor.user_id).await?;

        let now = now_unix();
        let mut reasons = Vec::new();
        if !teacher_preview {
            match assessment.lifecycle {
                Lifecycle::Draft => reasons.push(DisabledReason::NotPublished),
                Lifecycle::Scheduled => {
                    if assessment.scheduled_at.is_none_or(|at| at > now) {
                        reasons.push(DisabledReason::ScheduledNotOpen);
                    }
                }
                Lifecycle::Archived => reasons.push(DisabledReason::Archived),
                Lifecycle::Published => {}
            }
            if !effective.allow_late && effective.due_at.is_some_and(|due| now > due) {
                reasons.push(DisabledReason::PastDue);
            }
            // An open draft may still be finished even at the cap.
            if let Some(max) = effective.max_attempts
                && attempts_used >= i64::from(max)
                && draft.is_none()
            {
                reasons.push(DisabledReason::MaxAttemptsReached);
            }
            if let (Some(open), Some(limit)) = (&draft, effective.time_limit_seconds)
                && open.started_at.is_some_and(|s| now > s + i64::from(limit))
            {
                reasons.push(DisabledReason::TimeLimitExpired);
            }
        }
        let attempts_remaining = effective
            .max_attempts
            .map(|max| (i64::from(max) - attempts_used).max(0));
        Ok(AttemptState {
            lifecycle: assessment.lifecycle,
            opens_at: assessment.scheduled_at,
            is_teacher_preview: teacher_preview,
            can_start: draft.is_none() && reasons.is_empty(),
            can_continue: draft.is_some() && reasons.is_empty(),
            draft_id: draft.as_ref().map(|d| d.id),
            attempts_used,
            attempts_remaining,
            effective,
            disabled_reasons: reasons,
        })
    }
}
