//! Grading events for SSE clients, on Redis Streams.
//!
//! One stream per submission (`sse:grading:{submission}`, `MAXLEN ~ 1024`).
//! Publishing is `XADD`; the stream id doubles as the SSE `id:` so
//! `Last-Event-ID` resumes with a plain `XRANGE (id +` — no custom replay
//! log like the legacy sorted set. Live delivery is `XREAD BLOCK` on a
//! dedicated connection per subscriber (a blocking read must never sit on
//! the shared multiplexed connection). Per-user concurrent connections are
//! capped with a Redis counter (legacy limit 5).

use std::time::Duration;

use ab_core::id::{SubmissionId, UserId};
use ab_core::{Error, Result};
use redis::AsyncCommands;
use redis::aio::ConnectionManager;
use redis::streams::{StreamMaxlen, StreamRangeReply, StreamReadOptions, StreamReadReply};
use serde::Serialize;

/// Legacy `_MAX_CONNECTIONS_PER_USER`.
pub const MAX_CONNECTIONS_PER_USER: i64 = 5;
/// Events kept per submission stream (approximate trimming).
const STREAM_MAXLEN: usize = 1024;
/// Stale connection counters expire on their own (legacy 3600s).
const SLOT_TTL_SECS: i64 = 3600;
/// Streams die with the submission's relevance; refreshed on every publish.
const STREAM_TTL_SECS: i64 = 7 * 24 * 3600;

/// One event as stored and as sent (`data:` is this, serialised).
#[derive(Debug, Clone, Serialize)]
pub struct StoredEvent {
    /// Redis stream id — the SSE `id:`.
    pub event_id: String,
    /// `grade.published`, `submission.returned`, `deadline.extended`, …
    pub event: String,
    pub submission_id: SubmissionId,
    pub payload: serde_json::Value,
    pub sent_at: i64,
}

/// Holds one of a user's connection slots; released on drop.
pub struct ConnectionSlot {
    redis: ConnectionManager,
    key: String,
}

impl Drop for ConnectionSlot {
    fn drop(&mut self) {
        let mut redis = self.redis.clone();
        let key = std::mem::take(&mut self.key);
        // Drop cannot await; the release is a fire-and-forget task. A lost
        // decrement is bounded by the counter's TTL.
        tokio::spawn(async move {
            let remaining: redis::RedisResult<i64> = redis.decr(&key, 1).await;
            if matches!(remaining, Ok(n) if n <= 0) {
                let _: redis::RedisResult<()> = redis.del(&key).await;
            }
        });
    }
}

#[derive(Clone)]
pub struct GradingEvents {
    client: redis::Client,
    redis: ConnectionManager,
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

fn stream_key(submission_id: SubmissionId) -> String {
    format!("sse:grading:{submission_id}")
}

fn slot_key(user_id: UserId) -> String {
    format!("sse_conn:{user_id}")
}

fn decode(submission_id: SubmissionId, id: &redis::streams::StreamId) -> Option<StoredEvent> {
    let event: String = id.get("event")?;
    let payload: String = id.get("payload").unwrap_or_else(|| "{}".into());
    let sent_at: i64 = id.get("sent_at").unwrap_or(0);
    Some(StoredEvent {
        event_id: id.id.clone(),
        event,
        submission_id,
        payload: serde_json::from_str(&payload).unwrap_or(serde_json::Value::Null),
        sent_at,
    })
}

impl GradingEvents {
    /// `client` opens the dedicated per-subscriber connections; `redis` is
    /// the shared multiplexed handle for publishing and counters.
    #[must_use]
    pub const fn new(client: redis::Client, redis: ConnectionManager) -> Self {
        Self { client, redis }
    }

    /// Append an event; returns its stream id.
    pub async fn publish(
        &self,
        submission_id: SubmissionId,
        event: &str,
        payload: &serde_json::Value,
    ) -> Result<String> {
        let mut redis = self.redis.clone();
        let key = stream_key(submission_id);
        let id: String = redis
            .xadd_maxlen(
                &key,
                StreamMaxlen::Approx(STREAM_MAXLEN),
                "*",
                &[
                    ("event", event.to_owned()),
                    ("payload", payload.to_string()),
                    ("sent_at", now_unix().to_string()),
                ],
            )
            .await
            .map_err(|e| Error::internal("xadd grading event", e))?;
        let _: () = redis
            .expire(&key, STREAM_TTL_SECS)
            .await
            .map_err(|e| Error::internal("expire grading stream", e))?;
        Ok(id)
    }

    /// Publish without failing the caller: events are advisory — a client
    /// that misses one refetches on reconnect.
    pub async fn publish_best_effort(
        &self,
        submission_id: SubmissionId,
        event: &str,
        payload: serde_json::Value,
    ) {
        if let Err(err) = self.publish(submission_id, event, &payload).await {
            tracing::warn!(%submission_id, event, %err, "grading event not published");
        }
    }

    /// Events strictly after `after` (a stream id), oldest first.
    pub async fn replay(
        &self,
        submission_id: SubmissionId,
        after: &str,
        limit: usize,
    ) -> Result<Vec<StoredEvent>> {
        let mut redis = self.redis.clone();
        let reply: StreamRangeReply = redis
            .xrange_count(stream_key(submission_id), format!("({after}"), "+", limit)
            .await
            .map_err(|e| Error::internal("xrange grading events", e))?;
        Ok(reply
            .ids
            .iter()
            .filter_map(|id| decode(submission_id, id))
            .collect())
    }

    /// A dedicated connection for one subscriber's blocking reads.
    pub async fn subscriber(&self) -> Result<Subscriber> {
        let conn = self
            .client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| Error::internal("redis subscriber connection", e))?;
        Ok(Subscriber { conn })
    }

    /// Take a connection slot for `user_id`; `None` when the cap is reached.
    pub async fn acquire_slot(&self, user_id: UserId) -> Result<Option<ConnectionSlot>> {
        let mut redis = self.redis.clone();
        let key = slot_key(user_id);
        let count: i64 = redis
            .incr(&key, 1)
            .await
            .map_err(|e| Error::internal("sse slot incr", e))?;
        let _: () = redis
            .expire(&key, SLOT_TTL_SECS)
            .await
            .map_err(|e| Error::internal("sse slot expire", e))?;
        if count > MAX_CONNECTIONS_PER_USER {
            let _: redis::RedisResult<i64> = redis.decr(&key, 1).await;
            return Ok(None);
        }
        Ok(Some(ConnectionSlot {
            redis: self.redis.clone(),
            key,
        }))
    }

    /// Current slot count (health/tests).
    pub async fn slots_in_use(&self, user_id: UserId) -> Result<i64> {
        let mut redis = self.redis.clone();
        let count: Option<i64> = redis
            .get(slot_key(user_id))
            .await
            .map_err(|e| Error::internal("sse slot get", e))?;
        Ok(count.unwrap_or(0))
    }
}

/// One subscriber's blocking reader.
pub struct Subscriber {
    conn: redis::aio::MultiplexedConnection,
}

impl Subscriber {
    /// Wait up to `timeout` for events after `after` (`"$"` = only new).
    /// An empty vector means the wait timed out.
    pub async fn read(
        &mut self,
        submission_id: SubmissionId,
        after: &str,
        timeout: Duration,
        limit: usize,
    ) -> Result<Vec<StoredEvent>> {
        let options = StreamReadOptions::default()
            .block(usize::try_from(timeout.as_millis()).unwrap_or(usize::MAX))
            .count(limit);
        let reply: Option<StreamReadReply> = self
            .conn
            .xread_options(&[stream_key(submission_id)], &[after], &options)
            .await
            .map_err(|e| Error::internal("xread grading events", e))?;
        Ok(reply
            .into_iter()
            .flat_map(|r| r.keys)
            .flat_map(|k| k.ids)
            .filter_map(|id| decode(submission_id, &id))
            .collect())
    }
}
