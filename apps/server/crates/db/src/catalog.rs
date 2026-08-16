//! Catalog queries (compile-checked). Course listings paginate by keyset on
//! `id` — UUIDv7 is time-ordered, so id-descending is newest-first and the
//! cursor is simply the last id seen (ARCHITECTURE §6).

use ab_core::Result;
use ab_core::id::{CourseId, UserId};
use sqlx::PgPool;

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

/// Newest-first page of courses visible to `viewer`: public ones plus their
/// own. `cursor` = id of the last row from the previous page.
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
           WHERE (public OR $1 OR creator_id = $2)
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
