//! Fixed-window rate limiting in Redis (login brute-force protection; ports
//! the legacy auth limiter posture — Zitadel's own lockout counters are the
//! second layer behind it).

use std::time::Duration;

use ab_core::{Error, Result};
use redis::aio::ConnectionManager;

const COUNT_HIT: &str = r"
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count";

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
    /// One Lua step: the window starts with the first hit even if the
    /// process dies right after the `INCR` (no TTL-less counter).
    pub async fn check(&self, key: &str, limit: u32, window: Duration) -> Result<bool> {
        let mut conn = self.redis.clone();
        let count: u32 = redis::Script::new(COUNT_HIT)
            .key(key)
            .arg(window.as_secs())
            .invoke_async(&mut conn)
            .await
            .map_err(|e| Error::internal("rate limit incr", e))?;
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

    /// Hits so far in the window on `key`, without counting one.
    pub async fn count(&self, key: &str) -> Result<u32> {
        let mut conn = self.redis.clone();
        let count: Option<u32> = redis::cmd("GET")
            .arg(key)
            .query_async(&mut conn)
            .await
            .map_err(|e| Error::internal("rate limit get", e))?;
        Ok(count.unwrap_or(0))
    }

    /// Undo one hit (a login whose password Zitadel accepted is not a
    /// brute-force attempt). The key goes away at zero so an expired window
    /// never lingers as a TTL-less negative counter.
    pub async fn release(&self, key: &str) -> Result<()> {
        let mut conn = self.redis.clone();
        let left: i64 = redis::cmd("DECR")
            .arg(key)
            .query_async(&mut conn)
            .await
            .map_err(|e| Error::internal("rate limit decr", e))?;
        if left <= 0 {
            self.clear(key).await?;
        }
        Ok(())
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
