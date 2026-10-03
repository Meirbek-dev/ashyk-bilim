//! Authentication flows (ARCHITECTURE §7).
//!
//! Password login via Zitadel's Session API, logout, session
//! self-management, self-registration with email verification, admin
//! account creation and password change.
//!
//! Security posture:
//! - Uniform `invalid-credentials` regardless of whether the user exists.
//! - Layered brute-force defense: our Redis rate limits (per IP, per login
//!   name) in front of Zitadel's own failed-attempt lockout.
//! - Session listings never expose raw session ids (they are bearer secrets);
//!   revocation uses a SHA-256 handle.

use std::sync::Arc;
use std::time::Duration;

use ab_clients::resend::ResendClient;
use ab_clients::zitadel::{
    NewHumanUser, PasswordSessionOutcome, PasswordSpec, SessionUser, TotpRegistration,
    ZitadelClient,
};
use ab_core::id::UserId;
use ab_core::language::Language;
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, ErrorCode, FieldError, Result};
use redis::AsyncCommands;
use secrecy::SecretString;
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use crate::identity::Actor;
use crate::identity::rate_limit::RateLimiter;
use crate::identity::sessions::{NewSession, SessionStore};

/// Default counts: `ab_core::config::AuthLimits` (`AB__AUTH__LIMITS__*`).
/// Failed logins per IP. Every attempt is counted up front (before the
/// Zitadel round-trip) and released once Zitadel accepts the password, so
/// a classroom NAT behind one `X-Forwarded-For` is throttled by its
/// failures only (DECISIONS 2026-09-13).
const IP_WINDOW: Duration = Duration::from_mins(5);
/// Login attempts per account (the user id when the login name resolves -
/// email and username share one lock - the normalised name otherwise).
const LOGIN_NAME_WINDOW: Duration = Duration::from_mins(15);
/// Wrong `current_password` guesses per user on the password change - a
/// stolen session must not brute-force the password it never knew.
const PASSWORD_CHECK_WINDOW: Duration = Duration::from_mins(15);
/// Accounts actually created per IP (the expensive path - two Zitadel calls
/// plus an email). Failed attempts do not count: a classroom behind one NAT
/// must survive ten typos.
const REGISTER_IP_WINDOW: Duration = Duration::from_hours(1);
/// Registration + verification *attempts* per IP, wide enough for humans,
/// tight enough to throttle username/email enumeration.
const REGISTER_ATTEMPT_IP_WINDOW: Duration = Duration::from_hours(1);

/// Password-reset throttle per IP, and code mails (reset + verification
/// resend) per account.
const CODE_MAIL_WINDOW: Duration = Duration::from_hours(1);

/// Which code an email carries (subject, copy, web route).
#[derive(Debug, Clone, Copy)]
enum CodeMail {
    Verification,
    PasswordReset,
}

impl CodeMail {
    const fn what(self) -> &'static str {
        match self {
            Self::Verification => "verification",
            Self::PasswordReset => "password reset",
        }
    }

    const fn link(self) -> ab_core::links::WebLink<'static> {
        match self {
            Self::Verification => ab_core::links::WebLink::VerifyEmail,
            Self::PasswordReset => ab_core::links::WebLink::ResetPassword,
        }
    }

    /// (subject, code line, link text, ignore line).
    const fn copy(self) -> (&'static str, &'static str, &'static str, &'static str) {
        match self {
            Self::Verification => (
                "Подтвердите адрес электронной почты - Ashyq Bilim",
                "Код подтверждения адреса электронной почты",
                "Подтвердить адрес",
                "Если вы не регистрировались на Ashyq Bilim, просто проигнорируйте это письмо.",
            ),
            Self::PasswordReset => (
                "Восстановление пароля - Ashyq Bilim",
                "Код для восстановления пароля",
                "Задать новый пароль",
                "Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.",
            ),
        }
    }
}

struct Recipient<'a> {
    id: UserId,
    email: &'a str,
    name: &'a str,
}

/// Authenticator-app issuer when the platform singleton has no name yet.
/// Backoff (ms) for a password check Zitadel answers NotFound while its
/// user projection catches up with a just-created account (L-6).
const ZITADEL_PROJECTION_RETRY_MS: [u64; 3] = [250, 500, 1000];
const DEFAULT_PLATFORM_NAME: &str = "Ashyq Bilim";

/// How long a started TOTP enrolment is handed back unchanged to a repeat
/// start (UX-254): Zitadel replaces the pending secret on every registration,
/// so a second tab must see the first tab's secret, not kill it.
const TOTP_ENROL_TTL: Duration = Duration::from_mins(10);

pub const TOTP_METHOD: &str = "AUTHENTICATION_METHOD_TYPE_TOTP";
pub const PASSWORD_METHOD: &str = "AUTHENTICATION_METHOD_TYPE_PASSWORD";

/// Admin account creation (the legacy `user:create` is a platform-admin
/// grant; v2 keys it on the same permission as the other user admin routes).
const MANAGE_PLATFORM: Permission = Permission {
    resource: ResourceType::Platform,
    action: Action::Manage,
    scope: Some(Scope::Platform),
};

/// Public, non-bearer identifier for a session (for listings/revocation).
#[must_use]
pub fn session_handle(session_id: &str) -> String {
    let digest = Sha256::digest(session_id.as_bytes());
    hex_prefix(&digest, 16)
}

/// Percent-encode a query value (RFC 3986 unreserved set kept as-is).
fn query_encode(value: &str) -> String {
    use std::fmt::Write as _;
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            out.push(char::from(byte));
        } else {
            // Writing into a String cannot fail.
            let _ = write!(out, "%{byte:02X}");
        }
    }
    out
}

fn totp_pending_key(actor: &Actor) -> String {
    format!("totp_pending:{}", actor.user_id)
}

/// Zitadel labels the authenticator entry with its own name
/// (`otpauth://totp/ZITADEL:<account>?…&issuer=ZITADEL`); the user enrolled
/// on the platform, so the label and `issuer` say so.
fn brand_otpauth_uri(uri: &str, issuer: &str) -> String {
    let Some(rest) = uri.strip_prefix("otpauth://totp/") else {
        return uri.to_owned();
    };
    let (label, query) = rest.split_once('?').unwrap_or((rest, ""));
    let account = label
        .split_once(':')
        .or_else(|| label.split_once("%3A"))
        .map_or(label, |(_, account)| account);
    let issuer = query_encode(issuer);
    let query = query
        .split('&')
        .filter(|pair| !pair.is_empty() && !pair.starts_with("issuer="))
        .map(str::to_owned)
        .chain(std::iter::once(format!("issuer={issuer}")))
        .collect::<Vec<_>>()
        .join("&");
    format!("otpauth://totp/{issuer}:{account}?{query}")
}

fn html_escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(ch),
        }
    }
    out
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
    pub mfa_enabled: bool,
}

/// Self-registration or admin creation input. No `Debug`: carries a password.
pub struct NewAccount {
    pub username: String,
    pub email: String,
    /// `None` = IdP-only account (admin path: the user signs in with Google).
    pub password: Option<SecretString>,
    pub first_name: String,
    pub last_name: String,
    /// School / university / company. Required at self-registration; `""`
    /// on the admin path (the dashboard asks the user for it).
    pub organization: String,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    /// UI language of the signer: prefixes the verification link and seeds
    /// the profile `locale` (UX-126).
    pub language: Option<Language>,
}

pub use ab_db::identity::ProfileRow as Profile;

/// A profile name as every account-creating door stores it (register, admin
/// create, Google - UX-157): control/format characters stripped (a bidi
/// override renders the neighbours reversed), trimmed; `None` when nothing
/// visible is left - the rule `PATCH /users/me` applies to `display_name`.
pub(crate) fn profile_name(value: &str) -> Option<String> {
    let value = ab_core::strip_controls(value);
    let value = ab_core::trim_blank(&value);
    (!value.is_empty()).then(|| value.to_owned())
}

/// [`profile_name`], or 422 `{field}`/`required`.
fn required_name(field: &str, value: &str) -> Result<String> {
    profile_name(value).ok_or_else(|| Error::required(field))
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
    limits: ab_core::config::AuthLimits,
    /// `None` = email delivery unconfigured (codes are logged, accounts work).
    mailer: Option<Arc<ResendClient>>,
    /// Public web origin for links in emails (`AB__SERVER__WEB_URL`).
    web_url: Option<String>,
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
            limits: ab_core::config::AuthLimits::default(),
            mailer: None,
            web_url: None,
        }
    }

    /// Throttle counts from config (`AB__AUTH__LIMITS__*`).
    #[must_use]
    pub const fn with_limits(mut self, limits: ab_core::config::AuthLimits) -> Self {
        self.limits = limits;
        self
    }

    /// Wire email delivery for verification codes.
    #[must_use]
    pub fn with_mailer(
        mut self,
        mailer: Option<Arc<ResendClient>>,
        web_url: Option<String>,
    ) -> Self {
        self.mailer = mailer;
        self.web_url = web_url;
        self
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

    /// `rate-limited` with `retry_after_seconds` from the live window (the
    /// problem+json layer turns it into `Retry-After`).
    async fn rate_limited(&self, key: &str, window: Duration, message: &str) -> Result<Error> {
        let retry_after = self.limiter.retry_after(key, window).await?;
        Ok(Error::app_with_details(
            ErrorCode::RateLimited,
            message,
            serde_json::json!({ "retry_after_seconds": retry_after }),
        ))
    }

    /// Count a hit on `key`; `rate-limited` past `limit`.
    async fn enforce(&self, key: &str, (limit, window): (u32, Duration), what: &str) -> Result<()> {
        if self.limiter.check(key, limit, window).await? {
            Ok(())
        } else {
            Err(self
                .rate_limited(key, window, &format!("too many {what} attempts"))
                .await?)
        }
    }

    /// Per-IP limit, counted BEFORE the Zitadel round-trip (BUG-222: a
    /// peek-then-count let a concurrent burst through in full) and released
    /// once Zitadel accepts the credential. A rejection, a transport error
    /// and a dropped connection all keep their hit. Returns the key.
    async fn enforce_login_ip_limit(&self, input: &LoginInput) -> Result<Option<String>> {
        let Some(ip) = &input.ip else { return Ok(None) };
        let key = format!("rl:login:ip:{ip}");
        self.enforce(&key, (self.limits.login_ip, IP_WINDOW), "login")
            .await?;
        Ok(Some(key))
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
                // Our row exists but Zitadel's does not - identity drift.
                // Loud in the logs; uniform message to the client.
                tracing::error!(login = %input.login, "app user missing from zitadel");
                self.audit(
                    None,
                    "login-failed",
                    input,
                    serde_json::json!({ "login": input.login, "reason": "zitadel-user-missing" }),
                )
                .await?;
                Err(Error::app(
                    ErrorCode::InvalidCredentials,
                    "invalid credentials",
                ))
            }
        }
    }

    /// Per-account limit: one lock per resolved user, so the username and
    /// the email do not each get their own ten tries; unknown names throttle
    /// on the normalised name itself. Returns the key (cleared on success).
    async fn enforce_login_name_limit(
        &self,
        input: &LoginInput,
        user: Option<&ab_db::identity::AuthUserRow>,
    ) -> Result<String> {
        let subject = user.map_or_else(
            || input.login.trim().to_lowercase(),
            |user| user.id.to_string(),
        );
        let key = format!("rl:login:name:{subject}");
        self.enforce(&key, (self.limits.login_name, LOGIN_NAME_WINDOW), "login")
            .await?;
        Ok(key)
    }

    pub async fn login(&self, input: LoginInput) -> Result<LoginOk> {
        let ip_key = self.enforce_login_ip_limit(&input).await?;

        // Our row first (username or email, legacy semantics), then the
        // password check by Zitadel user id - Zitadel's login name may be
        // either identifier depending on how the account was created.
        // UX-110: the name-limit key already trimmed; the lookup must too.
        let user = ab_db::identity::find_user_for_login(&self.pool, input.login.trim()).await?;
        let login_key = self.enforce_login_name_limit(&input, user.as_ref()).await?;
        let Some(user) = user else {
            self.audit(
                None,
                "login-failed",
                &input,
                serde_json::json!({ "login": input.login, "reason": "unknown-user" }),
            )
            .await?;
            // Uniform response: do not reveal which accounts exist.
            return Err(Error::app(
                ErrorCode::InvalidCredentials,
                "invalid credentials",
            ));
        };
        // A fenced attempt (a mutation landed mid-flight) is retried once as
        // a fresh login - every check including the password runs again on
        // the new epoch (bar the already-verified TOTP code, UX-158), so a
        // role or MFA rewrite costs the user nothing and a password change is
        // caught by Zitadel itself (BUG-222 nit).
        let hits: Vec<&str> = ip_key
            .iter()
            .map(String::as_str)
            .chain([login_key.as_str()])
            .collect();
        let mut ok = self.login_attempt(&input, &user, Some(&hits)).await?;
        if ok.is_none() {
            ok = self.login_attempt(&input, &user, None).await?;
        }
        let Some(ok) = ok else {
            return Err(self.fenced_login(&user, &input).await?);
        };
        self.limiter.clear(&login_key).await?;
        self.audit(Some(user.id), "login", &input, serde_json::json!({}))
            .await?;
        crate::gamification::hooks::login(&self.pool, user.id).await;
        crate::analytics::events::hooks::login(&self.pool, user.id, "password").await;
        Ok(ok)
    }

    /// One fenced login attempt: `Ok(None)` when a mutation bumped the epoch
    /// between the checks and `sessions.create` (the Zitadel session is
    /// discarded and the fence audited); the caller retries or refuses.
    ///
    /// `first` carries the limiter hits this login counted: handed back as
    /// soon as Zitadel accepts the password - every answer after that
    /// (`mfa-required`, `account-disabled`, a session) is not a guess
    /// (BUG-236). `None` on the retry, which only runs once the first attempt
    /// was accepted - its TOTP code included (UX-158).
    async fn login_attempt(
        &self,
        input: &LoginInput,
        user: &ab_db::identity::AuthUserRow,
        first: Option<&[&str]>,
    ) -> Result<Option<LoginOk>> {
        // UX-158: the retry does not resend the code - Zitadel refuses a
        // replayed one. The first attempt verified it moments ago, so it
        // still stands as the second factor.
        let code = if first.is_some() {
            input.totp_code.as_deref()
        } else {
            None
        };
        // BUG-203: the epoch is read before every check this login rests on
        // (password, status, MFA methods, grants); `sessions.create` refuses
        // if a mutation bumped it in between, so a disable / password change /
        // TOTP activation / role change landing during the ~1 s Zitadel call
        // can never be outlived by the session it did not see.
        let epoch = self.sessions.epoch(user.id).await?;
        let outcome = self.password_session(user, &input.password, code).await?;
        let zsession = self.resolve_session_outcome(outcome, input).await?;
        for key in first.unwrap_or_default() {
            self.limiter.release(key).await?;
        }
        // Status and `rbac_version` are re-read after the epoch, not taken
        // from the row looked up before it - the fence only covers state read
        // after the epoch, and the version must be no older than the grants
        // read below (UX-211, as Google login does).
        let (status, rbac_version) = ab_db::identity::find_auth_user(&self.pool, user.id)
            .await?
            .map_or_else(
                || ("deleted".to_owned(), 0),
                |row| (row.status, row.rbac_version),
            );
        if status != "active" {
            self.discard_zitadel_session(&zsession, "blocked").await;
            self.audit(
                Some(user.id),
                "login-blocked",
                input,
                serde_json::json!({ "status": status }),
            )
            .await?;
            return Err(Error::app(
                ErrorCode::AccountDisabled,
                "account is disabled",
            ));
        }

        // BFF-enforced MFA: Zitadel's session API does not force TOTP by
        // itself - if the account has TOTP enrolled and no code came with
        // this attempt, demand the second factor before opening our session.
        // A code Zitadel accepted on this attempt proves enrollment by itself;
        // on the retry enrollment is read live (the mutation may have removed
        // it). Without a code, an enrolled account never gets past this block.
        let mfa_enabled = code.is_some() || self.totp_enrolled(&user.zitadel_user_id).await?;
        if mfa_enabled && input.totp_code.is_none() {
            self.discard_zitadel_session(&zsession, "pre-mfa").await;
            self.audit(
                Some(user.id),
                "login-mfa-required",
                input,
                serde_json::json!({}),
            )
            .await?;
            return Err(Error::app(ErrorCode::MfaRequired, "one-time code required"));
        }

        let (roles, permissions) = ab_db::identity::load_user_grants(&self.pool, user.id).await?;
        let google_linked = ab_db::identity::google_linked(&self.pool, user.id).await?;
        let created = self
            .sessions
            .create(NewSession {
                user_id: user.id,
                zitadel_user_id: user.zitadel_user_id.clone(),
                zitadel_session_id: zsession.session_id.clone(),
                zitadel_session_token: secrecy::ExposeSecret::expose_secret(
                    &zsession.session_token,
                )
                .to_owned(),
                roles: roles.clone(),
                permissions: permissions.clone(),
                rbac_version,
                mfa_enabled,
                // Zitadel just checked it.
                has_password: true,
                google_linked,
                ip: input.ip.clone(),
                user_agent: input.user_agent.clone(),
                epoch,
            })
            .await?;
        let Some(session_id) = created else {
            self.discard_zitadel_session(&zsession, "fenced").await;
            self.audit(Some(user.id), "login-fenced", input, serde_json::json!({}))
                .await?;
            return Ok(None);
        };
        Ok(Some(LoginOk {
            session_id,
            user_id: user.id,
            roles,
            permissions,
            mfa_enabled,
        }))
    }

    /// Zitadel's password (+ TOTP) check for one of our users.
    ///
    /// L-6: Zitadel's session API reads users from an eventually consistent
    /// projection - a login within ~1 s of `POST /users/human` answers
    /// NotFound (measured locally: 0.2-1.2 s after register, 15 e2e
    /// logins). Our row exists, so it is retried briefly before being
    /// treated as identity drift.
    async fn password_session(
        &self,
        user: &ab_db::identity::AuthUserRow,
        password: &secrecy::SecretString,
        code: Option<&str>,
    ) -> Result<PasswordSessionOutcome> {
        let who = SessionUser::Id(&user.zitadel_user_id);
        let check = || self.zitadel.create_password_session(&who, password, code);
        let mut outcome = check().await?;
        for delay_ms in ZITADEL_PROJECTION_RETRY_MS {
            if !matches!(outcome, PasswordSessionOutcome::UserNotFound) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
            outcome = check().await?;
        }
        Ok(outcome)
    }

    /// Fenced twice in a row: answer as a fresh login would - 403 if the
    /// account is now disabled, 401 `mfa-required` if TOTP is now enrolled
    /// and no code came, else 401 (the password may have changed).
    async fn fenced_login(
        &self,
        user: &ab_db::identity::AuthUserRow,
        input: &LoginInput,
    ) -> Result<Error> {
        if ab_db::identity::user_status(&self.pool, user.id).await? != Some("active".to_owned()) {
            return Ok(Error::app(
                ErrorCode::AccountDisabled,
                "account is disabled",
            ));
        }
        if input.totp_code.is_none() && self.totp_enrolled(&user.zitadel_user_id).await? {
            return Ok(Error::app(ErrorCode::MfaRequired, "one-time code required"));
        }
        Ok(Error::app(
            ErrorCode::InvalidCredentials,
            "invalid credentials",
        ))
    }

    async fn totp_enrolled(&self, zitadel_user_id: &str) -> Result<bool> {
        Ok(self
            .zitadel
            .list_auth_method_types(zitadel_user_id)
            .await?
            .iter()
            .any(|m| m == TOTP_METHOD))
    }

    /// Best-effort: our session is the credential, Zitadel's is bookkeeping.
    async fn discard_zitadel_session(
        &self,
        zsession: &ab_clients::zitadel::ZitadelSession,
        why: &str,
    ) {
        if let Err(err) = self
            .zitadel
            .delete_session(&zsession.session_id, &zsession.session_token)
            .await
        {
            tracing::warn!(%err, why, "discarding zitadel session failed");
        }
    }

    // ── Account creation (self-registration + admin) ───────────────────────

    async fn enforce_register_limit(
        &self,
        ip: Option<&str>,
        bucket: &str,
        (limit, window): (u32, Duration),
    ) -> Result<()> {
        let Some(ip) = ip else { return Ok(()) };
        let key = format!("rl:register:{bucket}:ip:{ip}");
        self.enforce(&key, (limit, window), "registration").await
    }

    /// Legacy `_validate_unique_username` / `_validate_unique_email`, as
    /// dedicated codes instead of a Russian 400 detail.
    async fn require_unique(&self, username: &str, email: &str) -> Result<()> {
        if ab_db::identity::find_user_id_by_username(&self.pool, username)
            .await?
            .is_some()
        {
            return Err(Error::app(
                ErrorCode::UsernameTaken,
                "username is already taken",
            ));
        }
        if ab_db::identity::find_user_id_by_email(&self.pool, email)
            .await?
            .is_some()
        {
            return Err(Error::app(
                ErrorCode::EmailTaken,
                "email is already registered",
            ));
        }
        Ok(())
    }

    /// Zitadel human + `users` row with the default `user` role. Returns the
    /// profile and the email verification code (unverified accounts only).
    async fn create_account(
        &self,
        account: &NewAccount,
        email_verified: bool,
    ) -> Result<(Profile, Option<String>)> {
        // BUG-148: `length(min = 1)` lets whitespace through; Zitadel then
        // rejects the empty profile name with a generic code 3.
        let first_name = required_name("first_name", &account.first_name)?;
        let last_name = required_name("last_name", &account.last_name)?;
        self.require_unique(&account.username, &account.email)
            .await?;
        let created = self
            .zitadel
            .create_human_user_with_email_code(&NewHumanUser {
                username: account.username.clone(),
                given_name: first_name.clone(),
                family_name: last_name.clone(),
                email: account.email.clone(),
                email_verified,
                password: match &account.password {
                    Some(password) => PasswordSpec::Plain(password.clone()),
                    None => PasswordSpec::None,
                },
            })
            .await
            .map_err(|err| {
                // Zitadel's own uniqueness check (login names span providers
                // - a Google-created account may hold the name).
                if err.code() == ErrorCode::Conflict {
                    Error::app(ErrorCode::UsernameTaken, "username is already taken")
                } else {
                    err
                }
            })?;
        let inserted = ab_db::identity::create_user_with_default_role(
            &self.pool,
            &created.user_id,
            &account.username,
            &account.email,
            &format!("{first_name} {last_name}"),
            account.language.map(Language::code),
            &profile_name(&account.organization).unwrap_or_default(),
        )
        .await;
        let user_id = match inserted {
            Ok(Some(user_id)) => user_id,
            // Lost a race since `require_unique`, or the insert itself
            // failed: undo the Zitadel side - a Zitadel user without a row
            // burns the login name for good (BUG-213).
            other => {
                if let Err(err) = self.zitadel.delete_user(&created.user_id).await {
                    tracing::warn!(%err, "compensating zitadel user delete failed");
                }
                return Err(match other {
                    Err(err) => err,
                    // Name the field that actually collided (BUG-222 nit:
                    // an email race answered `username-taken`).
                    Ok(_) => self
                        .require_unique(&account.username, &account.email)
                        .await
                        .err()
                        .unwrap_or_else(|| {
                            Error::app(
                                ErrorCode::UsernameTaken,
                                "username or email is already taken",
                            )
                        }),
                });
            }
        };
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(user_id),
            "account-created",
            account.ip.as_deref(),
            account.user_agent.as_deref(),
            serde_json::json!({ "email_verified": email_verified }),
        )
        .await?;
        let profile = ab_db::identity::get_profile(&self.pool, user_id)
            .await?
            .ok_or_else(|| Error::not_found("user"))?;
        Ok((profile, created.email_code))
    }

    /// Public self-registration (DECISIONS 2026-09-12). The verification
    /// code goes out via Resend; without a mailer it is logged and the
    /// account still works - the legacy never gated login on verification.
    pub async fn register(&self, account: NewAccount) -> Result<Profile> {
        let ip = account.ip.as_deref();
        self.enforce_register_limit(
            ip,
            "attempt",
            (self.limits.register_attempt_ip, REGISTER_ATTEMPT_IP_WINDOW),
        )
        .await?;
        required_name("organization", &account.organization)?;
        // Only registrations that get past the uniqueness check count toward
        // the tight cap (`create_account` re-checks; two index lookups).
        self.require_unique(&account.username, &account.email)
            .await?;
        // The `created` cap is read before and counted after the account
        // exists: a policy-rejected password (422) or a Zitadel outage must
        // not eat the classroom's budget.
        let created_key = ip.map(|ip| format!("rl:register:created:ip:{ip}"));
        let (limit, window) = (self.limits.register_ip, REGISTER_IP_WINDOW);
        if let Some(key) = &created_key
            && self.limiter.count(key).await? >= limit
        {
            return Err(self
                .rate_limited(key, window, "too many registration attempts")
                .await?);
        }
        let (profile, code) = self.create_account(&account, false).await?;
        if let Some(key) = &created_key {
            self.limiter.check(key, limit, window).await?;
        }
        if let Some(code) = code {
            self.deliver_verification_code(&profile, &code, account.language)
                .await;
        }
        Ok(profile)
    }

    async fn deliver_verification_code(
        &self,
        profile: &Profile,
        code: &str,
        language: Option<Language>,
    ) {
        self.deliver_code(
            CodeMail::Verification,
            Recipient {
                id: profile.id,
                email: &profile.email,
                name: &profile.display_name,
            },
            code,
            language,
        )
        .await;
    }

    /// Mail a Zitadel code with its web link. Without a mailer the code is
    /// logged (dev; the web e2e reads it from the API log) and the flow
    /// goes on; a send failure is logged too, never surfaced.
    async fn deliver_code(
        &self,
        mail: CodeMail,
        to: Recipient<'_>,
        code: &str,
        language: Option<Language>,
    ) {
        let Some(mailer) = &self.mailer else {
            tracing::warn!(
                user_id = %to.id,
                email = %to.email,
                code,
                "resend not configured: {} code not delivered",
                mail.what()
            );
            return;
        };
        let base = self
            .web_url
            .as_deref()
            .map(|b| b.trim_end_matches('/'))
            .unwrap_or_default();
        let link = format!(
            "{base}{path}?email={}&code={code}",
            query_encode(to.email),
            path = mail.link().path(language),
        );
        let (subject, code_line, action, ignore) = mail.copy();
        let html = format!(
            "<p>Здравствуйте, {name}!</p>\
             <p>{code_line}: <strong>{code}</strong></p>\
             <p><a href=\"{link}\">{action}</a></p>\
             <p>{ignore}</p>",
            name = html_escape(to.name),
            link = html_escape(&link),
        );
        if let Err(err) = mailer.send(to.email, subject, &html).await {
            tracing::warn!(%err, user_id = %to.id, "{} email not sent", mail.what());
        }
    }

    /// `POST /auth/password-reset` (S-08): always accepted - the caller
    /// learns nothing about the account. Past the per-IP throttle the lookup,
    /// the Zitadel code and the mail run on a spawned task, so the answer
    /// takes the same time for known and unknown logins. A known, active
    /// account gets at most `email_per_account` mails an hour (silently
    /// capped).
    pub async fn request_password_reset(
        &self,
        login: &str,
        ip: Option<&str>,
        language: Option<Language>,
    ) -> Result<()> {
        self.enforce_reset_ip_limit(ip).await?;
        let this = self.clone();
        let login = login.trim().to_owned();
        tokio::spawn(async move {
            if let Err(err) = this.send_reset_code(&login, language).await {
                tracing::warn!(%err, "password reset code not sent");
            }
        });
        Ok(())
    }

    async fn enforce_reset_ip_limit(&self, ip: Option<&str>) -> Result<()> {
        match ip {
            Some(ip) => {
                self.enforce(
                    &format!("rl:password-reset:ip:{ip}"),
                    (self.limits.password_reset_ip, CODE_MAIL_WINDOW),
                    "password reset",
                )
                .await
            }
            None => Ok(()),
        }
    }

    /// Whether another code mail may go to `user` this hour.
    async fn code_mail_allowed(&self, user: UserId) -> Result<bool> {
        self.limiter
            .check(
                &format!("rl:code-mail:user:{user}"),
                self.limits.email_per_account,
                CODE_MAIL_WINDOW,
            )
            .await
    }

    async fn send_reset_code(&self, login: &str, language: Option<Language>) -> Result<()> {
        let Some(user) = ab_db::identity::find_user_for_login(&self.pool, login).await? else {
            return Ok(());
        };
        if user.status != "active" || !self.code_mail_allowed(user.id).await? {
            return Ok(());
        }
        let code = self
            .zitadel
            .request_password_reset(&user.zitadel_user_id)
            .await?;
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(user.id),
            "password-reset-requested",
            None,
            None,
            serde_json::json!({}),
        )
        .await?;
        self.deliver_code(
            CodeMail::PasswordReset,
            Recipient {
                id: user.id,
                email: &user.email,
                name: &user.display_name,
            },
            &code,
            language.or_else(|| Language::from_locale(&user.locale)),
        )
        .await;
        Ok(())
    }

    /// `POST /auth/password-reset/confirm`: the emailed code + a new
    /// password. Throttled per IP (with the requests); an unknown login and
    /// a wrong code answer the same `reset-code-invalid`. Success revokes
    /// every session of the account (the caller has none - this is the
    /// signed-out door).
    pub async fn confirm_password_reset(
        &self,
        login: &str,
        code: &str,
        new: &SecretString,
        ip: Option<&str>,
    ) -> Result<()> {
        self.enforce_reset_ip_limit(ip).await?;
        let invalid = || {
            Error::app(
                ErrorCode::ResetCodeInvalid,
                "password reset code is invalid or expired",
            )
        };
        let code = code.trim().to_uppercase();
        if code.is_empty() {
            return Err(invalid());
        }
        let Some(user) = ab_db::identity::find_user_for_login(&self.pool, login.trim()).await?
        else {
            return Err(invalid());
        };
        if user.status != "active" {
            return Err(invalid());
        }
        let lock = format!("lock:password:user:{}", user.id);
        if !self.try_lock(&lock).await? {
            return Err(Error::conflict("a password change is already in progress"));
        }
        let set = self
            .zitadel
            .set_password_with_code(&user.zitadel_user_id, &code, new)
            .await;
        self.unlock(&lock).await?;
        set?;
        self.sessions.revoke_all(user.id).await?;
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(user.id),
            "password-reset",
            ip,
            None,
            serde_json::json!({}),
        )
        .await
    }

    /// `POST /auth/verify-email/resend`: a fresh verification code for an
    /// unverified account. Always accepted (no enumeration); throttled per
    /// IP with the registration attempts and per account with the code
    /// mails. Runs on a spawned task like [`Self::request_password_reset`].
    pub async fn resend_verification(
        &self,
        email: &str,
        ip: Option<&str>,
        language: Option<Language>,
    ) -> Result<()> {
        self.enforce_register_limit(
            ip,
            "attempt",
            (self.limits.register_attempt_ip, REGISTER_ATTEMPT_IP_WINDOW),
        )
        .await?;
        let this = self.clone();
        let email = email.trim().to_owned();
        tokio::spawn(async move {
            if let Err(err) = this.send_verification_again(&email, language).await {
                tracing::warn!(%err, "verification code not resent");
            }
        });
        Ok(())
    }

    async fn send_verification_again(&self, email: &str, language: Option<Language>) -> Result<()> {
        let Some(id) = ab_db::identity::find_user_id_by_email(&self.pool, email).await? else {
            return Ok(());
        };
        let Some(user) = ab_db::identity::find_auth_user(&self.pool, id).await? else {
            return Ok(());
        };
        if user.status != "active" || !self.code_mail_allowed(user.id).await? {
            return Ok(());
        }
        let Some(code) = self
            .zitadel
            .resend_email_code(&user.zitadel_user_id)
            .await?
        else {
            return Ok(()); // already verified
        };
        self.deliver_code(
            CodeMail::Verification,
            Recipient {
                id: user.id,
                email: &user.email,
                name: &user.display_name,
            },
            &code,
            language.or_else(|| Language::from_locale(&user.locale)),
        )
        .await;
        Ok(())
    }

    /// Confirm the address with the emailed code. Public: the caller proves
    /// mailbox access, not a session. Uniform 422 on unknown email or wrong
    /// code (no account enumeration).
    pub async fn verify_email(&self, email: &str, code: &str, ip: Option<&str>) -> Result<()> {
        self.enforce_register_limit(
            ip,
            "attempt",
            (self.limits.register_attempt_ip, REGISTER_ATTEMPT_IP_WINDOW),
        )
        .await?;
        let invalid = || {
            Error::validation(vec![FieldError {
                field: "code".into(),
                code: "invalid".into(),
                message: "verification code is invalid or expired".into(),
            }])
        };
        // Zitadel's email codes are uppercase letters + digits; a code typed
        // in lowercase is the same code (UX-205). A blank one is simply wrong
        // - Zitadel never sees it (UX-211).
        let code = code.trim().to_uppercase();
        if code.is_empty() {
            return Err(invalid());
        }
        let Some(user) = ab_db::identity::find_user_for_login(&self.pool, email).await? else {
            return Err(invalid());
        };
        // One verify per account at a time (UX-273): Zitadel accepts the same
        // code twice when the calls overlap, which audited it twice. The
        // route is `detached()`, so the lock is always handed back.
        let lock = format!("lock:verify-email:user:{}", user.id);
        if !self.try_lock(&lock).await? {
            return Err(Error::app(
                ErrorCode::IdempotencyInProgress,
                "an email verification is already in progress",
            ));
        }
        let verified = self.confirm_email(&user, &code, ip).await;
        self.unlock(&lock).await?;
        verified
    }

    async fn confirm_email(
        &self,
        user: &ab_db::identity::AuthUserRow,
        code: &str,
        ip: Option<&str>,
    ) -> Result<()> {
        self.zitadel
            .verify_email(&user.zitadel_user_id, code)
            .await?;
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(user.id),
            "email-verified",
            ip,
            None,
            serde_json::json!({}),
        )
        .await
    }

    /// Admin creation (`POST /users`): the email is taken as verified (the
    /// admin vouches for it, as the legacy did); optional extra roles.
    pub async fn admin_create_user(
        &self,
        actor: &Actor,
        account: NewAccount,
        roles: &[String],
    ) -> Result<ab_db::identity::AdminUserRow> {
        actor.require(MANAGE_PLATFORM)?;
        let mut role_ids = Vec::with_capacity(roles.len());
        for slug in roles {
            let role = ab_db::identity::find_role_by_slug(&self.pool, slug)
                .await?
                .ok_or_else(|| {
                    Error::validation(vec![FieldError {
                        field: "roles".into(),
                        code: "invalid".into(),
                        message: format!("unknown role '{slug}'"),
                    }])
                })?;
            role_ids.push(role.id);
        }
        let (profile, _) = self.create_account(&account, true).await?;
        for role_id in role_ids {
            ab_db::identity::assign_role(&self.pool, profile.id, role_id).await?;
        }
        ab_db::identity::get_admin_user(&self.pool, profile.id)
            .await?
            .ok_or_else(|| Error::not_found("user"))
    }

    /// Change the caller's password through Zitadel (current password
    /// checked there). Every other session of the user is revoked - the
    /// legacy tracked `password_changed_at` for exactly this.
    pub async fn change_password(
        &self,
        actor: &Actor,
        current: &SecretString,
        new: &SecretString,
    ) -> Result<()> {
        // Wrong current passwords are counted per user; a policy or outage
        // failure is not a guess and hands the attempt back.
        let key = format!("rl:password:user:{}", actor.user_id);
        self.enforce(
            &key,
            (self.limits.password_check, PASSWORD_CHECK_WINDOW),
            "password",
        )
        .await?;
        // One change per user at a time (BUG-222 nit): two concurrent
        // changes with the same current password both passed Zitadel and
        // revoked each other. The runner is `detached()` (BUG-214), so the
        // lock is always handed back; the TTL covers a crash.
        let lock = format!("lock:password:user:{}", actor.user_id);
        if !self.try_lock(&lock).await? {
            self.limiter.release(&key).await?;
            return Err(Error::conflict("a password change is already in progress"));
        }
        let changed = self
            .zitadel
            .change_password(&actor.zitadel_user_id, current, new)
            .await;
        self.unlock(&lock).await?;
        if let Err(err) = changed {
            if err.code() != ErrorCode::InvalidCredentials {
                self.limiter.release(&key).await?;
            }
            return Err(err);
        }
        self.limiter.clear(&key).await?;
        // Fenced (BUG-203): a login Zitadel accepted with the old password
        // before the change cannot open a session after it.
        self.sessions
            .revoke_others(actor.user_id, &actor.session_id)
            .await?;
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(actor.user_id),
            "password-changed",
            None,
            None,
            serde_json::json!({}),
        )
        .await
    }

    /// Per-user mutex in Redis (`SET NX`), 30 s TTL for a crash; callers run
    /// under `detached()` so the lock is always handed back.
    async fn try_lock(&self, key: &str) -> Result<bool> {
        let mut redis = self.sessions.redis();
        let locked: Option<String> = redis::cmd("SET")
            .arg(key)
            .arg(1)
            .arg("NX")
            .arg("EX")
            .arg(30)
            .query_async(&mut redis)
            .await
            .map_err(|e| Error::internal("taking lock", e))?;
        Ok(locked.is_some())
    }

    async fn unlock(&self, key: &str) -> Result<()> {
        let mut redis = self.sessions.redis();
        let _: i64 = redis
            .del(key)
            .await
            .map_err(|e| Error::internal("releasing lock", e))?;
        Ok(())
    }

    // ── TOTP self-service (optional MFA, DECISIONS.md: TOTP only) ──────────

    /// Start TOTP enrollment; returns the otpauth URI + secret for the
    /// authenticator app. Conflict if already enrolled and verified.
    ///
    /// A start within [`TOTP_ENROL_TTL`] of a pending one returns that
    /// pending secret again (UX-254: Zitadel replaces the pending secret on
    /// every registration - a second tab would otherwise kill the first
    /// tab's QR). Two starts racing to Zitadel are serialized on a per-user
    /// lock; the loser answers `idempotency-in-progress` and its retry gets
    /// the winner's secret. The lock is held until the pending secret is
    /// stored, and the pending key is re-read under it (BUG-368): a start
    /// that takes the lock after us must find our secret, not re-register
    /// and kill it. The route is `detached()`, so the lock is always handed
    /// back; the TTL covers a crash.
    pub async fn totp_enroll(&self, actor: &Actor) -> Result<TotpRegistration> {
        if let Some(pending) = self.pending_totp(actor).await? {
            return Ok(pending);
        }
        let lock = format!("lock:totp:user:{}", actor.user_id);
        if !self.try_lock(&lock).await? {
            return Err(Error::app(
                ErrorCode::IdempotencyInProgress,
                "a totp enrolment start is already in progress",
            ));
        }
        let started = self.start_totp(actor).await;
        self.unlock(&lock).await?;
        started
    }

    /// The enrolment start under the per-user lock.
    async fn start_totp(&self, actor: &Actor) -> Result<TotpRegistration> {
        if let Some(pending) = self.pending_totp(actor).await? {
            return Ok(pending);
        }
        let mut registration = self.zitadel.register_totp(&actor.zitadel_user_id).await?;
        let issuer = ab_db::platform::get_platform(&self.pool)
            .await?
            .map(|platform| platform.name)
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_PLATFORM_NAME.to_owned());
        registration.uri = brand_otpauth_uri(&registration.uri, &issuer);
        let payload = serde_json::to_string(&(
            &registration.uri,
            secrecy::ExposeSecret::expose_secret(&registration.secret),
        ))
        .map_err(|e| Error::internal("serializing pending totp enrolment", e))?;
        let mut redis = self.sessions.redis();
        let () = redis
            .set_ex(totp_pending_key(actor), payload, TOTP_ENROL_TTL.as_secs())
            .await
            .map_err(|e| Error::internal("storing pending totp enrolment", e))?;
        Ok(registration)
    }

    async fn pending_totp(&self, actor: &Actor) -> Result<Option<TotpRegistration>> {
        let mut redis = self.sessions.redis();
        let pending: Option<String> = redis
            .get(totp_pending_key(actor))
            .await
            .map_err(|e| Error::internal("reading pending totp enrolment", e))?;
        let Some(pending) = pending else {
            return Ok(None);
        };
        // An unreadable entry is no enrolment: the start registers anew and
        // overwrites it instead of failing for the whole TTL.
        let Ok((uri, secret)) = serde_json::from_str::<(String, String)>(&pending) else {
            tracing::warn!(user_id = %actor.user_id, "corrupt pending totp enrolment");
            return Ok(None);
        };
        Ok(Some(TotpRegistration {
            uri,
            secret: SecretString::from(secret),
        }))
    }

    /// Activate the enrollment with a first code.
    pub async fn totp_activate(&self, actor: &Actor, code: &str) -> Result<()> {
        let verified = self.zitadel.verify_totp(&actor.zitadel_user_id, code).await;
        // A wrong code leaves the pending secret valid; anything else
        // (activated, no enrolment pending) ends it.
        if let Err(err) = verified {
            if err.code() != ErrorCode::InvalidTotpCode {
                self.forget_pending_totp(actor).await?;
            }
            return Err(err);
        }
        // Activated at Zitadel: the session flag and audit come first and
        // clearing the pending entry is best-effort (it expires on its own),
        // so a Redis error there cannot answer 500 for an active TOTP.
        self.sessions.set_mfa_enabled(actor.user_id, true).await?;
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(actor.user_id),
            "mfa-enrolled",
            None,
            None,
            serde_json::json!({ "method": "totp" }),
        )
        .await?;
        if let Err(err) = self.forget_pending_totp(actor).await {
            tracing::warn!(%err, user_id = %actor.user_id, "pending totp enrolment not cleared");
        }
        Ok(())
    }

    /// Remove the TOTP authenticator (idempotent).
    pub async fn totp_remove(&self, actor: &Actor) -> Result<()> {
        self.zitadel.remove_totp(&actor.zitadel_user_id).await?;
        self.forget_pending_totp(actor).await?;
        self.sessions.set_mfa_enabled(actor.user_id, false).await?;
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

    async fn forget_pending_totp(&self, actor: &Actor) -> Result<()> {
        let mut redis = self.sessions.redis();
        let _: i64 = redis
            .del(totp_pending_key(actor))
            .await
            .map_err(|e| Error::internal("clearing pending totp enrolment", e))?;
        Ok(())
    }

    /// Terminate the actor's current session (idempotent). Our session is
    /// the credential, so it goes first (BUG-311); the Zitadel-side delete
    /// is best-effort bookkeeping after it.
    pub async fn logout(&self, actor: &Actor) -> Result<()> {
        let record = self.sessions.peek(&actor.session_id).await?;
        self.sessions
            .revoke(actor.user_id, &actor.session_id)
            .await?;
        if let Some(record) = record {
            let token = SecretString::from(record.zitadel_session_token);
            if let Err(err) = self
                .zitadel
                .delete_session(&record.zitadel_session_id, &token)
                .await
            {
                tracing::warn!(%err, "zitadel session delete failed (continuing logout)");
            }
        }
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
            if let Some(record) = self.sessions.peek(&id).await? {
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
}

#[cfg(test)]
mod tests {
    use super::brand_otpauth_uri;

    #[test]
    fn otpauth_label_and_issuer_are_rebranded() {
        let uri = "otpauth://totp/ZITADEL:aigerim@example.com?algorithm=SHA1&digits=6&issuer=ZITADEL&period=30&secret=S3CRET";
        assert_eq!(
            brand_otpauth_uri(uri, "Ashyq Bilim"),
            "otpauth://totp/Ashyq%20Bilim:aigerim@example.com?algorithm=SHA1&digits=6&period=30&secret=S3CRET&issuer=Ashyq%20Bilim"
        );
        assert_eq!(
            brand_otpauth_uri("otpauth://totp/ZITADEL%3Auser?secret=X", "AB"),
            "otpauth://totp/AB:user?secret=X&issuer=AB"
        );
        assert_eq!(
            brand_otpauth_uri("otpauth://hotp/x", "AB"),
            "otpauth://hotp/x"
        );
    }
}
