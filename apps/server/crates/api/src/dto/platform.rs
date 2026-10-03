use ab_domain::identity::Actor;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct Platform {
    pub name: String,
    pub description: String,
    pub about: String,
    pub email: String,
    pub label: Option<String>,
    /// Public-bucket storage keys (served via the CDN /content route).
    pub logo_key: Option<String>,
    pub thumbnail_key: Option<String>,
    /// Optimistic lock: `If-Match` on `PATCH` (stale → 412); the `ETag` of `GET`.
    pub version: i32,
    /// What the caller may do to the settings (empty for anonymous readers).
    pub allowed_actions: Vec<ab_domain::catalog::platform::PlatformAction>,
}

impl Platform {
    pub fn for_actor(p: ab_domain::catalog::platform::Platform, actor: &Actor) -> Self {
        Self {
            allowed_actions: ab_domain::catalog::PlatformService::allowed_actions(actor),
            version: p.version,
            name: p.name,
            description: p.description,
            about: p.about,
            email: p.email,
            label: p.label,
            logo_key: p.logo_key,
            thumbnail_key: p.thumbnail_key,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdatePlatformRequest {
    /// Blank → 422 `required` (trimmed in the service).
    #[garde(inner(length(max = 500)))]
    #[schema(max_length = 500)]
    pub name: Option<String>,
    #[garde(inner(length(max = 5000)))]
    #[schema(max_length = 5000)]
    pub description: Option<String>,
    #[garde(inner(length(max = 20_000)))]
    #[schema(max_length = 20_000)]
    pub about: Option<String>,
    #[garde(inner(email, length(max = 320)))]
    #[schema(max_length = 320)]
    pub email: Option<String>,
    /// `null` clears the label; blank is stored as cleared too (UX-135).
    #[garde(inner(inner(length(max = 500))))]
    #[serde(default, deserialize_with = "super::double_option")]
    #[schema(value_type = Option<String>)]
    #[schema(max_length = 500)]
    pub label: Option<Option<String>>,
    /// Finalized `platform-logo` upload to claim as the new logo.
    #[garde(skip)]
    pub logo_upload_id: Option<uuid::Uuid>,
    /// Finalized `platform-thumbnail` upload to claim.
    #[garde(skip)]
    pub thumbnail_upload_id: Option<uuid::Uuid>,
}
