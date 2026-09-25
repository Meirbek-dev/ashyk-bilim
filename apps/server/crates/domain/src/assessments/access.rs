//! Who may take an assessment, and what they see when they open it.
//!
//! Access (ported from `_require_submit_access`): teacher-preview users
//! (course creator / platform authors) bypass everything; otherwise the
//! learner needs course access (public course, or a usergroup linked to the
//! course), the assessment's allowlist when restricted, and
//! `assessment:submit:assigned`. Per-student overrides layer on the policy:
//! `max_attempts` and `due_at` (the legacy never let overrides touch the
//! time limit).

use ab_core::assessments::{AccessMode, Lifecycle, ReviewVisibility};
use ab_core::id::{ActivityId, AssessmentId, UserId, UsergroupId};
use ab_core::permission::{Action, Scope};
use ab_core::{Error, FieldError, Result};
use ab_db::assessments::OverrideValues;

pub use ab_db::assessments::{
    AccessGroupRow as AccessGroup, AccessUserRow as AccessUser, OverrideRow as Override,
};

use crate::assessments::service::{Assessment, AssessmentsService, LatePolicy, perm};
use crate::catalog::courses::Course;
use crate::identity::Actor;

/// The attempt cap — one rule for `attempt-state`, `start` and the submit
/// pipeline (BUG-256): it bars *opening* a new attempt once `completed`
/// attempts reach `max`, unless the newest one was returned for revision.
/// An already-open draft may always be finished, so lowering the cap (an
/// override deleted or expired) never strands a draft the learner opened.
pub(crate) fn cap_bars_new_attempt(
    completed: i64,
    revision_requested: bool,
    max: Option<i32>,
) -> bool {
    max.is_some_and(|max| !revision_requested && completed >= i64::from(max))
}

/// The gates on an attempt, in the `attempt-state` vocabulary — one rule
/// for `attempt-state` and the submit pipeline (BUG-278). A staff preview
/// (UX-182) has none: whatever attempt-state offers a preview, submit
/// finishes. `started_at` is the open draft's; `grace` the submit
/// allowance past the time limit.
pub(crate) async fn attempt_gates(
    pool: &sqlx::PgPool,
    preview: bool,
    effective: &EffectivePolicy,
    activity_id: ActivityId,
    user_id: UserId,
    started_at: Option<i64>,
    grace: i64,
) -> Result<Vec<DisabledReason>> {
    let mut reasons = Vec::new();
    if preview {
        return Ok(reasons);
    }
    let now = now_unix();
    if !effective.allow_late && effective.due_at.is_some_and(|due| now > due) {
        reasons.push(DisabledReason::PastDue);
    }
    if let (Some(limit), Some(started)) = (effective.time_limit_seconds, started_at)
        && now > started + i64::from(limit) + grace
    {
        reasons.push(DisabledReason::TimeLimitExpired);
    }
    // Legacy `remediation_required`: a gate-mode remediation the learner
    // has not passed blocks a new attempt and (UX-105) the submit of an
    // open draft.
    if ab_db::ai::active_remediation_gate(pool, user_id, activity_id)
        .await?
        .is_some()
    {
        reasons.push(DisabledReason::RemediationRequired);
    }
    Ok(reasons)
}

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
    /// The assessment's `policy_version` — the access tab's `If-Match`
    /// (UX-154); every access save bumps it.
    pub version: i32,
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
    /// What the learner may see of a released grade.
    pub review_visibility: ReviewVisibility,
}

impl EffectivePolicy {
    /// The one lateness rule (BUG-284): handed in past the due date and not
    /// waived — the submit pipeline and every override writer judge by it.
    #[must_use]
    pub fn is_late(&self, submitted_at: i64) -> bool {
        !self.waive_late_penalty && self.due_at.is_some_and(|due| submitted_at > due)
    }
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
    /// An unpassed gate-mode AI remediation session blocks new attempts.
    RemediationRequired,
}

impl DisabledReason {
    /// The wire spelling (`SCREAMING_SNAKE_CASE`), for error details.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::NotPublished => "NOT_PUBLISHED",
            Self::ScheduledNotOpen => "SCHEDULED_NOT_OPEN",
            Self::Archived => "ARCHIVED",
            Self::PastDue => "PAST_DUE",
            Self::MaxAttemptsReached => "MAX_ATTEMPTS_REACHED",
            Self::TimeLimitExpired => "TIME_LIMIT_EXPIRED",
            Self::RemediationRequired => "REMEDIATION_REQUIRED",
        }
    }
}

/// A flat state mirror for the client; the flags are independent facts.
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone)]
pub struct AttemptState {
    pub lifecycle: Lifecycle,
    pub opens_at: Option<i64>,
    /// The attempt at hand is a staff preview: the open draft's own flag,
    /// else (a new attempt) whether the caller is course staff (BUG-294).
    pub is_teacher_preview: bool,
    /// The caller is course staff right now — what a *new* attempt takes
    /// and whether the caller's lists include their previews.
    pub staff: bool,
    pub effective: EffectivePolicy,
    pub disabled_reasons: Vec<DisabledReason>,
    /// No open draft and nothing blocks.
    pub can_start: bool,
    /// An open draft exists and nothing blocks.
    pub can_continue: bool,
    /// The latest attempt was returned for revision (the cap is lifted).
    pub revision_requested: bool,
    pub draft_id: Option<ab_core::id::SubmissionId>,
    pub attempts_used: i64,
    /// `None` = unlimited.
    pub attempts_remaining: Option<i64>,
}

impl AssessmentsService {
    /// Public course, author, active reporter, or membership of a linked
    /// usergroup — SQL `course_visible` (BUG-190), no `see_all` arm here.
    pub(crate) async fn user_has_course_access(
        &self,
        course: &Course,
        user_id: UserId,
    ) -> Result<bool> {
        if course.public || course.is_author(user_id) {
            return Ok(true);
        }
        ab_db::catalog::course_visible(&self.pool, course.id, Some(user_id), false).await
    }

    /// The user row must exist before an access-list / override insert —
    /// the FK would otherwise surface as a 500 (public courses skip the
    /// course-access check that used to catch this by accident).
    async fn unknown_user<'e>(
        db: impl sqlx::PgExecutor<'e>,
        user_id: UserId,
        field: &str,
    ) -> Result<Option<FieldError>> {
        Ok(ab_db::identity::user_status(db, user_id)
            .await?
            .is_none()
            .then(|| FieldError {
                field: field.into(),
                code: "unknown".into(),
                message: format!("user {user_id} does not exist"),
            }))
    }

    /// BUG-247: a per-learner teacher action (override, deadline extension)
    /// targets a course **member** — the trail run `learner-state.enrolled`
    /// reads (UX-150), not anyone with access (an author or maintainer).
    /// The run is held `FOR SHARE` so a leave cannot slip between this
    /// check and the caller's write (BUG-281, `set_access`). A course
    /// staffer is named as such (`staff`, UX-206), not as not enrolled.
    pub(crate) async fn not_member(
        db: &mut sqlx::PgConnection,
        course_id: ab_core::id::CourseId,
        user_id: UserId,
        field: String,
    ) -> Result<Option<FieldError>> {
        if ab_db::progress::has_trail_run_locked(&mut *db, course_id, user_id).await? {
            return Ok(None);
        }
        Ok(Some(Self::non_member(db, course_id, user_id, field).await?))
    }

    /// Why `user_id` is no member of the course: on its staff (`staff`,
    /// UX-206/UX-207) or not enrolled (`not-in-course`). Every membership
    /// refusal names the target through here.
    pub(crate) async fn non_member<'e>(
        db: impl sqlx::PgExecutor<'e>,
        course_id: ab_core::id::CourseId,
        user_id: UserId,
        field: String,
    ) -> Result<FieldError> {
        Ok(
            if ab_db::progress::is_course_staff(db, course_id, user_id).await? {
                FieldError {
                    field,
                    code: "staff".into(),
                    message: format!("user {user_id} is on this course's staff"),
                }
            } else {
                FieldError {
                    field,
                    code: "not-in-course".into(),
                    message: format!("user {user_id} is not enrolled in this course"),
                }
            },
        )
    }

    /// BUG-273: the member's trail lock with the run re-checked on it — the
    /// override write goes on the returned transaction, so a leave lands
    /// wholly before (422) or after the write.
    async fn lock_member(
        &self,
        course_id: ab_core::id::CourseId,
        user_id: UserId,
    ) -> Result<sqlx::Transaction<'static, sqlx::Postgres>> {
        match crate::progress::trail::lock_member(&self.pool, user_id, course_id, false).await? {
            Some(tx) => Ok(tx),
            None => Err(Error::validation(vec![
                Self::non_member(&self.pool, course_id, user_id, "user_id".into()).await?,
            ])),
        }
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
            version: assessment.policy_version,
        })
    }

    /// Replace the access policy. Restricted lists are validated against
    /// the course: users must be course members (UX-180), groups must be
    /// linked to it (the legacy's "no linked groups → every group is
    /// eligible" fallback is gone). Switching to all-course-learners wipes
    /// both lists (legacy). UX-154: `expected_version` (`If-Match`) is
    /// checked under the row lock — a stale tab gets 412, never a silent
    /// overwrite.
    pub async fn set_access(
        &self,
        actor: &Actor,
        id: AssessmentId,
        mode: AccessMode,
        user_ids: &[UserId],
        usergroup_ids: &[UsergroupId],
        expected_version: Option<i32>,
    ) -> Result<AccessView> {
        let assessment = self.load_for_author(actor, id).await?;
        let course = self.courses.get(actor, assessment.course_id).await?;
        let mut tx = self.pool.begin().await?;
        let current = ab_db::assessments::lock_assessment(&mut tx, id)
            .await?
            .ok_or_else(|| Error::not_found("assessment"))?;
        if let Some(expected) = expected_version
            && expected != current.policy_version
        {
            return Err(Error::app_with_details(
                ab_core::ErrorCode::PreconditionFailed,
                "access changed since you loaded it",
                serde_json::json!({ "expected": expected, "actual": current.policy_version }),
            ));
        }
        // UX-186: membership is checked under the assessment row lock, in
        // the transaction that replaces the lists.
        let (users, groups): (Vec<UserId>, Vec<UsergroupId>) = match mode {
            AccessMode::AllCourseLearners => (Vec::new(), Vec::new()),
            AccessMode::Restricted => {
                let mut errors = Vec::new();
                for user_id in user_ids {
                    // Addressable per id so the client can flag the chip.
                    let field = format!("user_ids.{user_id}");
                    // UX-180: an allowlist names learners who may take it —
                    // course members (the BUG-247 override rule), never
                    // authors or staff who merely have course access.
                    if let Some(e) = Self::unknown_user(&mut *tx, *user_id, &field).await? {
                        errors.push(e);
                    } else if let Some(e) =
                        Self::not_member(&mut tx, course.id, *user_id, field).await?
                    {
                        errors.push(e);
                    }
                }
                for group_id in usergroup_ids {
                    if !ab_db::assessments::usergroup_linked_to_course(
                        &mut *tx, course.id, *group_id,
                    )
                    .await?
                    {
                        errors.push(FieldError {
                            field: format!("usergroup_ids.{group_id}"),
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
        ab_db::assessments::set_access_mode(&mut *tx, id, mode).await?;
        ab_db::assessments::replace_access_lists(&mut tx, id, &users, &groups).await?;
        ab_db::assessments::insert_audit_event(
            &mut *tx,
            id,
            Some(actor.user_id),
            "access-changed",
            serde_json::json!({ "mode": mode, "users": users.len(), "usergroups": groups.len() }),
        )
        .await?;
        tx.commit().await?;
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
        let assessment = self.load_for_author(actor, id).await?;
        Self::not_own(actor, user_id)?;
        input.validate()?;
        if let Some(e) = Self::unknown_user(&self.pool, user_id, "user_id").await? {
            return Err(Error::validation(vec![e]));
        }
        // UX-147 / BUG-247: an override is for a student of the course.
        let mut tx = self.lock_member(assessment.course_id, user_id).await?;
        let created = ab_db::assessments::insert_override(
            &mut *tx,
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
        tx.commit().await?;
        if created.is_none() {
            return Err(Error::conflict("this student already has an override"));
        }
        crate::grading::bulk::settle_override(
            &self.pool,
            &assessment,
            user_id,
            Some(actor.user_id),
        )
        .await?;
        self.audit_override(actor, id, user_id, "override-created")
            .await?;
        self.override_row(assessment.course_id, id, user_id).await
    }

    pub async fn update_override(
        &self,
        actor: &Actor,
        id: AssessmentId,
        user_id: UserId,
        input: OverrideInput,
    ) -> Result<Override> {
        let assessment = self.load_for_author(actor, id).await?;
        Self::not_own(actor, user_id)?;
        input.validate()?;
        let mut tx = self.lock_member(assessment.course_id, user_id).await?;
        let updated = ab_db::assessments::update_override(
            &mut *tx,
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
        tx.commit().await?;
        if !updated {
            return Err(Error::not_found("override"));
        }
        crate::grading::bulk::settle_override(
            &self.pool,
            &assessment,
            user_id,
            Some(actor.user_id),
        )
        .await?;
        self.audit_override(actor, id, user_id, "override-updated")
            .await?;
        self.override_row(assessment.course_id, id, user_id).await
    }

    pub async fn delete_override(
        &self,
        actor: &Actor,
        id: AssessmentId,
        user_id: UserId,
    ) -> Result<()> {
        let assessment = self.load_for_author(actor, id).await?;
        Self::not_own(actor, user_id)?;
        if !ab_db::assessments::delete_override(&self.pool, id, user_id).await? {
            return Err(Error::not_found("override"));
        }
        // BUG-297: the waiver/extension is gone — the penalty comes back.
        crate::grading::bulk::settle_override(
            &self.pool,
            &assessment,
            user_id,
            Some(actor.user_id),
        )
        .await?;
        self.audit_override(actor, id, user_id, "override-deleted")
            .await
    }

    /// BUG-288: an override never targets the caller's own attempts.
    fn not_own(actor: &Actor, user_id: UserId) -> Result<()> {
        if actor.user_id == user_id {
            return Err(crate::grading::teacher::own_attempt());
        }
        Ok(())
    }

    /// Read-back after a committed write under the member lock: a missing row
    /// means the learner left in between (the leave drops overrides), so the
    /// answer is the membership 422, not 404 (UX-195) — `staff` when a
    /// promotion dropped it (BUG-303).
    async fn override_row(
        &self,
        course_id: ab_core::id::CourseId,
        id: AssessmentId,
        user_id: UserId,
    ) -> Result<Override> {
        match ab_db::assessments::get_override(&self.pool, id, user_id).await? {
            Some(row) => Ok(row),
            None => Err(Error::validation(vec![
                Self::non_member(&self.pool, course_id, user_id, "user_id".into()).await?,
            ])),
        }
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

    /// The policy for one learner right now: [`Self::policy_at`] with their
    /// override as of this moment — a new hand-in's `submitted_at`.
    /// Pool-level so system actors (the timer sweep) can use it too.
    pub async fn effective_policy_for(
        pool: &sqlx::PgPool,
        assessment: &Assessment,
        user_id: UserId,
        teacher_preview: bool,
    ) -> Result<EffectivePolicy> {
        let row = if teacher_preview {
            None
        } else {
            ab_db::assessments::get_override(pool, assessment.id, user_id).await?
        };
        Ok(Self::policy_at(
            assessment,
            row.as_ref(),
            teacher_preview,
            now_unix(),
        ))
    }

    /// The policy under `row` as of `at`: the override applies when it is
    /// in force at `at` (no `expires_at`, or a later one) — for a hand-in,
    /// `at` is its `submitted_at`, so an expiry after it changes nothing
    /// (BUG-307). It wins for attempts and due date; teacher preview lifts
    /// the attempt cap and the late penalty.
    pub(crate) fn policy_at(
        assessment: &Assessment,
        row: Option<&ab_db::assessments::OverrideRow>,
        teacher_preview: bool,
        at: i64,
    ) -> EffectivePolicy {
        let row = row.filter(|_| !teacher_preview);
        // BUG-300: an extension's due date outlives the grants' expiry.
        let extended_due = row
            .filter(|o| o.due_extended)
            .and_then(|o| o.due_at_override);
        let active = row.filter(|o| o.expires_at.is_none_or(|exp| exp > at));
        EffectivePolicy {
            max_attempts: if teacher_preview {
                None
            } else {
                active
                    .and_then(|o| o.max_attempts_override)
                    .or(assessment.max_attempts)
            },
            due_at: active
                .and_then(|o| o.due_at_override)
                .or(extended_due)
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
            // BUG-278: a preview's verdict is its answers — no late penalty.
            waive_late_penalty: teacher_preview || active.is_some_and(|o| o.waive_late_penalty),
            override_applied: active.is_some() || extended_due.is_some(),
            review_visibility: assessment.review_visibility,
        }
    }

    /// What the learner may do right now (legacy `_build_attempt_state`).
    pub async fn attempt_state(&self, actor: &Actor, id: AssessmentId) -> Result<AttemptState> {
        let assessment = self.load(id).await?;
        let course = self.courses.get(actor, assessment.course_id).await?;
        // Same existence rule as `get`: an unpublished assessment does not
        // exist for anyone but its authors.
        if !self.live_for_learners(&assessment).await? && !Self::is_teacher_preview(actor, &course)
        {
            return Err(Error::not_found("assessment"));
        }
        let staff = self
            .require_submit_access(actor, &assessment, &course)
            .await?;
        // BUG-295: a learner never resumes a preview draft opened while
        // staff — `start` discards it and opens a counted attempt.
        let draft = ab_db::submissions::open_draft(&self.pool, id, actor.user_id)
            .await?
            .filter(|d| staff || !d.preview);
        // BUG-294: an existing attempt is judged by its own preview flag;
        // only a new one takes the caller's current role.
        let teacher_preview = draft.as_ref().map_or(staff, |d| d.preview);
        let effective =
            Self::effective_policy_for(&self.pool, &assessment, actor.user_id, teacher_preview)
                .await?;
        // BUG-285: a learner's cap never counts previews made while staff.
        let prior =
            ab_db::submissions::list_user_submissions(&self.pool, id, actor.user_id, staff).await?;
        let attempts_used = i64::try_from(
            prior
                .iter()
                .filter(|s| s.status != ab_core::assessments::SubmissionStatus::Draft)
                .count(),
        )
        .unwrap_or(i64::MAX);
        // A returned attempt asks for a revision: the cap does not apply.
        let revision_requested = prior
            .first()
            .is_some_and(|s| s.status == ab_core::assessments::SubmissionStatus::Returned);

        // Lifecycle reasons need no branch here: a non-preview caller only
        // reaches this point for a published assessment (404 above).
        let mut reasons = attempt_gates(
            &self.pool,
            teacher_preview,
            &effective,
            assessment.activity_id,
            actor.user_id,
            draft.as_ref().and_then(|d| d.started_at),
            0,
        )
        .await?;
        // A preview's policy has no cap (`effective_policy_for`).
        if draft.is_none()
            && cap_bars_new_attempt(attempts_used, revision_requested, effective.max_attempts)
        {
            reasons.push(DisabledReason::MaxAttemptsReached);
        }
        let attempts_remaining = effective
            .max_attempts
            .map(|max| (i64::from(max) - attempts_used).max(0));
        Ok(AttemptState {
            lifecycle: assessment.lifecycle,
            opens_at: assessment.scheduled_at,
            is_teacher_preview: teacher_preview,
            staff,
            can_start: draft.is_none() && reasons.is_empty(),
            can_continue: draft.is_some() && reasons.is_empty(),
            revision_requested,
            draft_id: draft.as_ref().map(|d| d.id),
            attempts_used,
            attempts_remaining,
            effective,
            disabled_reasons: reasons,
        })
    }
}
