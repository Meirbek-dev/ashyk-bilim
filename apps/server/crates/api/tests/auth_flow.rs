//! End-to-end auth flows: real router + DB + Redis, wiremock Zitadel.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::TestApp;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use sqlx::PgPool;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

async fn mock_password_ok(zitadel: &MockServer) {
    Mock::given(method("POST"))
        .and(path("/v2/sessions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "sessionId": "zit-session-1",
            "sessionToken": "zit-token-1",
            "details": {}
        })))
        .mount(zitadel)
        .await;
}

async fn mock_password_invalid(zitadel: &MockServer) {
    Mock::given(method("POST"))
        .and(path("/v2/sessions"))
        .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
            "code": 3,
            "message": "Password is invalid (COMMAND-3M0fs)",
            "details": [{ "failedAttempts": 1 }]
        })))
        .mount(zitadel)
        .await;
}

#[sqlx::test(migrations = "../../migrations")]
async fn full_login_logout_flow(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("meirbek", "m@example.com", &["instructor"])
        .await;
    mock_password_ok(&app.zitadel).await;
    // Zitadel-side logout during our logout:
    Mock::given(method("DELETE"))
        .and(path("/v2/sessions/zit-session-1"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
        .expect(1)
        .mount(&app.zitadel)
        .await;

    let login = app
        .post_json(
            "/api/v2/auth/login",
            &serde_json::json!({ "login": "meirbek", "password": "correct horse" }),
        )
        .await;
    assert_eq!(login.status, StatusCode::OK);
    let cookie = login.session_cookie().expect("session cookie set");
    let body = login.json();
    assert_eq!(body["roles"], serde_json::json!(["instructor"]));
    assert!(
        body["permissions"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("course:update:own")),
        "instructor grants present"
    );

    // The cookie authenticates.
    let session = app
        .send(
            Request::builder()
                .uri("/api/v2/auth/session")
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(session.status, StatusCode::OK);

    // Logout revokes and clears.
    let logout = app
        .send(
            Request::builder()
                .method("POST")
                .uri("/api/v2/auth/logout")
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(logout.status, StatusCode::NO_CONTENT);

    let after = app
        .send(
            Request::builder()
                .uri("/api/v2/auth/session")
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(after.status, StatusCode::UNAUTHORIZED);

    // Audit trail recorded both events.
    let events: Vec<String> =
        sqlx::query_scalar("SELECT event FROM auth_audit_log ORDER BY created_at")
            .fetch_all(&app.pool)
            .await
            .unwrap();
    assert_eq!(events, vec!["login", "logout"]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn wrong_password_is_uniform_invalid_credentials(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("meirbek", "m@example.com", &["user"]).await;
    mock_password_invalid(&app.zitadel).await;

    let res = app
        .post_json(
            "/api/v2/auth/login",
            &serde_json::json!({ "login": "meirbek", "password": "wrong" }),
        )
        .await;
    assert_eq!(res.status, StatusCode::UNAUTHORIZED);
    assert_eq!(res.json()["code"], "invalid-credentials");
    assert!(res.session_cookie().is_none());

    let audited: i64 =
        sqlx::query_scalar("SELECT count(*) FROM auth_audit_log WHERE event = 'login-failed'")
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(audited, 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn unknown_user_gets_the_same_error(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    Mock::given(method("POST"))
        .and(path("/v2/sessions"))
        .respond_with(ResponseTemplate::new(404).set_body_json(serde_json::json!({
            "code": 5,
            "message": "User not found"
        })))
        .mount(&app.zitadel)
        .await;

    let res = app
        .post_json(
            "/api/v2/auth/login",
            &serde_json::json!({ "login": "ghost@example.com", "password": "whatever" }),
        )
        .await;
    assert_eq!(res.status, StatusCode::UNAUTHORIZED);
    assert_eq!(res.json()["code"], "invalid-credentials");
}

#[sqlx::test(migrations = "../../migrations")]
async fn disabled_account_is_blocked_after_password_check(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("blocked", "b@example.com", &["user"]).await;
    sqlx::query("UPDATE users SET status = 'disabled'")
        .execute(&app.pool)
        .await
        .unwrap();
    mock_password_ok(&app.zitadel).await;

    let res = app
        .post_json(
            "/api/v2/auth/login",
            &serde_json::json!({ "login": "blocked", "password": "correct horse" }),
        )
        .await;
    assert_eq!(res.status, StatusCode::FORBIDDEN);
    assert_eq!(res.json()["code"], "account-disabled");
}

#[sqlx::test(migrations = "../../migrations")]
async fn login_body_is_validated(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let res = app
        .post_json(
            "/api/v2/auth/login",
            &serde_json::json!({ "login": "", "password": "x" }),
        )
        .await;
    assert_eq!(res.status, StatusCode::UNPROCESSABLE_ENTITY);
    let body = res.json();
    assert_eq!(body["code"], "validation-failed");
    assert_eq!(body["field_errors"][0]["field"], "login");

    // Unknown fields are rejected (deny_unknown_fields).
    let res = app
        .post_json(
            "/api/v2/auth/login",
            &serde_json::json!({ "login": "a", "password": "b", "extra": true }),
        )
        .await;
    assert_eq!(res.status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test(migrations = "../../migrations")]
async fn login_name_rate_limit_kicks_in(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    mock_password_invalid(&app.zitadel).await;

    // Unique per run: the limiter window in shared test Redis outlives a test.
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let body =
        serde_json::json!({ "login": format!("hammered-{nonce}@example.com"), "password": "x" });
    for _ in 0..10 {
        let res = app.post_json("/api/v2/auth/login", &body).await;
        assert_eq!(res.status, StatusCode::UNAUTHORIZED);
    }
    let res = app.post_json("/api/v2/auth/login", &body).await;
    assert_eq!(res.status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(res.json()["code"], "rate-limited");
}

#[sqlx::test(migrations = "../../migrations")]
async fn session_management_lists_and_revokes_by_handle(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("multi", "multi@example.com", &["user"])
        .await;
    let a = app.mint_session_for(user, &["course:read:all"]).await;
    let _b = app.mint_session_for(user, &["course:read:all"]).await;

    let list = app.get_as(&a, "/api/v2/auth/sessions").await;
    assert_eq!(list.status, StatusCode::OK);
    let sessions = list.json();
    let sessions = sessions.as_array().unwrap();
    assert_eq!(sessions.len(), 2);
    let current_count = sessions.iter().filter(|s| s["current"] == true).count();
    assert_eq!(current_count, 1);

    // Handles are not raw session ids.
    let other = sessions.iter().find(|s| s["current"] == false).unwrap();
    let handle = other["handle"].as_str().unwrap();
    assert_eq!(handle.len(), 16);
    assert!(!a.cookie.contains(handle));

    let revoke = app
        .delete_as(&a, &format!("/api/v2/auth/sessions/{handle}"))
        .await;
    assert_eq!(revoke.status, StatusCode::NO_CONTENT);

    let list = app.get_as(&a, "/api/v2/auth/sessions").await;
    assert_eq!(list.json().as_array().unwrap().len(), 1);

    // Revoking an unknown handle 404s.
    let missing = app
        .delete_as(&a, "/api/v2/auth/sessions/ffffffffffffffff")
        .await;
    assert_eq!(missing.status, StatusCode::NOT_FOUND);
}
