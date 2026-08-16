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
    InvalidCredentials { failed_attempts: i64 },
    UserNotFound,
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

    /// `POST /v2/sessions` with loginName + password checks.
    pub async fn create_password_session(
        &self,
        login_name: &str,
        password: &SecretString,
    ) -> Result<PasswordSessionOutcome> {
        let body = serde_json::json!({
            "checks": {
                "user": { "loginName": login_name },
                "password": { "password": password.expose_secret() },
            }
        });
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
            let failed_attempts = err
                .details
                .iter()
                .find_map(|d| d.get("failedAttempts").and_then(serde_json::Value::as_i64))
                .unwrap_or(0);
            return Result::Ok(PasswordSessionOutcome::InvalidCredentials { failed_attempts });
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
