//! `GET /utils/link-preview` behind a 24 h Redis cache.
//!
//! The SSRF-guarded fetch lives in `ab_clients::link_preview`; the cache
//! is keyed by the normalized URL. Any signed-in session may ask (the
//! editor's link block is an authoring surface; the legacy route was open
//! to everyone).

use ab_clients::link_preview::{LinkPreview, LinkPreviewClient};
use ab_core::Result;
use redis::aio::ConnectionManager;
use sha2::{Digest, Sha256};

const CACHE_TTL_SECS: u64 = 24 * 60 * 60;

#[derive(Clone)]
pub struct LinkPreviewService {
    client: LinkPreviewClient,
    /// `None` without Redis (tests without a cache, a bare worker): every
    /// call fetches.
    redis: Option<ConnectionManager>,
}

impl LinkPreviewService {
    #[must_use]
    pub const fn new(client: LinkPreviewClient, redis: Option<ConnectionManager>) -> Self {
        Self { client, redis }
    }

    pub async fn preview(&self, url: &str) -> Result<LinkPreview> {
        let key = Sha256::digest(url.trim().as_bytes()).iter().fold(
            "link-preview:".to_owned(),
            |mut acc, byte| {
                use std::fmt::Write;
                let _ = write!(acc, "{byte:02x}");
                acc
            },
        );
        if let Some(cached) = self.cached(&key).await {
            return Ok(cached);
        }
        let preview = self.client.fetch(url).await?;
        self.store(&key, &preview).await;
        Ok(preview)
    }

    /// A cache miss and a cache outage read the same: fetch.
    async fn cached(&self, key: &str) -> Option<LinkPreview> {
        let mut conn = self.redis.clone()?;
        let raw: Option<String> = redis::cmd("GET")
            .arg(key)
            .query_async(&mut conn)
            .await
            .ok()?;
        serde_json::from_str(&raw?).ok()
    }

    async fn store(&self, key: &str, preview: &LinkPreview) {
        let Some(mut conn) = self.redis.clone() else {
            return;
        };
        let Ok(payload) = serde_json::to_string(preview) else {
            return;
        };
        let result: redis::RedisResult<()> = redis::cmd("SET")
            .arg(key)
            .arg(payload)
            .arg("EX")
            .arg(CACHE_TTL_SECS)
            .query_async(&mut conn)
            .await;
        if let Err(error) = result {
            tracing::warn!(%error, "link preview cache write failed");
        }
    }
}
