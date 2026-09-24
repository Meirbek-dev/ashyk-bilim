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
fn fake_id_token(sub: &str, email: &str, email_verified: bool) -> String {
    let b64 = |v: &serde_json::Value| {
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(v.to_string())
    };
    let header = b64(&serde_json::json!({ "alg": "RS256", "typ": "JWT" }));
    let payload = b64(&serde_json::json!({
        "iss": "https://accounts.google.com",
        "aud": TEST_GOOGLE_CLIENT_ID,
        "sub": sub,
        "email": email,
        "email_verified": email_verified,
        "given_name": "Google",
        "family_name": "User",
    }));
    format!("{header}.{payload}.unsigned")
}

async fn mock_google_token(app: &TestApp, sub: &str, email: &str) {
    mock_google_token_verified(app, sub, email, true).await;
}

async fn mock_google_token_verified(app: &TestApp, sub: &str, email: &str, verified: bool) {
    Mock::given(method("POST"))
        .and(path("/token"))
        .and(body_string_contains("grant_type=authorization_code"))
        .and(body_string_contains("code_verifier="))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "access_token": "ya29.test",
            "id_token": fake_id_token(sub, email, verified),
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

/// Zitadel's view of a testkit user's (`z-<username>`) email verification.
async fn mock_zitadel_email_verified(app: &TestApp, username: &str, verified: bool) {
    Mock::given(method("GET"))
        .and(path(format!("/v2/users/z-{username}")))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "user": { "human": { "email": { "email": "x@example.com", "isVerified": verified } } }
        })))
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
    let (username, email, locale): (String, String, String) =
        sqlx::query_as("SELECT username, email, locale FROM users")
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(username, "newbie");
    assert_eq!(email, "newbie@gmail.com");
    // UX-132: Google sign-up carries no Accept-Language → default locale.
    assert_eq!(locale, "ru-RU");
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
    mock_zitadel_email_verified(&app, "veteran", true).await;
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

/// `AB__SERVER__WEB_URL` anchors both browser-facing redirects (the API may
/// live on another origin than the web app) — DECISIONS 2026-09-12.
#[sqlx::test(migrations = "../../migrations")]
async fn web_url_makes_browser_redirects_absolute(pool: PgPool) {
    let app = TestApp::spawn_with(pool, |config| {
        config.server.web_url = Some("https://app.example/".into());
    })
    .await;

    // Error path.
    let res = app
        .get("/api/v2/auth/google/callback?code=c&state=forged")
        .await;
    assert_eq!(res.status, StatusCode::SEE_OTHER);
    assert_eq!(
        res.headers.get("location").unwrap().to_str().unwrap(),
        "https://app.example/auth/login?error=google-oauth-expired"
    );

    // Success path: the relative callback lands on the web origin.
    mock_zitadel_user_create(&app, 1).await;
    mock_google_token(&app, "g-sub-9", "abs@gmail.com").await;
    let state = start_and_get_state(&app, "/courses").await;
    let res = app
        .get(&format!(
            "/api/v2/auth/google/callback?code=authcode&state={state}"
        ))
        .await;
    assert_eq!(res.status, StatusCode::SEE_OTHER);
    assert_eq!(
        res.headers.get("location").unwrap().to_str().unwrap(),
        "https://app.example/courses"
    );
    assert!(res.session_cookie().is_some());
}

/// Branch #71: a disabled account cannot sign in through Google either —
/// back to login with `?error=account-disabled`, no cookie.
#[sqlx::test(migrations = "../../migrations")]
async fn disabled_account_is_sent_back_with_account_disabled(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("banned", "banned@example.com", &["user"])
        .await;
    sqlx::query("UPDATE users SET status = 'disabled'")
        .execute(&app.pool)
        .await
        .unwrap();
    mock_zitadel_user_create(&app, 0).await;
    mock_zitadel_email_verified(&app, "banned", true).await;
    mock_google_token(&app, "g-sub-banned", "banned@example.com").await;

    let state = start_and_get_state(&app, "/").await;
    let res = app
        .get(&format!(
            "/api/v2/auth/google/callback?code=c&state={state}"
        ))
        .await;
    assert_eq!(res.status, StatusCode::SEE_OTHER);
    assert_eq!(
        res.headers.get("location").unwrap().to_str().unwrap(),
        "/auth/login?error=account-disabled"
    );
    assert!(res.session_cookie().is_none());
}

/// BUG-203: the Google callback is fenced like the password login — a
/// disable landing while the account is being read (methods listing parked
/// by a slow Zitadel) yields `account-disabled`, never a session.
#[sqlx::test(migrations = "../../migrations")]
async fn callback_in_flight_during_a_disable_gets_no_session(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let boss = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app.mint_session_for(boss, &["*:*:*"]).await;
    let user = app
        .create_user("graced", "graced@example.com", &["user"])
        .await;
    mock_zitadel_user_create(&app, 0).await;
    mock_zitadel_email_verified(&app, "graced", true).await;
    mock_google_token(&app, "g-sub-graced", "graced@example.com").await;
    Mock::given(method("GET"))
        .and(path("/v2/users/z-graced/authentication_methods"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_delay(std::time::Duration::from_millis(400))
                .set_body_json(serde_json::json!({ "authMethodTypes": [] })),
        )
        .mount(&app.zitadel)
        .await;
    let state = start_and_get_state(&app, "/").await;

    let url = format!("/api/v2/auth/google/callback?code=c&state={state}");
    let (res, ()) = tokio::join!(app.get(&url), async {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let res = app
            .patch_as(
                &admin,
                &format!("/api/v2/users/{user}/status"),
                &serde_json::json!({ "disabled": true }),
            )
            .await;
        assert_eq!(res.status, StatusCode::NO_CONTENT, "{}", res.text());
    });
    assert_eq!(res.status, StatusCode::SEE_OTHER);
    assert_eq!(
        res.headers.get("location").unwrap().to_str().unwrap(),
        "/auth/login?error=account-disabled"
    );
    assert!(res.session_cookie().is_none());
    assert!(app.sessions.list(user).await.unwrap().is_empty());
}

/// One full callback round-trip with whatever Google mock is mounted.
async fn google_callback(app: &TestApp) -> ab_testkit::TestResponse {
    let state = start_and_get_state(app, "/").await;
    app.get(&format!(
        "/api/v2/auth/google/callback?code=c&state={state}"
    ))
    .await
}

async fn session_user_id(app: &TestApp, cookie: &str) -> String {
    let session = app
        .send(
            axum::http::Request::builder()
                .uri("/api/v2/auth/session")
                .header(axum::http::header::COOKIE, cookie)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(session.status, StatusCode::OK, "{}", session.text());
    session.json()["user_id"].as_str().unwrap().to_owned()
}

async fn link_sub(app: &TestApp, user: ab_core::id::UserId, sub: &str, email: &str) {
    sqlx::query("INSERT INTO google_accounts (google_sub, user_id, email) VALUES ($1, $2, $3)")
        .bind(sub)
        .bind(user.0)
        .bind(email)
        .execute(&app.pool)
        .await
        .unwrap();
}

/// BUG-253: the Google email of a sub-linked account moved to an address
/// nobody here holds — the session opens for the linked account (was 500
/// «google user vanished», locking a passwordless account out).
#[sqlx::test(migrations = "../../migrations")]
async fn sub_linked_login_survives_a_changed_google_email(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let linked = app.create_user("moved", "old@gmail.com", &["user"]).await;
    link_sub(&app, linked, "g-sub-moved", "old@gmail.com").await;
    mock_zitadel_user_create(&app, 0).await;
    mock_google_token(&app, "g-sub-moved", "new@gmail.com").await;

    let res = google_callback(&app).await;
    assert_eq!(res.status, StatusCode::SEE_OTHER);
    let cookie = res.session_cookie().expect("session cookie set");
    assert_eq!(session_user_id(&app, &cookie).await, linked.to_string());
}

/// BUG-253: the new Google email is another account's — status and the
/// session come from the sub-linked account, never from that other row.
#[sqlx::test(migrations = "../../migrations")]
async fn sub_linked_login_ignores_the_account_owning_the_new_email(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let linked = app
        .create_user("linked", "linked@gmail.com", &["user"])
        .await;
    let other = app.create_user("other", "other@gmail.com", &["user"]).await;
    link_sub(&app, linked, "g-sub-linked", "linked@gmail.com").await;
    mock_zitadel_user_create(&app, 0).await;
    mock_google_token(&app, "g-sub-linked", "other@gmail.com").await;

    // Active linked account, disabled other: the login goes through as `linked`.
    sqlx::query("UPDATE users SET status = 'disabled' WHERE id = $1")
        .bind(other.0)
        .execute(&app.pool)
        .await
        .unwrap();
    let res = google_callback(&app).await;
    let cookie = res.session_cookie().expect("session cookie set");
    assert_eq!(session_user_id(&app, &cookie).await, linked.to_string());

    // Disabled linked account, active other: refused.
    sqlx::query("UPDATE users SET status = CASE WHEN id = $1 THEN 'disabled' ELSE 'active' END")
        .bind(linked.0)
        .execute(&app.pool)
        .await
        .unwrap();
    let res = google_callback(&app).await;
    assert_eq!(
        res.headers.get("location").unwrap().to_str().unwrap(),
        "/auth/login?error=account-disabled"
    );
    assert!(res.session_cookie().is_none());
}

/// BUG-254: a sub miss matching an existing email links only when Google
/// and the local account both verified the address; otherwise the browser
/// goes back to login with `account-exists` — no link, no session.
#[sqlx::test(migrations = "../../migrations")]
async fn google_login_refuses_to_link_an_unverified_email(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("squatted", "victim@gmail.com", &["user"])
        .await;
    for (google_verified, local_verified) in [(false, true), (true, false), (false, false)] {
        app.zitadel.reset().await;
        app.google.reset().await;
        mock_zitadel_user_create(&app, 0).await;
        mock_zitadel_email_verified(&app, "squatted", local_verified).await;
        mock_google_token_verified(&app, "g-sub-victim", "victim@gmail.com", google_verified).await;

        let res = google_callback(&app).await;
        assert_eq!(res.status, StatusCode::SEE_OTHER);
        assert_eq!(
            res.headers.get("location").unwrap().to_str().unwrap(),
            "/auth/login?error=account-exists",
            "google_verified={google_verified} local_verified={local_verified}"
        );
        assert!(res.session_cookie().is_none());
    }
    let linked: i64 = sqlx::query_scalar("SELECT count(*) FROM google_accounts")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(linked, 0);
}
