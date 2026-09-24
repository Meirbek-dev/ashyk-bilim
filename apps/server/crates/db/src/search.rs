//! Platform search (search-lite).
//!
//! FTS over the generated `search` tsvector columns ('simple' config —
//! matches the migration; no language stemming, which is the right call for
//! mixed ru/kk/en content), ranked by `ts_rank_cd` then recency. Every word
//! matches by prefix (UX-152) so a partial word finds courses the way the
//! people search does; `-word` excludes.

use ab_core::Result;
use ab_core::id::{CollectionId, CourseId, UserId};
use sqlx::PgPool;

use crate::catalog::CourseRow;
use crate::collections::CollectionRow;

/// `to_tsquery` text for `query`: every word a quoted prefix term.
///
/// `'крит':*` matches «Критик», `'gauntlet21-analytics':*` the hyphenated
/// name; `-word` negates (as a prefix too, UX-155); all ANDed. Quoting keeps the operators ours;
/// inside quotes only `'` and `\` are special, so both are escaped (BUG-249: a trailing `\`
/// escaped the closing quote → 42601) and the text is always valid tsquery syntax.
#[must_use]
pub fn prefix_tsquery(query: &str) -> String {
    query
        .split_whitespace()
        .map(|word| {
            let (negate, word) = match word.strip_prefix('-') {
                Some(rest) if !rest.is_empty() => (true, rest),
                _ => (false, word),
            };
            let not = if negate { "!" } else { "" };
            let quoted = word.replace('\\', r"\\").replace('\'', "''");
            format!("{not}'{quoted}':*")
        })
        .collect::<Vec<_>>()
        .join(" & ")
}

/// Visibility = SQL `course_visible` (BUG-190), the predicate shared with
/// [`crate::catalog::list_courses`] and `collection_listable`.
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
                  public, open_to_contributors, thumbnail_image_key AS thumbnail_key,
                  creator_id AS "creator_id: UserId",
                  ARRAY(SELECT ra.user_id FROM resource_authors ra
                        WHERE ra.course_id = courses.id AND ra.status = 'active'
                          AND ra.authorship <> 'reporter')
                      AS "contributor_ids!: Vec<UserId>",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM courses
           WHERE search @@ to_tsquery('simple', $1)
             AND course_visible(courses, $3, $2)
           ORDER BY ts_rank_cd(search, to_tsquery('simple', $1)) DESC, id DESC
           LIMIT $4"#,
        prefix_tsquery(query),
        see_all,
        viewer.map(|v| v.0),
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Same listing rule as [`crate::collections::list_collections`]
/// (`collection_listable`): no «0 courses» hits (UX-127).
pub async fn search_collections(
    pool: &PgPool,
    query: &str,
    viewer: Option<UserId>,
    see_all: bool,
    see_all_courses: bool,
    limit: i64,
) -> Result<Vec<CollectionRow>> {
    let rows = sqlx::query_as!(
        CollectionRow,
        r#"SELECT id AS "id: CollectionId", name, description, public,
                  creator_id AS "creator_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM collections
           WHERE search @@ to_tsquery('simple', $1)
             AND (public OR $2 OR creator_id = $3)
             AND collection_listable(id, $3, $5)
           ORDER BY ts_rank_cd(search, to_tsquery('simple', $1)) DESC, id DESC
           LIMIT $4"#,
        prefix_tsquery(query),
        see_all,
        viewer.map(|v| v.0),
        limit,
        see_all_courses
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

/// One active user's public projection by username (case-insensitive).
pub async fn find_user_hit_by_username(
    pool: &PgPool,
    username: &str,
) -> Result<Option<UserHitRow>> {
    let row = sqlx::query_as!(
        UserHitRow,
        r#"SELECT id AS "id: UserId", username, display_name, avatar_key
           FROM users
           WHERE status = 'active' AND lower(username) = lower($1)"#,
        username
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Prefix matches rank above substring matches; active users only.
/// (Privacy upgrade over legacy: email is NOT searchable — FINDINGS #16.)
pub async fn search_users(pool: &PgPool, query: &str, limit: i64) -> Result<Vec<UserHitRow>> {
    let literal = crate::like_escape(query);
    let substring = format!("%{literal}%");
    let prefix = format!("{literal}%");
    let rows = sqlx::query_as!(
        UserHitRow,
        r#"SELECT id AS "id: UserId", username, display_name, avatar_key
           FROM users
           WHERE status = 'active'
             AND (username ILIKE $1 ESCAPE '\' OR display_name ILIKE $1 ESCAPE '\')
           ORDER BY (username ILIKE $2 ESCAPE '\' OR display_name ILIKE $2 ESCAPE '\') DESC, username
           LIMIT $3"#,
        substring,
        prefix,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::prefix_tsquery;

    #[test]
    fn words_are_quoted_prefixes_and_dashes_negate() {
        assert_eq!(
            prefix_tsquery("  gauntlet21-analytics Крит -live it's - "),
            "'gauntlet21-analytics':* & 'Крит':* & !'live':* & 'it''s':* & '-':*"
        );
        assert_eq!(prefix_tsquery("   "), "");
        assert_eq!(prefix_tsquery(r"x\ \"), r"'x\\':* & '\\':*");
    }
}
