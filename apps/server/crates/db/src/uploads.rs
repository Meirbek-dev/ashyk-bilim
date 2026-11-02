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
    pub multipart_id: Option<String>,
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

pub async fn get_upload<'e>(db: impl sqlx::PgExecutor<'e>, id: Uuid) -> Result<Option<UploadRow>> {
    let row = sqlx::query_as!(
        UploadRow,
        r#"SELECT id, created_by AS "created_by: UserId", purpose, bucket, key,
                  mime, size_bytes, status, multipart_id
           FROM uploads WHERE id = $1"#,
        id
    )
    .fetch_optional(db)
    .await?;
    Ok(row)
}

/// Transition pending → finalized with the verified size; starts the
/// unreferenced-grace clock. Returns false if it was not pending.
pub async fn mark_finalized<'e>(
    db: impl sqlx::PgExecutor<'e>,
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
    .execute(db)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Claim a finalized upload for a row that names it (clears the reaper clock).
///
/// What holds the upload is the row's upload key (`upload_referenced`, schema
/// review item 18); the claim only takes it off the clock and checks that it is
/// finalized. `false` when it is not.
pub async fn add_reference<'e>(db: impl sqlx::PgExecutor<'e>, id: Uuid) -> Result<bool> {
    let updated = sqlx::query!(
        "UPDATE uploads SET expires_at = NULL WHERE id = $1 AND status = 'finalized'",
        id
    )
    .execute(db)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Row-lock uploads in key order.
///
/// The one order every multi-upload reference move takes (BUG-242/258), so
/// two writers sharing uploads never lock them in opposite orders. `NO KEY UPDATE`: what the clock UPDATEs
/// take anyway; FK checks from file rows are not blocked.
pub async fn lock_in_key_order(conn: &mut sqlx::PgConnection, ids: &[Uuid]) -> Result<()> {
    sqlx::query!(
        "SELECT id FROM uploads WHERE id = ANY($1) ORDER BY key FOR NO KEY UPDATE",
        ids
    )
    .fetch_all(conn)
    .await?;
    Ok(())
}

/// [`release_reference`] addressed by storage key (keys are UNIQUE) - used
/// when only the key was persisted, e.g. replacing platform branding.
pub async fn release_reference_by_key<'e>(
    db: impl sqlx::PgExecutor<'e>,
    key: &str,
    grace_secs: f64,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE uploads SET expires_at = now() + make_interval(secs => $2)
           WHERE key = $1 AND status = 'finalized' AND NOT upload_referenced(id)"#,
        key,
        grace_secs
    )
    .execute(db)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Start the grace clock of an upload no row names any more.
///
/// When no row names it (`upload_referenced`), the reaper eventually collects
/// the object. Call it after the write that dropped the reference, in the
/// same transaction. `true` when the clock started.
pub async fn release_reference<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: Uuid,
    grace_secs: f64,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE uploads SET expires_at = now() + make_interval(secs => $2)
           WHERE id = $1 AND status = 'finalized' AND NOT upload_referenced(id)"#,
        id,
        grace_secs
    )
    .execute(db)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// [`release_reference`] for several uploads (locked in key order first).
/// Returns how many started their clock.
pub async fn release_references(
    conn: &mut sqlx::PgConnection,
    ids: &[Uuid],
    grace_secs: f64,
) -> Result<u64> {
    if ids.is_empty() {
        return Ok(0);
    }
    lock_in_key_order(&mut *conn, ids).await?;
    let updated = sqlx::query!(
        r#"UPDATE uploads SET expires_at = now() + make_interval(secs => $2)
           WHERE id = ANY($1) AND status = 'finalized' AND NOT upload_referenced(id)"#,
        ids,
        grace_secs
    )
    .execute(conn)
    .await?;
    Ok(updated.rows_affected())
}

pub struct ReapedUpload {
    pub id: Uuid,
    pub bucket: String,
    pub key: String,
    pub multipart_id: Option<String>,
}

/// Expired pending rows and expired unreferenced finalized rows, oldest first
/// (at most `limit`; the next sweep takes the rest).
///
/// "Unreferenced" is SQL `upload_referenced` (schema review item 18): no row names the upload
/// through an upload foreign key. The clock (`expires_at`, set by the release paths) only says
/// since when; a clock started while a row named the file (the old counter's drift,
/// BUG-209/241/263) no longer lets a referenced file go.
pub async fn expired(pool: &PgPool, limit: i64) -> Result<Vec<ReapedUpload>> {
    let rows = sqlx::query_as!(
        ReapedUpload,
        r#"SELECT id, bucket, key, multipart_id FROM uploads
           WHERE expires_at IS NOT NULL AND expires_at < now()
             AND (status = 'pending'
                  OR (status = 'finalized' AND NOT upload_referenced(uploads.id)))
           ORDER BY expires_at
           LIMIT $1"#,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Lock one row of [`expired`] for reaping, re-checking the predicate under the
/// lock; `None` when a claim, finalize or another sweep got to it first.
pub async fn lock_expired(conn: &mut sqlx::PgConnection, id: Uuid) -> Result<Option<ReapedUpload>> {
    let row = sqlx::query_as!(
        ReapedUpload,
        r#"SELECT id, bucket, key, multipart_id FROM uploads
           WHERE id = $1
             AND expires_at IS NOT NULL AND expires_at < now()
             AND (status = 'pending'
                  OR (status = 'finalized' AND NOT upload_referenced(uploads.id)))
           FOR UPDATE SKIP LOCKED"#,
        id
    )
    .fetch_optional(&mut *conn)
    .await?;
    Ok(row)
}

pub async fn delete(conn: &mut sqlx::PgConnection, id: Uuid) -> Result<()> {
    sqlx::query!("DELETE FROM uploads WHERE id = $1", id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

pub async fn set_multipart(
    conn: &mut sqlx::PgConnection,
    id: Uuid,
    multipart_id: &str,
) -> Result<()> {
    sqlx::query!(
        "UPDATE uploads SET multipart_id = $2 WHERE id = $1",
        id,
        multipart_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Serializes complete, cancel, finalize and reap. Expired intents cannot
/// create a new object after the reaper has removed their row.
pub async fn lock_pending(conn: &mut sqlx::PgConnection, id: Uuid) -> Result<bool> {
    Ok(sqlx::query_scalar!("SELECT id FROM uploads WHERE id = $1 AND status = 'pending' AND expires_at > now() FOR UPDATE", id)
        .fetch_optional(conn).await?.is_some())
}

/// Finalized uploads no row names and no clock runs on (`expires_at` NULL).
///
/// Claimed during a rollback window, or the images of posts deleted before `post_uploads`
/// (REWRITE 5.6 n4). The reaper only collects what has a clock, so these stay until
/// [`clock_unclocked_unreferenced`].
pub async fn count_unclocked_unreferenced(pool: &PgPool) -> Result<i64> {
    Ok(sqlx::query_scalar!(
        r#"SELECT count(*) AS "n!" FROM uploads
           WHERE status = 'finalized' AND expires_at IS NULL AND NOT upload_referenced(id)"#
    )
    .fetch_one(pool)
    .await?)
}

/// Starts the grace clock of [`count_unclocked_unreferenced`]'s uploads; returns how many.
pub async fn clock_unclocked_unreferenced(pool: &PgPool, grace_secs: f64) -> Result<u64> {
    Ok(sqlx::query!(
        "UPDATE uploads SET expires_at = now() + make_interval(secs => $1)
         WHERE status = 'finalized' AND expires_at IS NULL AND NOT upload_referenced(id)",
        grace_secs
    )
    .execute(pool)
    .await?
    .rows_affected())
}
