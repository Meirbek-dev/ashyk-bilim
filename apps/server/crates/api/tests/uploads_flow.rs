//! Upload pipeline end-to-end: presigned PUT to real RustFS, finalize
//! verification, presigned download, policy rejections, reaper.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::TestApp;
use axum::http::StatusCode;
use sqlx::PgPool;

#[sqlx::test(migrations = "../../migrations")]
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

    // The browser's part: PUT the bytes straight to storage.
    let put = reqwest::Client::new()
        .put(&put_url)
        .body(payload.clone())
        .send()
        .await
        .unwrap();
    assert!(
        put.status().is_success(),
        "presigned PUT failed: {}",
        put.status()
    );

    let finalized = app
        .post_as(
            &session,
            &format!("/api/v2/uploads/{id}/finalize"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(finalized.status, StatusCode::OK);
    assert_eq!(finalized.json()["size_bytes"], payload.len());

    // Download redirects to a presigned URL that serves the bytes.
    let download = app
        .get_as(&session, &format!("/api/v2/uploads/{id}/download"))
        .await;
    assert_eq!(download.status, StatusCode::SEE_OTHER);
    let url = download.headers.get("location").unwrap().to_str().unwrap();
    let fetched = reqwest::get(url).await.unwrap();
    assert_eq!(fetched.bytes().await.unwrap().to_vec(), payload);
}

#[sqlx::test(migrations = "../../migrations")]
async fn policy_rejects_oversize_and_wrong_mime(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("policied", "p@example.com", &["user"])
        .await;
    let session = app.mint_session_for(user, &["file:create:own"]).await;

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

    let wrong_mime = app
        .post_as(
            &session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "avatar", "mime": "application/zip",
                                  "size_bytes": 1000 }),
        )
        .await;
    assert_eq!(wrong_mime.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(wrong_mime.json()["field_errors"][0]["field"], "mime");

    let bad_purpose = app
        .post_as(
            &session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "warez", "mime": "image/png", "size_bytes": 10 }),
        )
        .await;
    assert_eq!(bad_purpose.status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test(migrations = "../../migrations")]
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
