//! Personal message DTOs (docs/DIALOGS.md 5). The responses are the domain
//! types (`ab_domain::community::messages`), like notifications.

use ab_core::id::{ActivityId, CourseId, MessageId, MessageReportId, UserId};
use serde::Deserialize;
use utoipa::ToSchema;

pub use ab_domain::community::messages::{
    Conversation, ConversationAction, ConversationPage, DenyReason, LastMessage, Message,
    MessageAction, MessageContext, MessagePage, MessageReport, MessageReportDetail,
    MessageReportPage, PeerConversation, Person, Recipient, RecipientPage, RecipientRole,
    ReportStatus, SharedCourse,
};

#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
#[serde(deny_unknown_fields)]
pub struct ConversationListQuery {
    /// The previous page's `next_cursor`.
    pub cursor: Option<MessageId>,
    /// 1..=50, default 20.
    pub limit: Option<i64>,
    /// Only conversations with unread messages (default false).
    pub unread_only: Option<bool>,
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
#[serde(deny_unknown_fields)]
pub struct MessageListQuery {
    /// The previous page's `next_cursor` (older messages).
    pub cursor: Option<MessageId>,
    /// 1..=50, default 30.
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
#[serde(deny_unknown_fields)]
pub struct RecipientQuery {
    /// Part of a name or username.
    pub q: Option<String>,
    /// Only people of this course.
    pub course_id: Option<CourseId>,
    /// The previous page's `next_cursor`.
    pub cursor: Option<String>,
    /// 1..=50, default 20.
    pub limit: Option<i64>,
}

/// `GET /me/conversations/unread-count`.
#[derive(Debug, serde::Serialize, ToSchema)]
pub struct ConversationUnreadCount {
    /// Conversations holding an unread message (the top bar badge).
    pub conversations: i64,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SendMessageRequest {
    #[garde(skip)]
    pub to_user_id: UserId,
    /// Markdown, 1..=4000 characters after trimming.
    #[garde(length(chars, min = 1, max = 4000))]
    #[schema(min_length = 1, max_length = 4000)]
    pub body: String,
    /// A key the client makes per message: a resend with the same key
    /// returns the stored message instead of sending twice.
    #[garde(skip)]
    pub client_key: uuid::Uuid,
    /// What the message is about (where the writer started from).
    #[garde(skip)]
    pub course_id: Option<CourseId>,
    /// An activity of `course_id` (or of its own course when `course_id`
    /// is left out).
    #[garde(skip)]
    pub activity_id: Option<ActivityId>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct MarkReadRequest {
    /// The latest message shown; the pointer only moves forward.
    #[garde(skip)]
    pub last_read_message_id: MessageId,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReportMessageRequest {
    #[garde(length(chars, min = 1, max = 1000))]
    #[schema(min_length = 1, max_length = 1000)]
    pub reason: String,
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
#[serde(deny_unknown_fields)]
pub struct ReportListQuery {
    /// Only reports in this state.
    pub status: Option<ReportStatus>,
    pub cursor: Option<MessageReportId>,
    /// 1..=50, default 20.
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ResolveReportRequest {
    /// What was decided (the reporter is told that it was decided, not this).
    #[garde(length(chars, min = 1, max = 2000))]
    #[schema(min_length = 1, max_length = 2000)]
    pub resolution: String,
    /// Also ban the message's author from sending.
    #[garde(skip)]
    #[serde(default)]
    pub ban: bool,
}
