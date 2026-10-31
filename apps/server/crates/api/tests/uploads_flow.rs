//! Upload pipeline end-to-end: presigned PUT to real RustFS, finalize
//! verification, presigned download, policy rejections, reaper. Multipart
//! videos assemble ordered parts, repeat safely, reject foreign callers,
//! retain MIME/size validation, and release cancelled/abandoned parts.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_clients::storage::{Bucket, StorageClient, StorageConfig};
use ab_testkit::TestApp;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use secrecy::SecretString;
use sqlx::PgPool;

#[ab_testdb::test]
async fn multipart_video_assembles_retries_and_stays_immutable(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("parts", "parts@example.com", &["user"])
        .await;
    let owner = app
        .mint_session_for(user, &["file:create:own", "course:update:own"])
        .await;
    let other_user = app
        .create_user("foreign-parts", "foreign-parts@example.com", &["user"])
        .await;
    let other = app.mint_session_for(other_user, &[]).await;
    let size = 32 * 1024 * 1024 + 7;
    let created = app
        .post_as(
            &owner,
            "/api/v2/uploads",
            &serde_json::json!({
                "purpose": "block-video", "mime": "video/mp4", "size_bytes": size, "multipart": true
            }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK, "{}", created.text());
    let body = created.json();
    let id = body["id"].as_str().unwrap();
    let path = format!("/api/v2/uploads/{id}/multipart");
    let urls = body["multipart"]["part_urls"].as_array().unwrap();
    assert_eq!(urls.len(), 2);
    assert_eq!(body["multipart"]["part_size_bytes"], 32 * 1024 * 1024);
    let mut etags = Vec::new();
    for (index, url) in urls.iter().enumerate() {
        let part =
            vec![u8::try_from(index).unwrap(); if index == 0 { 32 * 1024 * 1024 } else { 7 }];
        let put = reqwest::Client::new()
            .put(url.as_str().unwrap())
            .body(part.clone())
            .send()
            .await
            .unwrap();
        assert!(put.status().is_success(), "{}", put.text().await.unwrap());
        etags.push(put.headers()["etag"].to_str().unwrap().to_owned());
        // Repeating one part doesn't restart the upload.
        let retry = reqwest::Client::new()
            .put(url.as_str().unwrap())
            .body(part)
            .send()
            .await
            .unwrap();
        assert!(retry.status().is_success());
        assert_eq!(retry.headers()["etag"], etags[index]);
    }
    let parts = serde_json::json!({ "etags": etags });
    assert_eq!(
        app.post_as(&other, &path, &parts).await.status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.send(
            Request::builder()
                .method("DELETE")
                .uri(&path)
                .header("cookie", &other.cookie)
                .body(Body::empty())
                .unwrap()
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.post_as(&owner, &path, &serde_json::json!({"etags": [etags[0]]}))
            .await
            .status,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    for _ in 0..2 {
        let done = app.post_as(&owner, &path, &parts).await;
        assert_eq!(done.status, StatusCode::NO_CONTENT, "{}", done.text());
    }
    let finalized = app
        .post_as(
            &owner,
            &format!("/api/v2/uploads/{id}/finalize"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(finalized.status, StatusCode::OK, "{}", finalized.text());
    assert_eq!(finalized.json()["size_bytes"], size);
    assert_eq!(
        app.post_as(&owner, &path, &parts).await.status,
        StatusCode::NO_CONTENT
    );
    let replay = reqwest::Client::new()
        .put(urls[0].as_str().unwrap())
        .body("replacement")
        .send()
        .await
        .unwrap();
    assert!(
        !replay.status().is_success(),
        "completed upload still accepted a part"
    );
    let cancelled = app
        .send(
            Request::builder()
                .method("DELETE")
                .uri(&path)
                .header("cookie", &owner.cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(cancelled.status, StatusCode::CONFLICT);
    let download = app
        .get_as(&owner, &format!("/api/v2/uploads/{id}/download"))
        .await;
    let fetched = reqwest::get(download.headers["location"].to_str().unwrap())
        .await
        .unwrap();
    assert_eq!(fetched.headers()["content-type"], "video/mp4");
    let bytes = fetched.bytes().await.unwrap();
    assert_eq!(bytes.len(), size);
    assert_eq!(&bytes[size - 7..], &[1; 7]);
}

#[ab_testdb::test]
async fn multipart_cancel_reap_and_size_validation(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("cleanup-parts", "cleanup-parts@example.com", &["user"])
        .await;
    let owner = app
        .mint_session_for(user, &["file:create:own", "course:update:own"])
        .await;
    for mode in ["cancel", "reap", "wrong-size"] {
        let created = app.post_as(&owner, "/api/v2/uploads", &serde_json::json!({
            "purpose": "block-video", "mime": "video/mp4", "size_bytes": 10, "multipart": true
        })).await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.text());
        let body = created.json();
        let id = body["id"].as_str().unwrap();
        let path = format!("/api/v2/uploads/{id}/multipart");
        let url = body["multipart"]["part_urls"][0].as_str().unwrap();
        let put = reqwest::Client::new()
            .put(url)
            .body("wrong")
            .send()
            .await
            .unwrap();
        assert!(put.status().is_success());
        let etag = put.headers()["etag"].to_str().unwrap();
        if mode == "wrong-size" {
            assert_eq!(
                app.post_as(&owner, &path, &serde_json::json!({"etags": [etag]}))
                    .await
                    .status,
                StatusCode::NO_CONTENT
            );
            let result = app
                .post_as(
                    &owner,
                    &format!("/api/v2/uploads/{id}/finalize"),
                    &serde_json::json!({}),
                )
                .await;
            assert_eq!(
                result.status,
                StatusCode::UNPROCESSABLE_ENTITY,
                "{}",
                result.text()
            );
        }
        if mode == "cancel" {
            let result = app
                .send(
                    Request::builder()
                        .method("DELETE")
                        .uri(&path)
                        .header("cookie", &owner.cookie)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await;
            assert_eq!(result.status, StatusCode::NO_CONTENT, "{}", result.text());
        } else {
            sqlx::query(
                "UPDATE uploads SET expires_at = now() - interval '1 second' WHERE id = $1",
            )
            .bind(uuid::Uuid::parse_str(id).unwrap())
            .execute(&app.pool)
            .await
            .unwrap();
            let storage = StorageClient::new(&StorageConfig {
                endpoint: std::env::var("TEST_S3_ENDPOINT")
                    .unwrap_or_else(|_| "http://localhost:9002".into()),
                access_key: "ashyq-dev".into(),
                secret_key: SecretString::from("ashyq-dev-secret"),
                public_bucket: "ab-public".into(),
                private_bucket: "ab-private".into(),
            })
            .unwrap();
            assert_eq!(
                ab_domain::files::uploads::reap_expired(&app.pool, &storage)
                    .await
                    .unwrap(),
                1
            );
        }
        let replay = reqwest::Client::new()
            .put(url)
            .body("after cleanup")
            .send()
            .await
            .unwrap();
        assert!(
            !replay.status().is_success(),
            "{mode} retained the multipart session"
        );
    }
}

#[ab_testdb::test]
async fn full_upload_finalize_download_flow(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("uploader", "u@example.com", &["user"])
        .await;
    let session = app.mint_session_for(user, &["file:create:own"]).await;
    let payload = b"fake png bytes".to_vec();

    let created = app
        .post_as(
            &session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "avatar", "mime": "image/png",
                                  "size_bytes": payload.len() }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK);
    let body = created.json();
    let id = body["id"].as_str().unwrap().to_owned();
    let put_url = body["put_url"].as_str().unwrap().to_owned();
    assert!(body["key"].as_str().unwrap().starts_with("avatar/"));

    // The browser's part: PUT the bytes straight to storage, declaring the
    // type the slot was created with (the signature pins it).
    let put = reqwest::Client::new()
        .put(&put_url)
        .header("content-type", "image/png")
        .header("if-none-match", "*")
        .body(payload.clone())
        .send()
        .await
        .unwrap();
    assert!(
        put.status().is_success(),
        "presigned PUT failed: {}",
        put.status()
    );

    // UX-058: finalize honours `Idempotency-Key` - a retry replays the
    // stored 200 instead of the "already finalized" 409.
    let finalize = || {
        app.send(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v2/uploads/{id}/finalize"))
                .header("cookie", &session.cookie)
                .header("idempotency-key", "fin-1")
                .body(Body::empty())
                .unwrap(),
        )
    };
    let finalized = finalize().await;
    assert_eq!(finalized.status, StatusCode::OK, "{}", finalized.text());
    assert_eq!(finalized.json()["size_bytes"], payload.len());
    let replayed = finalize().await;
    assert_eq!(replayed.status, StatusCode::OK, "{}", replayed.text());
    assert_eq!(replayed.json(), finalized.json());

    // BUG-350: the PUT URL is create-only - replaying it after finalize
    // cannot swap the bytes the ledger recorded, and dropping the signed
    // precondition breaks the signature.
    for precondition in [true, false] {
        let mut replay = reqwest::Client::new()
            .put(&put_url)
            .header("content-type", "image/png");
        if precondition {
            replay = replay.header("if-none-match", "*");
        }
        let replay = replay.body("replacement").send().await.unwrap();
        assert_eq!(
            replay.status(),
            if precondition { 412 } else { 403 },
            "the finalized object was replaced"
        );
    }

    // Download redirects to a presigned URL that serves the bytes.
    let download = app
        .get_as(&session, &format!("/api/v2/uploads/{id}/download"))
        .await;
    assert_eq!(download.status, StatusCode::SEE_OTHER);
    let url = download.headers.get("location").unwrap().to_str().unwrap();
    let fetched = reqwest::get(url).await.unwrap();
    assert_eq!(fetched.bytes().await.unwrap().to_vec(), payload);
}

#[ab_testdb::test]
async fn policy_rejects_oversize_and_wrong_mime(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("policied", "p@example.com", &["user"])
        .await;
    let session = app
        .mint_session_for(user, &["file:create:own", "course:update:own"])
        .await;

    let oversize = app
        .post_as(
            &session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "avatar", "mime": "image/png",
                                  "size_bytes": 50 * 1024 * 1024 }),
        )
        .await;
    assert_eq!(oversize.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(oversize.json()["field_errors"][0]["field"], "size_bytes");

    for (size_bytes, status) in [
        (2_147_483_648_i64, StatusCode::OK),
        (2_147_483_649_i64, StatusCode::UNPROCESSABLE_ENTITY),
    ] {
        for multipart in [false, true] {
            let video = app
                .post_as(
                    &session,
                    "/api/v2/uploads",
                    &serde_json::json!({ "purpose": "block-video", "mime": "video/mp4",
                                      "size_bytes": size_bytes, "multipart": multipart }),
                )
                .await;
            assert_eq!(video.status, status, "{}", video.text());
            if status == StatusCode::OK && multipart {
                assert_eq!(
                    video.json()["multipart"]["part_urls"]
                        .as_array()
                        .unwrap()
                        .len(),
                    64
                );
            }
        }
    }

    let wrong_mime = app
        .post_as(
            &session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "avatar", "mime": "application/zip",
                                  "size_bytes": 1000 }),
        )
        .await;
    assert_eq!(wrong_mime.status, StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert_eq!(wrong_mime.json()["code"], "unsupported-media-type");

    // The image allowlist is exact: no `image/*` prefix, no scriptable SVG.
    let svg = app
        .post_as(
            &session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "block-image", "mime": "image/svg+xml",
                                  "size_bytes": 1000 }),
        )
        .await;
    assert_eq!(svg.status, StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert_eq!(svg.json()["code"], "unsupported-media-type");

    let bad_purpose = app
        .post_as(
            &session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "warez", "mime": "image/png", "size_bytes": 10 }),
        )
        .await;
    assert_eq!(bad_purpose.status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[ab_testdb::test]
async fn finalize_without_object_is_a_conflict(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("ghost", "g@example.com", &["user"]).await;
    let session = app.mint_session_for(user, &["file:create:own"]).await;

    let created = app
        .post_as(
            &session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "avatar", "mime": "image/png", "size_bytes": 10 }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();

    // Never PUT anything → finalize must refuse.
    let finalized = app
        .post_as(
            &session,
            &format!("/api/v2/uploads/{id}/finalize"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(finalized.status, StatusCode::CONFLICT);

    // And someone else's upload is untouchable.
    let other = app.mint_session(&["file:create:own"]).await;
    let foreign = app
        .post_as(
            &other,
            &format!("/api/v2/uploads/{id}/finalize"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(foreign.status, StatusCode::FORBIDDEN);
}

/// Declare `image/png`, store HTML: the signed PUT refuses the header, and
/// an object that still lands with another type is rejected on finalize and
/// deleted - nothing served from the public bucket as `text/html`.
#[ab_testdb::test]
async fn finalize_rejects_a_content_type_mismatch(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("xss", "x@example.com", &["user"]).await;
    let session = app.mint_session_for(user, &["file:create:own"]).await;
    let html = b"<script>alert(1)</script>".to_vec();

    let created = app
        .post_as(
            &session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "avatar", "mime": "image/png",
                                  "size_bytes": html.len() }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK);
    let body = created.json();
    let id = body["id"].as_str().unwrap().to_owned();
    let key = body["key"].as_str().unwrap().to_owned();

    // The presigned URL is pinned to the declared type.
    let put = reqwest::Client::new()
        .put(body["put_url"].as_str().unwrap())
        .header("content-type", "text/html")
        .header("if-none-match", "*")
        .body(html.clone())
        .send()
        .await
        .unwrap();
    assert_eq!(
        put.status(),
        403,
        "storage accepted a mismatched content type"
    );

    // Backstop: an object that lands with another type anyway (a storage
    // that ignores signed headers) never finalizes and is removed.
    let storage = StorageClient::new(&StorageConfig {
        endpoint: std::env::var("TEST_S3_ENDPOINT")
            .unwrap_or_else(|_| "http://localhost:9002".into()),
        access_key: "ashyq-dev".into(),
        secret_key: SecretString::from("ashyq-dev-secret"),
        public_bucket: "ab-public".into(),
        private_bucket: "ab-private".into(),
    })
    .unwrap();
    storage.put(Bucket::Public, &key, html).await.unwrap();
    let finalized = app
        .post_as(
            &session,
            &format!("/api/v2/uploads/{id}/finalize"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(
        finalized.status,
        StatusCode::UNSUPPORTED_MEDIA_TYPE,
        "{}",
        finalized.text()
    );
    assert_eq!(finalized.json()["code"], "unsupported-media-type");
    assert_eq!(finalized.json()["details"]["declared"], "image/png");
    assert_eq!(storage.head(Bucket::Public, &key).await.unwrap(), None);
}

/// BUG-359: finalize verifies the declared size (ARCHITECTURE §11) - the
/// cap was checked against the intent, so a body of another length is
/// refused and the object dropped, never recorded with the "real" size.
#[ab_testdb::test]
async fn finalize_rejects_a_size_mismatch(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("sizer", "s@example.com", &["user"]).await;
    let session = app.mint_session_for(user, &["file:create:own"]).await;
    let payload = b"twenty-one bytes here".to_vec();

    let created = app
        .post_as(
            &session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "avatar", "mime": "image/png", "size_bytes": 5 }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK, "{}", created.text());
    let body = created.json();
    let id = body["id"].as_str().unwrap().to_owned();
    let key = body["key"].as_str().unwrap().to_owned();
    let put = reqwest::Client::new()
        .put(body["put_url"].as_str().unwrap())
        .header("content-type", "image/png")
        .header("if-none-match", "*")
        .body(payload)
        .send()
        .await
        .unwrap();
    assert!(put.status().is_success(), "{}", put.status());

    let finalized = app
        .post_as(
            &session,
            &format!("/api/v2/uploads/{id}/finalize"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(
        finalized.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        finalized.text()
    );
    assert_eq!(finalized.json()["field_errors"][0]["field"], "size_bytes");
    let storage = StorageClient::new(&StorageConfig {
        endpoint: std::env::var("TEST_S3_ENDPOINT")
            .unwrap_or_else(|_| "http://localhost:9002".into()),
        access_key: "ashyq-dev".into(),
        secret_key: SecretString::from("ashyq-dev-secret"),
        public_bucket: "ab-public".into(),
        private_bucket: "ab-private".into(),
    })
    .unwrap();
    assert_eq!(storage.head(Bucket::Public, &key).await.unwrap(), None);
    let status: String = sqlx::query_scalar("SELECT status FROM uploads WHERE id = $1::uuid")
        .bind(&id)
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(
        status, "pending",
        "a refused finalize leaves the slot pending"
    );
}

/// BUG-200: `file:create:own` covers the learner purposes only - platform
/// branding needs the platform grant, thumbnails and content blocks course
/// write access; a learner gets 403 before any presign.
#[ab_testdb::test]
async fn authoring_and_platform_purposes_need_their_grant(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("learner", "learner@example.com", &["user"])
        .await;
    let learner = app.mint_session_for(user, &["file:create:own"]).await;
    for purpose in ["platform-logo", "course-thumbnail", "block-video"] {
        let refused = app
            .post_as(
                &learner,
                "/api/v2/uploads",
                &serde_json::json!({ "purpose": purpose, "mime": "image/png", "size_bytes": 10 }),
            )
            .await;
        assert_eq!(
            refused.status,
            StatusCode::FORBIDDEN,
            "{purpose}: {}",
            refused.text()
        );
    }
    let allowed = app
        .post_as(
            &learner,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "avatar", "mime": "image/png", "size_bytes": 10 }),
        )
        .await;
    assert_eq!(allowed.status, StatusCode::OK, "{}", allowed.text());
    let pending: i64 = sqlx::query_scalar("SELECT count(*) FROM uploads")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(pending, 1, "refused purposes never reach the ledger");
}

/// REVIEW-1 H4: a file submission may be any type, but an active one
/// (HTML here) is stored for download only - the signed URL serves it as
/// `application/octet-stream` + `attachment`, never as `text/html`.
#[ab_testdb::test]
async fn html_file_submission_downloads_as_an_attachment(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("html", "h@example.com", &["user"]).await;
    let session = app.mint_session_for(user, &["file:create:own"]).await;
    let payload = b"<script>alert(document.domain)</script>".to_vec();
    let created = app
        .post_as(
            &session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "file-submission", "mime": "text/html",
                                  "size_bytes": payload.len() }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let put = reqwest::Client::new()
        .put(created.json()["put_url"].as_str().unwrap())
        .header("content-type", "text/html")
        .header("if-none-match", "*")
        .body(payload.clone())
        .send()
        .await
        .unwrap();
    assert!(put.status().is_success(), "presigned PUT: {}", put.status());
    let finalized = app
        .post_as(
            &session,
            &format!("/api/v2/uploads/{id}/finalize"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(finalized.status, StatusCode::OK, "{}", finalized.text());

    let download = app
        .get_as(&session, &format!("/api/v2/uploads/{id}/download"))
        .await;
    assert_eq!(download.status, StatusCode::SEE_OTHER);
    let url = download.headers.get("location").unwrap().to_str().unwrap();
    let fetched = reqwest::get(url).await.unwrap();
    assert!(fetched.status().is_success(), "{}", fetched.status());
    assert_eq!(fetched.headers()["content-disposition"], "attachment");
    assert_eq!(
        fetched.headers()["content-type"],
        "application/octet-stream"
    );
    assert_eq!(fetched.bytes().await.unwrap().to_vec(), payload);
}

/// BUG-B-9: the purpose policy and the uploads table's purpose CHECK drifted
/// (`discussion-image` answered 500). Every purpose the API accepts can be
/// stored.
#[ab_testdb::test]
async fn every_policy_purpose_can_be_stored(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("author", "a@example.com", &["user"]).await;
    let session = app
        .mint_session_for(
            user,
            &[
                "file:create:own",
                "course:update:own",
                "platform:update:platform",
                "collection:create:platform",
            ],
        )
        .await;
    for (purpose, mime) in [
        ("avatar", "image/png"),
        ("discussion-image", "image/png"),
        ("course-thumbnail", "image/png"),
        ("block-image", "image/png"),
        ("platform-logo", "image/png"),
        ("platform-thumbnail", "image/png"),
        ("collection-cover", "image/png"),
        ("block-pdf", "application/pdf"),
        ("block-video", "video/mp4"),
        ("file-submission", "application/zip"),
    ] {
        assert!(ab_domain::files::uploads::is_purpose(purpose), "{purpose}");
        let created = app
            .post_as(
                &session,
                "/api/v2/uploads",
                &serde_json::json!({ "purpose": purpose, "mime": mime, "size_bytes": 10 }),
            )
            .await;
        assert_eq!(
            created.status,
            StatusCode::OK,
            "{purpose}: {}",
            created.text()
        );
    }
}
