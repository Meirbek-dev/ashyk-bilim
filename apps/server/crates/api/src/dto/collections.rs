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
    /// Member courses visible to the caller, in collection order.
    pub courses: Vec<Course>,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl From<ab_domain::catalog::collections::CollectionWithCourses> for Collection {
    fn from(c: ab_domain::catalog::collections::CollectionWithCourses) -> Self {
        Self {
            id: c.collection.id,
            name: c.collection.name,
            description: c.collection.description,
            public: c.collection.public,
            creator_id: c.collection.creator_id,
            courses: c.courses.into_iter().map(Into::into).collect(),
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
    #[garde(length(min = 1, max = 500))]
    pub name: String,
    #[garde(length(max = 5000))]
    pub description: Option<String>,
    #[garde(skip)]
    pub public: Option<bool>,
    /// Course membership; every course must be readable by the caller.
    #[garde(inner(length(max = 100)))]
    pub courses: Option<Vec<CourseId>>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateCollectionRequest {
    #[garde(inner(length(min = 1, max = 500)))]
    pub name: Option<String>,
    #[garde(inner(length(max = 5000)))]
    pub description: Option<String>,
    #[garde(skip)]
    pub public: Option<bool>,
    /// Replaces the whole membership when present (legacy semantics).
    #[garde(inner(length(max = 100)))]
    pub courses: Option<Vec<CourseId>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CollectionListQuery {
    /// `next_cursor` from the previous page.
    pub cursor: Option<CollectionId>,
    /// 1..=100, default 20.
    pub limit: Option<i64>,
}
