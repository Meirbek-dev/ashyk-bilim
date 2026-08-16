//! Storage client against real RustFS (S3 API).
//! Local: podman container on 9002 (AGENTS.md); CI: rustfs service on 9000.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::time::Duration;

use ab_clients::storage::{Bucket, StorageClient, StorageConfig};
use secrecy::SecretString;

fn client() -> StorageClient {
    let endpoint =
        std::env::var("TEST_S3_ENDPOINT").unwrap_or_else(|_| "http://localhost:9002".into());
    StorageClient::new(&StorageConfig {
        endpoint,
        access_key: "ashyq-dev".into(),
        secret_key: SecretString::from("ashyq-dev-secret"),
        public_bucket: "ab-public".into(),
        private_bucket: "ab-private".into(),
    })
    .unwrap()
}

fn unique_key(prefix: &str) -> String {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{prefix}/{nonce}.bin")
}

#[tokio::test]
async fn put_head_presigned_get_delete_roundtrip() {
    let storage = client();
    let key = unique_key("test-roundtrip");
    let payload = b"ashyq storage roundtrip".to_vec();

    storage
        .put(Bucket::Private, &key, payload.clone())
        .await
        .unwrap();
    assert_eq!(
        storage.head(Bucket::Private, &key).await.unwrap(),
        Some(payload.len() as u64)
    );

    // Presigned GET works without credentials.
    let url = storage
        .presign_get(Bucket::Private, &key, Duration::from_mins(1))
        .await
        .unwrap();
    let fetched = reqwest::get(&url).await.unwrap();
    assert!(fetched.status().is_success());
    assert_eq!(fetched.bytes().await.unwrap().to_vec(), payload);

    storage.delete(Bucket::Private, &key).await.unwrap();
    assert_eq!(storage.head(Bucket::Private, &key).await.unwrap(), None);
    // Idempotent delete.
    storage.delete(Bucket::Private, &key).await.unwrap();
}

#[tokio::test]
async fn presigned_put_uploads_without_credentials() {
    let storage = client();
    let key = unique_key("test-presigned-put");
    let payload = b"uploaded via presigned url".to_vec();

    let url = storage
        .presign_put(Bucket::Public, &key, Duration::from_mins(1))
        .await
        .unwrap();
    let uploaded = reqwest::Client::new()
        .put(&url)
        .body(payload.clone())
        .send()
        .await
        .unwrap();
    assert!(
        uploaded.status().is_success(),
        "presigned PUT rejected: {}",
        uploaded.status()
    );
    assert_eq!(
        storage.head(Bucket::Public, &key).await.unwrap(),
        Some(payload.len() as u64)
    );
    storage.delete(Bucket::Public, &key).await.unwrap();
}

#[tokio::test]
async fn health_check_passes_against_live_store(/* no pool needed */) {
    client().health_check().await.unwrap();
}
