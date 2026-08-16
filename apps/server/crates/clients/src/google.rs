//! First-party Google OAuth client (DECISIONS.md 2026-08-16) — port of the
//! legacy `google_oauth.py` semantics:
//! - Authorization-code flow with PKCE (S256), `openid email profile`,
//!   `prompt=select_account`, `access_type=online`.
//! - Token exchange with 3 attempts on transient network errors.
//! - Identity from the `id_token` claims (issuer/audience checked; signature
//!   deliberately not verified — the token arrives directly from Google's
//!   token endpoint over TLS, exactly as the legacy did), falling back to the
//!   `userinfo` endpoint.
//!
//! Static Google endpoints (the legacy's discovery fallback list); tests
//! override them via [`GoogleConfig`].

use std::time::Duration;

use ab_core::{Error, ErrorCode, Result};
use base64::Engine;
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;

pub const DEFAULT_AUTHORIZATION_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const DEFAULT_TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
pub const DEFAULT_USERINFO_ENDPOINT: &str = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_ISSUERS: [&str; 2] = ["https://accounts.google.com", "accounts.google.com"];
const TOKEN_ATTEMPTS: u32 = 3;

#[derive(Debug, Clone)]
pub struct GoogleConfig {
    pub client_id: String,
    pub client_secret: SecretString,
    /// Our callback URL as registered in the Google console.
    pub redirect_uri: String,
    /// Test overrides; production uses the DEFAULT_* endpoints.
    pub token_endpoint: Option<String>,
    pub userinfo_endpoint: Option<String>,
    pub authorization_endpoint: Option<String>,
}

/// The verified identity extracted from Google.
#[derive(Debug, Clone)]
pub struct GoogleIdentity {
    pub sub: String,
    pub email: String,
    pub given_name: Option<String>,
    pub family_name: Option<String>,
}

pub struct GoogleClient {
    http: reqwest::Client,
    config: GoogleConfig,
}

impl GoogleClient {
    pub fn new(config: GoogleConfig) -> Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| Error::internal("building google http client", e))?;
        Ok(Self { http, config })
    }

    pub fn authorize_url(&self, state: &str, code_challenge: &str) -> Result<String> {
        let endpoint = self
            .config
            .authorization_endpoint
            .as_deref()
            .unwrap_or(DEFAULT_AUTHORIZATION_ENDPOINT);
        let mut url = reqwest::Url::parse(endpoint)
            .map_err(|e| Error::internal("invalid google authorization endpoint", e))?;
        url.query_pairs_mut()
            .append_pair("client_id", &self.config.client_id)
            .append_pair("redirect_uri", &self.config.redirect_uri)
            .append_pair("response_type", "code")
            .append_pair("scope", "openid email profile")
            .append_pair("state", state)
            .append_pair("code_challenge", code_challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("access_type", "online")
            .append_pair("prompt", "select_account");
        Ok(url.into())
    }

    /// Exchange the authorization code and resolve the caller's identity.
    pub async fn exchange_code(&self, code: &str, code_verifier: &str) -> Result<GoogleIdentity> {
        #[derive(Deserialize)]
        struct TokenResponse {
            access_token: Option<String>,
            id_token: Option<String>,
        }

        let endpoint = self
            .config
            .token_endpoint
            .as_deref()
            .unwrap_or(DEFAULT_TOKEN_ENDPOINT);
        let form = [
            ("client_id", self.config.client_id.as_str()),
            ("client_secret", self.config.client_secret.expose_secret()),
            ("code", code),
            ("redirect_uri", self.config.redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
            ("code_verifier", code_verifier),
        ];

        let mut last_err: Option<reqwest::Error> = None;
        let mut response = None;
        for attempt in 1..=TOKEN_ATTEMPTS {
            match self.http.post(endpoint).form(&form).send().await {
                Ok(resp) => {
                    response = Some(resp);
                    break;
                }
                Err(err) if err.is_connect() || err.is_timeout() => {
                    tracing::warn!(attempt, %err, "transient google token exchange error");
                    last_err = Some(err);
                    tokio::time::sleep(Duration::from_millis(500 * u64::from(attempt))).await;
                }
                Err(err) => return Err(Error::internal("google token exchange", err)),
            }
        }
        let Some(response) = response else {
            return Err(Error::app(
                ErrorCode::ServiceUnavailable,
                format!(
                    "google oauth temporarily unavailable: {}",
                    last_err.map(|e| e.to_string()).unwrap_or_default()
                ),
            ));
        };

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            tracing::warn!(%status, %body, "google token exchange rejected");
            return Err(Error::app(
                ErrorCode::InvalidCredentials,
                "google token exchange failed",
            ));
        }
        let token: TokenResponse = response
            .json()
            .await
            .map_err(|e| Error::internal("google token response shape", e))?;

        if let Some(identity) = token
            .id_token
            .as_deref()
            .and_then(|t| self.identity_from_id_token(t))
        {
            return Ok(identity);
        }

        let access_token = token.access_token.ok_or_else(|| {
            Error::app(
                ErrorCode::InvalidCredentials,
                "google response missing tokens",
            )
        })?;
        self.fetch_userinfo(&access_token).await
    }

    /// Decode (without signature verification — see module docs) and validate
    /// issuer/audience/subject claims.
    fn identity_from_id_token(&self, id_token: &str) -> Option<GoogleIdentity> {
        #[derive(Deserialize)]
        struct Claims {
            iss: String,
            aud: String,
            sub: String,
            email: Option<String>,
            given_name: Option<String>,
            family_name: Option<String>,
        }
        let payload = id_token.split('.').nth(1)?;
        let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(payload)
            .ok()?;
        let claims: Claims = serde_json::from_slice(&bytes).ok()?;
        if !GOOGLE_ISSUERS.contains(&claims.iss.as_str()) {
            tracing::warn!(iss = %claims.iss, "google id_token with unexpected issuer ignored");
            return None;
        }
        if claims.aud != self.config.client_id {
            tracing::warn!("google id_token with unexpected audience ignored");
            return None;
        }
        let email = claims.email.filter(|e| !e.is_empty())?;
        if claims.sub.is_empty() {
            return None;
        }
        Some(GoogleIdentity {
            sub: claims.sub,
            email,
            given_name: claims.given_name,
            family_name: claims.family_name,
        })
    }

    async fn fetch_userinfo(&self, access_token: &str) -> Result<GoogleIdentity> {
        #[derive(Deserialize)]
        struct UserInfo {
            sub: String,
            email: Option<String>,
            given_name: Option<String>,
            family_name: Option<String>,
        }
        let endpoint = self
            .config
            .userinfo_endpoint
            .as_deref()
            .unwrap_or(DEFAULT_USERINFO_ENDPOINT);
        let response = self
            .http
            .get(endpoint)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| Error::internal("google userinfo", e))?;
        if !response.status().is_success() {
            return Err(Error::app(
                ErrorCode::InvalidCredentials,
                "google userinfo request failed",
            ));
        }
        let info: UserInfo = response
            .json()
            .await
            .map_err(|e| Error::internal("google userinfo shape", e))?;
        let email = info.email.filter(|e| !e.is_empty()).ok_or_else(|| {
            Error::app(
                ErrorCode::InvalidCredentials,
                "google userinfo missing email",
            )
        })?;
        Ok(GoogleIdentity {
            sub: info.sub,
            email,
            given_name: info.given_name,
            family_name: info.family_name,
        })
    }
}
