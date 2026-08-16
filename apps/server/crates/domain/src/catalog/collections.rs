//! Curated course collections.
//!
//! Visibility mirrors courses (public OR creator OR `collection:read:all` →
//! else 404); membership replaces wholesale on update (legacy semantics) and
//! every attached course must be readable by the actor doing the attaching.

use ab_core::id::{CollectionId, CourseId};
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, Result};
use sqlx::PgPool;

pub use ab_db::collections::CollectionRow as Collection;

use crate::catalog::courses::{Course, CoursesService};
use crate::identity::Actor;

const fn perm(action: Action, scope: Scope) -> Permission {
    Permission {
        resource: ResourceType::Collection,
        action,
        scope: Some(scope),
    }
}

const fn course_perm(action: Action, scope: Scope) -> Permission {
    Permission {
        resource: ResourceType::Course,
        action,
        scope: Some(scope),
    }
}

/// A collection with its member courses (filtered to the viewer).
pub struct CollectionWithCourses {
    pub collection: Collection,
    pub courses: Vec<Course>,
}

#[derive(Clone)]
pub struct CollectionsService {
    pool: PgPool,
    courses: CoursesService,
}

impl CollectionsService {
    #[must_use]
    pub const fn new(pool: PgPool, courses: CoursesService) -> Self {
        Self { pool, courses }
    }

    fn require_read(actor: &Actor, collection: &Collection) -> Result<()> {
        if collection.public
            || collection.creator_id == Some(actor.user_id)
            || actor.has(perm(Action::Read, Scope::All))
        {
            Ok(())
        } else {
            Err(Error::not_found("collection"))
        }
    }

    fn require_write(actor: &Actor, collection: &Collection) -> Result<()> {
        if actor.has(perm(Action::Update, Scope::Platform)) {
            return Ok(());
        }
        if collection.creator_id == Some(actor.user_id)
            && actor.has(perm(Action::Update, Scope::Own))
        {
            return Ok(());
        }
        Err(Error::forbidden("no write access to this collection"))
    }

    /// Every attached course must be readable by the actor (404 otherwise —
    /// same no-leak rule as direct course reads).
    async fn check_courses_readable(&self, actor: &Actor, ids: &[CourseId]) -> Result<()> {
        for id in ids {
            self.courses.get(actor, *id).await?;
        }
        Ok(())
    }

    async fn visible_courses(
        &self,
        actor: &Actor,
        collection_id: CollectionId,
    ) -> Result<Vec<Course>> {
        let see_all = actor.has(course_perm(Action::Read, Scope::All));
        ab_db::collections::list_collection_courses(
            &self.pool,
            collection_id,
            Some(actor.user_id),
            see_all,
        )
        .await
    }

    pub async fn create(
        &self,
        actor: &Actor,
        name: &str,
        description: &str,
        public: bool,
        course_ids: Vec<CourseId>,
    ) -> Result<CollectionWithCourses> {
        actor.require(perm(Action::Create, Scope::Platform))?;
        self.check_courses_readable(actor, &course_ids).await?;
        let id = ab_db::collections::insert_collection(
            &self.pool,
            name,
            description,
            public,
            actor.user_id,
        )
        .await?;
        ab_db::collections::set_collection_courses(&self.pool, id, &course_ids).await?;
        self.get(actor, id).await
    }

    pub async fn get(&self, actor: &Actor, id: CollectionId) -> Result<CollectionWithCourses> {
        let collection = ab_db::collections::get_collection(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("collection"))?;
        Self::require_read(actor, &collection)?;
        let courses = self.visible_courses(actor, id).await?;
        Ok(CollectionWithCourses {
            collection,
            courses,
        })
    }

    /// Newest-first page; returns (collections, next cursor).
    pub async fn list(
        &self,
        actor: &Actor,
        cursor: Option<CollectionId>,
        limit: i64,
    ) -> Result<(Vec<CollectionWithCourses>, Option<CollectionId>)> {
        let limit = limit.clamp(1, 100);
        let see_all = actor.has(perm(Action::Read, Scope::All));
        let mut rows = ab_db::collections::list_collections(
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
        let mut out = Vec::with_capacity(rows.len());
        for collection in rows {
            let courses = self.visible_courses(actor, collection.id).await?;
            out.push(CollectionWithCourses {
                collection,
                courses,
            });
        }
        Ok((out, next))
    }

    pub async fn update(
        &self,
        actor: &Actor,
        id: CollectionId,
        name: Option<&str>,
        description: Option<&str>,
        public: Option<bool>,
        course_ids: Option<Vec<CourseId>>,
    ) -> Result<CollectionWithCourses> {
        let collection = ab_db::collections::get_collection(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("collection"))?;
        Self::require_write(actor, &collection)?;
        ab_db::collections::update_collection(&self.pool, id, name, description, public).await?;
        if let Some(course_ids) = course_ids {
            self.check_courses_readable(actor, &course_ids).await?;
            ab_db::collections::set_collection_courses(&self.pool, id, &course_ids).await?;
        }
        self.get(actor, id).await
    }

    pub async fn delete(&self, actor: &Actor, id: CollectionId) -> Result<()> {
        let collection = ab_db::collections::get_collection(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("collection"))?;
        if !(actor.has(perm(Action::Delete, Scope::Platform))
            || (collection.creator_id == Some(actor.user_id)
                && actor.has(perm(Action::Delete, Scope::Own))))
        {
            return Err(Error::forbidden("no delete access to this collection"));
        }
        ab_db::collections::delete_collection(&self.pool, id).await?;
        Ok(())
    }
}
