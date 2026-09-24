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
    /// TOTP enrolled on the account (`false` where no session is involved,
    /// e.g. the registration answer).
    pub mfa_enabled: bool,
    /// The account has a password to change (`false`: Google-only — no
    /// password can be set through the API — or no session involved). UX-188.
    pub has_password: bool,
    /// A Google identity is linked; Google sign-in never asks for the TOTP
    /// code.
    pub google_linked: bool,
}

impl UserProfile {
    pub(crate) fn for_actor(
        p: ab_domain::identity::users::Profile,
        actor: &ab_domain::identity::Actor,
    ) -> Self {
        Self {
            mfa_enabled: actor.mfa_enabled,
            has_password: actor.has_password,
            google_linked: actor.google_linked,
            ..Self::from(p)
        }
    }
}

/// No session involved (registration / admin answers): the session flags are `false`.
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
            mfa_enabled: false,
            has_password: false,
            google_linked: false,
        }
    }
}

/// Admin account creation (`POST /users`). No `Debug` — may carry a
/// password. Without one the account is IdP-only (Google sign-in).
#[derive(Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateUserRequest {
    #[garde(length(min = 3, max = 48), pattern(r"^[A-Za-z0-9._-]+$"))]
    pub username: String,
    #[garde(email, length(max = 320))]
    pub email: String,
    #[garde(inner(length(min = 8, max = 200)))]
    pub password: Option<String>,
    #[garde(length(chars, min = 1, max = 100))]
    pub first_name: String,
    #[garde(length(chars, min = 1, max = 100))]
    pub last_name: String,
    /// Extra role slugs on top of the default `user`.
    #[garde(inner(length(max = 10)))]
    pub roles: Option<Vec<String>>,
}

/// Partial update; omitted fields are unchanged.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateProfileRequest {
    #[garde(length(chars, max = 120))]
    pub display_name: Option<String>,
    #[garde(length(chars, max = 2000))]
    pub bio: Option<String>,
    /// One of the platform locales.
    #[garde(custom(valid_locale))]
    pub locale: Option<String>,
    /// Finalized `avatar` upload to claim as the new avatar; `null`
    /// removes the current one.
    #[garde(skip)]
    #[serde(default, deserialize_with = "super::double_option")]
    #[schema(value_type = Option<uuid::Uuid>)]
    pub avatar_upload_id: Option<Option<uuid::Uuid>>,
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

#[derive(Debug, Deserialize, ToSchema)]
pub struct UserCoursesQuery {
    pub cursor: Option<ab_core::id::CourseId>,
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
