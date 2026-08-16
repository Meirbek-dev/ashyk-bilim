use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct Role {
    pub slug: String,
    /// i18n key (frontend catalogs own the display strings).
    pub display_name_key: String,
    pub description_key: String,
    pub priority: i32,
    pub is_system: bool,
    pub permissions: Vec<String>,
}

impl From<ab_domain::identity::rbac_admin::RoleWithGrants> for Role {
    fn from(r: ab_domain::identity::rbac_admin::RoleWithGrants) -> Self {
        Self {
            slug: r.slug,
            display_name_key: r.display_name_key,
            description_key: r.description_key,
            priority: r.priority,
            is_system: r.is_system,
            permissions: r.permissions,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AssignRoleRequest {
    /// Role slug, e.g. `instructor`.
    #[garde(length(min = 1, max = 64))]
    pub role: String,
}
