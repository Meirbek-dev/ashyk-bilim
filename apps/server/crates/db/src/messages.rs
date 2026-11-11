//! Personal messages (docs/DIALOGS.md): conversations of two people, their
//! messages, reports and send bans.
//!
//! Nothing is counted in a column: unread counts are read with
//! `id > last_read_message_id` over `messages (conversation_id, id DESC)`.
//! Timestamps are epoch seconds. The message text never leaves these rows
//! for logs: errors carry ids only.

use ab_core::Result;
use ab_core::id::{ActivityId, ConversationId, CourseId, MessageId, MessageReportId, UserId};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

/// How long a file a message no longer shows waits for the reaper: the
/// domain's `UNREFERENCED_GRACE` (24 h), which this crate cannot name.
pub const ATTACHMENT_GRACE_SECS: f64 = 86_400.0;

/// A person as a conversation shows them.
#[derive(Debug, Clone)]
pub struct PersonRow {
    pub id: UserId,
    pub username: String,
    pub display_name: Option<String>,
    pub avatar_key: Option<String>,
    /// Not disabled and not erased: may be written to.
    pub available: bool,
}

pub async fn people(pool: &PgPool, ids: &[UserId]) -> Result<Vec<PersonRow>> {
    let ids: Vec<Uuid> = ids.iter().map(|u| u.0).collect();
    let rows = sqlx::query_as!(
        PersonRow,
        r#"SELECT u.id AS "id!: UserId", u.username AS "username!",
                  NULLIF(u.display_name, '') AS "display_name?", u.avatar_key AS "avatar_key?",
                  (u.disabled_at IS NULL AND u.deleted_at IS NULL) AS "available!"
           FROM users u WHERE u.id = ANY($1)"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Of `peers`, those `me` shares a live course with as writers.
///
/// A link lets one write to the other (docs/DIALOGS.md 3): a teacher of it and a learner
/// (enrolled, not staff), or two members of its team (observers included).
/// A live course is neither deleted nor archived.
pub async fn related_peers(pool: &PgPool, me: UserId, peers: &[UserId]) -> Result<Vec<UserId>> {
    let peers: Vec<Uuid> = peers.iter().map(|u| u.0).collect();
    let rows = sqlx::query_scalar!(
        r#"WITH live AS (SELECT id FROM courses WHERE deleted_at IS NULL AND archived_at IS NULL),
           team AS (
               SELECT cs.course_id, cs.user_id, cs.authorship <> 'reporter' AS teaches
               FROM course_staff cs JOIN live ON live.id = cs.course_id
               WHERE cs.status = 'active'
               UNION ALL
               SELECT c.id, c.creator_id, true FROM courses c JOIN live ON live.id = c.id
               WHERE c.creator_id IS NOT NULL
           ),
           mine AS (SELECT course_id, bool_or(teaches) AS teaches FROM team WHERE user_id = $1 GROUP BY course_id),
           learning AS (
               SELECT m.course_id FROM learning.course_members m JOIN live ON live.id = m.course_id
               WHERE m.user_id = $1
           )
           SELECT p AS "peer!" FROM unnest($2::uuid[]) AS p
           WHERE p <> $1 AND (
               EXISTS (SELECT 1 FROM mine JOIN team t ON t.course_id = mine.course_id WHERE t.user_id = p)
               OR EXISTS (SELECT 1 FROM mine JOIN learning.course_members m ON m.course_id = mine.course_id
                          WHERE mine.teaches AND m.user_id = p)
               OR EXISTS (SELECT 1 FROM learning l JOIN team t ON t.course_id = l.course_id
                          WHERE t.teaches AND t.user_id = p)
           )"#,
        me.0,
        &peers
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(UserId).collect())
}

/// A course two people share, for the conversation header.
#[derive(Debug, Clone)]
pub struct SharedCourseRow {
    pub id: CourseId,
    pub name: String,
}

/// Live courses both `a` and `b` belong to (team or learner), newest first.
pub async fn shared_courses(pool: &PgPool, a: UserId, b: UserId) -> Result<Vec<SharedCourseRow>> {
    let rows = sqlx::query_as!(
        SharedCourseRow,
        r#"WITH people AS (
               SELECT cs.course_id, cs.user_id FROM course_staff cs WHERE cs.status = 'active'
               UNION SELECT c.id, c.creator_id FROM courses c WHERE c.creator_id IS NOT NULL
               UNION SELECT m.course_id, m.user_id FROM learning.course_members m
           )
           SELECT c.id AS "id!: CourseId", c.name AS "name!"
           FROM courses c
           WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
             AND EXISTS (SELECT 1 FROM people p WHERE p.course_id = c.id AND p.user_id = $1)
             AND EXISTS (SELECT 1 FROM people p WHERE p.course_id = c.id AND p.user_id = $2)
           ORDER BY c.id DESC
           LIMIT 3"#,
        a.0,
        b.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Of `users`, those who hold `platform:read:platform` (the `admin.users`
/// capability) through an active account.
pub async fn platform_admins(pool: &PgPool, users: &[UserId]) -> Result<Vec<UserId>> {
    let users: Vec<Uuid> = users.iter().map(|u| u.0).collect();
    let rows = sqlx::query_scalar!(
        r#"SELECT DISTINCT ur.user_id AS "id!" FROM user_roles ur
           JOIN role_permissions rp ON rp.role_id = ur.role_id
           JOIN users u ON u.id = ur.user_id
           WHERE ur.user_id = ANY($1) AND u.disabled_at IS NULL AND u.deleted_at IS NULL
             AND rp.resource IN ('*', 'platform')
             AND rp.action IN ('*', 'read')
             AND rp.scope IN ('', '*', 'platform', 'all')"#,
        &users
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(UserId).collect())
}

/// Of `conversations`, those where someone other than `me` has written.
pub async fn peer_wrote_in(
    pool: &PgPool,
    me: UserId,
    conversations: &[ConversationId],
) -> Result<Vec<ConversationId>> {
    let ids: Vec<Uuid> = conversations.iter().map(|c| c.0).collect();
    let rows = sqlx::query_scalar!(
        r#"SELECT DISTINCT m.conversation_id AS "id!" FROM messages m
           WHERE m.conversation_id = ANY($1) AND m.user_id <> $2"#,
        &ids,
        me.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(ConversationId).collect())
}

pub async fn is_banned<'e>(db: impl sqlx::PgExecutor<'e>, user: UserId) -> Result<bool> {
    let banned = sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM message_bans WHERE user_id = $1) AS "b!""#,
        user.0
    )
    .fetch_one(db)
    .await?;
    Ok(banned)
}

/// `me`'s side of a conversation.
#[derive(Debug, Clone)]
pub struct MemberRow {
    pub conversation_id: ConversationId,
    pub peer_id: UserId,
    pub last_read_message_id: Option<MessageId>,
}

pub async fn member(
    pool: &PgPool,
    conversation: ConversationId,
    me: UserId,
) -> Result<Option<MemberRow>> {
    let row = sqlx::query_as!(
        MemberRow,
        r#"SELECT conversation_id AS "conversation_id!: ConversationId", peer_id AS "peer_id!: UserId",
                  last_read_message_id AS "last_read_message_id?: MessageId"
           FROM conversation_members WHERE conversation_id = $1 AND user_id = $2"#,
        conversation.0,
        me.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// `me`'s conversation with `peer`, if there is one.
pub async fn conversation_with<'e>(
    db: impl sqlx::PgExecutor<'e>,
    me: UserId,
    peer: UserId,
) -> Result<Option<ConversationId>> {
    let id = sqlx::query_scalar!(
        r#"SELECT conversation_id AS "id!: ConversationId" FROM conversation_members
           WHERE user_id = $1 AND peer_id = $2"#,
        me.0,
        peer.0
    )
    .fetch_optional(db)
    .await?;
    Ok(id)
}

/// One row of `me`'s conversation list.
#[derive(Debug, Clone)]
pub struct ConversationRow {
    pub id: ConversationId,
    pub peer_id: UserId,
    pub last_message_id: Option<MessageId>,
    pub last_user_id: Option<UserId>,
    pub last_body: Option<String>,
    pub last_deleted: Option<bool>,
    pub last_created_at: Option<i64>,
    /// How many files the last message carries.
    pub last_files: i64,
    pub unread_count: i64,
}

/// `me`'s conversations, the latest message first (keyset on
/// `last_message_id`); `unread_only` keeps those with unread messages.
pub async fn list_conversations(
    pool: &PgPool,
    me: UserId,
    cursor: Option<MessageId>,
    unread_only: bool,
    limit: i64,
) -> Result<Vec<ConversationRow>> {
    let rows = sqlx::query_as!(
        ConversationRow,
        r#"SELECT c.id AS "id!: ConversationId", cm.peer_id AS "peer_id!: UserId",
                  c.last_message_id AS "last_message_id?: MessageId",
                  lm.user_id AS "last_user_id?: UserId", lm.body AS "last_body?",
                  (lm.status = 'deleted') AS "last_deleted?",
                  (extract(epoch FROM lm.created_at))::bigint AS "last_created_at?",
                  (SELECT count(*) FROM message_uploads mu WHERE mu.message_id = lm.id) AS "last_files!",
                  unread.n AS "unread_count!"
           FROM conversation_members cm
           JOIN conversations c ON c.id = cm.conversation_id
           LEFT JOIN messages lm ON lm.id = c.last_message_id
           CROSS JOIN LATERAL (
               SELECT count(*) AS n FROM messages m
               WHERE m.conversation_id = c.id AND m.user_id <> $1 AND m.status = 'active'
                 AND (cm.last_read_message_id IS NULL OR m.id > cm.last_read_message_id)
           ) AS unread
           WHERE cm.user_id = $1 AND c.last_message_id IS NOT NULL
             AND ($2::uuid IS NULL OR c.last_message_id < $2)
             AND (NOT $3 OR unread.n > 0)
           ORDER BY c.last_message_id DESC
           LIMIT $4"#,
        me.0,
        cursor.map(|c| c.0),
        unread_only,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// How many of `me`'s conversations hold an unread message.
pub async fn unread_conversations(pool: &PgPool, me: UserId) -> Result<i64> {
    let n = sqlx::query_scalar!(
        r#"SELECT count(*) AS "n!" FROM conversation_members cm
           WHERE cm.user_id = $1
             AND EXISTS (SELECT 1 FROM messages m
                         WHERE m.conversation_id = cm.conversation_id AND m.user_id <> $1
                           AND m.status = 'active'
                           AND (cm.last_read_message_id IS NULL OR m.id > cm.last_read_message_id))"#,
        me.0
    )
    .fetch_one(pool)
    .await?;
    Ok(n)
}

/// One message as a conversation shows it (`viewer` decides `reported`).
#[derive(Debug, Clone)]
pub struct MessageRow {
    pub id: MessageId,
    pub conversation_id: ConversationId,
    pub user_id: UserId,
    pub body: String,
    pub deleted: bool,
    pub course_id: Option<CourseId>,
    pub course_name: Option<String>,
    pub activity_id: Option<ActivityId>,
    pub activity_name: Option<String>,
    pub activity_type: Option<String>,
    /// The viewer reported it already.
    pub reported: bool,
    pub created_at: i64,
}

/// Messages of a conversation, newest first (keyset on id).
pub async fn list_messages(
    pool: &PgPool,
    conversation: ConversationId,
    viewer: UserId,
    cursor: Option<MessageId>,
    limit: i64,
) -> Result<Vec<MessageRow>> {
    let rows = sqlx::query_as!(
        MessageRow,
        r#"SELECT m.id AS "id!: MessageId", m.conversation_id AS "conversation_id!: ConversationId",
                  m.user_id AS "user_id!: UserId", m.body AS "body!", (m.status = 'deleted') AS "deleted!",
                  m.course_id AS "course_id?: CourseId",
                  (SELECT c.name FROM courses c WHERE c.id = m.course_id) AS "course_name?",
                  m.activity_id AS "activity_id?: ActivityId",
                  (SELECT a.name FROM activities a WHERE a.id = m.activity_id) AS "activity_name?",
                  (SELECT a.activity_type FROM activities a WHERE a.id = m.activity_id) AS "activity_type?",
                  EXISTS (SELECT 1 FROM message_reports r WHERE r.message_id = m.id AND r.reported_by = $2)
                    AS "reported!",
                  (extract(epoch FROM m.created_at))::bigint AS "created_at!"
           FROM messages m
           WHERE m.conversation_id = $1 AND ($3::uuid IS NULL OR m.id < $3)
           ORDER BY m.id DESC
           LIMIT $4"#,
        conversation.0,
        viewer.0,
        cursor.map(|c| c.0),
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_message<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: MessageId,
    viewer: UserId,
) -> Result<Option<MessageRow>> {
    let row = sqlx::query_as!(
        MessageRow,
        r#"SELECT m.id AS "id!: MessageId", m.conversation_id AS "conversation_id!: ConversationId",
                  m.user_id AS "user_id!: UserId", m.body AS "body!", (m.status = 'deleted') AS "deleted!",
                  m.course_id AS "course_id?: CourseId",
                  (SELECT c.name FROM courses c WHERE c.id = m.course_id) AS "course_name?",
                  m.activity_id AS "activity_id?: ActivityId",
                  (SELECT a.name FROM activities a WHERE a.id = m.activity_id) AS "activity_name?",
                  (SELECT a.activity_type FROM activities a WHERE a.id = m.activity_id) AS "activity_type?",
                  EXISTS (SELECT 1 FROM message_reports r WHERE r.message_id = m.id AND r.reported_by = $2)
                    AS "reported!",
                  (extract(epoch FROM m.created_at))::bigint AS "created_at!"
           FROM messages m WHERE m.id = $1"#,
        id.0,
        viewer.0
    )
    .fetch_optional(db)
    .await?;
    Ok(row)
}

/// The message `user` already sent with `client_key` (a retried send).
pub async fn by_client_key(
    db: &mut PgConnection,
    user: UserId,
    client_key: Uuid,
) -> Result<Option<MessageId>> {
    let id = sqlx::query_scalar!(
        r#"SELECT id AS "id!: MessageId" FROM messages WHERE user_id = $1 AND client_key = $2"#,
        user.0,
        client_key
    )
    .fetch_optional(db)
    .await?;
    Ok(id)
}

/// What the sender's limits count (docs/DIALOGS.md 5).
#[derive(Debug, Clone, Copy)]
pub struct SendCounts {
    pub last_minute: i64,
    pub last_day: i64,
    /// Conversations the sender started in the last day.
    pub started_today: i64,
    /// Seconds until the oldest message of the minute / day window leaves it.
    pub minute_frees_in: i64,
    pub day_frees_in: i64,
    pub start_frees_in: i64,
}

pub async fn send_counts(db: &mut PgConnection, user: UserId) -> Result<SendCounts> {
    let row = sqlx::query!(
        r#"SELECT
             (SELECT count(*) FROM messages WHERE user_id = $1 AND created_at > now() - interval '1 minute') AS "minute!",
             (SELECT count(*) FROM messages WHERE user_id = $1 AND created_at > now() - interval '1 day') AS "day!",
             (SELECT count(*) FROM conversation_members cm
               WHERE cm.user_id = $1 AND cm.created_at > now() - interval '1 day'
                 AND (SELECT m.user_id FROM messages m WHERE m.conversation_id = cm.conversation_id
                      ORDER BY m.id LIMIT 1) = $1) AS "started!",
             (SELECT ceil(extract(epoch FROM min(created_at) + interval '1 minute' - now()))::bigint
                FROM messages WHERE user_id = $1 AND created_at > now() - interval '1 minute') AS "minute_frees?",
             (SELECT ceil(extract(epoch FROM min(created_at) + interval '1 day' - now()))::bigint
                FROM messages WHERE user_id = $1 AND created_at > now() - interval '1 day') AS "day_frees?",
             (SELECT ceil(extract(epoch FROM min(cm.created_at) + interval '1 day' - now()))::bigint
                FROM conversation_members cm
               WHERE cm.user_id = $1 AND cm.created_at > now() - interval '1 day') AS "start_frees?""#,
        user.0
    )
    .fetch_one(db)
    .await?;
    Ok(SendCounts {
        last_minute: row.minute,
        last_day: row.day,
        started_today: row.started,
        minute_frees_in: row.minute_frees.unwrap_or(60).max(1),
        day_frees_in: row.day_frees.unwrap_or(86_400).max(1),
        start_frees_in: row.start_frees.unwrap_or(86_400).max(1),
    })
}

/// A new conversation of `a` and `b` with both member rows, or `None` when
/// the pair got one concurrently (the caller retries and finds it).
pub async fn create_conversation(
    db: &mut PgConnection,
    a: UserId,
    b: UserId,
) -> Result<Option<ConversationId>> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO conversations DEFAULT VALUES RETURNING id AS "id!: ConversationId""#
    )
    .fetch_one(&mut *db)
    .await?;
    let inserted = sqlx::query!(
        "INSERT INTO conversation_members (conversation_id, user_id, peer_id)
         VALUES ($1, $2, $3), ($1, $3, $2)
         ON CONFLICT (user_id, peer_id) DO NOTHING",
        id.0,
        a.0,
        b.0
    )
    .execute(&mut *db)
    .await?
    .rows_affected();
    Ok((inserted == 2).then_some(id))
}

pub struct NewMessage<'a> {
    pub conversation: ConversationId,
    pub user: UserId,
    pub body: &'a str,
    pub client_key: Uuid,
    pub course: Option<CourseId>,
    pub activity: Option<ActivityId>,
}

/// Append a message, point the conversation at it and mark it read for its
/// author.
pub async fn insert_message(db: &mut PgConnection, new: NewMessage<'_>) -> Result<MessageId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO messages (conversation_id, user_id, body, client_key, course_id, activity_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id AS "id!: MessageId""#,
        new.conversation.0,
        new.user.0,
        new.body,
        new.client_key,
        new.course.map(|c| c.0),
        new.activity.map(|a| a.0)
    )
    .fetch_one(&mut *db)
    .await?;
    sqlx::query!(
        "UPDATE conversations SET last_message_id = $2
         WHERE id = $1 AND (last_message_id IS NULL OR last_message_id < $2)",
        new.conversation.0,
        id.0
    )
    .execute(&mut *db)
    .await?;
    mark_read(&mut *db, new.conversation, new.user, id).await?;
    Ok(id)
}

/// Move `user`'s read pointer forward to `message` (never back); `false`
/// when it already was there or past it.
pub async fn mark_read<'e>(
    db: impl sqlx::PgExecutor<'e>,
    conversation: ConversationId,
    user: UserId,
    message: MessageId,
) -> Result<bool> {
    let moved = sqlx::query!(
        "UPDATE conversation_members SET last_read_message_id = $3
         WHERE conversation_id = $1 AND user_id = $2
           AND (last_read_message_id IS NULL OR last_read_message_id < $3)",
        conversation.0,
        user.0,
        message.0
    )
    .execute(db)
    .await?
    .rows_affected();
    Ok(moved > 0)
}

/// Is `message` one of `conversation`'s?
pub async fn message_in(
    pool: &PgPool,
    conversation: ConversationId,
    message: MessageId,
) -> Result<bool> {
    let found = sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2) AS "f!""#,
        message.0,
        conversation.0
    )
    .fetch_one(pool)
    .await?;
    Ok(found)
}

/// Make `user`'s active message a tombstone; `false` when it was not one.
/// Its files go with the text: their uploads start the reaper's clock unless
/// another message (of the same bulk send) still shows them.
pub async fn tombstone(pool: &PgPool, message: MessageId, user: UserId) -> Result<bool> {
    let mut tx = pool.begin().await?;
    let n = sqlx::query!(
        "UPDATE messages SET status = 'deleted', body = '', deleted_at = now()
         WHERE id = $1 AND user_id = $2 AND status = 'active'",
        message.0,
        user.0
    )
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if n > 0 {
        let uploads = sqlx::query_scalar!(
            "DELETE FROM message_uploads WHERE message_id = $1 RETURNING upload_id",
            message.0
        )
        .fetch_all(&mut *tx)
        .await?;
        crate::uploads::release_references(&mut tx, &uploads, ATTACHMENT_GRACE_SECS).await?;
    }
    tx.commit().await?;
    Ok(n > 0)
}

/// File a report with a copy of the text; `None` when `reporter` already
/// reported it.
pub async fn insert_report(
    pool: &PgPool,
    message: MessageId,
    reporter: UserId,
    reason: &str,
) -> Result<Option<MessageReportId>> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO message_reports (message_id, reported_by, reason, body_snapshot)
           SELECT m.id, $2, $3, m.body FROM messages m WHERE m.id = $1
           ON CONFLICT (message_id, reported_by) DO NOTHING
           RETURNING id AS "id!: MessageReportId""#,
        message.0,
        reporter.0,
        reason
    )
    .fetch_optional(pool)
    .await?;
    Ok(id)
}

/// One report as the administrators read it.
#[derive(Debug, Clone)]
pub struct ReportRow {
    pub id: MessageReportId,
    pub message_id: MessageId,
    pub conversation_id: ConversationId,
    pub reported_by: UserId,
    pub author_id: UserId,
    pub reason: String,
    pub body_snapshot: String,
    pub status: String,
    pub resolved_by: Option<UserId>,
    pub resolution: Option<String>,
    pub resolved_at: Option<i64>,
    pub created_at: i64,
    /// The message's author may not send now.
    pub author_banned: bool,
}

/// Reports, newest first (keyset on id), optionally of one status.
pub async fn list_reports(
    pool: &PgPool,
    status: Option<&str>,
    cursor: Option<MessageReportId>,
    limit: i64,
) -> Result<Vec<ReportRow>> {
    let rows = sqlx::query_as!(
        ReportRow,
        r#"SELECT r.id AS "id!: MessageReportId", r.message_id AS "message_id!: MessageId",
                  m.conversation_id AS "conversation_id!: ConversationId",
                  r.reported_by AS "reported_by!: UserId", m.user_id AS "author_id!: UserId",
                  r.reason AS "reason!", r.body_snapshot AS "body_snapshot!", r.status AS "status!",
                  r.resolved_by AS "resolved_by?: UserId", r.resolution AS "resolution?",
                  (extract(epoch FROM r.resolved_at))::bigint AS "resolved_at?",
                  (extract(epoch FROM r.created_at))::bigint AS "created_at!",
                  EXISTS (SELECT 1 FROM message_bans b WHERE b.user_id = m.user_id) AS "author_banned!"
           FROM message_reports r JOIN messages m ON m.id = r.message_id
           WHERE ($1::text IS NULL OR r.status = $1) AND ($2::uuid IS NULL OR r.id < $2)
           ORDER BY r.id DESC
           LIMIT $3"#,
        status,
        cursor.map(|c| c.0),
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_report<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: MessageReportId,
) -> Result<Option<ReportRow>> {
    let row = sqlx::query_as!(
        ReportRow,
        r#"SELECT r.id AS "id!: MessageReportId", r.message_id AS "message_id!: MessageId",
                  m.conversation_id AS "conversation_id!: ConversationId",
                  r.reported_by AS "reported_by!: UserId", m.user_id AS "author_id!: UserId",
                  r.reason AS "reason!", r.body_snapshot AS "body_snapshot!", r.status AS "status!",
                  r.resolved_by AS "resolved_by?: UserId", r.resolution AS "resolution?",
                  (extract(epoch FROM r.resolved_at))::bigint AS "resolved_at?",
                  (extract(epoch FROM r.created_at))::bigint AS "created_at!",
                  EXISTS (SELECT 1 FROM message_bans b WHERE b.user_id = m.user_id) AS "author_banned!"
           FROM message_reports r JOIN messages m ON m.id = r.message_id
           WHERE r.id = $1"#,
        id.0
    )
    .fetch_optional(db)
    .await?;
    Ok(row)
}

/// Up to `around` messages before and after `message` in its conversation,
/// in their current state, oldest first (the reported one included).
pub async fn context_of(pool: &PgPool, message: MessageId, around: i64) -> Result<Vec<MessageRow>> {
    let rows = sqlx::query_as!(
        MessageRow,
        r#"WITH target AS (SELECT conversation_id, id FROM messages WHERE id = $1),
           near AS (
               (SELECT m.* FROM messages m, target t
                 WHERE m.conversation_id = t.conversation_id AND m.id <= t.id
                 ORDER BY m.id DESC LIMIT $2::bigint + 1)
               UNION ALL
               (SELECT m.* FROM messages m, target t
                 WHERE m.conversation_id = t.conversation_id AND m.id > t.id
                 ORDER BY m.id LIMIT $2)
           )
           SELECT m.id AS "id!: MessageId", m.conversation_id AS "conversation_id!: ConversationId",
                  m.user_id AS "user_id!: UserId", m.body AS "body!", (m.status = 'deleted') AS "deleted!",
                  m.course_id AS "course_id?: CourseId",
                  (SELECT c.name FROM courses c WHERE c.id = m.course_id) AS "course_name?",
                  m.activity_id AS "activity_id?: ActivityId",
                  (SELECT a.name FROM activities a WHERE a.id = m.activity_id) AS "activity_name?",
                  (SELECT a.activity_type FROM activities a WHERE a.id = m.activity_id) AS "activity_type?",
                  false AS "reported!",
                  (extract(epoch FROM m.created_at))::bigint AS "created_at!"
           FROM near m
           ORDER BY m.id"#,
        message.0,
        around
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Close an open report; `false` when it was not open.
pub async fn resolve_report(
    db: &mut PgConnection,
    id: MessageReportId,
    by: UserId,
    resolution: &str,
) -> Result<bool> {
    let n = sqlx::query!(
        "UPDATE message_reports SET status = 'resolved', resolved_by = $2, resolved_at = now(),
                resolution = $3
         WHERE id = $1 AND status = 'open'",
        id.0,
        by.0,
        resolution
    )
    .execute(db)
    .await?
    .rows_affected();
    Ok(n > 0)
}

/// Ban `user` from sending (kept as it is when already banned).
pub async fn ban<'e>(
    db: impl sqlx::PgExecutor<'e>,
    user: UserId,
    by: UserId,
    reason: &str,
) -> Result<()> {
    sqlx::query!(
        "INSERT INTO message_bans (user_id, banned_by, reason) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO NOTHING",
        user.0,
        by.0,
        reason
    )
    .execute(db)
    .await?;
    Ok(())
}

/// Lift `user`'s ban; `false` when there was none.
pub async fn unban<'e>(db: impl sqlx::PgExecutor<'e>, user: UserId) -> Result<bool> {
    let n = sqlx::query!("DELETE FROM message_bans WHERE user_id = $1", user.0)
        .execute(db)
        .await?
        .rows_affected();
    Ok(n > 0)
}

/// Retention: delete conversations whose latest message is older than
/// `days` (members, messages and reports cascade), 5 000 at a time.
pub async fn prune_quiet(pool: &PgPool, days: i32) -> Result<u64> {
    let mut tx = pool.begin().await?;
    let doomed = sqlx::query_scalar!(
        "SELECT c.id FROM conversations c
         WHERE c.created_at < now() - make_interval(days => $1)
           AND NOT EXISTS (SELECT 1 FROM messages m
                           WHERE m.conversation_id = c.id
                             AND m.created_at >= now() - make_interval(days => $1))
         LIMIT 5000
         FOR UPDATE",
        days
    )
    .fetch_all(&mut *tx)
    .await?;
    if doomed.is_empty() {
        return Ok(0);
    }
    let uploads = sqlx::query_scalar!(
        "SELECT DISTINCT mu.upload_id FROM message_uploads mu
         JOIN messages m ON m.id = mu.message_id
         WHERE m.conversation_id = ANY($1)",
        &doomed
    )
    .fetch_all(&mut *tx)
    .await?;
    let n = sqlx::query!("DELETE FROM conversations WHERE id = ANY($1)", &doomed)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    crate::uploads::release_references(&mut tx, &uploads, ATTACHMENT_GRACE_SECS).await?;
    tx.commit().await?;
    Ok(n)
}

/// One person `me` may write to, with the course that links them.
#[derive(Debug, Clone)]
pub struct RecipientRow {
    pub id: UserId,
    pub username: String,
    pub display_name: Option<String>,
    pub avatar_key: Option<String>,
    pub course_id: CourseId,
    pub course_name: String,
    /// `teacher`, `observer` or `learner`: the person's place in that course.
    pub role: String,
}

/// People `me` shares a live course with in a writable way (see
/// [`related_peers`]), one row per (person, course), by name; `q` filters
/// on name and username (`search_fold`), `course` on one course.
pub async fn recipients(
    pool: &PgPool,
    me: UserId,
    q: Option<&str>,
    course: Option<CourseId>,
    offset: i64,
    limit: i64,
) -> Result<Vec<RecipientRow>> {
    let pattern = q.map(|q| format!("%{}%", crate::like_escape(q)));
    let rows = sqlx::query_as!(
        RecipientRow,
        r#"WITH live AS (SELECT id, name FROM courses
                         WHERE deleted_at IS NULL AND archived_at IS NULL AND ($5::uuid IS NULL OR id = $5)),
           team AS (
               SELECT cs.course_id, cs.user_id, cs.authorship <> 'reporter' AS teaches
               FROM course_staff cs JOIN live ON live.id = cs.course_id
               WHERE cs.status = 'active'
               UNION ALL
               SELECT c.id, c.creator_id, true FROM courses c JOIN live ON live.id = c.id
               WHERE c.creator_id IS NOT NULL
           ),
           mine AS (SELECT course_id, bool_or(teaches) AS teaches FROM team WHERE user_id = $1 GROUP BY course_id),
           links AS (
               SELECT t.user_id, t.course_id, bool_or(t.teaches) AS teaches, 'team' AS via
               FROM mine JOIN team t ON t.course_id = mine.course_id GROUP BY t.user_id, t.course_id
               UNION ALL
               SELECT m.user_id, m.course_id, false, 'learner'
               FROM mine JOIN learning.course_members m ON m.course_id = mine.course_id WHERE mine.teaches
               UNION ALL
               SELECT t.user_id, t.course_id, true, 'team'
               FROM learning.course_members l JOIN team t ON t.course_id = l.course_id
               WHERE l.user_id = $1 AND t.teaches
           )
           SELECT DISTINCT ON (lower(coalesce(NULLIF(u.display_name, ''), u.username)), u.id, live.id)
                  u.id AS "id!: UserId", u.username AS "username!",
                  NULLIF(u.display_name, '') AS "display_name?", u.avatar_key AS "avatar_key?",
                  live.id AS "course_id!: CourseId", live.name AS "course_name!",
                  (CASE WHEN l.via = 'learner' THEN 'learner'
                        WHEN l.teaches THEN 'teacher' ELSE 'observer' END) AS "role!"
           FROM links l
           JOIN users u ON u.id = l.user_id
           JOIN live ON live.id = l.course_id
           WHERE u.id <> $1 AND u.disabled_at IS NULL AND u.deleted_at IS NULL
             AND ($2::text IS NULL OR search_fold(coalesce(u.display_name, '') || ' ' || u.username)
                                      LIKE search_fold($2) ESCAPE '\')
           ORDER BY lower(coalesce(NULLIF(u.display_name, ''), u.username)), u.id, live.id,
                    (l.via = 'team') DESC
           OFFSET $3 LIMIT $4"#,
        me.0,
        pattern,
        offset,
        limit,
        course.map(|c| c.0)
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Is `user` an active member of any live course's team (a teacher's
/// higher daily limit of new conversations)?
pub async fn on_some_team<'e>(db: impl sqlx::PgExecutor<'e>, user: UserId) -> Result<bool> {
    let found = sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM course_staff cs JOIN courses c ON c.id = cs.course_id
                          WHERE cs.user_id = $1 AND cs.status = 'active'
                            AND c.deleted_at IS NULL AND c.archived_at IS NULL) AS "f!""#,
        user.0
    )
    .fetch_one(db)
    .await?;
    Ok(found)
}

/// Lock the sender's row for the send transaction.
///
/// Two sends of one person count each other against the limits. `NO KEY UPDATE`: the member and
/// message rows' keys onto users (KEY SHARE) of another send stay free.
pub async fn lock_sender(db: &mut PgConnection, user: UserId) -> Result<()> {
    sqlx::query!(
        "SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE",
        user.0
    )
    .fetch_optional(db)
    .await?;
    Ok(())
}

/// Serialise the first messages of one pair (both sides writing first at
/// once): the second waits for the first transaction and then finds its
/// conversation.
pub async fn lock_pair(db: &mut PgConnection, a: UserId, b: UserId) -> Result<()> {
    let (lo, hi) = if a.0 < b.0 { (a.0, b.0) } else { (b.0, a.0) };
    sqlx::query!(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || $2::uuid::text, 0))",
        lo,
        hi
    )
    .fetch_one(db)
    .await?;
    Ok(())
}

/// A file attached to a message, in its order.
#[derive(Debug, Clone)]
pub struct AttachmentRow {
    pub message_id: MessageId,
    pub upload_id: Uuid,
    pub name: String,
    pub mime: String,
    pub size_bytes: i64,
}

/// The files of `messages`, in message then attachment order.
pub async fn attachments<'e>(
    db: impl sqlx::PgExecutor<'e>,
    messages: &[MessageId],
) -> Result<Vec<AttachmentRow>> {
    let ids: Vec<Uuid> = messages.iter().map(|m| m.0).collect();
    let rows = sqlx::query_as!(
        AttachmentRow,
        r#"SELECT mu.message_id AS "message_id!: MessageId", mu.upload_id, mu.name, u.mime, u.size_bytes
           FROM message_uploads mu JOIN uploads u ON u.id = mu.upload_id
           WHERE mu.message_id = ANY($1)
           ORDER BY mu.message_id, mu.position"#,
        &ids
    )
    .fetch_all(db)
    .await?;
    Ok(rows)
}

/// Attach claimed uploads to a new message, in the given order.
pub async fn attach(
    db: &mut PgConnection,
    message: MessageId,
    files: &[(Uuid, String)],
) -> Result<()> {
    for (position, (upload, name)) in files.iter().enumerate() {
        sqlx::query!(
            "INSERT INTO message_uploads (message_id, upload_id, name, position) VALUES ($1, $2, $3, $4)",
            message.0,
            upload,
            name,
            i16::try_from(position).unwrap_or(i16::MAX)
        )
        .execute(&mut *db)
        .await?;
    }
    Ok(())
}

/// A file of an active message, with what a download needs.
#[derive(Debug, Clone)]
pub struct StoredAttachment {
    pub conversation_id: ConversationId,
    pub name: String,
    pub mime: String,
    pub bucket: String,
    pub key: String,
}

pub async fn attachment(
    pool: &PgPool,
    message: MessageId,
    upload: Uuid,
) -> Result<Option<StoredAttachment>> {
    let row = sqlx::query_as!(
        StoredAttachment,
        r#"SELECT m.conversation_id AS "conversation_id!: ConversationId", mu.name, u.mime, u.bucket, u.key
           FROM message_uploads mu
           JOIN messages m ON m.id = mu.message_id
           JOIN uploads u ON u.id = mu.upload_id
           WHERE mu.message_id = $1 AND mu.upload_id = $2 AND m.status = 'active'"#,
        message.0,
        upload
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// `user` teaches the live `course`: its creator or an active team member who
/// is not an observer (the relation rule of docs/DIALOGS.md 3).
pub async fn teaches<'e>(
    db: impl sqlx::PgExecutor<'e>,
    user: UserId,
    course: CourseId,
) -> Result<bool> {
    Ok(sqlx::query_scalar!(
        r#"SELECT EXISTS (
               SELECT 1 FROM courses c
               WHERE c.id = $2 AND c.deleted_at IS NULL AND c.archived_at IS NULL
                 AND (c.creator_id = $1
                      OR EXISTS (SELECT 1 FROM course_staff cs
                                 WHERE cs.course_id = c.id AND cs.user_id = $1
                                   AND cs.status = 'active' AND cs.authorship <> 'reporter'))
           ) AS "teaches!""#,
        user.0,
        course.0
    )
    .fetch_one(db)
    .await?)
}

/// Those of `users` enrolled in `course` who are not on its team.
pub async fn learners_of<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course: CourseId,
    users: &[UserId],
) -> Result<Vec<UserId>> {
    let ids: Vec<Uuid> = users.iter().map(|u| u.0).collect();
    let rows = sqlx::query_scalar!(
        r#"SELECT m.user_id AS "user_id!" FROM learning.course_members m
           WHERE m.course_id = $1 AND m.user_id = ANY($2)
             AND NOT EXISTS (SELECT 1 FROM course_staff cs
                             WHERE cs.course_id = m.course_id AND cs.user_id = m.user_id
                               AND cs.status = 'active')
             AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.id = m.course_id AND c.creator_id = m.user_id)"#,
        course.0,
        &ids
    )
    .fetch_all(db)
    .await?;
    Ok(rows.into_iter().map(UserId).collect())
}
