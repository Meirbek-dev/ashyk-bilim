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

// garde's custom-validator contract fixes this signature (&field, &context).
#[allow(clippy::trivially_copy_pass_by_ref)]
fn kebab_slug(value: &str, _ctx: &()) -> garde::Result {
    if value
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !value.starts_with('-')
        && !value.ends_with('-')
    {
        Ok(())
    } else {
        Err(garde::Error::new("slug must be kebab-case ascii"))
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateRoleRequest {
    /// Kebab-case slug, e.g. `teaching-assistant`.
    #[garde(length(min = 1, max = 64), custom(kebab_slug))]
    pub slug: String,
    #[garde(length(min = 1, max = 200))]
    pub display_name: String,
    #[garde(length(max = 1000))]
    pub description: Option<String>,
    /// Ordering weight (system roles: guest 0 … admin 100).
    #[garde(range(min = 0, max = 99))]
    pub priority: i32,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateRoleRequest {
    #[garde(inner(length(min = 1, max = 200)))]
    pub display_name: Option<String>,
    #[garde(inner(length(max = 1000)))]
    pub description: Option<String>,
    #[garde(inner(range(min = 0, max = 99)))]
    pub priority: Option<i32>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SetRolePermissionsRequest {
    /// Full replacement grant set; every entry must parse against the
    /// permission registry (`resource:action[:scope]`).
    #[garde(length(max = 200), inner(length(min = 1, max = 128)))]
    pub permissions: Vec<String>,
}
