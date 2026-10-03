//! `POST /courses/{id}/duplicate`: the row copies.
//!
//! All run on the caller's transaction. New ids come from the caller (`(old, new)` pairs), so one
//! statement per table copies every row and the caller keeps the mapping.

use ab_core::Result;
use ab_core::id::{CourseId, UserId};
use uuid::Uuid;

/// The course row as a private draft named `name`, owned by `creator`.
pub async fn copy_course(
    conn: &mut sqlx::PgConnection,
    source: CourseId,
    name: &str,
    creator: UserId,
) -> Result<CourseId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO courses (name, description, about, learnings, tags, thumbnail_type,
                                thumbnail_image_key, thumbnail_video_key, creator_id)
           SELECT $2, description, about, learnings, tags, thumbnail_type,
                  thumbnail_image_key, thumbnail_video_key, $3
           FROM courses WHERE id = $1
           RETURNING id"#,
        source.0,
        name,
        creator.0
    )
    .fetch_one(&mut *conn)
    .await?;
    Ok(CourseId(id))
}

pub struct SourceActivity {
    pub id: Uuid,
    pub chapter_id: Uuid,
    pub position: i32,
}

/// The source's chapter ids (in order) and activities.
pub async fn source_outline(
    conn: &mut sqlx::PgConnection,
    source: CourseId,
) -> Result<(Vec<Uuid>, Vec<SourceActivity>)> {
    let chapters = sqlx::query_scalar!(
        "SELECT id FROM chapters WHERE course_id = $1 ORDER BY position, id",
        source.0
    )
    .fetch_all(&mut *conn)
    .await?;
    let activities = sqlx::query_as!(
        SourceActivity,
        "SELECT id, chapter_id, position FROM activities WHERE course_id = $1 ORDER BY position, id",
        source.0
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok((chapters, activities))
}

pub async fn copy_chapters(
    conn: &mut sqlx::PgConnection,
    course: CourseId,
    creator: UserId,
    (old, new): (&[Uuid], &[Uuid]),
) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO chapters (id, course_id, name, description, thumbnail_key, position, creator_id)
           SELECT m.new_id, $1, c.name, c.description, c.thumbnail_key, c.position, $2
           FROM unnest($3::uuid[], $4::uuid[]) AS m(old_id, new_id)
           JOIN chapters c ON c.id = m.old_id"#,
        course.0,
        creator.0,
        old,
        new
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Plain activities as unpublished drafts, with their blocks (new ids; the
/// content's `block_uuid` references are rewritten to them) and file
/// submission configs (draft lifecycle).
pub async fn copy_activities(
    conn: &mut sqlx::PgConnection,
    course: CourseId,
    creator: UserId,
    (old, new, chapters): (&[Uuid], &[Uuid], &[Uuid]),
) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO activities (id, chapter_id, course_id, name, activity_type, activity_sub_type,
                                   content, details, settings, published, position, creator_id)
           SELECT m.new_id, m.chapter_id, $1, a.name, a.activity_type, a.activity_sub_type,
                  a.content, a.details, a.settings, false, a.position, $2
           FROM unnest($3::uuid[], $4::uuid[], $5::uuid[]) AS m(old_id, new_id, chapter_id)
           JOIN activities a ON a.id = m.old_id"#,
        course.0,
        creator.0,
        old,
        new,
        chapters
    )
    .execute(&mut *conn)
    .await?;
    let blocks = sqlx::query!(
        r#"SELECT b.id, b.legacy_uuid, m.new_id AS "activity_id!"
           FROM unnest($1::uuid[], $2::uuid[]) AS m(old_id, new_id)
           JOIN blocks b ON b.activity_id = m.old_id"#,
        old,
        new
    )
    .fetch_all(&mut *conn)
    .await?;
    for block in blocks {
        let new_block = Uuid::now_v7();
        sqlx::query!(
            r#"INSERT INTO blocks (id, activity_id, block_type, content, claimed)
               SELECT $2, $3, block_type, content, claimed FROM blocks WHERE id = $1"#,
            block.id,
            new_block,
            block.activity_id
        )
        .execute(&mut *conn)
        .await?;
        for reference in std::iter::once(block.id.to_string()).chain(block.legacy_uuid) {
            sqlx::query!(
                r#"UPDATE activities SET content = replace(content::text, $2, $3)::jsonb
                   WHERE id = $1"#,
                block.activity_id,
                format!("\"{reference}\""),
                format!("\"{new_block}\"")
            )
            .execute(&mut *conn)
            .await?;
        }
    }
    sqlx::query!(
        r#"INSERT INTO file_submissions (activity_id, course_id, instructions, rubric,
               allowed_mime_types, max_files, max_file_size_mb, due_at, allow_late,
               late_policy_kind, late_penalty_percent_per_day, late_penalty_max_days,
               late_cutoff_at, max_attempts, grade_release_mode, settings, creator_id)
           SELECT m.new_id, $1, f.instructions, f.rubric, f.allowed_mime_types, f.max_files,
                  f.max_file_size_mb, f.due_at, f.allow_late, f.late_policy_kind,
                  f.late_penalty_percent_per_day, f.late_penalty_max_days, f.late_cutoff_at,
                  f.max_attempts, f.grade_release_mode, f.settings, $2
           FROM unnest($3::uuid[], $4::uuid[]) AS m(old_id, new_id)
           JOIN file_submissions f ON f.activity_id = m.old_id"#,
        course.0,
        creator.0,
        old,
        new
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn set_activity_position(
    conn: &mut sqlx::PgConnection,
    id: Uuid,
    position: i32,
) -> Result<()> {
    sqlx::query!(
        "UPDATE activities SET position = $2 WHERE id = $1",
        id,
        position
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Shared media: one more reference per use in the copy on every upload
/// row whose references are counted (the course thumbnail, claimed
/// blocks), so the object lives while either course shows it.
pub async fn reference_shared_media(conn: &mut sqlx::PgConnection, course: CourseId) -> Result<()> {
    sqlx::query!(
        r#"WITH keys AS (
               SELECT thumbnail_image_key AS key FROM courses WHERE id = $1
               UNION ALL
               SELECT b.content->>'file_key' FROM blocks b
               JOIN activities a ON a.id = b.activity_id
               WHERE a.course_id = $1 AND b.claimed
           ), counted AS (
               SELECT key, count(*)::int AS n FROM keys WHERE key IS NOT NULL GROUP BY key
           )
           UPDATE uploads u
           SET referenced_count = u.referenced_count + c.n, expires_at = NULL
           FROM counted c
           WHERE u.key = c.key AND u.status = 'finalized'"#,
        course.0
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}
