//! AI runs (status, events, artifacts, cancel, the AG-UI SSE tail),
//! capabilities, the admin operations views and usage.
//!
//! The run tail (`POST /ai/runs/{id}/stream`) replays from the durable
//! `ai_events` journal when the run is already over, otherwise from the
//! run's Redis Stream (`Last-Event-ID` = stream id) and then follows it
//! live until a terminal event (`finished` / `failed` / `cancelled`).

use std::convert::Infallible;
use std::time::Duration;

use ab_core::id::{AiRunId, CourseId};
use ab_core::{Error, ErrorCode};
use ab_domain::events::{AiStoredEvent, ConnectionSlot, MAX_CONNECTIONS_PER_USER};
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::response::Sse;
use axum::response::sse::{Event, KeepAlive};
use futures::Stream;

use crate::dto::ai::{
    AdminRun, AdminRunDetail, AdminRunPage, AdminRunsQuery, AdminSettings, CapabilitiesQuery,
    EvalDashboard, RunArtifact, RunEvent, RunStatus, RunStreamRequest, ScopeCapabilities,
    UsageSummary,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, ValidJson};
use crate::state::AppState;

/// Blocking-read window of the live tail.
const READ_TIMEOUT: Duration = Duration::from_secs(25);
const REPLAY_LIMIT: usize = 1000;
const BATCH_LIMIT: usize = 100;
const KEEPALIVE: Duration = Duration::from_secs(25);

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

#[utoipa::path(
    get, path = "/ai/runs/{id}", tag = "ai",
    params(("id" = AiRunId, Path, description = "Run id")),
    responses(
        (status = 200, description = "Run status", body = RunStatus),
        (status = 404, description = "Unknown run", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_run(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AiRunId>,
) -> ApiResult<Json<RunStatus>> {
    Ok(Json(state.ai.get_run(&actor, id).await?.into()))
}

#[utoipa::path(
    get, path = "/ai/runs/{id}/events", tag = "ai",
    params(("id" = AiRunId, Path, description = "Run id")),
    responses((status = 200, description = "Journaled events, in order", body = Vec<RunEvent>)),
)]
pub async fn run_events(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AiRunId>,
) -> ApiResult<Json<Vec<RunEvent>>> {
    let events = state.ai.run_events(&actor, id).await?;
    Ok(Json(events.into_iter().map(Into::into).collect()))
}

#[utoipa::path(
    get, path = "/ai/runs/{id}/artifacts", tag = "ai",
    params(("id" = AiRunId, Path, description = "Run id")),
    responses((status = 200, description = "Artifacts, newest first", body = Vec<RunArtifact>)),
)]
pub async fn run_artifacts(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AiRunId>,
) -> ApiResult<Json<Vec<RunArtifact>>> {
    let artifacts = state.ai.run_artifacts(&actor, id).await?;
    Ok(Json(artifacts.into_iter().map(Into::into).collect()))
}

/// Abort a queued or running run; a finished one is returned unchanged.
#[utoipa::path(
    post, path = "/ai/runs/{id}/cancel", tag = "ai",
    params(("id" = AiRunId, Path, description = "Run id")),
    responses((status = 200, description = "Run status after the cancel", body = RunStatus)),
)]
pub async fn cancel_run(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AiRunId>,
) -> ApiResult<Json<RunStatus>> {
    Ok(Json(state.ai.cancel_run(&actor, id).await?.into()))
}

/// Legacy `_stream_payload` + `_ag_ui_event`.
fn custom_event(event_type: &str, payload: &serde_json::Value) -> serde_json::Value {
    let state = payload
        .get("state")
        .and_then(serde_json::Value::as_str)
        .map_or_else(
            || match event_type {
                "queued" => "queued",
                "finished" => "complete",
                "failed" => "failed",
                "cancelled" | "aborted" => "cancelled",
                _ => "running",
            },
            |s| s,
        )
        .to_owned();
    serde_json::json!({
        "type": "CUSTOM",
        "name": event_type,
        "value": {
            "state": state,
            "message": payload.get("message").cloned().unwrap_or(serde_json::Value::Null),
            "payload": payload,
        }
    })
}

/// The AG-UI terminal event for a terminal run event, if it is one.
fn terminal_event(
    event_type: &str,
    payload: &serde_json::Value,
    request: &RunStreamRequest,
) -> Option<serde_json::Value> {
    match event_type {
        "finished" => Some(serde_json::json!({
            "type": "RUN_FINISHED",
            "threadId": request.thread_id,
            "runId": request.run_id,
        })),
        "failed" => Some(serde_json::json!({
            "type": "RUN_ERROR",
            "message": "AI run failed",
            "code": payload.get("error_code").and_then(serde_json::Value::as_str).unwrap_or("AI_RUN_FAILED"),
        })),
        "cancelled" | "aborted" => Some(serde_json::json!({
            "type": "RUN_ERROR",
            "message": "AI run was cancelled",
            "code": "CANCELLED",
        })),
        _ => None,
    }
}

fn terminal_for_status(run: &ab_db::ai::RunRow, request: &RunStreamRequest) -> serde_json::Value {
    match run.status {
        ab_core::ai::AiRunStatus::Succeeded => terminal_event("finished", &run.metadata, request),
        ab_core::ai::AiRunStatus::Aborted => terminal_event("cancelled", &run.metadata, request),
        _ => terminal_event(
            "failed",
            &serde_json::json!({ "error_code": run.error_code }),
            request,
        ),
    }
    .unwrap_or_default()
}

fn run_sse(id: impl AsRef<str>, data: &serde_json::Value) -> Event {
    Event::default().id(id).event("run").data(data.to_string())
}

fn stored_sse(stored: &AiStoredEvent) -> Event {
    run_sse(
        stored.event_id.clone(),
        &custom_event(&stored.event, &stored.payload),
    )
}

/// Follow a run as AG-UI events (`event: run`): `RUN_STARTED`, one
/// `CUSTOM {name: <event_type>, value: {state, message, payload}}` per run
/// event, then `RUN_FINISHED` or `RUN_ERROR {code}`. `id:` is the Redis
/// stream id to resume from with `Last-Event-ID`.
#[utoipa::path(
    post, path = "/ai/runs/{id}/stream", tag = "ai",
    params(
        ("id" = AiRunId, Path, description = "Run id"),
        ("Last-Event-ID" = Option<String>, Header, description = "Resume after this event id"),
    ),
    request_body = RunStreamRequest,
    responses(
        (status = 200, description = "Event stream", content_type = "text/event-stream", body = String),
        (status = 404, description = "Unknown or inaccessible run", body = Problem,
         content_type = "application/problem+json"),
        (status = 429, description = "Too many open streams for this user", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn stream_run(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AiRunId>,
    headers: HeaderMap,
    ValidJson(request): ValidJson<RunStreamRequest>,
) -> ApiResult<Sse<impl Stream<Item = Result<Event, Infallible>>>> {
    let run = state.ai.stream_access(&actor, id).await?;
    let Some(slot) = state.ai_events.acquire_slot(actor.user_id).await? else {
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
    let journal = if run.status.is_terminal() && last_event_id.is_none() {
        state.ai.run_events(&actor, id).await?
    } else {
        Vec::new()
    };
    let events = state.ai_events.clone();
    let mut subscriber = events.subscriber().await?;

    let stream = async_stream::stream! {
        let _slot: ConnectionSlot = slot;
        yield Ok(run_sse("run-started", &serde_json::json!({
            "type": "RUN_STARTED", "threadId": request.thread_id, "runId": request.run_id,
        })));
        if run.status.is_terminal() && last_event_id.is_none() {
            // Over before we connected: the durable journal is complete.
            for event in &journal {
                yield Ok(run_sse(
                    format!("seq-{}", event.sequence),
                    &custom_event(&event.event_type, &event.payload),
                ));
            }
            yield Ok(run_sse("run-end", &terminal_for_status(&run, &request)));
            return;
        }
        let mut cursor = last_event_id.clone().unwrap_or_else(|| "0-0".into());
        match events.replay(id, &cursor, REPLAY_LIMIT).await {
            Ok(missed) => {
                for stored in &missed {
                    cursor.clone_from(&stored.event_id);
                    yield Ok(stored_sse(stored));
                    if let Some(end) = terminal_event(&stored.event, &stored.payload, &request) {
                        yield Ok(run_sse("run-end", &end));
                        return;
                    }
                }
            }
            Err(err) => tracing::warn!(%id, %err, "ai run replay failed"),
        }
        if run.status.is_terminal() {
            // Resumed after the stream expired: settle from the row.
            yield Ok(run_sse("run-end", &terminal_for_status(&run, &request)));
            return;
        }
        loop {
            match subscriber.read(id, &cursor, READ_TIMEOUT, BATCH_LIMIT).await {
                Ok(batch) => {
                    for stored in &batch {
                        cursor.clone_from(&stored.event_id);
                        yield Ok(stored_sse(stored));
                        if let Some(end) = terminal_event(&stored.event, &stored.payload, &request) {
                            yield Ok(run_sse("run-end", &end));
                            return;
                        }
                    }
                }
                Err(err) => {
                    tracing::warn!(%id, %err, "ai run tail read failed; closing stream");
                    break;
                }
            }
        }
    };
    Ok(Sse::new(stream).keep_alive(KeepAlive::new().interval(KEEPALIVE).text("keepalive")))
}

// ── Capabilities ────────────────────────────────────────────────────────────

/// What the AI surface offers the caller in this course scope.
#[utoipa::path(
    get, path = "/ai/capabilities/scope/{course_id}", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id"), CapabilitiesQuery),
    responses((status = 200, description = "Capabilities", body = ScopeCapabilities)),
)]
pub async fn scope_capabilities(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    Query(query): Query<CapabilitiesQuery>,
) -> ApiResult<Json<ScopeCapabilities>> {
    let capabilities = state
        .ai
        .scope_capabilities(
            &actor,
            course_id,
            query.surface.unwrap_or(ab_domain::ai::Surface::CoursePage),
            query.activity_id,
        )
        .await?;
    Ok(Json(capabilities.into()))
}

// ── Admin (`platform:read:platform`) ────────────────────────────────────────

#[utoipa::path(
    get, path = "/ai/admin/settings", tag = "ai",
    responses(
        (status = 200, description = "Effective AI settings", body = AdminSettings),
        (status = 403, description = "Not a platform reader", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn admin_settings(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<AdminSettings>> {
    Ok(Json(state.ai.admin_settings(&actor)?.into()))
}

/// Recent runs, newest first, keyset-paged.
#[utoipa::path(
    get, path = "/ai/admin/runs", tag = "ai",
    params(AdminRunsQuery),
    responses(
        (status = 200, description = "A page of runs", body = AdminRunPage),
        (status = 403, description = "Not a platform reader", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn admin_runs(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AdminRunsQuery>,
) -> ApiResult<Json<AdminRunPage>> {
    let (rows, next_cursor) = state
        .ai
        .admin_runs(
            &actor,
            &ab_domain::ai::RunListQuery {
                days: query.days.unwrap_or(7),
                status: query.status,
                kind: query.kind,
                provider: query.provider,
                course_id: query.course_id,
                cursor: query.cursor,
                limit: query.limit.unwrap_or(50),
            },
        )
        .await?;
    let now = now_unix();
    Ok(Json(AdminRunPage {
        items: rows
            .into_iter()
            .map(|r| AdminRun::from_row(r, now))
            .collect(),
        next_cursor,
    }))
}

#[utoipa::path(
    get, path = "/ai/admin/runs/{id}", tag = "ai",
    params(("id" = AiRunId, Path, description = "Run id")),
    responses(
        (status = 200, description = "Run with events, artifacts and evidence", body = AdminRunDetail),
        (status = 404, description = "Unknown run", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn admin_run_detail(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AiRunId>,
) -> ApiResult<Json<AdminRunDetail>> {
    let detail = state.ai.admin_run_detail(&actor, id).await?;
    Ok(Json(AdminRunDetail {
        run: AdminRun::from_row(detail.run, now_unix()),
        events: detail.events.into_iter().map(Into::into).collect(),
        artifacts: detail.artifacts.into_iter().map(Into::into).collect(),
        evidence: detail.evidence.into_iter().map(Into::into).collect(),
    }))
}

#[utoipa::path(
    get, path = "/ai/admin/evals", tag = "ai",
    responses((status = 200, description = "Run aggregate + eval summary", body = EvalDashboard)),
)]
pub async fn admin_evals(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<EvalDashboard>> {
    Ok(Json(state.ai.eval_dashboard(&actor).await?.into()))
}

/// Platform token usage against the monthly budget.
#[utoipa::path(
    get, path = "/ai/usage", tag = "ai",
    responses(
        (status = 200, description = "Usage", body = UsageSummary),
        (status = 403, description = "Not a platform reader", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn usage(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<UsageSummary>> {
    Ok(Json(state.ai.usage(&actor).await?.into()))
}

/// Alias of `/ai/usage` kept for the legacy client.
#[utoipa::path(
    get, path = "/ai/usage/budget", tag = "ai",
    responses((status = 200, description = "Usage", body = UsageSummary)),
)]
pub async fn usage_budget(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<UsageSummary>> {
    Ok(Json(state.ai.usage(&actor).await?.into()))
}
