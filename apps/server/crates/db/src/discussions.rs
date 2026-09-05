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
        r#"SELECT d.id AS "id: DiscussionId", d.course_id AS "course_id: CourseId",
                  d.user_id AS "user_id: UserId", d.parent_id AS "parent_id: DiscussionId",
                  d.content, d.status AS "status: DiscussionStatus",
                  u.username AS "username?", u.display_name AS "display_name?", u.avatar_key,
                  d.likes_count, d.dislikes_count, d.replies_count,
                  (SELECT r.reaction FROM discussion_reactions r
                    WHERE r.discussion_id = d.id AND r.user_id = $2) AS "my_reaction?: ReactionKind",
                  (extract(epoch FROM d.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM d.updated_at))::bigint AS "updated_at!"
           FROM course_discussions d LEFT JOIN users u ON u.id = d.user_id
           WHERE d.id = $1"#,
        id.0,
        viewer.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Active top-level posts of a course, newest first (keyset on id).
pub async fn list_posts(
    pool: &PgPool,
    course_id: CourseId,
    viewer: UserId,
    cursor: Option<DiscussionId>,
    limit: i64,
) -> Result<Vec<DiscussionRow>> {
    let rows = sqlx::query_as!(
        DiscussionRow,
        r#"SELECT d.id AS "id: DiscussionId", d.course_id AS "course_id: CourseId",
                  d.user_id AS "user_id: UserId", d.parent_id AS "parent_id: DiscussionId",
                  d.content, d.status AS "status: DiscussionStatus",
                  u.username AS "username?", u.display_name AS "display_name?", u.avatar_key,
                  d.likes_count, d.dislikes_count, d.replies_count,
                  (SELECT r.reaction FROM discussion_reactions r
                    WHERE r.discussion_id = d.id AND r.user_id = $2) AS "my_reaction?: ReactionKind",
                  (extract(epoch FROM d.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM d.updated_at))::bigint AS "updated_at!"
           FROM course_discussions d LEFT JOIN users u ON u.id = d.user_id
           WHERE d.course_id = $1 AND d.parent_id IS NULL AND d.status = 'active'
             AND ($3::uuid IS NULL OR d.id < $3)
           ORDER BY d.id DESC
           LIMIT $4"#,
        course_id.0,
        viewer.0,
        cursor.map(|c| c.0),
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Active replies under one post, oldest first (keyset on id).
pub async fn list_replies(
    pool: &PgPool,
    parent_id: DiscussionId,
    viewer: UserId,
    cursor: Option<DiscussionId>,
    limit: i64,
) -> Result<Vec<DiscussionRow>> {
    let rows = sqlx::query_as!(
        DiscussionRow,
        r#"SELECT d.id AS "id: DiscussionId", d.course_id AS "course_id: CourseId",
                  d.user_id AS "user_id: UserId", d.parent_id AS "parent_id: DiscussionId",
                  d.content, d.status AS "status: DiscussionStatus",
                  u.username AS "username?", u.display_name AS "display_name?", u.avatar_key,
                  d.likes_count, d.dislikes_count, d.replies_count,
                  (SELECT r.reaction FROM discussion_reactions r
                    WHERE r.discussion_id = d.id AND r.user_id = $2) AS "my_reaction?: ReactionKind",
                  (extract(epoch FROM d.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM d.updated_at))::bigint AS "updated_at!"
           FROM course_discussions d LEFT JOIN users u ON u.id = d.user_id
           WHERE d.parent_id = $1 AND d.status = 'active'
             AND ($3::uuid IS NULL OR d.id > $3)
           ORDER BY d.id
           LIMIT $4"#,
        parent_id.0,
        viewer.0,
        cursor.map(|c| c.0),
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Every active reply under many posts, oldest first (embedding).
pub async fn list_replies_for(
    pool: &PgPool,
    parent_ids: &[DiscussionId],
    viewer: UserId,
) -> Result<Vec<DiscussionRow>> {
    let ids: Vec<uuid::Uuid> = parent_ids.iter().map(|p| p.0).collect();
    let rows = sqlx::query_as!(
        DiscussionRow,
        r#"SELECT d.id AS "id: DiscussionId", d.course_id AS "course_id: CourseId",
                  d.user_id AS "user_id: UserId", d.parent_id AS "parent_id: DiscussionId",
                  d.content, d.status AS "status: DiscussionStatus",
                  u.username AS "username?", u.display_name AS "display_name?", u.avatar_key,
                  d.likes_count, d.dislikes_count, d.replies_count,
                  (SELECT r.reaction FROM discussion_reactions r
                    WHERE r.discussion_id = d.id AND r.user_id = $2) AS "my_reaction?: ReactionKind",
                  (extract(epoch FROM d.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM d.updated_at))::bigint AS "updated_at!"
           FROM course_discussions d LEFT JOIN users u ON u.id = d.user_id
           WHERE d.parent_id = ANY($1) AND d.status = 'active'
           ORDER BY d.id"#,
        &ids,
        viewer.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn insert_discussion(
    pool: &PgPool,
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
pub async fn update_discussion(
    pool: &PgPool,
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

/// Hard delete (replies and reactions cascade).
pub async fn delete_discussion(pool: &PgPool, id: DiscussionId) -> Result<bool> {
    let deleted = sqlx::query!("DELETE FROM course_discussions WHERE id = $1", id.0)
        .execute(pool)
        .await?;
    Ok(deleted.rows_affected() == 1)
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
