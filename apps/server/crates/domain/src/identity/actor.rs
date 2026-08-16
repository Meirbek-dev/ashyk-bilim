//! The authenticated caller.
//!
//! Every mutating domain service method takes an [`Actor`] and calls
//! [`Actor::require`] before touching data — enforcement lives in the domain
//! layer, not in HTTP handlers (ARCHITECTURE §7).

use ab_core::id::UserId;
use ab_core::permission::{Permission, PermissionSet};
use ab_core::{Error, Result};

use crate::identity::sessions::SessionRecord;

#[derive(Debug, Clone)]
pub struct Actor {
    pub user_id: UserId,
    pub session_id: String,
    pub roles: Vec<String>,
    pub permissions: PermissionSet,
    /// Raw grant strings — exposed to the frontend for client-side gating
    /// (mirrors the legacy `Session.permissions: string[]` contract).
    pub permission_strings: Vec<String>,
    pub rbac_version: i64,
}

impl Actor {
    /// Build from a validated session record. Fails only if the stored grant
    /// strings no longer parse (registry drift — a deploy-time bug).
    pub fn from_session(session_id: String, record: &SessionRecord) -> Result<Self> {
        Ok(Self {
            user_id: record.user_id,
            session_id,
            roles: record.roles.clone(),
            permissions: PermissionSet::parse(record.permissions.iter().map(String::as_str))?,
            permission_strings: record.permissions.clone(),
            rbac_version: record.rbac_version,
        })
    }

    /// The single enforcement point: `actor.require(perm!(Course, Update, Own))?`.
    pub fn require(&self, permission: Permission) -> Result<()> {
        if self.permissions.grants(&permission) {
            Ok(())
        } else {
            Err(Error::forbidden(format!(
                "missing permission {}:{}{}",
                permission.resource.as_str(),
                permission.action.as_str(),
                permission
                    .scope
                    .map(|s| format!(":{}", s.as_str()))
                    .unwrap_or_default(),
            )))
        }
    }

    #[must_use]
    pub fn has(&self, permission: Permission) -> bool {
        self.permissions.grants(&permission)
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use ab_core::permission::{Action, ResourceType, Scope};

    fn record(perms: &[&str]) -> SessionRecord {
        SessionRecord {
            user_id: UserId::new(),
            zitadel_user_id: "z-1".into(),
            zitadel_session_id: "zs-1".into(),
            zitadel_session_token: "tok".into(),
            roles: vec!["instructor".into()],
            permissions: perms.iter().map(ToString::to_string).collect(),
            rbac_version: 1,
            created_at_unix: 0,
            last_seen_unix: 0,
            ip: None,
            user_agent: None,
        }
    }

    #[test]
    fn require_enforces_grants() {
        let actor = Actor::from_session("s-1".into(), &record(&["course:update:own"])).unwrap();
        let allowed = Permission {
            resource: ResourceType::Course,
            action: Action::Update,
            scope: Some(Scope::Own),
        };
        let denied = Permission {
            resource: ResourceType::Course,
            action: Action::Delete,
            scope: Some(Scope::Own),
        };
        actor.require(allowed).unwrap();
        let err = actor.require(denied).unwrap_err();
        assert_eq!(err.code(), ab_core::ErrorCode::Forbidden);
    }
}
