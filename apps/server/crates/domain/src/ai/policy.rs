//! Access gates for the AI surface (legacy `services/ai/policy.py`).
//!
//! Learners: a visible course (`CoursesService::get` → 404 otherwise).
//! Teachers: course write access (creator with `course:update:own` or
//! `course:update:platform`). Submissions: the owner, or a teacher of the
//! course (`ai::subject`, for assessment submissions and file attempts
//! alike). Runs: the thread owner, or `platform:read:platform`.

use ab_core::ai::AiThreadRole;
use ab_core::id::AiRemediationSessionId;
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, Result};
use ab_db::ai::{RemediationSessionRow, RunRow};

use crate::catalog::courses::{Course, CoursesService};
use crate::identity::Actor;

use super::AiService;

pub(crate) const READ_PLATFORM: Permission = Permission {
    resource: ResourceType::Platform,
    action: Action::Read,
    scope: Some(Scope::Platform),
};

/// Legacy `can_update_course`.
#[must_use]
pub fn can_update_course(actor: &Actor, course: &Course) -> bool {
    CoursesService::require_write(actor, course).is_ok()
}

/// Legacy `require_ai_course_update`.
pub fn require_course_update(actor: &Actor, course: &Course) -> Result<()> {
    CoursesService::require_write(actor, course)
}

/// Legacy `derive_course_ai_role`: teachers can update, everyone else who
/// can see the course is a student.
#[must_use]
pub fn derive_course_role(actor: &Actor, course: &Course) -> AiThreadRole {
    if can_update_course(actor, course) {
        AiThreadRole::Teacher
    } else {
        AiThreadRole::Student
    }
}

/// Legacy `require_ai_admin`: `platform:read`.
pub fn require_admin(actor: &Actor) -> Result<()> {
    actor.require(READ_PLATFORM)
}

impl AiService {
    /// Legacy `require_ai_remediation_access`: the learner, or someone with
    /// access to the underlying work (`subject::require_subject_access`).
    pub(crate) async fn accessible_remediation(
        &self,
        actor: &Actor,
        id: AiRemediationSessionId,
    ) -> Result<RemediationSessionRow> {
        let session = ab_db::ai::get_remediation_session(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("remediation session"))?;
        if session.student_user_id != actor.user_id {
            let subject = self.load_subject_by(session.subject).await?;
            self.require_subject_access(actor, &subject).await?;
        }
        Ok(session)
    }

    /// Legacy `require_ai_run_access`: thread owner or platform reader.
    /// Anyone else gets 404 — a run id must not leak that it exists.
    pub(crate) async fn require_run_access(&self, actor: &Actor, run: &RunRow) -> Result<()> {
        let thread = ab_db::ai::get_thread(&self.pool, run.thread_id).await?;
        if thread.is_some_and(|t| t.user_id == Some(actor.user_id)) || actor.has(READ_PLATFORM) {
            return Ok(());
        }
        Err(Error::not_found("ai run"))
    }
}
