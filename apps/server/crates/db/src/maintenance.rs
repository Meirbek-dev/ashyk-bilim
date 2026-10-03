//! Stage-2 data migrations (D-01..D-03), run by `ashyq admin migrate-*`.

use ab_core::Result;
use ab_core::id::{ActivityId, DiscussionId};
use sqlx::PgPool;

pub struct ActivityContentRow {
    pub id: ActivityId,
    pub content: serde_json::Value,
}

/// D-01 candidates: activities whose content mentions a legacy embed node.
pub async fn activities_with_block_embed(pool: &PgPool) -> Result<Vec<ActivityContentRow>> {
    Ok(sqlx::query_as!(
        ActivityContentRow,
        r#"SELECT id AS "id: ActivityId", content
           FROM activities
           WHERE content::text LIKE '%"blockEmbed"%'
           ORDER BY id"#
    )
    .fetch_all(pool)
    .await?)
}

/// Rewrite one activity's content (no `version` bump: the shape changes,
/// not what a teacher wrote; an open editor saving the old shape over it is
/// converted again by the next run).
pub async fn set_activity_content<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: ActivityId,
    content: &serde_json::Value,
) -> Result<()> {
    sqlx::query!(
        "UPDATE activities SET content = $2 WHERE id = $1",
        id.0,
        content
    )
    .execute(db)
    .await?;
    Ok(())
}

pub struct DiscussionContentRow {
    pub id: DiscussionId,
    pub content: String,
}

/// D-01 discussion candidates: content that is not a JSON document.
pub async fn discussions_not_json(pool: &PgPool) -> Result<Vec<DiscussionContentRow>> {
    Ok(sqlx::query_as!(
        DiscussionContentRow,
        r#"SELECT id AS "id: DiscussionId", content
           FROM course_discussions
           WHERE ltrim(content) NOT LIKE '{%'
           ORDER BY id"#
    )
    .fetch_all(pool)
    .await?)
}

pub async fn set_discussion_content<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: DiscussionId,
    content: &str,
) -> Result<()> {
    sqlx::query!(
        "UPDATE course_discussions SET content = $2 WHERE id = $1",
        id.0,
        content
    )
    .execute(db)
    .await?;
    Ok(())
}

/// D-02: users whose theme is not one of `slugs`.
pub async fn count_unknown_themes(pool: &PgPool, slugs: &[String]) -> Result<i64> {
    Ok(sqlx::query_scalar!(
        r#"SELECT count(*) AS "n!" FROM users
           WHERE theme IS NOT NULL AND NOT (theme = ANY($1))"#,
        slugs
    )
    .fetch_one(pool)
    .await?)
}

/// D-02: reset those themes to the default (`NULL`); returns the count.
pub async fn clear_unknown_themes(pool: &PgPool, slugs: &[String]) -> Result<u64> {
    Ok(sqlx::query!(
        "UPDATE users SET theme = NULL WHERE theme IS NOT NULL AND NOT (theme = ANY($1))",
        slugs
    )
    .execute(pool)
    .await?
    .rows_affected())
}

/// D-03: users per stored locale tag.
pub async fn locale_counts(pool: &PgPool) -> Result<Vec<(String, i64)>> {
    Ok(sqlx::query!(
        r#"SELECT locale, count(*) AS "n!" FROM users GROUP BY locale ORDER BY locale"#
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| (r.locale, r.n))
    .collect())
}

/// D-03: legacy region tags to the short ones; returns the count.
pub async fn shorten_locales(pool: &PgPool) -> Result<u64> {
    Ok(sqlx::query!(
        r#"UPDATE users SET locale = CASE locale
                WHEN 'ru-RU' THEN 'ru' WHEN 'kk-KZ' THEN 'kk' ELSE 'en' END
           WHERE locale IN ('ru-RU', 'kk-KZ', 'en-US')"#
    )
    .execute(pool)
    .await?
    .rows_affected())
}
