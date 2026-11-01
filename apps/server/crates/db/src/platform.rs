//! The platform singleton (one row, DB-enforced).

use ab_core::Result;
use sqlx::PgPool;

pub struct PlatformRow {
    pub name: String,
    pub description: String,
    pub about: String,
    /// Kazakh / English versions of `description` and `about` (`translations`);
    /// blank = not translated.
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
        r#"SELECT p.name, p.description, p.about,
                  COALESCE(dk.text, '') AS "description_kk!", COALESCE(de.text, '') AS "description_en!",
                  COALESCE(ak.text, '') AS "about_kk!", COALESCE(ae.text, '') AS "about_en!",
                  p.email, p.label, p.logo_key, p.thumbnail_key, p.version
           FROM platforms p
           LEFT JOIN translations dk ON (dk.entity, dk.entity_id, dk.field, dk.lang)
                                        = ('platform', p.id, 'description', 'kk')
           LEFT JOIN translations de ON (de.entity, de.entity_id, de.field, de.lang)
                                        = ('platform', p.id, 'description', 'en')
           LEFT JOIN translations ak ON (ak.entity, ak.entity_id, ak.field, ak.lang)
                                        = ('platform', p.id, 'about', 'kk')
           LEFT JOIN translations ae ON (ae.entity, ae.entity_id, ae.field, ae.lang)
                                        = ('platform', p.id, 'about', 'en')
           WHERE p.singleton"#
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
///
/// The language versions go to `translations` (blank removes the row); a
/// trigger mirrors them into the platform's old language columns for the
/// previous release until the contract migration.
pub async fn update_platform(
    conn: &mut sqlx::PgConnection,
    changes: PlatformChanges<'_>,
) -> Result<Option<ReplacedBranding>> {
    // The platform row first, so two saves queue there, not on a translation.
    sqlx::query!("SELECT 1 AS one FROM platforms WHERE singleton FOR UPDATE")
        .fetch_optional(&mut *conn)
        .await?;
    sqlx::query!(
        r#"WITH input (field, lang, text) AS (
               SELECT * FROM (VALUES ('description', 'kk', $1::text), ('description', 'en', $2::text),
                                     ('about', 'kk', $3::text), ('about', 'en', $4::text)) v
               WHERE v.column3 IS NOT NULL),
           platform AS (SELECT id FROM platforms WHERE singleton),
           gone AS (
               DELETE FROM translations t USING input i, platform p
               WHERE t.entity = 'platform' AND t.entity_id = p.id AND t.field = i.field
                 AND t.lang = i.lang AND i.text = ''
               RETURNING 1)
           INSERT INTO translations AS t (entity, entity_id, field, lang, text)
           SELECT 'platform', p.id, i.field, i.lang, i.text FROM input i, platform p WHERE i.text <> ''
           ON CONFLICT (entity, entity_id, field, lang) DO UPDATE SET text = EXCLUDED.text
           WHERE t.text IS DISTINCT FROM EXCLUDED.text"#,
        changes.description_kk,
        changes.description_en,
        changes.about_kk,
        changes.about_en,
    )
    .execute(&mut *conn)
    .await?;
    let row = sqlx::query_as!(
        ReplacedBranding,
        r#"UPDATE platforms p SET
               name = COALESCE($1, p.name),
               description = COALESCE($2, p.description),
               about = COALESCE($3, p.about),
               email = COALESCE($4, p.email),
               label = CASE WHEN $8 THEN $5 ELSE p.label END,
               logo_key = CASE WHEN $6::text IS NULL AND $9 THEN NULL
                               ELSE COALESCE($6, p.logo_key) END,
               thumbnail_key = CASE WHEN $7::text IS NULL AND $10 THEN NULL
                                    ELSE COALESCE($7, p.thumbnail_key) END
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
        changes.clear_logo,
        changes.clear_thumbnail
    )
    .fetch_optional(&mut *conn)
    .await?;
    Ok(row)
}
