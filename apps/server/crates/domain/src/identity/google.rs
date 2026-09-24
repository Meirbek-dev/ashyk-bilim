//! First-party Google sign-in (DECISIONS.md 2026-08-16).
//!
//! Improvements over the legacy JWT-state design, same semantics otherwise:
//! - The OAuth `state` is an opaque random token whose record (frontend
//!   callback + PKCE verifier) lives server-side in Redis, consumed once via
//!   `GETDEL` — nothing user-controlled round-trips.
//! - The frontend callback must be a same-site relative path (open-redirect
//!   guard the legacy delegated to a signed JWT).

use std::sync::Arc;
use std::time::Duration;

use ab_clients::google::{GoogleClient, GoogleIdentity};
use ab_clients::zitadel::{NewHumanUser, PasswordSpec, ZitadelClient};
use ab_core::id::UserId;
use ab_core::{Error, ErrorCode, Result};
use base64::Engine;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use crate::identity::auth::profile_name;
use crate::identity::sessions::{NewSession, SessionStore};

const STATE_TTL: Duration = Duration::from_mins(10);
const USERNAME_ATTEMPTS: u32 = 5;

#[derive(Debug, Serialize, Deserialize)]
struct StateRecord {
    callback: String,
    verifier: String,
}

#[derive(Debug)]
pub struct GoogleLoginOk {
    pub session_id: String,
    pub user_id: UserId,
    pub callback: String,
}

#[derive(Clone)]
pub struct GoogleAuthService {
    pool: PgPool,
    sessions: SessionStore,
    zitadel: Arc<ZitadelClient>,
    google: Arc<GoogleClient>,
}

impl GoogleAuthService {
    #[must_use]
    pub const fn new(
        pool: PgPool,
        sessions: SessionStore,
        zitadel: Arc<ZitadelClient>,
        google: Arc<GoogleClient>,
    ) -> Self {
        Self {
            pool,
            sessions,
            zitadel,
            google,
        }
    }

    /// Begin the flow: returns the Google authorization URL to redirect to.
    /// `callback` is where the browser lands afterwards — relative paths only.
    pub async fn start(&self, callback: &str) -> Result<String> {
        if !callback.starts_with('/') || callback.starts_with("//") {
            return Err(Error::validation(vec![ab_core::FieldError {
                field: "callback".into(),
                code: "invalid".into(),
                message: "callback must be a relative path".into(),
            }]));
        }
        let state = random_token();
        let verifier = random_token();
        let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(Sha256::digest(verifier.as_bytes()));

        let record = serde_json::to_string(&StateRecord {
            callback: callback.to_owned(),
            verifier,
        })
        .map_err(|e| Error::internal("serializing oauth state", e))?;
        let mut conn = self.sessions.redis();
        let () = conn
            .set_ex(format!("oauth:google:{state}"), record, STATE_TTL.as_secs())
            .await
            .map_err(|e| Error::internal("storing oauth state", e))?;

        self.google.authorize_url(&state, &challenge)
    }

    /// Complete the flow: exchange the code, find-or-create the user, open a
    /// session. Returns the cookie value and where to send the browser.
    pub async fn callback(
        &self,
        code: &str,
        state: &str,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<GoogleLoginOk> {
        let mut conn = self.sessions.redis();
        let raw: Option<String> = redis::cmd("GETDEL")
            .arg(format!("oauth:google:{state}"))
            .query_async(&mut conn)
            .await
            .map_err(|e| Error::internal("consuming oauth state", e))?;
        let Some(raw) = raw else {
            return Err(Error::app(
                ErrorCode::GoogleOauthExpired,
                "unknown or expired oauth state",
            ));
        };
        let record: StateRecord =
            serde_json::from_str(&raw).map_err(|e| Error::internal("corrupt oauth state", e))?;

        let identity = self.google.exchange_code(code, &record.verifier).await?;
        let user_id = self.find_or_create_user(&identity).await?;

        // BUG-203: the session is fenced on the user's epoch; a mutation that
        // lands while the account is being read makes `create` refuse, and
        // one re-read (nothing here is a credential that can go stale) is
        // what a fresh sign-in would do.
        let mut session_id = self
            .open_session(user_id, ip.as_deref(), user_agent.as_deref())
            .await?;
        if session_id.is_none() {
            session_id = self
                .open_session(user_id, ip.as_deref(), user_agent.as_deref())
                .await?;
        }
        let session_id =
            session_id.ok_or_else(|| Error::internal("google login fenced twice", anyhow_msg()))?;
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(user_id),
            "login-google",
            ip.as_deref(),
            user_agent.as_deref(),
            serde_json::json!({}),
        )
        .await?;
        crate::gamification::hooks::login(&self.pool, user_id).await;
        crate::analytics::events::hooks::login(&self.pool, user_id, "google").await;
        Ok(GoogleLoginOk {
            session_id,
            user_id,
            callback: record.callback,
        })
    }

    /// Status, grants and MFA state read after the epoch, then a fenced
    /// `create`; `None` when a mutation moved the epoch in between.
    async fn open_session(
        &self,
        user_id: UserId,
        ip: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<Option<String>> {
        let epoch = self.sessions.epoch(user_id).await?;
        // BUG-253: the account resolved by `sub`, never re-looked-up by the
        // email Google reports now (it may be nobody's, or someone else's).
        let user = ab_db::identity::find_auth_user(&self.pool, user_id)
            .await?
            .ok_or_else(|| Error::internal("google user vanished", anyhow_msg()))?;
        if user.status != "active" {
            return Err(Error::app(
                ErrorCode::AccountDisabled,
                "account is disabled",
            ));
        }
        let (roles, permissions) = ab_db::identity::load_user_grants(&self.pool, user_id).await?;
        // Google bypasses the password+TOTP check, but the security page
        // still needs the enrollment state. Best-effort: a listing failure
        // must not block a sign-in that already succeeded.
        let mfa_enabled = match self
            .zitadel
            .list_auth_method_types(&user.zitadel_user_id)
            .await
        {
            Ok(methods) => methods.iter().any(|m| m == super::auth::TOTP_METHOD),
            Err(err) => {
                tracing::warn!(%err, "auth methods listing failed after google login");
                false
            }
        };
        self.sessions
            .create(NewSession {
                user_id,
                zitadel_user_id: user.zitadel_user_id,
                // No Zitadel session exists for Google logins — ours is the
                // only session; placeholders keep the record shape uniform.
                zitadel_session_id: String::new(),
                zitadel_session_token: String::new(),
                roles,
                permissions,
                rbac_version: user.rbac_version,
                mfa_enabled,
                ip: ip.map(str::to_owned),
                user_agent: user_agent.map(str::to_owned),
                epoch,
            })
            .await
    }

    async fn find_or_create_user(&self, identity: &GoogleIdentity) -> Result<UserId> {
        if let Some(user_id) =
            ab_db::identity::find_user_id_by_google_sub(&self.pool, &identity.sub).await?
        {
            return Ok(user_id);
        }
        // Same email → link, but only when both sides proved the mailbox
        // (BUG-254, DECISIONS 2026-09-24): an unverified local address may
        // be a squatter's pre-registration of the victim's email, an
        // unverified Google one is anyone's claim.
        if let Some(user_id) =
            ab_db::identity::find_user_id_by_email(&self.pool, &identity.email).await?
        {
            let user = ab_db::identity::find_auth_user(&self.pool, user_id)
                .await?
                .ok_or_else(|| Error::not_found("user"))?;
            if !identity.email_verified
                || !self.zitadel.email_verified(&user.zitadel_user_id).await?
            {
                return Err(Error::app(
                    ErrorCode::AccountExists,
                    "an account with this email exists; sign in with its password",
                ));
            }
            ab_db::identity::link_google_account(
                &self.pool,
                user_id,
                &identity.sub,
                &identity.email,
            )
            .await?;
            return Ok(user_id);
        }

        // Brand-new account: passwordless Zitadel user + our rows.
        let given_name = identity.given_name.as_deref().and_then(profile_name);
        let family_name = identity.family_name.as_deref().and_then(profile_name);
        let display_name = match (&given_name, &family_name) {
            (Some(g), Some(f)) => format!("{g} {f}"),
            (Some(g), None) => g.clone(),
            _ => identity.email.clone(),
        };
        let zitadel_user_id = self
            .zitadel
            .create_human_user(&NewHumanUser {
                username: identity.email.clone(),
                given_name: given_name.unwrap_or_else(|| "—".into()),
                family_name: family_name.unwrap_or_else(|| "—".into()),
                email: identity.email.clone(),
                // Only what Google vouches for counts as verified here —
                // otherwise the later link check would trust it (BUG-254).
                email_verified: identity.email_verified,
                password: PasswordSpec::None,
            })
            .await?;

        let base = username_base(&identity.email);
        for attempt in 0..USERNAME_ATTEMPTS {
            let candidate = if attempt == 0 {
                base.clone()
            } else {
                format!("{base}-{}", &random_token()[..4])
            };
            if let Some(user_id) = ab_db::identity::create_user_with_default_role(
                &self.pool,
                &zitadel_user_id,
                &candidate,
                &identity.email,
                &display_name,
                None,
            )
            .await?
            {
                ab_db::identity::link_google_account(
                    &self.pool,
                    user_id,
                    &identity.sub,
                    &identity.email,
                )
                .await?;
                return Ok(user_id);
            }
        }
        Err(Error::internal(
            "could not allocate a unique username",
            anyhow_msg(),
        ))
    }
}

fn anyhow_msg() -> std::io::Error {
    std::io::Error::other("invariant violated")
}

fn random_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

/// Username from the email local part, restricted to a safe alphabet.
fn username_base(email: &str) -> String {
    let local = email.split('@').next().unwrap_or("user");
    let cleaned: String = local
        .chars()
        .map(|c| c.to_ascii_lowercase())
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        .take(48)
        .collect();
    if cleaned.is_empty() {
        "user".into()
    } else {
        cleaned
    }
}
