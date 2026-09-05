//! Catalog queries (compile-checked). Course listings paginate by keyset on
//! `id` — UUIDv7 is time-ordered, so id-descending is newest-first and the
//! cursor is simply the last id seen (ARCHITECTURE §6).

use ab_core::Result;
use ab_core::id::{ActivityId, BlockId, ChapterId, CourseId, CourseUpdateId, UserId};
use sqlx::PgPool;

#[derive(Debug, Clone)]
pub struct CourseRow {
    pub id: CourseId,
    pub name: String,
    pub description: String,
    pub about: String,
    pub tags: Vec<String>,
    pub public: bool,
    pub open_to_contributors: bool,
    pub creator_id: Option<UserId>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn insert_course(
    pool: &PgPool,
    name: &str,
    description: &str,
    about: &str,
    tags: &[String],
    creator_id: UserId,
) -> Result<CourseId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO courses (name, description, about, tags, creator_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id"#,
        name,
        description,
        about,
        tags,
        creator_id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(CourseId(id))
}

pub async fn get_course(pool: &PgPool, id: CourseId) -> Result<Option<CourseRow>> {
    let row = sqlx::query_as!(
        CourseRow,
        r#"SELECT id AS "id: CourseId", name, description, about, tags,
                  public, open_to_contributors, creator_id AS "creator_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM courses WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Newest-first page of courses visible to `viewer`: public ones, their
/// own, and courses reached through a linked usergroup (cohort access).
/// `cursor` = id of the last row from the previous page.
pub async fn list_courses(
    pool: &PgPool,
    viewer: Option<UserId>,
    see_all: bool,
    cursor: Option<CourseId>,
    limit: i64,
) -> Result<Vec<CourseRow>> {
    let rows = sqlx::query_as!(
        CourseRow,
        r#"SELECT id AS "id: CourseId", name, description, about, tags,
                  public, open_to_contributors, creator_id AS "creator_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM courses
           WHERE (public OR $1 OR creator_id = $2
                  OR EXISTS (SELECT 1 FROM usergroup_courses uc
                             JOIN usergroup_members m ON m.usergroup_id = uc.usergroup_id
                             WHERE uc.course_id = courses.id AND m.user_id = $2))
             AND ($3::uuid IS NULL OR id < $3)
           ORDER BY id DESC
           LIMIT $4"#,
        see_all,
        viewer.map(|v| v.0),
        cursor.map(|c| c.0),
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub struct CourseChanges<'a> {
    pub name: Option<&'a str>,
    pub description: Option<&'a str>,
    pub about: Option<&'a str>,
    pub tags: Option<&'a [String]>,
    pub open_to_contributors: Option<bool>,
}

pub async fn update_course(
    pool: &PgPool,
    id: CourseId,
    changes: CourseChanges<'_>,
) -> Result<Option<CourseRow>> {
    let row = sqlx::query_as!(
        CourseRow,
        r#"UPDATE courses SET
               name = COALESCE($2, name),
               description = COALESCE($3, description),
               about = COALESCE($4, about),
               tags = COALESCE($5, tags),
               open_to_contributors = COALESCE($6, open_to_contributors)
           WHERE id = $1
           RETURNING id AS "id: CourseId", name, description, about, tags,
                  public, open_to_contributors, creator_id AS "creator_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!""#,
        id.0,
        changes.name,
        changes.description,
        changes.about,
        changes.tags,
        changes.open_to_contributors
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Flip visibility; returns the previous value (`None` if no such course).
pub async fn set_course_public(pool: &PgPool, id: CourseId, public: bool) -> Result<Option<bool>> {
    let previous = sqlx::query_scalar!(
        r#"UPDATE courses c SET public = $2
           FROM (SELECT id, public FROM courses WHERE id = $1 FOR UPDATE) old
           WHERE c.id = old.id
           RETURNING old.public AS "previous!""#,
        id.0,
        public
    )
    .fetch_optional(pool)
    .await?;
    Ok(previous)
}

pub async fn delete_course(pool: &PgPool, id: CourseId) -> Result<bool> {
    let deleted = sqlx::query!("DELETE FROM courses WHERE id = $1", id.0)
        .execute(pool)
        .await?;
    Ok(deleted.rows_affected() == 1)
}

// ── Chapters ────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub struct ChapterRow {
    pub id: ChapterId,
    pub course_id: CourseId,
    pub name: String,
    pub description: String,
    pub position: i32,
}

pub async fn insert_chapter(
    pool: &PgPool,
    course_id: CourseId,
    name: &str,
    description: &str,
    creator_id: UserId,
) -> Result<ChapterId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO chapters (course_id, name, description, creator_id, position)
           VALUES ($1, $2, $3, $4,
                   (SELECT COALESCE(MAX(position), 0) + 1 FROM chapters WHERE course_id = $1))
           RETURNING id"#,
        course_id.0,
        name,
        description,
        creator_id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(ChapterId(id))
}

pub async fn get_chapter(pool: &PgPool, id: ChapterId) -> Result<Option<ChapterRow>> {
    let row = sqlx::query_as!(
        ChapterRow,
        r#"SELECT id AS "id: ChapterId", course_id AS "course_id: CourseId",
                  name, description, position
           FROM chapters WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_chapters(pool: &PgPool, course_id: CourseId) -> Result<Vec<ChapterRow>> {
    let rows = sqlx::query_as!(
        ChapterRow,
        r#"SELECT id AS "id: ChapterId", course_id AS "course_id: CourseId",
                  name, description, position
           FROM chapters WHERE course_id = $1 ORDER BY position, id"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn update_chapter(
    pool: &PgPool,
    id: ChapterId,
    name: Option<&str>,
    description: Option<&str>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE chapters SET
               name = COALESCE($2, name),
               description = COALESCE($3, description)
           WHERE id = $1"#,
        id.0,
        name,
        description
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

pub async fn delete_chapter(pool: &PgPool, id: ChapterId) -> Result<bool> {
    let deleted = sqlx::query!("DELETE FROM chapters WHERE id = $1", id.0)
        .execute(pool)
        .await?;
    Ok(deleted.rows_affected() == 1)
}

/// Rewrite chapter positions 1..n (legacy clamp-and-renumber move).
pub async fn renumber_chapters(pool: &PgPool, ordered_ids: &[ChapterId]) -> Result<()> {
    let mut tx = pool.begin().await?;
    for (index, id) in ordered_ids.iter().enumerate() {
        let position = i32::try_from(index).unwrap_or(i32::MAX).saturating_add(1);
        sqlx::query!(
            "UPDATE chapters SET position = $2 WHERE id = $1",
            id.0,
            position
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

// ── Activities ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ActivityRow {
    pub id: ActivityId,
    pub chapter_id: ChapterId,
    pub course_id: CourseId,
    pub name: String,
    pub activity_type: String,
    pub activity_sub_type: String,
    pub published: bool,
    pub position: i32,
}

pub async fn insert_activity(
    pool: &PgPool,
    chapter_id: ChapterId,
    course_id: CourseId,
    name: &str,
    activity_type: &str,
    activity_sub_type: &str,
    creator_id: UserId,
) -> Result<ActivityId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO activities
               (chapter_id, course_id, name, activity_type, activity_sub_type, creator_id, position)
           VALUES ($1, $2, $3, $4, $5, $6,
                   (SELECT COALESCE(MAX(position), 0) + 1 FROM activities WHERE chapter_id = $1))
           RETURNING id"#,
        chapter_id.0,
        course_id.0,
        name,
        activity_type,
        activity_sub_type,
        creator_id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(ActivityId(id))
}

pub async fn get_activity(pool: &PgPool, id: ActivityId) -> Result<Option<ActivityRow>> {
    let row = sqlx::query_as!(
        ActivityRow,
        r#"SELECT id AS "id: ActivityId", chapter_id AS "chapter_id: ChapterId",
                  course_id AS "course_id: CourseId", name,
                  activity_type, activity_sub_type, published, position
           FROM activities WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_activities(pool: &PgPool, course_id: CourseId) -> Result<Vec<ActivityRow>> {
    let rows = sqlx::query_as!(
        ActivityRow,
        r#"SELECT id AS "id: ActivityId", chapter_id AS "chapter_id: ChapterId",
                  course_id AS "course_id: CourseId", name,
                  activity_type, activity_sub_type, published, position
           FROM activities WHERE course_id = $1
           ORDER BY chapter_id, position, id"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn list_chapter_activity_ids(
    pool: &PgPool,
    chapter_id: ChapterId,
) -> Result<Vec<ActivityId>> {
    let ids = sqlx::query_scalar!(
        r#"SELECT id AS "id: ActivityId"
           FROM activities WHERE chapter_id = $1 ORDER BY position, id"#,
        chapter_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(ids)
}

pub async fn update_activity(
    pool: &PgPool,
    id: ActivityId,
    name: Option<&str>,
    published: Option<bool>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE activities SET
               name = COALESCE($2, name),
               published = COALESCE($3, published)
           WHERE id = $1"#,
        id.0,
        name,
        published
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

pub async fn delete_activity(pool: &PgPool, id: ActivityId) -> Result<bool> {
    let deleted = sqlx::query!("DELETE FROM activities WHERE id = $1", id.0)
        .execute(pool)
        .await?;
    Ok(deleted.rows_affected() == 1)
}

/// Reparent + renumber for a cross-chapter move (same course only).
pub async fn set_activity_chapter(
    pool: &PgPool,
    id: ActivityId,
    chapter_id: ChapterId,
) -> Result<()> {
    sqlx::query!(
        "UPDATE activities SET chapter_id = $2 WHERE id = $1",
        id.0,
        chapter_id.0
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// The heavy jsonb columns, fetched only for the single-activity view.
pub struct ActivityContentRow {
    pub content: serde_json::Value,
    pub details: serde_json::Value,
    pub settings: serde_json::Value,
}

pub async fn get_activity_content(
    pool: &PgPool,
    id: ActivityId,
) -> Result<Option<ActivityContentRow>> {
    let row = sqlx::query_as!(
        ActivityContentRow,
        "SELECT content, details, settings FROM activities WHERE id = $1",
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn update_activity_content(
    pool: &PgPool,
    id: ActivityId,
    content: Option<&serde_json::Value>,
    details: Option<&serde_json::Value>,
    settings: Option<&serde_json::Value>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE activities SET
               content = COALESCE($2, content),
               details = COALESCE($3, details),
               settings = COALESCE($4, settings)
           WHERE id = $1"#,
        id.0,
        content,
        details,
        settings
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Change the type pair together — the DB CHECK enforces validity.
pub async fn set_activity_type(
    pool: &PgPool,
    id: ActivityId,
    activity_type: &str,
    activity_sub_type: &str,
) -> Result<bool> {
    let updated = sqlx::query!(
        "UPDATE activities SET activity_type = $2, activity_sub_type = $3 WHERE id = $1",
        id.0,
        activity_type,
        activity_sub_type
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

pub async fn renumber_activities(pool: &PgPool, ordered_ids: &[ActivityId]) -> Result<()> {
    let mut tx = pool.begin().await?;
    for (index, id) in ordered_ids.iter().enumerate() {
        let position = i32::try_from(index).unwrap_or(i32::MAX).saturating_add(1);
        sqlx::query!(
            "UPDATE activities SET position = $2 WHERE id = $1",
            id.0,
            position
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

// ── Blocks ──────────────────────────────────────────────────────────────────

pub struct BlockRow {
    pub id: BlockId,
    pub activity_id: ActivityId,
    pub block_type: String,
    pub content: serde_json::Value,
    pub created_at: i64,
}

pub async fn insert_block(
    pool: &PgPool,
    activity_id: ActivityId,
    block_type: &str,
    content: &serde_json::Value,
) -> Result<BlockId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO blocks (activity_id, block_type, content)
           VALUES ($1, $2, $3)
           RETURNING id"#,
        activity_id.0,
        block_type,
        content
    )
    .fetch_one(pool)
    .await?;
    Ok(BlockId(id))
}

pub async fn get_block(pool: &PgPool, id: BlockId) -> Result<Option<BlockRow>> {
    let row = sqlx::query_as!(
        BlockRow,
        r#"SELECT id AS "id: BlockId", activity_id AS "activity_id: ActivityId",
                  block_type, content,
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM blocks WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_blocks(pool: &PgPool, activity_id: ActivityId) -> Result<Vec<BlockRow>> {
    let rows = sqlx::query_as!(
        BlockRow,
        r#"SELECT id AS "id: BlockId", activity_id AS "activity_id: ActivityId",
                  block_type, content,
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM blocks WHERE activity_id = $1 ORDER BY id"#,
        activity_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn delete_block(pool: &PgPool, id: BlockId) -> Result<bool> {
    let deleted = sqlx::query!("DELETE FROM blocks WHERE id = $1", id.0)
        .execute(pool)
        .await?;
    Ok(deleted.rows_affected() == 1)
}

// ── Course updates (changelog) ──────────────────────────────────────────────

pub struct CourseUpdateRow {
    pub id: CourseUpdateId,
    pub course_id: CourseId,
    pub title: String,
    pub content: String,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn insert_course_update(
    pool: &PgPool,
    course_id: CourseId,
    title: &str,
    content: &str,
) -> Result<CourseUpdateId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO course_updates (course_id, title, content)
           VALUES ($1, $2, $3)
           RETURNING id"#,
        course_id.0,
        title,
        content
    )
    .fetch_one(pool)
    .await?;
    Ok(CourseUpdateId(id))
}

pub async fn get_course_update(
    pool: &PgPool,
    id: CourseUpdateId,
) -> Result<Option<CourseUpdateRow>> {
    let row = sqlx::query_as!(
        CourseUpdateRow,
        r#"SELECT id AS "id: CourseUpdateId", course_id AS "course_id: CourseId",
                  title, content,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM course_updates WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Newest-first (announcement feed order).
pub async fn list_course_updates(
    pool: &PgPool,
    course_id: CourseId,
) -> Result<Vec<CourseUpdateRow>> {
    let rows = sqlx::query_as!(
        CourseUpdateRow,
        r#"SELECT id AS "id: CourseUpdateId", course_id AS "course_id: CourseId",
                  title, content,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM course_updates WHERE course_id = $1
           ORDER BY id DESC"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn update_course_update(
    pool: &PgPool,
    id: CourseUpdateId,
    title: Option<&str>,
    content: Option<&str>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE course_updates SET
               title = COALESCE($2, title),
               content = COALESCE($3, content)
           WHERE id = $1"#,
        id.0,
        title,
        content
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

pub async fn delete_course_update(pool: &PgPool, id: CourseUpdateId) -> Result<bool> {
    let deleted = sqlx::query!("DELETE FROM course_updates WHERE id = $1", id.0)
        .execute(pool)
        .await?;
    Ok(deleted.rows_affected() == 1)
}
