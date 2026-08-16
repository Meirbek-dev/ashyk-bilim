//! First-party Google sign-in flows (wiremock Google + Zitadel).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{TEST_GOOGLE_CLIENT_ID, TestApp};
use axum::http::StatusCode;
use base64::Engine;
use sqlx::PgPool;
use wiremock::matchers::{body_string_contains, method, path};
use wiremock::{Mock, ResponseTemplate};

/// Unsigned id_token with the given claims (signature is not verified by
/// design — the token arrives from the token endpoint over TLS).
fn fake_id_token(sub: &str, email: &str) -> String {
    let b64 = |v: &serde_json::Value| {
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(v.to_string())
    };
    let header = b64(&serde_json::json!({ "alg": "RS256", "typ": "JWT" }));
    let payload = b64(&serde_json::json!({
        "iss": "https://accounts.google.com",
        "aud": TEST_GOOGLE_CLIENT_ID,
        "sub": sub,
        "email": email,
        "given_name": "Google",
        "family_name": "User",
    }));
    format!("{header}.{payload}.unsigned")
}

async fn mock_google_token(app: &TestApp, sub: &str, email: &str) {
    Mock::given(method("POST"))
        .and(path("/token"))
        .and(body_string_contains("grant_type=authorization_code"))
        .and(body_string_contains("code_verifier="))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "access_token": "ya29.test",
            "id_token": fake_id_token(sub, email),
            "token_type": "Bearer",
        })))
        .mount(&app.google)
        .await;
}

async fn mock_zitadel_user_create(app: &TestApp, expect: u64) {
    Mock::given(method("POST"))
        .and(path("/v2/users/human"))
        .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
            "userId": "z-google-1",
            "details": {}
        })))
        .expect(expect)
        .mount(&app.zitadel)
        .await;
}

/// Drive start → extract state from the authorize redirect → callback.
async fn start_and_get_state(app: &TestApp, callback: &str) -> String {
    let res = app
        .get(&format!("/api/v2/auth/google?callback={callback}"))
        .await;
    assert_eq!(res.status, StatusCode::SEE_OTHER);
    let location = res.headers.get("location").unwrap().to_str().unwrap();
    assert!(
        location.contains("code_challenge="),
        "PKCE challenge present"
    );
    let url = reqwest::Url::parse(location).unwrap();
    url.query_pairs()
        .find(|(k, _)| k == "state")
        .map(|(_, v)| v.into_owned())
        .expect("state param")
}

#[sqlx::test(migrations = "../../migrations")]
async fn google_signup_creates_user_and_session(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    mock_zitadel_user_create(&app, 1).await;
    mock_google_token(&app, "g-sub-1", "newbie@gmail.com").await;

    let state = start_and_get_state(&app, "/courses").await;
    let res = app
        .get(&format!(
            "/api/v2/auth/google/callback?code=authcode&state={state}"
        ))
        .await;
    assert_eq!(res.status, StatusCode::SEE_OTHER);
    assert_eq!(
        res.headers.get("location").unwrap().to_str().unwrap(),
        "/courses"
    );
    let cookie = res.session_cookie().expect("session cookie set");

    // The session is live and carries the default `user` role grants.
    let session = app
        .send(
            axum::http::Request::builder()
                .uri("/api/v2/auth/session")
                .header(axum::http::header::COOKIE, &cookie)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(session.status, StatusCode::OK);
    assert!(
        session.json()["roles"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("user"))
    );

    // DB state: user + google link, username from the email local part.
    let (username, email): (String, String) = sqlx::query_as("SELECT username, email FROM users")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(username, "newbie");
    assert_eq!(email, "newbie@gmail.com");
    let linked: i64 =
        sqlx::query_scalar("SELECT count(*) FROM google_accounts WHERE google_sub = 'g-sub-1'")
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(linked, 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn repeat_google_login_reuses_the_account(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    mock_zitadel_user_create(&app, 1).await; // only the first login creates
    mock_google_token(&app, "g-sub-2", "repeat@gmail.com").await;

    for _ in 0..2 {
        let state = start_and_get_state(&app, "/").await;
        let res = app
            .get(&format!(
                "/api/v2/auth/google/callback?code=c&state={state}"
            ))
            .await;
        assert_eq!(res.status, StatusCode::SEE_OTHER);
        assert!(res.session_cookie().is_some());
    }
    let users: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(users, 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn google_login_links_to_existing_email_account(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let existing = app
        .create_user("veteran", "vet@example.com", &["instructor"])
        .await;
    mock_zitadel_user_create(&app, 0).await; // linking must NOT create anyone
    mock_google_token(&app, "g-sub-3", "vet@example.com").await;

    let state = start_and_get_state(&app, "/").await;
    let res = app
        .get(&format!(
            "/api/v2/auth/google/callback?code=c&state={state}"
        ))
        .await;
    assert_eq!(res.status, StatusCode::SEE_OTHER);

    let linked_user: String = sqlx::query_scalar(
        "SELECT user_id::text FROM google_accounts WHERE google_sub = 'g-sub-3'",
    )
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(linked_user, existing.to_string());
}

#[sqlx::test(migrations = "../../migrations")]
async fn stale_state_redirects_to_login_with_error(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let res = app
        .get("/api/v2/auth/google/callback?code=c&state=forged")
        .await;
    assert_eq!(res.status, StatusCode::SEE_OTHER);
    assert_eq!(
        res.headers.get("location").unwrap().to_str().unwrap(),
        "/auth/login?error=google-oauth-expired"
    );
    assert!(res.session_cookie().is_none());
}

#[sqlx::test(migrations = "../../migrations")]
async fn absolute_callback_urls_are_rejected(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    for evil in ["https://evil.example", "//evil.example"] {
        let res = app
            .get(&format!("/api/v2/auth/google?callback={evil}"))
            .await;
        assert_eq!(res.status, StatusCode::SEE_OTHER);
        assert_eq!(
            res.headers.get("location").unwrap().to_str().unwrap(),
            "/auth/login?error=validation-failed",
            "callback {evil} must not be honored"
        );
    }
}
