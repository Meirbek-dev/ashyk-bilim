//! Course CRUD + visibility lifecycle.
//!
//! Access semantics ported from the legacy service: read = public OR creator
//! OR `course:read:all`; write = creator with `course:update:own` OR
//! `course:update:platform`.

use ab_core::id::CourseId;
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, Result};
use sqlx::PgPool;

use ab_core::id::CourseUpdateId;
pub use ab_db::catalog::{CourseRow as Course, CourseUpdateRow as CourseUpdate};

use crate::identity::Actor;

const fn perm(action: Action, scope: Scope) -> Permission {
    Permission {
        resource: ResourceType::Course,
        action,
        scope: Some(scope),
    }
}

#[derive(Debug, Default)]
pub struct CourseChanges {
    pub name: Option<String>,
    pub description: Option<String>,
    pub about: Option<String>,
    pub tags: Option<Vec<String>>,
    pub open_to_contributors: Option<bool>,
}

#[derive(Clone)]
pub struct CoursesService {
    pool: PgPool,
}

impl CoursesService {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Write access: platform-wide updaters, or the creator with `own` scope.
    /// Shared with the curriculum service (chapters/activities inherit it).
    pub(crate) fn require_write(actor: &Actor, course: &Course) -> Result<()> {
        if actor.has(perm(Action::Update, Scope::Platform)) {
            return Ok(());
        }
        if course.creator_id == Some(actor.user_id) && actor.has(perm(Action::Update, Scope::Own)) {
            return Ok(());
        }
        Err(Error::forbidden("no write access to this course"))
    }

    /// Visibility: public, creator, `course:read:all`, or membership of a
    /// usergroup linked to the course (cohort access). Invisible = 404.
    async fn require_read(&self, actor: &Actor, course: &Course) -> Result<()> {
        if course.public
            || course.creator_id == Some(actor.user_id)
            || actor.has(perm(Action::Read, Scope::All))
            || ab_db::usergroups::user_in_course_group(&self.pool, course.id, actor.user_id).await?
        {
            Ok(())
        } else {
            Err(Error::not_found("course"))
        }
    }

    pub async fn create(
        &self,
        actor: &Actor,
        name: &str,
        description: &str,
        about: &str,
        tags: Vec<String>,
    ) -> Result<Course> {
        actor.require(perm(Action::Create, Scope::Platform))?;
        let id = ab_db::catalog::insert_course(
            &self.pool,
            name,
            description,
            about,
            &tags,
            actor.user_id,
        )
        .await?;
        ab_db::catalog::get_course(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course"))
    }

    pub async fn get(&self, actor: &Actor, id: CourseId) -> Result<Course> {
        let course = ab_db::catalog::get_course(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course"))?;
        self.require_read(actor, &course).await?;
        Ok(course)
    }

    /// Newest-first page; returns (courses, next_cursor).
    pub async fn list(
        &self,
        actor: &Actor,
        cursor: Option<CourseId>,
        limit: i64,
    ) -> Result<(Vec<Course>, Option<CourseId>)> {
        let limit = limit.clamp(1, 100);
        let see_all = actor.has(perm(Action::Read, Scope::All));
        let mut rows = ab_db::catalog::list_courses(
            &self.pool,
            Some(actor.user_id),
            see_all,
            cursor,
            limit + 1,
        )
        .await?;
        let next = if i64::try_from(rows.len()).unwrap_or(i64::MAX) > limit {
            rows.truncate(usize::try_from(limit).unwrap_or(usize::MAX));
            rows.last().map(|c| c.id)
        } else {
            None
        };
        Ok((rows, next))
    }

    pub async fn update(
        &self,
        actor: &Actor,
        id: CourseId,
        changes: CourseChanges,
    ) -> Result<Course> {
        let course = ab_db::catalog::get_course(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course"))?;
        Self::require_write(actor, &course)?;
        ab_db::catalog::update_course(
            &self.pool,
            id,
            ab_db::catalog::CourseChanges {
                name: changes.name.as_deref(),
                description: changes.description.as_deref(),
                about: changes.about.as_deref(),
                tags: changes.tags.as_deref(),
                open_to_contributors: changes.open_to_contributors,
            },
        )
        .await?
        .ok_or_else(|| Error::not_found("course"))
    }

    /// Publish/unpublish (legacy `CourseLifecycleUpdate` semantics).
    pub async fn set_public(&self, actor: &Actor, id: CourseId, public: bool) -> Result<Course> {
        let course = ab_db::catalog::get_course(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course"))?;
        Self::require_write(actor, &course)?;
        ab_db::catalog::set_course_public(&self.pool, id, public).await?;
        ab_db::catalog::get_course(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course"))
    }

    /// Announcements feed, newest first (read = course visibility).
    pub async fn list_updates(&self, actor: &Actor, id: CourseId) -> Result<Vec<CourseUpdate>> {
        self.get(actor, id).await?;
        ab_db::catalog::list_course_updates(&self.pool, id).await
    }

    pub async fn create_update(
        &self,
        actor: &Actor,
        id: CourseId,
        title: &str,
        content: &str,
    ) -> Result<CourseUpdate> {
        let course = self.get(actor, id).await?;
        Self::require_write(actor, &course)?;
        let update_id =
            ab_db::catalog::insert_course_update(&self.pool, id, title, content).await?;
        ab_db::catalog::get_course_update(&self.pool, update_id)
            .await?
            .ok_or_else(|| Error::not_found("course update"))
    }

    /// Write access follows the parent course.
    async fn writable_update(&self, actor: &Actor, id: CourseUpdateId) -> Result<CourseUpdate> {
        let update = ab_db::catalog::get_course_update(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course update"))?;
        let course = self.get(actor, update.course_id).await?;
        Self::require_write(actor, &course)?;
        Ok(update)
    }

    pub async fn edit_update(
        &self,
        actor: &Actor,
        id: CourseUpdateId,
        title: Option<&str>,
        content: Option<&str>,
    ) -> Result<CourseUpdate> {
        self.writable_update(actor, id).await?;
        ab_db::catalog::update_course_update(&self.pool, id, title, content).await?;
        ab_db::catalog::get_course_update(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course update"))
    }

    pub async fn delete_update(&self, actor: &Actor, id: CourseUpdateId) -> Result<()> {
        self.writable_update(actor, id).await?;
        ab_db::catalog::delete_course_update(&self.pool, id).await?;
        Ok(())
    }

    pub async fn delete(&self, actor: &Actor, id: CourseId) -> Result<()> {
        let course = ab_db::catalog::get_course(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("course"))?;
        // Delete is stricter than update: platform deleters, or creators with
        // the delete grant (legacy matrix: course:delete:own).
        if !(actor.has(perm(Action::Delete, Scope::Platform))
            || (course.creator_id == Some(actor.user_id)
                && actor.has(perm(Action::Delete, Scope::Own))))
        {
            return Err(Error::forbidden("no delete access to this course"));
        }
        ab_db::catalog::delete_course(&self.pool, id).await?;
        Ok(())
    }
}
