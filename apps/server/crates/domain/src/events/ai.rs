//! AI run events for SSE clients, on Redis Streams (`sse:ai:{run}`).
//!
//! The durable copy of every event is the `ai_events` table; this stream is
//! the live mirror the run tail reads (`XREAD BLOCK`) and replays from
//! (`XRANGE`) with the stream id as the SSE `id:` — the grading-stream
//! design (DECISIONS "Grading SSE on Redis Streams") applied to runs.

use std::time::Duration;

use ab_core::id::{AiRunId, UserId};
use ab_core::{Error, Result};
use redis::AsyncCommands;
use redis::aio::ConnectionManager;
use redis::streams::{StreamMaxlen, StreamRangeReply, StreamReadOptions, StreamReadReply};
use serde::Serialize;

use super::ConnectionSlot;

const STREAM_MAXLEN: usize = 1024;
/// A finished run's stream lingers a day for late reconnects.
const STREAM_TTL_SECS: i64 = 24 * 3600;

/// One run event as mirrored (`data:` is this, serialised).
#[derive(Debug, Clone, Serialize)]
pub struct AiStoredEvent {
    /// Redis stream id — the SSE `id:`.
    pub event_id: String,
    /// `queued`, `running`, `collecting_context`, …, `finished`, `failed`,
    /// `cancelled`.
    pub event: String,
    pub run_id: AiRunId,
    /// The durable event's sequence number.
    pub sequence: i32,
    pub payload: serde_json::Value,
    pub sent_at: i64,
}

#[derive(Clone)]
pub struct AiEvents {
    client: redis::Client,
    redis: ConnectionManager,
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

fn stream_key(run_id: AiRunId) -> String {
    format!("sse:ai:{run_id}")
}

fn decode(run_id: AiRunId, id: &redis::streams::StreamId) -> Option<AiStoredEvent> {
    let event: String = id.get("event")?;
    let payload: String = id.get("payload").unwrap_or_else(|| "{}".into());
    let sequence: i32 = id.get("sequence").unwrap_or(0);
    let sent_at: i64 = id.get("sent_at").unwrap_or(0);
    Some(AiStoredEvent {
        event_id: id.id.clone(),
        event,
        run_id,
        sequence,
        payload: serde_json::from_str(&payload).unwrap_or(serde_json::Value::Null),
        sent_at,
    })
}

impl AiEvents {
    /// `client` opens the dedicated per-subscriber connections; `redis` is
    /// the shared multiplexed handle for publishing and counters.
    #[must_use]
    pub const fn new(client: redis::Client, redis: ConnectionManager) -> Self {
        Self { client, redis }
    }

    /// Mirror one durable event; returns the stream id.
    pub async fn publish(
        &self,
        run_id: AiRunId,
        sequence: i32,
        event: &str,
        payload: &serde_json::Value,
    ) -> Result<String> {
        let mut redis = self.redis.clone();
        let key = stream_key(run_id);
        let id: String = redis
            .xadd_maxlen(
                &key,
                StreamMaxlen::Approx(STREAM_MAXLEN),
                "*",
                &[
                    ("event", event.to_owned()),
                    ("sequence", sequence.to_string()),
                    ("payload", payload.to_string()),
                    ("sent_at", now_unix().to_string()),
                ],
            )
            .await
            .map_err(|e| Error::internal("xadd ai event", e))?;
        let _: () = redis
            .expire(&key, STREAM_TTL_SECS)
            .await
            .map_err(|e| Error::internal("expire ai stream", e))?;
        Ok(id)
    }

    /// Mirroring never fails a run: the durable copy is already committed.
    pub async fn publish_best_effort(
        &self,
        run_id: AiRunId,
        sequence: i32,
        event: &str,
        payload: &serde_json::Value,
    ) {
        if let Err(err) = self.publish(run_id, sequence, event, payload).await {
            tracing::warn!(%run_id, event, %err, "ai event not mirrored to redis");
        }
    }

    /// Events strictly after `after` (`"0-0"` = from the beginning).
    pub async fn replay(
        &self,
        run_id: AiRunId,
        after: &str,
        limit: usize,
    ) -> Result<Vec<AiStoredEvent>> {
        let mut redis = self.redis.clone();
        let reply: StreamRangeReply = redis
            .xrange_count(stream_key(run_id), format!("({after}"), "+", limit)
            .await
            .map_err(|e| Error::internal("xrange ai events", e))?;
        Ok(reply
            .ids
            .iter()
            .filter_map(|id| decode(run_id, id))
            .collect())
    }

    pub async fn subscriber(&self) -> Result<AiSubscriber> {
        let conn = self
            .client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| Error::internal("redis subscriber connection", e))?;
        Ok(AiSubscriber { conn })
    }

    /// One of the user's shared SSE connection slots (cap 5 across streams).
    pub async fn acquire_slot(&self, user_id: UserId) -> Result<Option<ConnectionSlot>> {
        super::acquire_slot_with(&self.redis, user_id).await
    }
}

/// One subscriber's blocking reader.
pub struct AiSubscriber {
    conn: redis::aio::MultiplexedConnection,
}

impl AiSubscriber {
    /// Wait up to `timeout` for events after `after` (`"$"` = only new).
    pub async fn read(
        &mut self,
        run_id: AiRunId,
        after: &str,
        timeout: Duration,
        limit: usize,
    ) -> Result<Vec<AiStoredEvent>> {
        let options = StreamReadOptions::default()
            .block(usize::try_from(timeout.as_millis()).unwrap_or(usize::MAX))
            .count(limit);
        let reply: Option<StreamReadReply> = self
            .conn
            .xread_options(&[stream_key(run_id)], &[after], &options)
            .await
            .map_err(|e| Error::internal("xread ai events", e))?;
        Ok(reply
            .into_iter()
            .flat_map(|r| r.keys)
            .flat_map(|k| k.ids)
            .filter_map(|id| decode(run_id, &id))
            .collect())
    }
}
