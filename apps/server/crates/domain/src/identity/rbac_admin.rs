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
