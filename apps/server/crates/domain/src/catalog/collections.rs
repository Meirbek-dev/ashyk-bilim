//! Curated course collections.
//!
//! Visibility mirrors courses (public OR creator OR `collection:read:all` →
//! else 404); membership replaces wholesale on update (legacy semantics) and
//! every attached course must be readable by the actor doing the attaching.

use ab_core::id::{CollectionId, CourseId};
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, ErrorCode, Result};
use sqlx::PgPool;
use uuid::Uuid;

pub use ab_db::collections::CollectionFilter;
pub use ab_db::collections::CollectionRow as Collection;

use crate::catalog::courses::{Course, CoursesService};
use crate::catalog::sees_private;
use crate::files::uploads::{UNREFERENCED_GRACE, claim_upload};
use crate::identity::Actor;

const fn perm(action: Action, scope: Scope) -> Permission {
    Permission {
        resource: ResourceType::Collection,
        action,
        scope: Some(scope),
    }
}

/// A `PATCH /collections/{id}`: `None` fields stay; `course_ids` replaces the
/// whole membership; `expected_version` is the `If-Match` guard (UX-279).
pub struct CollectionChanges<'a> {
    pub name: Option<&'a str>,
    pub description: Option<&'a str>,
    pub public: Option<bool>,
    pub course_ids: Option<Vec<CourseId>>,
    /// `Some(Some(id))`: claim that finalized `collection-cover` upload;
    /// `Some(None)`: remove the cover; `None`: keep it.
    pub cover_upload_id: Option<Option<Uuid>>,
    pub expected_version: Option<i32>,
}

/// A collection with its member courses (filtered to the viewer).
pub struct CollectionWithCourses {
    pub collection: Collection,
    pub courses: Vec<Course>,
    /// The viewer may `DELETE` it (creator with `delete:own`, or `delete:platform`).
    pub can_delete: bool,
    pub allowed_actions: Vec<CollectionAction>,
}

/// What the caller may do to a collection (`Collection.allowed_actions`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CollectionAction {
    /// `PATCH /collections/{id}` (fields and membership).
    Update,
    Delete,
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
            || sees_private(actor, ResourceType::Collection)
        {
            Ok(())
        } else {
            Err(Error::not_found("collection"))
        }
    }

    /// The gates of `update` and `delete`, as a list.
    #[must_use]
    pub fn allowed_actions(actor: &Actor, collection: &Collection) -> Vec<CollectionAction> {
        [
            (
                CollectionAction::Update,
                Self::require_write(actor, collection).is_ok(),
            ),
            (
                CollectionAction::Delete,
                Self::can_delete(actor, collection),
            ),
        ]
        .into_iter()
        .filter_map(|(action, ok)| ok.then_some(action))
        .collect()
    }

    fn can_delete(actor: &Actor, collection: &Collection) -> bool {
        actor.has(perm(Action::Delete, Scope::Platform))
            || (collection.creator_id == Some(actor.user_id)
                && actor.has(perm(Action::Delete, Scope::Own)))
    }

    /// `collection:create:platform`.
    /// UX-311: the write handlers check it before reading the body.
    pub fn require_create(actor: &Actor) -> Result<()> {
        actor.require(perm(Action::Create, Scope::Platform))
    }

    /// UX-311/UX-322: the PATCH handler checks this row's write access (404
    /// unreadable, 403 not writable) before reading the body.
    pub async fn require_updatable(&self, actor: &Actor, id: CollectionId) -> Result<()> {
        let collection = self.load(actor, id).await?;
        Self::require_write(actor, &collection)
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

    /// Every attached course must be readable by the actor (404 otherwise -
    /// same no-leak rule as direct course reads). An archived course is not
    /// attached anew (409); one already in the collection (`kept`) stays.
    async fn check_courses_readable(
        &self,
        actor: &Actor,
        ids: &[CourseId],
        kept: &[CourseId],
    ) -> Result<()> {
        for id in ids {
            let course = self.courses.get(actor, *id).await?;
            if !kept.contains(id) {
                course.ensure_not_archived()?;
            }
        }
        Ok(())
    }

    async fn visible_courses(
        &self,
        actor: &Actor,
        collection_id: CollectionId,
    ) -> Result<Vec<Course>> {
        let see_all = sees_private(actor, ResourceType::Course);
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
        cover_upload_id: Option<Uuid>,
    ) -> Result<CollectionWithCourses> {
        actor.require(perm(Action::Create, Scope::Platform))?;
        // BUG-168: names are trimmed and never blank (shared rule, UX-106).
        let name = ab_core::required_str("name", name)?;
        self.check_courses_readable(actor, &course_ids, &[]).await?;
        let mut tx = self.pool.begin().await?;
        let id = ab_db::collections::insert_collection(
            &mut tx,
            name,
            description,
            public,
            actor.user_id,
            &course_ids,
        )
        .await?;
        if let Some(upload_id) = cover_upload_id {
            let key = claim_upload(
                &mut tx,
                actor,
                upload_id,
                "collection-cover",
                "cover_upload_id",
            )
            .await?;
            ab_db::collections::set_collection_cover(&mut *tx, id, Some(&key)).await?;
        }
        tx.commit().await?;
        self.get(actor, id).await
    }

    /// The one 404 rule for every direct access (`get`/`update`/`delete`):
    /// unknown, not readable, or - unless the actor manages collections -
    /// not `collection_listable` (no course visible to them, UX-131). A
    /// caller who cannot read a collection learns nothing else about it
    /// (BUG-192).
    async fn load(&self, actor: &Actor, id: CollectionId) -> Result<Collection> {
        let collection = ab_db::collections::get_collection(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("collection"))?;
        Self::require_read(actor, &collection)?;
        if !sees_private(actor, ResourceType::Collection)
            && !ab_db::collections::collection_listable(
                &self.pool,
                id,
                actor.user_id,
                sees_private(actor, ResourceType::Course),
            )
            .await?
        {
            return Err(Error::not_found("collection"));
        }
        Ok(collection)
    }

    pub async fn get(&self, actor: &Actor, id: CollectionId) -> Result<CollectionWithCourses> {
        let collection = self.load(actor, id).await?;
        let courses = self.visible_courses(actor, id).await?;
        Ok(CollectionWithCourses {
            can_delete: Self::can_delete(actor, &collection),
            allowed_actions: Self::allowed_actions(actor, &collection),
            collection,
            courses,
        })
    }

    /// One page by `filter`; returns (collections, next cursor).
    pub async fn list(
        &self,
        actor: &Actor,
        filter: &CollectionFilter<'_>,
        cursor: Option<CollectionId>,
        limit: i64,
    ) -> Result<(Vec<CollectionWithCourses>, Option<CollectionId>)> {
        let limit = ab_core::page_limit(limit, 100)?;
        let see_all = sees_private(actor, ResourceType::Collection);
        let mut rows = ab_db::collections::list_collections(
            &self.pool,
            Some(actor.user_id),
            see_all,
            sees_private(actor, ResourceType::Course),
            filter,
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
                can_delete: Self::can_delete(actor, &collection),
                allowed_actions: Self::allowed_actions(actor, &collection),
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
        changes: CollectionChanges<'_>,
    ) -> Result<CollectionWithCourses> {
        let collection = self.load(actor, id).await?;
        Self::require_write(actor, &collection)?;
        // BUG-192: everything is validated before the first write, and the
        // fields + membership land in one transaction.
        let name = changes
            .name
            .map(|n| ab_core::required_str("name", n))
            .transpose()?;
        if let Some(course_ids) = &changes.course_ids {
            let kept: Vec<CourseId> = self
                .visible_courses(actor, id)
                .await?
                .into_iter()
                .map(|c| c.id)
                .collect();
            self.check_courses_readable(actor, course_ids, &kept)
                .await?;
        }
        let mut tx = self.pool.begin().await?;
        let updated = ab_db::collections::update_collection(
            &mut tx,
            id,
            name,
            changes.description,
            changes.public,
            changes.course_ids.as_deref(),
            changes.expected_version,
        )
        .await?;
        if !updated {
            // Unguarded → the row was deleted meanwhile; guarded → UX-279:
            // another tab saved first.
            let Some(expected) = changes.expected_version else {
                return Err(Error::not_found("collection"));
            };
            return Err(Error::app_with_details(
                ErrorCode::PreconditionFailed,
                "collection changed since you loaded it",
                serde_json::json!({ "expected": expected, "actual": collection.version }),
            ));
        }
        // The UPDATE above locked the row; claims and releases follow
        // (collection, then uploads - the order a delete takes). The key the
        // swap replaced is released, as for course thumbnails (UX-143).
        if let Some(cover) = changes.cover_upload_id {
            let key = match cover {
                Some(upload_id) => Some(
                    claim_upload(
                        &mut tx,
                        actor,
                        upload_id,
                        "collection-cover",
                        "cover_upload_id",
                    )
                    .await?,
                ),
                None => None,
            };
            if let Some(old) =
                ab_db::collections::set_collection_cover(&mut *tx, id, key.as_deref()).await?
            {
                ab_db::uploads::release_reference_by_key(
                    &mut *tx,
                    &old,
                    UNREFERENCED_GRACE.as_secs_f64(),
                )
                .await?;
            }
        }
        tx.commit().await?;
        self.get(actor, id).await
    }

    /// `expected_version` (`If-Match`, UX-313): a collection another tab
    /// changed meanwhile is 412, not deleted.
    pub async fn delete(
        &self,
        actor: &Actor,
        id: CollectionId,
        expected_version: Option<i32>,
    ) -> Result<()> {
        let collection = self.load(actor, id).await?;
        if !Self::can_delete(actor, &collection) {
            return Err(Error::forbidden("no delete access to this collection"));
        }
        if ab_db::collections::delete_collection(
            &self.pool,
            id,
            expected_version,
            UNREFERENCED_GRACE.as_secs_f64(),
        )
        .await?
        {
            return Ok(());
        }
        // UX-317: nothing deleted - a concurrent delete won (404), or the
        // row moved past the caller's `If-Match` (412 with its version now).
        match (
            ab_db::collections::get_collection(&self.pool, id).await?,
            expected_version,
        ) {
            (Some(current), Some(expected)) => Err(Error::app_with_details(
                ErrorCode::PreconditionFailed,
                "collection changed since you loaded it",
                serde_json::json!({ "expected": expected, "actual": current.version }),
            )),
            _ => Err(Error::not_found("collection")),
        }
    }
}
