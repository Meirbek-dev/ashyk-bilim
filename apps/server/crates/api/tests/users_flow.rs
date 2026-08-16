//! User profile self-service flows.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::TestApp;
use axum::http::StatusCode;
use sqlx::PgPool;

#[sqlx::test(migrations = "../../migrations")]
async fn profile_read_and_partial_update(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("meirbek", "m@example.com", &["user"]).await;
    let session = app
        .mint_session_for(user, &["user:read:own", "user:update:own"])
        .await;

    let me = app.get_as(&session, "/api/v2/users/me").await;
    assert_eq!(me.status, StatusCode::OK);
    assert_eq!(me.json()["username"], "meirbek");
    assert_eq!(me.json()["locale"], "ru-RU");

    let updated = app
        .send(
            axum::http::Request::builder()
                .method("PATCH")
                .uri("/api/v2/users/me")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &session.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "display_name": "Meirbek", "locale": "kk-KZ" }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(updated.status, StatusCode::OK);
    assert_eq!(updated.json()["display_name"], "Meirbek");
    assert_eq!(updated.json()["locale"], "kk-KZ");
    // Untouched fields survive the partial update.
    assert_eq!(updated.json()["email"], "m@example.com");
}

#[sqlx::test(migrations = "../../migrations")]
async fn profile_update_requires_the_permission(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("noperm", "n@example.com", &[]).await;
    let session = app.mint_session_for(user, &[]).await;

    let res = app
        .send(
            axum::http::Request::builder()
                .method("PATCH")
                .uri("/api/v2/users/me")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &session.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "display_name": "x" }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(res.status, StatusCode::FORBIDDEN);
    assert_eq!(res.json()["code"], "forbidden");
}

#[sqlx::test(migrations = "../../migrations")]
async fn unsupported_locale_is_rejected(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("loc", "l@example.com", &["user"]).await;
    let session = app.mint_session_for(user, &["user:update:own"]).await;

    let res = app
        .send(
            axum::http::Request::builder()
                .method("PATCH")
                .uri("/api/v2/users/me")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &session.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "locale": "fr-FR" }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(res.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(res.json()["field_errors"][0]["field"], "locale");
}

#[sqlx::test(migrations = "../../migrations")]
async fn avatar_claims_upload_and_releases_replaced(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("selfie", "selfie@example.com", &["user"])
        .await;
    let session = app
        .mint_session_for(user, &["user:update:own", "file:create:own"])
        .await;

    let upload_avatar = |mime: &'static str| {
        let app = &app;
        let session = &session;
        async move {
            let payload = b"avatar bytes".to_vec();
            let created = app
                .post_as(
                    session,
                    "/api/v2/uploads",
                    &serde_json::json!({ "purpose": "avatar", "mime": mime,
                                          "size_bytes": payload.len() }),
                )
                .await;
            assert_eq!(created.status, StatusCode::OK);
            let id = created.json()["id"].as_str().unwrap().to_owned();
            let put_url = created.json()["put_url"].as_str().unwrap().to_owned();
            let put = reqwest::Client::new()
                .put(&put_url)
                .body(payload)
                .send()
                .await
                .unwrap();
            assert!(put.status().is_success());
            let finalized = app
                .post_as(
                    session,
                    &format!("/api/v2/uploads/{id}/finalize"),
                    &serde_json::json!({}),
                )
                .await;
            assert_eq!(finalized.status, StatusCode::OK);
            (id, finalized.json()["key"].as_str().unwrap().to_owned())
        }
    };

    let (first_id, first_key) = upload_avatar("image/png").await;
    let set = app
        .patch_as(
            &session,
            "/api/v2/users/me",
            &serde_json::json!({ "avatar_upload_id": first_id }),
        )
        .await;
    assert_eq!(set.status, StatusCode::OK);
    assert_eq!(set.json()["avatar_key"], first_key.as_str());

    // Replacing releases the old object back to the reaper.
    let (second_id, second_key) = upload_avatar("image/webp").await;
    let replaced = app
        .patch_as(
            &session,
            "/api/v2/users/me",
            &serde_json::json!({ "avatar_upload_id": second_id }),
        )
        .await;
    assert_eq!(replaced.status, StatusCode::OK);
    assert_eq!(replaced.json()["avatar_key"], second_key.as_str());
    let expiring: bool =
        sqlx::query_scalar("SELECT expires_at IS NOT NULL FROM uploads WHERE id = $1")
            .bind(uuid::Uuid::parse_str(&first_id).unwrap())
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert!(expiring, "replaced avatar must re-enter the reaper queue");

    // Wrong-purpose uploads are refused.
    let wrong = app
        .post_as(
            &session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "block-image", "mime": "image/png",
                                  "size_bytes": 4 }),
        )
        .await;
    let wrong_id = wrong.json()["id"].as_str().unwrap().to_owned();
    let refused = app
        .patch_as(
            &session,
            "/api/v2/users/me",
            &serde_json::json!({ "avatar_upload_id": wrong_id }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test(migrations = "../../migrations")]
async fn admin_lists_users_and_disables_accounts(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let admin_user = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app
        .mint_session_for(
            admin_user,
            &["platform:read:platform", "platform:manage:platform"],
        )
        .await;
    let victim = app
        .create_user("troublemaker", "t@example.com", &["user"])
        .await;
    let victim_session = app.mint_session_for(victim, &["user:read:own"]).await;

    // Listing shows both, with roles; the q filter narrows.
    let listed = app.get_as(&admin, "/api/v2/users").await;
    assert_eq!(listed.status, StatusCode::OK);
    assert_eq!(listed.json()["items"].as_array().unwrap().len(), 2);
    let filtered = app.get_as(&admin, "/api/v2/users?q=trouble").await;
    let items = filtered.json()["items"].as_array().unwrap().clone();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["username"], "troublemaker");
    assert_eq!(items[0]["roles"], serde_json::json!(["user"]));

    // A non-admin (even with the broad user:read:platform) cannot list.
    let pleb = app.mint_session(&["user:read:platform"]).await;
    let denied = app.get_as(&pleb, "/api/v2/users").await;
    assert_eq!(denied.status, StatusCode::FORBIDDEN);

    // Disabling revokes the victim's live session and blocks re-login paths.
    let disabled = app
        .patch_as(
            &admin,
            &format!("/api/v2/users/{victim}/status"),
            &serde_json::json!({ "disabled": true }),
        )
        .await;
    assert_eq!(disabled.status, StatusCode::NO_CONTENT);
    let dead = app.get_as(&victim_session, "/api/v2/users/me").await;
    assert_eq!(dead.status, StatusCode::UNAUTHORIZED);

    // Self-disable is refused; re-enable works.
    let own = app
        .patch_as(
            &admin,
            &format!("/api/v2/users/{admin_user}/status"),
            &serde_json::json!({ "disabled": true }),
        )
        .await;
    assert_eq!(own.status, StatusCode::CONFLICT);
    let enabled = app
        .patch_as(
            &admin,
            &format!("/api/v2/users/{victim}/status"),
            &serde_json::json!({ "disabled": false }),
        )
        .await;
    assert_eq!(enabled.status, StatusCode::NO_CONTENT);
}
