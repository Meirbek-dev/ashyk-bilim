//! The signed-in user's notifications, preferences and agenda (S-07, S-09).
//!
//! The event stream (`GET /me/events`) lives with the other streams
//! in `routes::sse`. Everything here reads and writes the caller's own
//! rows only: another user's notification id is 404.

use ab_core::id::NotificationId;
use axum::Json;
use axum::extract::State;

use crate::dto::me::{
    Agenda, AgendaQuery, NotificationListQuery, NotificationPage, NotificationSettings, UnreadCount,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, Path, Query, ValidJson};
use crate::state::AppState;

/// The caller's notifications, newest first (keyset).
#[utoipa::path(
    get, path = "/me/notifications", tag = "me",
    params(NotificationListQuery),
    responses(
        (status = 200, description = "Page of notifications", body = NotificationPage),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Bad `cursor` or `limit`", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_notifications(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<NotificationListQuery>,
) -> ApiResult<Json<NotificationPage>> {
    let page = state
        .notifications
        .list(
            &actor,
            query.unread.unwrap_or(false),
            query.cursor.as_deref(),
            query
                .limit
                .unwrap_or(ab_domain::notifications::DEFAULT_PAGE),
        )
        .await?;
    Ok(Json(NotificationPage {
        items: page.items,
        next_cursor: page.next_cursor,
    }))
}

/// How many of the caller's notifications are unread (the bell badge).
#[utoipa::path(
    get, path = "/me/notifications/unread-count", tag = "me",
    responses(
        (status = 200, description = "Unread count", body = UnreadCount),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn unread_count(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<UnreadCount>> {
    Ok(Json(UnreadCount {
        unread_count: state.notifications.unread_count(&actor).await?,
    }))
}

/// Mark one notification read (idempotent); emits `notification.read`.
#[utoipa::path(
    post, path = "/me/notifications/{notification_id}/read", tag = "me",
    params(("notification_id" = NotificationId, Path, description = "Notification id")),
    responses(
        (status = 200, description = "Marked; the unread count after", body = UnreadCount),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown, or another user's", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn mark_notification_read(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<NotificationId>,
) -> ApiResult<Json<UnreadCount>> {
    Ok(Json(UnreadCount {
        unread_count: state.notifications.mark_read(&actor, id).await?,
    }))
}

/// Mark every notification read; emits `notification.read` (with a null
/// `notification_id`).
#[utoipa::path(
    post, path = "/me/notifications/read-all", tag = "me",
    responses(
        (status = 200, description = "Marked; the unread count after (0)", body = UnreadCount),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn mark_all_notifications_read(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<UnreadCount>> {
    Ok(Json(UnreadCount {
        unread_count: state.notifications.mark_all_read(&actor).await?,
    }))
}

/// Which notification types the caller receives (in-app only).
#[utoipa::path(
    get, path = "/me/notification-preferences", tag = "me",
    responses(
        (status = 200, description = "One switch per type", body = NotificationSettings),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_notification_preferences(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<NotificationSettings>> {
    let disabled = state.notifications.disabled_types(&actor).await?;
    Ok(Json(NotificationSettings::from_disabled(&disabled)))
}

/// Replace the caller's switches (every type, `true` = on). Turning a type
/// off stops new notifications of it; existing ones stay.
#[utoipa::path(
    put, path = "/me/notification-preferences", tag = "me",
    request_body = NotificationSettings,
    responses(
        (status = 200, description = "Saved switches", body = NotificationSettings),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Validation failed", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn put_notification_preferences(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ValidJson(request): ValidJson<NotificationSettings>,
) -> ApiResult<Json<NotificationSettings>> {
    let disabled = state
        .notifications
        .set_disabled_types(&actor, &request.disabled())
        .await?;
    Ok(Json(NotificationSettings::from_disabled(&disabled)))
}

/// The learner's "today" in one request (S-09).
///
/// Deadlines in the next `days` across enrolled courses, where to continue, results released or
/// returned and announcements of the last 14 days. Ids, never hrefs.
#[utoipa::path(
    get, path = "/me/agenda", tag = "me",
    params(AgendaQuery),
    responses(
        (status = 200, description = "Agenda", body = Agenda),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "`days` out of range", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn agenda(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AgendaQuery>,
) -> ApiResult<Json<Agenda>> {
    let days = query
        .days
        .unwrap_or(ab_domain::progress::agenda::DEFAULT_DAYS);
    Ok(Json(state.agenda.agenda(&actor, days).await?))
}
