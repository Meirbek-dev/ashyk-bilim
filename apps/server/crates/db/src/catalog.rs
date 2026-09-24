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
    /// Storage key of the `course-thumbnail` upload (`/content/<key>`).
    pub thumbnail_key: Option<String>,
    pub creator_id: Option<UserId>,
    /// Active `resource_authors` rows that write (maintainer / contributor);
    /// reporters are read-only and not listed.
    pub contributor_ids: Vec<UserId>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl CourseRow {
    /// The ONE authoring predicate: the creator, or an active maintainer /
    /// contributor. Authorship IS the `:own` scope for every course-scoped
    /// write (DECISIONS 2026-09-12 "author on the course like the creator").
    #[must_use]
    pub fn is_author(&self, user_id: UserId) -> bool {
        self.creator_id == Some(user_id) || self.contributor_ids.contains(&user_id)
    }
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
                  public, open_to_contributors, thumbnail_image_key AS thumbnail_key,
                  creator_id AS "creator_id: UserId",
                  ARRAY(SELECT ra.user_id FROM resource_authors ra
                        WHERE ra.course_id = courses.id AND ra.status = 'active'
                          AND ra.authorship <> 'reporter')
                      AS "contributor_ids!: Vec<UserId>",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM courses WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Can `viewer` see this one course? (SQL `course_visible`, BUG-190.)
///
/// Public / `see_all` / creator / active resource author (reporters
/// included) / linked-usergroup member. Unknown course = false.
pub async fn course_visible(
    pool: &PgPool,
    id: CourseId,
    viewer: Option<UserId>,
    see_all: bool,
) -> Result<bool> {
    let visible = sqlx::query_scalar!(
        r#"SELECT course_visible(courses, $2, $3) AS "visible!"
           FROM courses WHERE id = $1"#,
        id.0,
        viewer.map(|v| v.0),
        see_all
    )
    .fetch_optional(pool)
    .await?;
    Ok(visible.unwrap_or(false))
}

/// Listing filters for `list_courses` (`GET /courses`).
#[derive(Debug, Default, Clone)]
pub struct CourseFilter<'a> {
    pub viewer: Option<UserId>,
    /// Platform-wide managers: see private courses and, with `mine`, every course.
    pub see_all: bool,
    /// Only courses the viewer may edit (creator / active contributor / `see_all`).
    pub mine: bool,
    /// Case-insensitive substring over name + description.
    pub q: Option<&'a str>,
    /// `name` (ascending) or anything else = `updated_at` descending.
    pub sort: &'a str,
    /// `drafts` | `published` | `recent` | `attention` | anything else = all.
    pub preset: &'a str,
}

/// One page of the catalogue as `viewer` sees it.
///
/// Visible: SQL `course_visible` (BUG-190) — public courses, their own,
/// courses they actively co-author, and courses reached through a linked
/// usergroup (cohort access); shared with search and collections. `cursor` = id
/// of the last row from the previous page; the keyset is `(updated_at, id)`
/// or `(name, id)` depending on `sort`, resolved from that id so the cursor
/// stays a plain course id.
pub async fn list_courses(
    pool: &PgPool,
    filter: &CourseFilter<'_>,
    cursor: Option<CourseId>,
    limit: i64,
) -> Result<Vec<CourseRow>> {
    let by_name = filter.sort == "name";
    // UX-143: `q` is a literal substring — escape the LIKE metacharacters.
    let pattern = filter.q.map(|q| format!("%{}%", crate::like_escape(q)));
    let rows = sqlx::query_as!(
        CourseRow,
        r#"SELECT id AS "id: CourseId", name, description, about, tags,
                  public, open_to_contributors, thumbnail_image_key AS thumbnail_key,
                  creator_id AS "creator_id: UserId",
                  ARRAY(SELECT ra.user_id FROM resource_authors ra
                        WHERE ra.course_id = courses.id AND ra.status = 'active'
                          AND ra.authorship <> 'reporter')
                      AS "contributor_ids!: Vec<UserId>",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM courses
           WHERE course_visible(courses, $2, $1)
             AND (NOT $5 OR $1 OR creator_id = $2
                  OR EXISTS (SELECT 1 FROM resource_authors ra
                             WHERE ra.course_id = courses.id AND ra.user_id = $2
                               AND ra.status = 'active' AND ra.authorship <> 'reporter'))
             AND ($6::text IS NULL OR name ILIKE $6 ESCAPE '\' OR description ILIKE $6 ESCAPE '\')
             AND CASE $7::text
                   WHEN 'drafts' THEN NOT public
                   WHEN 'published' THEN public
                   WHEN 'recent' THEN updated_at > now() - interval '7 days'
                   WHEN 'attention' THEN
                     (public AND NOT EXISTS (SELECT 1 FROM activities a
                                             WHERE a.course_id = courses.id AND a.published))
                     OR (NOT public AND created_at < now() - interval '30 days')
                   ELSE true
                 END
             AND ($3::uuid IS NULL OR CASE WHEN $8::bool
                   THEN (name, id) > (SELECT c.name, c.id FROM courses c WHERE c.id = $3)
                   ELSE (updated_at, id) < (SELECT c.updated_at, c.id FROM courses c WHERE c.id = $3)
                 END)
           ORDER BY CASE WHEN $8 THEN name END ASC,
                    CASE WHEN $8 THEN id END ASC,
                    CASE WHEN NOT $8 THEN updated_at END DESC,
                    id DESC
           LIMIT $4"#,
        filter.see_all,
        filter.viewer.map(|v| v.0),
        cursor.map(|c| c.0),
        limit,
        filter.mine,
        pattern,
        filter.preset,
        by_name
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Counts over the editable set (`mine`), ignoring `q`/`preset`/paging.
pub struct CourseSummaryRow {
    pub total: i64,
    pub ready: i64,
    pub private: i64,
    pub attention: i64,
}

pub async fn summarize_courses(
    pool: &PgPool,
    viewer: UserId,
    see_all: bool,
) -> Result<CourseSummaryRow> {
    let row = sqlx::query_as!(
        CourseSummaryRow,
        r#"SELECT count(*) AS "total!",
                  count(*) FILTER (WHERE public) AS "ready!",
                  count(*) FILTER (WHERE NOT public) AS "private!",
                  count(*) FILTER (WHERE
                     (public AND NOT EXISTS (SELECT 1 FROM activities a
                                             WHERE a.course_id = courses.id AND a.published))
                     OR (NOT public AND created_at < now() - interval '30 days')) AS "attention!"
           FROM courses
           WHERE $1 OR creator_id = $2
              OR EXISTS (SELECT 1 FROM resource_authors ra
                         WHERE ra.course_id = courses.id AND ra.user_id = $2
                           AND ra.status = 'active' AND ra.authorship <> 'reporter')"#,
        see_all,
        viewer.0
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}

/// Newest-first page of courses `user` created or actively co-authors.
///
/// As `viewer` sees them (SQL `course_visible`, BUG-190 — the profile is
/// not a sixth rule, UX-133).
pub async fn list_user_courses(
    pool: &PgPool,
    user: UserId,
    viewer: UserId,
    see_all: bool,
    cursor: Option<CourseId>,
    limit: i64,
) -> Result<Vec<CourseRow>> {
    let rows = sqlx::query_as!(
        CourseRow,
        r#"SELECT id AS "id: CourseId", name, description, about, tags,
                  public, open_to_contributors, thumbnail_image_key AS thumbnail_key,
                  creator_id AS "creator_id: UserId",
                  ARRAY(SELECT ra.user_id FROM resource_authors ra
                        WHERE ra.course_id = courses.id AND ra.status = 'active'
                          AND ra.authorship <> 'reporter')
                      AS "contributor_ids!: Vec<UserId>",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM courses
           WHERE (creator_id = $1
                  OR EXISTS (SELECT 1 FROM resource_authors ra
                             WHERE ra.course_id = courses.id AND ra.user_id = $1
                               AND ra.status = 'active' AND ra.authorship <> 'reporter'))
             AND course_visible(courses, $2, $5)
             AND ($3::uuid IS NULL OR id < $3)
           ORDER BY id DESC
           LIMIT $4"#,
        user.0,
        viewer.0,
        cursor.map(|c| c.0),
        limit,
        see_all
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

pub async fn update_course<'e>(
    db: impl sqlx::PgExecutor<'e>,
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
                  public, open_to_contributors, thumbnail_image_key AS thumbnail_key,
                  creator_id AS "creator_id: UserId",
                  ARRAY(SELECT ra.user_id FROM resource_authors ra
                        WHERE ra.course_id = courses.id AND ra.status = 'active'
                          AND ra.authorship <> 'reporter')
                      AS "contributor_ids!: Vec<UserId>",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!""#,
        id.0,
        changes.name,
        changes.description,
        changes.about,
        changes.tags,
        changes.open_to_contributors
    )
    .fetch_optional(db)
    .await?;
    Ok(row)
}

/// Set or clear (`None`) the thumbnail; returns the key it replaced.
///
/// The caller releases exactly that upload (UX-143: two concurrent PATCHes
/// each released the key they had read, leaking the loser's). BUG-255: the
/// old key is read under the row lock, not from the statement snapshot.
pub async fn set_course_thumbnail<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: CourseId,
    key: Option<&str>,
) -> Result<Option<String>> {
    let row = sqlx::query!(
        r#"UPDATE courses c SET thumbnail_image_key = $2
           FROM (SELECT id, thumbnail_image_key FROM courses WHERE id = $1 FOR UPDATE) old
           WHERE c.id = old.id
           RETURNING old.thumbnail_image_key AS "previous?""#,
        id.0,
        key
    )
    .fetch_optional(db)
    .await?;
    Ok(row.and_then(|r| r.previous))
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

/// Delete a course and release every upload it owns.
///
/// Its thumbnail and the media blocks under it re-enter the reaper's queue
/// after `grace_secs` (BUG-209: the FK cascade drops rows, not
/// `referenced_count`s).
///
/// BUG-242: lock order course → chapters → activities → uploads (the order
/// every block/upload write uses). With every activity locked no block can
/// be added or removed under the delete, and the release counts exactly the
/// block rows the DELETE returned.
pub async fn delete_course(pool: &PgPool, id: CourseId, grace_secs: f64) -> Result<bool> {
    let mut tx = pool.begin().await?;
    let Some(thumbnail) = sqlx::query_scalar!(
        "SELECT thumbnail_image_key FROM courses WHERE id = $1 FOR UPDATE",
        id.0
    )
    .fetch_optional(&mut *tx)
    .await?
    else {
        return Ok(false);
    };
    sqlx::query_scalar!(
        "SELECT id FROM chapters WHERE course_id = $1 ORDER BY id FOR UPDATE",
        id.0
    )
    .fetch_all(&mut *tx)
    .await?;
    let activities = sqlx::query_scalar!(
        "SELECT id FROM activities WHERE course_id = $1 ORDER BY id FOR UPDATE",
        id.0
    )
    .fetch_all(&mut *tx)
    .await?;
    crate::file_submissions::delete_files_releasing(&mut tx, &activities, grace_secs).await?;
    delete_blocks_releasing(&mut tx, &activities, None, grace_secs).await?;
    if let Some(key) = thumbnail {
        crate::uploads::release_reference_by_key(&mut *tx, &key, grace_secs).await?;
    }
    let deleted = sqlx::query!("DELETE FROM courses WHERE id = $1", id.0)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(deleted.rows_affected() == 1)
}

/// Delete the blocks of locked activities (all, or only `block_id`).
///
/// One upload reference is released per block row the DELETE actually
/// returned (BUG-242/244: never from a snapshot read before it). Callers
/// lock the activity rows first (activity → upload, BUG-243). Returns the
/// number of blocks deleted.
pub async fn delete_blocks_releasing(
    conn: &mut sqlx::PgConnection,
    activity_ids: &[uuid::Uuid],
    block_id: Option<BlockId>,
    grace_secs: f64,
) -> Result<u64> {
    // Upload rows are locked in key order first, so two cascades sharing
    // uploads never take them in opposite orders (the activity locks the
    // caller holds keep new blocks out of this set).
    sqlx::query!(
        r#"SELECT u.key FROM uploads u
           WHERE u.key IN (SELECT content->>'file_key' FROM blocks
                           WHERE activity_id = ANY($1) AND ($2::uuid IS NULL OR id = $2))
           ORDER BY u.key FOR UPDATE"#,
        activity_ids,
        block_id.map(|b| b.0),
    )
    .fetch_all(&mut *conn)
    .await?;
    let deleted = sqlx::query_scalar!(
        r#"WITH gone AS (
               DELETE FROM blocks
               WHERE activity_id = ANY($1) AND ($2::uuid IS NULL OR id = $2)
               RETURNING content->>'file_key' AS key, claimed
           ), refs AS (
               SELECT key, count(*)::int AS n FROM gone
               WHERE key IS NOT NULL AND claimed GROUP BY key
           ), released AS (
               UPDATE uploads u
               SET referenced_count = greatest(u.referenced_count - refs.n, 0),
                   expires_at = CASE WHEN u.referenced_count <= refs.n
                                     THEN now() + make_interval(secs => $3)
                                     ELSE u.expires_at END
               FROM refs WHERE u.key = refs.key AND u.referenced_count > 0
           )
           SELECT count(*) AS "n!" FROM gone"#,
        activity_ids,
        block_id.map(|b| b.0),
        grace_secs
    )
    .fetch_one(conn)
    .await?;
    Ok(u64::try_from(deleted).unwrap_or(0))
}

/// BUG-263: re-derive which blocks of a `dynamic` activity hold their upload.
///
/// The content just saved decides (`block_uuid` anywhere in the tiptap
/// JSON, v2 id or migrated legacy uuid). A block that left the
/// content releases its upload (grace clock starts), one that came back —
/// an undo saved after the removal — re-claims it if it still exists.
/// The caller holds the activity row (the content UPDATE), so the upload
/// locks follow the activity → uploads order (BUG-243), in key order.
pub async fn sync_block_claims(
    conn: &mut sqlx::PgConnection,
    activity_id: ActivityId,
    grace_secs: f64,
) -> Result<()> {
    sqlx::query!(
        r#"SELECT u.id FROM uploads u
           WHERE u.key IN (SELECT content->>'file_key' FROM blocks WHERE activity_id = $1)
           ORDER BY u.key FOR NO KEY UPDATE"#,
        activity_id.0,
    )
    .fetch_all(&mut *conn)
    .await?;
    sqlx::query!(
        r#"WITH present AS (
               SELECT DISTINCT v #>> '{}' AS id
               FROM activities a, jsonb_path_query(a.content, 'lax $.**.block_uuid') v
               WHERE a.id = $1
           ), flipped AS (
               UPDATE blocks b SET claimed = NOT b.claimed
               WHERE b.activity_id = $1
                 AND b.claimed <> EXISTS (SELECT 1 FROM present p
                                          WHERE p.id = b.id::text OR p.id = b.legacy_uuid)
               RETURNING b.claimed, b.content->>'file_key' AS key
           ), deltas AS (
               SELECT key, sum(CASE WHEN claimed THEN 1 ELSE -1 END)::int AS d
               FROM flipped WHERE key IS NOT NULL GROUP BY key
           )
           UPDATE uploads u
           SET referenced_count = greatest(u.referenced_count + d.d, 0),
               expires_at = CASE WHEN d.d > 0 THEN NULL
                                 WHEN u.referenced_count + d.d <= 0
                                 THEN now() + make_interval(secs => $2)
                                 ELSE u.expires_at END
           FROM deltas d
           WHERE u.key = d.key
             AND ((d.d < 0 AND u.referenced_count > 0)
                  OR (d.d > 0 AND u.status = 'finalized'))"#,
        activity_id.0,
        grace_secs
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Lock an activity row against deletion for a block write (BUG-243: the
/// activity is always locked before any upload row). `false` if it is gone.
pub async fn lock_activity_for_blocks(
    conn: &mut sqlx::PgConnection,
    id: ActivityId,
) -> Result<bool> {
    let row = sqlx::query_scalar!("SELECT id FROM activities WHERE id = $1 FOR SHARE", id.0)
        .fetch_optional(conn)
        .await?;
    Ok(row.is_some())
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

/// Delete a chapter, releasing the uploads of the media blocks under it
/// (BUG-209/242 — see [`delete_course`]; lock order chapter → activities →
/// uploads).
pub async fn delete_chapter(pool: &PgPool, id: ChapterId, grace_secs: f64) -> Result<bool> {
    let mut tx = pool.begin().await?;
    sqlx::query_scalar!("SELECT id FROM chapters WHERE id = $1 FOR UPDATE", id.0)
        .fetch_optional(&mut *tx)
        .await?;
    let activities = sqlx::query_scalar!(
        "SELECT id FROM activities WHERE chapter_id = $1 ORDER BY id FOR UPDATE",
        id.0
    )
    .fetch_all(&mut *tx)
    .await?;
    crate::file_submissions::delete_files_releasing(&mut tx, &activities, grace_secs).await?;
    delete_blocks_releasing(&mut tx, &activities, None, grace_secs).await?;
    let deleted = sqlx::query!("DELETE FROM chapters WHERE id = $1", id.0)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
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
    /// Bumped by every content/details/settings write; the editor's `If-Match`.
    pub version: i32,
}

pub async fn insert_activity<'e>(
    db: impl sqlx::PgExecutor<'e>,
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
    .fetch_one(db)
    .await?;
    Ok(ActivityId(id))
}

pub async fn get_activity<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: ActivityId,
) -> Result<Option<ActivityRow>> {
    let row = sqlx::query_as!(
        ActivityRow,
        r#"SELECT id AS "id: ActivityId", chapter_id AS "chapter_id: ChapterId",
                  course_id AS "course_id: CourseId", name,
                  activity_type, activity_sub_type, published, position, version
           FROM activities WHERE id = $1"#,
        id.0
    )
    .fetch_optional(db)
    .await?;
    Ok(row)
}

pub async fn list_activities<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
) -> Result<Vec<ActivityRow>> {
    let rows = sqlx::query_as!(
        ActivityRow,
        r#"SELECT id AS "id: ActivityId", chapter_id AS "chapter_id: ChapterId",
                  course_id AS "course_id: CourseId", name,
                  activity_type, activity_sub_type, published, position, version
           FROM activities WHERE course_id = $1
           ORDER BY chapter_id, position, id"#,
        course_id.0
    )
    .fetch_all(db)
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

pub async fn update_activity<'e>(
    db: impl sqlx::PgExecutor<'e>,
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
    .execute(db)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Delete an activity, releasing the uploads of its media blocks
/// (BUG-209/243 — see [`delete_course`]; lock order activity → uploads).
pub async fn delete_activity(pool: &PgPool, id: ActivityId, grace_secs: f64) -> Result<bool> {
    let mut tx = pool.begin().await?;
    let Some(locked) =
        sqlx::query_scalar!("SELECT id FROM activities WHERE id = $1 FOR UPDATE", id.0)
            .fetch_optional(&mut *tx)
            .await?
    else {
        return Ok(false);
    };
    crate::file_submissions::delete_files_releasing(&mut tx, &[locked], grace_secs).await?;
    delete_blocks_releasing(&mut tx, &[locked], None, grace_secs).await?;
    let deleted = sqlx::query!("DELETE FROM activities WHERE id = $1", id.0)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
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

/// Writes only when `expected_version` is `None` or matches; `false` means a
/// stale version (the caller answers 412). Every write bumps `version`.
pub async fn update_activity_content<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: ActivityId,
    content: Option<&serde_json::Value>,
    details: Option<&serde_json::Value>,
    settings: Option<&serde_json::Value>,
    expected_version: Option<i32>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE activities SET
               content = COALESCE($2, content),
               details = COALESCE($3, details),
               settings = COALESCE($4, settings),
               version = version + 1
           WHERE id = $1 AND ($5::int IS NULL OR version = $5)"#,
        id.0,
        content,
        details,
        settings,
        expected_version
    )
    .execute(db)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Change the type pair together — the DB CHECK enforces validity.
pub async fn set_activity_type<'e>(
    db: impl sqlx::PgExecutor<'e>,
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
    .execute(db)
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

pub async fn insert_block<'e>(
    db: impl sqlx::PgExecutor<'e>,
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
    .fetch_one(db)
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

// ── Contributors (`resource_authors`, course target) ────────────────────────

/// One roster row joined with the user. The creator is not stored — the
/// service synthesizes it from `courses.creator_id`.
#[derive(Debug, Clone)]
pub struct ContributorRow {
    pub user_id: UserId,
    pub username: String,
    pub display_name: String,
    pub avatar_key: Option<String>,
    pub role: String,
    pub status: String,
    pub created_at: i64,
}

pub async fn list_contributors(pool: &PgPool, course_id: CourseId) -> Result<Vec<ContributorRow>> {
    let rows = sqlx::query_as!(
        ContributorRow,
        r#"SELECT ra.user_id AS "user_id: UserId", u.username, u.display_name, u.avatar_key,
                  ra.authorship AS role, ra.status,
                  (extract(epoch FROM ra.created_at))::bigint AS "created_at!"
           FROM resource_authors ra JOIN users u ON u.id = ra.user_id
           WHERE ra.course_id = $1 AND ra.authorship <> 'creator'
           ORDER BY ra.created_at, ra.user_id"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// The creator synthesized as a `creator/active` roster row (`None` when the
/// creator account is gone).
pub async fn creator_row(pool: &PgPool, course_id: CourseId) -> Result<Option<ContributorRow>> {
    let row = sqlx::query_as!(
        ContributorRow,
        r#"SELECT u.id AS "user_id: UserId", u.username, u.display_name, u.avatar_key,
                  'creator' AS "role!", 'active' AS "status!",
                  (extract(epoch FROM c.created_at))::bigint AS "created_at!"
           FROM courses c JOIN users u ON u.id = c.creator_id
           WHERE c.id = $1"#,
        course_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn get_contributor(
    pool: &PgPool,
    course_id: CourseId,
    user_id: UserId,
) -> Result<Option<ContributorRow>> {
    let row = sqlx::query_as!(
        ContributorRow,
        r#"SELECT ra.user_id AS "user_id: UserId", u.username, u.display_name, u.avatar_key,
                  ra.authorship AS role, ra.status,
                  (extract(epoch FROM ra.created_at))::bigint AS "created_at!"
           FROM resource_authors ra JOIN users u ON u.id = ra.user_id
           WHERE ra.course_id = $1 AND ra.user_id = $2"#,
        course_id.0,
        user_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Insert; `false` when the user already has a row on this course.
pub async fn insert_contributor(
    pool: &PgPool,
    course_id: CourseId,
    user_id: UserId,
    role: &str,
    status: &str,
) -> Result<bool> {
    let inserted = sqlx::query!(
        r#"INSERT INTO resource_authors (course_id, user_id, authorship, status)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (course_id, collection_id, user_id) DO NOTHING"#,
        course_id.0,
        user_id.0,
        role,
        status
    )
    .execute(pool)
    .await?;
    Ok(inserted.rows_affected() == 1)
}

pub async fn update_contributor(
    pool: &PgPool,
    course_id: CourseId,
    user_id: UserId,
    role: Option<&str>,
    status: Option<&str>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE resource_authors SET
               authorship = COALESCE($3, authorship),
               status = COALESCE($4, status)
           WHERE course_id = $1 AND user_id = $2"#,
        course_id.0,
        user_id.0,
        role,
        status
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

pub async fn delete_contributor(
    pool: &PgPool,
    course_id: CourseId,
    user_id: UserId,
) -> Result<bool> {
    let deleted = sqlx::query!(
        "DELETE FROM resource_authors WHERE course_id = $1 AND user_id = $2",
        course_id.0,
        user_id.0
    )
    .execute(pool)
    .await?;
    Ok(deleted.rows_affected() == 1)
}
