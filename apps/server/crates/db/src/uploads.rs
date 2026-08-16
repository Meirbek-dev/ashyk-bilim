//! Upload-ledger queries (compile-checked).

use ab_core::Result;
use ab_core::id::UserId;
use sqlx::PgPool;
use uuid::Uuid;

pub struct UploadRow {
    pub id: Uuid,
    pub created_by: UserId,
    pub purpose: String,
    pub bucket: String,
    pub key: String,
    pub mime: String,
    pub size_bytes: i64,
    pub status: String,
}

pub struct NewUpload<'a> {
    pub created_by: UserId,
    pub purpose: &'a str,
    pub bucket: &'a str,
    pub key: &'a str,
    pub mime: &'a str,
    pub size_bytes: i64,
    pub claim_window_secs: f64,
}

pub async fn insert_upload(pool: &PgPool, new: NewUpload<'_>) -> Result<Uuid> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO uploads (created_by, purpose, bucket, key, mime, size_bytes, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7))
           RETURNING id"#,
        new.created_by.0,
        new.purpose,
        new.bucket,
        new.key,
        new.mime,
        new.size_bytes,
        new.claim_window_secs
    )
    .fetch_one(pool)
    .await?;
    Ok(id)
}

pub async fn get_upload(pool: &PgPool, id: Uuid) -> Result<Option<UploadRow>> {
    let row = sqlx::query_as!(
        UploadRow,
        r#"SELECT id, created_by AS "created_by: UserId", purpose, bucket, key,
                  mime, size_bytes, status
           FROM uploads WHERE id = $1"#,
        id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Transition pending → finalized with the verified size; starts the
/// unreferenced-grace clock. Returns false if it was not pending.
pub async fn mark_finalized(
    pool: &PgPool,
    id: Uuid,
    actual_size: i64,
    grace_secs: f64,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE uploads
           SET status = 'finalized', size_bytes = $2,
               expires_at = now() + make_interval(secs => $3)
           WHERE id = $1 AND status = 'pending'"#,
        id,
        actual_size,
        grace_secs
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Claim a reference to a finalized upload (clears the reaper clock).
pub async fn add_reference(pool: &PgPool, id: Uuid) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE uploads
           SET referenced_count = referenced_count + 1, expires_at = NULL
           WHERE id = $1 AND status = 'finalized'"#,
        id
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

pub struct ReapedUpload {
    pub bucket: String,
    pub key: String,
}

/// Delete expired pending rows and expired unreferenced finalized rows;
/// returns the object locations for storage-side deletion.
pub async fn reap_expired(pool: &PgPool) -> Result<Vec<ReapedUpload>> {
    let rows = sqlx::query_as!(
        ReapedUpload,
        r#"DELETE FROM uploads
           WHERE expires_at IS NOT NULL AND expires_at < now()
             AND (status = 'pending'
                  OR (status = 'finalized' AND referenced_count = 0))
           RETURNING bucket, key"#
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
