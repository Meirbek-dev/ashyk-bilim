//! Users domain transforms (MIGRATION §2.1): legacy `user` → v2 `users` +
//! `google_accounts`; the credential goes to Zitadel (§3).

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
}

/// Column fates that carry nothing into v2 but should be counted.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct DroppedUserData {
    pub theme: bool,
    pub details: bool,
    pub profile: bool,
    pub google_avatar_url: bool,
}

#[must_use]
pub fn user(u: &legacy::User) -> (UserRow, DroppedUserData) {
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
    };
    let dropped = DroppedUserData {
        theme: u
            .theme
            .as_deref()
            .is_some_and(|t| !t.is_empty() && t != "default"),
        details: u.has_details,
        profile: u.has_profile,
        google_avatar_url: u
            .avatar_image
            .as_deref()
            .is_some_and(|a| a.trim().starts_with("http://")),
    };
    (row, dropped)
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
/// requires both (the Google path in v2 uses the same "—" fallback).
#[must_use]
pub fn zitadel_names(first: &str, last: &str, username: &str) -> (String, String) {
    let first = tidy(first);
    let last = tidy(last);
    match (first.is_empty(), last.is_empty()) {
        (false, false) => (first, last),
        (false, true) => (first, "—".into()),
        (true, false) => ("—".into(), last),
        (true, true) => (username.trim().to_owned(), "—".into()),
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
            has_details: false,
            has_profile: true,
            created_at: Some(1.0),
            updated_at: Some(2.0),
        }
    }

    #[test]
    fn user_row_normalizes_names_locale_status() {
        let (row, dropped) = user(&legacy_user());
        assert_eq!(row.username, "ivan");
        assert_eq!(row.email, "ivan@example.com");
        assert_eq!(row.display_name, "Иван Петров");
        assert_eq!(row.locale, "ru-RU", "unknown locale falls back");
        assert_eq!(row.status, "disabled");
        assert_eq!(row.zitadel_placeholder, "legacy:user_01TEST");
        assert_eq!(row.google_sub, None, "empty sub is no link");
        assert!(row.password_hash.is_some());
        assert_eq!(
            dropped,
            DroppedUserData {
                theme: true,
                details: false,
                profile: true,
                google_avatar_url: false
            }
        );
    }

    #[test]
    fn display_name_keeps_the_patronymic() {
        let mut u = legacy_user();
        u.middle_name = Some("Сергеевич".into());
        assert_eq!(user(&u).0.display_name, "Иван Сергеевич Петров");
    }

    #[test]
    fn display_name_falls_back_to_username() {
        let mut u = legacy_user();
        u.first_name = String::new();
        u.last_name = "  ".into();
        assert_eq!(user(&u).0.display_name, "ivan");
        assert_eq!(zitadel_names("", " ", "ivan"), ("ivan".into(), "—".into()));
        assert_eq!(zitadel_names("A", "", "x"), ("A".into(), "—".into()));
        assert_eq!(zitadel_names("", "B", "x"), ("—".into(), "B".into()));
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
