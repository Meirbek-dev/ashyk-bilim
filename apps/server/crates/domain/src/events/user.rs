//! The per-user event stream (S-06): `sse:user:{user}`, read by
//! `GET /me/events`.
//!
//! Every event addressed to one user lands on that user's Redis stream
//! (`MAXLEN ~ 500`, 7-day TTL refreshed on publish). Fan-out happens at
//! publish time and so does the authorization: a producer names the
//! recipients it is allowed to tell (the course's graders, the submission's
//! owner, a notification's recipient); the reader only ever reads its own
//! stream. Delivery is best effort - a client that misses an event refetches
//! on reconnect (`Last-Event-ID` replays what the stream still holds).
//!
//! Producers live in every context, many with only a database pool (XP
//! hooks, the progress projector), so the publisher is process-wide:
//! [`install`] is called once at boot with the Redis client; without it
//! (worker without Redis, DB-only tests) publishing is a no-op.

use std::sync::OnceLock;

use ab_core::assessments::{SubmissionStatus, XpSource};
use ab_core::id::{
    ActivityId, AssessmentId, CourseId, FileAttemptId, FileSubmissionId, NotificationId,
    SubmissionId, UserId, XpTransactionId,
};
use redis::streams::StreamMaxlen;
use serde::Serialize;
use sqlx::PgPool;
use utoipa::ToSchema;

use super::Stream;
use crate::notifications::Notification;

/// Events kept per user stream (approximate trimming).
const USER_STREAM_MAXLEN: usize = 500;
const USER_STREAM_TTL_SECS: i64 = 7 * 24 * 3600;

static PUBLISHER: OnceLock<redis::Client> = OnceLock::new();

/// Wire the process-wide publisher (first call wins; every caller in one
/// process passes the same Redis).
pub fn install(client: redis::Client) {
    let _ = PUBLISHER.set(client);
}

/// A grade change or hand-in on a course the recipient grades (the
/// per-user copy of the course grading stream). `submission_id` for
/// assessments, `attempt_id` for file submissions.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct GradingUpdated {
    pub course_id: CourseId,
    pub activity_id: ActivityId,
    /// The learner whose work changed.
    pub user_id: UserId,
    pub submission_id: Option<SubmissionId>,
    pub attempt_id: Option<FileAttemptId>,
    pub status: SubmissionStatus,
    pub final_score: Option<f64>,
}

/// The recipient's own submission or file attempt changed state.
/// `final_score` only once the grade is released (`published`).
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SubmissionUpdated {
    pub course_id: CourseId,
    pub activity_id: ActivityId,
    pub submission_id: Option<SubmissionId>,
    pub attempt_id: Option<FileAttemptId>,
    pub status: SubmissionStatus,
    pub final_score: Option<f64>,
}

/// Read state changed: one notification, or all (`notification_id` null).
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct NotificationRead {
    pub notification_id: Option<NotificationId>,
    pub unread_count: i64,
}

/// XP granted to the recipient (S-13).
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct XpAwarded {
    pub transaction_id: XpTransactionId,
    pub amount: i32,
    pub source: XpSource,
    /// Free-text reason (admin awards); null for automatic sources.
    pub reason: Option<String>,
    /// The new total and level after this award.
    pub total_xp: i32,
    pub level: i32,
}

/// The recipient's own due date on one activity moved (a deadline
/// extension or a per-learner override). `assessment_id` for an
/// assessment, `file_submission_id` for a file submission.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DeadlineExtended {
    pub course_id: CourseId,
    pub activity_id: ActivityId,
    pub assessment_id: Option<AssessmentId>,
    pub file_submission_id: Option<FileSubmissionId>,
    pub due_at_unix: i64,
}

/// The closed set of user-stream events: the SSE `event:` name and the
/// typed `payload`.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(tag = "event", content = "payload")]
pub enum UserEvent {
    #[serde(rename = "grading.updated")]
    GradingUpdated(GradingUpdated),
    #[serde(rename = "submission.updated")]
    SubmissionUpdated(SubmissionUpdated),
    #[serde(rename = "notification.created")]
    NotificationCreated(Notification),
    #[serde(rename = "notification.read")]
    NotificationRead(NotificationRead),
    #[serde(rename = "xp.awarded")]
    XpAwarded(XpAwarded),
    #[serde(rename = "deadline.extended")]
    DeadlineExtended(DeadlineExtended),
}

impl UserEvent {
    /// Every event name, for the contract pin test.
    pub const NAMES: &'static [&'static str] = &[
        "grading.updated",
        "submission.updated",
        "notification.created",
        "notification.read",
        "xp.awarded",
        "deadline.extended",
    ];
}

/// Append `events` to their recipients' streams, pipelined on one
/// connection. Never fails the caller.
// ponytail: one fresh connection per publish batch (a connection manager
// is bound to the runtime that made it, and producers run on many); pool
// connections if publish rates ever make the connect show up.
pub async fn publish(events: Vec<(UserId, UserEvent)>) {
    let Some(client) = PUBLISHER.get() else {
        return;
    };
    if events.is_empty() {
        return;
    }
    let mut pipe = redis::pipe();
    let sent_at = super::now_unix().to_string();
    for (user_id, event) in &events {
        let Ok(serde_json::Value::Object(mut fields)) = serde_json::to_value(event) else {
            continue;
        };
        let name = fields
            .remove("event")
            .and_then(|v| v.as_str().map(str::to_owned))
            .unwrap_or_default();
        let payload = fields.remove("payload").unwrap_or_default().to_string();
        let key = Stream::User(*user_id).key();
        pipe.xadd_maxlen(
            &key,
            StreamMaxlen::Approx(USER_STREAM_MAXLEN),
            "*",
            &[
                ("event", name),
                ("payload", payload),
                ("sent_at", sent_at.clone()),
            ],
        )
        .ignore()
        .expire(&key, USER_STREAM_TTL_SECS)
        .ignore();
    }
    let sent = async {
        let mut conn = client.get_multiplexed_async_connection().await?;
        pipe.query_async::<()>(&mut conn).await
    }
    .await;
    if let Err(err) = sent {
        tracing::warn!(%err, count = events.len(), "user events not published");
    }
}

/// `grading.updated` to the course's graders.
///
/// Its creator and active writing co-authors - the people its grading
/// stream serves. Platform-wide
/// graders (admins) keep the course stream; they are not fanned out to.
pub async fn grading(pool: &PgPool, payload: GradingUpdated) {
    let graders = match ab_db::notifications::course_authors(pool, payload.course_id).await {
        Ok(graders) => graders,
        Err(err) => {
            tracing::warn!(%err, "grading fan-out: graders not resolved");
            return;
        }
    };
    publish(
        graders
            .into_iter()
            .map(|user| (user, UserEvent::GradingUpdated(payload.clone())))
            .collect(),
    )
    .await;
}

/// `submission.updated` to the work's owner (the final score withheld
/// until released).
pub async fn submission(owner: UserId, mut payload: SubmissionUpdated) {
    if payload.status != SubmissionStatus::Published {
        payload.final_score = None;
    }
    publish(vec![(owner, UserEvent::SubmissionUpdated(payload))]).await;
}

/// `deadline.extended` to the learner whose due date moved.
pub async fn deadline_extended(learner: UserId, payload: DeadlineExtended) {
    publish(vec![(learner, UserEvent::DeadlineExtended(payload))]).await;
}
