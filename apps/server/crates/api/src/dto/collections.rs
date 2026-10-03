use ab_core::id::{CollectionId, CourseId, UserId};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::dto::courses::Course;

#[derive(Debug, Serialize, ToSchema)]
pub struct Collection {
    pub id: CollectionId,
    pub name: String,
    pub description: String,
    pub public: bool,
    pub creator_id: Option<UserId>,
    /// Storage key of the cover image, served at `/content/<key>`.
    pub cover_key: Option<String>,
    /// Optimistic-lock version: echo it as `If-Match` on `PATCH` (UX-279).
    pub version: i32,
    /// Member courses visible to the caller, in collection order.
    pub courses: Vec<Course>,
    /// The caller may `DELETE /collections/{id}` (creator or `collection:delete:platform`).
    pub can_delete: bool,
    /// What the caller may do to this collection now.
    pub allowed_actions: Vec<ab_domain::catalog::collections::CollectionAction>,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl Collection {
    pub fn for_actor(
        c: ab_domain::catalog::collections::CollectionWithCourses,
        actor: &ab_domain::identity::Actor,
    ) -> Self {
        Self {
            id: c.collection.id,
            name: c.collection.name,
            description: c.collection.description,
            public: c.collection.public,
            creator_id: c.collection.creator_id,
            cover_key: c.collection.cover_key,
            version: c.collection.version,
            courses: c
                .courses
                .into_iter()
                .map(|course| Course::for_actor(course, actor))
                .collect(),
            can_delete: c.can_delete,
            allowed_actions: c.allowed_actions,
            created_at_unix: c.collection.created_at,
            updated_at_unix: c.collection.updated_at,
        }
    }
}

/// Keyset page (ARCHITECTURE §6): pass `next_cursor` back as `cursor`.
#[derive(Debug, Serialize, ToSchema)]
pub struct CollectionPage {
    pub items: Vec<Collection>,
    pub next_cursor: Option<CollectionId>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateCollectionRequest {
    #[garde(length(chars, max = 500))]
    #[schema(max_length = 500)]
    pub name: String,
    #[garde(length(chars, max = 5000))]
    #[schema(max_length = 5000)]
    pub description: Option<String>,
    #[garde(skip)]
    pub public: Option<bool>,
    /// Course membership; every course must be readable by the caller.
    #[garde(inner(length(max = 100)))]
    #[schema(max_items = 100)]
    pub courses: Option<Vec<CourseId>>,
    /// A finalized `collection-cover` upload of the caller.
    #[garde(skip)]
    pub cover_upload_id: Option<uuid::Uuid>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateCollectionRequest {
    #[garde(inner(length(max = 500)))]
    #[schema(max_length = 500)]
    pub name: Option<String>,
    #[garde(inner(length(max = 5000)))]
    #[schema(max_length = 5000)]
    pub description: Option<String>,
    #[garde(skip)]
    pub public: Option<bool>,
    /// Replaces the whole membership when present (legacy semantics).
    #[garde(inner(length(max = 100)))]
    #[schema(max_items = 100)]
    pub courses: Option<Vec<CourseId>>,
    /// A finalized `collection-cover` upload of the caller; `null` removes
    /// the cover.
    #[garde(skip)]
    #[serde(default, deserialize_with = "crate::dto::double_option")]
    #[schema(value_type = Option<uuid::Uuid>)]
    pub cover_upload_id: Option<Option<uuid::Uuid>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CollectionListQuery {
    /// `next_cursor` from the previous page.
    pub cursor: Option<CollectionId>,
    /// 1..=100, default 20.
    pub limit: Option<i64>,
    /// Words matched like `/search` over name and description.
    pub q: Option<String>,
    /// `newest` (default), `name` or `updated`; unknown values sort newest.
    pub sort: Option<String>,
}
