//! In-app notifications (S-07) and the recipient sets producers fan out to.

use ab_core::Result;
use ab_core::assessments::NotificationType;
use ab_core::id::{CourseId, DiscussionId, NotificationId, UserId};
use sqlx::PgPool;

#[derive(Debug, Clone)]
pub struct NotificationRow {
    pub id: NotificationId,
    pub user_id: UserId,
    pub kind: NotificationType,
    pub payload: serde_json::Value,
    pub created_at: i64,
    pub read_at: Option<i64>,
}

/// One row per recipient that has not opted out of `kind`; a recipient
/// that already holds `dedup_key` is skipped. Returns the rows created.
pub async fn insert_many(
    pool: &PgPool,
    recipients: &[UserId],
    kind: NotificationType,
    payload: &serde_json::Value,
    dedup_key: Option<&str>,
) -> Result<Vec<NotificationRow>> {
    let ids: Vec<uuid::Uuid> = recipients.iter().map(|u| u.0).collect();
    let rows = sqlx::query_as!(
        NotificationRow,
        r#"INSERT INTO notifications (user_id, kind, payload, dedup_key)
           SELECT DISTINCT r.user_id, $2::text, $3::jsonb, $4::text
           FROM unnest($1::uuid[]) AS r(user_id)
           JOIN users u ON u.id = r.user_id AND u.status = 'active'
           WHERE NOT EXISTS (SELECT 1 FROM notification_preferences p
                             WHERE p.user_id = r.user_id AND $2 = ANY (p.disabled))
           ON CONFLICT (user_id, dedup_key) DO NOTHING
           RETURNING id AS "id: NotificationId", user_id AS "user_id: UserId",
                     kind AS "kind: NotificationType", payload,
                     (extract(epoch FROM created_at))::bigint AS "created_at!",
                     (extract(epoch FROM read_at))::bigint AS "read_at?""#,
        &ids,
        kind.as_str(),
        payload,
        dedup_key,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Newest first, keyset on the (time-ordered) id.
pub async fn list(
    pool: &PgPool,
    user_id: UserId,
    unread_only: bool,
    before: Option<NotificationId>,
    limit: i64,
) -> Result<Vec<NotificationRow>> {
    let rows = sqlx::query_as!(
        NotificationRow,
        r#"SELECT id AS "id: NotificationId", user_id AS "user_id: UserId",
                  kind AS "kind: NotificationType", payload,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM read_at))::bigint AS "read_at?"
           FROM notifications
           WHERE user_id = $1
             AND (NOT $2 OR read_at IS NULL)
             AND ($3::uuid IS NULL OR id < $3)
           ORDER BY id DESC
           LIMIT $4"#,
        user_id.0,
        unread_only,
        before.map(|b| b.0),
        limit,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn unread_count(pool: &PgPool, user_id: UserId) -> Result<i64> {
    let n = sqlx::query_scalar!(
        r#"SELECT count(*) AS "n!" FROM notifications WHERE user_id = $1 AND read_at IS NULL"#,
        user_id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(n)
}

/// `None` when the id is unknown or another user's; `Some(changed)`.
pub async fn mark_read(pool: &PgPool, user_id: UserId, id: NotificationId) -> Result<Option<bool>> {
    let changed = sqlx::query_scalar!(
        r#"WITH target AS (SELECT id, read_at IS NULL AS unread FROM notifications
                           WHERE id = $1 AND user_id = $2 FOR UPDATE),
                upd AS (UPDATE notifications n SET read_at = now()
                        FROM target t WHERE n.id = t.id AND t.unread RETURNING n.id)
           SELECT unread AS "unread!" FROM target"#,
        id.0,
        user_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(changed)
}

pub async fn mark_all_read(pool: &PgPool, user_id: UserId) -> Result<u64> {
    let done = sqlx::query!(
        "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL",
        user_id.0
    )
    .execute(pool)
    .await?;
    Ok(done.rows_affected())
}

pub async fn disabled_types(pool: &PgPool, user_id: UserId) -> Result<Vec<NotificationType>> {
    let disabled = sqlx::query_scalar!(
        "SELECT disabled FROM notification_preferences WHERE user_id = $1",
        user_id.0
    )
    .fetch_optional(pool)
    .await?
    .unwrap_or_default();
    Ok(disabled
        .iter()
        .filter_map(|k| NotificationType::parse(k))
        .collect())
}

pub async fn set_disabled_types(
    pool: &PgPool,
    user_id: UserId,
    disabled: &[NotificationType],
) -> Result<()> {
    let disabled: Vec<&str> = disabled.iter().map(|k| k.as_str()).collect();
    sqlx::query!(
        r#"INSERT INTO notification_preferences (user_id, disabled) VALUES ($1, $2::text[])
           ON CONFLICT (user_id) DO UPDATE SET disabled = EXCLUDED.disabled"#,
        user_id.0,
        &disabled as &[&str],
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Retention: delete rows created more than `days` ago.
pub async fn prune(pool: &PgPool, days: i32) -> Result<u64> {
    let done = sqlx::query!(
        "DELETE FROM notifications WHERE created_at < now() - make_interval(days => $1)",
        days
    )
    .execute(pool)
    .await?;
    Ok(done.rows_affected())
}

// ── Recipient sets ─────────────────────────────────────────────────────────

/// The course's creator and active writing co-authors (its graders - the
/// `:own` scope of `Course::is_author`).
pub async fn course_authors(pool: &PgPool, course_id: CourseId) -> Result<Vec<UserId>> {
    let ids = sqlx::query_scalar!(
        r#"SELECT creator_id AS "id!" FROM courses WHERE id = $1 AND creator_id IS NOT NULL
           UNION
           SELECT user_id FROM resource_authors
           WHERE course_id = $1 AND status = 'active' AND authorship <> 'reporter'"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(ids.into_iter().map(UserId).collect())
}

/// Who manages the roster: the creator and active maintainers.
pub async fn course_owners(pool: &PgPool, course_id: CourseId) -> Result<Vec<UserId>> {
    let ids = sqlx::query_scalar!(
        r#"SELECT creator_id AS "id!" FROM courses WHERE id = $1 AND creator_id IS NOT NULL
           UNION
           SELECT user_id FROM resource_authors
           WHERE course_id = $1 AND status = 'active' AND authorship = 'maintainer'"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(ids.into_iter().map(UserId).collect())
}

/// Enrolled learners (a trail run, never staff - the UX-150 predicate).
pub async fn course_learners(pool: &PgPool, course_id: CourseId) -> Result<Vec<UserId>> {
    let ids = sqlx::query_scalar!(
        r#"SELECT DISTINCT user_id AS "id!" FROM trail_runs
           WHERE course_id = $1 AND NOT is_course_staff(course_id, user_id)"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(ids.into_iter().map(UserId).collect())
}

/// A thread's author and everyone with an active reply under it.
pub async fn thread_participants(pool: &PgPool, root: DiscussionId) -> Result<Vec<UserId>> {
    let ids = sqlx::query_scalar!(
        r#"SELECT user_id AS "id!" FROM course_discussions WHERE id = $1
           UNION
           SELECT user_id FROM course_discussions WHERE parent_id = $1 AND status = 'active'"#,
        root.0
    )
    .fetch_all(pool)
    .await?;
    Ok(ids.into_iter().map(UserId).collect())
}

/// Names a notification payload shows: (course name, activity name).
pub async fn activity_names(
    pool: &PgPool,
    activity_id: ab_core::id::ActivityId,
) -> Result<Option<(CourseId, String, String)>> {
    let row = sqlx::query!(
        r#"SELECT c.id AS "course_id: CourseId", c.name AS course_name, a.name AS activity_name
           FROM activities a JOIN courses c ON c.id = a.course_id WHERE a.id = $1"#,
        activity_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| (r.course_id, r.course_name, r.activity_name)))
}
