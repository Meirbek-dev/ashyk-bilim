//! Personal access tokens: how an MCP client acts as its owner (REWRITE 4.7).
//!
//! A token is `abq_` + 64 hex characters (244 random bits, two UUIDv4 as the session ids); the database keeps
//! only its sha256. A caller authenticated by a token is [`Actor::current`] of the owner: the same grants as a
//! fresh session, so every domain gate (`CourseCtx`/`Caps`, `actor.require`) decides exactly as for the web. The
//! scope limits which MCP tools the token reaches; it never widens what the owner may do.
//!
//! Creating and revoking a token and every tool call write an `auth_audit_log` row.

use ab_core::id::{AccessTokenId, UserId};
use ab_core::{Error, FieldError, Result};
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use super::Actor;

/// The prefix that marks a personal access token (secret scanners and humans recognise it).
pub const TOKEN_PREFIX: &str = "abq_";
/// Longest lifetime a token may be created with; `None` (no expiry) is allowed too.
pub const MAX_EXPIRY_DAYS: i32 = 365;
/// Longest token name.
pub const MAX_NAME_CHARS: usize = 100;

/// What a token reaches: `read` the read tools, `draft` those plus the draft-only writes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenScope {
    Read,
    Draft,
}

impl TokenScope {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Draft => "draft",
        }
    }

    /// A stored scope; an unknown value reads as the narrowest one.
    #[must_use]
    pub fn parse(value: &str) -> Self {
        if value == "draft" {
            Self::Draft
        } else {
            Self::Read
        }
    }

    /// `draft` includes `read`.
    #[must_use]
    pub const fn allows(self, need: Self) -> bool {
        matches!((self, need), (Self::Draft, _) | (Self::Read, Self::Read))
    }
}

/// A token as its owner sees it (never the secret).
#[derive(Debug, Clone)]
pub struct AccessToken {
    pub id: AccessTokenId,
    pub name: String,
    pub scope: TokenScope,
    /// Unix seconds.
    pub created_at: i64,
    pub last_used_at: Option<i64>,
    pub expires_at: Option<i64>,
    pub revoked_at: Option<i64>,
}

impl From<ab_db::access_tokens::AccessTokenRow> for AccessToken {
    fn from(row: ab_db::access_tokens::AccessTokenRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            scope: TokenScope::parse(&row.scope),
            created_at: row.created_at,
            last_used_at: row.last_used_at,
            expires_at: row.expires_at,
            revoked_at: row.revoked_at,
        }
    }
}

/// A token right after creation: the only time the secret exists outside its owner's client.
#[derive(Debug)]
pub struct CreatedToken {
    pub token: AccessToken,
    pub secret: String,
}

/// The caller behind a presented token.
#[derive(Debug, Clone)]
pub struct TokenCaller {
    pub actor: Actor,
    pub token_id: AccessTokenId,
    pub scope: TokenScope,
}

/// Where a request came from, for the audit rows.
#[derive(Debug, Clone, Default)]
pub struct RequestOrigin {
    pub ip: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Clone)]
pub struct AccessTokensService {
    pool: PgPool,
}

fn hash(secret: &str) -> Vec<u8> {
    Sha256::digest(secret.as_bytes()).to_vec()
}

fn new_secret() -> String {
    format!(
        "{TOKEN_PREFIX}{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

fn invalid(field: &str, message: &str) -> Error {
    Error::validation(vec![FieldError {
        field: field.into(),
        code: "invalid".into(),
        message: message.into(),
    }])
}

impl AccessTokensService {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// A new token of the signed-in caller; the secret is returned once.
    pub async fn create(
        &self,
        actor: &Actor,
        name: &str,
        scope: TokenScope,
        expires_in_days: Option<i32>,
        origin: &RequestOrigin,
    ) -> Result<CreatedToken> {
        if actor.is_anonymous() {
            return Err(Error::unauthenticated());
        }
        let name = name.trim();
        if name.is_empty() || name.chars().count() > MAX_NAME_CHARS {
            return Err(invalid("name", "name must be 1..=100 characters"));
        }
        if expires_in_days.is_some_and(|d| !(1..=MAX_EXPIRY_DAYS).contains(&d)) {
            return Err(invalid(
                "expires_in_days",
                "expires_in_days must be within 1..=365",
            ));
        }
        let secret = new_secret();
        let row = ab_db::access_tokens::insert(
            &self.pool,
            actor.user_id,
            name,
            &hash(&secret),
            scope.as_str(),
            expires_in_days,
        )
        .await?
        .ok_or_else(|| {
            Error::conflict(format!(
                "at most {} live access tokens; revoke one first",
                ab_db::access_tokens::MAX_LIVE_PER_USER
            ))
        })?;
        self.audit(
            Some(actor.user_id),
            "access-token-created",
            origin,
            serde_json::json!({ "token_id": row.id, "scope": scope.as_str() }),
        )
        .await?;
        Ok(CreatedToken {
            token: row.into(),
            secret,
        })
    }

    /// The caller's tokens, newest first.
    pub async fn list(&self, actor: &Actor) -> Result<Vec<AccessToken>> {
        if actor.is_anonymous() {
            return Err(Error::unauthenticated());
        }
        Ok(
            ab_db::access_tokens::list_for_user(&self.pool, actor.user_id)
                .await?
                .into_iter()
                .map(Into::into)
                .collect(),
        )
    }

    /// Revoke one of the caller's tokens (404 for another user's or an unknown id).
    pub async fn revoke(
        &self,
        actor: &Actor,
        id: AccessTokenId,
        origin: &RequestOrigin,
    ) -> Result<()> {
        if actor.is_anonymous() {
            return Err(Error::unauthenticated());
        }
        if !ab_db::access_tokens::revoke(&self.pool, actor.user_id, id).await? {
            return Err(Error::not_found("access token"));
        }
        self.audit(
            Some(actor.user_id),
            "access-token-revoked",
            origin,
            serde_json::json!({ "token_id": id }),
        )
        .await
    }

    /// The owner behind a presented token, as of now; `None` for anything that is not a live token.
    pub async fn authenticate(&self, presented: &str) -> Result<Option<TokenCaller>> {
        if !presented.starts_with(TOKEN_PREFIX) || presented.len() > 128 {
            return Ok(None);
        }
        let Some(row) = ab_db::access_tokens::authenticate(&self.pool, &hash(presented)).await?
        else {
            return Ok(None);
        };
        Ok(Some(TokenCaller {
            actor: Actor::current(&self.pool, row.user_id).await?,
            token_id: row.id,
            scope: TokenScope::parse(&row.scope),
        }))
    }

    /// One MCP tool call, allowed or refused: `mcp-tool-called` with the tool, the token and the outcome.
    pub async fn audit_tool_call(
        &self,
        caller: &TokenCaller,
        tool: &str,
        outcome: Result<(), &str>,
        target: serde_json::Value,
        origin: &RequestOrigin,
    ) -> Result<()> {
        let (ok, error) = match outcome {
            Ok(()) => (true, None),
            Err(code) => (false, Some(code)),
        };
        self.audit(
            Some(caller.actor.user_id),
            "mcp-tool-called",
            origin,
            serde_json::json!({
                "tool": tool,
                "token_id": caller.token_id,
                "scope": caller.scope.as_str(),
                "ok": ok,
                "error": error,
                "target": target,
            }),
        )
        .await
    }

    async fn audit(
        &self,
        user_id: Option<UserId>,
        event: &str,
        origin: &RequestOrigin,
        metadata: serde_json::Value,
    ) -> Result<()> {
        ab_db::identity::insert_auth_audit(
            &self.pool,
            user_id,
            event,
            origin.ip.as_deref(),
            origin.user_agent.as_deref(),
            metadata,
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::{TOKEN_PREFIX, TokenScope, hash, new_secret};

    #[test]
    fn draft_includes_read_and_read_stays_read() {
        assert!(TokenScope::Draft.allows(TokenScope::Read));
        assert!(TokenScope::Draft.allows(TokenScope::Draft));
        assert!(TokenScope::Read.allows(TokenScope::Read));
        assert!(!TokenScope::Read.allows(TokenScope::Draft));
        assert_eq!(TokenScope::parse("bogus"), TokenScope::Read);
    }

    #[test]
    fn secrets_are_prefixed_random_and_hashed_to_32_bytes() {
        let (a, b) = (new_secret(), new_secret());
        assert!(a.starts_with(TOKEN_PREFIX));
        assert_eq!(a.len(), TOKEN_PREFIX.len() + 64);
        assert_ne!(a, b);
        assert_eq!(hash(&a).len(), 32);
    }
}
