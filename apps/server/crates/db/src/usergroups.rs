//! Usergroup (cohort) queries.

use ab_core::Result;
use ab_core::id::{CourseId, UserId, UsergroupId};
use sqlx::PgPool;

pub struct UsergroupRow {
    pub id: UsergroupId,
    pub name: String,
    pub description: String,
    pub creator_id: Option<UserId>,
    pub member_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn insert_usergroup(
    pool: &PgPool,
    name: &str,
    description: &str,
    creator_id: UserId,
) -> Result<UsergroupId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO usergroups (name, description, creator_id)
           VALUES ($1, $2, $3) RETURNING id"#,
        name,
        description,
        creator_id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(UsergroupId(id))
}

pub async fn get_usergroup(pool: &PgPool, id: UsergroupId) -> Result<Option<UsergroupRow>> {
    let row = sqlx::query_as!(
        UsergroupRow,
        r#"SELECT g.id AS "id: UsergroupId", g.name, g.description,
                  g.creator_id AS "creator_id: UserId",
                  (SELECT count(*) FROM usergroup_members m
                   WHERE m.usergroup_id = g.id) AS "member_count!",
                  (extract(epoch FROM g.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM g.updated_at))::bigint AS "updated_at!"
           FROM usergroups g WHERE g.id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Newest-first keyset page (admin/instructor view — no visibility split;
/// the service gates on `usergroup:read:platform`).
pub async fn list_usergroups(
    pool: &PgPool,
    cursor: Option<UsergroupId>,
    limit: i64,
) -> Result<Vec<UsergroupRow>> {
    let rows = sqlx::query_as!(
        UsergroupRow,
        r#"SELECT g.id AS "id: UsergroupId", g.name, g.description,
                  g.creator_id AS "creator_id: UserId",
                  (SELECT count(*) FROM usergroup_members m
                   WHERE m.usergroup_id = g.id) AS "member_count!",
                  (extract(epoch FROM g.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM g.updated_at))::bigint AS "updated_at!"
           FROM usergroups g
           WHERE ($1::uuid IS NULL OR g.id < $1)
           ORDER BY g.id DESC
           LIMIT $2"#,
        cursor.map(|c| c.0),
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn update_usergroup(
    pool: &PgPool,
    id: UsergroupId,
    name: Option<&str>,
    description: Option<&str>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE usergroups SET
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

pub async fn delete_usergroup(pool: &PgPool, id: UsergroupId) -> Result<bool> {
    let deleted = sqlx::query!("DELETE FROM usergroups WHERE id = $1", id.0)
        .execute(pool)
        .await?;
    Ok(deleted.rows_affected() == 1)
}

/// Batch add; unknown users fail the FK, duplicates are ignored.
pub async fn add_members(pool: &PgPool, id: UsergroupId, user_ids: &[UserId]) -> Result<()> {
    let mut tx = pool.begin().await?;
    for user_id in user_ids {
        sqlx::query!(
            r#"INSERT INTO usergroup_members (usergroup_id, user_id)
               VALUES ($1, $2) ON CONFLICT DO NOTHING"#,
            id.0,
            user_id.0
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn remove_members(pool: &PgPool, id: UsergroupId, user_ids: &[UserId]) -> Result<()> {
    sqlx::query!(
        "DELETE FROM usergroup_members WHERE usergroup_id = $1 AND user_id = ANY($2)",
        id.0,
        &user_ids.iter().map(|u| u.0).collect::<Vec<_>>()
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub struct MemberRow {
    pub id: UserId,
    pub username: String,
    pub display_name: String,
    pub avatar_key: Option<String>,
}

pub async fn list_members(pool: &PgPool, id: UsergroupId) -> Result<Vec<MemberRow>> {
    let rows = sqlx::query_as!(
        MemberRow,
        r#"SELECT u.id AS "id: UserId", u.username, u.display_name, u.avatar_key
           FROM usergroup_members m
           JOIN users u ON u.id = m.user_id
           WHERE m.usergroup_id = $1
           ORDER BY u.username"#,
        id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn add_courses(pool: &PgPool, id: UsergroupId, course_ids: &[CourseId]) -> Result<()> {
    let mut tx = pool.begin().await?;
    for course_id in course_ids {
        sqlx::query!(
            r#"INSERT INTO usergroup_courses (usergroup_id, course_id)
               VALUES ($1, $2) ON CONFLICT DO NOTHING"#,
            id.0,
            course_id.0
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn remove_courses(pool: &PgPool, id: UsergroupId, course_ids: &[CourseId]) -> Result<()> {
    sqlx::query!(
        "DELETE FROM usergroup_courses WHERE usergroup_id = $1 AND course_id = ANY($2)",
        id.0,
        &course_ids.iter().map(|c| c.0).collect::<Vec<_>>()
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_course_ids(pool: &PgPool, id: UsergroupId) -> Result<Vec<CourseId>> {
    let ids = sqlx::query_scalar!(
        r#"SELECT course_id AS "course_id: CourseId"
           FROM usergroup_courses WHERE usergroup_id = $1"#,
        id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(ids)
}

/// Groups linked to a course (legacy `/resource/{uuid}` view).
pub async fn list_for_course(pool: &PgPool, course_id: CourseId) -> Result<Vec<UsergroupRow>> {
    let rows = sqlx::query_as!(
        UsergroupRow,
        r#"SELECT g.id AS "id: UsergroupId", g.name, g.description,
                  g.creator_id AS "creator_id: UserId",
                  (SELECT count(*) FROM usergroup_members m
                   WHERE m.usergroup_id = g.id) AS "member_count!",
                  (extract(epoch FROM g.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM g.updated_at))::bigint AS "updated_at!"
           FROM usergroup_courses gc
           JOIN usergroups g ON g.id = gc.usergroup_id
           WHERE gc.course_id = $1
           ORDER BY g.id DESC"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
