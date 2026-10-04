//! Storage client against real RustFS (S3 API).
//! Local: podman container on 9002 (AGENTS.md); CI: rustfs service on 9000.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::time::Duration;

use ab_clients::storage::{Bucket, ObjectHead, StorageClient, StorageConfig};
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
        storage
            .head(Bucket::Private, &key)
            .await
            .unwrap()
            .unwrap()
            .size,
        payload.len() as u64
    );

    // Presigned GET works without credentials; the type and disposition
    // are signed overrides, a filename names the download.
    let url = storage
        .presign_get(
            Bucket::Private,
            &key,
            None,
            Some("image/png"),
            true,
            Duration::from_mins(1),
        )
        .unwrap();
    let fetched = reqwest::get(&url).await.unwrap();
    assert!(fetched.status().is_success(), "{}", fetched.status());
    assert_eq!(fetched.headers()["content-disposition"], "inline");
    assert_eq!(fetched.headers()["content-type"], "image/png");
    assert_eq!(fetched.bytes().await.unwrap().to_vec(), payload);
    let named = storage
        .presign_get(
            Bucket::Private,
            &key,
            Some("проект.pdf"),
            Some("application/pdf"),
            false,
            Duration::from_mins(1),
        )
        .unwrap();
    let fetched = reqwest::get(&named).await.unwrap();
    assert!(fetched.status().is_success(), "{}", fetched.status());
    assert_eq!(
        fetched.headers()["content-disposition"].to_str().unwrap(),
        "attachment; filename*=UTF-8''%D0%BF%D1%80%D0%BE%D0%B5%D0%BA%D1%82.pdf"
    );
    // REVIEW-1 H4: an active type never renders, inline asked or not;
    // plain text carries its charset.
    for (stored, inline, disposition, served) in [
        ("text/html", true, "attachment", "application/octet-stream"),
        (
            "image/svg+xml",
            true,
            "attachment",
            "application/octet-stream",
        ),
        (
            "application/xml",
            false,
            "attachment",
            "application/octet-stream",
        ),
        (
            "Text/Plain; charset=koi8-r",
            true,
            "inline",
            "text/plain; charset=utf-8",
        ),
    ] {
        let url = storage
            .presign_get(
                Bucket::Private,
                &key,
                None,
                Some(stored),
                inline,
                Duration::from_mins(1),
            )
            .unwrap();
        let fetched = reqwest::get(&url).await.unwrap();
        assert!(
            fetched.status().is_success(),
            "{stored}: {}",
            fetched.status()
        );
        assert_eq!(
            fetched.headers()["content-disposition"],
            disposition,
            "{stored}"
        );
        assert_eq!(fetched.headers()["content-type"], served, "{stored}");
    }

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
        .presign_put(Bucket::Public, &key, "image/png", Duration::from_mins(1))
        .unwrap();
    // The signature pins Content-Type: a PUT declaring another type fails.
    let mismatched = reqwest::Client::new()
        .put(&url)
        .header("content-type", "text/html")
        .header("if-none-match", "*")
        .body(payload.clone())
        .send()
        .await
        .unwrap();
    assert_eq!(
        mismatched.status(),
        403,
        "storage accepted a mismatched type"
    );
    assert_eq!(storage.head(Bucket::Public, &key).await.unwrap(), None);

    let uploaded = reqwest::Client::new()
        .put(&url)
        .header("content-type", "image/png")
        .header("if-none-match", "*")
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
        Some(ObjectHead {
            size: payload.len() as u64,
            content_type: Some("image/png".into()),
        })
    );
    storage.delete(Bucket::Public, &key).await.unwrap();
}

#[tokio::test]
async fn health_check_passes_against_live_store(/* no pool needed */) {
    client().health_check().await.unwrap();
}
