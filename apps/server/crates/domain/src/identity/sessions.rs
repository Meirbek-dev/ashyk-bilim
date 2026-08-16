//! BFF sessions: opaque cookie id → Redis record (ARCHITECTURE §7).
//!
//! - Sliding idle timeout [`IDLE_TTL`], absolute cap [`ABSOLUTE_CAP`] enforced
//!   on touch (a session older than the cap is treated as expired regardless
//!   of activity).
//! - Per-user registry `user_sessions:{uid}` (zset scored by creation time)
//!   caps concurrent sessions at [`MAX_SESSIONS_PER_USER`], evicting oldest.
//! - Permission changes propagate at mutation time:
//!   [`SessionStore::rewrite_user_sessions`] updates every live session of a
//!   user (called by RBAC admin flows), so request-path reads never hit
//!   Postgres.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use ab_core::id::UserId;
use ab_core::{Error, Result};
use redis::AsyncCommands;
use redis::aio::ConnectionManager;
use serde::{Deserialize, Serialize};

pub const IDLE_TTL: Duration = Duration::from_hours(14 * 24);
pub const ABSOLUTE_CAP: Duration = Duration::from_hours(90 * 24);
pub const MAX_SESSIONS_PER_USER: usize = 10;

fn session_key(id: &str) -> String {
    format!("session:{id}")
}
fn user_key(user_id: UserId) -> String {
    format!("user_sessions:{user_id}")
}
fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// Registry zset score. Milliseconds: second-granularity scores collide for
/// sessions created in the same second, making "evict oldest" lexicographic.
fn now_unix_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
}

/// Everything the request path needs, denormalized into Redis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub user_id: UserId,
    pub zitadel_user_id: String,
    pub zitadel_session_id: String,
    /// Zitadel session token — server-side only, never leaves this store.
    pub zitadel_session_token: String,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
    pub rbac_version: i64,
    pub created_at_unix: i64,
    pub last_seen_unix: i64,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
}

/// Input for [`SessionStore::create`].
#[derive(Debug)]
pub struct NewSession {
    pub user_id: UserId,
    pub zitadel_user_id: String,
    pub zitadel_session_id: String,
    pub zitadel_session_token: String,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
    pub rbac_version: i64,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Clone)]
pub struct SessionStore {
    redis: ConnectionManager,
}

impl SessionStore {
    /// Shared Redis handle for sibling identity infrastructure (rate limiter).
    #[must_use]
    pub fn redis(&self) -> ConnectionManager {
        self.redis.clone()
    }

    pub async fn connect(url: &str) -> Result<Self> {
        let client =
            redis::Client::open(url).map_err(|e| Error::internal("invalid redis url", e))?;
        let redis = client
            .get_connection_manager()
            .await
            .map_err(|e| Error::internal("connecting to redis", e))?;
        Ok(Self { redis })
    }

    /// Create a session; returns the opaque id for the cookie. Evicts the
    /// oldest sessions beyond [`MAX_SESSIONS_PER_USER`].
    pub async fn create(&self, new: NewSession) -> Result<String> {
        // 256 bits of randomness; the id never appears in logs.
        let id = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        let now = now_unix();
        let record = SessionRecord {
            user_id: new.user_id,
            zitadel_user_id: new.zitadel_user_id,
            zitadel_session_id: new.zitadel_session_id,
            zitadel_session_token: new.zitadel_session_token,
            roles: new.roles,
            permissions: new.permissions,
            rbac_version: new.rbac_version,
            created_at_unix: now,
            last_seen_unix: now,
            ip: new.ip,
            user_agent: new.user_agent,
        };
        let mut conn = self.redis.clone();
        let payload = serde_json::to_string(&record)
            .map_err(|e| Error::internal("serializing session", e))?;
        let () = conn
            .set_ex(session_key(&id), payload, IDLE_TTL.as_secs())
            .await
            .map_err(|e| Error::internal("storing session", e))?;
        let () = conn
            .zadd(user_key(record.user_id), &id, now_unix_millis())
            .await
            .map_err(|e| Error::internal("registering session", e))?;

        // Cap concurrent sessions: evict oldest beyond the limit.
        let count: usize = conn
            .zcard(user_key(record.user_id))
            .await
            .map_err(|e| Error::internal("counting sessions", e))?;
        if count > MAX_SESSIONS_PER_USER {
            let excess = isize::try_from(count - MAX_SESSIONS_PER_USER).unwrap_or(0);
            let evict: Vec<String> = conn
                .zrange(user_key(record.user_id), 0, excess - 1)
                .await
                .map_err(|e| Error::internal("listing oldest sessions", e))?;
            for old in &evict {
                self.revoke(record.user_id, old).await?;
            }
        }
        Ok(id)
    }

    /// Fetch + touch: refreshes the idle TTL, enforces the absolute cap, and
    /// updates `last_seen`. Returns `None` for missing/expired sessions.
    pub async fn get_and_touch(&self, id: &str) -> Result<Option<SessionRecord>> {
        let mut conn = self.redis.clone();
        let raw: Option<String> = conn
            .get(session_key(id))
            .await
            .map_err(|e| Error::internal("loading session", e))?;
        let Some(raw) = raw else { return Ok(None) };
        let mut record: SessionRecord =
            serde_json::from_str(&raw).map_err(|e| Error::internal("corrupt session record", e))?;

        let now = now_unix();
        let age = now.saturating_sub(record.created_at_unix);
        if age >= i64::try_from(ABSOLUTE_CAP.as_secs()).unwrap_or(i64::MAX) {
            self.revoke(record.user_id, id).await?;
            return Ok(None);
        }

        record.last_seen_unix = now;
        let payload = serde_json::to_string(&record)
            .map_err(|e| Error::internal("serializing session", e))?;
        let () = conn
            .set_ex(session_key(id), payload, IDLE_TTL.as_secs())
            .await
            .map_err(|e| Error::internal("touching session", e))?;
        Ok(Some(record))
    }

    pub async fn revoke(&self, user_id: UserId, id: &str) -> Result<()> {
        let mut conn = self.redis.clone();
        let () = conn
            .del(session_key(id))
            .await
            .map_err(|e| Error::internal("deleting session", e))?;
        let () = conn
            .zrem(user_key(user_id), id)
            .await
            .map_err(|e| Error::internal("deregistering session", e))?;
        Ok(())
    }

    /// All live session ids for a user (oldest first).
    pub async fn list(&self, user_id: UserId) -> Result<Vec<String>> {
        let mut conn = self.redis.clone();
        let ids: Vec<String> = conn
            .zrange(user_key(user_id), 0, -1)
            .await
            .map_err(|e| Error::internal("listing sessions", e))?;
        // Filter out ids whose session key already expired (zset is advisory).
        let mut live = Vec::with_capacity(ids.len());
        for id in ids {
            let exists: bool = conn
                .exists(session_key(&id))
                .await
                .map_err(|e| Error::internal("checking session", e))?;
            if exists {
                live.push(id);
            } else {
                let () = conn
                    .zrem(user_key(user_id), &id)
                    .await
                    .map_err(|e| Error::internal("pruning session registry", e))?;
            }
        }
        Ok(live)
    }

    pub async fn revoke_all(&self, user_id: UserId) -> Result<u32> {
        let ids = self.list(user_id).await?;
        let mut revoked = 0;
        for id in &ids {
            self.revoke(user_id, id).await?;
            revoked += 1;
        }
        Ok(revoked)
    }

    /// Mutation-time permission propagation: rewrite roles/permissions/version
    /// in every live session of the user (called by RBAC admin flows).
    pub async fn rewrite_user_sessions(
        &self,
        user_id: UserId,
        roles: &[String],
        permissions: &[String],
        rbac_version: i64,
    ) -> Result<u32> {
        let mut conn = self.redis.clone();
        let mut updated = 0;
        for id in self.list(user_id).await? {
            let raw: Option<String> = conn
                .get(session_key(&id))
                .await
                .map_err(|e| Error::internal("loading session", e))?;
            let Some(raw) = raw else { continue };
            let mut record: SessionRecord = serde_json::from_str(&raw)
                .map_err(|e| Error::internal("corrupt session record", e))?;
            record.roles = roles.to_vec();
            record.permissions = permissions.to_vec();
            record.rbac_version = rbac_version;
            let payload = serde_json::to_string(&record)
                .map_err(|e| Error::internal("serializing session", e))?;
            // KEEPTTL: don't extend idle expiry just because roles changed.
            let () = redis::cmd("SET")
                .arg(session_key(&id))
                .arg(payload)
                .arg("KEEPTTL")
                .query_async(&mut conn)
                .await
                .map_err(|e| Error::internal("rewriting session", e))?;
            updated += 1;
        }
        Ok(updated)
    }
}
