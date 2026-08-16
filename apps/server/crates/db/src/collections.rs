//! Collection queries. Visibility mirrors courses: public OR own OR
//! `collection:read:all`; membership is replaced wholesale on update
//! (legacy semantics), ordered by position.

use ab_core::Result;
use ab_core::id::{CollectionId, CourseId, UserId};
use sqlx::PgPool;

use crate::catalog::CourseRow;

pub struct CollectionRow {
    pub id: CollectionId,
    pub name: String,
    pub description: String,
    pub public: bool,
    pub creator_id: Option<UserId>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn insert_collection(
    pool: &PgPool,
    name: &str,
    description: &str,
    public: bool,
    creator_id: UserId,
) -> Result<CollectionId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO collections (name, description, public, creator_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id"#,
        name,
        description,
        public,
        creator_id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(CollectionId(id))
}

pub async fn get_collection(pool: &PgPool, id: CollectionId) -> Result<Option<CollectionRow>> {
    let row = sqlx::query_as!(
        CollectionRow,
        r#"SELECT id AS "id: CollectionId", name, description, public,
                  creator_id AS "creator_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM collections WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Newest-first page of collections visible to `viewer`.
pub async fn list_collections(
    pool: &PgPool,
    viewer: Option<UserId>,
    see_all: bool,
    cursor: Option<CollectionId>,
    limit: i64,
) -> Result<Vec<CollectionRow>> {
    let rows = sqlx::query_as!(
        CollectionRow,
        r#"SELECT id AS "id: CollectionId", name, description, public,
                  creator_id AS "creator_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM collections
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

pub async fn update_collection(
    pool: &PgPool,
    id: CollectionId,
    name: Option<&str>,
    description: Option<&str>,
    public: Option<bool>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE collections SET
               name = COALESCE($2, name),
               description = COALESCE($3, description),
               public = COALESCE($4, public)
           WHERE id = $1"#,
        id.0,
        name,
        description,
        public
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

pub async fn delete_collection(pool: &PgPool, id: CollectionId) -> Result<bool> {
    let deleted = sqlx::query!("DELETE FROM collections WHERE id = $1", id.0)
        .execute(pool)
        .await?;
    Ok(deleted.rows_affected() == 1)
}

/// Replace the whole membership (legacy update semantics), positions 1..n.
pub async fn set_collection_courses(
    pool: &PgPool,
    id: CollectionId,
    course_ids: &[CourseId],
) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query!(
        "DELETE FROM collection_courses WHERE collection_id = $1",
        id.0
    )
    .execute(&mut *tx)
    .await?;
    for (index, course_id) in course_ids.iter().enumerate() {
        let position = i32::try_from(index).unwrap_or(i32::MAX).saturating_add(1);
        sqlx::query!(
            r#"INSERT INTO collection_courses (collection_id, course_id, position)
               VALUES ($1, $2, $3)
               ON CONFLICT (collection_id, course_id) DO NOTHING"#,
            id.0,
            course_id.0,
            position
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Member courses visible to `viewer`, in collection order.
pub async fn list_collection_courses(
    pool: &PgPool,
    id: CollectionId,
    viewer: Option<UserId>,
    see_all: bool,
) -> Result<Vec<CourseRow>> {
    let rows = sqlx::query_as!(
        CourseRow,
        r#"SELECT c.id AS "id: CourseId", c.name, c.description, c.about, c.tags,
                  c.public, c.open_to_contributors,
                  c.creator_id AS "creator_id: UserId",
                  (extract(epoch FROM c.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM c.updated_at))::bigint AS "updated_at!"
           FROM collection_courses cc
           JOIN courses c ON c.id = cc.course_id
           WHERE cc.collection_id = $1
             AND (c.public OR $2 OR c.creator_id = $3)
           ORDER BY cc.position, c.id"#,
        id.0,
        see_all,
        viewer.map(|v| v.0)
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
