//! Course discussion queries (compile-checked).
//!
//! Over `course_discussions` + `discussion_reactions`; counters are
//! trigger-maintained, the viewer's own reaction is resolved per row, and
//! timestamps are epoch seconds.

use ab_core::Result;
use ab_core::assessments::{DiscussionStatus, ReactionKind};
use ab_core::id::{CourseId, DiscussionId, UserId};
use sqlx::PgPool;

#[derive(Debug, Clone)]
pub struct DiscussionRow {
    pub id: DiscussionId,
    pub course_id: CourseId,
    /// `None` once the author's account is gone (the post survives).
    pub user_id: Option<UserId>,
    pub parent_id: Option<DiscussionId>,
    pub content: String,
    pub status: DiscussionStatus,
    /// S-04 optimistic lock (content and status edits bump it).
    pub version: i32,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub avatar_key: Option<String>,
    pub likes_count: i32,
    pub dislikes_count: i32,
    pub replies_count: i32,
    /// The viewer's reaction, if any.
    pub my_reaction: Option<ReactionKind>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// One row by id (any status), as seen by `viewer`.
pub async fn get_discussion(
    pool: &PgPool,
    id: DiscussionId,
    viewer: UserId,
) -> Result<Option<DiscussionRow>> {
    let row = sqlx::query_as!(
        DiscussionRow,
        r#"SELECT d.id AS "id!: DiscussionId", d.course_id AS "course_id!: CourseId",
                  d.user_id AS "user_id?: UserId", d.parent_id AS "parent_id?: DiscussionId",
                  d.content AS "content!", d.status AS "status!: DiscussionStatus", d.version AS "version!",
                  -- Scalar lookups, not a LEFT JOIN: sqlx infers a join's nullability from the plan,
                  -- which differs between an empty and a populated database (the .sqlx cache then drifts).
                  (SELECT u.username FROM users u WHERE u.id = d.user_id) AS "username?",
                  (SELECT u.display_name FROM users u WHERE u.id = d.user_id) AS "display_name?",
                  (SELECT u.avatar_key FROM users u WHERE u.id = d.user_id) AS "avatar_key?",
                  d.likes_count AS "likes_count!", d.dislikes_count AS "dislikes_count!", d.replies_count AS "replies_count!",
                  (SELECT r.reaction FROM discussion_reactions r
                    WHERE r.discussion_id = d.id AND r.user_id = $2) AS "my_reaction?: ReactionKind",
                  (extract(epoch FROM d.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM d.updated_at))::bigint AS "updated_at!"
           FROM course_discussions d
           WHERE d.id = $1"#,
        id.0,
        viewer.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Active top-level posts of a course, newest first (keyset on id), and the
/// tombstones of deleted ones that still carry replies; `include_hidden`
/// (moderators) adds hidden ones so they can be restored.
pub async fn list_posts(
    pool: &PgPool,
    course_id: CourseId,
    viewer: UserId,
    include_hidden: bool,
    cursor: Option<DiscussionId>,
    limit: i64,
) -> Result<Vec<DiscussionRow>> {
    let rows = sqlx::query_as!(
        DiscussionRow,
        r#"SELECT d.id AS "id!: DiscussionId", d.course_id AS "course_id!: CourseId",
                  d.user_id AS "user_id?: UserId", d.parent_id AS "parent_id?: DiscussionId",
                  d.content AS "content!", d.status AS "status!: DiscussionStatus", d.version AS "version!",
                  -- Scalar lookups, not a LEFT JOIN: sqlx infers a join's nullability from the plan,
                  -- which differs between an empty and a populated database (the .sqlx cache then drifts).
                  (SELECT u.username FROM users u WHERE u.id = d.user_id) AS "username?",
                  (SELECT u.display_name FROM users u WHERE u.id = d.user_id) AS "display_name?",
                  (SELECT u.avatar_key FROM users u WHERE u.id = d.user_id) AS "avatar_key?",
                  d.likes_count AS "likes_count!", d.dislikes_count AS "dislikes_count!", d.replies_count AS "replies_count!",
                  (SELECT r.reaction FROM discussion_reactions r
                    WHERE r.discussion_id = d.id AND r.user_id = $2) AS "my_reaction?: ReactionKind",
                  (extract(epoch FROM d.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM d.updated_at))::bigint AS "updated_at!"
           FROM course_discussions d
           WHERE d.course_id = $1 AND d.parent_id IS NULL
             AND (d.status = 'active' OR ($5 AND d.status = 'hidden')
                  OR (d.status = 'deleted' AND d.replies_count > 0))
             AND ($3::uuid IS NULL OR d.id < $3)
           ORDER BY d.id DESC
           LIMIT $4"#,
        course_id.0,
        viewer.0,
        cursor.map(|c| c.0),
        limit,
        include_hidden
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Active replies under one post, oldest first (keyset on id); `include_hidden` as in [`list_posts`].
pub async fn list_replies(
    pool: &PgPool,
    parent_id: DiscussionId,
    viewer: UserId,
    include_hidden: bool,
    cursor: Option<DiscussionId>,
    limit: i64,
) -> Result<Vec<DiscussionRow>> {
    let rows = sqlx::query_as!(
        DiscussionRow,
        r#"SELECT d.id AS "id!: DiscussionId", d.course_id AS "course_id!: CourseId",
                  d.user_id AS "user_id?: UserId", d.parent_id AS "parent_id?: DiscussionId",
                  d.content AS "content!", d.status AS "status!: DiscussionStatus", d.version AS "version!",
                  -- Scalar lookups, not a LEFT JOIN: sqlx infers a join's nullability from the plan,
                  -- which differs between an empty and a populated database (the .sqlx cache then drifts).
                  (SELECT u.username FROM users u WHERE u.id = d.user_id) AS "username?",
                  (SELECT u.display_name FROM users u WHERE u.id = d.user_id) AS "display_name?",
                  (SELECT u.avatar_key FROM users u WHERE u.id = d.user_id) AS "avatar_key?",
                  d.likes_count AS "likes_count!", d.dislikes_count AS "dislikes_count!", d.replies_count AS "replies_count!",
                  (SELECT r.reaction FROM discussion_reactions r
                    WHERE r.discussion_id = d.id AND r.user_id = $2) AS "my_reaction?: ReactionKind",
                  (extract(epoch FROM d.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM d.updated_at))::bigint AS "updated_at!"
           FROM course_discussions d
           WHERE d.parent_id = $1
             AND (d.status = 'active' OR ($5 AND d.status = 'hidden'))
             AND ($3::uuid IS NULL OR d.id > $3)
           ORDER BY d.id
           LIMIT $4"#,
        parent_id.0,
        viewer.0,
        cursor.map(|c| c.0),
        limit,
        include_hidden
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Every active reply under many posts, oldest first (embedding); `include_hidden` as in [`list_posts`].
pub async fn list_replies_for(
    pool: &PgPool,
    parent_ids: &[DiscussionId],
    viewer: UserId,
    include_hidden: bool,
) -> Result<Vec<DiscussionRow>> {
    let ids: Vec<uuid::Uuid> = parent_ids.iter().map(|p| p.0).collect();
    let rows = sqlx::query_as!(
        DiscussionRow,
        r#"SELECT d.id AS "id!: DiscussionId", d.course_id AS "course_id!: CourseId",
                  d.user_id AS "user_id?: UserId", d.parent_id AS "parent_id?: DiscussionId",
                  d.content AS "content!", d.status AS "status!: DiscussionStatus", d.version AS "version!",
                  -- Scalar lookups, not a LEFT JOIN: sqlx infers a join's nullability from the plan,
                  -- which differs between an empty and a populated database (the .sqlx cache then drifts).
                  (SELECT u.username FROM users u WHERE u.id = d.user_id) AS "username?",
                  (SELECT u.display_name FROM users u WHERE u.id = d.user_id) AS "display_name?",
                  (SELECT u.avatar_key FROM users u WHERE u.id = d.user_id) AS "avatar_key?",
                  d.likes_count AS "likes_count!", d.dislikes_count AS "dislikes_count!", d.replies_count AS "replies_count!",
                  (SELECT r.reaction FROM discussion_reactions r
                    WHERE r.discussion_id = d.id AND r.user_id = $2) AS "my_reaction?: ReactionKind",
                  (extract(epoch FROM d.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM d.updated_at))::bigint AS "updated_at!"
           FROM course_discussions d
           WHERE d.parent_id = ANY($1)
             AND (d.status = 'active' OR ($3 AND d.status = 'hidden'))
           ORDER BY d.id"#,
        &ids,
        viewer.0,
        include_hidden
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn insert_discussion<'e>(
    pool: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
    user_id: UserId,
    parent_id: Option<DiscussionId>,
    content: &str,
) -> Result<DiscussionId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO course_discussions (course_id, user_id, parent_id, kind, content)
           VALUES ($1, $2, $3, CASE WHEN $3::uuid IS NULL THEN 'post' ELSE 'reply' END, $4)
           RETURNING id AS "id: DiscussionId""#,
        course_id.0,
        user_id.0,
        parent_id.map(|p| p.0),
        content
    )
    .fetch_one(pool)
    .await?;
    Ok(id)
}

/// Partial update; `None` keeps the column.
pub async fn update_discussion<'e>(
    pool: impl sqlx::PgExecutor<'e>,
    id: DiscussionId,
    content: Option<&str>,
    status: Option<DiscussionStatus>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE course_discussions
           SET content = COALESCE($2, content), status = COALESCE($3, status)
           WHERE id = $1"#,
        id.0,
        content,
        status.map(DiscussionStatus::as_str)
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// What [`delete_discussion`] did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Deleted {
    /// Gone with its own replies and reactions.
    Removed,
    /// Others replied: the post stays as a tombstone so their replies stay
    /// threaded.
    Tombstone,
    /// Nothing to delete (a concurrent delete won).
    Missing,
}

/// Delete a post or reply (owner decision 2026-10-14).
///
/// A post somebody else replied to becomes a tombstone: status `deleted`, its text and author
/// wiped, its reactions dropped, the replies kept. Otherwise the row goes
/// (its replies and reactions cascade); a reply that was the last one under
/// a tombstone takes the tombstone with it.
pub async fn delete_discussion(pool: &PgPool, id: DiscussionId) -> Result<Deleted> {
    let mut tx = pool.begin().await?;
    let Some(row) = sqlx::query!(
        r#"SELECT user_id AS "user_id?", parent_id AS "parent_id?"
           FROM course_discussions WHERE id = $1 FOR UPDATE"#,
        id.0
    )
    .fetch_optional(&mut *tx)
    .await?
    else {
        return Ok(Deleted::Missing);
    };
    let replied_by_others = sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM course_discussions
                          WHERE parent_id = $1 AND status <> 'deleted'
                            AND user_id IS DISTINCT FROM $2) AS "exists!""#,
        id.0,
        row.user_id
    )
    .fetch_one(&mut *tx)
    .await?;
    if replied_by_others {
        sqlx::query!(
            r#"UPDATE course_discussions SET status = 'deleted', content = '', user_id = NULL
               WHERE id = $1"#,
            id.0
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            "DELETE FROM discussion_reactions WHERE discussion_id = $1",
            id.0
        )
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        return Ok(Deleted::Tombstone);
    }
    sqlx::query!("DELETE FROM course_discussions WHERE id = $1", id.0)
        .execute(&mut *tx)
        .await?;
    if let Some(parent) = row.parent_id {
        sqlx::query!(
            r#"DELETE FROM course_discussions p
               WHERE p.id = $1 AND p.status = 'deleted'
                 AND NOT EXISTS (SELECT 1 FROM course_discussions c WHERE c.parent_id = p.id)"#,
            parent
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(Deleted::Removed)
}

/// Toggle a reaction: the same kind again removes it; the other kind
/// replaces it (one reaction per user per post).
pub async fn toggle_reaction(
    pool: &PgPool,
    id: DiscussionId,
    user_id: UserId,
    kind: ReactionKind,
) -> Result<()> {
    let removed = sqlx::query!(
        r#"DELETE FROM discussion_reactions
           WHERE discussion_id = $1 AND user_id = $2 AND reaction = $3"#,
        id.0,
        user_id.0,
        kind.as_str()
    )
    .execute(pool)
    .await?;
    if removed.rows_affected() == 0 {
        sqlx::query!(
            r#"INSERT INTO discussion_reactions (discussion_id, user_id, reaction)
               VALUES ($1, $2, $3)
               ON CONFLICT (discussion_id, user_id) DO UPDATE SET reaction = EXCLUDED.reaction"#,
            id.0,
            user_id.0,
            kind.as_str()
        )
        .execute(pool)
        .await?;
    }
    Ok(())
}
