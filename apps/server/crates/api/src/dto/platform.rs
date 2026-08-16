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
}

impl From<ab_domain::catalog::platform::Platform> for Platform {
    fn from(p: ab_domain::catalog::platform::Platform) -> Self {
        Self {
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
    #[garde(inner(length(min = 1, max = 500)))]
    pub name: Option<String>,
    #[garde(inner(length(max = 5000)))]
    pub description: Option<String>,
    #[garde(inner(length(max = 20_000)))]
    pub about: Option<String>,
    #[garde(inner(length(min = 3, max = 320)))]
    pub email: Option<String>,
    #[garde(inner(length(max = 500)))]
    pub label: Option<String>,
    /// Finalized `platform-logo` upload to claim as the new logo.
    #[garde(skip)]
    pub logo_upload_id: Option<uuid::Uuid>,
    /// Finalized `platform-thumbnail` upload to claim.
    #[garde(skip)]
    pub thumbnail_upload_id: Option<uuid::Uuid>,
}
