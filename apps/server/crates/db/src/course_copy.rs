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
        r#"WITH course AS (
               INSERT INTO courses (name, description, about, learnings, tags, thumbnail_kind,
                                    thumbnail_image_key, thumbnail_video_key)
               SELECT $2, description, about, learnings, tags, thumbnail_kind,
                      thumbnail_image_key, thumbnail_video_key
               FROM courses WHERE id = $1
               RETURNING id),
           roster AS (INSERT INTO course_staff (course_id, user_id, authorship, status)
                      SELECT id, $3::uuid, 'creator', 'active' FROM course)
           SELECT id AS "id!" FROM course"#,
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
        r#"INSERT INTO chapters (id, course_id, name, description, thumbnail_key, position, created_by)
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
        r#"INSERT INTO activities (id, chapter_id, course_id, name, kind, sub_kind,
                                   content, details, settings, published, position, created_by)
           SELECT m.new_id, m.chapter_id, $1, a.name, a.kind, a.sub_kind,
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
        let new_block = sqlx::query_scalar!(
            r#"INSERT INTO blocks (activity_id, kind, content, claimed)
               SELECT $2, kind, content, claimed FROM blocks WHERE id = $1
               RETURNING id"#,
            block.id,
            block.activity_id
        )
        .fetch_one(&mut *conn)
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
    // A file task is an assessment and its file body under one id (`file_submissions::insert_file_submission`),
    // its first version the source's current policy.
    let copies = sqlx::query!(
        r#"WITH a AS (
               INSERT INTO assessments (activity_id, course_id, created_by)
               SELECT m.new_id, $1, $2
               FROM unnest($3::uuid[], $4::uuid[]) AS m(old_id, new_id)
               JOIN file_submissions f ON f.activity_id = m.old_id
               RETURNING id, activity_id)
           INSERT INTO file_submissions (id, activity_id, course_id, instructions, rubric,
               allowed_mime_types, max_files, max_file_size_mb, settings)
           SELECT a.id, a.activity_id, $1, f.instructions, f.rubric, f.allowed_mime_types, f.max_files,
                  f.max_file_size_mb, f.settings
           FROM a
           JOIN unnest($3::uuid[], $4::uuid[]) AS m(old_id, new_id) ON m.new_id = a.activity_id
           JOIN file_submissions f ON f.activity_id = m.old_id
           RETURNING id, (SELECT s.id FROM file_submissions s
                          JOIN unnest($3::uuid[], $4::uuid[]) AS m(old_id, new_id) ON s.activity_id = m.old_id
                          WHERE m.new_id = file_submissions.activity_id) AS "source!""#,
        course.0,
        creator.0,
        old,
        new
    )
    .fetch_all(&mut *conn)
    .await?;
    for copy in copies {
        sqlx::query!(
            r#"SELECT assessment_version_save(
                   $1, (SELECT v.policy FROM assessments s
                        JOIN assessment_versions v ON v.id = s.current_version_id WHERE s.id = $2))"#,
            copy.id,
            copy.source
        )
        .fetch_one(&mut *conn)
        .await?;
    }
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

/// Take the uploads a copied course shares off the reaper clock.
///
/// The copy names the source's uploads (thumbnails, claimed blocks) through
/// its own upload keys, which hold them while either course shows them
/// (`upload_referenced`); a shared upload whose clock was running stops it.
pub async fn reference_shared_media(conn: &mut sqlx::PgConnection, course: CourseId) -> Result<()> {
    sqlx::query!(
        r#"UPDATE uploads u SET expires_at = NULL
           WHERE u.status = 'finalized' AND u.expires_at IS NOT NULL
             AND u.id IN (SELECT thumbnail_image_upload_id FROM courses WHERE id = $1
                          UNION ALL
                          SELECT thumbnail_video_upload_id FROM courses WHERE id = $1
                          UNION ALL
                          SELECT thumbnail_upload_id FROM chapters WHERE course_id = $1
                          UNION ALL
                          SELECT bu.upload_id FROM block_uploads bu
                          JOIN blocks b ON b.id = bu.block_id
                          JOIN activities a ON a.id = b.activity_id
                          WHERE a.course_id = $1)"#,
        course.0
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}
