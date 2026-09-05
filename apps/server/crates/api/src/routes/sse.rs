//! Server-sent events: the grading feedback stream of one submission.
//!
//! `GET /submissions/{id}/events` for the owner or a grader. `Last-Event-ID`
//! replays what was missed (Redis stream ids), then a `connected` event,
//! then live events; axum's keep-alive comments every 25s hold proxies open.
//! Each user may hold five streams at once (429 beyond that).

use std::convert::Infallible;
use std::time::Duration;

use ab_core::id::SubmissionId;
use ab_core::{Error, ErrorCode};
use ab_domain::events::{ConnectionSlot, MAX_CONNECTIONS_PER_USER};
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::Sse;
use axum::response::sse::{Event, KeepAlive};
use futures::Stream;

use crate::error::{ApiResult, Problem};
use crate::extract::CurrentActor;
use crate::state::AppState;

/// Blocking-read window; also how quickly a dropped client frees its slot.
const READ_TIMEOUT: Duration = Duration::from_secs(25);
const REPLAY_LIMIT: usize = 500;
const BATCH_LIMIT: usize = 100;

fn to_event(stored: &ab_domain::events::StoredEvent) -> Event {
    Event::default()
        .id(stored.event_id.clone())
        .event(stored.event.clone())
        .data(serde_json::to_string(stored).unwrap_or_else(|_| "{}".into()))
}

/// Grading events for one submission as `text/event-stream`.
///
/// Event names: `connected`, `grade.published`, `submission.returned`,
/// `deadline.extended`. `data` is the stored event
/// (`{event_id, event, submission_id, payload, sent_at}`); `id` is the
/// stream id to send back as `Last-Event-ID` on reconnect.
#[utoipa::path(
    get, path = "/submissions/{id}/events", tag = "submissions",
    params(
        ("id" = SubmissionId, Path, description = "Submission id"),
        ("Last-Event-ID" = Option<String>, Header, description = "Resume after this event id"),
    ),
    responses(
        (status = 200, description = "Event stream", content_type = "text/event-stream",
         body = String),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
        (status = 429, description = "Too many open streams for this user", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn submission_events(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<SubmissionId>,
    headers: HeaderMap,
) -> ApiResult<Sse<impl Stream<Item = Result<Event, Infallible>>>> {
    state.grading.stream_access(&actor, id).await?;
    let Some(slot) = state.events.acquire_slot(actor.user_id).await? else {
        return Err(Error::app_with_details(
            ErrorCode::RateLimited,
            "too many concurrent event streams for this user",
            serde_json::json!({ "limit": MAX_CONNECTIONS_PER_USER }),
        )
        .into());
    };
    let last_event_id = headers
        .get("last-event-id")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned);
    let events = state.events.clone();
    let mut subscriber = events.subscriber().await?;

    let stream = async_stream::stream! {
        // Moved in so the slot is released when the client goes away.
        let _slot: ConnectionSlot = slot;
        let mut cursor = last_event_id.clone().unwrap_or_else(|| "$".into());
        if let Some(after) = &last_event_id {
            match events.replay(id, after, REPLAY_LIMIT).await {
                Ok(missed) => {
                    for stored in &missed {
                        cursor.clone_from(&stored.event_id);
                        yield Ok(to_event(stored));
                    }
                }
                Err(err) => tracing::warn!(%id, %err, "sse replay failed"),
            }
        }
        yield Ok(Event::default()
            .event("connected")
            .data(serde_json::json!({ "event": "connected", "submission_id": id }).to_string()));
        loop {
            match subscriber.read(id, &cursor, READ_TIMEOUT, BATCH_LIMIT).await {
                Ok(batch) => {
                    for stored in &batch {
                        cursor.clone_from(&stored.event_id);
                        yield Ok(to_event(stored));
                    }
                }
                Err(err) => {
                    tracing::warn!(%id, %err, "sse read failed; closing stream");
                    break;
                }
            }
        }
    };
    Ok(Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(25))
            .text("keepalive"),
    ))
}
