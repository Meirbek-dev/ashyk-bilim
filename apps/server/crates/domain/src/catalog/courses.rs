//! Course CRUD + visibility lifecycle.
//!
//! Access semantics ported from the legacy service: read = public OR creator
//! OR `course:read:all`; write = creator with `course:update:own` OR
//! `course:update:platform`.

use ab_core::id::CourseId;
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, Result};
use sqlx::PgPool;

pub use ab_db::catalog::CourseRow as Course;

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

    fn require_read(actor: &Actor, course: &Course) -> Result<()> {
        if course.public
            || course.creator_id == Some(actor.user_id)
            || actor.has(perm(Action::Read, Scope::All))
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
        Self::require_read(actor, &course)?;
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
