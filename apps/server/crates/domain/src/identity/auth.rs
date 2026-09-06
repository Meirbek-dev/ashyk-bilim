//! Authentication flows: password login via Zitadel's Session API, logout,
//! and session self-management (ARCHITECTURE §7).
//!
//! Security posture:
//! - Uniform `invalid-credentials` regardless of whether the user exists.
//! - Layered brute-force defense: our Redis rate limits (per IP, per login
//!   name) in front of Zitadel's own failed-attempt lockout.
//! - Session listings never expose raw session ids (they are bearer secrets);
//!   revocation uses a SHA-256 handle.

use std::sync::Arc;
use std::time::Duration;

use ab_clients::zitadel::{PasswordSessionOutcome, TotpRegistration, ZitadelClient};
use ab_core::id::UserId;
use ab_core::{Error, ErrorCode, Result};
use secrecy::SecretString;
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use crate::identity::Actor;
use crate::identity::rate_limit::RateLimiter;
use crate::identity::sessions::{NewSession, SessionRecord, SessionStore};

const IP_LIMIT: (u32, Duration) = (20, Duration::from_mins(5));
const LOGIN_NAME_LIMIT: (u32, Duration) = (10, Duration::from_mins(15));

/// Public, non-bearer identifier for a session (for listings/revocation).
#[must_use]
pub fn session_handle(session_id: &str) -> String {
    let digest = Sha256::digest(session_id.as_bytes());
    hex_prefix(&digest, 16)
}

fn hex_prefix(bytes: &[u8], chars: usize) -> String {
    let mut out = String::with_capacity(chars);
    for byte in bytes {
        for nibble in [byte >> 4, byte & 0xf] {
            if out.len() == chars {
                return out;
            }
            out.push(char::from_digit(u32::from(nibble), 16).unwrap_or('0'));
        }
    }
    out
}

#[derive(Debug)]
pub struct LoginInput {
    pub login: String,
    pub password: SecretString,
    /// Present on the second step of an MFA login.
    pub totp_code: Option<String>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Debug)]
pub struct LoginOk {
    /// Value for the session cookie.
    pub session_id: String,
    pub user_id: UserId,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
}

#[derive(Debug)]
pub struct SessionSummary {
    pub handle: String,
    pub current: bool,
    pub created_at_unix: i64,
    pub last_seen_unix: i64,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Clone)]
pub struct IdentityService {
    pool: PgPool,
    sessions: SessionStore,
    zitadel: Arc<ZitadelClient>,
    limiter: RateLimiter,
}

impl IdentityService {
    #[must_use]
    pub fn new(pool: PgPool, sessions: SessionStore, zitadel: Arc<ZitadelClient>) -> Self {
        let limiter = RateLimiter::new(sessions.redis());
        Self {
            pool,
            sessions,
            zitadel,
            limiter,
        }
    }

    #[must_use]
    pub const fn sessions(&self) -> &SessionStore {
        &self.sessions
    }

    /// Audit helper: request context + event, one line at call sites.
    async fn audit(
        &self,
        user_id: Option<UserId>,
        event: &str,
        input: &LoginInput,
        metadata: serde_json::Value,
    ) -> Result<()> {
        ab_db::identity::insert_auth_audit(
            &self.pool,
            user_id,
            event,
            input.ip.as_deref(),
            input.user_agent.as_deref(),
            metadata,
        )
        .await
    }

    /// Per-IP and per-login-name limits, checked before any Zitadel
    /// round-trip. Returns the login-name key (cleared on success).
    async fn enforce_login_limits(&self, input: &LoginInput) -> Result<String> {
        if let Some(ip) = &input.ip {
            let (limit, window) = IP_LIMIT;
            if !self
                .limiter
                .check(&format!("rl:login:ip:{ip}"), limit, window)
                .await?
            {
                return Err(Error::app(
                    ErrorCode::RateLimited,
                    "too many login attempts",
                ));
            }
        }
        let login_key = format!("rl:login:name:{}", input.login.to_lowercase());
        let (limit, window) = LOGIN_NAME_LIMIT;
        if !self.limiter.check(&login_key, limit, window).await? {
            return Err(Error::app(
                ErrorCode::RateLimited,
                "too many login attempts",
            ));
        }
        Ok(login_key)
    }

    /// Map a Zitadel check outcome to a session or the audited uniform error.
    async fn resolve_session_outcome(
        &self,
        outcome: PasswordSessionOutcome,
        input: &LoginInput,
    ) -> Result<ab_clients::zitadel::ZitadelSession> {
        match outcome {
            PasswordSessionOutcome::Ok(session) => Ok(session),
            PasswordSessionOutcome::InvalidTotp => {
                self.audit(
                    None,
                    "login-failed",
                    input,
                    serde_json::json!({ "login": input.login, "reason": "invalid-totp" }),
                )
                .await?;
                Err(Error::app(
                    ErrorCode::InvalidTotpCode,
                    "invalid one-time code",
                ))
            }
            PasswordSessionOutcome::InvalidCredentials { failed_attempts } => {
                self.audit(
                    None,
                    "login-failed",
                    input,
                    serde_json::json!({ "login": input.login, "failed_attempts": failed_attempts }),
                )
                .await?;
                Err(Error::app(
                    ErrorCode::InvalidCredentials,
                    "invalid credentials",
                ))
            }
            PasswordSessionOutcome::UserNotFound => {
                self.audit(
                    None,
                    "login-failed",
                    input,
                    serde_json::json!({ "login": input.login, "reason": "unknown-user" }),
                )
                .await?;
                // Uniform response: do not reveal which accounts exist.
                Err(Error::app(
                    ErrorCode::InvalidCredentials,
                    "invalid credentials",
                ))
            }
        }
    }

    pub async fn login(&self, input: LoginInput) -> Result<LoginOk> {
        let login_key = self.enforce_login_limits(&input).await?;

        let outcome = self
            .zitadel
            .create_password_session(&input.login, &input.password, input.totp_code.as_deref())
            .await?;
        let zsession = self.resolve_session_outcome(outcome, &input).await?;

        let Some(user) = ab_db::identity::find_user_for_login(&self.pool, &input.login).await?
        else {
            // Zitadel authenticated an account our DB doesn't know — identity
            // drift. Loud internal error; uniform message to the client.
            tracing::error!(login = %input.login, "zitadel user missing from app database");
            return Err(Error::app(
                ErrorCode::InvalidCredentials,
                "invalid credentials",
            ));
        };
        if user.status != "active" {
            self.audit(
                Some(user.id),
                "login-blocked",
                &input,
                serde_json::json!({ "status": user.status }),
            )
            .await?;
            return Err(Error::app(
                ErrorCode::AccountDisabled,
                "account is disabled",
            ));
        }

        // BFF-enforced MFA: Zitadel's session API does not force TOTP by
        // itself — if the account has TOTP enrolled and no code came with
        // this attempt, demand the second factor before opening our session.
        if input.totp_code.is_none() {
            let methods = self
                .zitadel
                .list_auth_method_types(&user.zitadel_user_id)
                .await?;
            if methods
                .iter()
                .any(|m| m == "AUTHENTICATION_METHOD_TYPE_TOTP")
            {
                let token = SecretString::from(zsession.session_token.clone());
                if let Err(err) = self
                    .zitadel
                    .delete_session(&zsession.session_id, &token)
                    .await
                {
                    tracing::warn!(%err, "discarding pre-mfa zitadel session failed");
                }
                self.audit(
                    Some(user.id),
                    "login-mfa-required",
                    &input,
                    serde_json::json!({}),
                )
                .await?;
                return Err(Error::app(ErrorCode::MfaRequired, "one-time code required"));
            }
        }

        let (roles, permissions) = ab_db::identity::load_user_grants(&self.pool, user.id).await?;
        let session_id = self
            .sessions
            .create(NewSession {
                user_id: user.id,
                zitadel_user_id: user.zitadel_user_id,
                zitadel_session_id: zsession.session_id,
                zitadel_session_token: secrecy::ExposeSecret::expose_secret(
                    &zsession.session_token,
                )
                .to_owned(),
                roles: roles.clone(),
                permissions: permissions.clone(),
                rbac_version: user.rbac_version,
                ip: input.ip.clone(),
                user_agent: input.user_agent.clone(),
            })
            .await?;

        self.limiter.clear(&login_key).await?;
        self.audit(Some(user.id), "login", &input, serde_json::json!({}))
            .await?;
        crate::gamification::hooks::login(&self.pool, user.id).await;
        crate::analytics::events::hooks::login(&self.pool, user.id, "password").await;

        Ok(LoginOk {
            session_id,
            user_id: user.id,
            roles,
            permissions,
        })
    }

    // ── TOTP self-service (optional MFA, DECISIONS.md: TOTP only) ──────────

    /// Start TOTP enrollment; returns the otpauth URI + secret for the
    /// authenticator app. Conflict if already enrolled and verified.
    pub async fn totp_enroll(&self, actor: &Actor) -> Result<TotpRegistration> {
        self.zitadel.register_totp(&actor.zitadel_user_id).await
    }

    /// Activate the enrollment with a first code.
    pub async fn totp_activate(&self, actor: &Actor, code: &str) -> Result<()> {
        self.zitadel
            .verify_totp(&actor.zitadel_user_id, code)
            .await?;
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(actor.user_id),
            "mfa-enrolled",
            None,
            None,
            serde_json::json!({ "method": "totp" }),
        )
        .await
    }

    /// Remove the TOTP authenticator (idempotent).
    pub async fn totp_remove(&self, actor: &Actor) -> Result<()> {
        self.zitadel.remove_totp(&actor.zitadel_user_id).await?;
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(actor.user_id),
            "mfa-removed",
            None,
            None,
            serde_json::json!({ "method": "totp" }),
        )
        .await
    }

    /// Terminate the actor's current session (idempotent). The Zitadel-side
    /// session delete is best-effort — our session is the credential.
    pub async fn logout(&self, actor: &Actor) -> Result<()> {
        if let Some(record) = self.sessions.get_and_touch(&actor.session_id).await? {
            let token = SecretString::from(record.zitadel_session_token.clone());
            if let Err(err) = self
                .zitadel
                .delete_session(&record.zitadel_session_id, &token)
                .await
            {
                tracing::warn!(%err, "zitadel session delete failed (continuing logout)");
            }
        }
        self.sessions
            .revoke(actor.user_id, &actor.session_id)
            .await?;
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(actor.user_id),
            "logout",
            None,
            None,
            serde_json::json!({}),
        )
        .await?;
        Ok(())
    }

    pub async fn list_sessions(&self, actor: &Actor) -> Result<Vec<SessionSummary>> {
        let mut summaries = Vec::new();
        for id in self.sessions.list(actor.user_id).await? {
            if let Some(record) = self.session_peek(&id).await? {
                summaries.push(SessionSummary {
                    handle: session_handle(&id),
                    current: id == actor.session_id,
                    created_at_unix: record.created_at_unix,
                    last_seen_unix: record.last_seen_unix,
                    ip: record.ip,
                    user_agent: record.user_agent,
                });
            }
        }
        Ok(summaries)
    }

    /// Revoke one of the actor's own sessions by its public handle.
    /// Returns `false` if no session matches.
    pub async fn revoke_session(&self, actor: &Actor, handle: &str) -> Result<bool> {
        for id in self.sessions.list(actor.user_id).await? {
            if session_handle(&id) == handle {
                self.sessions.revoke(actor.user_id, &id).await?;
                ab_db::identity::insert_auth_audit(
                    &self.pool,
                    Some(actor.user_id),
                    "session-revoked",
                    None,
                    None,
                    serde_json::json!({ "handle": handle }),
                )
                .await?;
                return Ok(true);
            }
        }
        Ok(false)
    }

    async fn session_peek(&self, id: &str) -> Result<Option<SessionRecord>> {
        self.sessions.get_and_touch(id).await
    }
}
