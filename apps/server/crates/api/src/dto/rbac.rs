use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct Role {
    pub slug: String,
    /// i18n key (frontend catalogs own the display strings of seeded roles).
    pub display_name_key: String,
    pub description_key: String,
    /// Raw display text - custom roles only; `null` on seeded roles.
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub priority: i32,
    pub is_system: bool,
    /// Grants `resource:action[:scope]`. Assessment rights are the
    /// `assessment` resource; `quiz` / `exam` are legacy names kept as
    /// stored on migrated roles and grant nothing (S-10).
    pub permissions: Vec<String>,
    /// Optimistic lock: `If-Match` on `PATCH` and the permissions `PUT`.
    pub version: i32,
    /// What the caller may do to this role now.
    pub allowed_actions: Vec<ab_domain::identity::rbac_admin::RoleAction>,
}

impl Role {
    pub fn for_actor(
        r: ab_domain::identity::rbac_admin::RoleWithGrants,
        actor: &ab_domain::identity::Actor,
    ) -> Self {
        Self {
            allowed_actions: ab_domain::identity::RbacAdminService::role_actions(actor, &r),
            slug: r.slug,
            display_name_key: r.display_name_key,
            description_key: r.description_key,
            display_name: r.display_name,
            description: r.description,
            priority: r.priority,
            is_system: r.is_system,
            permissions: r.permissions,
            version: r.version,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AssignRoleRequest {
    /// Role slug, e.g. `instructor`.
    #[garde(length(min = 1, max = 64))]
    #[schema(min_length = 1, max_length = 64)]
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
    #[schema(
        min_length = 1,
        max_length = 64,
        pattern = r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
    )]
    pub slug: String,
    /// Blank → 422 `required` (trimmed in the service).
    #[garde(length(chars, max = 200))]
    #[schema(max_length = 200)]
    pub display_name: String,
    #[garde(length(chars, max = 1000))]
    #[schema(max_length = 1000)]
    pub description: Option<String>,
    /// Ordering weight (system roles: guest 0 … admin 100).
    #[garde(range(min = 0, max = 99))]
    #[schema(minimum = 0, maximum = 99)]
    pub priority: i32,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateRoleRequest {
    #[garde(inner(length(max = 200)))]
    #[schema(max_length = 200)]
    pub display_name: Option<String>,
    #[garde(inner(length(max = 1000)))]
    #[schema(max_length = 1000)]
    pub description: Option<String>,
    #[garde(inner(range(min = 0, max = 99)))]
    #[schema(minimum = 0, maximum = 99)]
    pub priority: Option<i32>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SetRolePermissionsRequest {
    /// Full replacement grant set; every entry must parse against the
    /// permission registry (`resource:action[:scope]`). Assessment rights
    /// are the `assessment` resource (`quiz` / `exam` still parse but grant
    /// nothing).
    #[garde(length(max = 200), inner(length(min = 1, max = 128)))]
    #[schema(max_items = 200)]
    pub permissions: Vec<String>,
}
