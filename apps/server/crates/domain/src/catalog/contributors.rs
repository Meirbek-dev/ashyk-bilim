//! Course collaboration roster (`resource_authors`, course target; legacy
//! `ResourceAuthor`).
//!
//! Roles `maintainer | contributor | reporter`, statuses `pending | active |
//! inactive`. The creator is implicit — `courses.creator_id`, never a stored
//! row, never editable — and is synthesized into the roster as
//! `creator/active`. Any *active* row authors on the course like the creator
//! (`Course::is_author`, legacy `is_owner`). Roster management: the creator,
//! an active maintainer, or `course:manage:platform`.

use ab_core::id::{CourseId, UserId};
use ab_core::permission::{Action, Scope};
use ab_core::{Error, Result};

pub use ab_db::catalog::ContributorRow as Contributor;

use super::courses::{Course, CoursesService, perm};
use crate::identity::Actor;
use crate::progress::ProgressProjector;

pub const ROLES: &[&str] = &["maintainer", "contributor", "reporter"];
pub const STATUSES: &[&str] = &["pending", "active", "inactive"];

/// Who to add: by id, or by username (resolved case-insensitively).
#[derive(Debug, Clone)]
pub enum Target {
    UserId(UserId),
    Username(String),
}

impl CoursesService {
    /// Visible course (404) + roster-management rights (403).
    async fn manageable(&self, actor: &Actor, course_id: CourseId) -> Result<Course> {
        let course = self.get(actor, course_id).await?;
        if actor.has(perm(Action::Manage, Scope::Platform))
            || course.creator_id == Some(actor.user_id)
        {
            return Ok(course);
        }
        let maintainer = ab_db::catalog::get_contributor(&self.pool, course_id, actor.user_id)
            .await?
            .is_some_and(|row| row.role == "maintainer" && row.status == "active");
        if maintainer {
            return Ok(course);
        }
        Err(Error::forbidden(
            "no contributor management access to this course",
        ))
    }

    fn not_creator(course: &Course, user_id: UserId) -> Result<()> {
        if course.creator_id == Some(user_id) {
            return Err(Error::conflict(
                "the course creator is not a contributor row",
            ));
        }
        Ok(())
    }

    /// Roster, creator first (course visibility).
    pub async fn list_contributors(
        &self,
        actor: &Actor,
        course_id: CourseId,
    ) -> Result<Vec<Contributor>> {
        let course = self.get(actor, course_id).await?;
        let mut rows = ab_db::catalog::list_contributors(&self.pool, course_id).await?;
        if let Some(creator) = ab_db::catalog::creator_row(&self.pool, course.id).await? {
            rows.insert(0, creator);
        }
        Ok(rows)
    }

    /// Add an active contributor (creator / active maintainer / platform
    /// manager). 404 unknown user, 409 already on the roster.
    pub async fn add_contributor(
        &self,
        actor: &Actor,
        course_id: CourseId,
        target: Target,
        role: &str,
    ) -> Result<Contributor> {
        let course = self.manageable(actor, course_id).await?;
        let user_id = match target {
            Target::UserId(id) => ab_db::identity::user_status(&self.pool, id)
                .await?
                .map(|_| id)
                .ok_or_else(|| Error::not_found("user"))?,
            Target::Username(name) => ab_db::identity::find_user_id_by_username(&self.pool, &name)
                .await?
                .ok_or_else(|| Error::not_found("user"))?,
        };
        Self::not_creator(&course, user_id)?;
        if !ab_db::catalog::insert_contributor(&self.pool, course_id, user_id, role, "active")
            .await?
        {
            return Err(Error::conflict("user is already on the course roster"));
        }
        ab_db::catalog::get_contributor(&self.pool, course_id, user_id)
            .await?
            .ok_or_else(|| Error::not_found("user"))
    }

    /// Change role and/or status (approve = `status: active`).
    pub async fn update_contributor(
        &self,
        actor: &Actor,
        course_id: CourseId,
        user_id: UserId,
        role: Option<&str>,
        status: Option<&str>,
    ) -> Result<Contributor> {
        let course = self.manageable(actor, course_id).await?;
        Self::not_creator(&course, user_id)?;
        if !ab_db::catalog::update_contributor(&self.pool, course_id, user_id, role, status).await?
        {
            return Err(Error::not_found("contributor"));
        }
        // BUG-291: a deactivated / demoted author with a run is a member again.
        ProgressProjector::new(self.pool.clone())
            .reproject_staff_change(user_id, Some(course_id))
            .await?;
        ab_db::catalog::get_contributor(&self.pool, course_id, user_id)
            .await?
            .ok_or_else(|| Error::not_found("contributor"))
    }

    /// Remove a roster row (roster managers), or withdraw one's own
    /// *pending* application (DECISIONS 2026-09-13).
    pub async fn remove_contributor(
        &self,
        actor: &Actor,
        course_id: CourseId,
        user_id: UserId,
    ) -> Result<()> {
        let course = self.get(actor, course_id).await?;
        if user_id == actor.user_id {
            Self::not_creator(&course, user_id)?;
            // Self-service: no row at all is a 404 (the application was
            // already decided or withdrawn), not a roster-manager 403 (UX-050).
            let own_pending = ab_db::catalog::get_contributor(&self.pool, course_id, user_id)
                .await?
                .ok_or_else(|| Error::not_found("contributor"))?
                .status
                == "pending";
            if !own_pending {
                self.manageable(actor, course_id).await?;
            }
        } else {
            // Someone else's row: managers only — the 403 comes before the
            // creator 409 (UX-102); the creator is never a row (UX-081).
            self.manageable(actor, course_id).await?;
            Self::not_creator(&course, user_id)?;
        }
        if !ab_db::catalog::delete_contributor(&self.pool, course_id, user_id).await? {
            return Err(Error::not_found("contributor"));
        }
        // BUG-291: a removed author with a run is a member again.
        ProgressProjector::new(self.pool.clone())
            .reproject_staff_change(user_id, Some(course_id))
            .await
    }

    /// Legacy `apply-contributor`: any signed-in user on an
    /// `open_to_contributors` course gets a `contributor/pending` row.
    /// 409 when the course is closed or the user already has a row.
    pub async fn apply_contributor(
        &self,
        actor: &Actor,
        course_id: CourseId,
    ) -> Result<Contributor> {
        let course = self.get(actor, course_id).await?;
        if !course.open_to_contributors {
            return Err(Error::conflict("course is not open to contributors"));
        }
        Self::not_creator(&course, actor.user_id)?;
        if !ab_db::catalog::insert_contributor(
            &self.pool,
            course_id,
            actor.user_id,
            "contributor",
            "pending",
        )
        .await?
        {
            return Err(Error::conflict("you already have a role on this course"));
        }
        ab_db::catalog::get_contributor(&self.pool, course_id, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("contributor"))
    }
}
