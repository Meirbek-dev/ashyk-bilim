//! Personal access tokens of MCP clients (REWRITE 4.7).

use ab_core::id::AccessTokenId;
use ab_domain::identity::access_tokens::{self as domain, MAX_EXPIRY_DAYS};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// What a token reaches: `read` the read tools; `draft` those plus the draft-only writes (content of
/// unpublished activities, teacher-only grades). Neither publishes nor releases anything.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum AccessTokenScope {
    Read,
    Draft,
}

impl From<AccessTokenScope> for domain::TokenScope {
    fn from(scope: AccessTokenScope) -> Self {
        match scope {
            AccessTokenScope::Read => Self::Read,
            AccessTokenScope::Draft => Self::Draft,
        }
    }
}

impl From<domain::TokenScope> for AccessTokenScope {
    fn from(scope: domain::TokenScope) -> Self {
        match scope {
            domain::TokenScope::Read => Self::Read,
            domain::TokenScope::Draft => Self::Draft,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateAccessTokenRequest {
    /// What the token is for (the client's name), 1..=100 characters.
    #[garde(length(chars, min = 1, max = 100))]
    #[schema(min_length = 1, max_length = 100)]
    pub name: String,
    #[garde(skip)]
    pub scope: AccessTokenScope,
    /// Days until the token stops working, 1..=365; omitted or null: it never expires.
    #[garde(inner(range(min = 1, max = MAX_EXPIRY_DAYS)))]
    #[schema(minimum = 1, maximum = 365)]
    pub expires_in_days: Option<i32>,
}

/// One of the caller's tokens (the secret is never listed).
#[derive(Debug, Serialize, ToSchema)]
pub struct AccessToken {
    pub id: AccessTokenId,
    pub name: String,
    pub scope: AccessTokenScope,
    pub created_at_unix: i64,
    /// The latest call with it (to the minute); null: never used.
    pub last_used_at_unix: Option<i64>,
    /// Null: never expires.
    pub expires_at_unix: Option<i64>,
    /// Null: not revoked.
    pub revoked_at_unix: Option<i64>,
}

impl From<domain::AccessToken> for AccessToken {
    fn from(t: domain::AccessToken) -> Self {
        Self {
            id: t.id,
            name: t.name,
            scope: t.scope.into(),
            created_at_unix: t.created_at,
            last_used_at_unix: t.last_used_at,
            expires_at_unix: t.expires_at,
            revoked_at_unix: t.revoked_at,
        }
    }
}

/// A token just created: `token` is shown this once and cannot be read again.
#[derive(Debug, Serialize, ToSchema)]
pub struct CreatedAccessToken {
    pub access_token: AccessToken,
    /// The secret: send it as `Authorization: Bearer <token>` to `/api/v2/mcp`.
    pub token: String,
}

impl From<domain::CreatedToken> for CreatedAccessToken {
    fn from(created: domain::CreatedToken) -> Self {
        Self {
            access_token: created.token.into(),
            token: created.secret,
        }
    }
}
