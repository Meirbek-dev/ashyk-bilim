//! Personal messages ("Диалоги", docs/DIALOGS.md 5).
//!
//! The caller's conversations, sending, reading, deleting and reporting;
//! administrators' reports and send bans. Someone else's conversation or
//! message is 404.

use ab_core::id::{ConversationId, MessageId, MessageReportId, UserId};
use ab_domain::community::MessagesService;
use ab_domain::community::messages::{
    DEFAULT_CONVERSATIONS_PAGE, DEFAULT_MESSAGES_PAGE, SendInput,
};
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;

use crate::dto::conversations::{
    ConversationListQuery, ConversationPage, ConversationUnreadCount, MarkReadRequest, Message,
    MessageListQuery, MessagePage, MessageReport, MessageReportDetail, MessageReportPage,
    PeerConversation, RecipientPage, RecipientQuery, ReportListQuery, ReportMessageRequest,
    ResolveReportRequest, SendMessageRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, Path, Query, ValidJson};
use crate::state::AppState;

const DEFAULT_REPORTS_PAGE: i64 = 20;
const DEFAULT_RECIPIENTS_PAGE: i64 = 20;

/// The caller's conversations, the latest message first (keyset).
#[utoipa::path(
    get, path = "/me/conversations", tag = "conversations",
    params(ConversationListQuery),
    responses(
        (status = 200, description = "Page of conversations", body = ConversationPage),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Bad `limit`", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_conversations(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<ConversationListQuery>,
) -> ApiResult<Json<ConversationPage>> {
    let page = state
        .messages
        .conversations(
            &actor,
            query.cursor,
            query.unread_only.unwrap_or(false),
            query.limit.unwrap_or(DEFAULT_CONVERSATIONS_PAGE),
        )
        .await?;
    Ok(Json(page))
}

/// How many of the caller's conversations hold an unread message.
#[utoipa::path(
    get, path = "/me/conversations/unread-count", tag = "conversations",
    responses(
        (status = 200, description = "Conversations with unread messages", body = ConversationUnreadCount),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn conversations_unread_count(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<ConversationUnreadCount>> {
    Ok(Json(ConversationUnreadCount {
        conversations: state.messages.unread_count(&actor).await?,
    }))
}

/// The caller and one person: their conversation (null before the first
/// message) and whether the caller may write.
#[utoipa::path(
    get, path = "/me/conversations/peers/{user_id}", tag = "conversations",
    params(("user_id" = UserId, Path, description = "The other person")),
    responses(
        (status = 200, description = "Conversation state", body = PeerConversation),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown person, or the caller", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn conversation_with_peer(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(user_id): Path<UserId>,
) -> ApiResult<Json<PeerConversation>> {
    Ok(Json(state.messages.with_peer(&actor, user_id).await?))
}

/// People the caller may start a conversation with, through which course,
/// by name.
#[utoipa::path(
    get, path = "/me/message-recipients", tag = "conversations",
    params(RecipientQuery),
    responses(
        (status = 200, description = "One row per person and course", body = RecipientPage),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Bad `cursor` or `limit`", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn message_recipients(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<RecipientQuery>,
) -> ApiResult<Json<RecipientPage>> {
    let page = state
        .messages
        .recipients(
            &actor,
            query.q.as_deref(),
            query.course_id,
            query.cursor.as_deref(),
            query.limit.unwrap_or(DEFAULT_RECIPIENTS_PAGE),
        )
        .await?;
    Ok(Json(page))
}

/// Messages of one of the caller's conversations, newest first, with the
/// conversation's state.
#[utoipa::path(
    get, path = "/conversations/{conversation_id}/messages", tag = "conversations",
    params(("conversation_id" = ConversationId, Path, description = "Conversation id"), MessageListQuery),
    responses(
        (status = 200, description = "Page of messages", body = MessagePage),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown, or not the caller's", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_messages(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ConversationId>,
    Query(query): Query<MessageListQuery>,
) -> ApiResult<Json<MessagePage>> {
    let page = state
        .messages
        .messages(
            &actor,
            id,
            query.cursor,
            query.limit.unwrap_or(DEFAULT_MESSAGES_PAGE),
        )
        .await?;
    Ok(Json(page))
}

/// Send a message; the pair's conversation is created with the first one.
/// A resend with the same `client_key` returns the stored message and
/// sends nothing. Emits `message.created` to both sides.
#[utoipa::path(
    post, path = "/messages", tag = "conversations",
    request_body = SendMessageRequest,
    responses(
        (status = 201, description = "Sent", body = Message),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "`message-recipient-not-allowed` (`details.reason`), or `messages-banned`",
         body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Unknown recipient", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Empty or too long text, the caller as recipient, or a context they cannot see",
         body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "`rate-limited`: `details.limit` (minute, day, conversations) and `retry_after_seconds`",
         body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn send_message(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ValidJson(request): ValidJson<SendMessageRequest>,
) -> ApiResult<(StatusCode, Json<Message>)> {
    let message = state
        .messages
        .send(
            &actor,
            SendInput {
                to: request.to_user_id,
                body: &request.body,
                client_key: request.client_key,
                course_id: request.course_id,
                activity_id: request.activity_id,
            },
        )
        .await?;
    Ok((StatusCode::CREATED, Json(message)))
}

/// Move the caller's read pointer forward (never back). Emits
/// `conversation.updated` when it moved.
#[utoipa::path(
    put, path = "/conversations/{conversation_id}/read", tag = "conversations",
    params(("conversation_id" = ConversationId, Path, description = "Conversation id")),
    request_body = MarkReadRequest,
    responses(
        (status = 204, description = "Saved"),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown, or not the caller's", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Not a message of this conversation", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn mark_conversation_read(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ConversationId>,
    body: axum::body::Bytes,
) -> ApiResult<StatusCode> {
    // UX-311: the conversation before the body.
    state.messages.require_member(&actor, id).await?;
    let request = ValidJson::<MarkReadRequest>::parse(&body)?;
    state
        .messages
        .mark_read(&actor, id, request.last_read_message_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// The author deletes their message: it stays as a tombstone.
#[utoipa::path(
    delete, path = "/messages/{message_id}", tag = "conversations",
    params(("message_id" = MessageId, Path, description = "Message id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "Not the author", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown, already deleted, or not in the caller's conversations",
         body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn delete_message(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<MessageId>,
) -> ApiResult<StatusCode> {
    state.messages.delete(&actor, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Report the other side's message to the administrators (once).
#[utoipa::path(
    post, path = "/messages/{message_id}/report", tag = "conversations",
    params(("message_id" = MessageId, Path, description = "Message id")),
    request_body = ReportMessageRequest,
    responses(
        (status = 204, description = "Reported"),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "The caller's own message", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown, deleted, or not in the caller's conversations", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Already reported by the caller", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn report_message(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<MessageId>,
    body: axum::body::Bytes,
) -> ApiResult<StatusCode> {
    // UX-311: the message before the body.
    state.messages.require_reportable(&actor, id).await?;
    let request = ValidJson::<ReportMessageRequest>::parse(&body)?;
    state.messages.report(&actor, id, &request.reason).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Reports on personal messages, newest first (`admin.users`).
#[utoipa::path(
    get, path = "/admin/message-reports", tag = "conversations",
    params(ReportListQuery),
    responses(
        (status = 200, description = "Page of reports", body = MessageReportPage),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "No `admin.users`", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_message_reports(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<ReportListQuery>,
) -> ApiResult<Json<MessageReportPage>> {
    let page = state
        .messages
        .reports(
            &actor,
            query.status,
            query.cursor,
            query.limit.unwrap_or(DEFAULT_REPORTS_PAGE),
        )
        .await?;
    Ok(Json(page))
}

/// One report with the text as reported and up to five messages on each
/// side (`admin.users`; the read is audited).
#[utoipa::path(
    get, path = "/admin/message-reports/{report_id}", tag = "conversations",
    params(("report_id" = MessageReportId, Path, description = "Report id")),
    responses(
        (status = 200, description = "The report and its context", body = MessageReportDetail),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "No `admin.users`", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown report", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_message_report(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<MessageReportId>,
) -> ApiResult<Json<MessageReportDetail>> {
    Ok(Json(state.messages.report_detail(&actor, id).await?))
}

/// Decide an open report; `ban` also bans the author from sending. The
/// reporter gets a notification.
#[utoipa::path(
    post, path = "/admin/message-reports/{report_id}/resolve", tag = "conversations",
    params(("report_id" = MessageReportId, Path, description = "Report id")),
    request_body = ResolveReportRequest,
    responses(
        (status = 200, description = "Resolved", body = MessageReport),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "No `admin.users`", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown report", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Already resolved", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn resolve_message_report(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<MessageReportId>,
    body: axum::body::Bytes,
) -> ApiResult<Json<MessageReport>> {
    // UX-311: the grant before the body.
    MessagesService::require_moderator(&actor)?;
    let request = ValidJson::<ResolveReportRequest>::parse(&body)?;
    Ok(Json(
        state
            .messages
            .resolve(&actor, id, &request.resolution, request.ban)
            .await?,
    ))
}

/// Lift a person's send ban (`admin.users`).
#[utoipa::path(
    delete, path = "/admin/message-bans/{user_id}", tag = "conversations",
    params(("user_id" = UserId, Path, description = "The banned person")),
    responses(
        (status = 204, description = "Lifted"),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "No `admin.users`", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "No ban", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_message_ban(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(user_id): Path<UserId>,
) -> ApiResult<StatusCode> {
    state.messages.unban(&actor, user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
