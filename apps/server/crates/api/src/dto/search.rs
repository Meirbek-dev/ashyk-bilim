use ab_core::id::UserId;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::dto::courses::Course;

/// Collections in search results are light — no embedded courses.
#[derive(Debug, Serialize, ToSchema)]
pub struct CollectionHit {
    pub id: ab_core::id::CollectionId,
    pub name: String,
    pub description: String,
    pub public: bool,
}

/// Public-profile projection (no email — FINDINGS #16).
#[derive(Debug, Serialize, ToSchema)]
pub struct UserHit {
    pub id: UserId,
    pub username: String,
    pub display_name: String,
    pub avatar_key: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SearchResults {
    pub courses: Vec<Course>,
    pub collections: Vec<CollectionHit>,
    /// Empty for anonymous callers.
    pub users: Vec<UserHit>,
}

impl From<ab_domain::catalog::search::SearchResults> for SearchResults {
    fn from(r: ab_domain::catalog::search::SearchResults) -> Self {
        Self {
            courses: r.courses.into_iter().map(Into::into).collect(),
            collections: r
                .collections
                .into_iter()
                .map(|c| CollectionHit {
                    id: c.id,
                    name: c.name,
                    description: c.description,
                    public: c.public,
                })
                .collect(),
            users: r.users.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<ab_db::search::UserHitRow> for UserHit {
    fn from(u: ab_db::search::UserHitRow) -> Self {
        Self {
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            avatar_key: u.avatar_key,
        }
    }
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SearchQuery {
    /// Search terms: every word matches by prefix, `-word` excludes.
    pub q: String,
    /// Per-section cap, 1..=50 (default 10).
    pub limit: Option<i64>,
}
