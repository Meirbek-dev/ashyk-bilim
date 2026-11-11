//! Personal message DTOs (docs/DIALOGS.md 5). The responses are the domain
//! types (`ab_domain::community::messages`), like notifications.

use ab_core::id::{ActivityId, CourseId, MessageId, MessageReportId, UserId};
use serde::Deserialize;
use utoipa::ToSchema;

pub use ab_domain::community::messages::{
    Attachment, AttachmentDownload, BulkResult, BulkSent, BulkSkipped, Conversation,
    ConversationAction, ConversationPage, DenyReason, LastMessage, Message, MessageAction,
    MessageContext, MessagePage, MessageReport, MessageReportDetail, MessageReportPage,
    PeerConversation, Person, Recipient, RecipientPage, RecipientRole, ReportStatus, SharedCourse,
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

/// A file to attach: the sender's finalized `message-attachment` upload.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AttachmentRequest {
    #[garde(skip)]
    pub upload_id: uuid::Uuid,
    /// The file's name as the recipient sees it.
    #[garde(length(chars, min = 1, max = 255))]
    #[schema(min_length = 1, max_length = 255)]
    pub name: String,
}

impl From<AttachmentRequest> for ab_domain::community::messages::NewAttachment {
    fn from(a: AttachmentRequest) -> Self {
        Self {
            upload_id: a.upload_id,
            name: a.name,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SendMessageRequest {
    #[garde(skip)]
    pub to_user_id: UserId,
    /// Markdown, 1..=4000 characters after trimming; may be empty when
    /// files come with it.
    #[garde(length(chars, max = 4000))]
    #[schema(max_length = 4000)]
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
    /// Up to five files, in order.
    #[garde(length(max = 5), dive)]
    #[schema(max_items = 5)]
    #[serde(default)]
    pub attachments: Vec<AttachmentRequest>,
    /// Also record a `message_sent` intervention for the learner of
    /// `course_id` (sending from analytics; the course's teachers).
    #[garde(skip)]
    #[serde(default)]
    pub intervention: bool,
}

/// One message to several learners of a course: a separate message in each
/// conversation.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct BulkMessageRequest {
    #[garde(skip)]
    pub course_id: CourseId,
    /// 1..=50 learners of the course.
    #[garde(length(min = 1, max = 50))]
    #[schema(min_items = 1, max_items = 50)]
    pub to_user_ids: Vec<UserId>,
    #[garde(length(chars, max = 4000))]
    #[schema(max_length = 4000)]
    pub body: String,
    /// A key per bulk send: a resend with it sends nothing twice.
    #[garde(skip)]
    pub client_key: uuid::Uuid,
    #[garde(length(max = 5), dive)]
    #[schema(max_items = 5)]
    #[serde(default)]
    pub attachments: Vec<AttachmentRequest>,
    /// Also record a `message_sent` intervention for each learner.
    #[garde(skip)]
    #[serde(default)]
    pub intervention: bool,
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
#[serde(deny_unknown_fields)]
pub struct AttachmentUrlQuery {
    /// Open in the browser (only types it may render from our origin);
    /// default: download.
    pub inline: Option<bool>,
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
