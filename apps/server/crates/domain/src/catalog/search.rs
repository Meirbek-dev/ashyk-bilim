//! Platform search (search-lite over courses, collections, people).
//!
//! Visibility follows the same rules as the listing endpoints; anonymous
//! viewers get public content only and never see the people section
//! (privacy upgrade over legacy — FINDINGS #16).

use ab_core::Result;
use ab_core::permission::ResourceType;
use sqlx::PgPool;

pub use ab_db::search::UserHitRow as UserHit;

use crate::catalog::collections::Collection;
use crate::catalog::courses::Course;
use crate::catalog::sees_private;
use crate::identity::Actor;

pub struct SearchResults {
    pub courses: Vec<Course>,
    pub collections: Vec<Collection>,
    pub users: Vec<UserHit>,
}

#[derive(Clone)]
pub struct SearchService {
    pool: PgPool,
}

impl SearchService {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn search(&self, actor: &Actor, query: &str, limit: i64) -> Result<SearchResults> {
        let limit = limit.clamp(1, 50);
        let query = query.trim();
        if query.is_empty() {
            return Ok(SearchResults {
                courses: Vec::new(),
                collections: Vec::new(),
                users: Vec::new(),
            });
        }
        let viewer = Some(actor.user_id);
        let courses_all = sees_private(actor, ResourceType::Course);
        let collections_all = sees_private(actor, ResourceType::Collection);
        let courses =
            ab_db::search::search_courses(&self.pool, query, viewer, courses_all, limit).await?;
        let collections = ab_db::search::search_collections(
            &self.pool,
            query,
            viewer,
            collections_all,
            courses_all,
            limit,
        )
        .await?;
        let users = if actor.is_anonymous() {
            Vec::new()
        } else {
            ab_db::search::search_users(&self.pool, query, limit).await?
        };
        Ok(SearchResults {
            courses,
            collections,
            users,
        })
    }
}
