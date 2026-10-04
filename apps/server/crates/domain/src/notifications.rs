//! In-app notifications (S-07): storage, reads, preferences and the
//! producers' one entry point [`notify`].
//!
//! A producer names the recipients it may tell (authorization is decided
//! there, at fan-out) and a typed [`NotificationPayload`]; [`notify`] drops
//! recipients who opted out of the type, stores one row each (idempotent
//! per `dedup_key`) and publishes `notification.created` on each
//! recipient's event stream. Producers call it after their own commit and
//! never fail on it (best effort, logged).

use ab_core::assessments::NotificationType;
use ab_core::id::{
    ActivityId, AssessmentId, CourseId, CourseUpdateId, DiscussionId, FileAttemptId,
    FileSubmissionId, NotificationId, SubmissionId, UserId,
};
use ab_core::{Error, FieldError, Result};
use ab_db::notifications::NotificationRow;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use utoipa::ToSchema;

use crate::events::user::{self, NotificationRead, UserEvent};
use crate::identity::Actor;

/// Retention of stored notifications (the worker prunes older rows).
pub const RETENTION_DAYS: i32 = 90;
pub const DEFAULT_PAGE: i64 = 20;
pub const MAX_PAGE: i64 = 100;

/// What happened, with the ids a client needs to route and to invalidate
/// caches, and the names the bell renders without another request.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NotificationPayload {
    /// A grade on the recipient's work was released.
    GradePublished {
        course_id: CourseId,
        course_name: String,
        activity_id: ActivityId,
        activity_name: String,
        submission_id: Option<SubmissionId>,
        attempt_id: Option<FileAttemptId>,
        final_score: Option<f64>,
    },
    /// The recipient's work was returned for revision.
    SubmissionReturned {
        course_id: CourseId,
        course_name: String,
        activity_id: ActivityId,
        activity_name: String,
        submission_id: Option<SubmissionId>,
        attempt_id: Option<FileAttemptId>,
    },
    /// A teacher extended the recipient's deadline: `assessment_id` for an
    /// assessment, `file_submission_id` for a file submission (S-GAPS;
    /// rows stored before it carry `assessment_id` only).
    DeadlineExtended {
        course_id: CourseId,
        course_name: String,
        activity_id: ActivityId,
        activity_name: String,
        assessment_id: Option<AssessmentId>,
        file_submission_id: Option<FileSubmissionId>,
        due_at_unix: i64,
    },
    /// Unsubmitted work is due within a day.
    DeadlineApproaching {
        course_id: CourseId,
        course_name: String,
        activity_id: ActivityId,
        activity_name: String,
        due_at_unix: i64,
    },
    /// An announcement on a course the recipient is enrolled in.
    CourseUpdate {
        course_id: CourseId,
        course_name: String,
        update_id: CourseUpdateId,
        title: String,
    },
    /// A reply in a thread the recipient started or replied in.
    DiscussionReply {
        course_id: CourseId,
        course_name: String,
        /// The thread (top-level post).
        discussion_id: DiscussionId,
        reply_id: DiscussionId,
        author_id: UserId,
        author_name: String,
    },
    /// Someone applied to co-author a course the recipient owns.
    ContributorApplication {
        course_id: CourseId,
        course_name: String,
        applicant_id: UserId,
        applicant_name: String,
    },
}

impl NotificationPayload {
    #[must_use]
    pub const fn kind(&self) -> NotificationType {
        match self {
            Self::GradePublished { .. } => NotificationType::GradePublished,
            Self::SubmissionReturned { .. } => NotificationType::SubmissionReturned,
            Self::DeadlineExtended { .. } => NotificationType::DeadlineExtended,
            Self::DeadlineApproaching { .. } => NotificationType::DeadlineApproaching,
            Self::CourseUpdate { .. } => NotificationType::CourseUpdate,
            Self::DiscussionReply { .. } => NotificationType::DiscussionReply,
            Self::ContributorApplication { .. } => NotificationType::ContributorApplication,
        }
    }
}

/// One notification as served (list items and `notification.created`).
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Notification {
    pub id: NotificationId,
    /// Same as `payload.type`.
    #[serde(rename = "type")]
    pub kind: NotificationType,
    pub payload: NotificationPayload,
    pub created_at_unix: i64,
    /// Null while unread.
    pub read_at_unix: Option<i64>,
}

impl Notification {
    fn from_row(row: NotificationRow) -> Option<Self> {
        match serde_json::from_value::<NotificationPayload>(row.payload) {
            Ok(payload) => Some(Self {
                id: row.id,
                kind: row.kind,
                payload,
                created_at_unix: row.created_at,
                read_at_unix: row.read_at,
            }),
            Err(err) => {
                tracing::warn!(id = %row.id, %err, "notification payload unreadable; skipped");
                None
            }
        }
    }
}

/// Store and publish `payload` for `recipients` (opted-out and inactive
/// ones dropped; `dedup_key` makes it once per recipient). Never fails.
pub async fn notify(
    pool: &PgPool,
    recipients: &[UserId],
    payload: &NotificationPayload,
    dedup_key: Option<&str>,
) {
    if recipients.is_empty() {
        return;
    }
    let stored = match serde_json::to_value(payload) {
        Ok(value) => {
            ab_db::notifications::insert_many(pool, recipients, payload.kind(), &value, dedup_key)
                .await
        }
        Err(err) => Err(Error::internal("notification payload", err)),
    };
    match stored {
        Ok(rows) => {
            user::publish(
                rows.into_iter()
                    .filter_map(|row| {
                        let to = row.user_id;
                        Notification::from_row(row).map(|n| (to, UserEvent::NotificationCreated(n)))
                    })
                    .collect(),
            )
            .await;
        }
        Err(err) => tracing::warn!(%err, kind = %payload.kind(), "notification not stored"),
    }
}

/// `(course_id, course_name, activity_name)` for an activity, or `None`.
pub async fn activity_names(
    pool: &PgPool,
    activity_id: ActivityId,
) -> Option<(CourseId, String, String)> {
    match ab_db::notifications::activity_names(pool, activity_id).await {
        Ok(names) => names,
        Err(err) => {
            tracing::warn!(%err, "notification: activity names not resolved");
            None
        }
    }
}

/// A released or returned grade, told to the work's owner: the
/// `submission.updated` event always, the notification when the status is
/// `published` or `returned`.
pub async fn grade_changed(
    pool: &PgPool,
    owner: UserId,
    activity_id: ActivityId,
    work: (Option<SubmissionId>, Option<FileAttemptId>),
    status: ab_core::assessments::SubmissionStatus,
    final_score: Option<f64>,
) {
    use ab_core::assessments::SubmissionStatus;
    let Some((course_id, course_name, activity_name)) = activity_names(pool, activity_id).await
    else {
        return;
    };
    let (submission_id, attempt_id) = work;
    user::submission(
        owner,
        user::SubmissionUpdated {
            course_id,
            activity_id,
            submission_id,
            attempt_id,
            status,
            final_score,
        },
    )
    .await;
    let payload = match status {
        SubmissionStatus::Published => NotificationPayload::GradePublished {
            course_id,
            course_name,
            activity_id,
            activity_name,
            submission_id,
            attempt_id,
            final_score,
        },
        SubmissionStatus::Returned => NotificationPayload::SubmissionReturned {
            course_id,
            course_name,
            activity_id,
            activity_name,
            submission_id,
            attempt_id,
        },
        _ => return,
    };
    notify(pool, &[owner], &payload, None).await;
}

/// A page of notifications plus the cursor of the next one.
#[derive(Debug, Clone)]
pub struct NotificationPage {
    pub items: Vec<Notification>,
    pub next_cursor: Option<String>,
}

#[derive(Clone)]
pub struct NotificationsService {
    pool: PgPool,
}

fn require_user(actor: &Actor) -> Result<()> {
    if actor.is_anonymous() {
        return Err(Error::unauthenticated());
    }
    Ok(())
}

impl NotificationsService {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// The caller's notifications, newest first; `cursor` is the previous
    /// page's `next_cursor`.
    pub async fn list(
        &self,
        actor: &Actor,
        unread_only: bool,
        cursor: Option<&str>,
        limit: i64,
    ) -> Result<NotificationPage> {
        require_user(actor)?;
        let limit = ab_core::page_limit(limit, MAX_PAGE)?;
        let before = cursor
            .map(|c| {
                c.parse::<NotificationId>().map_err(|_| {
                    Error::validation(vec![FieldError {
                        field: "cursor".into(),
                        code: "invalid".into(),
                        message: "invalid notifications cursor".into(),
                    }])
                })
            })
            .transpose()?;
        let mut rows =
            ab_db::notifications::list(&self.pool, actor.user_id, unread_only, before, limit + 1)
                .await?;
        let more = rows.len() > usize::try_from(limit).unwrap_or(usize::MAX);
        rows.truncate(usize::try_from(limit).unwrap_or(usize::MAX));
        let next_cursor = more
            .then(|| rows.last().map(|r| r.id.to_string()))
            .flatten();
        Ok(NotificationPage {
            items: rows
                .into_iter()
                .filter_map(Notification::from_row)
                .collect(),
            next_cursor,
        })
    }

    pub async fn unread_count(&self, actor: &Actor) -> Result<i64> {
        require_user(actor)?;
        ab_db::notifications::unread_count(&self.pool, actor.user_id).await
    }

    /// Mark one of the caller's notifications read (idempotent); another
    /// user's id is 404. Returns the unread count after.
    pub async fn mark_read(&self, actor: &Actor, id: NotificationId) -> Result<i64> {
        require_user(actor)?;
        let changed = ab_db::notifications::mark_read(&self.pool, actor.user_id, id)
            .await?
            .ok_or_else(|| Error::not_found("notification"))?;
        let unread = ab_db::notifications::unread_count(&self.pool, actor.user_id).await?;
        if changed {
            self.read_event(actor.user_id, Some(id), unread).await;
        }
        Ok(unread)
    }

    /// Mark everything read. Returns the unread count after (0).
    pub async fn mark_all_read(&self, actor: &Actor) -> Result<i64> {
        require_user(actor)?;
        let changed = ab_db::notifications::mark_all_read(&self.pool, actor.user_id).await?;
        let unread = ab_db::notifications::unread_count(&self.pool, actor.user_id).await?;
        if changed > 0 {
            self.read_event(actor.user_id, None, unread).await;
        }
        Ok(unread)
    }

    async fn read_event(&self, user_id: UserId, id: Option<NotificationId>, unread: i64) {
        user::publish(vec![(
            user_id,
            UserEvent::NotificationRead(NotificationRead {
                notification_id: id,
                unread_count: unread,
            }),
        )])
        .await;
    }

    /// The types the caller has turned off.
    pub async fn disabled_types(&self, actor: &Actor) -> Result<Vec<NotificationType>> {
        require_user(actor)?;
        ab_db::notifications::disabled_types(&self.pool, actor.user_id).await
    }

    pub async fn set_disabled_types(
        &self,
        actor: &Actor,
        disabled: &[NotificationType],
    ) -> Result<Vec<NotificationType>> {
        require_user(actor)?;
        ab_db::notifications::set_disabled_types(&self.pool, actor.user_id, disabled).await?;
        ab_db::notifications::disabled_types(&self.pool, actor.user_id).await
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    /// The payload union is tagged by the type the table stores.
    #[test]
    fn payload_tags_are_the_stored_types() {
        let payload = NotificationPayload::CourseUpdate {
            course_id: CourseId::new(),
            course_name: "C".into(),
            update_id: CourseUpdateId::new(),
            title: "T".into(),
        };
        let json = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["type"], payload.kind().as_str());
        let back: NotificationPayload = serde_json::from_value(json).unwrap();
        assert_eq!(back.kind(), NotificationType::CourseUpdate);
    }
}
