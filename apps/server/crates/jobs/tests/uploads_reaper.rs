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
