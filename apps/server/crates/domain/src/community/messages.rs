//! Personal messages ("Диалоги", docs/DIALOGS.md): one-to-one conversations
//! between people a course links.
//!
//! [`MessagesService::decide`] is the one place that says who may write to
//! whom (`can_message`, section 3); it runs on every send, not once per
//! conversation. Someone else's conversation or message is 404: its
//! existence is not disclosed. The text never reaches logs, analytics or the
//! AI; administrators read it only through a report (section 6).

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use ab_clients::storage::{Bucket, StorageClient};

use ab_core::id::{ActivityId, ConversationId, CourseId, MessageId, MessageReportId, UserId};
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, ErrorCode, FieldError, Result};
use ab_db::messages::{self as db, MessageRow, PersonRow, ReportRow};
use serde::Serialize;
use sqlx::PgPool;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::catalog::courses::CoursesService;
use crate::events::user;
use crate::identity::{Actor, RbacAdminService};

mod bulk;
mod delivery;

pub use bulk::{BulkInput, BulkResult, BulkSent, BulkSkipped};

pub const MAX_BODY_CHARS: usize = 4000;
pub const MAX_REASON_CHARS: usize = 1000;
pub const MAX_RESOLUTION_CHARS: usize = 2000;
pub const MAX_PAGE: i64 = 50;
pub const DEFAULT_MESSAGES_PAGE: i64 = 30;
pub const DEFAULT_CONVERSATIONS_PAGE: i64 = 20;
/// Characters of the latest message a list row quotes.
const EXCERPT_CHARS: usize = 140;
/// Messages shown on each side of a reported one.
const REPORT_CONTEXT: i64 = 5;
/// Files one message carries (stage 2, docs/DIALOGS.md 12).
pub const MAX_ATTACHMENTS: usize = 5;
/// The upload purpose of a message's file (`files::uploads` holds its cap).
pub const ATTACHMENT_PURPOSE: &str = "message-attachment";
const MAX_FILE_NAME_CHARS: usize = 255;
/// How long a file's signed download URL lives.
const DOWNLOAD_TTL: Duration = Duration::from_mins(15);

/// Sending limits per sender (section 5), counted in Postgres.
const PER_MINUTE: i64 = 20;
const PER_DAY: i64 = 300;
const NEW_PER_DAY: i64 = 20;
/// New conversations a day for course teams and administrators.
const NEW_PER_DAY_STAFF: i64 = 200;

/// `admin.users` (`platform:read:platform`): writes to anyone, reads reports.
const READ_PLATFORM: Permission = Permission {
    resource: ResourceType::Platform,
    action: Action::Read,
    scope: Some(Scope::Platform),
};

/// What the caller may do in a conversation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConversationAction {
    Send,
}

/// Why sending is closed (the composer shows it instead of the input).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum DenyReason {
    /// No live course links the two people (any more).
    NoRelation,
    /// The caller is banned from sending.
    Banned,
    /// The other side's account is disabled or erased.
    PeerUnavailable,
}

impl DenyReason {
    fn error(self) -> Error {
        match self {
            Self::Banned => Error::app(ErrorCode::MessagesBanned, "you may not send messages"),
            reason => Error::app_with_details(
                ErrorCode::MessageRecipientNotAllowed,
                "you cannot write to this person",
                serde_json::json!({ "reason": reason }),
            ),
        }
    }
}

/// What the caller may do to a message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum MessageAction {
    /// Their own, not deleted.
    Delete,
    /// The other side's, not deleted, not reported by the caller yet.
    Report,
}

/// A person as conversations show them (no email).
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Person {
    pub id: UserId,
    pub username: String,
    pub display_name: Option<String>,
    pub avatar_key: Option<String>,
    /// False once the account is disabled or erased: nobody can write to it.
    pub available: bool,
}

impl From<PersonRow> for Person {
    fn from(r: PersonRow) -> Self {
        Self {
            id: r.id,
            username: r.username,
            display_name: r.display_name,
            avatar_key: r.avatar_key,
            available: r.available,
        }
    }
}

impl Person {
    /// A person whose row is gone (never expected: users are anonymised,
    /// not deleted).
    const fn missing(id: UserId) -> Self {
        Self {
            id,
            username: String::new(),
            display_name: None,
            avatar_key: None,
            available: false,
        }
    }
}

/// The latest message of a conversation, as its list row quotes it.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct LastMessage {
    pub id: MessageId,
    pub user_id: UserId,
    /// Plain text, at most 140 characters; empty when deleted.
    pub excerpt: String,
    pub created_at_unix: i64,
    pub deleted: bool,
    /// How many files it carries (0 when deleted).
    pub files: i64,
}

/// One row of the caller's conversation list.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Conversation {
    pub id: ConversationId,
    pub peer: Person,
    pub last_message: Option<LastMessage>,
    /// The other side's active messages after the caller's read pointer.
    pub unread_count: i64,
    pub allowed_actions: Vec<ConversationAction>,
    /// Set exactly when `send` is not allowed.
    pub deny_reason: Option<DenyReason>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ConversationPage {
    pub items: Vec<Conversation>,
    pub next_cursor: Option<MessageId>,
}

/// The caller and one person, before or after their first message.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PeerConversation {
    /// Null until the first message.
    pub conversation_id: Option<ConversationId>,
    pub peer: Person,
    pub allowed_actions: Vec<ConversationAction>,
    pub deny_reason: Option<DenyReason>,
}

/// What a message is about: where the writer started from.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MessageContext {
    pub course_id: CourseId,
    /// Null once the course is gone.
    pub course_name: Option<String>,
    pub activity_id: Option<ActivityId>,
    pub activity_name: Option<String>,
    #[schema(value_type = Option<crate::wire::ActivityType>)]
    pub activity_type: Option<String>,
}

/// A file attached to a message; only the two participants download it.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Attachment {
    pub upload_id: Uuid,
    /// The name the writer gave it.
    pub name: String,
    pub mime: String,
    pub size_bytes: i64,
}

impl From<db::AttachmentRow> for Attachment {
    fn from(r: db::AttachmentRow) -> Self {
        Self {
            upload_id: r.upload_id,
            name: r.name,
            mime: r.mime,
            size_bytes: r.size_bytes,
        }
    }
}

/// A short-lived download of an attached file.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AttachmentDownload {
    pub url: String,
    pub expires_at_unix: i64,
    pub name: String,
    pub mime: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Message {
    pub id: MessageId,
    pub conversation_id: ConversationId,
    /// The author.
    pub user_id: UserId,
    /// Markdown; empty when deleted.
    pub body: String,
    pub deleted: bool,
    pub context: Option<MessageContext>,
    /// In order; empty when deleted.
    pub attachments: Vec<Attachment>,
    pub allowed_actions: Vec<MessageAction>,
    pub created_at_unix: i64,
}

impl Message {
    fn of(row: MessageRow, viewer: UserId, attachments: Vec<Attachment>) -> Self {
        let own = row.user_id == viewer;
        let mut allowed_actions = Vec::new();
        if !row.deleted {
            if own {
                allowed_actions.push(MessageAction::Delete);
            } else if !row.reported {
                allowed_actions.push(MessageAction::Report);
            }
        }
        let context = row.course_id.map(|course_id| MessageContext {
            course_id,
            course_name: row.course_name,
            activity_id: row.activity_id,
            activity_name: row.activity_name,
            activity_type: row.activity_type,
        });
        Self {
            id: row.id,
            conversation_id: row.conversation_id,
            user_id: row.user_id,
            body: row.body,
            deleted: row.deleted,
            context,
            attachments,
            allowed_actions,
            created_at_unix: row.created_at,
        }
    }
}

/// A course the two sides share.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SharedCourse {
    pub id: CourseId,
    pub name: String,
}

/// A page of messages, newest first, with the conversation's state.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MessagePage {
    pub items: Vec<Message>,
    pub next_cursor: Option<MessageId>,
    pub peer: Person,
    /// Up to three live courses both sides belong to, newest first.
    pub shared_courses: Vec<SharedCourse>,
    pub allowed_actions: Vec<ConversationAction>,
    pub deny_reason: Option<DenyReason>,
    /// The caller's read pointer before this read (the «new messages»
    /// divider goes after it).
    pub last_read_message_id: Option<MessageId>,
}

/// Someone the caller may start a conversation with, and through which
/// course.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Recipient {
    pub person: Person,
    pub course_id: CourseId,
    pub course_name: String,
    /// The person's place in that course.
    pub role: RecipientRole,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RecipientRole {
    Teacher,
    Observer,
    Learner,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RecipientPage {
    pub items: Vec<Recipient>,
    /// Pass back as `cursor` (an offset).
    pub next_cursor: Option<String>,
}

/// A file to attach: a finalized `message-attachment` upload of the sender's.
#[derive(Debug, Clone)]
pub struct NewAttachment {
    pub upload_id: Uuid,
    pub name: String,
}

pub struct SendInput<'a> {
    pub to: UserId,
    pub body: &'a str,
    pub client_key: uuid::Uuid,
    pub course_id: Option<CourseId>,
    pub activity_id: Option<ActivityId>,
    pub attachments: Vec<NewAttachment>,
    /// Also record a `message_sent` intervention (from analytics), in the
    /// same transaction; needs the course context and a learner of it.
    pub intervention: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ReportStatus {
    Open,
    Resolved,
}

impl ReportStatus {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Resolved => "resolved",
        }
    }
}

/// A report as administrators list it.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MessageReport {
    pub id: MessageReportId,
    pub message_id: MessageId,
    pub conversation_id: ConversationId,
    pub reporter: Person,
    pub author: Person,
    pub reason: String,
    /// The message's text when it was reported.
    pub body_snapshot: String,
    pub status: ReportStatus,
    pub resolution: Option<String>,
    pub resolved_by: Option<UserId>,
    pub resolved_at_unix: Option<i64>,
    pub created_at_unix: i64,
    /// The author is banned from sending now.
    pub author_banned: bool,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MessageReportPage {
    pub items: Vec<MessageReport>,
    pub next_cursor: Option<MessageReportId>,
}

/// One report with the messages around the reported one.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MessageReportDetail {
    pub report: MessageReport,
    /// Up to five messages on each side of the reported one, in their
    /// current state, oldest first (the reported one included).
    pub context: Vec<Message>,
}

fn too_long(field: &str, max: usize) -> Error {
    Error::validation(vec![FieldError {
        field: field.into(),
        code: "too-long".into(),
        message: format!("at most {max} characters"),
    }])
}

/// Message text: control characters dropped (line breaks and tabs kept),
/// trimmed, 1..=4000 characters (0 allowed when files come with it).
fn clean_body(body: &str, has_files: bool) -> Result<String> {
    let cleaned = ab_core::strip_controls_multiline(body);
    if has_files && cleaned.trim().is_empty() {
        return Ok(String::new());
    }
    let trimmed = ab_core::required_str("body", &cleaned)?;
    if trimmed.chars().count() > MAX_BODY_CHARS {
        return Err(too_long("body", MAX_BODY_CHARS));
    }
    Ok(trimmed.to_owned())
}

/// Up to five files, each named 1..=255 characters without controls or path
/// separators, none twice.
fn clean_files(files: &[NewAttachment]) -> Result<Vec<(Uuid, String)>> {
    let invalid = |message: String| {
        Error::validation(vec![FieldError {
            field: "attachments".into(),
            code: "invalid".into(),
            message,
        }])
    };
    if files.len() > MAX_ATTACHMENTS {
        return Err(invalid(format!("at most {MAX_ATTACHMENTS} files")));
    }
    let mut seen = HashSet::new();
    let mut out = Vec::with_capacity(files.len());
    for file in files {
        if !seen.insert(file.upload_id) {
            return Err(invalid("a file is attached twice".into()));
        }
        let name: String = ab_core::strip_controls_multiline(&file.name)
            .chars()
            .filter(|c| !matches!(c, '/' | '\\' | '\n' | '\t'))
            .collect();
        let name = name.trim();
        if name.is_empty() || name.chars().count() > MAX_FILE_NAME_CHARS {
            return Err(invalid(format!(
                "a file name is 1 to {MAX_FILE_NAME_CHARS} characters"
            )));
        }
        out.push((file.upload_id, name.to_owned()));
    }
    Ok(out)
}

fn clean_text(field: &str, value: &str, max: usize) -> Result<String> {
    let cleaned = ab_core::strip_controls_multiline(value);
    let trimmed = ab_core::required_str(field, &cleaned)?;
    if trimmed.chars().count() > max {
        return Err(too_long(field, max));
    }
    Ok(trimmed.to_owned())
}

fn rate_limited(limit: &str, retry_after: i64) -> Error {
    Error::app_with_details(
        ErrorCode::RateLimited,
        "too many messages; slow down",
        serde_json::json!({ "limit": limit, "retry_after_seconds": retry_after }),
    )
}

fn actions(deny: Option<DenyReason>) -> Vec<ConversationAction> {
    if deny.is_none() {
        vec![ConversationAction::Send]
    } else {
        Vec::new()
    }
}

/// Keep `limit` rows; `true` when there were more.
fn page<T>(rows: &mut Vec<T>, limit: i64) -> bool {
    let limit = usize::try_from(limit).unwrap_or(usize::MAX);
    let more = rows.len() > limit;
    rows.truncate(limit);
    more
}

/// The answers [`MessagesService::decide`] needs, read once for many peers.
struct Standing {
    banned: bool,
    admin: bool,
    related: HashSet<UserId>,
    admins: HashSet<UserId>,
    /// Conversations the other side has written in.
    answered: HashSet<ConversationId>,
}

impl Standing {
    /// `can_message` (docs/DIALOGS.md 3) for one peer.
    fn decide(&self, peer: &Person, conversation: Option<ConversationId>) -> Option<DenyReason> {
        if !peer.available {
            return Some(DenyReason::PeerUnavailable);
        }
        if self.banned {
            return Some(DenyReason::Banned);
        }
        let reply_to_admin = self.admins.contains(&peer.id)
            && conversation.is_some_and(|c| self.answered.contains(&c));
        if self.admin || self.related.contains(&peer.id) || reply_to_admin {
            return None;
        }
        Some(DenyReason::NoRelation)
    }
}

#[derive(Clone)]
pub struct MessagesService {
    pool: PgPool,
    courses: CoursesService,
    storage: Arc<StorageClient>,
}

impl MessagesService {
    #[must_use]
    pub const fn new(pool: PgPool, courses: CoursesService, storage: Arc<StorageClient>) -> Self {
        Self {
            pool,
            courses,
            storage,
        }
    }

    /// Rows as messages for `viewer`, with their files (one query).
    async fn with_files(&self, rows: Vec<MessageRow>, viewer: UserId) -> Result<Vec<Message>> {
        let ids: Vec<MessageId> = rows.iter().filter(|r| !r.deleted).map(|r| r.id).collect();
        let mut files: HashMap<MessageId, Vec<Attachment>> = HashMap::new();
        if !ids.is_empty() {
            for row in db::attachments(&self.pool, &ids).await? {
                files.entry(row.message_id).or_default().push(row.into());
            }
        }
        Ok(rows
            .into_iter()
            .map(|r| {
                let own = files.remove(&r.id).unwrap_or_default();
                Message::of(r, viewer, own)
            })
            .collect())
    }

    async fn people(&self, ids: &[UserId]) -> Result<HashMap<UserId, Person>> {
        Ok(db::people(&self.pool, ids)
            .await?
            .into_iter()
            .map(|r| (r.id, Person::from(r)))
            .collect())
    }

    async fn standing(
        &self,
        actor: &Actor,
        peers: &[UserId],
        conversations: &[ConversationId],
    ) -> Result<Standing> {
        Ok(Standing {
            banned: db::is_banned(&self.pool, actor.user_id).await?,
            admin: actor.has(READ_PLATFORM),
            related: db::related_peers(&self.pool, actor.user_id, peers)
                .await?
                .into_iter()
                .collect(),
            admins: db::platform_admins(&self.pool, peers)
                .await?
                .into_iter()
                .collect(),
            answered: db::peer_wrote_in(&self.pool, actor.user_id, conversations)
                .await?
                .into_iter()
                .collect(),
        })
    }

    /// `can_message(actor, peer)` in `conversation` (if they have one).
    async fn decide(
        &self,
        actor: &Actor,
        peer: &Person,
        conversation: Option<ConversationId>,
    ) -> Result<Option<DenyReason>> {
        let convs: Vec<ConversationId> = conversation.into_iter().collect();
        let standing = self.standing(actor, &[peer.id], &convs).await?;
        Ok(standing.decide(peer, conversation))
    }

    /// The caller's conversations, the latest message first.
    pub async fn conversations(
        &self,
        actor: &Actor,
        cursor: Option<MessageId>,
        unread_only: bool,
        limit: i64,
    ) -> Result<ConversationPage> {
        let limit = ab_core::page_limit(limit, MAX_PAGE)?;
        let mut rows =
            db::list_conversations(&self.pool, actor.user_id, cursor, unread_only, limit + 1)
                .await?;
        let more = page(&mut rows, limit);
        let next_cursor = if more {
            rows.last().and_then(|r| r.last_message_id)
        } else {
            None
        };
        let peers: Vec<UserId> = rows.iter().map(|r| r.peer_id).collect();
        let convs: Vec<ConversationId> = rows.iter().map(|r| r.id).collect();
        let people = self.people(&peers).await?;
        let standing = self.standing(actor, &peers, &convs).await?;
        let items = rows
            .into_iter()
            .map(|r| {
                let peer = people
                    .get(&r.peer_id)
                    .cloned()
                    .unwrap_or_else(|| Person::missing(r.peer_id));
                let deny = standing.decide(&peer, Some(r.id));
                let last_message = match (r.last_message_id, r.last_user_id, r.last_created_at) {
                    (Some(id), Some(user_id), Some(created_at_unix)) => {
                        let deleted = r.last_deleted.unwrap_or(false);
                        Some(LastMessage {
                            id,
                            user_id,
                            excerpt: if deleted {
                                String::new()
                            } else {
                                crate::rich_text::markdown_excerpt(
                                    r.last_body.as_deref().unwrap_or_default(),
                                    EXCERPT_CHARS,
                                )
                            },
                            created_at_unix,
                            deleted,
                            files: r.last_files,
                        })
                    }
                    _ => None,
                };
                Conversation {
                    id: r.id,
                    peer,
                    last_message,
                    unread_count: r.unread_count,
                    allowed_actions: actions(deny),
                    deny_reason: deny,
                }
            })
            .collect();
        Ok(ConversationPage { items, next_cursor })
    }

    /// How many of the caller's conversations hold an unread message.
    pub async fn unread_count(&self, actor: &Actor) -> Result<i64> {
        db::unread_conversations(&self.pool, actor.user_id).await
    }

    /// The caller and `peer`: their conversation (if any) and whether the
    /// caller may write. 404 for an unknown person or oneself.
    pub async fn with_peer(&self, actor: &Actor, peer_id: UserId) -> Result<PeerConversation> {
        if peer_id == actor.user_id {
            return Err(Error::not_found("user"));
        }
        let peer = self
            .people(&[peer_id])
            .await?
            .remove(&peer_id)
            .ok_or_else(|| Error::not_found("user"))?;
        let conversation_id = db::conversation_with(&self.pool, actor.user_id, peer_id).await?;
        let deny = self.decide(actor, &peer, conversation_id).await?;
        Ok(PeerConversation {
            conversation_id,
            peer,
            allowed_actions: actions(deny),
            deny_reason: deny,
        })
    }

    /// People the caller may start a conversation with through a course,
    /// by name (one row per person and course).
    pub async fn recipients(
        &self,
        actor: &Actor,
        q: Option<&str>,
        course_id: Option<CourseId>,
        cursor: Option<&str>,
        limit: i64,
    ) -> Result<RecipientPage> {
        let limit = ab_core::page_limit(limit, MAX_PAGE)?;
        let offset = match cursor {
            None => 0,
            Some(c) => c.parse::<i64>().ok().filter(|n| *n >= 0).ok_or_else(|| {
                Error::validation(vec![FieldError {
                    field: "cursor".into(),
                    code: "invalid".into(),
                    message: "cursor must be a next_cursor from a previous page".into(),
                }])
            })?,
        };
        let q = q.map(ab_core::trim_blank).filter(|q| !q.is_empty());
        let mut rows =
            db::recipients(&self.pool, actor.user_id, q, course_id, offset, limit + 1).await?;
        let more = page(&mut rows, limit);
        let items = rows
            .into_iter()
            .map(|r| Recipient {
                person: Person {
                    id: r.id,
                    username: r.username,
                    display_name: r.display_name,
                    avatar_key: r.avatar_key,
                    available: true,
                },
                course_id: r.course_id,
                course_name: r.course_name,
                role: match r.role.as_str() {
                    "learner" => RecipientRole::Learner,
                    "observer" => RecipientRole::Observer,
                    _ => RecipientRole::Teacher,
                },
            })
            .collect();
        Ok(RecipientPage {
            items,
            next_cursor: more.then(|| (offset + limit).to_string()),
        })
    }

    /// The caller's side of `conversation`, or 404.
    async fn membership(
        &self,
        actor: &Actor,
        conversation: ConversationId,
    ) -> Result<db::MemberRow> {
        db::member(&self.pool, conversation, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("conversation"))
    }

    /// UX-311: the gate of [`Self::mark_read`] on its own, before the body.
    pub async fn require_member(&self, actor: &Actor, conversation: ConversationId) -> Result<()> {
        self.membership(actor, conversation).await.map(|_| ())
    }

    /// UX-311: the gate of [`Self::report`] on its own, before the body.
    pub async fn require_reportable(&self, actor: &Actor, id: MessageId) -> Result<()> {
        let (row, _) = self.visible_message(actor, id).await?;
        if row.user_id == actor.user_id {
            return Err(Error::forbidden("you cannot report your own message"));
        }
        if row.deleted {
            return Err(Error::not_found("message"));
        }
        Ok(())
    }

    /// UX-311: reading and deciding reports needs `admin.users`.
    pub fn require_moderator(actor: &Actor) -> Result<()> {
        RbacAdminService::require_read_users(actor)
    }

    /// Messages of one of the caller's conversations, newest first.
    pub async fn messages(
        &self,
        actor: &Actor,
        conversation: ConversationId,
        cursor: Option<MessageId>,
        limit: i64,
    ) -> Result<MessagePage> {
        let member = self.membership(actor, conversation).await?;
        let limit = ab_core::page_limit(limit, MAX_PAGE)?;
        let mut rows =
            db::list_messages(&self.pool, conversation, actor.user_id, cursor, limit + 1).await?;
        let more = page(&mut rows, limit);
        let next_cursor = if more {
            rows.last().map(|r| r.id)
        } else {
            None
        };
        let peer = self
            .people(&[member.peer_id])
            .await?
            .remove(&member.peer_id)
            .unwrap_or_else(|| Person::missing(member.peer_id));
        let deny = self.decide(actor, &peer, Some(conversation)).await?;
        let shared_courses = db::shared_courses(&self.pool, actor.user_id, member.peer_id)
            .await?
            .into_iter()
            .map(|c| SharedCourse {
                id: c.id,
                name: c.name,
            })
            .collect();
        Ok(MessagePage {
            items: self.with_files(rows, actor.user_id).await?,
            next_cursor,
            peer,
            shared_courses,
            allowed_actions: actions(deny),
            deny_reason: deny,
            last_read_message_id: member.last_read_message_id,
        })
    }

    /// The context a send names: the activity's course when only the
    /// activity is given; both must match and the course must be visible
    /// to the sender (422 otherwise).
    async fn context(
        &self,
        actor: &Actor,
        course_id: Option<CourseId>,
        activity_id: Option<ActivityId>,
    ) -> Result<(Option<CourseId>, Option<ActivityId>)> {
        let invalid = |field: &str| {
            Error::validation(vec![FieldError {
                field: field.into(),
                code: "invalid".into(),
                message: format!("{field} does not name a course you can see"),
            }])
        };
        let course_id = match activity_id {
            Some(activity_id) => {
                let activity = ab_db::catalog::get_activity(&self.pool, activity_id)
                    .await?
                    .ok_or_else(|| invalid("activity_id"))?;
                if course_id.is_some_and(|c| c != activity.course_id) {
                    return Err(invalid("activity_id"));
                }
                Some(activity.course_id)
            }
            None => course_id,
        };
        if let Some(course_id) = course_id {
            self.courses
                .get(actor, course_id)
                .await
                .map_err(|_| invalid("course_id"))?;
        }
        Ok((course_id, activity_id))
    }

    /// Send `input.body` (and files) to `input.to`, creating their
    /// conversation on the first message. A resend with the same
    /// `client_key` returns the stored message and sends nothing.
    pub async fn send(&self, actor: &Actor, input: SendInput<'_>) -> Result<Message> {
        let files = clean_files(&input.attachments)?;
        let body = clean_body(input.body, !files.is_empty())?;
        if input.to == actor.user_id {
            return Err(Error::validation(vec![FieldError {
                field: "to_user_id".into(),
                code: "invalid".into(),
                message: "you cannot write to yourself".into(),
            }]));
        }
        if let Some(id) = {
            let mut conn = self.pool.acquire().await?;
            db::by_client_key(&mut conn, actor.user_id, input.client_key).await?
        } {
            return self.stored(actor, id).await;
        }
        let peer = self
            .people(&[input.to])
            .await?
            .remove(&input.to)
            .ok_or_else(|| Error::not_found("user"))?;
        let existing = db::conversation_with(&self.pool, actor.user_id, input.to).await?;
        if let Some(reason) = self.decide(actor, &peer, existing).await? {
            return Err(reason.error());
        }
        let (course_id, activity_id) = self
            .context(actor, input.course_id, input.activity_id)
            .await?;
        if input.intervention {
            self.require_intervention(actor, course_id, &[input.to])
                .await?;
        }
        let outgoing = delivery::Outgoing {
            to: input.to,
            body: &body,
            client_key: input.client_key,
            course: course_id,
            activity: activity_id,
            files: &files,
            intervention: input.intervention,
        };
        // The pair's conversation may appear between our read and our insert
        // (both sides writing first at once): the loser retries and finds it.
        for _ in 0..2 {
            let mut tx = self.pool.begin().await?;
            // Under the sender's row lock: concurrent sends of one person count each other.
            db::lock_sender(&mut tx, actor.user_id).await?;
            if let Some(id) = db::by_client_key(&mut tx, actor.user_id, input.client_key).await? {
                tx.rollback().await?;
                return self.stored(actor, id).await;
            }
            let mut budget = delivery::Budget::read(&mut tx, actor, 1).await?;
            self.claim_files(&mut tx, actor, &files).await?;
            let Some(delivered) = self.deliver(&mut tx, actor, &outgoing, &mut budget).await?
            else {
                tx.rollback().await?;
                continue;
            };
            tx.commit().await?;
            delivered.announce(actor.user_id, input.to).await;
            return self.stored(actor, delivered.message).await;
        }
        Err(Error::conflict(
            "the conversation changed while sending; try again",
        ))
    }

    async fn stored(&self, actor: &Actor, id: MessageId) -> Result<Message> {
        let row = db::get_message(&self.pool, id, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("message"))?;
        self.with_files(vec![row], actor.user_id)
            .await?
            .pop()
            .ok_or_else(|| Error::not_found("message"))
    }

    /// A signed download of a file of an active message in one of the
    /// caller's conversations (404 otherwise: nobody else learns it exists).
    pub async fn attachment(
        &self,
        actor: &Actor,
        message: MessageId,
        upload: Uuid,
        inline: bool,
    ) -> Result<AttachmentDownload> {
        let file = db::attachment(&self.pool, message, upload)
            .await?
            .ok_or_else(|| Error::not_found("file"))?;
        db::member(&self.pool, file.conversation_id, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("file"))?;
        let bucket = if file.bucket == "public" {
            Bucket::Public
        } else {
            Bucket::Private
        };
        // Inline only for the types a browser may render from our origin;
        // the rest always download (`presign_get` decides).
        let url = self.storage.presign_get(
            bucket,
            &file.key,
            Some(&file.name),
            Some(&file.mime),
            inline,
            DOWNLOAD_TTL,
        )?;
        Ok(AttachmentDownload {
            url,
            expires_at_unix: jiff::Timestamp::now().as_second()
                + i64::try_from(DOWNLOAD_TTL.as_secs()).unwrap_or(900),
            name: file.name,
            mime: file.mime,
        })
    }

    /// Move the caller's read pointer forward to `message` (never back).
    pub async fn mark_read(
        &self,
        actor: &Actor,
        conversation: ConversationId,
        message: MessageId,
    ) -> Result<()> {
        let member = self.membership(actor, conversation).await?;
        if !db::message_in(&self.pool, conversation, message).await? {
            return Err(Error::validation(vec![FieldError {
                field: "last_read_message_id".into(),
                code: "invalid".into(),
                message: "not a message of this conversation".into(),
            }]));
        }
        if db::mark_read(&self.pool, conversation, actor.user_id, message).await? {
            user::conversation_updated([actor.user_id, member.peer_id], conversation).await;
        }
        Ok(())
    }

    /// A message of one of the caller's conversations (404 otherwise), with
    /// the other side.
    async fn visible_message(&self, actor: &Actor, id: MessageId) -> Result<(MessageRow, UserId)> {
        let row = db::get_message(&self.pool, id, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("message"))?;
        let member = db::member(&self.pool, row.conversation_id, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("message"))?;
        Ok((row, member.peer_id))
    }

    /// The author deletes their message: it stays as a tombstone.
    pub async fn delete(&self, actor: &Actor, id: MessageId) -> Result<()> {
        let (row, peer) = self.visible_message(actor, id).await?;
        if row.user_id != actor.user_id {
            return Err(Error::forbidden("only the author deletes a message"));
        }
        if row.deleted {
            return Err(Error::not_found("message"));
        }
        if db::tombstone(&self.pool, id, actor.user_id).await? {
            user::conversation_updated([actor.user_id, peer], row.conversation_id).await;
        }
        Ok(())
    }

    /// A participant reports the other side's message (once; 409 again).
    pub async fn report(&self, actor: &Actor, id: MessageId, reason: &str) -> Result<()> {
        self.require_reportable(actor, id).await?;
        let reason = clean_text("reason", reason, MAX_REASON_CHARS)?;
        db::insert_report(&self.pool, id, actor.user_id, &reason)
            .await?
            .ok_or_else(|| Error::conflict("you already reported this message"))?;
        Ok(())
    }

    async fn report_of(&self, row: ReportRow) -> Result<MessageReport> {
        let mut people = self.people(&[row.reported_by, row.author_id]).await?;
        Ok(MessageReport {
            id: row.id,
            message_id: row.message_id,
            conversation_id: row.conversation_id,
            reporter: people
                .remove(&row.reported_by)
                .unwrap_or_else(|| Person::missing(row.reported_by)),
            author: people
                .remove(&row.author_id)
                .unwrap_or_else(|| Person::missing(row.author_id)),
            reason: row.reason,
            body_snapshot: row.body_snapshot,
            status: if row.status == "resolved" {
                ReportStatus::Resolved
            } else {
                ReportStatus::Open
            },
            resolution: row.resolution,
            resolved_by: row.resolved_by,
            resolved_at_unix: row.resolved_at,
            created_at_unix: row.created_at,
            author_banned: row.author_banned,
        })
    }

    async fn audit(&self, actor: &Actor, event: &str, metadata: serde_json::Value) -> Result<()> {
        ab_db::identity::insert_auth_audit(
            &self.pool,
            Some(actor.user_id),
            event,
            None,
            None,
            metadata,
        )
        .await
    }

    /// Reports, newest first (`admin.users`).
    pub async fn reports(
        &self,
        actor: &Actor,
        status: Option<ReportStatus>,
        cursor: Option<MessageReportId>,
        limit: i64,
    ) -> Result<MessageReportPage> {
        RbacAdminService::require_read_users(actor)?;
        let limit = ab_core::page_limit(limit, MAX_PAGE)?;
        let mut rows = db::list_reports(
            &self.pool,
            status.map(ReportStatus::as_str),
            cursor,
            limit + 1,
        )
        .await?;
        let more = page(&mut rows, limit);
        let next_cursor = if more {
            rows.last().map(|r| r.id)
        } else {
            None
        };
        let mut items = Vec::with_capacity(rows.len());
        for row in rows {
            items.push(self.report_of(row).await?);
        }
        Ok(MessageReportPage { items, next_cursor })
    }

    /// One report with its context (`admin.users`); the read is audited.
    pub async fn report_detail(
        &self,
        actor: &Actor,
        id: MessageReportId,
    ) -> Result<MessageReportDetail> {
        RbacAdminService::require_read_users(actor)?;
        let row = db::get_report(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("report"))?;
        let context = db::context_of(&self.pool, row.message_id, REPORT_CONTEXT)
            .await?
            .into_iter()
            .map(|mut m| {
                m.reported = true;
                m
            })
            .collect();
        let mut context = self.with_files(context, actor.user_id).await?;
        for message in &mut context {
            message.allowed_actions.clear();
        }
        self.audit(
            actor,
            "message_report.read",
            serde_json::json!({ "report_id": id, "conversation_id": row.conversation_id }),
        )
        .await?;
        Ok(MessageReportDetail {
            report: self.report_of(row).await?,
            context,
        })
    }

    /// Decide an open report (`admin.users`): its resolution and, with
    /// `ban`, a send ban for the message's author. The reporter is told.
    pub async fn resolve(
        &self,
        actor: &Actor,
        id: MessageReportId,
        resolution: &str,
        ban: bool,
    ) -> Result<MessageReport> {
        RbacAdminService::require_read_users(actor)?;
        let resolution = clean_text("resolution", resolution, MAX_RESOLUTION_CHARS)?;
        let mut tx = self.pool.begin().await?;
        let row = db::get_report(&mut *tx, id)
            .await?
            .ok_or_else(|| Error::not_found("report"))?;
        if !db::resolve_report(&mut tx, id, actor.user_id, &resolution).await? {
            return Err(Error::conflict("the report is already resolved"));
        }
        if ban {
            db::ban(&mut *tx, row.author_id, actor.user_id, &resolution).await?;
        }
        ab_db::identity::insert_auth_audit(
            &mut *tx,
            Some(actor.user_id),
            "message_report.resolved",
            None,
            None,
            serde_json::json!({ "report_id": id, "author_id": row.author_id, "ban": ban }),
        )
        .await?;
        tx.commit().await?;
        crate::notifications::notify(
            &self.pool,
            &[row.reported_by],
            &crate::notifications::NotificationPayload::MessageReportResolved {
                report_id: id,
                conversation_id: row.conversation_id,
            },
            Some(&format!("message_report:{id}")),
        )
        .await;
        let row = db::get_report(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("report"))?;
        self.report_of(row).await
    }

    /// Lift a send ban (`admin.users`); 404 when there is none.
    pub async fn unban(&self, actor: &Actor, user_id: UserId) -> Result<()> {
        RbacAdminService::require_read_users(actor)?;
        if !db::unban(&self.pool, user_id).await? {
            return Err(Error::not_found("message ban"));
        }
        self.audit(
            actor,
            "message_ban.lifted",
            serde_json::json!({ "user_id": user_id }),
        )
        .await
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    fn person(available: bool) -> Person {
        Person {
            id: UserId::new(),
            username: "p".into(),
            display_name: None,
            avatar_key: None,
            available,
        }
    }

    fn standing() -> Standing {
        Standing {
            banned: false,
            admin: false,
            related: HashSet::new(),
            admins: HashSet::new(),
            answered: HashSet::new(),
        }
    }

    #[test]
    fn no_link_is_no_relation() {
        assert_eq!(
            standing().decide(&person(true), None),
            Some(DenyReason::NoRelation)
        );
    }

    #[test]
    fn a_course_link_lets_one_write() {
        let peer = person(true);
        let mut s = standing();
        s.related.insert(peer.id);
        assert_eq!(s.decide(&peer, None), None);
    }

    #[test]
    fn an_administrator_writes_to_anyone() {
        let mut s = standing();
        s.admin = true;
        assert_eq!(s.decide(&person(true), None), None);
    }

    #[test]
    fn one_answers_an_administrator_who_wrote_first() {
        let peer = person(true);
        let conv = ConversationId::new();
        let mut s = standing();
        s.admins.insert(peer.id);
        // Not before the administrator wrote.
        assert_eq!(s.decide(&peer, None), Some(DenyReason::NoRelation));
        assert_eq!(s.decide(&peer, Some(conv)), Some(DenyReason::NoRelation));
        s.answered.insert(conv);
        assert_eq!(s.decide(&peer, Some(conv)), None);
    }

    #[test]
    fn an_unavailable_peer_comes_first() {
        let peer = person(false);
        let mut s = standing();
        s.banned = true;
        s.admin = true;
        assert_eq!(s.decide(&peer, None), Some(DenyReason::PeerUnavailable));
    }

    #[test]
    fn a_ban_closes_sending_even_with_a_link() {
        let peer = person(true);
        let mut s = standing();
        s.banned = true;
        s.related.insert(peer.id);
        assert_eq!(s.decide(&peer, None), Some(DenyReason::Banned));
    }

    #[test]
    fn the_body_is_trimmed_and_bounded() {
        assert_eq!(
            clean_body("  hi\u{0007}\n there \n", false).unwrap(),
            "hi\n there"
        );
        assert!(clean_body(" \n\t ", false).is_err());
        assert!(clean_body(&"a".repeat(MAX_BODY_CHARS), false).is_ok());
        assert!(clean_body(&"a".repeat(MAX_BODY_CHARS + 1), false).is_err());
    }

    #[test]
    fn files_may_come_without_text() {
        assert_eq!(clean_body(" \n ", true).unwrap(), "");
        assert!(clean_body(&"a".repeat(MAX_BODY_CHARS + 1), true).is_err());
    }

    fn file(name: &str) -> NewAttachment {
        NewAttachment {
            upload_id: Uuid::now_v7(),
            name: name.into(),
        }
    }

    #[test]
    fn file_names_are_cleaned_and_bounded() {
        let files = clean_files(&[file(" ../a\\b.pdf\u{0007} ")]).unwrap();
        assert_eq!(files[0].1, "..ab.pdf");
        assert!(clean_files(&[file(" / ")]).is_err());
        assert!(clean_files(&[file(&"a".repeat(MAX_FILE_NAME_CHARS + 1))]).is_err());
        let six: Vec<_> = (0..=MAX_ATTACHMENTS).map(|_| file("a")).collect();
        assert!(clean_files(&six).is_err());
        let twice = file("a");
        assert!(clean_files(&[twice.clone(), twice]).is_err());
    }
}
