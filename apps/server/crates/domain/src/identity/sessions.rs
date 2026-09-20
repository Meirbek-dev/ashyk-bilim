//! BFF sessions: opaque cookie id → Redis record (ARCHITECTURE §7).
//!
//! - Sliding idle timeout [`IDLE_TTL`], absolute cap [`ABSOLUTE_CAP`] enforced
//!   on touch (a session older than the cap is treated as expired regardless
//!   of activity).
//! - The touch never rewrites the record (BUG-191): it `EXPIRE`s the record
//!   and writes `last_seen` to its own key `session_seen:{id}`, so a touch in
//!   flight cannot resurrect a revoked session or undo a grant rewrite.
//!   Rewrites are compare-and-set (`SET … XX KEEPTTL` under a Lua guard) and
//!   a session whose id left the registry zset is dead even if its key is not.
//! - Session creation is fenced on a per-user epoch `user_epoch:{uid}`
//!   (BUG-203): every mutation that must end or rewrite the user's sessions
//!   (`revoke_all`, `revoke_others`, the grant/MFA rewrites) bumps it BEFORE
//!   touching the sessions, and [`SessionStore::create`] only writes when the
//!   epoch still equals the one the login read before its slow credential
//!   check — a login that straddles the mutation gets `None`, never a session
//!   the mutation could not see.
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
fn seen_key(id: &str) -> String {
    format!("session_seen:{id}")
}
fn user_key(user_id: UserId) -> String {
    format!("user_sessions:{user_id}")
}
fn epoch_key(user_id: UserId) -> String {
    format!("user_epoch:{user_id}")
}
fn idle_ttl() -> i64 {
    i64::try_from(IDLE_TTL.as_secs()).unwrap_or(i64::MAX)
}
fn past_absolute_cap(record: &SessionRecord) -> bool {
    let age = now_unix().saturating_sub(record.created_at_unix);
    age >= i64::try_from(ABSOLUTE_CAP.as_secs()).unwrap_or(i64::MAX)
}

/// Compare-and-set rewrite: only if the record is still the one we read, and
/// only if it still exists (`XX` — a concurrent revoke must win).
const REWRITE_IF_UNCHANGED: &str = r"
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'XX', 'KEEPTTL')
return 1";
/// Fenced create: record + registry entry only if the user's epoch is still
/// the one the caller read (`KEYS[3]`; a never-bumped epoch reads as 0).
const CREATE_IF_EPOCH: &str = r"
if (redis.call('GET', KEYS[3]) or '0') ~= ARGV[5] then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[4])
return 1";
/// Touch: slide the record's TTL and stamp `last_seen` only while the record
/// exists — a touch racing a revoke must not leave an orphan stamp.
const TOUCH_IF_ALIVE: &str = r"
if redis.call('EXPIRE', KEYS[1], ARGV[1]) == 1 then
  redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[1])
end
return 1";
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
    /// TOTP enrolled on the Zitadel account (as of login / last enrollment
    /// change) — `mfa_enabled` on the wire.
    #[serde(default)]
    pub mfa_enabled: bool,
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
    pub mfa_enabled: bool,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    /// [`SessionStore::epoch`] as read BEFORE every check this session rests
    /// on (status, password, MFA methods, grants).
    pub epoch: i64,
}

#[derive(Clone)]
pub struct SessionStore {
    client: redis::Client,
    redis: ConnectionManager,
}

impl SessionStore {
    /// Shared Redis handle for sibling identity infrastructure (rate limiter).
    #[must_use]
    pub fn redis(&self) -> ConnectionManager {
        self.redis.clone()
    }

    /// The client, for code that needs its own connection (blocking reads).
    #[must_use]
    pub fn client(&self) -> redis::Client {
        self.client.clone()
    }

    pub async fn connect(url: &str) -> Result<Self> {
        let client =
            redis::Client::open(url).map_err(|e| Error::internal("invalid redis url", e))?;
        let redis = client
            .get_connection_manager()
            .await
            .map_err(|e| Error::internal("connecting to redis", e))?;
        Ok(Self { client, redis })
    }

    /// The user's current epoch — read it before the checks a login rests on,
    /// pass it to [`Self::create`].
    pub async fn epoch(&self, user_id: UserId) -> Result<i64> {
        let mut conn = self.redis.clone();
        let epoch: Option<i64> = conn
            .get(epoch_key(user_id))
            .await
            .map_err(|e| Error::internal("reading user epoch", e))?;
        Ok(epoch.unwrap_or(0))
    }

    /// Invalidate every login in flight for the user: a `create` carrying an
    /// older epoch fails. The first step of every session-ending mutation.
    async fn bump_epoch(&self, user_id: UserId) -> Result<()> {
        let mut conn = self.redis.clone();
        let _: i64 = conn
            .incr(epoch_key(user_id), 1)
            .await
            .map_err(|e| Error::internal("bumping user epoch", e))?;
        Ok(())
    }

    /// Create a session; returns the opaque id for the cookie, or `None` when
    /// the user's epoch moved since `new.epoch` was read (a mutation landed
    /// mid-login — the caller re-reads the account and refuses as a fresh
    /// login would). Evicts the oldest sessions beyond
    /// [`MAX_SESSIONS_PER_USER`].
    pub async fn create(&self, new: NewSession) -> Result<Option<String>> {
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
            mfa_enabled: new.mfa_enabled,
            created_at_unix: now,
            last_seen_unix: now,
            ip: new.ip,
            user_agent: new.user_agent,
        };
        let mut conn = self.redis.clone();
        let payload = serde_json::to_string(&record)
            .map_err(|e| Error::internal("serializing session", e))?;
        // One atomic step, fenced on the epoch: a record without its registry
        // entry reads as revoked; a record a mutation could not see is never written.
        let written: i32 = redis::Script::new(CREATE_IF_EPOCH)
            .key(session_key(&id))
            .key(user_key(record.user_id))
            .key(epoch_key(record.user_id))
            .arg(payload)
            .arg(idle_ttl())
            .arg(now_unix_millis())
            .arg(&id)
            .arg(new.epoch)
            .invoke_async(&mut conn)
            .await
            .map_err(|e| Error::internal("storing session", e))?;
        if written != 1 {
            return Ok(None);
        }

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
        Ok(Some(id))
    }

    /// Fetch + touch: refreshes the idle TTL, enforces the absolute cap, and
    /// updates `last_seen`. Returns `None` for missing/expired/revoked sessions.
    pub async fn get_and_touch(&self, id: &str) -> Result<Option<SessionRecord>> {
        let Some(mut record) = self.load(id).await? else {
            return Ok(None);
        };
        if past_absolute_cap(&record) {
            self.revoke(record.user_id, id).await?;
            return Ok(None);
        }
        // Registry membership is authoritative: `revoke` removes it in the
        // same atomic step as the record, so a key that outlived its entry
        // (or was re-created by anything) is dead.
        let mut conn = self.redis.clone();
        let registered: Option<f64> = conn
            .zscore(user_key(record.user_id), id)
            .await
            .map_err(|e| Error::internal("checking session registry", e))?;
        if registered.is_none() {
            self.revoke(record.user_id, id).await?;
            return Ok(None);
        }
        record.last_seen_unix = self.touch(id).await?;
        Ok(Some(record))
    }

    /// The write half of [`Self::get_and_touch`]: slide the idle TTL and stamp
    /// `last_seen`. Never writes the record itself, so it cannot resurrect a
    /// revoked session (`EXPIRE` on a missing key is a no-op) or overwrite a
    /// concurrent grant rewrite. Returns the stamped `last_seen`.
    pub async fn touch(&self, id: &str) -> Result<i64> {
        let now = now_unix();
        let mut conn = self.redis.clone();
        let _: i32 = redis::Script::new(TOUCH_IF_ALIVE)
            .key(session_key(id))
            .key(seen_key(id))
            .arg(idle_ttl())
            .arg(now)
            .invoke_async(&mut conn)
            .await
            .map_err(|e| Error::internal("touching session", e))?;
        Ok(now)
    }

    /// Read without touching: no TTL refresh, no `last_seen` update (session
    /// listings must not keep idle sessions alive). Sessions past the
    /// absolute cap read as gone, same as [`Self::get_and_touch`].
    pub async fn peek(&self, id: &str) -> Result<Option<SessionRecord>> {
        Ok(self
            .load(id)
            .await?
            .filter(|record| !past_absolute_cap(record)))
    }

    /// Record + its `last_seen` stamp (the record's own field is the creation
    /// time; the stamp lives in `session_seen:{id}`).
    async fn load(&self, id: &str) -> Result<Option<SessionRecord>> {
        let mut conn = self.redis.clone();
        let (raw, seen): (Option<String>, Option<i64>) = conn
            .mget((session_key(id), seen_key(id)))
            .await
            .map_err(|e| Error::internal("loading session", e))?;
        let Some(raw) = raw else { return Ok(None) };
        let mut record: SessionRecord =
            serde_json::from_str(&raw).map_err(|e| Error::internal("corrupt session record", e))?;
        if let Some(seen) = seen {
            record.last_seen_unix = seen;
        }
        Ok(Some(record))
    }

    /// Record, `last_seen` stamp and registry entry go in one atomic step.
    pub async fn revoke(&self, user_id: UserId, id: &str) -> Result<()> {
        let mut conn = self.redis.clone();
        let () = redis::pipe()
            .atomic()
            .del(session_key(id))
            .del(seen_key(id))
            .zrem(user_key(user_id), id)
            .query_async(&mut conn)
            .await
            .map_err(|e| Error::internal("deleting session", e))?;
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

    /// End every session of the user; logins in flight are fenced first.
    pub async fn revoke_all(&self, user_id: UserId) -> Result<u32> {
        self.revoke_except(user_id, None).await
    }

    /// End every session of the user but `keep` (the caller's own, e.g. on a
    /// password change); logins in flight are fenced first.
    pub async fn revoke_others(&self, user_id: UserId, keep: &str) -> Result<u32> {
        self.revoke_except(user_id, Some(keep)).await
    }

    async fn revoke_except(&self, user_id: UserId, keep: Option<&str>) -> Result<u32> {
        self.bump_epoch(user_id).await?;
        let mut revoked = 0;
        for id in self.list(user_id).await? {
            if keep != Some(id.as_str()) {
                self.revoke(user_id, &id).await?;
                revoked += 1;
            }
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
        self.update_user_sessions(user_id, |record| {
            record.roles = roles.to_vec();
            record.permissions = permissions.to_vec();
            record.rbac_version = rbac_version;
        })
        .await
    }

    /// TOTP enrolled/removed: every live session reflects it immediately.
    pub async fn set_mfa_enabled(&self, user_id: UserId, mfa_enabled: bool) -> Result<u32> {
        self.update_user_sessions(user_id, |record| record.mfa_enabled = mfa_enabled)
            .await
    }

    /// Apply `edit` to every live session of the user, keeping each idle TTL.
    /// Compare-and-set per session: a concurrent rewrite is retried on top of
    /// its result, a concurrent revoke wins (`XX`). Logins in flight are
    /// fenced first, so none is born with the state this rewrite replaces.
    async fn update_user_sessions(
        &self,
        user_id: UserId,
        mut edit: impl FnMut(&mut SessionRecord),
    ) -> Result<u32> {
        self.bump_epoch(user_id).await?;
        let mut conn = self.redis.clone();
        let script = redis::Script::new(REWRITE_IF_UNCHANGED);
        let mut updated = 0;
        for id in self.list(user_id).await? {
            // ponytail: 3 CAS rounds; two rewriters of one user racing thrice is not a real workload.
            for _ in 0..3 {
                let raw: Option<String> = conn
                    .get(session_key(&id))
                    .await
                    .map_err(|e| Error::internal("loading session", e))?;
                let Some(raw) = raw else { break };
                let mut record: SessionRecord = serde_json::from_str(&raw)
                    .map_err(|e| Error::internal("corrupt session record", e))?;
                edit(&mut record);
                let payload = serde_json::to_string(&record)
                    .map_err(|e| Error::internal("serializing session", e))?;
                let written: i32 = script
                    .key(session_key(&id))
                    .arg(&raw)
                    .arg(payload)
                    .invoke_async(&mut conn)
                    .await
                    .map_err(|e| Error::internal("rewriting session", e))?;
                if written == 1 {
                    updated += 1;
                    break;
                }
            }
        }
        Ok(updated)
    }
}
