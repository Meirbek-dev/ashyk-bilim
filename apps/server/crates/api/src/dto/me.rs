//! The signed-in user's own surfaces (S-06, S-07, S-09): the event stream
//! schema, notifications and their preferences, the agenda.

use ab_core::assessments::NotificationType;
use ab_core::id::UserId;
use ab_domain::events::user::{GradingUpdated, NotificationRead, SubmissionUpdated, XpAwarded};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

pub use ab_domain::notifications::{Notification, NotificationPayload};
pub use ab_domain::progress::agenda::Agenda;

/// `GET /me/events`: one message's `data`. The SSE `event:` name equals the
/// `event` member; `event_id` is the SSE `id:` (send it back as
/// `Last-Event-ID`).
#[derive(Serialize, ToSchema)]
#[serde(tag = "event")]
pub enum UserStreamEvent {
    /// Sent once, after any replay.
    #[serde(rename = "connected")]
    Connected { user_id: UserId },
    #[serde(rename = "grading.updated")]
    GradingUpdated {
        event_id: String,
        payload: GradingUpdated,
        /// Unix seconds.
        sent_at: i64,
    },
    #[serde(rename = "submission.updated")]
    SubmissionUpdated {
        event_id: String,
        payload: SubmissionUpdated,
        /// Unix seconds.
        sent_at: i64,
    },
    #[serde(rename = "notification.created")]
    NotificationCreated {
        event_id: String,
        payload: Notification,
        /// Unix seconds.
        sent_at: i64,
    },
    #[serde(rename = "notification.read")]
    NotificationRead {
        event_id: String,
        payload: NotificationRead,
        /// Unix seconds.
        sent_at: i64,
    },
    #[serde(rename = "xp.awarded")]
    XpAwarded {
        event_id: String,
        payload: XpAwarded,
        /// Unix seconds.
        sent_at: i64,
    },
    /// The session is gone; the stream ends.
    #[serde(rename = "closed")]
    Closed { code: ab_core::ErrorCode },
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
#[serde(deny_unknown_fields)]
pub struct NotificationListQuery {
    /// Only unread ones (default false).
    pub unread: Option<bool>,
    /// The previous page's `next_cursor` (opaque).
    pub cursor: Option<String>,
    /// 1..=100, default 20.
    pub limit: Option<i64>,
}

/// Newest first.
#[derive(Debug, Serialize, ToSchema)]
pub struct NotificationPage {
    pub items: Vec<Notification>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UnreadCount {
    pub unread_count: i64,
}

/// In-app notifications on (`true`) or off, one switch per type. `PUT`
/// takes the full set.
#[allow(
    clippy::struct_excessive_bools,
    reason = "one switch per notification type"
)]
#[derive(Debug, Serialize, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct NotificationSettings {
    #[garde(skip)]
    pub grade_published: bool,
    #[garde(skip)]
    pub submission_returned: bool,
    #[garde(skip)]
    pub deadline_extended: bool,
    #[garde(skip)]
    pub deadline_approaching: bool,
    #[garde(skip)]
    pub course_update: bool,
    #[garde(skip)]
    pub discussion_reply: bool,
    #[garde(skip)]
    pub contributor_application: bool,
}

impl NotificationSettings {
    const fn switches(&self) -> [(NotificationType, bool); 7] {
        [
            (NotificationType::GradePublished, self.grade_published),
            (
                NotificationType::SubmissionReturned,
                self.submission_returned,
            ),
            (NotificationType::DeadlineExtended, self.deadline_extended),
            (
                NotificationType::DeadlineApproaching,
                self.deadline_approaching,
            ),
            (NotificationType::CourseUpdate, self.course_update),
            (NotificationType::DiscussionReply, self.discussion_reply),
            (
                NotificationType::ContributorApplication,
                self.contributor_application,
            ),
        ]
    }

    /// The types switched off.
    #[must_use]
    pub fn disabled(&self) -> Vec<NotificationType> {
        self.switches()
            .into_iter()
            .filter_map(|(kind, on)| (!on).then_some(kind))
            .collect()
    }

    #[must_use]
    pub fn from_disabled(disabled: &[NotificationType]) -> Self {
        let on = |kind| !disabled.contains(&kind);
        Self {
            grade_published: on(NotificationType::GradePublished),
            submission_returned: on(NotificationType::SubmissionReturned),
            deadline_extended: on(NotificationType::DeadlineExtended),
            deadline_approaching: on(NotificationType::DeadlineApproaching),
            course_update: on(NotificationType::CourseUpdate),
            discussion_reply: on(NotificationType::DiscussionReply),
            contributor_application: on(NotificationType::ContributorApplication),
        }
    }
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
#[serde(deny_unknown_fields)]
pub struct AgendaQuery {
    /// Deadline window in days, 1..=60 (default 14).
    pub days: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use utoipa::PartialSchema;

    fn tags<T: PartialSchema>(tag: &str) -> Vec<String> {
        let schema = serde_json::to_value(T::schema()).unwrap_or_default();
        let mut names: Vec<String> = schema["oneOf"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| v["properties"][tag]["enum"][0].as_str().map(String::from))
            .collect();
        names.sort();
        names
    }

    /// The stream schema names exactly the events the server publishes.
    #[test]
    fn stream_events_match_the_server() {
        let mut expected: Vec<String> = ab_domain::events::user::UserEvent::NAMES
            .iter()
            .map(|n| (*n).to_owned())
            .chain(["closed".to_owned(), "connected".to_owned()])
            .collect();
        expected.sort();
        assert_eq!(tags::<UserStreamEvent>("event"), expected);
    }

    /// The payload union and the preference switches cover every type.
    #[test]
    fn notification_types_are_pinned() {
        let mut types: Vec<String> = NotificationType::ALL
            .iter()
            .map(|t| t.as_str().to_owned())
            .collect();
        types.sort();
        assert_eq!(tags::<NotificationPayload>("type"), types);
        let all_off = NotificationSettings::from_disabled(NotificationType::ALL);
        assert_eq!(all_off.disabled().len(), NotificationType::ALL.len());
    }
}
