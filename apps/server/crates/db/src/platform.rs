//! The platform singleton (one row, DB-enforced).

use ab_core::Result;
use sqlx::PgPool;

pub struct PlatformRow {
    pub name: String,
    pub description: String,
    pub about: String,
    /// Kazakh / English versions of `description` and `about`; blank = not translated.
    pub description_kk: String,
    pub description_en: String,
    pub about_kk: String,
    pub about_en: String,
    pub email: String,
    pub label: Option<String>,
    pub logo_key: Option<String>,
    pub thumbnail_key: Option<String>,
    pub version: i32,
}

pub async fn get_platform(pool: &PgPool) -> Result<Option<PlatformRow>> {
    let row = sqlx::query_as!(
        PlatformRow,
        "SELECT name, description, about, description_kk, description_en, about_kk, about_en,
                email, label, logo_key, thumbnail_key, version
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
    pub description_kk: Option<&'a str>,
    pub description_en: Option<&'a str>,
    pub about_kk: Option<&'a str>,
    pub about_en: Option<&'a str>,
    pub email: Option<&'a str>,
    /// `Some(None)` clears the label.
    pub label: Option<Option<&'a str>>,
    pub logo_key: Option<&'a str>,
    /// `true` removes the logo (ignored when `logo_key` sets a new one).
    pub clear_logo: bool,
    pub thumbnail_key: Option<&'a str>,
    /// `true` removes the link cover (ignored when `thumbnail_key` sets a new one).
    pub clear_thumbnail: bool,
}

/// The branding keys the UPDATE replaced (read under the row lock, so a
/// concurrent update never releases the wrong key).
pub struct ReplacedBranding {
    pub logo_key: Option<String>,
    pub thumbnail_key: Option<String>,
}

/// `None` when the singleton row is missing.
pub async fn update_platform<'e>(
    db: impl sqlx::PgExecutor<'e>,
    changes: PlatformChanges<'_>,
) -> Result<Option<ReplacedBranding>> {
    let row = sqlx::query_as!(
        ReplacedBranding,
        r#"UPDATE platforms p SET
               name = COALESCE($1, p.name),
               description = COALESCE($2, p.description),
               about = COALESCE($3, p.about),
               email = COALESCE($4, p.email),
               label = CASE WHEN $8 THEN $5 ELSE p.label END,
               logo_key = CASE WHEN $6::text IS NULL AND $13 THEN NULL
                               ELSE COALESCE($6, p.logo_key) END,
               thumbnail_key = CASE WHEN $7::text IS NULL AND $14 THEN NULL
                                    ELSE COALESCE($7, p.thumbnail_key) END,
               description_kk = COALESCE($9, p.description_kk),
               description_en = COALESCE($10, p.description_en),
               about_kk = COALESCE($11, p.about_kk),
               about_en = COALESCE($12, p.about_en)
           FROM (SELECT singleton, logo_key, thumbnail_key FROM platforms
                 WHERE singleton FOR UPDATE) old
           WHERE p.singleton = old.singleton
           RETURNING old.logo_key AS "logo_key?", old.thumbnail_key AS "thumbnail_key?""#,
        changes.name,
        changes.description,
        changes.about,
        changes.email,
        changes.label.flatten(),
        changes.logo_key,
        changes.thumbnail_key,
        changes.label.is_some(),
        changes.description_kk,
        changes.description_en,
        changes.about_kk,
        changes.about_en,
        changes.clear_logo,
        changes.clear_thumbnail
    )
    .fetch_optional(db)
    .await?;
    Ok(row)
}
