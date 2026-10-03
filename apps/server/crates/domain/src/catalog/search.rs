//! Platform search (search-lite over courses, collections, people).
//!
//! Visibility follows the same rules as the listing endpoints; anonymous
//! viewers get public content only and never see the people section
//! (privacy upgrade over legacy - FINDINGS #16).

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
    /// Set while any section has more hits: pass back as `cursor`.
    pub next_cursor: Option<String>,
}

/// The cursor is the number of hits per section already shown.
fn parse_cursor(cursor: Option<&str>) -> Result<i64> {
    match cursor {
        None => Ok(0),
        Some(c) => c.parse::<i64>().ok().filter(|n| *n >= 0).ok_or_else(|| {
            ab_core::Error::validation(vec![ab_core::FieldError {
                field: "cursor".into(),
                code: "invalid".into(),
                message: "cursor must be a next_cursor from a previous page".into(),
            }])
        }),
    }
}

/// Keep `limit` rows; `true` when there were more.
fn page<T>(rows: &mut Vec<T>, limit: i64) -> bool {
    let limit = usize::try_from(limit).unwrap_or(usize::MAX);
    let more = rows.len() > limit;
    rows.truncate(limit);
    more
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

    /// Each section pages by the same `cursor` (hits already shown per
    /// section); `next_cursor` is set while any section has more.
    pub async fn search(
        &self,
        actor: &Actor,
        query: &str,
        limit: i64,
        cursor: Option<&str>,
    ) -> Result<SearchResults> {
        let limit = ab_core::page_limit(limit, 50)?;
        let offset = parse_cursor(cursor)?;
        let query = query.trim();
        if query.is_empty() {
            return Ok(SearchResults {
                courses: Vec::new(),
                collections: Vec::new(),
                users: Vec::new(),
                next_cursor: None,
            });
        }
        let viewer = Some(actor.user_id);
        let courses_all = sees_private(actor, ResourceType::Course);
        let collections_all = sees_private(actor, ResourceType::Collection);
        let mut courses = ab_db::search::search_courses(
            &self.pool,
            query,
            viewer,
            courses_all,
            limit + 1,
            offset,
        )
        .await?;
        let mut collections = ab_db::search::search_collections(
            &self.pool,
            query,
            viewer,
            collections_all,
            courses_all,
            limit + 1,
            offset,
        )
        .await?;
        let mut users = if actor.is_anonymous() {
            Vec::new()
        } else {
            ab_db::search::search_users(&self.pool, query, limit + 1, offset).await?
        };
        let more = [
            page(&mut courses, limit),
            page(&mut collections, limit),
            page(&mut users, limit),
        ]
        .contains(&true);
        Ok(SearchResults {
            courses,
            collections,
            users,
            next_cursor: more.then(|| (offset + limit).to_string()),
        })
    }
}
