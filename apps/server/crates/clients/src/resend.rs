//! Resend transactional email (`POST /emails`). One method, one shape —
//! the registration verification code is the only mail v2 sends.

use ab_core::config::ResendConfig;
use ab_core::{Error, ErrorCode, Result};
use secrecy::ExposeSecret;

pub struct ResendClient {
    http: reqwest::Client,
    config: ResendConfig,
}

impl ResendClient {
    pub fn new(config: ResendConfig) -> Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| Error::internal("building resend http client", e))?;
        Ok(Self { http, config })
    }

    /// Send one HTML email. Non-2xx answers surface as `service-unavailable`
    /// — callers decide whether mail failure blocks the flow (it never does
    /// for registration).
    pub async fn send(&self, to: &str, subject: &str, html: &str) -> Result<()> {
        let response = self
            .http
            .post(format!(
                "{}/emails",
                self.config.base_url.trim_end_matches('/')
            ))
            .bearer_auth(self.config.api_key.expose_secret())
            .json(&serde_json::json!({
                "from": self.config.from,
                "to": [to],
                "subject": subject,
                "html": html,
            }))
            .send()
            .await
            .map_err(|e| Error::internal("resend send", e))?;
        if response.status().is_success() {
            return Ok(());
        }
        Err(Error::app(
            ErrorCode::ServiceUnavailable,
            format!("resend rejected the email: {}", response.status()),
        ))
    }
}
