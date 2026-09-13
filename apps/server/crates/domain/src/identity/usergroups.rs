//! Usergroups (cohorts): named member sets linkable to courses.
//!
//! Gates: read/list = `usergroup:read:platform`; create =
//! `usergroup:create:platform`; update/delete/membership = creator with
//! `usergroup:create:platform`, or `usergroup:manage:platform`. Legacy
//! seeds give instructors create+read only, so in practice creators manage
//! their own groups and admins (wildcard) manage everything.

use ab_core::id::{CourseId, UserId, UsergroupId};
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, FieldError, Result};
use sqlx::PgPool;

pub use ab_db::usergroups::{MemberRow as Member, UsergroupRow as Usergroup};

use crate::identity::Actor;

const fn perm(action: Action) -> Permission {
    Permission {
        resource: ResourceType::Usergroup,
        action,
        scope: Some(Scope::Platform),
    }
}

/// 422 `<field>`/`unknown` for every requested id that does not exist —
/// the FK would otherwise surface as a 500 (BUG-109).
pub(crate) fn reject_unknown<T: PartialEq + std::fmt::Display>(
    field: &str,
    what: &str,
    requested: &[T],
    known: &[T],
) -> Result<()> {
    let errors: Vec<FieldError> = requested
        .iter()
        .filter(|id| !known.contains(id))
        .map(|id| FieldError {
            field: field.into(),
            code: "unknown".into(),
            message: format!("{what} {id} does not exist"),
        })
        .collect();
    if errors.is_empty() {
        Ok(())
    } else {
        Err(Error::validation(errors))
    }
}

#[derive(Clone)]
pub struct UsergroupsService {
    pool: PgPool,
}

impl UsergroupsService {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// The write rule, exposed on the wire as `Usergroup.can_write`:
    /// `usergroup:manage:platform`, or the creator holding
    /// `usergroup:create:platform`.
    #[must_use]
    pub fn can_write(actor: &Actor, group: &Usergroup) -> bool {
        actor.has(perm(Action::Manage))
            || (group.creator_id == Some(actor.user_id) && actor.has(perm(Action::Create)))
    }

    async fn writable(&self, actor: &Actor, id: UsergroupId) -> Result<Usergroup> {
        let group = ab_db::usergroups::get_usergroup(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("usergroup"))?;
        if Self::can_write(actor, &group) {
            Ok(group)
        } else {
            Err(Error::forbidden("no write access to this usergroup"))
        }
    }

    pub async fn create(&self, actor: &Actor, name: &str, description: &str) -> Result<Usergroup> {
        actor.require(perm(Action::Create))?;
        let id = ab_db::usergroups::insert_usergroup(&self.pool, name, description, actor.user_id)
            .await?;
        ab_db::usergroups::get_usergroup(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("usergroup"))
    }

    pub async fn get(&self, actor: &Actor, id: UsergroupId) -> Result<Usergroup> {
        actor.require(perm(Action::Read))?;
        ab_db::usergroups::get_usergroup(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("usergroup"))
    }

    pub async fn list(
        &self,
        actor: &Actor,
        cursor: Option<UsergroupId>,
        limit: i64,
    ) -> Result<(Vec<Usergroup>, Option<UsergroupId>)> {
        actor.require(perm(Action::Read))?;
        let limit = limit.clamp(1, 100);
        let mut rows = ab_db::usergroups::list_usergroups(&self.pool, cursor, limit + 1).await?;
        let next = if i64::try_from(rows.len()).unwrap_or(i64::MAX) > limit {
            rows.truncate(usize::try_from(limit).unwrap_or(usize::MAX));
            rows.last().map(|g| g.id)
        } else {
            None
        };
        Ok((rows, next))
    }

    pub async fn update(
        &self,
        actor: &Actor,
        id: UsergroupId,
        name: Option<&str>,
        description: Option<&str>,
    ) -> Result<Usergroup> {
        self.writable(actor, id).await?;
        ab_db::usergroups::update_usergroup(&self.pool, id, name, description).await?;
        ab_db::usergroups::get_usergroup(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("usergroup"))
    }

    pub async fn delete(&self, actor: &Actor, id: UsergroupId) -> Result<()> {
        self.writable(actor, id).await?;
        ab_db::usergroups::delete_usergroup(&self.pool, id).await?;
        Ok(())
    }

    pub async fn members(&self, actor: &Actor, id: UsergroupId) -> Result<Vec<Member>> {
        self.get(actor, id).await?;
        ab_db::usergroups::list_members(&self.pool, id).await
    }

    pub async fn add_members(
        &self,
        actor: &Actor,
        id: UsergroupId,
        user_ids: &[UserId],
    ) -> Result<()> {
        self.writable(actor, id).await?;
        let known: Vec<UserId> = ab_db::identity::list_user_summaries(&self.pool, user_ids)
            .await?
            .into_iter()
            .map(|u| u.id)
            .collect();
        reject_unknown("user_ids", "user", user_ids, &known)?;
        ab_db::usergroups::add_members(&self.pool, id, user_ids).await
    }

    pub async fn remove_members(
        &self,
        actor: &Actor,
        id: UsergroupId,
        user_ids: &[UserId],
    ) -> Result<()> {
        self.writable(actor, id).await?;
        ab_db::usergroups::remove_members(&self.pool, id, user_ids).await
    }

    pub async fn linked_course_ids(&self, actor: &Actor, id: UsergroupId) -> Result<Vec<CourseId>> {
        self.get(actor, id).await?;
        ab_db::usergroups::list_course_ids(&self.pool, id).await
    }

    pub async fn add_courses(
        &self,
        actor: &Actor,
        id: UsergroupId,
        course_ids: &[CourseId],
    ) -> Result<()> {
        self.writable(actor, id).await?;
        let known: Vec<CourseId> = ab_db::analytics::list_courses(&self.pool, course_ids)
            .await?
            .into_iter()
            .map(|c| c.id)
            .collect();
        reject_unknown("course_ids", "course", course_ids, &known)?;
        ab_db::usergroups::add_courses(&self.pool, id, course_ids).await
    }

    pub async fn remove_courses(
        &self,
        actor: &Actor,
        id: UsergroupId,
        course_ids: &[CourseId],
    ) -> Result<()> {
        self.writable(actor, id).await?;
        ab_db::usergroups::remove_courses(&self.pool, id, course_ids).await
    }

    /// Groups linked to a course (course-settings view).
    pub async fn for_course(&self, actor: &Actor, course_id: CourseId) -> Result<Vec<Usergroup>> {
        actor.require(perm(Action::Read))?;
        ab_db::usergroups::list_for_course(&self.pool, course_id).await
    }
}
