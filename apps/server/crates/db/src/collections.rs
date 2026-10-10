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
    /// Optimistic-lock version (`If-Match` on update, UX-279).
    pub version: i32,
    /// Storage key of the cover image (a claimed `collection-cover` upload).
    pub cover_key: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Insert the collection and its membership on the caller's transaction.
pub async fn insert_collection(
    tx: &mut sqlx::PgConnection,
    name: &str,
    description: &str,
    public: bool,
    creator_id: UserId,
    course_ids: &[CourseId],
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
    .fetch_one(&mut *tx)
    .await?;
    let id = CollectionId(id);
    set_collection_courses(tx, id, course_ids).await?;
    Ok(id)
}

/// Swap the cover key; returns the replaced one (`None`: no such row or no
/// cover). The row is locked before the caller claims or releases uploads
/// (collection, then uploads: the order a delete takes).
pub async fn set_collection_cover<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: CollectionId,
    key: Option<&str>,
) -> Result<Option<String>> {
    let row = sqlx::query!(
        r#"UPDATE collections c SET cover_key = $2
           FROM (SELECT id, cover_key FROM collections WHERE id = $1 FOR UPDATE) old
           WHERE c.id = old.id
           RETURNING old.cover_key AS "previous?""#,
        id.0,
        key
    )
    .fetch_optional(db)
    .await?;
    Ok(row.and_then(|r| r.previous))
}

pub async fn get_collection(pool: &PgPool, id: CollectionId) -> Result<Option<CollectionRow>> {
    let row = sqlx::query_as!(
        CollectionRow,
        r#"SELECT id AS "id: CollectionId", name, description, public,
                  creator_id AS "creator_id: UserId", version, cover_key,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM collections WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// SQL `collection_listable` for one collection: the same rule the list
/// and search apply, so a direct read cannot show what they hide (UX-131).
pub async fn collection_listable(
    pool: &PgPool,
    id: CollectionId,
    viewer: UserId,
    see_all_courses: bool,
) -> Result<bool> {
    let listable = sqlx::query_scalar!(
        r#"SELECT collection_listable($1, $2, $3) AS "listable!""#,
        id.0,
        viewer.0,
        see_all_courses
    )
    .fetch_one(pool)
    .await?;
    Ok(listable)
}

/// `GET /collections` filters: `q` matches like `/search` over name and
/// description; `sort` is `newest` (default), `name` (A-Z) or `updated`.
pub struct CollectionFilter<'a> {
    pub q: Option<&'a str>,
    pub sort: &'a str,
}

/// A page of collections visible to `viewer`. `cursor` is the last row's
/// id; the keyset (`id`, `(name, id)` or `(updated_at, id)` by `sort`) is
/// resolved from it.
///
/// A collection with no course visible to the viewer - all invisible
/// (UX-119) or none attached (UX-127) - is omitted unless the viewer created
/// it or `see_all_courses`: SQL `collection_listable`, shared with
/// [`crate::search::search_collections`].
pub async fn list_collections(
    pool: &PgPool,
    viewer: Option<UserId>,
    see_all: bool,
    see_all_courses: bool,
    filter: &CollectionFilter<'_>,
    cursor: Option<CollectionId>,
    limit: i64,
) -> Result<Vec<CollectionRow>> {
    let patterns = crate::search::word_patterns(filter.q.unwrap_or(""));
    let rows = sqlx::query_as!(
        CollectionRow,
        r#"SELECT id AS "id: CollectionId", name, description, public,
                  creator_id AS "creator_id: UserId", version, cover_key,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM collections
           WHERE (public OR $1 OR creator_id = $2)
             AND collection_listable(id, $2, $5)
             AND search_matches(name || ' ' || description, $6, $7, $8)
             AND ($3::uuid IS NULL OR CASE $9::text
                   WHEN 'name'
                   THEN (name, id) > (SELECT c.name, c.id FROM collections c WHERE c.id = $3)
                   WHEN 'updated'
                   THEN (updated_at, id) < (SELECT c.updated_at, c.id FROM collections c WHERE c.id = $3)
                   ELSE id < $3
                 END)
           ORDER BY CASE WHEN $9::text = 'name' THEN name END ASC,
                    CASE WHEN $9::text = 'name' THEN id END ASC,
                    CASE WHEN $9::text = 'updated' THEN updated_at END DESC,
                    id DESC
           LIMIT $4"#,
        see_all,
        viewer.map(|v| v.0),
        cursor.map(|c| c.0),
        limit,
        see_all_courses,
        &patterns.words,
        &patterns.letters,
        &patterns.excluded,
        filter.sort
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Update the fields and, when given, replace the membership - one
/// transaction, so a failure leaves nothing half-written (BUG-192).
///
/// Every write bumps `version`; with `expected_version` it only lands while
/// the row still carries it (UX-279). `false` = gone or stale (nothing written).
pub async fn update_collection(
    tx: &mut sqlx::PgConnection,
    id: CollectionId,
    name: Option<&str>,
    description: Option<&str>,
    public: Option<bool>,
    course_ids: Option<&[CourseId]>,
    expected_version: Option<i32>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE collections SET
               name = COALESCE($2, name),
               description = COALESCE($3, description),
               public = COALESCE($4, public),
               version = version + 1
           WHERE id = $1 AND ($5::int IS NULL OR version = $5)"#,
        id.0,
        name,
        description,
        public,
        expected_version
    )
    .execute(&mut *tx)
    .await?;
    if updated.rows_affected() != 1 {
        return Ok(false);
    }
    if let Some(course_ids) = course_ids {
        set_collection_courses(tx, id, course_ids).await?;
    }
    Ok(true)
}

/// With `expected_version` it only deletes while the row is at that
/// version (UX-313, the update's `If-Match`). The cover upload the DELETE
/// returned is released in the same transaction.
pub async fn delete_collection(
    pool: &PgPool,
    id: CollectionId,
    expected_version: Option<i32>,
    grace_secs: f64,
) -> Result<bool> {
    let mut tx = pool.begin().await?;
    let deleted = sqlx::query!(
        r#"DELETE FROM collections WHERE id = $1 AND ($2::int IS NULL OR version = $2)
           RETURNING cover_key"#,
        id.0,
        expected_version
    )
    .fetch_optional(&mut *tx)
    .await?;
    let Some(row) = deleted else {
        return Ok(false);
    };
    if let Some(key) = row.cover_key {
        crate::uploads::release_reference_by_key(&mut *tx, &key, grace_secs).await?;
    }
    tx.commit().await?;
    Ok(true)
}

/// Replace the whole membership (legacy update semantics), positions 1..n.
async fn set_collection_courses(
    conn: &mut sqlx::PgConnection,
    id: CollectionId,
    course_ids: &[CourseId],
) -> Result<()> {
    sqlx::query!(
        "DELETE FROM collection_courses WHERE collection_id = $1",
        id.0
    )
    .execute(&mut *conn)
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
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// Member courses visible to `viewer`, in collection order. Archived
/// members are listed for the collection's creator and `see_all` only.
pub async fn list_collection_courses(
    pool: &PgPool,
    id: CollectionId,
    viewer: Option<UserId>,
    see_all: bool,
) -> Result<Vec<CourseRow>> {
    let rows = sqlx::query_as!(
        CourseRow,
        r#"SELECT c.id AS "id: CourseId", c.name, c.description, c.about, c.tags,
                  c.public, c.open_to_contributors, c.assessments_require_enrollment,
                  c.thumbnail_image_key AS thumbnail_key, c.learnings, c.thumbnail_video_key,
                  c.creator_id AS "creator_id: UserId",
                  (extract(epoch FROM c.archived_at))::bigint AS "archived_at?",
                  c.archived_by AS "archived_by: UserId",
                  c.version,
                  ARRAY(SELECT ra.user_id FROM resource_authors ra
                        WHERE ra.course_id = c.id AND ra.status = 'active'
                          AND ra.authorship <> 'reporter')
                      AS "contributor_ids!: Vec<UserId>",
                  ARRAY(SELECT ra.user_id FROM resource_authors ra
                        WHERE ra.course_id = c.id AND ra.status = 'active'
                          AND ra.authorship = 'maintainer')
                      AS "maintainer_ids!: Vec<UserId>",
                  (extract(epoch FROM c.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM c.updated_at))::bigint AS "updated_at!"
           FROM collection_courses cc
           JOIN courses c ON c.id = cc.course_id
           WHERE cc.collection_id = $1
             AND course_visible(c, $3, $2)
             AND (c.archived_at IS NULL OR $2
                  OR EXISTS (SELECT 1 FROM collections col
                             WHERE col.id = cc.collection_id AND col.creator_id = $3))
           ORDER BY cc.position, c.id"#,
        id.0,
        see_all,
        viewer.map(|v| v.0)
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
