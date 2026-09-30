//! Users domain transforms (MIGRATION §2.1): legacy `user` → v2 `users` +
//! `google_accounts`; the credential goes to Zitadel (§3).

use ab_core::{Error, Result};
use ab_domain::identity::profile::{ProfileSections, THEME_SLUGS};

use crate::legacy;
use crate::transform::common::{non_empty, tidy};

/// Placeholder written to `users.zitadel_user_id` by the users domain;
/// `etl zitadel-import` replaces it with the real Zitadel user id. Keyed by
/// the legacy uuid so the import can re-run on a half-finished batch.
pub const ZITADEL_PENDING_PREFIX: &str = "legacy:";

pub const LOCALES: [&str; 3] = ["ru-RU", "kk-KZ", "en-US"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserRow {
    pub username: String,
    pub email: String,
    pub display_name: String,
    pub bio: String,
    pub locale: String,
    pub status: String,
    pub zitadel_placeholder: String,
    /// Google `sub` when the account is (also) Google-linked.
    pub google_sub: Option<String>,
    /// Modular-crypt hash for the Zitadel import; None for IdP-only users.
    pub password_hash: Option<String>,
    /// The profile builder document, retyped (`{"sections": []}` when none).
    pub profile: serde_json::Value,
    /// UI theme registry slug ([`legacy_theme`]); legacy `default`, empty
    /// or retired themes are v2 `NULL`.
    pub theme: Option<String>,
}

/// Column fates that carry nothing into v2 but should be counted.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct DroppedUserData {
    /// Why `user.details` was dropped (`None`: it was empty).
    pub details: Option<String>,
    pub google_avatar_url: bool,
}

/// Legacy `user.profile` → the typed v2 document (MIGRATION: Retype; a
/// parse or validation failure is a hard error naming the row).
pub fn profile(id: i32, value: Option<&serde_json::Value>) -> Result<serde_json::Value> {
    let mut sections = match value {
        // Legacy wrote `{}` for "never opened the builder".
        None | Some(serde_json::Value::Null) => ProfileSections::default(),
        Some(v) if v.as_object().is_some_and(serde_json::Map::is_empty) => {
            ProfileSections::default()
        }
        Some(v) => serde_json::from_value(v.clone())
            .map_err(|e| Error::config(format!("user {id}: profile: {e}")))?,
    };
    sections
        .normalize()
        .map_err(|e| Error::config(format!("user {id}: profile: {e}")))?;
    serde_json::to_value(sections).map_err(|e| Error::internal("serialize profile", e))
}

/// Legacy theme key → v2 registry slug (BUG-365). The legacy registry keyed
/// themes camelCase or squashed (`vintagePaper`, `amethysthaze`, `doom64`),
/// v2 kebab-case (`vintage-paper`); `black` was the shadcn neutral preset and
/// `kodamaGrave` a typo of `kodama-grove`. `default` and the retired themes
/// (`artDeco`, `darkmatter`, …) have no v2 slug: `None`, the app default.
#[must_use]
pub fn legacy_theme(key: &str) -> Option<&'static str> {
    let squash = |s: &str| -> String {
        s.chars()
            .filter(|c| *c != '-')
            .flat_map(char::to_lowercase)
            .collect()
    };
    let key = match key.trim() {
        "black" => "shadcn-default",
        "kodamaGrave" => "kodama-grove",
        other => other,
    };
    let key = squash(key);
    THEME_SLUGS.into_iter().find(|slug| squash(slug) == key)
}

/// `user.details` has no v2 home: the empty «Новая деталь» placeholders
/// the builder wrote on first open carry nothing; anything else is reported
/// with its content so the loss is visible.
#[must_use]
pub fn details_drop_reason(value: Option<&serde_json::Value>) -> Option<String> {
    let cards = value?.as_object()?;
    if cards.is_empty() {
        return None;
    }
    let placeholder = cards.values().all(|card| {
        card.get("text")
            .and_then(serde_json::Value::as_str)
            .is_none_or(|t| t.trim().is_empty())
    });
    Some(if placeholder {
        "empty «Новая деталь» placeholder card(s), no text".to_owned()
    } else {
        format!(
            "legacy detail card(s) with no v2 home: {}",
            serde_json::Value::Object(cards.clone())
        )
    })
}

pub fn user(u: &legacy::User) -> Result<(UserRow, DroppedUserData)> {
    // First, patronymic, last: v2 has one display name, and the legacy
    // patronymic (certificates, grading exports) must not be lost.
    let full = tidy(&format!(
        "{} {} {}",
        u.first_name,
        u.middle_name.as_deref().unwrap_or_default(),
        u.last_name
    ));
    let display_name = if full.is_empty() {
        u.username.trim().to_owned()
    } else {
        full
    };
    let locale = u
        .locale
        .as_deref()
        .filter(|l| LOCALES.contains(l))
        .unwrap_or("ru-RU")
        .to_owned();
    let row = UserRow {
        username: u.username.trim().to_owned(),
        email: u.email.trim().to_lowercase(),
        display_name,
        bio: u.bio.clone().unwrap_or_default(),
        locale,
        status: if u.is_active { "active" } else { "disabled" }.to_owned(),
        zitadel_placeholder: format!("{ZITADEL_PENDING_PREFIX}{}", u.user_uuid),
        google_sub: non_empty(u.google_sub.as_deref()),
        password_hash: non_empty(u.hashed_password.as_deref()),
        profile: profile(u.id, u.profile.as_ref())?,
        theme: u.theme.as_deref().and_then(legacy_theme).map(str::to_owned),
    };
    let dropped = DroppedUserData {
        details: details_drop_reason(u.details.as_ref()),
        google_avatar_url: u
            .avatar_image
            .as_deref()
            .is_some_and(|a| a.trim().starts_with("http://")),
    };
    Ok((row, dropped))
}

/// Legacy `hashed_password` formats Zitadel's passwap verifies natively.
#[must_use]
pub fn hash_is_importable(hash: &str) -> bool {
    hash.starts_with("$argon2id$")
        || hash.starts_with("$argon2i$")
        || hash.starts_with("$2a$")
        || hash.starts_with("$2b$")
        || hash.starts_with("$2y$")
}

/// Zitadel profile names: legacy allowed empty first/last names; Zitadel
/// requires both (the Google path in v2 uses the same "-" fallback).
#[must_use]
pub fn zitadel_names(first: &str, last: &str, username: &str) -> (String, String) {
    let first = tidy(first);
    let last = tidy(last);
    match (first.is_empty(), last.is_empty()) {
        (false, false) => (first, last),
        (false, true) => (first, "-".into()),
        (true, false) => ("-".into(), last),
        (true, true) => (username.trim().to_owned(), "-".into()),
    }
}

/// Legacy `auth_audit_log.user_id` is the public `user_01K…` string.
#[must_use]
pub fn audit_user_uuid(value: Option<&str>) -> Option<&str> {
    value.filter(|v| v.starts_with("user_"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn legacy_user() -> legacy::User {
        legacy::User {
            id: 7,
            user_uuid: "user_01TEST".into(),
            username: " ivan ".into(),
            first_name: "Иван ".into(),
            last_name: " Петров".into(),
            middle_name: None,
            email: " ivan@example.com".into(),
            avatar_image: Some("https://lh3.googleusercontent.com/a/x".into()),
            bio: None,
            locale: Some("de-DE".into()),
            theme: Some("cyberpunk".into()),
            hashed_password: Some("$argon2id$v=19$m=65536,t=3,p=4$abc$def".into()),
            auth_provider: "local".into(),
            google_sub: Some("".into()),
            is_active: false,
            is_superuser: false,
            is_verified: false,
            details: None,
            profile: Some(serde_json::json!({"sections": [
                {"id": "section-1", "type": "courses", "title": "Test Python"}
            ]})),
            created_at: Some(1.0),
            updated_at: Some(2.0),
        }
    }

    #[test]
    fn user_row_normalizes_names_locale_status() {
        let (row, dropped) = user(&legacy_user()).unwrap();
        assert_eq!(row.username, "ivan");
        assert_eq!(row.email, "ivan@example.com");
        assert_eq!(row.display_name, "Иван Петров");
        assert_eq!(row.locale, "ru-RU", "unknown locale falls back");
        assert_eq!(row.status, "disabled");
        assert_eq!(row.zitadel_placeholder, "legacy:user_01TEST");
        assert_eq!(row.google_sub, None, "empty sub is no link");
        assert!(row.password_hash.is_some());
        assert_eq!(row.theme.as_deref(), Some("cyberpunk"));
        assert_eq!(row.profile["sections"][0]["type"], "courses");
        assert_eq!(
            dropped,
            DroppedUserData {
                details: None,
                google_avatar_url: false
            }
        );
    }

    /// BUG-361/362: the profile document is retyped strictly, the theme is
    /// carried unless it is the legacy default, and the empty detail
    /// placeholders are dropped with that reason.
    #[test]
    fn profile_theme_and_details_fates() {
        let mut u = legacy_user();
        u.theme = Some("default".into());
        u.profile = Some(serde_json::json!({"sections": [
            {"id": "section-1768118219681", "type": "education", "title": "Раздел «Образование»",
             "education": [{"institution": "ПГУ", "degree": "специалист", "field": "Математика",
                            "startDate": "1993-09-01", "current": false, "description": "", "endDate": "1997-06-30"}]},
            {"id": "section-1768119939665", "type": "image-gallery", "title": "Галерея",
             "images": [{"url": "https://img.example.com/a.jpg?semt=ais&w=740", "caption": "аватар2"}]}
        ]}));
        u.details = Some(serde_json::json!({"detail-1768119143325":
            {"id": "detail-1768119143325", "label": "Новая деталь", "icon": "", "text": ""}}));
        let (row, dropped) = user(&u).unwrap();
        assert_eq!(row.theme, None, "legacy default is no choice");
        assert_eq!(row.profile["sections"].as_array().unwrap().len(), 2);
        assert_eq!(
            row.profile["sections"][0]["education"][0]["endDate"],
            "1997-06-30"
        );
        assert!(dropped.details.unwrap().contains("Новая деталь"));

        u.profile = Some(serde_json::json!({}));
        u.details = Some(serde_json::json!({}));
        let (row, dropped) = user(&u).unwrap();
        assert_eq!(row.profile, serde_json::json!({"sections": []}));
        assert_eq!(dropped.details, None);

        u.details = Some(
            serde_json::json!({"d": {"id": "d", "label": "Город", "icon": "map-pin", "text": "Павлодар"}}),
        );
        assert!(user(&u).unwrap().1.details.unwrap().contains("Павлодар"));

        // Strict: an unknown kind or a non-http URL is a hard error naming the row.
        u.profile =
            Some(serde_json::json!({"sections": [{"id": "s", "type": "hero", "title": "x"}]}));
        assert!(
            user(&u)
                .unwrap_err()
                .to_string()
                .contains("user 7: profile")
        );
        u.profile = Some(
            serde_json::json!({"sections": [{"id": "s", "type": "links", "title": "x",
            "links": [{"title": "t", "url": "ftp://x"}]}]}),
        );
        assert!(
            user(&u)
                .unwrap_err()
                .to_string()
                .contains("user 7: profile")
        );
        u.profile = None;
        u.theme = Some("bad slug!".into());
        assert_eq!(
            user(&u).unwrap().0.theme,
            None,
            "unknown theme is the default"
        );
    }

    /// BUG-365: every legacy slug found in production maps onto the v2
    /// registry (it was copied verbatim and rendered as the fallback).
    #[test]
    fn legacy_theme_slugs_map_to_the_registry() {
        for (legacy, v2) in [
            ("vintagePaper", Some("vintage-paper")),
            ("black", Some("shadcn-default")),
            ("quantumRose", Some("quantum-rose")),
            ("elegantLuxury", Some("elegant-luxury")),
            ("amethysthaze", Some("amethyst-haze")),
            ("doom64", Some("doom-64")),
            ("kodamaGrave", Some("kodama-grove")),
            ("t3chat", Some("t3-chat")),
            ("modern-minimal", Some("modern-minimal")),
            ("shadcn-default", Some("shadcn-default")),
            ("cyberpunk", Some("cyberpunk")),
            ("default", None),
            ("artDeco", None),
            ("", None),
        ] {
            assert_eq!(legacy_theme(legacy), v2, "{legacy}");
        }
    }

    #[test]
    fn display_name_keeps_the_patronymic() {
        let mut u = legacy_user();
        u.middle_name = Some("Сергеевич".into());
        assert_eq!(user(&u).unwrap().0.display_name, "Иван Сергеевич Петров");
    }

    #[test]
    fn display_name_falls_back_to_username() {
        let mut u = legacy_user();
        u.first_name = String::new();
        u.last_name = "  ".into();
        assert_eq!(user(&u).unwrap().0.display_name, "ivan");
        assert_eq!(zitadel_names("", " ", "ivan"), ("ivan".into(), "-".into()));
        assert_eq!(zitadel_names("A", "", "x"), ("A".into(), "-".into()));
        assert_eq!(zitadel_names("", "B", "x"), ("-".into(), "B".into()));
    }

    #[test]
    fn importable_hash_formats() {
        assert!(hash_is_importable("$argon2id$v=19$..."));
        assert!(hash_is_importable("$2b$12$..."));
        assert!(!hash_is_importable("pbkdf2_sha256$..."));
        assert!(!hash_is_importable(""));
    }

    #[test]
    fn audit_user_uuid_only_accepts_public_ids() {
        assert_eq!(audit_user_uuid(Some("user_01K")), Some("user_01K"));
        assert_eq!(audit_user_uuid(Some("42")), None);
        assert_eq!(audit_user_uuid(None), None);
    }
}
