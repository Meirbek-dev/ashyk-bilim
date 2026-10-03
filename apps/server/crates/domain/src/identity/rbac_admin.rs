//! Role administration (slice 1.8 core).
//!
//! List roles, assign/unassign user roles. Every mutation bumps the user's
//! `rbac_version` in its own transaction and then rewrites their live
//! sessions so new grants apply immediately; a rewrite that fails (or never
//! runs) is caught on the request path by [`SessionStore::fenced`] (BUG-345).

use ab_core::id::UserId;
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, ErrorCode, Result};
use sqlx::PgPool;

use crate::identity::Actor;
use crate::identity::sessions::SessionStore;
use crate::progress::ProgressProjector;

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
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub priority: i32,
    pub is_system: bool,
    pub permissions: Vec<String>,
    /// `If-Match` lock (metadata and grant-set writes bump it).
    pub version: i32,
}

/// What the caller may do to a user in the admin directory (`AdminUser.allowed_actions`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum AdminUserAction {
    /// Assign / unassign roles.
    ManageRoles,
    /// Disable an active account (never one's own).
    Disable,
    /// Re-enable a disabled account.
    Enable,
}

/// What the caller may do to a role (`Role.allowed_actions`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RoleAction {
    /// Assign it to / remove it from users.
    Assign,
    /// Metadata (custom roles only).
    Update,
    /// Custom roles only.
    Delete,
    /// Replace the grant set (custom roles only).
    SetPermissions,
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

    /// `role:manage:platform`.
    /// UX-311: the write handlers check it before reading the body.
    pub fn require_manage_roles(actor: &Actor) -> Result<()> {
        actor.require(MANAGE_ROLES)
    }

    /// `platform:manage:platform` - account creation and status
    /// UX-311: the write handlers check it before reading the body.
    pub fn require_manage_platform(actor: &Actor) -> Result<()> {
        actor.require(MANAGE_PLATFORM)
    }

    /// The user-admin gates as a list: roles (`role:manage`), status
    /// (`platform:manage`, never the caller's own account).
    #[must_use]
    pub fn user_actions(actor: &Actor, user: &AdminUser) -> Vec<AdminUserAction> {
        let platform = Self::require_manage_platform(actor).is_ok();
        let active = user.status == "active";
        let own = user.id == actor.user_id;
        [
            (
                AdminUserAction::ManageRoles,
                Self::require_manage_roles(actor).is_ok(),
            ),
            (AdminUserAction::Disable, platform && active && !own),
            (AdminUserAction::Enable, platform && !active),
        ]
        .into_iter()
        .filter_map(|(action, ok)| ok.then_some(action))
        .collect()
    }

    /// The role-admin gates as a list: `role:manage`, and system roles
    /// are seed-managed (only assignable).
    #[must_use]
    pub fn role_actions(actor: &Actor, role: &RoleWithGrants) -> Vec<RoleAction> {
        if Self::require_manage_roles(actor).is_err() {
            return Vec::new();
        }
        if role.is_system {
            return vec![RoleAction::Assign];
        }
        vec![
            RoleAction::Assign,
            RoleAction::Update,
            RoleAction::Delete,
            RoleAction::SetPermissions,
        ]
    }

    /// `role:read:platform` - the role listing (`admin.roles`).
    pub fn require_read_roles(actor: &Actor) -> Result<()> {
        actor.require(Permission {
            resource: ResourceType::Role,
            action: Action::Read,
            scope: Some(Scope::Platform),
        })
    }

    /// `platform:read:platform` - the user directory (`admin.users`).
    pub fn require_read_users(actor: &Actor) -> Result<()> {
        actor.require(READ_PLATFORM)
    }

    pub async fn list_roles(&self, actor: &Actor) -> Result<Vec<RoleWithGrants>> {
        Self::require_read_roles(actor)?;
        let mut out = Vec::new();
        for role in ab_db::identity::list_roles(&self.pool).await? {
            out.push(self.with_grants(role).await?);
        }
        Ok(out)
    }

    /// One role by slug (`role:read:platform`; 404 unknown).
    pub async fn get_role(&self, actor: &Actor, slug: &str) -> Result<RoleWithGrants> {
        Self::require_read_roles(actor)?;
        let role = ab_db::identity::find_role_by_slug(&self.pool, slug)
            .await?
            .ok_or_else(|| Error::not_found("role"))?;
        self.with_grants(role).await
    }

    async fn with_grants(&self, role: ab_db::identity::RoleRow) -> Result<RoleWithGrants> {
        let permissions = ab_db::identity::role_grants(&self.pool, role.id).await?;
        Ok(RoleWithGrants {
            slug: role.slug,
            display_name_key: role.display_name_key,
            description_key: role.description_key,
            display_name: role.display_name,
            description: role.description,
            priority: role.priority,
            is_system: role.is_system,
            permissions,
            version: role.version,
        })
    }

    /// One account in the admin directory (`platform:read:platform`).
    pub async fn get_user(&self, actor: &Actor, user_id: UserId) -> Result<AdminUser> {
        Self::require_read_users(actor)?;
        ab_db::identity::get_admin_user(&self.pool, user_id)
            .await?
            .ok_or_else(|| Error::not_found("user"))
    }

    pub async fn assign_role(&self, actor: &Actor, user_id: UserId, slug: &str) -> Result<()> {
        actor.require(MANAGE_ROLES)?;
        let role = ab_db::identity::find_role_by_slug(&self.pool, slug)
            .await?
            .ok_or_else(|| Error::not_found("role"))?;
        let version = ab_db::identity::assign_role(&self.pool, user_id, role.id)
            .await?
            .ok_or_else(|| Error::not_found("user"))?;
        self.propagate(user_id, version).await;
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
        // Unknown user or a role the user does not hold → 404 (before the
        // last-admin guard, which must only fire for an actual admin).
        let (roles, _) = ab_db::identity::load_user_grants(&self.pool, user_id).await?;
        if !roles.iter().any(|r| r == slug) {
            return Err(Error::not_found("role assignment"));
        }
        // Last-admin guard: some *other* active admin must remain (the
        // target's own status is irrelevant, BUG-144); the count locks the
        // role row so concurrent guards serialise (UX-135).
        let mut tx = self.pool.begin().await?;
        if slug == "admin"
            && ab_db::identity::count_other_active_role_holders(&mut tx, "admin", user_id).await?
                == 0
        {
            return Err(Error::app(
                ErrorCode::LastAdmin,
                "cannot remove the last admin",
            ));
        }
        let version = ab_db::identity::unassign_role(&mut tx, user_id, role.id)
            .await?
            .ok_or_else(|| Error::not_found("user"))?;
        tx.commit().await?;
        self.propagate(user_id, version).await;
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
        description: Option<&str>,
        priority: i32,
    ) -> Result<()> {
        actor.require(MANAGE_ROLES)?;
        let display_name = trimmed_display_name(display_name)?;
        // UX-183: the description is shown next to the name - same strip.
        let description = description.map(ab_core::strip_controls_multiline);
        let created = ab_db::identity::insert_role(
            &self.pool,
            slug,
            &display_name,
            description.as_deref(),
            priority,
        )
        .await?;
        if created.is_none() {
            return Err(Error::app(ErrorCode::RoleSlugTaken, "role slug is taken"));
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

    /// Metadata update - custom roles only (404 covers system + unknown).
    pub async fn update_role(
        &self,
        actor: &Actor,
        slug: &str,
        display_name: Option<&str>,
        description: Option<&str>,
        priority: Option<i32>,
    ) -> Result<()> {
        actor.require(MANAGE_ROLES)?;
        let display_name = display_name.map(trimmed_display_name).transpose()?;
        let description = description.map(ab_core::strip_controls_multiline);
        if !ab_db::identity::update_role(
            &self.pool,
            slug,
            display_name.as_deref(),
            description.as_deref(),
            priority,
        )
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
        let holders = ab_db::identity::delete_role(&self.pool, role.id)
            .await?
            .ok_or_else(|| Error::not_found("custom role"))?;
        self.propagate_all(&holders).await;
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
        // one is caller input here, not deploy drift - name it, without the
        // `internal:` prefix the parser's error code would render.
        let errors: Vec<ab_core::FieldError> = permissions
            .iter()
            .filter_map(|grant| {
                ab_core::permission::Grant::parse(grant)
                    .err()
                    .map(|e| (grant, e))
            })
            .map(|(grant, err)| ab_core::FieldError {
                field: "permissions".into(),
                code: "invalid".into(),
                message: match err {
                    Error::App { message, .. } => format!("{grant}: {message}"),
                    other => format!("{grant}: {other}"),
                },
            })
            .collect();
        if !errors.is_empty() {
            return Err(Error::validation(errors));
        }
        let role = ab_db::identity::find_role_by_slug(&self.pool, slug)
            .await?
            .ok_or_else(|| Error::not_found("role"))?;
        if role.is_system {
            return Err(Error::forbidden(
                "system role grants are managed by migration",
            ));
        }
        let holders = ab_db::identity::replace_role_permissions(&self.pool, role.id, &permissions)
            .await?
            .ok_or_else(|| Error::not_found("custom role"))?;
        self.propagate_all(&holders).await;
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

    /// Admin listing of all users with their roles (keyset; newest first
    /// unless `filter.sort` is `name`).
    pub async fn list_users(
        &self,
        actor: &Actor,
        filter: ab_db::identity::UserFilter<'_>,
        cursor: Option<UserId>,
        limit: i64,
    ) -> Result<(Vec<AdminUser>, Option<UserId>)> {
        Self::require_read_users(actor)?;
        let limit = ab_core::page_limit(limit, 100)?;
        let mut rows = ab_db::identity::list_users(&self.pool, filter, cursor, limit + 1).await?;
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
            return Err(Error::app(
                ErrorCode::SelfDisable,
                "cannot disable your own account",
            ));
        }
        // BUG-377: read before the transaction takes its connection.
        let roles = if disabled {
            ab_db::identity::load_user_grants(&self.pool, user_id)
                .await?
                .0
        } else {
            Vec::new()
        };
        let mut tx = self.pool.begin().await?;
        if roles.iter().any(|r| r == "admin")
            && ab_db::identity::count_other_active_role_holders(&mut tx, "admin", user_id).await?
                == 0
        {
            return Err(Error::app(
                ErrorCode::LastAdmin,
                "cannot disable the last admin",
            ));
        }
        let status = if disabled { "disabled" } else { "active" };
        if !ab_db::identity::set_user_status(&mut tx, user_id, status).await? {
            return Err(Error::not_found("user"));
        }
        tx.commit().await?;
        // The status flip bumped `rbac_version`: a session this revoke
        // misses is ended by the request-path fence (BUG-345).
        if disabled {
            match self.sessions.revoke_all(user_id).await {
                Ok(revoked) => {
                    tracing::info!(%user_id, revoked, "account disabled, sessions revoked");
                }
                Err(error) => {
                    tracing::warn!(%user_id, %error, "session revoke failed; sessions stay fenced");
                }
            }
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

    /// Rewrite sessions for every holder already bumped by the role-level
    /// change. The holders' re-projections run concurrently under one shared
    /// inline wait, never one per holder back to back (UX-210); those still
    /// busy are left to their queued jobs.
    async fn propagate_all(&self, holders: &[(UserId, i64)]) {
        for &(user_id, version) in holders {
            self.push_grants(user_id, version).await;
        }
        let projector = ProgressProjector::new(self.pool.clone());
        futures::future::join_all(
            holders
                .iter()
                .map(|&(user_id, _)| projector.after_staff_change(user_id, None)),
        )
        .await;
    }

    /// [`Self::push_grants`], then re-project the courses they hold a run
    /// in: a grant change can move them off (or onto) every course's staff
    /// (`is_course_staff`, BUG-291).
    async fn propagate(&self, user_id: UserId, rbac_version: i64) {
        self.push_grants(user_id, rbac_version).await;
        ProgressProjector::new(self.pool.clone())
            .after_staff_change(user_id, None)
            .await;
    }

    /// Push the user's fresh grants into every live session. Best-effort:
    /// the change is committed with its `rbac_version` bump, which fences
    /// every session this misses ([`SessionStore::fenced`], BUG-345) - a
    /// failure is logged, never turned into an error for a change that
    /// already holds (and whose audit row must still be written).
    async fn push_grants(&self, user_id: UserId, rbac_version: i64) {
        let pushed = async {
            let (roles, permissions) =
                ab_db::identity::load_user_grants(&self.pool, user_id).await?;
            self.sessions
                .rewrite_user_sessions(user_id, &roles, &permissions, rbac_version)
                .await
        }
        .await;
        match pushed {
            Ok(sessions) => {
                tracing::info!(%user_id, rbac_version, sessions, "rbac change propagated");
            }
            Err(error) => {
                tracing::warn!(%user_id, rbac_version, %error, "rbac session rewrite failed; stale sessions stay fenced");
            }
        }
    }
}

/// Trimmed display name without control characters, or 422
/// `display_name`/`required` when blank (UX-163).
fn trimmed_display_name(name: &str) -> Result<String> {
    ab_core::required_text("display_name", name)
}
