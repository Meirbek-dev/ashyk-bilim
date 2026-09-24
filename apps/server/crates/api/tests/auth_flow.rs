//! End-to-end auth flows: real router + DB + Redis, wiremock Zitadel.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{TestApp, drop_request_when, wait_until};
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
    // No TOTP enrolled → the BFF's MFA check passes through.
    Mock::given(method("GET"))
        .and(path("/v2/users/z-meirbek/authentication_methods"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "details": { "totalResult": "1" },
            "authMethodTypes": ["AUTHENTICATION_METHOD_TYPE_PASSWORD"]
        })))
        .mount(&app.zitadel)
        .await;
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
    // Retry-After reflects the 15-minute name window, not a fixed minute.
    let retry_after: u64 = res.headers[header::RETRY_AFTER]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!(
        (61..=900).contains(&retry_after),
        "retry-after {retry_after}"
    );
    assert_eq!(res.json()["details"]["retry_after_seconds"], retry_after);
}

/// Viewing the sessions page must not keep idle sessions alive: listing is
/// a pure read (no idle-TTL refresh, no `last_seen` bump).
#[sqlx::test(migrations = "../../migrations")]
async fn listing_sessions_does_not_touch_them(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("peeker", "peeker@example.com", &["user"])
        .await;
    let current = app.mint_session_for(user, &[]).await;
    let idle = app.mint_session_for(user, &[]).await;
    let idle_key = format!("session:{}", idle.cookie.split_once('=').unwrap().1);
    let mut redis = app.sessions.redis();
    let () = redis::cmd("EXPIRE")
        .arg(&idle_key)
        .arg(100)
        .query_async(&mut redis)
        .await
        .unwrap();

    let list = app.get_as(&current, "/api/v2/auth/sessions").await;
    assert_eq!(list.status, StatusCode::OK);
    assert_eq!(list.json().as_array().unwrap().len(), 2);

    let ttl: i64 = redis::cmd("TTL")
        .arg(&idle_key)
        .query_async(&mut redis)
        .await
        .unwrap();
    assert!(
        (1..=100).contains(&ttl),
        "listing refreshed the idle TTL: {ttl}"
    );
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

/// BUG-191: a session touch in flight (read half done, write half pending)
/// must never resurrect a revoked session, keep a disabled account's session
/// alive, or undo a grant rewrite. The interleaving is driven explicitly:
/// `peek` is the touch's read, `touch` its write. A session whose id left
/// `user_sessions:{uid}` is dead even while its record key exists.
#[sqlx::test(migrations = "../../migrations")]
async fn touch_in_flight_never_outlives_a_revoke_or_a_grant_rewrite(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let boss = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app.mint_session_for(boss, &["*:*:*"]).await;
    let user = app
        .create_user("racer", "racer@example.com", &["user"])
        .await;
    let id_of = |s: &ab_testkit::MintedSession| s.cookie.split_once('=').unwrap().1.to_owned();

    // 1. revoke mid-touch: still 401 afterwards, not listed, key gone.
    let victim = app.mint_session_for(user, &[]).await;
    let other = app.mint_session_for(user, &[]).await;
    let list = app.get_as(&other, "/api/v2/auth/sessions").await;
    // The list order is not stable for two sessions minted in the same
    // millisecond: the victim is the row that is not `other` itself.
    let handle = list
        .json()
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["current"] == false)
        .unwrap()["handle"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(app.sessions.peek(&id_of(&victim)).await.unwrap().is_some());
    let revoke = app
        .delete_as(&other, &format!("/api/v2/auth/sessions/{handle}"))
        .await;
    assert_eq!(revoke.status, StatusCode::NO_CONTENT);
    app.sessions.touch(&id_of(&victim)).await.unwrap();
    assert_eq!(
        app.get_as(&victim, "/api/v2/auth/session").await.status,
        StatusCode::UNAUTHORIZED
    );
    let list = app.get_as(&other, "/api/v2/auth/sessions").await;
    assert_eq!(list.json().as_array().unwrap().len(), 1, "{}", list.text());
    let mut redis = app.sessions.redis();
    let exists: bool =
        redis::AsyncCommands::exists(&mut redis, format!("session:{}", id_of(&victim)))
            .await
            .unwrap();
    assert!(!exists, "late touch re-created the revoked record");

    // 2. disable mid-touch: the disabled account's session is 401.
    let disabled = app.create_user("gone", "gone@example.com", &["user"]).await;
    let ghost = app.mint_session_for(disabled, &[]).await;
    assert!(app.sessions.peek(&id_of(&ghost)).await.unwrap().is_some());
    let status = app
        .patch_as(
            &admin,
            &format!("/api/v2/users/{disabled}/status"),
            &serde_json::json!({ "disabled": true }),
        )
        .await;
    assert_eq!(status.status, StatusCode::NO_CONTENT, "{}", status.text());
    app.sessions.touch(&id_of(&ghost)).await.unwrap();
    assert_eq!(
        app.get_as(&ghost, "/api/v2/auth/session").await.status,
        StatusCode::UNAUTHORIZED
    );

    // 3. role change mid-touch: the new grants win.
    assert!(app.sessions.peek(&id_of(&other)).await.unwrap().is_some());
    let granted = app
        .post_as(
            &admin,
            &format!("/api/v2/users/{user}/roles"),
            &serde_json::json!({ "role": "instructor" }),
        )
        .await;
    assert_eq!(granted.status, StatusCode::NO_CONTENT, "{}", granted.text());
    app.sessions.touch(&id_of(&other)).await.unwrap();
    let session = app.get_as(&other, "/api/v2/auth/session").await;
    assert_eq!(session.status, StatusCode::OK);
    assert!(
        session.json()["roles"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("instructor")),
        "{}",
        session.text()
    );

    // 4. a record whose id is not in the user's registry is not a session.
    let () = redis::AsyncCommands::zrem(&mut redis, format!("user_sessions:{user}"), id_of(&other))
        .await
        .unwrap();
    assert_eq!(
        app.get_as(&other, "/api/v2/auth/session").await.status,
        StatusCode::UNAUTHORIZED
    );
}

// ── Self-registration, email verification, password change ─────────────────
// Zitadel shapes captured live 2026-09-12: create with `returnCode` answers
// `{userId, details, emailCode}`; a wrong verification code is code 3
// "Code is invalid"; a wrong current password on the password change is
// code 3 with a `CredentialsCheckError` detail; a policy-rejected new
// password is code 3 with a plain detail.

fn register_body(username: &str, email: &str) -> serde_json::Value {
    serde_json::json!({
        "username": username,
        "email": email,
        "password": "correct horse battery",
        "first_name": "Aigerim",
        "last_name": "Test",
    })
}

async fn mock_user_create_with_code(zitadel: &MockServer, code: &str) {
    Mock::given(method("POST"))
        .and(path("/v2/users/human"))
        .and(wiremock::matchers::body_partial_json(serde_json::json!({
            "email": { "returnCode": {} }
        })))
        .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
            "userId": "z-new-1",
            "details": {},
            "emailCode": code
        })))
        .expect(1)
        .mount(zitadel)
        .await;
}

#[sqlx::test(migrations = "../../migrations")]
async fn registration_creates_the_account_and_emails_the_code(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    mock_user_create_with_code(&app.zitadel, "ABC123").await;
    Mock::given(method("POST"))
        .and(path("/emails"))
        .and(wiremock::matchers::header(
            "authorization",
            "Bearer re_test",
        ))
        .and(wiremock::matchers::body_string_contains("ABC123"))
        .and(wiremock::matchers::body_string_contains(
            "aigerim@example.com",
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "id": "em-1" })))
        .expect(1)
        .mount(&app.resend)
        .await;

    let res = app
        .post_json(
            "/api/v2/auth/register",
            &register_body("aigerim", "aigerim@example.com"),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.json());
    let body = res.json();
    assert_eq!(body["username"], "aigerim");
    assert_eq!(body["display_name"], "Aigerim Test");
    assert_eq!(body["mfa_enabled"], false);
    assert!(res.session_cookie().is_none(), "no session is opened");

    let roles: Vec<String> = sqlx::query_scalar(
        "SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         JOIN users u ON u.id = ur.user_id WHERE u.username = 'aigerim'",
    )
    .fetch_all(&app.pool)
    .await
    .unwrap();
    assert_eq!(roles, vec!["user"]);

    // Verification: wrong code → 422 on `code`; right code → 204.
    Mock::given(method("POST"))
        .and(path("/v2/users/z-new-1/email/verify"))
        .and(wiremock::matchers::body_json(
            serde_json::json!({ "verificationCode": "WRONG1" }),
        ))
        .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
            "code": 3,
            "message": "Code is invalid (COMMAND-eis9R)",
            "details": [{ "id": "COMMAND-eis9R", "message": "Code is invalid" }]
        })))
        .mount(&app.zitadel)
        .await;
    Mock::given(method("POST"))
        .and(path("/v2/users/z-new-1/email/verify"))
        .and(wiremock::matchers::body_json(
            serde_json::json!({ "verificationCode": "ABC123" }),
        ))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({ "details": {} })),
        )
        .expect(1)
        .mount(&app.zitadel)
        .await;
    let wrong = app
        .post_json(
            "/api/v2/auth/verify-email",
            &serde_json::json!({ "email": "aigerim@example.com", "code": "WRONG1" }),
        )
        .await;
    assert_eq!(wrong.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(wrong.json()["field_errors"][0]["field"], "code");
    // Unknown email: same answer, no enumeration.
    let ghost = app
        .post_json(
            "/api/v2/auth/verify-email",
            &serde_json::json!({ "email": "ghost@example.com", "code": "ABC123" }),
        )
        .await;
    assert_eq!(ghost.status, StatusCode::UNPROCESSABLE_ENTITY);
    let ok = app
        .post_json(
            "/api/v2/auth/verify-email",
            &serde_json::json!({ "email": "aigerim@example.com", "code": "ABC123" }),
        )
        .await;
    assert_eq!(ok.status, StatusCode::NO_CONTENT);

    let events: Vec<String> =
        sqlx::query_scalar("SELECT event FROM auth_audit_log ORDER BY created_at")
            .fetch_all(&app.pool)
            .await
            .unwrap();
    assert_eq!(events, vec!["account-created", "email-verified"]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn registration_survives_an_email_outage(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    mock_user_create_with_code(&app.zitadel, "ABC123").await;
    // No Resend mount: the fake answers 404 and the flow must still 201.
    let res = app
        .post_json(
            "/api/v2/auth/register",
            &register_body("nomail", "nomail@example.com"),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.json());
}

#[sqlx::test(migrations = "../../migrations")]
async fn registration_rejects_taken_username_and_email(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("taken", "taken@example.com", &["user"])
        .await;
    // Neither collision reaches Zitadel.
    Mock::given(method("POST"))
        .and(path("/v2/users/human"))
        .respond_with(ResponseTemplate::new(500))
        .expect(0)
        .mount(&app.zitadel)
        .await;

    let res = app
        .post_json(
            "/api/v2/auth/register",
            &register_body("taken", "fresh@example.com"),
        )
        .await;
    assert_eq!(res.status, StatusCode::CONFLICT);
    assert_eq!(res.json()["code"], "username-taken");

    let res = app
        .post_json(
            "/api/v2/auth/register",
            &register_body("fresh", "taken@example.com"),
        )
        .await;
    assert_eq!(res.status, StatusCode::CONFLICT);
    assert_eq!(res.json()["code"], "email-taken");
}

/// UX-101: `POST /auth/register` honours `Idempotency-Key` (a retry replays
/// the 201 — one Zitadel create, one email) and the verification link is
/// prefixed with the `Accept-Language` locale (`/kz/auth/verify-email`).
/// UX-126: the same header seeds the stored profile `locale`.
#[sqlx::test(migrations = "../../migrations")]
async fn registration_is_idempotent_and_links_the_signers_locale(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    mock_user_create_with_code(&app.zitadel, "KZ1234").await;
    Mock::given(method("POST"))
        .and(path("/emails"))
        .and(wiremock::matchers::body_string_contains(
            "/kz/auth/verify-email?email=",
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "id": "em-2" })))
        .expect(1)
        .mount(&app.resend)
        .await;
    let body = register_body("dana", "dana@example.com");
    let send = || {
        app.send(
            Request::builder()
                .method("POST")
                .uri("/api/v2/auth/register")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::ACCEPT_LANGUAGE, "kk-KZ,ru;q=0.8")
                .header("Idempotency-Key", "signup-dana-1")
                .body(Body::from(body.to_string()))
                .expect("request build"),
        )
    };
    let first = send().await;
    assert_eq!(first.status, StatusCode::CREATED, "{}", first.text());
    assert_eq!(first.json()["locale"], "kk-KZ");
    let replay = send().await;
    assert_eq!(replay.status, StatusCode::CREATED, "{}", replay.text());
    assert_eq!(replay.json(), first.json());
}

/// UX-132: an unsupported `Accept-Language` (de-DE) and a missing header
/// both seed the default `ru-RU` locale (the Google path is pinned in
/// google_flow::google_signup_creates_user_and_session).
#[sqlx::test(migrations = "../../migrations")]
async fn registration_locale_falls_back_to_russian(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    for (username, accept_language) in [("hans", Some("de-DE,de;q=0.9")), ("nolang", None)] {
        Mock::given(method("POST"))
            .and(path("/v2/users/human"))
            .and(wiremock::matchers::body_partial_json(
                serde_json::json!({ "username": username }),
            ))
            .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
                "userId": format!("z-{username}"),
                "details": {},
                "emailCode": "CODE01"
            })))
            .expect(1)
            .mount(&app.zitadel)
            .await;
        let mut request = Request::builder()
            .method("POST")
            .uri("/api/v2/auth/register")
            .header(header::CONTENT_TYPE, "application/json");
        if let Some(accept_language) = accept_language {
            request = request.header(header::ACCEPT_LANGUAGE, accept_language);
        }
        let body = register_body(username, &format!("{username}@example.com"));
        let res = app
            .send(request.body(Body::from(body.to_string())).unwrap())
            .await;
        assert_eq!(res.status, StatusCode::CREATED, "{}", res.text());
        assert_eq!(res.json()["locale"], "ru-RU", "{accept_language:?}");
    }
}

/// Emails are case-insensitive identities: registration stores them
/// lower-cased, uniqueness and login ignore case (usernames too).
#[sqlx::test(migrations = "../../migrations")]
async fn email_and_username_are_case_insensitive(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("casey", "casey@example.com", &["user"])
        .await;
    mock_password_ok(&app.zitadel).await;
    Mock::given(method("GET"))
        .and(wiremock::matchers::path_regex(
            r"^/v2/users/.+/authentication_methods$",
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "authMethodTypes": ["AUTHENTICATION_METHOD_TYPE_PASSWORD"]
        })))
        .mount(&app.zitadel)
        .await;

    for taken in ["Casey@Example.com", "CASEY@EXAMPLE.COM"] {
        let res = app
            .post_json("/api/v2/auth/register", &register_body("fresh", taken))
            .await;
        assert_eq!(res.status, StatusCode::CONFLICT, "{taken}");
        assert_eq!(res.json()["code"], "email-taken");
    }
    let res = app
        .post_json(
            "/api/v2/auth/register",
            &register_body("CASEY", "other@example.com"),
        )
        .await;
    assert_eq!(res.json()["code"], "username-taken");

    // UX-110: surrounding whitespace is trimmed before the lookup.
    for login in ["CASEY@EXAMPLE.COM", "Casey", "  casey  "] {
        let res = app
            .post_json(
                "/api/v2/auth/login",
                &serde_json::json!({ "login": login, "password": "pw" }),
            )
            .await;
        assert_eq!(res.status, StatusCode::OK, "{login}: {}", res.text());
    }

    mock_user_create_with_code(&app.zitadel, "123456").await;
    let res = app
        .post_json(
            "/api/v2/auth/register",
            &register_body("mixed", "Mixed.Case@Example.COM"),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.text());
    assert_eq!(res.json()["email"], "mixed.case@example.com");
}

/// A password Zitadel's policy rejects is the user's mistake (422 on the
/// field), not an outage (503). Captured live 2026-09-13: code 3, COMMA-VoaRj.
#[sqlx::test(migrations = "../../migrations")]
async fn weak_password_is_a_field_error_not_an_outage(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    Mock::given(method("POST"))
        .and(path("/v2/users/human"))
        .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
            "code": 3,
            "message": "Password must contain upper case (COMMA-VoaRj)",
            "details": [{ "id": "COMMA-VoaRj", "message": "Password must contain upper case" }]
        })))
        .mount(&app.zitadel)
        .await;

    let res = app
        .post_json(
            "/api/v2/auth/register",
            &register_body("weak", "weak@example.com"),
        )
        .await;
    assert_eq!(
        res.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        res.text()
    );
    assert_eq!(res.json()["field_errors"][0]["field"], "password");
    assert_eq!(res.json()["field_errors"][0]["code"], "password-policy");
    // Nothing was created on our side.
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM users WHERE username = 'weak'")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

/// Ten typos behind one NAT must not lock the classroom out: only created
/// accounts count toward the 10/h cap; attempts have their own wider cap.
#[sqlx::test(migrations = "../../migrations")]
async fn registration_limit_counts_created_accounts_not_failed_attempts(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("taken", "taken@example.com", &["user"])
        .await;
    mock_user_create_with_code(&app.zitadel, "ABC123").await;
    // Unique per run: the limiter window in shared test Redis outlives a test.
    let ip = format!(
        "10.0.{}.{}",
        std::process::id() % 256,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
            % 256
    );
    let post = |body: serde_json::Value| {
        app.send(
            Request::builder()
                .method("POST")
                .uri("/api/v2/auth/register")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-forwarded-for", &ip)
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
    };

    for _ in 0..12 {
        let res = post(register_body("taken", "fresh@example.com")).await;
        assert_eq!(res.status, StatusCode::CONFLICT, "{}", res.json());
    }
    let res = post(register_body("fresh", "fresh@example.com")).await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.json());

    // Attempts still have a ceiling (enumeration stays throttled): 13 used.
    for _ in 13..60 {
        let res = post(register_body("taken", "fresh2@example.com")).await;
        assert_eq!(res.status, StatusCode::CONFLICT);
    }
    let res = post(register_body("taken", "fresh2@example.com")).await;
    assert_eq!(res.status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(res.json()["code"], "rate-limited");
}

#[sqlx::test(migrations = "../../migrations")]
async fn registration_body_is_validated(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let res = app
        .post_json(
            "/api/v2/auth/register",
            &serde_json::json!({
                "username": "bad name!",
                "email": "not-an-email",
                "password": "short",
                "first_name": "",
                "last_name": "X",
            }),
        )
        .await;
    assert_eq!(res.status, StatusCode::UNPROCESSABLE_ENTITY);
    let fields: Vec<String> = res.json()["field_errors"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["field"].as_str().unwrap().to_owned())
        .collect();
    for field in ["username", "email", "password", "first_name"] {
        assert!(
            fields.contains(&field.to_owned()),
            "{field} flagged: {fields:?}"
        );
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn password_change_checks_the_current_password_and_revokes_other_sessions(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("pwuser", "pw@example.com", &["user"]).await;
    let current = app.mint_session_for(user, &[]).await;
    let other = app.mint_session_for(user, &[]).await;
    let zid = format!("z-{user}");

    Mock::given(method("POST"))
        .and(path(format!("/v2/users/{zid}/password")))
        .and(wiremock::matchers::body_partial_json(serde_json::json!({
            "currentPassword": "wrong"
        })))
        .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
            "code": 3,
            "message": "Password is invalid (COMMAND-3M0fs)",
            "details": [{ "id": "COMMAND-3M0fs", "message": "Password is invalid", "failedAttempts": 1 }]
        })))
        .mount(&app.zitadel)
        .await;
    Mock::given(method("POST"))
        .and(path(format!("/v2/users/{zid}/password")))
        .and(wiremock::matchers::body_partial_json(serde_json::json!({
            "currentPassword": "old horse",
            "newPassword": { "password": "new horse battery", "changeRequired": false }
        })))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({ "details": {} })),
        )
        .expect(1)
        .mount(&app.zitadel)
        .await;

    let wrong = app
        .post_as(
            &current,
            "/api/v2/auth/password",
            &serde_json::json!({ "current_password": "wrong", "new_password": "new horse battery" }),
        )
        .await;
    assert_eq!(wrong.status, StatusCode::UNAUTHORIZED);
    assert_eq!(wrong.json()["code"], "invalid-credentials");

    let ok = app
        .post_as(
            &current,
            "/api/v2/auth/password",
            &serde_json::json!({ "current_password": "old horse", "new_password": "new horse battery" }),
        )
        .await;
    assert_eq!(ok.status, StatusCode::NO_CONTENT);

    // The current session survives, the other one is gone.
    assert_eq!(
        app.get_as(&current, "/api/v2/auth/session").await.status,
        StatusCode::OK
    );
    assert_eq!(
        app.get_as(&other, "/api/v2/auth/session").await.status,
        StatusCode::UNAUTHORIZED
    );

    // Anonymous callers cannot change anything.
    let anon = app
        .post_json(
            "/api/v2/auth/password",
            &serde_json::json!({ "current_password": "a", "new_password": "new horse battery" }),
        )
        .await;
    assert_eq!(anon.status, StatusCode::UNAUTHORIZED);
}

/// Zitadel reports "new password equals the current one" as an internal
/// error (code 13, COMMAND-CahN2; captured live 2026-09-13) — the user's
/// mistake, so a 422 on the field, not a 503.
#[sqlx::test(migrations = "../../migrations")]
async fn unchanged_password_is_a_field_error(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("samepw", "same@example.com", &["user"])
        .await;
    let session = app.mint_session_for(user, &[]).await;
    Mock::given(method("POST"))
        .and(path(format!("/v2/users/z-{user}/password")))
        .respond_with(ResponseTemplate::new(500).set_body_json(serde_json::json!({
            "code": 13,
            "message": "An internal error occurred (COMMAND-CahN2)",
            "details": [{ "id": "COMMAND-CahN2", "message": "An internal error occurred" }]
        })))
        .mount(&app.zitadel)
        .await;

    let res = app
        .post_as(
            &session,
            "/api/v2/auth/password",
            &serde_json::json!({ "current_password": "Same!Pass1", "new_password": "Same!Pass1" }),
        )
        .await;
    assert_eq!(
        res.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        res.text()
    );
    assert_eq!(res.json()["field_errors"][0]["field"], "new_password");
    assert_eq!(res.json()["field_errors"][0]["code"], "password-unchanged");
}

// ── Brute-force limits + session store caps (critic12 identity) ────────────

/// Unique per run: the limiter windows in shared test Redis outlive a test.
fn unique_ip() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!(
        "10.{}.{}.{}",
        std::process::id() % 256,
        (nanos / 256) % 256,
        nanos % 256
    )
}

async fn login_from(app: &TestApp, ip: &str, body: &serde_json::Value) -> ab_testkit::TestResponse {
    app.send(
        Request::builder()
            .method("POST")
            .uri("/api/v2/auth/login")
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-forwarded-for", ip)
            .body(Body::from(body.to_string()))
            .unwrap(),
    )
    .await
}

/// BUG-130 (branch #2): a classroom behind one NAT — every browser shares
/// `X-Forwarded-For` behind Next — logs in twenty-plus times; only failed
/// passwords count toward the 20 per 5 min IP cap.
#[sqlx::test(migrations = "../../migrations")]
async fn ip_limit_counts_failed_logins_only(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("nat", "nat@example.com", &["user"]).await;
    mock_password_ok(&app.zitadel).await;
    Mock::given(method("GET"))
        .and(path("/v2/users/z-nat/authentication_methods"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "details": { "totalResult": "1" },
            "authMethodTypes": ["AUTHENTICATION_METHOD_TYPE_PASSWORD"]
        })))
        .mount(&app.zitadel)
        .await;
    let ip = unique_ip();
    let ok = serde_json::json!({ "login": "nat", "password": "correct horse" });
    for _ in 0..25 {
        let res = login_from(&app, &ip, &ok).await;
        assert_eq!(res.status, StatusCode::OK, "{}", res.text());
    }
    // Twenty failures (distinct unknown names: the account lock stays out
    // of the way) fill the IP window; the 21st is throttled.
    for i in 0..20 {
        let body = serde_json::json!({ "login": format!("ghost-{i}"), "password": "x" });
        assert_eq!(
            login_from(&app, &ip, &body).await.status,
            StatusCode::UNAUTHORIZED
        );
    }
    let body = serde_json::json!({ "login": "ghost-21", "password": "x" });
    let res = login_from(&app, &ip, &body).await;
    assert_eq!(res.status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(res.json()["code"], "rate-limited");
    assert!(res.headers.contains_key(header::RETRY_AFTER));
}

/// BUG-236: the `mfa-required` step of an MFA login is not a failure — a
/// classroom of TOTP users behind one NAT logs in 25 times (step 1 + code)
/// and never fills the IP window; a wrong password still counts.
#[sqlx::test(migrations = "../../migrations")]
async fn mfa_logins_do_not_fill_the_ip_limit(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("natmfa", "natmfa@example.com", &["user"])
        .await;
    mock_password_ok(&app.zitadel).await;
    Mock::given(method("GET"))
        .and(path("/v2/users/z-natmfa/authentication_methods"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "details": { "totalResult": "2" },
            "authMethodTypes": ["AUTHENTICATION_METHOD_TYPE_PASSWORD", "AUTHENTICATION_METHOD_TYPE_TOTP"]
        })))
        .mount(&app.zitadel)
        .await;
    let ip = unique_ip();
    let step1 = serde_json::json!({ "login": "natmfa", "password": "correct horse" });
    let step2 = serde_json::json!({ "login": "natmfa", "password": "correct horse", "totp_code": "123456" });
    for _ in 0..25 {
        let res = login_from(&app, &ip, &step1).await;
        assert_eq!(res.status, StatusCode::UNAUTHORIZED, "{}", res.text());
        assert_eq!(res.json()["code"], "mfa-required");
        let res = login_from(&app, &ip, &step2).await;
        assert_eq!(res.status, StatusCode::OK, "{}", res.text());
    }
    for i in 0..20 {
        let body = serde_json::json!({ "login": format!("ghost-{i}"), "password": "x" });
        assert_eq!(
            login_from(&app, &ip, &body).await.status,
            StatusCode::UNAUTHORIZED
        );
    }
    let body = serde_json::json!({ "login": "ghost-21", "password": "x" });
    assert_eq!(
        login_from(&app, &ip, &body).await.status,
        StatusCode::TOO_MANY_REQUESTS
    );
}

/// BUG-134: the account lock keys on the resolved user, so a limit hit via
/// the username also holds for the email of the same account.
#[sqlx::test(migrations = "../../migrations")]
async fn login_name_limit_covers_username_and_email_of_one_account(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("dual", "dual@example.com", &["user"]).await;
    mock_password_invalid(&app.zitadel).await;
    for _ in 0..10 {
        let body = serde_json::json!({ "login": "dual", "password": "x" });
        assert_eq!(
            app.post_json("/api/v2/auth/login", &body).await.status,
            StatusCode::UNAUTHORIZED
        );
    }
    let by_email = serde_json::json!({ "login": "DUAL@example.com", "password": "x" });
    let res = app.post_json("/api/v2/auth/login", &by_email).await;
    assert_eq!(res.status, StatusCode::TOO_MANY_REQUESTS, "{}", res.text());
}

/// BUG-133: the 10-created-per-hour cap counts accounts Zitadel actually
/// created — a policy-rejected password (422) leaves the budget alone.
#[sqlx::test(migrations = "../../migrations")]
async fn register_created_limit_ignores_rejected_passwords(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    Mock::given(method("POST"))
        .and(path("/v2/users/human"))
        .and(wiremock::matchers::body_partial_json(serde_json::json!({
            "password": { "password": "weak" }
        })))
        .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
            "code": 3,
            "message": "Password must contain upper case (COMMA-VoaRj)",
            "details": [{ "id": "COMMA-VoaRj", "message": "Password must contain upper case" }]
        })))
        .mount(&app.zitadel)
        .await;
    mock_user_create_with_code(&app.zitadel, "ABC123").await;
    let ip = unique_ip();
    let post = |body: serde_json::Value| {
        app.send(
            Request::builder()
                .method("POST")
                .uri("/api/v2/auth/register")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-forwarded-for", &ip)
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
    };
    for i in 0..10 {
        let mut body = register_body(&format!("weak{i}"), &format!("weak{i}@example.com"));
        body["password"] = serde_json::json!("weak");
        let res = post(body).await;
        assert_eq!(
            res.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{}",
            res.text()
        );
    }
    let res = post(register_body("fresh", "fresh@example.com")).await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.text());
}

/// BUG-131: a stolen session cannot brute-force the current password on
/// `POST /auth/password` — five wrong guesses per 15 min, then 429.
#[sqlx::test(migrations = "../../migrations")]
async fn password_change_limits_wrong_current_password_guesses(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("guessed", "g@example.com", &["user"]).await;
    let session = app.mint_session_for(user, &[]).await;
    Mock::given(method("POST"))
        .and(path(format!("/v2/users/z-{user}/password")))
        .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
            "code": 3,
            "message": "Password is invalid (COMMAND-3M0fs)",
            "details": [{ "id": "COMMAND-3M0fs", "message": "Password is invalid", "failedAttempts": 1 }]
        })))
        .expect(5)
        .mount(&app.zitadel)
        .await;
    let body =
        serde_json::json!({ "current_password": "wrong", "new_password": "new horse battery" });
    for _ in 0..5 {
        let res = app.post_as(&session, "/api/v2/auth/password", &body).await;
        assert_eq!(res.status, StatusCode::UNAUTHORIZED);
    }
    let res = app.post_as(&session, "/api/v2/auth/password", &body).await;
    assert_eq!(res.status, StatusCode::TOO_MANY_REQUESTS, "{}", res.text());
    assert_eq!(res.json()["code"], "rate-limited");
    assert!(res.headers.contains_key(header::RETRY_AFTER));
}

/// Branch #54: another user's session handle is not the caller's to revoke
/// — 404, and the other session stays alive.
#[sqlx::test(migrations = "../../migrations")]
async fn revoking_another_users_session_handle_is_not_found(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let alice = app.mint_session(&[]).await;
    let bob = app.mint_session(&[]).await;
    let bob_list = app.get_as(&bob, "/api/v2/auth/sessions").await;
    let handle = bob_list.json()[0]["handle"].as_str().unwrap().to_owned();

    let res = app
        .delete_as(&alice, &format!("/api/v2/auth/sessions/{handle}"))
        .await;
    assert_eq!(res.status, StatusCode::NOT_FOUND);
    assert_eq!(
        app.get_as(&bob, "/api/v2/auth/session").await.status,
        StatusCode::OK
    );
}

/// Branch #74: the eleventh session evicts the oldest one.
#[sqlx::test(migrations = "../../migrations")]
async fn eleventh_session_evicts_the_oldest(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("many", "many@example.com", &["user"]).await;
    let first = app.mint_session_for(user, &[]).await;
    // The eviction order is the millisecond zset score; make `first` strictly older
    // than the rest so CI's fast minting cannot tie it with a newer session.
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    for _ in 0..9 {
        app.mint_session_for(user, &[]).await;
    }
    assert_eq!(
        app.get_as(&first, "/api/v2/auth/session").await.status,
        StatusCode::OK
    );
    let eleventh = app.mint_session_for(user, &[]).await;
    assert_eq!(
        app.get_as(&first, "/api/v2/auth/session").await.status,
        StatusCode::UNAUTHORIZED
    );
    let list = app.get_as(&eleventh, "/api/v2/auth/sessions").await;
    assert_eq!(list.json().as_array().unwrap().len(), 10);
}

/// BUG-277: the cap counts live sessions only — nine already-expired logins
/// still in the registry must not make a new login evict the live one.
#[sqlx::test(migrations = "../../migrations")]
async fn expired_sessions_do_not_count_toward_the_cap(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app.create_user("idle", "idle@example.com", &["user"]).await;
    let live = app.mint_session_for(user, &[]).await;
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    let mut redis = app.sessions.redis();
    for _ in 0..9 {
        let gone = app.mint_session_for(user, &[]).await;
        let id = gone.cookie.split_once('=').unwrap().1.to_owned();
        let () = redis::AsyncCommands::del(&mut redis, format!("session:{id}"))
            .await
            .unwrap();
    }
    app.mint_session_for(user, &[]).await;
    assert_eq!(
        app.get_as(&live, "/api/v2/auth/session").await.status,
        StatusCode::OK
    );
    let size: usize = redis::AsyncCommands::zcard(&mut redis, format!("user_sessions:{user}"))
        .await
        .unwrap();
    assert_eq!(size, 2);
}

/// Branch #75: a session older than the 90-day absolute cap is gone even
/// when its idle TTL is fresh.
#[sqlx::test(migrations = "../../migrations")]
async fn session_past_the_absolute_cap_is_expired(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let session = app.mint_session(&[]).await;
    assert_eq!(
        app.get_as(&session, "/api/v2/auth/session").await.status,
        StatusCode::OK
    );

    // Backdate `created_at_unix` in the stored record by 91 days.
    let id = session.cookie.split_once('=').unwrap().1.to_owned();
    let key = format!("session:{id}");
    let mut redis = app.sessions.redis();
    let raw: String = redis::AsyncCommands::get(&mut redis, &key).await.unwrap();
    let mut record: serde_json::Value = serde_json::from_str(&raw).unwrap();
    record["created_at_unix"] =
        serde_json::json!(record["created_at_unix"].as_i64().unwrap() - 91 * 86_400);
    let () = redis::AsyncCommands::set(&mut redis, &key, record.to_string())
        .await
        .unwrap();

    assert_eq!(
        app.get_as(&session, "/api/v2/auth/session").await.status,
        StatusCode::UNAUTHORIZED
    );
}

/// BUG-143: an account without a password (admin-created / Google-only) is
/// a 401 `invalid-credentials`, not a 503 leaking Zitadel's text.
#[sqlx::test(migrations = "../../migrations")]
async fn passwordless_account_login_is_invalid_credentials(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("nopw", "nopw@example.com", &["user"]).await;
    Mock::given(method("POST"))
        .and(path("/v2/sessions"))
        .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
            "code": 9,
            "message": "User has not set a password (COMMAND-3nJ4t)",
            "details": [{ "@type": "type.googleapis.com/zitadel.v1.ErrorDetail",
                          "id": "COMMAND-3nJ4t", "message": "User has not set a password" }]
        })))
        .mount(&app.zitadel)
        .await;

    let res = app
        .post_json(
            "/api/v2/auth/login",
            &serde_json::json!({ "login": "nopw", "password": "anything" }),
        )
        .await;
    assert_eq!(res.status, StatusCode::UNAUTHORIZED, "{}", res.text());
    assert_eq!(res.json()["code"], "invalid-credentials");
    assert!(!res.text().contains("COMMAND"), "{}", res.text());
}

// ── Client address trust (BUG-147) ─────────────────────────────────────────

/// BUG-147: the client controls the leading `X-Forwarded-For` hops; only the
/// one our proxy appended (the last) is trusted, and `X-Real-IP` wins over
/// both. A rotating spoofed first hop must not dodge the IP limiter.
#[sqlx::test(migrations = "../../migrations")]
async fn spoofed_forwarded_for_first_hop_is_ignored(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("proxied", "proxied@example.com", &["user"])
        .await;
    mock_password_ok(&app.zitadel).await;
    Mock::given(method("GET"))
        .and(path("/v2/users/z-proxied/authentication_methods"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "details": { "totalResult": "1" },
            "authMethodTypes": ["AUTHENTICATION_METHOD_TYPE_PASSWORD"]
        })))
        .mount(&app.zitadel)
        .await;
    let proxy_hop = unique_ip();

    // The session records the proxy-appended hop, not the forged one.
    let login = app
        .send(
            Request::builder()
                .method("POST")
                .uri("/api/v2/auth/login")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-forwarded-for", format!("203.0.113.7, {proxy_hop}"))
                .body(Body::from(
                    serde_json::json!({ "login": "proxied", "password": "correct horse" })
                        .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(login.status, StatusCode::OK, "{}", login.text());
    let cookie = login.session_cookie().unwrap();
    let list_sessions = || async {
        app.send(
            Request::builder()
                .uri("/api/v2/auth/sessions")
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
    };
    let list = list_sessions().await;
    assert_eq!(list.json()[0]["ip"], proxy_hop, "{}", list.text());

    // `X-Real-IP` (set by nginx) beats every forwarded hop.
    let real_ip = unique_ip();
    let login = app
        .send(
            Request::builder()
                .method("POST")
                .uri("/api/v2/auth/login")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-real-ip", &real_ip)
                .header("x-forwarded-for", format!("203.0.113.7, {proxy_hop}"))
                .body(Body::from(
                    serde_json::json!({ "login": "proxied", "password": "correct horse" })
                        .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(login.status, StatusCode::OK, "{}", login.text());
    let list = list_sessions().await;
    let ips: Vec<_> = list
        .json()
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["ip"].clone())
        .collect();
    assert!(ips.contains(&serde_json::json!(real_ip)), "{ips:?}");

    // Twenty failures behind a rotating forged first hop still fill the
    // window keyed on the proxy hop; the 21st is throttled.
    let limited_hop = unique_ip();
    for i in 0..20 {
        let body = serde_json::json!({ "login": format!("ghost-{i}"), "password": "x" });
        let res = login_from(&app, &format!("198.51.100.{i}, {limited_hop}"), &body).await;
        assert_eq!(res.status, StatusCode::UNAUTHORIZED, "{}", res.text());
    }
    let body = serde_json::json!({ "login": "ghost-21", "password": "x" });
    let res = login_from(&app, &format!("198.51.100.99, {limited_hop}"), &body).await;
    assert_eq!(res.status, StatusCode::TOO_MANY_REQUESTS, "{}", res.text());
}

// ── Profile names (BUG-148) ────────────────────────────────────────────────

/// BUG-148: whitespace-only names are rejected on our side as `required`
/// before Zitadel sees them — on self-registration and on the admin path,
/// which used to surface Zitadel's code 3 as a 503.
#[sqlx::test(migrations = "../../migrations")]
async fn blank_names_are_required_field_errors_on_register_and_admin_create(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    Mock::given(method("POST"))
        .and(path("/v2/users/human"))
        .respond_with(ResponseTemplate::new(500))
        .expect(0)
        .mount(&app.zitadel)
        .await;

    let mut body = register_body("blank", "blank@example.com");
    body["first_name"] = serde_json::json!("   ");
    let res = app.post_json("/api/v2/auth/register", &body).await;
    assert_eq!(
        res.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        res.text()
    );
    assert_eq!(res.json()["field_errors"][0]["field"], "first_name");
    assert_eq!(res.json()["field_errors"][0]["code"], "required");

    let admin_user = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app
        .mint_session_for(admin_user, &["platform:manage:platform"])
        .await;
    let res = app
        .post_as(
            &admin,
            "/api/v2/users",
            &serde_json::json!({
                "username": "blankadmin",
                "email": "blankadmin@example.com",
                "first_name": "A",
                "last_name": "\t ",
            }),
        )
        .await;
    assert_eq!(
        res.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        res.text()
    );
    assert_eq!(res.json()["field_errors"][0]["field"], "last_name");
    assert_eq!(res.json()["field_errors"][0]["code"], "required");
}

/// UX-157: names lose control/format characters (a bidi override, a
/// zero-width space) before Zitadel and our row see them; a name with
/// nothing visible left is 422 `required` — on register and admin create.
#[sqlx::test(migrations = "../../migrations")]
async fn names_are_stripped_of_controls_on_register_and_admin_create(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    Mock::given(method("POST"))
        .and(path("/v2/users/human"))
        .and(wiremock::matchers::body_partial_json(serde_json::json!({
            "profile": { "givenName": "evil", "familyName": "x" }
        })))
        .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
            "userId": "z-new-1", "details": {}, "emailCode": "ABC123"
        })))
        .expect(1)
        .mount(&app.zitadel)
        .await;
    Mock::given(method("POST"))
        .and(path("/v2/users/human"))
        .and(wiremock::matchers::body_partial_json(serde_json::json!({
            "profile": { "givenName": "evil", "familyName": "x" },
            "email": { "isVerified": true }
        })))
        .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
            "userId": "z-new-2", "details": {}
        })))
        .expect(1)
        .with_priority(1)
        .mount(&app.zitadel)
        .await;

    let mut body = register_body("bidi", "bidi@example.com");
    body["first_name"] = serde_json::json!("\u{202E}evil");
    body["last_name"] = serde_json::json!("\u{200B}\u{2066}x");
    let res = app.post_json("/api/v2/auth/register", &body).await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.text());
    assert_eq!(res.json()["display_name"], "evil x");
    let mut body = register_body("ghostname", "ghostname@example.com");
    body["first_name"] = serde_json::json!("\u{200B}");
    body["last_name"] = serde_json::json!("\u{200E}");
    let res = app.post_json("/api/v2/auth/register", &body).await;
    assert_eq!(
        res.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        res.text()
    );
    assert_eq!(res.json()["field_errors"][0]["field"], "first_name");
    assert_eq!(res.json()["field_errors"][0]["code"], "required");

    let admin_user = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app
        .mint_session_for(admin_user, &["platform:manage:platform"])
        .await;
    let admin_body = |username: &str, last: &str| {
        serde_json::json!({
            "username": username,
            "email": format!("{username}@example.com"),
            "first_name": "evil\u{202E}",
            "last_name": last,
        })
    };
    let res = app
        .post_as(
            &admin,
            "/api/v2/users",
            &admin_body("bidiadmin", "\u{2066}x"),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.text());
    assert_eq!(res.json()["display_name"], "evil x");
    let res = app
        .post_as(
            &admin,
            "/api/v2/users",
            &admin_body("ghostadmin", "\u{200B}\u{200D}"),
        )
        .await;
    assert_eq!(
        res.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        res.text()
    );
    assert_eq!(res.json()["field_errors"][0]["field"], "last_name");
    assert_eq!(res.json()["field_errors"][0]["code"], "required");
}

/// BUG-148: a Zitadel code 3 that is not about the password is a 422 on the
/// named field — never `password-policy`, never a 503 (admin path).
#[sqlx::test(migrations = "../../migrations")]
async fn zitadel_profile_rejection_maps_to_the_named_field(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    Mock::given(method("POST"))
        .and(path("/v2/users/human"))
        .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
            "code": 3,
            "message": "First name in profile is empty (USER-UCej2)",
            "details": [{ "id": "USER-UCej2", "message": "First name in profile is empty" }]
        })))
        .mount(&app.zitadel)
        .await;

    let res = app
        .post_json(
            "/api/v2/auth/register",
            &register_body("zprofile", "zprofile@example.com"),
        )
        .await;
    assert_eq!(
        res.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        res.text()
    );
    assert_eq!(res.json()["field_errors"][0]["field"], "first_name");
    assert_eq!(res.json()["field_errors"][0]["code"], "invalid");

    let admin_user = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app
        .mint_session_for(admin_user, &["platform:manage:platform"])
        .await;
    let res = app
        .post_as(
            &admin,
            "/api/v2/users",
            &serde_json::json!({
                "username": "zadmin",
                "email": "zadmin@example.com",
                "first_name": "A",
                "last_name": "B",
            }),
        )
        .await;
    assert_eq!(
        res.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        res.text()
    );
    assert_eq!(res.json()["field_errors"][0]["field"], "first_name");
}

// ── BUG-203: logins in flight are fenced against account mutations ─────────
// A slow Zitadel stub (`set_delay`) parks the login after it has read the
// state it rests on; the mutation lands meanwhile; the login must then end
// as a fresh one would — never with a session the mutation did not see.

async fn mock_methods(app: &TestApp, zid: &str, with_totp: bool, delay_ms: u64, priority: u8) {
    let mut methods = vec!["AUTHENTICATION_METHOD_TYPE_PASSWORD"];
    if with_totp {
        methods.push("AUTHENTICATION_METHOD_TYPE_TOTP");
    }
    Mock::given(method("GET"))
        .and(path(format!("/v2/users/{zid}/authentication_methods")))
        .respond_with(
            ResponseTemplate::new(200)
                .set_delay(std::time::Duration::from_millis(delay_ms))
                .set_body_json(serde_json::json!({
                    "details": { "totalResult": "1" },
                    "authMethodTypes": methods
                })),
        )
        .with_priority(priority)
        .mount(&app.zitadel)
        .await;
}

fn login_body(login: &str) -> serde_json::Value {
    serde_json::json!({ "login": login, "password": "old horse" })
}

async fn after(ms: u64, act: impl std::future::Future<Output = ()>) {
    tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
    act.await;
}

#[sqlx::test(migrations = "../../migrations")]
async fn login_in_flight_during_a_disable_gets_no_session(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let boss = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app.mint_session_for(boss, &["*:*:*"]).await;
    let user = app
        .create_user("racer", "racer@example.com", &["user"])
        .await;
    let stale = app.mint_session_for(user, &[]).await;
    mock_password_ok(&app.zitadel).await;
    // Status was read (active) before this call parks the login.
    mock_methods(&app, "z-racer", false, 400, 5).await;

    let body = login_body("racer");
    let (login, ()) = tokio::join!(
        app.post_json("/api/v2/auth/login", &body),
        after(100, async {
            let res = app
                .patch_as(
                    &admin,
                    &format!("/api/v2/users/{user}/status"),
                    &serde_json::json!({ "disabled": true }),
                )
                .await;
            assert_eq!(res.status, StatusCode::NO_CONTENT, "{}", res.text());
        })
    );
    assert_eq!(login.status, StatusCode::FORBIDDEN, "{}", login.text());
    assert_eq!(login.json()["code"], "account-disabled");
    assert!(login.session_cookie().is_none());
    assert!(
        app.sessions.list(user).await.unwrap().is_empty(),
        "no session outlived the disable"
    );
    assert_eq!(
        app.get_as(&stale, "/api/v2/auth/session").await.status,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn old_password_login_in_flight_during_a_password_change_gets_no_session(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("pwracer", "pwracer@example.com", &["user"])
        .await;
    let current = app.mint_session_for(user, &[]).await;
    let zid = format!("z-{user}");
    // Zitadel still accepts the old password while the change is in flight.
    Mock::given(method("POST"))
        .and(path("/v2/sessions"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_delay(std::time::Duration::from_millis(400))
                .set_body_json(serde_json::json!({
                    "sessionId": "zit-session-1",
                    "sessionToken": "zit-token-1",
                    "details": {}
                })),
        )
        .mount(&app.zitadel)
        .await;
    Mock::given(method("POST"))
        .and(path(format!("/v2/users/{zid}/password")))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({ "details": {} })),
        )
        .mount(&app.zitadel)
        .await;
    mock_methods(&app, "z-pwracer", false, 0, 5).await;

    let body = login_body("pwracer");
    let (login, ()) = tokio::join!(
        app.post_json("/api/v2/auth/login", &body),
        after(100, async {
            let res = app
                .post_as(
                    &current,
                    "/api/v2/auth/password",
                    &serde_json::json!({ "current_password": "old horse", "new_password": "new horse battery" }),
                )
                .await;
            assert_eq!(res.status, StatusCode::NO_CONTENT, "{}", res.text());
            // From now on Zitadel rejects the old password (the fenced
            // login retries once as a fresh one — BUG-222 — and must fail).
            Mock::given(method("POST"))
                .and(path("/v2/sessions"))
                .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                    "code": 3,
                    "message": "Password is invalid (COMMAND-3M0fs)",
                    "details": [{ "failedAttempts": 1 }]
                })))
                .with_priority(1)
                .mount(&app.zitadel)
                .await;
        })
    );
    assert_eq!(login.status, StatusCode::UNAUTHORIZED, "{}", login.text());
    assert_eq!(login.json()["code"], "invalid-credentials");
    assert!(login.session_cookie().is_none());
    assert_eq!(audited(&app, "login-fenced").await, 1, "the retry ran");
    let own = current.cookie.split_once('=').unwrap().1.to_owned();
    assert_eq!(
        app.sessions.list(user).await.unwrap(),
        vec![own],
        "only the session that changed the password survives"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn code_less_login_in_flight_during_totp_activation_is_mfa_required(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("mfaracer", "mfaracer@example.com", &["user"])
        .await;
    let enroller = app.mint_session_for(user, &[]).await;
    let zid = format!("z-{user}");
    mock_password_ok(&app.zitadel).await;
    // The login lists methods before the activation lands: no TOTP yet.
    // (Login-side Zitadel id is the row's `z-<username>`; the enroller's
    // session carries the testkit's `z-<user id>`.)
    mock_methods(&app, "z-mfaracer", false, 400, 5).await;
    Mock::given(method("POST"))
        .and(path(format!("/v2/users/{zid}/totp/verify")))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({ "details": {} })),
        )
        .mount(&app.zitadel)
        .await;

    let body = login_body("mfaracer");
    let (login, ()) = tokio::join!(
        app.post_json("/api/v2/auth/login", &body),
        after(100, async {
            let res = app
                .post_as(
                    &enroller,
                    "/api/v2/auth/mfa/totp/verify",
                    &serde_json::json!({ "code": "654321" }),
                )
                .await;
            assert_eq!(res.status, StatusCode::NO_CONTENT, "{}", res.text());
            // From now on Zitadel reports the authenticator.
            mock_methods(&app, "z-mfaracer", true, 0, 1).await;
        })
    );
    assert_eq!(login.status, StatusCode::UNAUTHORIZED, "{}", login.text());
    assert_eq!(login.json()["code"], "mfa-required");
    assert!(login.session_cookie().is_none());
    assert_eq!(
        app.sessions.list(user).await.unwrap().len(),
        1,
        "no code-less session opened"
    );
}

/// BUG-222 nit: a login fenced by a role-only epoch bump (an admin grant
/// rewrite mid-flight) is retried once inside `login` and opens a session
/// with the new grants instead of answering 401 to a correct password.
#[sqlx::test(migrations = "../../migrations")]
async fn login_in_flight_during_a_role_rewrite_retries_with_the_new_grants(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("roler", "roler@example.com", &["user"])
        .await;
    mock_password_ok(&app.zitadel).await;
    mock_methods(&app, "z-roler", false, 400, 5).await;

    let body = login_body("roler");
    let (login, ()) = tokio::join!(
        app.post_json("/api/v2/auth/login", &body),
        after(100, async {
            sqlx::query(
                "INSERT INTO user_roles (user_id, role_id)
                 SELECT $1, id FROM roles WHERE slug = 'instructor'",
            )
            .bind(user.0)
            .execute(&app.pool)
            .await
            .unwrap();
            app.sessions
                .rewrite_user_sessions(user, &["user".into(), "instructor".into()], &[], 2)
                .await
                .unwrap();
        })
    );
    assert_eq!(login.status, StatusCode::OK, "{}", login.text());
    assert!(login.session_cookie().is_some());
    assert!(
        login.json()["roles"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("instructor")),
        "{}",
        login.text()
    );
    assert_eq!(audited(&app, "login-fenced").await, 1);
    assert_eq!(audited(&app, "login").await, 1);
}

/// Fenced twice (BUG-236 test task): every `authentication_methods` call
/// parks the login 300 ms and bumps the epoch meanwhile, so both attempts
/// are fenced; `on_second` is the mutation that lands during the second.
/// The listing reports TOTP from the third call on when `totp_later`.
async fn fenced_twice(
    app: &TestApp,
    username: &str,
    totp_later: bool,
    on_second: impl std::future::Future<Output = ()>,
) -> ab_testkit::TestResponse {
    struct Methods {
        calls: std::sync::atomic::AtomicUsize,
        tx: tokio::sync::mpsc::UnboundedSender<usize>,
        totp_later: bool,
    }
    impl wiremock::Respond for Methods {
        fn respond(&self, _: &wiremock::Request) -> ResponseTemplate {
            let n = self.calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            let _ = self.tx.send(n);
            let mut methods = vec!["AUTHENTICATION_METHOD_TYPE_PASSWORD"];
            if self.totp_later && n >= 3 {
                methods.push("AUTHENTICATION_METHOD_TYPE_TOTP");
            }
            ResponseTemplate::new(200)
                .set_delay(std::time::Duration::from_millis(300))
                .set_body_json(serde_json::json!({
                    "details": { "totalResult": "1" },
                    "authMethodTypes": methods
                }))
        }
    }
    let user = app
        .create_user(username, &format!("{username}@example.com"), &["user"])
        .await;
    mock_password_ok(&app.zitadel).await;
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    Mock::given(method("GET"))
        .and(path(format!(
            "/v2/users/z-{username}/authentication_methods"
        )))
        .respond_with(Methods {
            calls: 0.into(),
            tx,
            totp_later,
        })
        .mount(&app.zitadel)
        .await;
    let bump = || async {
        app.sessions
            .rewrite_user_sessions(user, &["user".into()], &[], 1)
            .await
            .unwrap();
    };
    let body = login_body(username);
    let (login, ()) = tokio::join!(app.post_json("/api/v2/auth/login", &body), async {
        assert_eq!(rx.recv().await, Some(1));
        bump().await;
        assert_eq!(rx.recv().await, Some(2));
        bump().await;
        on_second.await;
    });
    assert!(login.session_cookie().is_none());
    assert_eq!(
        audited(app, "login-fenced").await,
        2,
        "both attempts fenced"
    );
    assert!(app.sessions.list(user).await.unwrap().is_empty());
    login
}

#[sqlx::test(migrations = "../../migrations")]
async fn fenced_twice_then_disabled_is_account_disabled(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let pool = app.pool.clone();
    let login = fenced_twice(&app, "fence403", false, async {
        sqlx::query("UPDATE users SET status = 'disabled' WHERE username = 'fence403'")
            .execute(&pool)
            .await
            .unwrap();
    })
    .await;
    assert_eq!(login.status, StatusCode::FORBIDDEN, "{}", login.text());
    assert_eq!(login.json()["code"], "account-disabled");
}

#[sqlx::test(migrations = "../../migrations")]
async fn fenced_twice_then_totp_enrolled_is_mfa_required(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let login = fenced_twice(&app, "fencemfa", true, async {}).await;
    assert_eq!(login.status, StatusCode::UNAUTHORIZED, "{}", login.text());
    assert_eq!(login.json()["code"], "mfa-required");
}

#[sqlx::test(migrations = "../../migrations")]
async fn fenced_twice_otherwise_is_invalid_credentials(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let login = fenced_twice(&app, "fence401", false, async {}).await;
    assert_eq!(login.status, StatusCode::UNAUTHORIZED, "{}", login.text());
    assert_eq!(login.json()["code"], "invalid-credentials");
}

/// BUG-222 nit: two concurrent password changes with the same current
/// password from two sessions of one user → one 204, the other 409 (both
/// used to pass Zitadel and revoke each other).
#[sqlx::test(migrations = "../../migrations")]
async fn concurrent_password_changes_are_serialized(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("pwtwice", "pwtwice@example.com", &["user"])
        .await;
    let first = app.mint_session_for(user, &[]).await;
    let second = app.mint_session_for(user, &[]).await;
    Mock::given(method("POST"))
        .and(path(format!("/v2/users/z-{user}/password")))
        .respond_with(
            ResponseTemplate::new(200)
                .set_delay(std::time::Duration::from_millis(300))
                .set_body_json(serde_json::json!({ "details": {} })),
        )
        .expect(1)
        .mount(&app.zitadel)
        .await;
    let body =
        serde_json::json!({ "current_password": "old horse", "new_password": "new horse battery" });
    let (a, b) = tokio::join!(
        app.post_as(&first, "/api/v2/auth/password", &body),
        app.post_as(&second, "/api/v2/auth/password", &body)
    );
    let mut statuses = [a.status, b.status];
    statuses.sort();
    assert_eq!(
        statuses,
        [StatusCode::NO_CONTENT, StatusCode::CONFLICT],
        "{} / {}",
        a.text(),
        b.text()
    );
    assert_eq!(
        app.sessions.list(user).await.unwrap().len(),
        1,
        "the winner's session survives"
    );
}

/// BUG-222 nit: two registrations racing on one email (distinct usernames)
/// → one 201 and one 409 `email-taken`, not `username-taken`.
#[sqlx::test(migrations = "../../migrations")]
async fn register_race_on_the_email_names_the_email(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    for username in ["racea", "raceb"] {
        Mock::given(method("POST"))
            .and(path("/v2/users/human"))
            .and(wiremock::matchers::body_partial_json(
                serde_json::json!({ "username": username }),
            ))
            .respond_with(
                ResponseTemplate::new(201)
                    .set_delay(std::time::Duration::from_millis(200))
                    .set_body_json(serde_json::json!({
                        "userId": format!("z-{username}"),
                        "details": {},
                        "emailCode": "CODE42"
                    })),
            )
            .mount(&app.zitadel)
            .await;
    }
    Mock::given(method("DELETE"))
        .and(wiremock::matchers::path_regex("^/v2/users/z-race[ab]$"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
        .mount(&app.zitadel)
        .await;
    let body_a = register_body("racea", "shared@example.com");
    let body_b = register_body("raceb", "shared@example.com");
    let (a, b) = tokio::join!(
        app.post_json("/api/v2/auth/register", &body_a),
        app.post_json("/api/v2/auth/register", &body_b)
    );
    let (won, lost) = if a.status == StatusCode::CREATED {
        (a, b)
    } else {
        (b, a)
    };
    assert_eq!(won.status, StatusCode::CREATED, "{}", won.text());
    assert_eq!(lost.status, StatusCode::CONFLICT, "{}", lost.text());
    assert_eq!(lost.json()["code"], "email-taken");
}

// ── BUG-213/214: a dropped connection never leaves a half-done mutation ────
// `app.send` drives the router directly, so dropping the request future is
// exactly what hyper does when the client resets the socket mid-request:
// the handler must have handed the work to a task of its own by then.

async fn users_named(app: &TestApp, username: &str) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM users WHERE username = $1")
        .bind(username)
        .fetch_one(&app.pool)
        .await
        .unwrap()
}

async fn audited(app: &TestApp, event: &str) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM auth_audit_log WHERE event = $1")
        .bind(event)
        .fetch_one(&app.pool)
        .await
        .unwrap()
}

/// BUG-213: the connection drops while Zitadel is still answering (its user
/// exists, our row does not yet) and again once our row exists (code and
/// key still pending). Either way the account, the code and the key land,
/// and the same-key retry replays the 201 instead of 409 `username-taken`.
#[sqlx::test(migrations = "../../migrations")]
async fn registration_dropped_mid_flight_still_completes_and_replays(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    Mock::given(method("POST"))
        .and(path("/emails"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "id": "em-3" })))
        .expect(2)
        .mount(&app.resend)
        .await;
    for (username, drop_once_row_exists) in [("dropz", false), ("dropr", true)] {
        Mock::given(method("POST"))
            .and(path("/v2/users/human"))
            .and(wiremock::matchers::body_partial_json(
                serde_json::json!({ "username": username }),
            ))
            .respond_with(
                ResponseTemplate::new(201)
                    .set_delay(std::time::Duration::from_millis(150))
                    .set_body_json(serde_json::json!({
                        "userId": format!("z-{username}"),
                        "details": {},
                        "emailCode": "CODE42"
                    })),
            )
            .expect(1)
            .mount(&app.zitadel)
            .await;
        let body = register_body(username, &format!("{username}@example.com"));
        let key = format!("signup-{username}");
        let send = || {
            app.send(
                Request::builder()
                    .method("POST")
                    .uri("/api/v2/auth/register")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header("Idempotency-Key", &key)
                    .body(Body::from(body.to_string()))
                    .expect("request build"),
            )
        };
        drop_request_when(
            send(),
            async || {
                if drop_once_row_exists {
                    users_named(&app, username).await == 1
                } else {
                    app.zitadel
                        .received_requests()
                        .await
                        .unwrap_or_default()
                        .iter()
                        .any(|r| {
                            r.url.path() == "/v2/users/human"
                                && String::from_utf8_lossy(&r.body).contains(username)
                        })
                }
            },
            |response| assert_eq!(response.status, StatusCode::CREATED, "{}", response.text()),
        )
        .await;
        wait_until("registration aborted with the connection", async || {
            sqlx::query_scalar::<_, i32>("SELECT status_code FROM idempotency_keys WHERE key = $1")
                .bind(format!("register:{key}"))
                .fetch_optional(&app.pool)
                .await
                .unwrap()
                == Some(201)
        })
        .await;
        assert_eq!(users_named(&app, username).await, 1);
        let replay = send().await;
        assert_eq!(replay.status, StatusCode::CREATED, "{}", replay.text());
        assert_eq!(replay.json()["username"], username);
    }
    assert_eq!(
        app.resend.received_requests().await.unwrap().len(),
        2,
        "one verification code per account"
    );
    assert_eq!(audited(&app, "account-created").await, 2);
}

/// BUG-214: the admin connection drops right after `status = disabled` is
/// committed; `revoke_all` and the audit must still run — no session of a
/// disabled account answers afterwards.
#[sqlx::test(migrations = "../../migrations")]
async fn disable_dropped_mid_flight_still_revokes_every_session(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let boss = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app.mint_session_for(boss, &["*:*:*"]).await;
    let user = app
        .create_user("ghost", "ghost@example.com", &["user"])
        .await;
    let first = app.mint_session_for(user, &[]).await;
    let second = app.mint_session_for(user, &[]).await;
    assert_eq!(app.sessions.list(user).await.unwrap().len(), 2);

    drop_request_when(
        app.patch_as(
            &admin,
            &format!("/api/v2/users/{user}/status"),
            &serde_json::json!({ "disabled": true }),
        ),
        async || {
            sqlx::query_scalar::<_, String>("SELECT status FROM users WHERE username = 'ghost'")
                .fetch_one(&app.pool)
                .await
                .unwrap()
                == "disabled"
        },
        |response| {
            assert_eq!(
                response.status,
                StatusCode::NO_CONTENT,
                "{}",
                response.text()
            );
        },
    )
    .await;
    wait_until("sessions outlived the disable", async || {
        app.sessions.list(user).await.unwrap().is_empty()
    })
    .await;
    assert_eq!(app.sessions.list(user).await.unwrap().len(), 0);
    for session in [&first, &second] {
        assert_eq!(
            app.get_as(session, "/api/v2/auth/session").await.status,
            StatusCode::UNAUTHORIZED
        );
    }
    wait_until("audit never landed", async || {
        audited(&app, "account-disabled").await == 1
    })
    .await;
}

/// BUG-222: the IP cap is counted before the Zitadel round-trip, so a burst
/// of 40 concurrent wrong passwords against 40 accounts from one IP lets at
/// most the cap (20) reach Zitadel — the rest are 429 at once, and so is the
/// next sequential attempt. (A connection dropped mid-check now costs its
/// attempt: accepted, the alternative was an uncounted spray.)
#[sqlx::test(migrations = "../../migrations")]
async fn ip_limit_holds_under_a_concurrent_burst(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    for i in 0..40 {
        app.create_user(
            &format!("spray{i}"),
            &format!("spray{i}@example.com"),
            &["user"],
        )
        .await;
    }
    Mock::given(method("POST"))
        .and(path("/v2/sessions"))
        .respond_with(
            ResponseTemplate::new(400)
                .set_delay(std::time::Duration::from_millis(300))
                .set_body_json(serde_json::json!({
                    "code": 3,
                    "message": "Password is invalid (COMMAND-3M0fs)",
                    "details": [{ "failedAttempts": 1 }]
                })),
        )
        .mount(&app.zitadel)
        .await;
    let ip = unique_ip();
    let bodies: Vec<_> = (0..40)
        .map(|i| serde_json::json!({ "login": format!("spray{i}"), "password": "x" }))
        .collect();
    let results =
        futures::future::join_all(bodies.iter().map(|body| login_from(&app, &ip, body))).await;
    let rejected = results
        .iter()
        .filter(|r| r.status == StatusCode::UNAUTHORIZED)
        .count();
    let throttled = results
        .iter()
        .filter(|r| r.status == StatusCode::TOO_MANY_REQUESTS)
        .count();
    assert_eq!(
        (rejected, throttled),
        (20, 20),
        "{:?}",
        results.iter().map(|r| r.status).collect::<Vec<_>>()
    );
    let checked = app
        .zitadel
        .received_requests()
        .await
        .unwrap()
        .iter()
        .filter(|r| r.url.path() == "/v2/sessions")
        .count();
    assert_eq!(checked, 20, "only the cap reaches Zitadel");
    let body = serde_json::json!({ "login": "spray0", "password": "x" });
    assert_eq!(
        login_from(&app, &ip, &body).await.status,
        StatusCode::TOO_MANY_REQUESTS
    );
}
