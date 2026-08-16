//! Direct-to-storage uploads (ARCHITECTURE §11): the API hands out presigned
//! PUT URLs, verifies the object on finalize, and the reaper deletes what
//! nobody claimed. File bytes never transit Axum.
//!
//! Purpose policy ports the legacy `file_validation.py` caps.

use std::sync::Arc;
use std::time::Duration;

use ab_clients::storage::{Bucket, StorageClient};
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, ErrorCode, FieldError, Result};
use sqlx::PgPool;
use uuid::Uuid;

use crate::identity::Actor;

/// How long a presigned PUT (and the pending row) stays claimable.
pub const CLAIM_WINDOW: Duration = Duration::from_hours(1);
/// Grace period for finalized-but-unreferenced objects.
pub const UNREFERENCED_GRACE: Duration = Duration::from_hours(24);
const PRESIGN_PUT_TTL: Duration = Duration::from_mins(15);
const PRESIGN_GET_TTL: Duration = Duration::from_mins(5);

const MB: i64 = 1024 * 1024;

/// (bucket, max bytes, allowed mime prefixes — empty = any).
fn policy(purpose: &str) -> Option<(Bucket, i64, &'static [&'static str])> {
    match purpose {
        "avatar" => Some((Bucket::Public, 5 * MB, &["image/"])),
        "course-thumbnail" | "block-image" | "platform-logo" | "platform-thumbnail" => {
            Some((Bucket::Public, 10 * MB, &["image/"]))
        }
        "block-pdf" => Some((Bucket::Public, 50 * MB, &["application/pdf"])),
        "block-video" => Some((Bucket::Public, 500 * MB, &["video/"])),
        "file-submission" => Some((Bucket::Private, 100 * MB, &[])),
        _ => None,
    }
}

const fn bucket_name(bucket: Bucket) -> &'static str {
    match bucket {
        Bucket::Public => "public",
        Bucket::Private => "private",
    }
}

fn bucket_from_name(name: &str) -> Bucket {
    if name == "public" {
        Bucket::Public
    } else {
        Bucket::Private
    }
}

#[derive(Debug)]
pub struct CreatedUpload {
    pub id: Uuid,
    pub key: String,
    pub put_url: String,
}

#[derive(Debug)]
pub struct FinalizedUpload {
    pub id: Uuid,
    pub key: String,
    pub size_bytes: i64,
}

#[derive(Clone)]
pub struct UploadsService {
    pool: PgPool,
    storage: Arc<StorageClient>,
}

impl UploadsService {
    #[must_use]
    pub const fn new(pool: PgPool, storage: Arc<StorageClient>) -> Self {
        Self { pool, storage }
    }

    /// Validate against the purpose policy and hand out a presigned PUT.
    pub async fn create(
        &self,
        actor: &Actor,
        purpose: &str,
        mime: &str,
        size_bytes: i64,
    ) -> Result<CreatedUpload> {
        actor.require(Permission {
            resource: ResourceType::File,
            action: Action::Create,
            scope: Some(Scope::Own),
        })?;
        let Some((bucket, max_bytes, allowed)) = policy(purpose) else {
            return Err(Error::validation(vec![FieldError {
                field: "purpose".into(),
                code: "invalid".into(),
                message: format!("unknown upload purpose '{purpose}'"),
            }]));
        };
        if size_bytes > max_bytes {
            return Err(Error::validation(vec![FieldError {
                field: "size_bytes".into(),
                code: "too-large".into(),
                message: format!("{purpose} uploads are capped at {max_bytes} bytes"),
            }]));
        }
        if !allowed.is_empty() && !allowed.iter().any(|prefix| mime.starts_with(prefix)) {
            return Err(Error::validation(vec![FieldError {
                field: "mime".into(),
                code: "unsupported".into(),
                message: format!("{purpose} does not accept '{mime}'"),
            }]));
        }

        let key = format!("{purpose}/{}", Uuid::now_v7().simple());
        let put_url = self
            .storage
            .presign_put(bucket, &key, PRESIGN_PUT_TTL)
            .await?;
        let id = ab_db::uploads::insert_upload(
            &self.pool,
            ab_db::uploads::NewUpload {
                created_by: actor.user_id,
                purpose,
                bucket: bucket_name(bucket),
                key: &key,
                mime,
                size_bytes,
                claim_window_secs: CLAIM_WINDOW.as_secs_f64(),
            },
        )
        .await?;
        Ok(CreatedUpload { id, key, put_url })
    }

    /// Verify the object landed and finalize the ledger row.
    pub async fn finalize(&self, actor: &Actor, id: Uuid) -> Result<FinalizedUpload> {
        let row = ab_db::uploads::get_upload(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("upload"))?;
        if row.created_by != actor.user_id {
            return Err(Error::forbidden("not your upload"));
        }
        if row.status != "pending" {
            return Err(Error::conflict("upload is already finalized"));
        }
        let bucket = bucket_from_name(&row.bucket);
        let Some(actual_size) = self.storage.head(bucket, &row.key).await? else {
            return Err(Error::conflict("no object received for this upload"));
        };
        let actual_size = i64::try_from(actual_size).unwrap_or(i64::MAX);
        if let Some((_, max_bytes, _)) = policy(&row.purpose)
            && actual_size > max_bytes
        {
            // Uploaded more than declared/allowed: reject and clean up.
            self.storage.delete(bucket, &row.key).await?;
            return Err(Error::validation(vec![FieldError {
                field: "size_bytes".into(),
                code: "too-large".into(),
                message: "uploaded object exceeds the size cap".into(),
            }]));
        }
        if !ab_db::uploads::mark_finalized(
            &self.pool,
            id,
            actual_size,
            UNREFERENCED_GRACE.as_secs_f64(),
        )
        .await?
        {
            return Err(Error::conflict("upload is already finalized"));
        }
        Ok(FinalizedUpload {
            id,
            key: row.key,
            size_bytes: actual_size,
        })
    }

    /// Short-lived download URL for a finalized upload the actor may access.
    pub async fn download_url(&self, actor: &Actor, id: Uuid) -> Result<String> {
        let row = ab_db::uploads::get_upload(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("upload"))?;
        if row.status != "finalized" {
            return Err(Error::app(ErrorCode::Conflict, "upload is not finalized"));
        }
        // v1 access rule: owner only; resource-scoped access (e.g. teachers
        // downloading submissions) arrives with the file-submission slice.
        if row.created_by != actor.user_id {
            return Err(Error::forbidden("not your upload"));
        }
        self.storage
            .presign_get(bucket_from_name(&row.bucket), &row.key, PRESIGN_GET_TTL)
            .await
    }
}

/// Reap expired pending/unreferenced uploads: rows first, then objects
/// (best-effort — a missed object is retried never, but orphan objects are
/// harmless and listable).
pub async fn reap_expired(pool: &PgPool, storage: &StorageClient) -> Result<u64> {
    let reaped = ab_db::uploads::reap_expired(pool).await?;
    let mut deleted = 0;
    for upload in &reaped {
        if let Err(err) = storage
            .delete(bucket_from_name(&upload.bucket), &upload.key)
            .await
        {
            tracing::warn!(key = %upload.key, %err, "reaped row but object deletion failed");
        } else {
            deleted += 1;
        }
    }
    Ok(deleted)
}
