//! The RBAC permission model, ported from the legacy `resource:action:scope`
//! string scheme (`apps/api/src/security/rbac.py`, `src/db/permission_enums.py`).
//!
//! Scaffold state: types + parsing + wildcard matching with basic tests.
//! Slice 1.8 verifies the matching semantics against the legacy implementation
//! case-by-case and extends the test matrix before any endpoint relies on it.

use serde::{Deserialize, Serialize};

use crate::error::{Error, ErrorCode, Result};

macro_rules! string_enum {
    ($name:ident { $($variant:ident => $s:literal),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(rename_all = "snake_case")]
        pub enum $name {
            $($variant),+
        }

        impl $name {
            #[must_use]
            pub const fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $s),+ }
            }

            pub fn parse(s: &str) -> Result<Self> {
                match s {
                    $($s => Ok(Self::$variant),)+
                    other => Err(Error::app(
                        ErrorCode::Internal,
                        format!(concat!("unknown ", stringify!($name), ": {}"), other),
                    )),
                }
            }
        }
    };
}

string_enum!(Action {
    Create => "create",
    Read => "read",
    Update => "update",
    Delete => "delete",
    Manage => "manage",
    Moderate => "moderate",
    Export => "export",
    Grade => "grade",
    Submit => "submit",
    Author => "author",
    Publish => "publish",
    Enroll => "enroll",
});

string_enum!(ResourceType {
    Platform => "platform",
    Course => "course",
    Chapter => "chapter",
    Activity => "activity",
    Quiz => "quiz",
    User => "user",
    Usergroup => "usergroup",
    Collection => "collection",
    Role => "role",
    Certificate => "certificate",
    Discussion => "discussion",
    File => "file",
    Analytics => "analytics",
    Trail => "trail",
    Exam => "exam",
    Assessment => "assessment",
    ApiToken => "api_token",
});

string_enum!(Scope {
    All => "all",
    Own => "own",
    Assigned => "assigned",
    Platform => "platform",
});

/// A concrete permission being checked, e.g. `assessment:grade:assigned`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Permission {
    pub resource: ResourceType,
    pub action: Action,
    pub scope: Option<Scope>,
}

/// One granted pattern; `None` components are wildcards (`*`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Grant {
    pub resource: Option<ResourceType>,
    pub action: Option<Action>,
    pub scope: Option<Scope>,
    /// True when the grant string had an explicit scope segment (or `*`).
    scope_was_explicit: bool,
}

impl Grant {
    /// Parse a grant string: `course:create:platform`, `assessment:submit`,
    /// `*:*:*`.
    pub fn parse(s: &str) -> Result<Self> {
        let mut parts = s.split(':');
        let (Some(res), Some(act)) = (parts.next(), parts.next()) else {
            return Err(Error::app(
                ErrorCode::Internal,
                format!("malformed permission grant: {s}"),
            ));
        };
        let scope_part = parts.next();
        if parts.next().is_some() {
            return Err(Error::app(
                ErrorCode::Internal,
                format!("malformed permission grant (too many segments): {s}"),
            ));
        }
        let parse_wild = |p: &str| -> Result<Option<ResourceType>> {
            if p == "*" {
                Ok(None)
            } else {
                ResourceType::parse(p).map(Some)
            }
        };
        Ok(Self {
            resource: parse_wild(res)?,
            action: if act == "*" {
                None
            } else {
                Some(Action::parse(act)?)
            },
            scope: match scope_part {
                None | Some("*") => None,
                Some(sc) => Some(Scope::parse(sc)?),
            },
            scope_was_explicit: scope_part.is_some(),
        })
    }

    /// Does this grant satisfy the requested permission?
    ///
    /// Wildcard components match anything. A grant with no scope segment
    /// matches any requested scope (legacy behavior: two-segment permissions
    /// like `assessment:submit` are scope-agnostic).
    #[must_use]
    pub fn grants(&self, perm: &Permission) -> bool {
        let resource_ok = self.resource.is_none_or(|r| r == perm.resource);
        let action_ok = self.action.is_none_or(|a| a == perm.action);
        let scope_ok = match (self.scope, perm.scope) {
            (None, _) => true,
            (Some(_), None) => !self.scope_was_explicit,
            (Some(g), Some(p)) => g == p || g == Scope::All,
        };
        resource_ok && action_ok && scope_ok
    }
}

/// The full set of grants attached to an actor (union of role permissions).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PermissionSet {
    grants: Vec<Grant>,
}

impl PermissionSet {
    pub fn parse<'a>(strings: impl IntoIterator<Item = &'a str>) -> Result<Self> {
        Ok(Self {
            grants: strings
                .into_iter()
                .map(Grant::parse)
                .collect::<Result<Vec<_>>>()?,
        })
    }

    #[must_use]
    pub fn grants(&self, perm: &Permission) -> bool {
        self.grants.iter().any(|g| g.grants(perm))
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    fn perm(r: ResourceType, a: Action, s: Option<Scope>) -> Permission {
        Permission {
            resource: r,
            action: a,
            scope: s,
        }
    }

    #[test]
    fn admin_wildcard_grants_everything() {
        let set = PermissionSet::parse(["*:*:*"]).unwrap();
        assert!(set.grants(&perm(
            ResourceType::Course,
            Action::Delete,
            Some(Scope::Platform)
        )));
        assert!(set.grants(&perm(ResourceType::Assessment, Action::Submit, None)));
    }

    #[test]
    fn exact_match() {
        let set = PermissionSet::parse(["course:create:platform"]).unwrap();
        assert!(set.grants(&perm(
            ResourceType::Course,
            Action::Create,
            Some(Scope::Platform)
        )));
        assert!(!set.grants(&perm(
            ResourceType::Course,
            Action::Delete,
            Some(Scope::Platform)
        )));
        assert!(!set.grants(&perm(
            ResourceType::Chapter,
            Action::Create,
            Some(Scope::Platform)
        )));
    }

    #[test]
    fn scope_all_covers_narrower_scopes() {
        let set = PermissionSet::parse(["course:update:all"]).unwrap();
        assert!(set.grants(&perm(
            ResourceType::Course,
            Action::Update,
            Some(Scope::Own)
        )));
    }

    #[test]
    fn scopeless_grant_is_scope_agnostic() {
        let set = PermissionSet::parse(["assessment:submit"]).unwrap();
        assert!(set.grants(&perm(ResourceType::Assessment, Action::Submit, None)));
        assert!(set.grants(&perm(
            ResourceType::Assessment,
            Action::Submit,
            Some(Scope::Own)
        )));
    }

    #[test]
    fn explicitly_scoped_grant_does_not_match_scopeless_check() {
        let set = PermissionSet::parse(["course:read:own"]).unwrap();
        assert!(!set.grants(&perm(ResourceType::Course, Action::Read, None)));
    }

    #[test]
    fn malformed_grants_are_rejected() {
        assert!(Grant::parse("course").is_err());
        assert!(Grant::parse("course:create:platform:extra").is_err());
        assert!(Grant::parse("bogus:create").is_err());
    }
}
