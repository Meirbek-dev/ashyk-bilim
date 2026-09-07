//! Small post-rehearsal HTTP smoke probes.

use ab_core::{Error, ErrorCode, Result};

pub async fn health(base_url: &str) -> Result<()> {
    let response = reqwest::Client::new()
        .get(format!(
            "{}/api/v2/health/ready",
            base_url.trim_end_matches('/')
        ))
        .send()
        .await
        .map_err(|error| Error::internal("ETL smoke readiness request", error))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(Error::app(
            ErrorCode::ServiceUnavailable,
            format!("rehearsal server readiness returned {}", response.status()),
        ))
    }
}
