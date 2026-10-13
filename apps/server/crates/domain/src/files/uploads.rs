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

/// How long a pending row stays finalizable.
///
/// The presigned PUT must *start*
/// within its 15 min, but a 500 MB lecture over a slow university link runs
/// for hours, and a reap sweep in that window lost the whole upload (BUG-B12).
pub const CLAIM_WINDOW: Duration = Duration::from_hours(12);
/// Grace period for finalized-but-unreferenced objects.
pub const UNREFERENCED_GRACE: Duration = Duration::from_hours(24);
const PRESIGN_PUT_TTL: Duration = Duration::from_mins(15);
const PRESIGN_GET_TTL: Duration = Duration::from_mins(5);

const MB: i64 = 1024 * 1024;
pub const MULTIPART_PART_BYTES: i64 = 32 * MB;

/// The `file-submission` cap in MB: a task's own limit can only be lower.
pub const FILE_SUBMISSION_MAX_MB: i32 = 100;

/// Legacy `file_validation.py` image allowlist - no SVG (scriptable) and no
/// `image/*` prefix: the public bucket is served on the web origin.
const IMAGES: &[&str] = &[
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/avif",
];
const VIDEOS: &[&str] = &[
    "video/mp4",
    "video/webm",
    "video/x-matroska",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-flv",
];

/// A purpose the upload pipeline accepts (pins the contract's `UploadPurpose`).
#[must_use]
pub fn is_purpose(purpose: &str) -> bool {
    policy(purpose).is_some()
}

/// (bucket, max bytes, allowed content types - exact match; empty = any).
fn policy(purpose: &str) -> Option<(Bucket, i64, &'static [&'static str])> {
    match purpose {
        "avatar" | "discussion-image" => Some((Bucket::Public, 5 * MB, IMAGES)),
        "course-thumbnail" | "block-image" | "platform-logo" | "platform-thumbnail"
        | "collection-cover" => Some((Bucket::Public, 10 * MB, IMAGES)),
        "block-pdf" => Some((Bucket::Public, 50 * MB, &["application/pdf"])),
        "block-video" => Some((Bucket::Public, 2048 * MB, VIDEOS)),
        "file-submission" => Some((Bucket::Private, i64::from(FILE_SUBMISSION_MAX_MB) * MB, &[])),
        _ => None,
    }
}

/// BUG-200: `file:create:own` alone only covers the learner-facing purposes.
/// Platform branding needs the platform grant; course thumbnails and
/// content blocks need course write access (the curriculum gate is
/// `course:update:own` as author or `course:update:platform`) - otherwise
/// any learner could park a 2 GB video on the public bucket for the
/// reap grace and serve it from `/content/…`.
fn require_purpose_grant(actor: &Actor, purpose: &str) -> Result<()> {
    let course_update = |scope| Permission {
        resource: ResourceType::Course,
        action: Action::Update,
        scope: Some(scope),
    };
    let granted = match purpose {
        "platform-logo" | "platform-thumbnail" => actor.has(Permission {
            resource: ResourceType::Platform,
            action: Action::Update,
            scope: Some(Scope::Platform),
        }),
        "course-thumbnail" | "block-image" | "block-pdf" | "block-video" => {
            actor.has(course_update(Scope::Own)) || actor.has(course_update(Scope::Platform))
        }
        // Whoever may make or edit a collection may give it a cover.
        "collection-cover" => [
            (Action::Create, Scope::Platform),
            (Action::Update, Scope::Own),
            (Action::Update, Scope::Platform),
        ]
        .into_iter()
        .any(|(action, scope)| {
            actor.has(Permission {
                resource: ResourceType::Collection,
                action,
                scope: Some(scope),
            })
        }),
        // Learner-facing: `avatar`, `file-submission`, `discussion-image`
        // (claimed by the post that shows it).
        _ => true,
    };
    if granted {
        Ok(())
    } else {
        Err(Error::forbidden(format!(
            "'{purpose}' uploads need authoring rights"
        )))
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
    pub part_urls: Vec<String>,
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
    /// `file:create:own` - UX-311: the handler checks it before the body.
    pub fn require_create(actor: &Actor) -> Result<()> {
        actor.require(Permission {
            resource: ResourceType::File,
            action: Action::Create,
            scope: Some(Scope::Own),
        })
    }

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
        multipart: bool,
    ) -> Result<CreatedUpload> {
        Self::require_create(actor)?;
        let Some((bucket, max_bytes, allowed)) = policy(purpose) else {
            return Err(Error::validation(vec![FieldError {
                field: "purpose".into(),
                code: "invalid".into(),
                message: format!("unknown upload purpose '{purpose}'"),
            }]));
        };
        require_purpose_grant(actor, purpose)?;
        if size_bytes < 1 || size_bytes > max_bytes {
            return Err(Error::validation(vec![FieldError {
                field: "size_bytes".into(),
                code: "too-large".into(),
                message: format!("{purpose} uploads are capped at {max_bytes} bytes"),
            }]));
        }
        if multipart && purpose != "block-video" {
            return Err(Error::validation(vec![FieldError {
                field: "multipart".into(),
                code: "invalid".into(),
                message: "multipart uploads are only supported for videos".into(),
            }]));
        }
        if !allowed.is_empty() && !allowed.contains(&mime) {
            return Err(Error::app(
                ErrorCode::UnsupportedMediaType,
                format!("{purpose} does not accept '{mime}'"),
            ));
        }

        let key = format!("{purpose}/{}", Uuid::now_v7().simple());
        // The PUT is pinned to the declared type; finalize re-checks it.
        let put_url = self
            .storage
            .presign_put(bucket, &key, mime, PRESIGN_PUT_TTL)?;
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
        let mut part_urls = Vec::new();
        if multipart {
            let mut tx = self.pool.begin().await?;
            if !ab_db::uploads::lock_pending(&mut tx, id).await? {
                return Err(Error::conflict("upload expired"));
            }
            let multipart_id = self.storage.create_multipart(bucket, &key, mime).await?;
            let saved = async {
                ab_db::uploads::set_multipart(&mut tx, id, &multipart_id).await?;
                for part in 1..=part_count(size_bytes) {
                    part_urls.push(self.storage.presign_part(
                        bucket,
                        &key,
                        &multipart_id,
                        part,
                        CLAIM_WINDOW,
                    )?);
                }
                tx.commit().await?;
                Ok::<_, Error>(())
            }
            .await;
            if let Err(err) = saved {
                self.storage
                    .abort_multipart(bucket, &key, &multipart_id)
                    .await?;
                return Err(err);
            }
        }
        Ok(CreatedUpload {
            id,
            key,
            put_url,
            part_urls,
        })
    }

    /// Complete only the caller's pending intent. The row lock and object
    /// existence check make retries safe even after the response was lost.
    pub async fn complete_multipart(
        &self,
        actor: &Actor,
        id: Uuid,
        etags: Vec<String>,
    ) -> Result<()> {
        let existing = ab_db::uploads::get_upload(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("upload"))?;
        if existing.created_by != actor.user_id {
            return Err(Error::forbidden("not your upload"));
        }
        // A lost finalize response may cause the client to repeat both steps.
        if existing.status == "finalized" && existing.multipart_id.is_some() {
            return Ok(());
        }
        let mut tx = self.pool.begin().await?;
        if !ab_db::uploads::lock_pending(&mut tx, id).await? {
            return Err(Error::conflict("upload is finalized or expired"));
        }
        let row = ab_db::uploads::get_upload(&mut *tx, id)
            .await?
            .ok_or_else(|| Error::not_found("upload"))?;
        if row.created_by != actor.user_id {
            return Err(Error::forbidden("not your upload"));
        }
        let Some(multipart_id) = row.multipart_id else {
            return Err(Error::conflict("not a multipart upload"));
        };
        if i64::try_from(etags.len()).unwrap_or(i64::MAX) != part_count(row.size_bytes)
            || etags.iter().any(|tag| {
                tag.is_empty()
                    || tag.len() > 256
                    || !tag.bytes().all(|b| b.is_ascii_hexdigit() || b == b'\"')
            })
        {
            return Err(Error::validation(vec![FieldError {
                field: "etags".into(),
                code: "invalid".into(),
                message: "expected one storage ETag per part, in order".into(),
            }]));
        }
        let bucket = bucket_from_name(&row.bucket);
        if self.storage.head(bucket, &row.key).await?.is_none() {
            self.storage
                .complete_multipart(bucket, &row.key, &multipart_id, etags)
                .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// Cancellation releases storage parts immediately; the reaper covers
    /// browser crashes and failed cleanup requests.
    pub async fn abort_multipart(&self, actor: &Actor, id: Uuid) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        if !ab_db::uploads::lock_pending(&mut tx, id).await? {
            return Err(Error::conflict("upload is finalized or expired"));
        }
        let row = ab_db::uploads::get_upload(&mut *tx, id)
            .await?
            .ok_or_else(|| Error::not_found("upload"))?;
        if row.created_by != actor.user_id {
            return Err(Error::forbidden("not your upload"));
        }
        let Some(multipart_id) = row.multipart_id else {
            return Err(Error::conflict("not a multipart upload"));
        };
        let bucket = bucket_from_name(&row.bucket);
        self.storage
            .abort_multipart(bucket, &row.key, &multipart_id)
            .await?;
        self.storage.delete(bucket, &row.key).await?;
        ab_db::uploads::delete(&mut tx, id).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Verify the object landed and finalize the ledger row.
    pub async fn finalize(&self, actor: &Actor, id: Uuid) -> Result<FinalizedUpload> {
        let mut tx = self.pool.begin().await?;
        if !ab_db::uploads::lock_pending(&mut tx, id).await? {
            let row = ab_db::uploads::get_upload(&mut *tx, id)
                .await?
                .ok_or_else(|| Error::not_found("upload"))?;
            if row.created_by != actor.user_id {
                return Err(Error::forbidden("not your upload"));
            }
            return Err(Error::conflict("upload is finalized or expired"));
        }
        let row = ab_db::uploads::get_upload(&mut *tx, id)
            .await?
            .ok_or_else(|| Error::not_found("upload"))?;
        if row.created_by != actor.user_id {
            return Err(Error::forbidden("not your upload"));
        }
        if row.status != "pending" {
            return Err(Error::conflict("upload is already finalized"));
        }
        let bucket = bucket_from_name(&row.bucket);
        let Some(head) = self.storage.head(bucket, &row.key).await? else {
            return Err(Error::conflict("no object received for this upload"));
        };
        // The stored type must be exactly what was declared (and allowed):
        // the public bucket is served on the web origin, so a `text/html`
        // object behind an `image/png` slot would be stored XSS.
        if head.content_type.as_deref() != Some(row.mime.as_str()) {
            self.storage.delete(bucket, &row.key).await?;
            return Err(Error::app_with_details(
                ErrorCode::UnsupportedMediaType,
                "stored object's content type does not match the declared one",
                serde_json::json!({ "declared": row.mime, "actual": head.content_type }),
            ));
        }
        // ARCHITECTURE §11: finalize verifies the size the intent declared
        // (the cap was checked against it, so the object must match it).
        // BUG-359: a mismatch is refused and the object dropped - a declared
        // size can no longer be a foot in the door for a bigger body.
        let actual_size = i64::try_from(head.size).unwrap_or(i64::MAX);
        if actual_size != row.size_bytes {
            self.storage.delete(bucket, &row.key).await?;
            return Err(Error::validation(vec![FieldError {
                field: "size_bytes".into(),
                code: "invalid".into(),
                message: format!(
                    "uploaded object is {actual_size} bytes, not the declared {}",
                    row.size_bytes
                ),
            }]));
        }
        if !ab_db::uploads::mark_finalized(
            &mut *tx,
            id,
            actual_size,
            UNREFERENCED_GRACE.as_secs_f64(),
        )
        .await?
        {
            return Err(Error::conflict("upload is already finalized"));
        }
        tx.commit().await?;
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
        // Inline for the types a browser may render from our origin (as
        // before), a download for the rest (`presign_get` decides).
        self.storage.presign_get(
            bucket_from_name(&row.bucket),
            &row.key,
            None,
            Some(&row.mime),
            true,
            PRESIGN_GET_TTL,
        )
    }
}

/// Claim a finalized upload the actor owns for `field` (which names the
/// request field in the validation error) and return its storage key.
/// Same mechanics as block media, avatars and platform branding.
pub async fn claim_upload(
    conn: &mut sqlx::PgConnection,
    actor: &Actor,
    upload_id: Uuid,
    required_purpose: &str,
    field: &str,
) -> Result<String> {
    let upload = ab_db::uploads::get_upload(&mut *conn, upload_id)
        .await?
        .ok_or_else(|| Error::not_found("upload"))?;
    if upload.created_by != actor.user_id {
        return Err(Error::forbidden("not your upload"));
    }
    if upload.purpose != required_purpose {
        return Err(Error::validation(vec![FieldError {
            field: field.into(),
            code: "wrong-purpose".into(),
            message: format!(
                "expected a '{required_purpose}' upload, got '{}'",
                upload.purpose
            ),
        }]));
    }
    if !ab_db::uploads::add_reference(conn, upload_id).await? {
        return Err(Error::conflict("upload is not finalized"));
    }
    Ok(upload.key)
}

/// Reap expired pending/unreferenced uploads without orphaning objects.
///
/// Each row is locked, its object deleted, then the row: a claim racing the sweep waits on the lock and then
/// finds no row, and a failed object delete rolls back so the row is retried on
/// the next sweep (object deletes are idempotent) - no orphaned objects.
pub async fn reap_expired(pool: &PgPool, storage: &StorageClient) -> Result<u64> {
    let mut deleted = 0;
    let mut failures_in_a_row = 0;
    for candidate in ab_db::uploads::expired(pool, 500).await? {
        let mut tx = pool.begin().await?;
        let Some(upload) = ab_db::uploads::lock_expired(&mut tx, candidate.id).await? else {
            continue;
        };
        let cleanup = async {
            let bucket = bucket_from_name(&upload.bucket);
            if let Some(multipart_id) = &upload.multipart_id {
                storage
                    .abort_multipart(bucket, &upload.key, multipart_id)
                    .await?;
            }
            storage.delete(bucket, &upload.key).await
        }
        .await;
        if let Err(err) = cleanup {
            tracing::warn!(key = %upload.key, %err, "object deletion failed; row kept for the next sweep");
            // Storage is likely down: end the sweep instead of holding a row lock
            // through every candidate's retries; the next sweep starts over.
            failures_in_a_row += 1;
            if failures_in_a_row >= 3 {
                break;
            }
            continue;
        }
        ab_db::uploads::delete(&mut tx, upload.id).await?;
        tx.commit().await?;
        deleted += 1;
        failures_in_a_row = 0;
    }
    Ok(deleted)
}

const fn part_count(size_bytes: i64) -> i64 {
    (size_bytes + MULTIPART_PART_BYTES - 1) / MULTIPART_PART_BYTES
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;

    /// The public bucket is served on the web origin without a signed
    /// override (`/content/<key>`): every type it accepts must be one a
    /// browser may render there.
    #[test]
    fn public_purposes_take_only_inline_safe_types() {
        for purpose in [
            "avatar",
            "discussion-image",
            "course-thumbnail",
            "block-image",
            "platform-logo",
            "platform-thumbnail",
            "collection-cover",
            "block-pdf",
            "block-video",
            "file-submission",
        ] {
            let (bucket, _, types) = policy(purpose).expect(purpose);
            if bucket == Bucket::Public {
                assert!(!types.is_empty(), "{purpose} accepts any type");
                for t in types {
                    assert!(
                        ab_clients::storage::inline_type(t).is_some(),
                        "{purpose}: {t}"
                    );
                }
            }
        }
    }
}
