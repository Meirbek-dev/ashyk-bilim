//! Image previews (ARCHITECTURE §11 "Previews"): small WebP copies of pictures.
//!
//! Avatars, course thumbnails and collection covers get them, written by the
//! `uploads:previews` job next to the original (`<key>.w<width>`, same bucket)
//! and served by the same `/content/<key>` route.
//!
//! - Finalizing an upload of a previewed purpose enqueues the job in the
//!   finalize transaction; `ashyq admin image-previews` enqueues it for what
//!   was stored before (backfill). The payload is `{ "v": 1, "key", "purpose" }`.
//! - Every size of a picture exists once its job ran: the WebP when it is
//!   smaller, else a server-side copy of the original (animated, AVIF,
//!   too large to decode, already small). The web asks for the smallest size
//!   first and falls back to the original while it is missing.
//! - The job holds a share lock on the upload row while it writes, so the
//!   reaper (which deletes the sizes with the original) skips the row until
//!   the job is done and no size outlives its original.

use std::sync::Arc;

use ab_clients::storage::{Bucket, StorageClient};
use ab_core::{Error, Result};
use ab_db::queue::NewJob;
use ab_images::{Preview, Target};
use serde::Deserialize;
use sqlx::PgPool;
use tokio::sync::Semaphore;

pub const PREVIEWS_JOB: &str = "uploads:previews";
const PAYLOAD_VERSION: u32 = 1;
/// A bigger original is not read: its sizes are copies of it.
const MAX_ORIGINAL_BYTES: u64 = 32 * 1024 * 1024;

/// Decoding is CPU and memory heavy (up to 200 MB a picture): at most two at once
/// per process, whatever the worker's concurrency.
static RENDERING: Semaphore = Semaphore::const_new(2);

const AVATAR: &[Target] = &[
    // A 32 px avatar (lists) and the 96 px one of a profile, at 2x.
    Target {
        width: 64,
        height: 64,
    },
    Target {
        width: 192,
        height: 192,
    },
];
const COVER: &[Target] = &[
    // 16:9 covers of lists and cards; banners use the original.
    Target {
        width: 320,
        height: 180,
    },
    Target {
        width: 640,
        height: 360,
    },
];

/// The sizes a purpose gets, smallest first; empty for everything else.
#[must_use]
pub fn targets(purpose: &str) -> &'static [Target] {
    match purpose {
        "avatar" => AVATAR,
        "course-thumbnail" | "collection-cover" => COVER,
        _ => &[],
    }
}

/// The purposes that get previews (the backfill's filter).
pub const PREVIEWED: &[&str] = &["avatar", "course-thumbnail", "collection-cover"];

/// Where one size of `key` lives: next to it, so moving the bucket moves them.
#[must_use]
pub fn variant_key(key: &str, width: u32) -> String {
    format!("{key}.w{width}")
}

/// Every size key of `key` for `purpose` (what the reaper deletes with it).
#[must_use]
pub fn variant_keys(purpose: &str, key: &str) -> Vec<String> {
    targets(purpose)
        .iter()
        .map(|target| variant_key(key, target.width))
        .collect()
}

/// Enqueue the previews of a public `key` on the writer's connection (inside
/// its transaction). A purpose without previews enqueues nothing.
pub async fn owe(conn: &mut sqlx::PgConnection, purpose: &str, key: &str) -> Result<bool> {
    if targets(purpose).is_empty() {
        return Ok(false);
    }
    let job = NewJob::new(
        PREVIEWS_JOB,
        serde_json::json!({ "v": PAYLOAD_VERSION, "key": key, "purpose": purpose }),
    )
    .max_attempts(5)
    .dedupe(format!("previews:{key}"));
    Ok(ab_db::queue::enqueue(&mut *conn, &job).await?.is_some())
}

#[derive(Debug, Deserialize)]
struct Payload {
    v: u32,
    key: String,
    purpose: String,
}

/// What one job did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rendered {
    /// The original is gone (reaped, or a key without an object).
    NoOriginal,
    /// Every size already existed.
    AlreadyDone,
    /// Sizes written: how many as WebP, how many as a copy of the original.
    Written { webp: usize, copied: usize },
}

/// The `uploads:previews` job: write every size of one picture.
pub async fn render(
    pool: &PgPool,
    storage: &Arc<StorageClient>,
    payload: serde_json::Value,
) -> Result<Rendered> {
    let payload: Payload = serde_json::from_value(payload)
        .map_err(|e| Error::internal("uploads:previews payload", e))?;
    if payload.v != PAYLOAD_VERSION {
        return Err(Error::internal(
            "uploads:previews payload",
            std::io::Error::other(format!("unknown payload version {}", payload.v)),
        ));
    }
    let targets = targets(&payload.purpose);
    if targets.is_empty() {
        return Ok(Rendered::AlreadyDone);
    }
    let key = payload.key.as_str();
    // Held until every size is written: the reaper skips a locked row.
    let mut tx = pool.begin().await?;
    ab_db::uploads::share_lock_by_key(&mut tx, key).await?;
    let mut missing = Vec::new();
    for target in targets {
        if storage
            .head(Bucket::Public, &variant_key(key, target.width))
            .await?
            .is_none()
        {
            missing.push(*target);
        }
    }
    if missing.is_empty() {
        return Ok(Rendered::AlreadyDone);
    }
    let Some(head) = storage.head(Bucket::Public, key).await? else {
        return Ok(Rendered::NoOriginal);
    };
    // Uploads are capped at 10 MB; a bigger (legacy) object is not read into memory.
    let original = if head.size <= MAX_ORIGINAL_BYTES {
        storage.get(Bucket::Public, key).await?
    } else {
        None
    };
    let previews = if let Some(original) = original {
        let _permit = RENDERING
            .acquire()
            .await
            .map_err(|e| Error::internal("preview rendering semaphore", e))?;
        let wanted = missing.clone();
        tokio::task::spawn_blocking(move || ab_images::previews(&original, &wanted))
            .await
            .map_err(|e| Error::internal("preview rendering task", e))?
    } else {
        Err(ab_images::Skip::Broken(format!(
            "{} bytes is over the read limit",
            head.size
        )))
    };
    let previews = match previews {
        Ok(previews) => previews,
        Err(skip) => {
            tracing::info!(key, reason = %skip, "no preview; the original stands in");
            vec![Preview::Original; missing.len()]
        }
    };
    let (mut webp, mut copied) = (0, 0);
    // Largest first: once the smallest exists (what the web asks for), all do.
    for (target, preview) in missing.iter().zip(previews).rev() {
        let variant = variant_key(key, target.width);
        match preview {
            Preview::WebP { bytes, .. } => {
                storage
                    .put_typed(Bucket::Public, &variant, bytes, "image/webp")
                    .await?;
                webp += 1;
            }
            Preview::Original => {
                if !storage.copy(Bucket::Public, key, &variant).await? {
                    return Ok(Rendered::NoOriginal);
                }
                copied += 1;
            }
        }
    }
    tx.commit().await?;
    Ok(Rendered::Written { webp, copied })
}

/// `ashyq admin image-previews`: enqueue the previews of stored pictures.
///
/// Every picture of a previewed purpose: finalized public uploads, plus legacy
/// keys that rows name without an upload row. Jobs skip sizes that exist, so
/// a rerun only fills gaps. Prints counts.
pub async fn backfill(pool: &PgPool, dry_run: bool) -> Result<crate::maintenance::Report> {
    let mut report = crate::maintenance::Report {
        dry_run,
        ..crate::maintenance::Report::default()
    };
    let purposes: Vec<String> = PREVIEWED.iter().map(|p| (*p).to_owned()).collect();
    let sources = ab_db::uploads::preview_sources(pool, &purposes).await?;
    for source in &sources {
        report.add(
            if source.ledger {
                "uploads"
            } else {
                "legacy_keys"
            },
            1,
        );
    }
    if dry_run {
        return Ok(report);
    }
    for chunk in sources.chunks(500) {
        let mut tx = pool.begin().await?;
        for source in chunk {
            if owe(&mut tx, &source.purpose, &source.key).await? {
                report.add("jobs_enqueued", 1);
            } else {
                report.add("already_queued", 1);
            }
        }
        tx.commit().await?;
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn previewed_purposes_have_sizes_smallest_first() {
        for purpose in PREVIEWED {
            let sizes = targets(purpose);
            assert!(!sizes.is_empty(), "{purpose}");
            assert!(sizes.windows(2).all(|w| w[0].width < w[1].width));
        }
        for purpose in [
            "block-image",
            "discussion-image",
            "file-submission",
            "block-video",
        ] {
            assert!(targets(purpose).is_empty(), "{purpose}");
        }
    }

    #[test]
    fn sizes_live_next_to_the_original() {
        assert_eq!(
            variant_keys("avatar", "avatar/0193abcd"),
            ["avatar/0193abcd.w64", "avatar/0193abcd.w192"]
        );
        assert!(variant_keys("block-pdf", "block-pdf/x").is_empty());
    }
}
