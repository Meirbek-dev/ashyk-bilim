//! The uploads reaper against real Postgres + RustFS.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::sync::Arc;

use ab_clients::storage::{Bucket, StorageClient, StorageConfig};
use ab_jobs::JobHandler;
use ab_jobs::handlers::uploads::UploadsReaper;
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

#[sqlx::test(migrations = "../../migrations")]
async fn reaper_removes_expired_rows_and_objects(pool: PgPool) {
    let storage = storage();
    let user: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email)
         VALUES ('z-u', 'reapee', 're@example.com') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    // Expired pending upload WITH an orphaned object behind it.
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let key = format!("avatar/reap-{nonce}");
    storage
        .put(Bucket::Public, &key, b"orphan".to_vec())
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO uploads (created_by, purpose, bucket, key, mime, size_bytes, expires_at)
         VALUES ($1, 'avatar', 'public', $2, 'image/png', 6, now() - interval '1 minute')",
    )
    .bind(user)
    .bind(&key)
    .execute(&pool)
    .await
    .unwrap();

    // A live (unexpired) pending upload must survive.
    sqlx::query(
        "INSERT INTO uploads (created_by, purpose, bucket, key, mime, size_bytes, expires_at)
         VALUES ($1, 'avatar', 'public', $2, 'image/png', 6, now() + interval '1 hour')",
    )
    .bind(user)
    .bind(format!("avatar/live-{nonce}"))
    .execute(&pool)
    .await
    .unwrap();

    UploadsReaper::new(pool.clone(), Arc::clone(&storage))
        .handle(serde_json::json!({}))
        .await
        .unwrap();

    let remaining: Vec<String> = sqlx::query_scalar("SELECT key FROM uploads")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(remaining, vec![format!("avatar/live-{nonce}")]);
    assert_eq!(storage.head(Bucket::Public, &key).await.unwrap(), None);
}

/// AUD (reaper retry gap): a failed object delete must not drop the row, or the
/// object is orphaned forever — the row stays and the next sweep reaps both.
#[sqlx::test(migrations = "../../migrations")]
async fn failed_object_delete_keeps_the_row_for_the_next_sweep(pool: PgPool) {
    let storage = storage();
    let user: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email)
         VALUES ('z-r', 'retry', 'retry@example.com') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let key = format!("avatar/retry-{nonce}");
    storage
        .put(Bucket::Public, &key, b"orphan".to_vec())
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO uploads (created_by, purpose, bucket, key, mime, size_bytes, expires_at)
         VALUES ($1, 'avatar', 'public', $2, 'image/png', 6, now() - interval '1 minute')",
    )
    .bind(user)
    .bind(&key)
    .execute(&pool)
    .await
    .unwrap();

    // Storage down: nothing is lost, the row waits.
    let down = Arc::new(
        StorageClient::new(&StorageConfig {
            endpoint: "http://127.0.0.1:9".into(),
            access_key: "ashyq-dev".into(),
            secret_key: SecretString::from("ashyq-dev-secret"),
            public_bucket: "ab-public".into(),
            private_bucket: "ab-private".into(),
        })
        .unwrap(),
    );
    let reaped = ab_domain::files::uploads::reap_expired(&pool, &down)
        .await
        .unwrap();
    assert_eq!(reaped, 0);
    let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM uploads WHERE key = $1")
        .bind(&key)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(rows, 1);

    // Storage back: the next sweep takes the object and the row.
    let reaped = ab_domain::files::uploads::reap_expired(&pool, &storage)
        .await
        .unwrap();
    assert_eq!(reaped, 1);
    assert_eq!(storage.head(Bucket::Public, &key).await.unwrap(), None);
    let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM uploads WHERE key = $1")
        .bind(&key)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(rows, 0);
}

async fn reapee(pool: &PgPool, name: &str) -> uuid::Uuid {
    sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email)
         VALUES ($1, $1, $1 || '@example.com') RETURNING id",
    )
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// Expired rows `(bucket, key)`, oldest first (the sweep's order).
async fn expired_rows(pool: &PgPool, user: uuid::Uuid, rows: &[(&str, String)]) {
    for (age, (bucket, key)) in rows.iter().enumerate() {
        sqlx::query(
            "INSERT INTO uploads (created_by, purpose, bucket, key, mime, size_bytes, expires_at)
             VALUES ($1, 'avatar', $2, $3, 'image/png', 6,
                     now() - make_interval(mins => 60 - $4))",
        )
        .bind(user)
        .bind(bucket)
        .bind(key)
        .bind(i32::try_from(age).unwrap())
        .execute(pool)
        .await
        .unwrap();
    }
}

async fn keys_left(pool: &PgPool) -> Vec<String> {
    sqlx::query_scalar("SELECT key FROM uploads ORDER BY expires_at")
        .fetch_all(pool)
        .await
        .unwrap()
}

/// A row claimed (locked) between the listing and the lock is skipped, not
/// waited on — `lock_expired` answers `None` — and reaped by a later sweep.
#[sqlx::test(migrations = "../../migrations")]
async fn a_locked_row_is_skipped_until_the_next_sweep(pool: PgPool) {
    let storage = storage();
    let user = reapee(&pool, "locked").await;
    expired_rows(&pool, user, &[("public", "avatar/locked".into())]).await;
    let mut claim = pool.begin().await.unwrap();
    sqlx::query("SELECT id FROM uploads WHERE key = 'avatar/locked' FOR UPDATE")
        .execute(&mut *claim)
        .await
        .unwrap();
    let reaped = ab_domain::files::uploads::reap_expired(&pool, &storage)
        .await
        .unwrap();
    assert_eq!(reaped, 0);
    claim.rollback().await.unwrap();
    assert_eq!(keys_left(&pool).await, vec!["avatar/locked".to_owned()]);
    let reaped = ab_domain::files::uploads::reap_expired(&pool, &storage)
        .await
        .unwrap();
    assert_eq!(reaped, 1);
    assert!(keys_left(&pool).await.is_empty());
}

/// Three failed object deletes in a row end the sweep; a success in between
/// resets the count. The private bucket name is invalid, so exactly the
/// private rows fail.
#[sqlx::test(migrations = "../../migrations")]
async fn three_failures_in_a_row_end_the_sweep(pool: PgPool) {
    let half_down = StorageClient::new(&StorageConfig {
        endpoint: std::env::var("TEST_S3_ENDPOINT")
            .unwrap_or_else(|_| "http://localhost:9002".into()),
        access_key: "ashyq-dev".into(),
        secret_key: SecretString::from("ashyq-dev-secret"),
        public_bucket: "ab-public".into(),
        private_bucket: "Invalid_Bucket".into(),
    })
    .unwrap();
    let user = reapee(&pool, "streak").await;
    let row = |bucket: &'static str, key: &str| (bucket, format!("avatar/streak-{key}"));
    expired_rows(
        &pool,
        user,
        &[
            row("private", "f1"),
            row("private", "f2"),
            row("public", "ok1"),
            row("private", "f3"),
            row("private", "f4"),
            row("private", "f5"),
            row("public", "ok2"),
        ],
    )
    .await;
    let reaped = ab_domain::files::uploads::reap_expired(&pool, &half_down)
        .await
        .unwrap();
    assert_eq!(reaped, 1);
    let left = keys_left(&pool).await;
    assert!(!left.contains(&"avatar/streak-ok1".to_owned()), "{left:?}");
    assert!(left.contains(&"avatar/streak-ok2".to_owned()), "{left:?}");
    assert_eq!(left.len(), 6, "{left:?}");
}

/// One sweep takes at most 500 rows; the rest wait for the next one.
#[sqlx::test(migrations = "../../migrations")]
async fn a_sweep_reaps_at_most_one_batch(pool: PgPool) {
    let storage = storage();
    let user = reapee(&pool, "batch").await;
    sqlx::query(
        "INSERT INTO uploads (created_by, purpose, bucket, key, mime, size_bytes, expires_at)
         SELECT $1, 'avatar', 'public', 'avatar/batch-' || n, 'image/png', 6,
                now() - interval '1 hour' + make_interval(secs => n)
         FROM generate_series(1, 501) AS n",
    )
    .bind(user)
    .execute(&pool)
    .await
    .unwrap();
    let reaped = ab_domain::files::uploads::reap_expired(&pool, &storage)
        .await
        .unwrap();
    assert_eq!(reaped, 500);
    assert_eq!(keys_left(&pool).await, vec!["avatar/batch-501".to_owned()]);
}
