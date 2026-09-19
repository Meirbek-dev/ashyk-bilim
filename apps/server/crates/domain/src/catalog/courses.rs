//! Course CRUD + visibility lifecycle.
//!
//! Access semantics: read = public OR author OR active reporter OR cohort
//! member OR platform manager; write = author OR `course:update:platform`.
//! "Author" is `Course::is_author` — the creator or an active maintainer /
//! contributor (`resource_authors`, see `contributors.rs`) — the one
//! predicate every authoring gate in the workspace (curriculum, assessments,
//! files, grading, AI, certificates) goes through. Authorship IS the `:own`
//! scope: no role grant is needed on top (DECISIONS 2026-09-12, "active
//! maintainers/contributors author on the course like the creator").

use ab_core::id::{CourseId, UserId};
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, Result};
use sqlx::PgPool;

use ab_core::id::CourseUpdateId;
pub use ab_db::catalog::{
    CourseRow as Course, CourseSummaryRow as CourseSummary, CourseUpdateRow as CourseUpdate,
};
use uuid::Uuid;

use crate::catalog::sees_private;
use crate::files::uploads::{UNREFERENCED_GRACE, claim_upload};
use crate::identity::Actor;

pub(crate) const fn perm(action: Action, scope: Scope) -> Permission {
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
    /// Finalized `course-thumbnail` upload to claim; the replaced object is
    /// released for reaping.
    pub thumbnail_upload_id: Option<Uuid>,
}

/// `GET /courses` filters (see `ab_db::catalog::CourseFilter`).
#[derive(Debug, Default, Clone)]
pub struct ListParams<'a> {
    pub mine: bool,
    pub q: Option<&'a str>,
    pub sort: &'a str,
    pub preset: &'a str,
}

#[derive(Clone)]
pub struct CoursesService {
    pub(crate) pool: PgPool,
}

impl CoursesService {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Write access: platform-wide updaters, or an author (the creator or an
    /// active maintainer / contributor — authorship is the `:own` scope).
    /// Shared with the curriculum service (chapters/activities inherit it).
    pub(crate) fn require_write(actor: &Actor, course: &Course) -> Result<()> {
        if actor.has(perm(Action::Update, Scope::Platform)) || course.is_author(actor.user_id) {
            return Ok(());
        }
        Err(Error::forbidden("no write access to this course"))
    }

    /// Visibility: public, author (creator / active contributor), active
    /// reporter, platform manager, or membership of a usergroup linked to
    /// the course (cohort access) — SQL `course_visible`, the predicate the
    /// catalogue, search and collections list by (BUG-190). Invisible = 404.
    pub(crate) async fn require_read(&self, actor: &Actor, course: &Course) -> Result<()> {
        let see_all = sees_private(actor, ResourceType::Course);
        if course.public
            || see_all
            || course.is_author(actor.user_id)
            || ab_db::catalog::course_visible(&self.pool, course.id, Some(actor.user_id), see_all)
                .await?
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
        // BUG-168: names are trimmed and never blank (shared rule, UX-106).
        let name = ab_core::required_str("name", name)?;
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

    /// One page of the catalogue; returns (courses, next_cursor). With
    /// `mine`, only courses the caller may edit (author, or platform
    /// updater/manager who sees everything).
    pub async fn list(
        &self,
        actor: &Actor,
        params: &ListParams<'_>,
        cursor: Option<CourseId>,
        limit: i64,
    ) -> Result<(Vec<Course>, Option<CourseId>)> {
        let limit = limit.clamp(1, 100);
        let filter = ab_db::catalog::CourseFilter {
            viewer: Some(actor.user_id),
            see_all: sees_private(actor, ResourceType::Course),
            mine: params.mine,
            q: params.q.map(str::trim).filter(|q| !q.is_empty()),
            sort: params.sort,
            preset: params.preset,
        };
        let mut rows = ab_db::catalog::list_courses(&self.pool, &filter, cursor, limit + 1).await?;
        let next = if i64::try_from(rows.len()).unwrap_or(i64::MAX) > limit {
            rows.truncate(usize::try_from(limit).unwrap_or(usize::MAX));
            rows.last().map(|c| c.id)
        } else {
            None
        };
        Ok((rows, next))
    }

    /// Counts over the caller's editable set (the `mine=true` summary block).
    pub async fn summary(&self, actor: &Actor) -> Result<CourseSummary> {
        ab_db::catalog::summarize_courses(
            &self.pool,
            actor.user_id,
            sees_private(actor, ResourceType::Course),
        )
        .await
    }

    /// Courses `user` created or actively co-authors, newest first. Private
    /// ones only for the user themself or platform managers.
    pub async fn list_by_user(
        &self,
        actor: &Actor,
        user: UserId,
        cursor: Option<CourseId>,
        limit: i64,
    ) -> Result<(Vec<Course>, Option<CourseId>)> {
        let limit = limit.clamp(1, 100);
        let include_private = actor.user_id == user || sees_private(actor, ResourceType::Course);
        let mut rows =
            ab_db::catalog::list_user_courses(&self.pool, user, include_private, cursor, limit + 1)
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
        // Invisible courses do not exist (404), even to would-be writers.
        let course = self.get(actor, id).await?;
        Self::require_write(actor, &course)?;
        let name = changes
            .name
            .as_deref()
            .map(|n| ab_core::required_str("name", n))
            .transpose()?;
        let thumbnail_key = match changes.thumbnail_upload_id {
            Some(upload_id) => Some(
                claim_upload(
                    &self.pool,
                    actor,
                    upload_id,
                    "course-thumbnail",
                    "thumbnail_upload_id",
                )
                .await?,
            ),
            None => None,
        };
        let updated = ab_db::catalog::update_course(
            &self.pool,
            id,
            ab_db::catalog::CourseChanges {
                name,
                description: changes.description.as_deref(),
                about: changes.about.as_deref(),
                tags: changes.tags.as_deref(),
                open_to_contributors: changes.open_to_contributors,
                thumbnail_key: thumbnail_key.as_deref(),
            },
        )
        .await?
        .ok_or_else(|| Error::not_found("course"))?;
        if thumbnail_key.is_some()
            && let Some(old) = course.thumbnail_key.as_deref()
        {
            ab_db::uploads::release_reference_by_key(
                &self.pool,
                old,
                UNREFERENCED_GRACE.as_secs_f64(),
            )
            .await?;
        }
        Ok(updated)
    }

    /// Publish/unpublish (legacy `CourseLifecycleUpdate` semantics).
    pub async fn set_public(&self, actor: &Actor, id: CourseId, public: bool) -> Result<Course> {
        // Invisible courses do not exist (404), even to would-be writers.
        let course = self.get(actor, id).await?;
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
        let course = self.get(actor, id).await?;
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
