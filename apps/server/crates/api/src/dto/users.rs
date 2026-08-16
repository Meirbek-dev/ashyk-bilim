use ab_core::id::UserId;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct UserProfile {
    pub id: UserId,
    pub username: String,
    pub email: String,
    pub display_name: String,
    pub bio: String,
    pub avatar_key: Option<String>,
    pub locale: String,
}

impl From<ab_domain::identity::users::Profile> for UserProfile {
    fn from(p: ab_domain::identity::users::Profile) -> Self {
        Self {
            id: p.id,
            username: p.username,
            email: p.email,
            display_name: p.display_name,
            bio: p.bio,
            avatar_key: p.avatar_key,
            locale: p.locale,
        }
    }
}

/// Partial update; omitted fields are unchanged.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateProfileRequest {
    #[garde(length(max = 120))]
    pub display_name: Option<String>,
    #[garde(length(max = 2000))]
    pub bio: Option<String>,
    /// One of the platform locales.
    #[garde(custom(valid_locale))]
    pub locale: Option<String>,
    /// Finalized `avatar` upload to claim as the new avatar.
    #[garde(skip)]
    pub avatar_upload_id: Option<uuid::Uuid>,
}

/// Admin listing row (includes email + status — platform:read gated).
#[derive(Debug, Serialize, ToSchema)]
pub struct AdminUser {
    pub id: UserId,
    pub username: String,
    pub email: String,
    pub display_name: String,
    /// `active` or `disabled`.
    pub status: String,
    pub roles: Vec<String>,
    pub created_at_unix: i64,
}

impl From<ab_domain::identity::rbac_admin::AdminUser> for AdminUser {
    fn from(u: ab_domain::identity::rbac_admin::AdminUser) -> Self {
        Self {
            id: u.id,
            username: u.username,
            email: u.email,
            display_name: u.display_name,
            status: u.status,
            roles: u.roles,
            created_at_unix: u.created_at,
        }
    }
}

/// Keyset page (ARCHITECTURE §6): pass `next_cursor` back as `cursor`.
#[derive(Debug, Serialize, ToSchema)]
pub struct AdminUserPage {
    pub items: Vec<AdminUser>,
    pub next_cursor: Option<UserId>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct AdminUserListQuery {
    /// Substring filter over username/display name/email.
    pub q: Option<String>,
    pub cursor: Option<UserId>,
    /// 1..=100, default 20.
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SetUserStatusRequest {
    /// `true` disables the account and revokes every live session.
    #[garde(skip)]
    pub disabled: bool,
}

// garde's custom-validator contract fixes this signature (&field, &context).
#[allow(clippy::ref_option, clippy::trivially_copy_pass_by_ref)]
fn valid_locale(value: &Option<String>, _ctx: &()) -> garde::Result {
    match value.as_deref() {
        None | Some("ru-RU" | "kk-KZ" | "en-US") => Ok(()),
        Some(other) => Err(garde::Error::new(format!(
            "unsupported locale '{other}' (ru-RU, kk-KZ, en-US)"
        ))),
    }
}
