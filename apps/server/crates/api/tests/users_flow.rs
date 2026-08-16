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
