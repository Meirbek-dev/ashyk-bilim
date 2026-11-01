//! Review 3, item 32: the platform's Kazakh / English texts are
//! `translations` rows (blank = no row). Until the contract migration a
//! write to either the rows (this release) or the platform's old language
//! columns (the previous one) shows up on the other side, and a
//! translation-only change still moves the platform's version (If-Match).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_db::platform::PlatformChanges;
use sqlx::PgPool;

fn only<'a>(f: impl FnOnce(&mut PlatformChanges<'a>)) -> PlatformChanges<'a> {
    let mut c = PlatformChanges {
        name: None,
        description: None,
        about: None,
        description_kk: None,
        description_en: None,
        about_kk: None,
        about_en: None,
        email: None,
        label: None,
        logo_key: None,
        clear_logo: false,
        thumbnail_key: None,
        clear_thumbnail: false,
    };
    f(&mut c);
    c
}

async fn rows(pool: &PgPool) -> Vec<(String, String, String)> {
    sqlx::query_as(
        "SELECT field, lang, text FROM translations WHERE entity = 'platform' ORDER BY 1, 2",
    )
    .fetch_all(pool)
    .await
    .unwrap()
}

#[ab_testdb::test]
async fn platform_texts_are_translation_rows(pool: PgPool) {
    let before = ab_db::platform::get_platform(&pool).await.unwrap().unwrap();
    let mut conn = pool.acquire().await.unwrap();
    ab_db::platform::update_platform(
        &mut conn,
        only(|c| {
            c.description_kk = Some("Оқу");
            c.about_en = Some("About");
        }),
    )
    .await
    .unwrap()
    .unwrap();
    let after = ab_db::platform::get_platform(&pool).await.unwrap().unwrap();
    assert_eq!(
        (after.description_kk.as_str(), after.about_en.as_str()),
        ("Оқу", "About")
    );
    assert_eq!(after.description_en, "");
    assert!(
        after.version > before.version,
        "a translation moves the version"
    );
    assert_eq!(
        rows(&pool).await,
        [
            ("about".into(), "en".into(), "About".into()),
            ("description".into(), "kk".into(), "Оқу".into())
        ]
    );
    // Blank removes the row; an absent field keeps its row.
    ab_db::platform::update_platform(&mut conn, only(|c| c.about_en = Some("")))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        rows(&pool).await,
        [("description".into(), "kk".into(), "Оқу".into())]
    );

    let old_columns: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'platforms' AND column_name = 'description_kk')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    if !old_columns {
        return; // contracted: nothing left to mirror
    }
    let mirrored: (String, String) =
        sqlx::query_as("SELECT description_kk, about_en FROM platforms WHERE singleton")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        mirrored,
        ("Оқу".into(), String::new()),
        "the previous release reads the columns"
    );
    // The previous release writes the columns: the rows follow.
    sqlx::query(
        "UPDATE platforms SET description_kk = '', description_en = 'Learn' WHERE singleton",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        rows(&pool).await,
        [("description".into(), "en".into(), "Learn".into())]
    );
    let read = ab_db::platform::get_platform(&pool).await.unwrap().unwrap();
    assert_eq!(
        (read.description_kk.as_str(), read.description_en.as_str()),
        ("", "Learn")
    );
}

/// An unknown field or language is refused.
#[ab_testdb::test]
async fn translations_name_known_fields(pool: PgPool) {
    for (field, lang) in [("motto", "kk"), ("about", "de")] {
        let refused = sqlx::query(
            "INSERT INTO translations (entity, entity_id, field, lang, text)
             SELECT 'platform', id, $1, $2, 'x' FROM platforms WHERE singleton",
        )
        .bind(field)
        .bind(lang)
        .execute(&pool)
        .await;
        assert!(refused.is_err(), "{field}/{lang}");
    }
}
