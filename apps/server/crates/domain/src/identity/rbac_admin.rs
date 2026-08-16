//! Role administration (slice 1.8 core).
//!
//! List roles, assign/unassign user roles. Every mutation bumps the user's
//! `rbac_version` and rewrites their live sessions so new grants apply
//! immediately — request paths never re-check Postgres (ARCHITECTURE §7).

use ab_core::id::UserId;
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, Result};
use sqlx::PgPool;

use crate::identity::Actor;
use crate::identity::sessions::SessionStore;

const MANAGE_ROLES: Permission = Permission {
    resource: ResourceType::Role,
    action: Action::Manage,
    scope: Some(Scope::Platform),
};

/// Admin-only user administration (only the wildcard grants these).
const READ_PLATFORM: Permission = Permission {
    resource: ResourceType::Platform,
    action: Action::Read,
    scope: Some(Scope::Platform),
};
const MANAGE_PLATFORM: Permission = Permission {
    resource: ResourceType::Platform,
    action: Action::Manage,
    scope: Some(Scope::Platform),
};

pub use ab_db::identity::AdminUserRow as AdminUser;

#[derive(Debug)]
pub struct RoleWithGrants {
    pub slug: String,
    pub display_name_key: String,
    pub description_key: String,
    pub priority: i32,
    pub is_system: bool,
    pub permissions: Vec<String>,
}

#[derive(Clone)]
pub struct RbacAdminService {
    pool: PgPool,
    sessions: SessionStore,
}

impl RbacAdminService {
    #[must_use]
    pub const fn new(pool: PgPool, sessions: SessionStore) -> Self {
        Self { pool, sessions }
    }

    pub async fn list_roles(&self, actor: &Actor) -> Result<Vec<RoleWithGrants>> {
        actor.require(Permission {
            resource: ResourceType::Role,
            action: Action::Read,
            scope: Some(Scope::Platform),
        })?;
        let mut out = Vec::new();
        for role in ab_db::identity::list_roles(&self.pool).await? {
            let permissions = ab_db::identity::role_grants(&self.pool, role.id).await?;
            out.push(RoleWithGrants {
                slug: role.slug,
                display_name_key: role.display_name_key,
                description_key: role.description_key,
                priority: role.priority,
                is_system: role.is_system,
                permissions,
            });
        }
        Ok(out)
    }

    pub async fn assign_role(&self, actor: &Actor, user_id: UserId, slug: &str) -> Result<()> {
        actor.require(MANAGE_ROLES)?;
        let role = ab_db::identity::find_role_by_slug(&self.pool, slug)
            .await?
            .ok_or_else(|| Error::not_found("role"))?;
        let version = ab_db::identity::assign_role(&self.pool, user_id, role.id)
            .await?
            .ok_or_else(|| Error::not_found("user"))?;
        self.propagate(user_id, version).await?;
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(user_id),
            "role-assigned",
            None,
            None,
            serde_json::json!({ "role": slug, "by": actor.user_id }),
        )
        .await
    }

    pub async fn unassign_role(&self, actor: &Actor, user_id: UserId, slug: &str) -> Result<()> {
        actor.require(MANAGE_ROLES)?;
        // Last-admin guard: the platform must always keep one admin.
        if slug == "admin" && ab_db::identity::count_role_holders(&self.pool, "admin").await? <= 1 {
            return Err(Error::conflict("cannot remove the last admin"));
        }
        let role = ab_db::identity::find_role_by_slug(&self.pool, slug)
            .await?
            .ok_or_else(|| Error::not_found("role"))?;
        let version = ab_db::identity::unassign_role(&self.pool, user_id, role.id)
            .await?
            .ok_or_else(|| Error::not_found("user"))?;
        self.propagate(user_id, version).await?;
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(user_id),
            "role-unassigned",
            None,
            None,
            serde_json::json!({ "role": slug, "by": actor.user_id }),
        )
        .await
    }

    /// Create a custom role (system roles are seed-managed).
    pub async fn create_role(
        &self,
        actor: &Actor,
        slug: &str,
        display_name: &str,
        description: &str,
        priority: i32,
    ) -> Result<()> {
        actor.require(MANAGE_ROLES)?;
        let created =
            ab_db::identity::insert_role(&self.pool, slug, display_name, description, priority)
                .await?;
        if created.is_none() {
            return Err(Error::conflict("role slug is taken"));
        }
        ab_db::identity::insert_auth_audit(
            &self.pool,
            None,
            "role-created",
            None,
            None,
            serde_json::json!({ "role": slug, "by": actor.user_id }),
        )
        .await
    }

    /// Metadata update — custom roles only (404 covers system + unknown).
    pub async fn update_role(
        &self,
        actor: &Actor,
        slug: &str,
        display_name: Option<&str>,
        description: Option<&str>,
        priority: Option<i32>,
    ) -> Result<()> {
        actor.require(MANAGE_ROLES)?;
        if !ab_db::identity::update_role(&self.pool, slug, display_name, description, priority)
            .await?
        {
            return Err(Error::not_found("custom role"));
        }
        Ok(())
    }

    /// Delete a custom role; every holder's sessions lose it immediately.
    pub async fn delete_role(&self, actor: &Actor, slug: &str) -> Result<()> {
        actor.require(MANAGE_ROLES)?;
        let role = ab_db::identity::find_role_by_slug(&self.pool, slug)
            .await?
            .ok_or_else(|| Error::not_found("role"))?;
        if role.is_system {
            return Err(Error::forbidden("system roles cannot be deleted"));
        }
        let members = ab_db::identity::list_role_member_ids(&self.pool, role.id).await?;
        if !ab_db::identity::delete_role(&self.pool, role.id).await? {
            return Err(Error::not_found("custom role"));
        }
        self.propagate_all(&members).await?;
        ab_db::identity::insert_auth_audit(
            &self.pool,
            None,
            "role-deleted",
            None,
            None,
            serde_json::json!({ "role": slug, "by": actor.user_id }),
        )
        .await
    }

    /// Replace a custom role's grant set; holders' sessions update live.
    pub async fn set_role_permissions(
        &self,
        actor: &Actor,
        slug: &str,
        permissions: Vec<String>,
    ) -> Result<()> {
        actor.require(MANAGE_ROLES)?;
        // Every grant string must parse against the closed registry; a bad
        // one is caller input here, not deploy drift.
        if let Err(err) =
            ab_core::permission::PermissionSet::parse(permissions.iter().map(String::as_str))
        {
            return Err(Error::validation(vec![ab_core::FieldError {
                field: "permissions".into(),
                code: "invalid".into(),
                message: err.to_string(),
            }]));
        }
        let role = ab_db::identity::find_role_by_slug(&self.pool, slug)
            .await?
            .ok_or_else(|| Error::not_found("role"))?;
        if role.is_system {
            return Err(Error::forbidden(
                "system role grants are managed by migration",
            ));
        }
        ab_db::identity::replace_role_permissions(&self.pool, role.id, &permissions).await?;
        let members = ab_db::identity::list_role_member_ids(&self.pool, role.id).await?;
        self.propagate_all(&members).await?;
        ab_db::identity::insert_auth_audit(
            &self.pool,
            None,
            "role-permissions-changed",
            None,
            None,
            serde_json::json!({ "role": slug, "by": actor.user_id, "count": permissions.len() }),
        )
        .await
    }

    /// Admin listing of all users with their roles (keyset, newest first).
    pub async fn list_users(
        &self,
        actor: &Actor,
        q: Option<&str>,
        cursor: Option<UserId>,
        limit: i64,
    ) -> Result<(Vec<AdminUser>, Option<UserId>)> {
        actor.require(READ_PLATFORM)?;
        let limit = limit.clamp(1, 100);
        let mut rows = ab_db::identity::list_users(&self.pool, q, cursor, limit + 1).await?;
        let next = if i64::try_from(rows.len()).unwrap_or(i64::MAX) > limit {
            rows.truncate(usize::try_from(limit).unwrap_or(usize::MAX));
            rows.last().map(|u| u.id)
        } else {
            None
        };
        Ok((rows, next))
    }

    /// Disable (revoking every live session) or re-enable an account.
    pub async fn set_user_status(
        &self,
        actor: &Actor,
        user_id: UserId,
        disabled: bool,
    ) -> Result<()> {
        actor.require(MANAGE_PLATFORM)?;
        if actor.user_id == user_id {
            return Err(Error::conflict("cannot disable your own account"));
        }
        let status = if disabled { "disabled" } else { "active" };
        if !ab_db::identity::set_user_status(&self.pool, user_id, status).await? {
            return Err(Error::not_found("user"));
        }
        if disabled {
            let revoked = self.sessions.revoke_all(user_id).await?;
            tracing::info!(%user_id, revoked, "account disabled, sessions revoked");
        }
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(user_id),
            if disabled {
                "account-disabled"
            } else {
                "account-enabled"
            },
            None,
            None,
            serde_json::json!({ "by": actor.user_id }),
        )
        .await
    }

    /// Bump + rewrite sessions for every affected user (role-level change).
    async fn propagate_all(&self, user_ids: &[UserId]) -> Result<()> {
        for user_id in user_ids {
            if let Some(version) = ab_db::identity::bump_rbac_version(&self.pool, *user_id).await? {
                self.propagate(*user_id, version).await?;
            }
        }
        Ok(())
    }

    /// Push the user's fresh grants into every live session.
    async fn propagate(&self, user_id: UserId, rbac_version: i64) -> Result<()> {
        let (roles, permissions) = ab_db::identity::load_user_grants(&self.pool, user_id).await?;
        let updated = self
            .sessions
            .rewrite_user_sessions(user_id, &roles, &permissions, rbac_version)
            .await?;
        tracing::info!(%user_id, rbac_version, sessions = updated, "rbac change propagated");
        Ok(())
    }
}
