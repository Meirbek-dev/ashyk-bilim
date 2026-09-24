//! Typed Zitadel client (Session API v2 + User API v2), authenticated with the
//! provisioner machine-user PAT.
//!
//! Wire shapes are pinned by wiremock fixtures in `tests/zitadel.rs` that
//! replicate responses captured from a live Zitadel (2026-08-16, image digest
//! in docker-compose.rewrite.yml). If Zitadel changes shape on upgrade, those
//! tests are the tripwire.

use ab_core::{Error, ErrorCode, Result};
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct ZitadelConfig {
    /// Origin only, no trailing slash: `http://localhost:8081`.
    pub base_url: String,
    /// Machine-user PAT (from `ZITADEL_FIRSTINSTANCE_PATPATH`).
    pub pat: SecretString,
}

pub struct ZitadelClient {
    http: reqwest::Client,
    config: ZitadelConfig,
}

/// Which user a session check targets.
#[derive(Debug, Clone, Copy)]
pub enum SessionUser<'a> {
    /// Zitadel user id (the app's login path: our row is resolved first).
    Id(&'a str),
    /// Zitadel login name (diagnostics / smoke checks).
    LoginName(&'a str),
}

/// Outcome of a password session check — invalid credentials are a domain
/// outcome, not an error (the caller decides rate limiting / lockout UX).
#[derive(Debug)]
pub enum PasswordSessionOutcome {
    Ok(ZitadelSession),
    InvalidCredentials {
        failed_attempts: i64,
    },
    /// Password was right but the supplied TOTP code was not (captured live:
    /// code 3 with a plain detail — no `failedAttempts`).
    InvalidTotp,
    UserNotFound,
}

/// TOTP enrollment secrets (captured live 2026-08-16: `{details, uri, secret}`).
#[derive(Debug)]
pub struct TotpRegistration {
    pub uri: String,
    pub secret: SecretString,
}

#[derive(Debug, Clone)]
pub struct ZitadelSession {
    pub session_id: String,
    pub session_token: SecretString,
}

/// New human user. `PasswordSpec::Hash` is the ETL import path (argon2/bcrypt
/// modular-crypt strings pass through Zitadel's passwap verifier).
#[derive(Debug)]
pub struct NewHumanUser {
    pub username: String,
    pub given_name: String,
    pub family_name: String,
    pub email: String,
    pub email_verified: bool,
    pub password: PasswordSpec,
}

/// `POST /v2/users/human` answer; `email_code` only when the email was
/// created unverified with `returnCode`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedHumanUser {
    pub user_id: String,
    #[serde(default)]
    pub email_code: Option<String>,
}

#[derive(Debug)]
pub enum PasswordSpec {
    Plain(SecretString),
    Hash(String),
    /// IdP-only accounts (e.g. Google-linked) have no local password.
    None,
}

#[derive(Debug, Deserialize)]
struct ZitadelErrorBody {
    #[serde(default)]
    code: i64,
    #[serde(default)]
    message: String,
    #[serde(default)]
    details: Vec<serde_json::Value>,
}

impl ZitadelErrorBody {
    /// Zitadel's stable error ids (`details[].id`, e.g. `COMMAND-CahN2`) —
    /// the only reliable discriminator behind generic gRPC codes.
    fn detail_ids(&self) -> impl Iterator<Item = &str> {
        self.details
            .iter()
            .filter_map(|d| d.get("id").and_then(serde_json::Value::as_str))
    }
}

/// 422 on `field` for a password Zitadel's complexity policy rejects; the
/// web catalog renders `password-policy` as the localized rule. The trailing
/// Zitadel error id («… (COMMA-VoaRj)») is dropped from the message.
/// Zitadel messages end in their error id: "… is empty (USER-UCej2)".
fn strip_error_id(message: &str) -> &str {
    message
        .rsplit_once(" (")
        .filter(|(_, tail)| tail.ends_with(')') && tail.contains('-'))
        .map_or(message, |(head, _)| head)
}

/// A transport failure (refused, reset, the 10 s timeout) is an outage of
/// the identity provider, not a bug of ours: 503 `service-unavailable`
/// (BUG-222 nit), with the cause in the log only.
fn unavailable(what: &'static str) -> impl FnOnce(reqwest::Error) -> Error {
    move |err| {
        tracing::warn!(%err, what, "zitadel unreachable");
        Error::app(
            ErrorCode::ServiceUnavailable,
            format!("{what}: identity provider unreachable"),
        )
    }
}

fn password_policy_error(field: &str, message: &str) -> Error {
    Error::validation(vec![ab_core::FieldError {
        field: field.into(),
        code: "password-policy".into(),
        message: strip_error_id(message).to_owned(),
    }])
}

impl ZitadelClient {
    pub fn new(config: ZitadelConfig) -> Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| Error::internal("building zitadel http client", e))?;
        Ok(Self { http, config })
    }

    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.config.base_url)
    }

    fn auth(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        req.bearer_auth(self.config.pat.expose_secret())
    }

    /// `POST /v2/sessions` with a user check + password (+ optional TOTP).
    /// The user check is by Zitadel user id — our `users` row is resolved
    /// first, so a login typed as username *or* email works regardless of
    /// which one Zitadel holds as the login name.
    pub async fn create_password_session(
        &self,
        user: &SessionUser<'_>,
        password: &SecretString,
        totp_code: Option<&str>,
    ) -> Result<PasswordSessionOutcome> {
        let user_check = match user {
            SessionUser::Id(id) => serde_json::json!({ "userId": id }),
            SessionUser::LoginName(name) => serde_json::json!({ "loginName": name }),
        };
        let mut body = serde_json::json!({
            "checks": {
                "user": user_check,
                "password": { "password": password.expose_secret() },
            }
        });
        if let Some(code) = totp_code {
            body["checks"]["totp"] = serde_json::json!({ "code": code });
        }
        let response = self
            .auth(self.http.post(self.url("/v2/sessions")))
            .json(&body)
            .send()
            .await
            .map_err(unavailable("create session"))?;

        if response.status().is_success() {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Ok {
                session_id: String,
                session_token: String,
            }
            let ok: Ok = response
                .json()
                .await
                .map_err(|e| Error::internal("zitadel session response shape", e))?;
            return Result::Ok(PasswordSessionOutcome::Ok(ZitadelSession {
                session_id: ok.session_id,
                session_token: SecretString::from(ok.session_token),
            }));
        }

        let err: ZitadelErrorBody = response
            .json()
            .await
            .map_err(|e| Error::internal("zitadel error response shape", e))?;
        tracing::debug!(code = err.code, message = %err.message, "zitadel session check rejected");
        // Captured live: invalid password → code 3 with a CredentialsCheckError
        // detail carrying failedAttempts; unknown user → code 5 (NotFound).
        if err.code == 5 {
            return Result::Ok(PasswordSessionOutcome::UserNotFound);
        }
        // 9 = FailedPrecondition: a TOTP code was sent for an account with no
        // authenticator ("Multifactor OTP (OneTimePassword) isn't ready",
        // COMMAND-3Mif9s) — a bad second factor, not an outage.
        if err.code == 9 && totp_code.is_some() {
            return Result::Ok(PasswordSessionOutcome::InvalidTotp);
        }
        // 9 = FailedPrecondition: the account has no password at all
        // ("User has not set a password", COMMAND-3nJ4t — admin-created or
        // Google-only accounts, BUG-143): a credential failure, not an outage.
        if err.message.contains("COMMAND-3nJ4t") || err.detail_ids().any(|id| id == "COMMAND-3nJ4t")
        {
            return Result::Ok(PasswordSessionOutcome::InvalidCredentials { failed_attempts: 0 });
        }
        if err.code == 3 {
            // Password failures carry a CredentialsCheckError detail with
            // `failedAttempts`; TOTP failures are a plain detail (captured live).
            let failed_attempts = err
                .details
                .iter()
                .find_map(|d| d.get("failedAttempts").and_then(serde_json::Value::as_i64));
            return Result::Ok(match failed_attempts {
                Some(failed_attempts) => {
                    PasswordSessionOutcome::InvalidCredentials { failed_attempts }
                }
                None => PasswordSessionOutcome::InvalidTotp,
            });
        }
        Err(Error::app(
            ErrorCode::ServiceUnavailable,
            format!(
                "zitadel session check failed: {} ({})",
                err.message, err.code
            ),
        ))
    }

    /// `DELETE /v2/sessions/{id}` — terminate a Zitadel session (logout).
    pub async fn delete_session(
        &self,
        session_id: &str,
        session_token: &SecretString,
    ) -> Result<()> {
        let body = serde_json::json!({ "sessionToken": session_token.expose_secret() });
        let response = self
            .auth(
                self.http
                    .delete(self.url(&format!("/v2/sessions/{session_id}"))),
            )
            .json(&body)
            .send()
            .await
            .map_err(unavailable("delete session"))?;
        // Already-gone sessions are fine — logout must be idempotent.
        if response.status().is_success() || response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(());
        }
        Err(Error::app(
            ErrorCode::ServiceUnavailable,
            format!("zitadel session delete failed: {}", response.status()),
        ))
    }

    /// `GET /management/v1/orgs/me` — deploy diagnostics: proves the base URL
    /// and PAT are valid. Returns (org id, org name).
    pub async fn org_info(&self) -> Result<(String, String)> {
        #[derive(Deserialize)]
        struct OrgEnvelope {
            org: Org,
        }
        #[derive(Deserialize)]
        struct Org {
            id: String,
            name: String,
        }
        let response = self
            .auth(self.http.get(self.url("/management/v1/orgs/me")))
            .send()
            .await
            .map_err(unavailable("org lookup"))?;
        if !response.status().is_success() {
            return Err(Error::app(
                ErrorCode::ServiceUnavailable,
                format!(
                    "zitadel org lookup failed: {} (check PAT)",
                    response.status()
                ),
            ));
        }
        let envelope: OrgEnvelope = response
            .json()
            .await
            .map_err(|e| Error::internal("zitadel org shape", e))?;
        Ok((envelope.org.id, envelope.org.name))
    }

    /// `GET /v2/users/{id}/authentication_methods` — e.g.
    /// `AUTHENTICATION_METHOD_TYPE_TOTP`, `AUTHENTICATION_METHOD_TYPE_PASSWORD`.
    pub async fn list_auth_method_types(&self, user_id: &str) -> Result<Vec<String>> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Methods {
            #[serde(default)]
            auth_method_types: Vec<String>,
        }
        let response = self
            .auth(
                self.http
                    .get(self.url(&format!("/v2/users/{user_id}/authentication_methods"))),
            )
            .send()
            .await
            .map_err(unavailable("list auth methods"))?;
        if !response.status().is_success() {
            return Err(Error::app(
                ErrorCode::ServiceUnavailable,
                format!("zitadel auth methods listing failed: {}", response.status()),
            ));
        }
        let methods: Methods = response
            .json()
            .await
            .map_err(|e| Error::internal("zitadel auth methods shape", e))?;
        Ok(methods.auth_method_types)
    }

    /// `GET /v2/users/{id}` → `user.human.email.isVerified` (captured live
    /// 2026-09-24; proto3 omits `false`).
    pub async fn email_verified(&self, user_id: &str) -> Result<bool> {
        #[derive(Deserialize)]
        struct Envelope {
            user: User,
        }
        #[derive(Deserialize)]
        struct User {
            #[serde(default)]
            human: Option<Human>,
        }
        #[derive(Deserialize)]
        struct Human {
            #[serde(default)]
            email: Option<Email>,
        }
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Email {
            #[serde(default)]
            is_verified: bool,
        }
        let response = self
            .auth(self.http.get(self.url(&format!("/v2/users/{user_id}"))))
            .send()
            .await
            .map_err(unavailable("get user"))?;
        if !response.status().is_success() {
            return Err(Error::app(
                ErrorCode::ServiceUnavailable,
                format!("zitadel user lookup failed: {}", response.status()),
            ));
        }
        let envelope: Envelope = response
            .json()
            .await
            .map_err(|e| Error::internal("zitadel user shape", e))?;
        Ok(envelope
            .user
            .human
            .and_then(|h| h.email)
            .is_some_and(|e| e.is_verified))
    }

    /// `POST /v2/users/{id}/totp` — start TOTP enrollment (idempotency:
    /// re-registering before verification returns a fresh secret; an already
    /// verified TOTP yields `AlreadyExists`/`AlreadyReady` → Conflict).
    pub async fn register_totp(&self, user_id: &str) -> Result<TotpRegistration> {
        #[derive(Deserialize)]
        struct Registered {
            uri: String,
            secret: String,
        }
        let response = self
            .auth(
                self.http
                    .post(self.url(&format!("/v2/users/{user_id}/totp"))),
            )
            .json(&serde_json::json!({}))
            .send()
            .await
            .map_err(unavailable("totp register"))?;
        if response.status().is_success() {
            let registered: Registered = response
                .json()
                .await
                .map_err(|e| Error::internal("zitadel totp register shape", e))?;
            return Ok(TotpRegistration {
                uri: registered.uri,
                secret: SecretString::from(registered.secret),
            });
        }
        let err: ZitadelErrorBody = response
            .json()
            .await
            .map_err(|e| Error::internal("zitadel error response shape", e))?;
        // 6 = AlreadyExists ("Multifactor OTP is already set up", COMMAND-do9se),
        // 9 = FailedPrecondition (`AlreadyReady`): both mean "enrolled".
        if matches!(err.code, 6 | 9) {
            return Err(Error::conflict("totp is already enrolled"));
        }
        Err(Error::app(
            ErrorCode::ServiceUnavailable,
            format!(
                "zitadel totp register failed: {} ({})",
                err.message, err.code
            ),
        ))
    }

    /// `POST /v2/users/{id}/totp/verify` — activate enrollment with a code.
    pub async fn verify_totp(&self, user_id: &str, code: &str) -> Result<()> {
        let response = self
            .auth(
                self.http
                    .post(self.url(&format!("/v2/users/{user_id}/totp/verify"))),
            )
            .json(&serde_json::json!({ "code": code }))
            .send()
            .await
            .map_err(unavailable("totp verify"))?;
        if response.status().is_success() {
            return Ok(());
        }
        let err: ZitadelErrorBody = response
            .json()
            .await
            .map_err(|e| Error::internal("zitadel error response shape", e))?;
        match err.code {
            3 => Err(Error::app(
                ErrorCode::InvalidTotpCode,
                "invalid one-time code",
            )),
            // 5 = NotFound "Multifactor OTP (OneTimePassword) doesn't exist"
            // (COMMAND-3Mif9s, captured live 2026-09-13): no enrolment was
            // started (or it was cancelled) — the caller's state, not an outage.
            5 => Err(Error::conflict("totp enrolment not started")),
            9 => Err(Error::conflict("totp is already enrolled")),
            _ => Err(Error::app(
                ErrorCode::ServiceUnavailable,
                format!("zitadel totp verify failed: {} ({})", err.message, err.code),
            )),
        }
    }

    /// `DELETE /v2/users/{id}/totp` — remove the authenticator.
    pub async fn remove_totp(&self, user_id: &str) -> Result<()> {
        let response = self
            .auth(
                self.http
                    .delete(self.url(&format!("/v2/users/{user_id}/totp"))),
            )
            .send()
            .await
            .map_err(unavailable("totp remove"))?;
        if response.status().is_success() || response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(());
        }
        Err(Error::app(
            ErrorCode::ServiceUnavailable,
            format!("zitadel totp remove failed: {}", response.status()),
        ))
    }

    /// `POST /v2/users/human`. Returns the Zitadel user id.
    pub async fn create_human_user(&self, user: &NewHumanUser) -> Result<String> {
        Ok(self.create_human(user).await?.user_id)
    }

    /// `POST /v2/users/human` for an unverified email: Zitadel returns the
    /// verification code (`returnCode`, captured live 2026-09-12:
    /// `{userId, details, emailCode}`) and we deliver it ourselves.
    pub async fn create_human_user_with_email_code(
        &self,
        user: &NewHumanUser,
    ) -> Result<CreatedHumanUser> {
        self.create_human(user).await
    }

    async fn create_human(&self, user: &NewHumanUser) -> Result<CreatedHumanUser> {
        let email = if user.email_verified {
            serde_json::json!({ "email": user.email, "isVerified": true })
        } else {
            serde_json::json!({ "email": user.email, "returnCode": {} })
        };
        let mut body = serde_json::json!({
            "username": user.username,
            "profile": {
                "givenName": user.given_name,
                "familyName": user.family_name,
            },
            "email": email,
        });
        match &user.password {
            PasswordSpec::Plain(secret) => {
                body["password"] = serde_json::json!({
                    "password": secret.expose_secret(),
                    "changeRequired": false,
                });
            }
            PasswordSpec::Hash(hash) => {
                body["hashedPassword"] = serde_json::json!({ "hash": hash });
            }
            PasswordSpec::None => {}
        }
        let response = self
            .auth(self.http.post(self.url("/v2/users/human")))
            .json(&body)
            .send()
            .await
            .map_err(unavailable("create user"))?;

        if response.status().is_success() {
            let ok: CreatedHumanUser = response
                .json()
                .await
                .map_err(|e| Error::internal("zitadel create user response shape", e))?;
            return Result::Ok(ok);
        }
        let err: ZitadelErrorBody = response
            .json()
            .await
            .map_err(|e| Error::internal("zitadel error response shape", e))?;
        // 6 = AlreadyExists in Zitadel's gRPC-code convention.
        if err.code == 6 {
            return Err(Error::conflict(format!(
                "zitadel user already exists: {}",
                user.username
            )));
        }
        // 3 = InvalidArgument: the password fails Zitadel's complexity policy
        // (captured live: "Password must contain upper case", COMMA-VoaRj) —
        // or, without a password in play, some other field of ours
        // ("First name in profile is empty", USER-UCej2). Either way it is
        // our input, never an outage (BUG-148).
        if err.code == 3 {
            let message = err.message.to_ascii_lowercase();
            if matches!(user.password, PasswordSpec::Plain(_)) && message.contains("password") {
                return Err(password_policy_error("password", &err.message));
            }
            let field = if message.contains("first name") || message.contains("given name") {
                "first_name"
            } else if message.contains("last name") || message.contains("family name") {
                "last_name"
            } else if message.contains("email") {
                "email"
            } else {
                "username"
            };
            return Err(Error::validation(vec![ab_core::FieldError {
                field: field.into(),
                code: "invalid".into(),
                message: strip_error_id(&err.message).to_owned(),
            }]));
        }
        Err(Error::app(
            ErrorCode::ServiceUnavailable,
            format!(
                "zitadel user creation failed: {} ({})",
                err.message, err.code
            ),
        ))
    }

    /// `POST /v2/users/{id}/email/verify` — confirm the address with the
    /// code from [`Self::create_human_user_with_email_code`]. A wrong or
    /// already-used code is code 3 ("Code is invalid", captured live).
    pub async fn verify_email(&self, user_id: &str, code: &str) -> Result<()> {
        let response = self
            .auth(
                self.http
                    .post(self.url(&format!("/v2/users/{user_id}/email/verify"))),
            )
            .json(&serde_json::json!({ "verificationCode": code }))
            .send()
            .await
            .map_err(unavailable("verify email"))?;
        if response.status().is_success() {
            return Ok(());
        }
        let err: ZitadelErrorBody = response
            .json()
            .await
            .map_err(|e| Error::internal("zitadel error response shape", e))?;
        if err.code == 3 {
            return Err(Error::validation(vec![ab_core::FieldError {
                field: "code".into(),
                code: "invalid".into(),
                message: "verification code is invalid or expired".into(),
            }]));
        }
        Err(Error::app(
            ErrorCode::ServiceUnavailable,
            format!(
                "zitadel verify email failed: {} ({})",
                err.message, err.code
            ),
        ))
    }

    /// `POST /v2/users/{id}/password` with the current password as the
    /// check. Captured live 2026-09-12: wrong current password → code 3 with
    /// a `CredentialsCheckError` detail (`failedAttempts`); a new password
    /// that fails the policy → code 3 with a plain detail ("Password is too
    /// short").
    pub async fn change_password(
        &self,
        user_id: &str,
        current: &SecretString,
        new: &SecretString,
    ) -> Result<()> {
        let response = self
            .auth(
                self.http
                    .post(self.url(&format!("/v2/users/{user_id}/password"))),
            )
            .json(&serde_json::json!({
                "newPassword": { "password": new.expose_secret(), "changeRequired": false },
                "currentPassword": current.expose_secret(),
            }))
            .send()
            .await
            .map_err(unavailable("change password"))?;
        if response.status().is_success() {
            return Ok(());
        }
        let err: ZitadelErrorBody = response
            .json()
            .await
            .map_err(|e| Error::internal("zitadel error response shape", e))?;
        if err.code == 3 {
            let credentials_check = err
                .details
                .iter()
                .any(|d| d.get("failedAttempts").is_some());
            if credentials_check {
                return Err(Error::app(
                    ErrorCode::InvalidCredentials,
                    "current password is invalid",
                ));
            }
            return Err(password_policy_error("new_password", &err.message));
        }
        // Zitadel reports "new password equals the current one" as an
        // internal error (code 13, COMMAND-CahN2; captured live 2026-09-13)
        // — but any hashing failure answers the byte-identical body (a bcrypt
        // overflow did, BUG-293), so only an equal pair is the user's mistake.
        if err.code == 13
            && err.detail_ids().any(|id| id == "COMMAND-CahN2")
            && current.expose_secret() == new.expose_secret()
        {
            return Err(Error::validation(vec![ab_core::FieldError {
                field: "new_password".into(),
                code: "password-unchanged".into(),
                message: "new password must differ from the current one".into(),
            }]));
        }
        Err(Error::app(
            ErrorCode::ServiceUnavailable,
            format!(
                "zitadel change password failed: {} ({})",
                err.message, err.code
            ),
        ))
    }

    /// `DELETE /v2/users/{id}` — compensation when our side of an account
    /// creation fails after Zitadel's succeeded. Idempotent.
    pub async fn delete_user(&self, user_id: &str) -> Result<()> {
        let response = self
            .auth(self.http.delete(self.url(&format!("/v2/users/{user_id}"))))
            .send()
            .await
            .map_err(unavailable("delete user"))?;
        if response.status().is_success() || response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(());
        }
        Err(Error::app(
            ErrorCode::ServiceUnavailable,
            format!("zitadel user delete failed: {}", response.status()),
        ))
    }

    /// Resolve an exact login name across the instance. This deprecated v1
    /// endpoint remains part of the pinned Zitadel image and gives the import
    /// command a small, deterministic idempotency check.
    pub async fn user_id_by_login_name(&self, login_name: &str) -> Result<Option<String>> {
        #[derive(Deserialize)]
        struct UserEnvelope {
            user: User,
        }
        #[derive(Deserialize)]
        struct User {
            id: String,
        }

        let mut url = reqwest::Url::parse(&self.url("/management/v1/global/users/_by_login_name"))
            .map_err(|e| Error::internal("building zitadel user lookup URL", e))?;
        url.query_pairs_mut().append_pair("loginName", login_name);
        let response = self
            .auth(self.http.get(url))
            .send()
            .await
            .map_err(unavailable("user lookup"))?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !response.status().is_success() {
            return Err(Error::app(
                ErrorCode::ServiceUnavailable,
                format!("zitadel user lookup failed: {}", response.status()),
            ));
        }
        let envelope: UserEnvelope = response
            .json()
            .await
            .map_err(|e| Error::internal("zitadel user lookup response shape", e))?;
        Ok(Some(envelope.user.id))
    }
}

#[cfg(test)]
#[allow(clippy::panic)]
mod tests {
    #[test]
    fn password_policy_message_drops_the_zitadel_code() {
        let err = super::password_policy_error(
            "password",
            "Password must contain upper case (COMMA-VoaRj)",
        );
        let ab_core::Error::Validation { field_errors } = err else {
            panic!("expected a validation error");
        };
        assert_eq!(field_errors[0].message, "Password must contain upper case");
    }

    /// BUG-222 nit: a Zitadel we cannot reach is a 503, not our 500.
    #[tokio::test]
    async fn unreachable_zitadel_is_service_unavailable() {
        let client = super::ZitadelClient::new(super::ZitadelConfig {
            base_url: "http://127.0.0.1:9".into(),
            pat: "pat".into(),
        })
        .unwrap_or_else(|_| panic!("client builds"));
        let err = client
            .create_password_session(&super::SessionUser::Id("z-1"), &"pw".into(), None)
            .await
            .err()
            .unwrap_or_else(|| panic!("no zitadel on port 9"));
        assert_eq!(err.code(), ab_core::ErrorCode::ServiceUnavailable);
    }
}
