//! `uploads:previews` against real Postgres + RustFS (ARCHITECTURE §11 "Previews"):
//!
//! - the job writes every size of an avatar next to it as `image/webp`, and a
//!   rerun writes nothing;
//! - a picture no preview can be made of (here: not an image) gets copies of
//!   the original under every size key, so the web stops asking twice;
//! - a key whose object is gone is a no-op, not a failure;
//! - while the job holds an upload, the reaper skips it; once reaped, the
//!   sizes go with the original;
//! - the backfill enqueues uploads and legacy keys once (dedupe), and the
//!   dry run enqueues nothing.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::cast_possible_truncation
)]

use std::io::Cursor;
use std::sync::Arc;

use ab_clients::storage::{Bucket, StorageClient, StorageConfig};
use ab_domain::files::previews::{self, Rendered, variant_key};
use ab_jobs::JobHandler;
use ab_jobs::handlers::uploads::UploadPreviews;
use secrecy::SecretString;
use sqlx::PgPool;

fn storage() -> Arc<StorageClient> {
    Arc::new(
        StorageClient::new(&StorageConfig {
            endpoint: std::env::var("TEST_S3_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:9002".into()),
            access_key: "ashyq-dev".into(),
            secret_key: SecretString::from("ashyq-dev-secret"),
            public_bucket: "ab-public".into(),
            private_bucket: "ab-private".into(),
        })
        .unwrap(),
    )
}

fn nonce() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
}

/// A 600x400 PNG with enough detail that its previews are smaller than it.
fn png() -> Vec<u8> {
    let picture = image::RgbImage::from_fn(600, 400, |x, y| {
        image::Rgb([(x % 251) as u8, (y % 241) as u8, ((x * y) % 239) as u8])
    });
    let mut out = Cursor::new(Vec::new());
    picture.write_to(&mut out, image::ImageFormat::Png).unwrap();
    out.into_inner()
}

async fn user(pool: &PgPool, name: &str) -> uuid::Uuid {
    sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email)
         VALUES ($1, $1, $1 || '@example.com') RETURNING id",
    )
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// A finalized public upload row for `key`, unreferenced and already past its grace.
async fn finalized(pool: &PgPool, owner: uuid::Uuid, purpose: &str, key: &str, size: usize) {
    sqlx::query(
        "INSERT INTO uploads (created_by, purpose, bucket, key, mime, size_bytes, status, expires_at)
         VALUES ($1, $2, 'public', $3, 'image/png', $4, 'finalized', now() - interval '1 minute')",
    )
    .bind(owner)
    .bind(purpose)
    .bind(key)
    .bind(i64::try_from(size).unwrap())
    .execute(pool)
    .await
    .unwrap();
}

fn payload(purpose: &str, key: &str) -> serde_json::Value {
    serde_json::json!({ "v": 1, "key": key, "purpose": purpose })
}

#[ab_testdb::test]
async fn avatar_sizes_are_written_once_as_webp(pool: PgPool) {
    let storage = storage();
    let owner = user(&pool, "previewed").await;
    let key = format!("avatar/preview-{}", nonce());
    let original = png();
    storage
        .put_typed(Bucket::Public, &key, original.clone(), "image/png")
        .await
        .unwrap();
    finalized(&pool, owner, "avatar", &key, original.len()).await;

    // The writer owes the job in its transaction; the handler consumes that payload.
    let mut tx = pool.begin().await.unwrap();
    assert!(previews::owe(&mut tx, "avatar", &key).await.unwrap());
    assert!(
        !previews::owe(&mut tx, "avatar", &key).await.unwrap(),
        "deduped"
    );
    assert!(
        !previews::owe(&mut tx, "block-image", "block-image/x")
            .await
            .unwrap()
    );
    tx.commit().await.unwrap();
    let job: serde_json::Value =
        sqlx::query_scalar("SELECT payload FROM jobs WHERE kind = 'uploads:previews'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(job, payload("avatar", &key));
    UploadPreviews::new(pool.clone(), Arc::clone(&storage))
        .handle(job)
        .await
        .unwrap();

    for width in [64, 192] {
        let variant = variant_key(&key, width);
        let head = storage.head(Bucket::Public, &variant).await.unwrap();
        let head = head.unwrap_or_else(|| panic!("{variant} missing"));
        assert_eq!(
            head.content_type.as_deref(),
            Some("image/webp"),
            "{variant}"
        );
        let bytes = storage
            .get(Bucket::Public, &variant)
            .await
            .unwrap()
            .unwrap();
        let preview =
            image::load_from_memory_with_format(&bytes, image::ImageFormat::WebP).unwrap();
        // Covers the square box: the 3:2 picture keeps its height at the box's side.
        assert_eq!(preview.height(), width, "{variant}");
        assert!(bytes.len() < original.len());
    }
    assert_eq!(
        previews::render(&pool, &storage, payload("avatar", &key))
            .await
            .unwrap(),
        Rendered::AlreadyDone
    );

    // Reaped together: the sizes leave with the original.
    let reaped = ab_domain::files::uploads::reap_expired(&pool, &storage)
        .await
        .unwrap();
    assert_eq!(reaped, 1);
    for variant in previews::variant_keys("avatar", &key) {
        assert_eq!(storage.head(Bucket::Public, &variant).await.unwrap(), None);
    }
    assert_eq!(storage.head(Bucket::Public, &key).await.unwrap(), None);
}

#[ab_testdb::test]
async fn no_preview_means_copies_and_a_gone_original_is_a_no_op(pool: PgPool) {
    let storage = storage();
    let key = format!("course-thumbnail/odd-{}", nonce());
    // Not a picture at all (a decode refusal, like an AVIF or a bomb).
    storage
        .put_typed(Bucket::Public, &key, b"not a picture".to_vec(), "image/png")
        .await
        .unwrap();
    let rendered = previews::render(&pool, &storage, payload("course-thumbnail", &key))
        .await
        .unwrap();
    assert_eq!(rendered, Rendered::Written { webp: 0, copied: 2 });
    for variant in previews::variant_keys("course-thumbnail", &key) {
        let copy = storage.get(Bucket::Public, &variant).await.unwrap();
        assert_eq!(copy.as_deref(), Some(&b"not a picture"[..]), "{variant}");
        let head = storage
            .head(Bucket::Public, &variant)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(head.content_type.as_deref(), Some("image/png"));
        storage.delete(Bucket::Public, &variant).await.unwrap();
    }
    storage.delete(Bucket::Public, &key).await.unwrap();

    let gone = format!("avatar/gone-{}", nonce());
    assert_eq!(
        previews::render(&pool, &storage, payload("avatar", &gone))
            .await
            .unwrap(),
        Rendered::NoOriginal
    );
    assert!(
        previews::render(
            &pool,
            &storage,
            serde_json::json!({ "v": 9, "key": gone, "purpose": "avatar" })
        )
        .await
        .is_err(),
        "an unknown payload version is refused"
    );
}

#[ab_testdb::test]
async fn the_reaper_passes_an_upload_while_its_previews_are_written(pool: PgPool) {
    let storage = storage();
    let owner = user(&pool, "held").await;
    let key = format!("avatar/held-{}", nonce());
    storage
        .put_typed(Bucket::Public, &key, png(), "image/png")
        .await
        .unwrap();
    finalized(&pool, owner, "avatar", &key, 1).await;

    let mut job = pool.begin().await.unwrap();
    assert!(
        ab_db::uploads::share_lock_by_key(&mut job, &key)
            .await
            .unwrap()
    );
    let reaped = ab_domain::files::uploads::reap_expired(&pool, &storage)
        .await
        .unwrap();
    assert_eq!(reaped, 0, "a held upload is skipped");
    job.commit().await.unwrap();
    assert_eq!(
        ab_domain::files::uploads::reap_expired(&pool, &storage)
            .await
            .unwrap(),
        1
    );
}

#[ab_testdb::test]
async fn backfill_enqueues_uploads_and_legacy_keys_once(pool: PgPool) {
    let owner = user(&pool, "backfilled").await;
    finalized(&pool, owner, "avatar", "avatar/with-row", 10).await;
    finalized(&pool, owner, "block-image", "block-image/no-previews", 10).await;
    // A legacy avatar key without an upload row, and an old Google photo URL.
    sqlx::query("UPDATE users SET avatar_key = 'avatars/legacy.png' WHERE id = $1")
        .bind(owner)
        .execute(&pool)
        .await
        .unwrap();
    let google = user(&pool, "google").await;
    sqlx::query(
        "UPDATE users SET avatar_key = 'https://lh3.googleusercontent.com/a/x' WHERE id = $1",
    )
    .bind(google)
    .execute(&pool)
    .await
    .unwrap();

    let dry = previews::backfill(&pool, true).await.unwrap();
    assert_eq!(dry.counts.get("uploads"), Some(&1));
    assert_eq!(dry.counts.get("legacy_keys"), Some(&1));
    assert_eq!(dry.counts.get("jobs_enqueued"), None);
    let queued = || async {
        sqlx::query_scalar::<_, String>(
            "SELECT payload->>'key' FROM jobs WHERE kind = 'uploads:previews' ORDER BY payload->>'key' COLLATE \"C\"",
        )
        .fetch_all(&pool)
        .await
        .unwrap()
    };
    assert!(queued().await.is_empty());

    let run = previews::backfill(&pool, false).await.unwrap();
    assert_eq!(run.counts.get("jobs_enqueued"), Some(&2));
    assert_eq!(queued().await, ["avatar/with-row", "avatars/legacy.png"]);
    let again = previews::backfill(&pool, false).await.unwrap();
    assert_eq!(again.counts.get("already_queued"), Some(&2));
    assert_eq!(queued().await.len(), 2);
}
