//! Platform search (search-lite).
//!
//! FTS over the generated `search` tsvector columns ('simple' config —
//! matches the migration; no language stemming, which is the right call for
//! mixed ru/kk/en content), ranked by `ts_rank_cd` then recency.

use ab_core::Result;
use ab_core::id::{CollectionId, CourseId, UserId};
use sqlx::PgPool;

use crate::catalog::CourseRow;
use crate::collections::CollectionRow;

pub async fn search_courses(
    pool: &PgPool,
    query: &str,
    viewer: Option<UserId>,
    see_all: bool,
    limit: i64,
) -> Result<Vec<CourseRow>> {
    let rows = sqlx::query_as!(
        CourseRow,
        r#"SELECT id AS "id: CourseId", name, description, about, tags,
                  public, open_to_contributors, creator_id AS "creator_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM courses
           WHERE search @@ websearch_to_tsquery('simple', $1)
             AND (public OR $2 OR creator_id = $3)
           ORDER BY ts_rank_cd(search, websearch_to_tsquery('simple', $1)) DESC, id DESC
           LIMIT $4"#,
        query,
        see_all,
        viewer.map(|v| v.0),
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn search_collections(
    pool: &PgPool,
    query: &str,
    viewer: Option<UserId>,
    see_all: bool,
    limit: i64,
) -> Result<Vec<CollectionRow>> {
    let rows = sqlx::query_as!(
        CollectionRow,
        r#"SELECT id AS "id: CollectionId", name, description, public,
                  creator_id AS "creator_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM collections
           WHERE search @@ websearch_to_tsquery('simple', $1)
             AND (public OR $2 OR creator_id = $3)
           ORDER BY ts_rank_cd(search, websearch_to_tsquery('simple', $1)) DESC, id DESC
           LIMIT $4"#,
        query,
        see_all,
        viewer.map(|v| v.0),
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Public-profile projection for people search.
pub struct UserHitRow {
    pub id: UserId,
    pub username: String,
    pub display_name: String,
    pub avatar_key: Option<String>,
}

/// Prefix matches rank above substring matches; active users only.
/// (Privacy upgrade over legacy: email is NOT searchable — FINDINGS #16.)
pub async fn search_users(pool: &PgPool, query: &str, limit: i64) -> Result<Vec<UserHitRow>> {
    let substring = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
    let prefix = format!("{}%", query.replace('%', "\\%").replace('_', "\\_"));
    let rows = sqlx::query_as!(
        UserHitRow,
        r#"SELECT id AS "id: UserId", username, display_name, avatar_key
           FROM users
           WHERE status = 'active'
             AND (username ILIKE $1 OR display_name ILIKE $1)
           ORDER BY (username ILIKE $2 OR display_name ILIKE $2) DESC, username
           LIMIT $3"#,
        substring,
        prefix,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
