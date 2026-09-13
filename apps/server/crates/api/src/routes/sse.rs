//! Server-sent events: the grading feedback stream of one submission and
//! the course-wide grading stream for graders.
//!
//! `GET /submissions/{id}/events` for the owner or a grader;
//! `GET /courses/{id}/grading/events` for graders. `Last-Event-ID` replays
//! what was missed (Redis stream ids), then a `connected` event, then live
//! events; axum's keep-alive comments every 25s hold proxies open. Each
//! user may hold five streams at once (429 beyond that).

use std::convert::Infallible;
use std::time::Duration;

use ab_core::id::{CourseId, SubmissionId};
use ab_core::{Error, ErrorCode};
use ab_domain::events::{ConnectionSlot, GradingEvents, MAX_CONNECTIONS_PER_USER, Stream};
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::Sse;
use axum::response::sse::{Event, KeepAlive, KeepAliveStream};
use futures::StreamExt;

use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, Path};
use crate::state::AppState;

/// Blocking-read window; also how quickly a dropped client frees its slot.
const READ_TIMEOUT: Duration = Duration::from_secs(25);
const REPLAY_LIMIT: usize = 500;
const BATCH_LIMIT: usize = 100;

type EventStream =
    Sse<KeepAliveStream<futures::stream::BoxStream<'static, Result<Event, Infallible>>>>;

fn to_event(stored: &ab_domain::events::StoredEvent) -> Event {
    Event::default()
        .id(stored.event_id.clone())
        .event(stored.event.clone())
        .data(serde_json::to_string(stored).unwrap_or_else(|_| "{}".into()))
}

fn last_event_id(headers: &HeaderMap) -> Option<String> {
    headers
        .get("last-event-id")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
}

/// Take a connection slot, replay after `Last-Event-ID`, announce
/// `connected` (with `connected_with` merged in), then relay live events.
async fn open_stream(
    state: &AppState,
    actor_user: ab_core::id::UserId,
    stream: Stream,
    headers: &HeaderMap,
    connected_with: serde_json::Value,
) -> ApiResult<EventStream> {
    let Some(slot) = state.events.acquire_slot(actor_user).await? else {
        return Err(Error::app_with_details(
            ErrorCode::RateLimited,
            "too many concurrent event streams for this user",
            serde_json::json!({ "limit": MAX_CONNECTIONS_PER_USER }),
        )
        .into());
    };
    let last_event_id = last_event_id(headers);
    let events: GradingEvents = state.events.clone();
    let mut subscriber = events.subscriber().await?;
    let mut connected = serde_json::json!({ "event": "connected" });
    if let (Some(base), Some(extra)) = (connected.as_object_mut(), connected_with.as_object()) {
        base.extend(extra.clone());
    }

    let out = async_stream::stream! {
        // Moved in so the slot is released when the client goes away.
        let _slot: ConnectionSlot = slot;
        let mut cursor = last_event_id.clone().unwrap_or_else(|| "$".into());
        if let Some(after) = &last_event_id {
            match events.replay(stream, after, REPLAY_LIMIT).await {
                Ok(missed) => {
                    for stored in &missed {
                        cursor.clone_from(&stored.event_id);
                        yield Ok(to_event(stored));
                    }
                }
                Err(err) => tracing::warn!(?stream, %err, "sse replay failed"),
            }
        }
        yield Ok(Event::default().event("connected").data(connected.to_string()));
        loop {
            match subscriber.read(stream, &cursor, READ_TIMEOUT, BATCH_LIMIT).await {
                Ok(batch) => {
                    for stored in &batch {
                        cursor.clone_from(&stored.event_id);
                        yield Ok(to_event(stored));
                    }
                }
                Err(err) => {
                    tracing::warn!(?stream, ?err, "sse read failed; closing stream");
                    break;
                }
            }
        }
    };
    Ok(Sse::new(out.boxed()).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(25))
            .text("keepalive"),
    ))
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
) -> ApiResult<EventStream> {
    state.grading.stream_access(&actor, id).await?;
    open_stream(
        &state,
        actor.user_id,
        Stream::Submission(id),
        &headers,
        serde_json::json!({ "submission_id": id }),
    )
    .await
}

/// Every grade change and hand-in on a course as `text/event-stream`
/// (graders).
///
/// Event names: `connected`, `submission.submitted`, `grade.saved`,
/// `grade.published`, `submission.returned`. `data` is
/// `{event_id, event, payload, sent_at}` where `payload` carries
/// `activity_id`, `user_id`, `status`, `final_score` and either
/// `submission_id` (assessment) or `attempt_id` (file submission);
/// `id` is the stream id to send back as `Last-Event-ID` on reconnect.
#[utoipa::path(
    get, path = "/courses/{id}/grading/events", tag = "grading",
    params(
        ("id" = CourseId, Path, description = "Course id"),
        ("Last-Event-ID" = Option<String>, Header, description = "Resume after this event id"),
    ),
    responses(
        (status = 200, description = "Event stream", content_type = "text/event-stream",
         body = String),
        (status = 403, description = "No grading access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown or inaccessible course", body = Problem,
         content_type = "application/problem+json"),
        (status = 429, description = "Too many open streams for this user", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn course_grading_events(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    headers: HeaderMap,
) -> ApiResult<EventStream> {
    state.grading.course_stream_access(&actor, id).await?;
    open_stream(
        &state,
        actor.user_id,
        Stream::Course(id),
        &headers,
        serde_json::json!({ "course_id": id }),
    )
    .await
}
