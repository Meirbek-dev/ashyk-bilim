use ab_core::id::UserId;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::dto::courses::Course;

/// Collections in search results are light - no embedded courses.
#[derive(Debug, Serialize, ToSchema)]
pub struct CollectionHit {
    pub id: ab_core::id::CollectionId,
    pub name: String,
    pub description: String,
    pub public: bool,
}

/// Public-profile projection (no email - FINDINGS #16).
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
    /// Set while any section has more hits: pass it back as `cursor` for
    /// the next page of every section.
    pub next_cursor: Option<String>,
}

impl SearchResults {
    pub fn for_actor(
        r: ab_domain::catalog::search::SearchResults,
        actor: &ab_domain::identity::Actor,
    ) -> Self {
        Self {
            courses: r
                .courses
                .into_iter()
                .map(|c| Course::for_actor(c, actor))
                .collect(),
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
            next_cursor: r.next_cursor,
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
    /// `next_cursor` from the previous page.
    pub cursor: Option<String>,
}
