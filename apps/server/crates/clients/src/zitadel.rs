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

    /// `POST /v2/sessions` with loginName + password (+ optional TOTP) checks.
    pub async fn create_password_session(
        &self,
        login_name: &str,
        password: &SecretString,
        totp_code: Option<&str>,
    ) -> Result<PasswordSessionOutcome> {
        let mut body = serde_json::json!({
            "checks": {
                "user": { "loginName": login_name },
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
            .map_err(|e| Error::internal("zitadel create session", e))?;

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
            .map_err(|e| Error::internal("zitadel delete session", e))?;
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
            .map_err(|e| Error::internal("zitadel org lookup", e))?;
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
            .map_err(|e| Error::internal("zitadel list auth methods", e))?;
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

    /// `POST /v2/users/{id}/totp` — start TOTP enrollment (idempotency:
    /// re-registering before verification returns a fresh secret; an already
    /// verified TOTP yields code 9 `AlreadyReady` → Conflict).
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
            .map_err(|e| Error::internal("zitadel totp register", e))?;
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
        if err.code == 9 {
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
            .map_err(|e| Error::internal("zitadel totp verify", e))?;
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
            .map_err(|e| Error::internal("zitadel totp remove", e))?;
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
        let mut body = serde_json::json!({
            "username": user.username,
            "profile": {
                "givenName": user.given_name,
                "familyName": user.family_name,
            },
            "email": { "email": user.email, "isVerified": user.email_verified },
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
            .map_err(|e| Error::internal("zitadel create user", e))?;

        if response.status().is_success() {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Ok {
                user_id: String,
            }
            let ok: Ok = response
                .json()
                .await
                .map_err(|e| Error::internal("zitadel create user response shape", e))?;
            return Result::Ok(ok.user_id);
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
        Err(Error::app(
            ErrorCode::ServiceUnavailable,
            format!(
                "zitadel user creation failed: {} ({})",
                err.message, err.code
            ),
        ))
    }
}
