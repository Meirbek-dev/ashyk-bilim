//! The platform singleton (one row, DB-enforced).

use ab_core::Result;
use sqlx::PgPool;

pub struct PlatformRow {
    pub name: String,
    pub description: String,
    pub about: String,
    pub email: String,
    pub label: Option<String>,
    pub logo_key: Option<String>,
    pub thumbnail_key: Option<String>,
}

pub async fn get_platform(pool: &PgPool) -> Result<Option<PlatformRow>> {
    let row = sqlx::query_as!(
        PlatformRow,
        "SELECT name, description, about, email, label, logo_key, thumbnail_key
         FROM platforms WHERE singleton"
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub struct PlatformChanges<'a> {
    pub name: Option<&'a str>,
    pub description: Option<&'a str>,
    pub about: Option<&'a str>,
    pub email: Option<&'a str>,
    pub label: Option<&'a str>,
    pub logo_key: Option<&'a str>,
    pub thumbnail_key: Option<&'a str>,
}

pub async fn update_platform(pool: &PgPool, changes: PlatformChanges<'_>) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE platforms SET
               name = COALESCE($1, name),
               description = COALESCE($2, description),
               about = COALESCE($3, about),
               email = COALESCE($4, email),
               label = COALESCE($5, label),
               logo_key = COALESCE($6, logo_key),
               thumbnail_key = COALESCE($7, thumbnail_key)
           WHERE singleton"#,
        changes.name,
        changes.description,
        changes.about,
        changes.email,
        changes.label,
        changes.logo_key,
        changes.thumbnail_key
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}
