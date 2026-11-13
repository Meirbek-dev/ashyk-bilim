//! Spreadsheet imports (`learning.assessment_imports`, docs/XLSX-TEST-IMPORT.md).

use ab_core::Result;
use ab_core::id::{AssessmentId, CourseId, UserId};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ImportRow {
    pub id: Uuid,
    pub course_id: CourseId,
    pub created_by: Option<UserId>,
    pub upload_id: Option<Uuid>,
    pub file_name: String,
    pub status: String,
    pub unescape_newlines: bool,
    pub sheet_name: Option<String>,
    pub parsed: Option<serde_json::Value>,
    pub issues: serde_json::Value,
    pub issues_truncated: i32,
    pub image_upload_ids: Vec<Uuid>,
    pub result_assessment_id: Option<AssessmentId>,
    pub created_at: i64,
    pub expires_at: i64,
}

pub struct NewImport<'a> {
    pub id: Uuid,
    pub course_id: CourseId,
    pub created_by: UserId,
    pub upload_id: Uuid,
    pub file_name: &'a str,
    pub file_sha256: &'a [u8],
    pub unescape_newlines: bool,
    pub ttl_secs: f64,
}

pub async fn insert_import<'e>(db: impl sqlx::PgExecutor<'e>, new: NewImport<'_>) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO assessment_imports
               (id, course_id, created_by, upload_id, file_name, file_sha256,
                unescape_newlines, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(secs => $8))"#,
        new.id,
        new.course_id.0,
        new.created_by.0,
        new.upload_id,
        new.file_name,
        new.file_sha256,
        new.unescape_newlines,
        new.ttl_secs
    )
    .execute(db)
    .await?;
    Ok(())
}

/// The parse result: `ready` or `invalid`, the plan, the issues and the
/// staged pictures (which replace any earlier parse's).
pub struct ParsedImport<'a> {
    pub status: &'a str,
    pub unescape_newlines: bool,
    pub sheet_name: &'a str,
    pub parsed: Option<&'a serde_json::Value>,
    pub issues: &'a serde_json::Value,
    pub issues_truncated: i32,
    pub image_upload_ids: &'a [Uuid],
}

pub async fn set_parsed<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: Uuid,
    p: ParsedImport<'_>,
) -> Result<()> {
    sqlx::query!(
        r#"UPDATE assessment_imports SET
               status = $2, unescape_newlines = $3, sheet_name = $4, parsed = $5,
               issues = $6, issues_truncated = $7, image_upload_ids = $8, parsed_at = now()
           WHERE id = $1"#,
        id,
        p.status,
        p.unescape_newlines,
        p.sheet_name,
        p.parsed,
        p.issues,
        p.issues_truncated,
        p.image_upload_ids
    )
    .execute(db)
    .await?;
    Ok(())
}

pub async fn get_import<'e>(db: impl sqlx::PgExecutor<'e>, id: Uuid) -> Result<Option<ImportRow>> {
    let row = sqlx::query_as!(
        ImportRow,
        r#"SELECT id, course_id AS "course_id: CourseId", created_by AS "created_by: UserId",
                  upload_id, file_name, status, unescape_newlines, sheet_name, parsed, issues,
                  issues_truncated, image_upload_ids,
                  result_assessment_id AS "result_assessment_id: AssessmentId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM expires_at))::bigint AS "expires_at!"
           FROM assessment_imports WHERE id = $1"#,
        id
    )
    .fetch_optional(db)
    .await?;
    Ok(row)
}

/// [`get_import`] under `FOR UPDATE` (commit, re-parse and discard serialize).
pub async fn lock_import(conn: &mut sqlx::PgConnection, id: Uuid) -> Result<Option<ImportRow>> {
    sqlx::query!(
        "SELECT id FROM assessment_imports WHERE id = $1 FOR UPDATE",
        id
    )
    .fetch_optional(&mut *conn)
    .await?;
    get_import(conn, id).await
}

/// Committed: the record stays `keep_secs` (the audit event keeps the rest).
pub async fn mark_committed<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: Uuid,
    assessment_id: AssessmentId,
    keep_secs: f64,
) -> Result<()> {
    sqlx::query!(
        r#"UPDATE assessment_imports SET
               status = 'committed', result_assessment_id = $2, committed_at = now(),
               expires_at = now() + make_interval(secs => $3)
           WHERE id = $1"#,
        id,
        assessment_id.0,
        keep_secs
    )
    .execute(db)
    .await?;
    Ok(())
}

pub async fn delete_import(conn: &mut sqlx::PgConnection, id: Uuid) -> Result<()> {
    sqlx::query!("DELETE FROM assessment_imports WHERE id = $1", id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// Imports past `expires_at`, oldest first (at most `limit`).
pub async fn expired(pool: &PgPool, limit: i64) -> Result<Vec<Uuid>> {
    let ids = sqlx::query_scalar!(
        r#"SELECT id FROM assessment_imports WHERE expires_at < now()
           ORDER BY expires_at LIMIT $1"#,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(ids)
}
