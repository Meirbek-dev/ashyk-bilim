//! Fixed-window rate limiting in Redis (login brute-force protection; ports
//! the legacy auth limiter posture — Zitadel's own lockout counters are the
//! second layer behind it).

use std::time::Duration;

use ab_core::{Error, Result};
use redis::aio::ConnectionManager;

#[derive(Clone)]
pub struct RateLimiter {
    redis: ConnectionManager,
}

impl RateLimiter {
    #[must_use]
    pub const fn new(redis: ConnectionManager) -> Self {
        Self { redis }
    }

    /// Count a hit against `key`; `true` while within `limit` per `window`.
    pub async fn check(&self, key: &str, limit: u32, window: Duration) -> Result<bool> {
        let mut conn = self.redis.clone();
        let count: u32 = redis::cmd("INCR")
            .arg(key)
            .query_async(&mut conn)
            .await
            .map_err(|e| Error::internal("rate limit incr", e))?;
        if count == 1 {
            let () = redis::cmd("EXPIRE")
                .arg(key)
                .arg(window.as_secs())
                .query_async(&mut conn)
                .await
                .map_err(|e| Error::internal("rate limit expire", e))?;
        }
        Ok(count <= limit)
    }

    /// Seconds until the window on `key` resets (`Retry-After`); `fallback`
    /// when the key has no TTL (raced away between INCR and this read).
    pub async fn retry_after(&self, key: &str, fallback: Duration) -> Result<u64> {
        let mut conn = self.redis.clone();
        let ttl: i64 = redis::cmd("TTL")
            .arg(key)
            .query_async(&mut conn)
            .await
            .map_err(|e| Error::internal("rate limit ttl", e))?;
        Ok(u64::try_from(ttl)
            .ok()
            .filter(|t| *t > 0)
            .unwrap_or(fallback.as_secs()))
    }

    /// Clear a window early (e.g. successful login clears the failure count).
    pub async fn clear(&self, key: &str) -> Result<()> {
        let mut conn = self.redis.clone();
        let () = redis::cmd("DEL")
            .arg(key)
            .query_async(&mut conn)
            .await
            .map_err(|e| Error::internal("rate limit clear", e))?;
        Ok(())
    }
}
