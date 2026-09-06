//! Access gates for the AI surface (legacy `services/ai/policy.py`).
//!
//! Learners: a visible course (`CoursesService::get` → 404 otherwise).
//! Teachers: course write access (creator with `course:update:own` or
//! `course:update:platform`). Submissions: the owner, or a teacher of the
//! course. Runs: the thread owner, or `platform:read:platform`.

use ab_core::ai::AiThreadRole;
use ab_core::id::{AiRemediationSessionId, SubmissionId};
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, Result};
use ab_db::ai::{RemediationSessionRow, RunRow};
use ab_db::submissions::SubmissionRow;

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
    /// The submission (404 when unknown) and its course, for the owner or a
    /// teacher of the course (legacy `require_ai_submission_access`).
    pub(crate) async fn accessible_submission(
        &self,
        actor: &Actor,
        submission_id: SubmissionId,
    ) -> Result<(SubmissionRow, Course)> {
        let submission = ab_db::submissions::get_submission(&self.pool, submission_id)
            .await?
            .ok_or_else(|| Error::not_found("submission"))?;
        let course = ab_db::catalog::get_course(&self.pool, submission.course_id)
            .await?
            .ok_or_else(|| Error::not_found("course"))?;
        if submission.user_id != actor.user_id {
            // Not the owner: must be able to see and update the course.
            let course = self.courses.get(actor, submission.course_id).await?;
            require_course_update(actor, &course)?;
        }
        Ok((submission, course))
    }

    /// Legacy `require_ai_remediation_access`: the learner, or someone with
    /// access to the underlying submission.
    pub(crate) async fn accessible_remediation(
        &self,
        actor: &Actor,
        id: AiRemediationSessionId,
    ) -> Result<RemediationSessionRow> {
        let session = ab_db::ai::get_remediation_session(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("remediation session"))?;
        if session.student_user_id != actor.user_id {
            self.accessible_submission(actor, session.submission_id)
                .await?;
        }
        Ok(session)
    }

    /// Legacy `require_ai_run_access`: thread owner or platform reader.
    pub(crate) async fn require_run_access(&self, actor: &Actor, run: &RunRow) -> Result<()> {
        let thread = ab_db::ai::get_thread(&self.pool, run.thread_id).await?;
        if thread.is_some_and(|t| t.user_id == Some(actor.user_id)) {
            return Ok(());
        }
        actor.require(READ_PLATFORM)
    }
}
