//! TOTP MFA flows — fixtures replicate shapes captured from live Zitadel
//! (2026-08-16): registration `{details,uri,secret}`, method listing
//! `authMethodTypes`, wrong code = code 3 with a plain detail.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::TestApp;
use axum::http::StatusCode;
use sqlx::PgPool;
use wiremock::matchers::{body_partial_json, method, path};
use wiremock::{Mock, ResponseTemplate};

async fn mock_session_ok(app: &TestApp) {
    Mock::given(method("POST"))
        .and(path("/v2/sessions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "sessionId": "zit-session-1",
            "sessionToken": "zit-token-1",
            "details": {}
        })))
        .mount(&app.zitadel)
        .await;
}

fn methods_body(with_totp: bool) -> serde_json::Value {
    let mut methods = vec!["AUTHENTICATION_METHOD_TYPE_PASSWORD"];
    if with_totp {
        methods.push("AUTHENTICATION_METHOD_TYPE_TOTP");
    }
    serde_json::json!({ "details": { "totalResult": "2" }, "authMethodTypes": methods })
}

#[sqlx::test(migrations = "../../migrations")]
async fn totp_enrolled_login_requires_second_factor(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("mfauser", "mfa@example.com", &["user"])
        .await;
    mock_session_ok(&app).await;
    Mock::given(method("GET"))
        .and(path("/v2/users/z-mfauser/authentication_methods"))
        .respond_with(ResponseTemplate::new(200).set_body_json(methods_body(true)))
        .mount(&app.zitadel)
        .await;
    // The pre-MFA zitadel session must be discarded.
    Mock::given(method("DELETE"))
        .and(path("/v2/sessions/zit-session-1"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
        .expect(1)
        .mount(&app.zitadel)
        .await;

    let res = app
        .post_json(
            "/api/v2/auth/login",
            &serde_json::json!({ "login": "mfauser", "password": "pw" }),
        )
        .await;
    assert_eq!(res.status, StatusCode::UNAUTHORIZED);
    assert_eq!(res.json()["code"], "mfa-required");
    assert!(res.session_cookie().is_none());
}

#[sqlx::test(migrations = "../../migrations")]
async fn totp_code_completes_the_login_in_one_shot(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("mfauser", "mfa@example.com", &["user"])
        .await;
    // The one-shot request must include the totp check; the methods listing
    // must NOT be consulted when a code is supplied.
    Mock::given(method("POST"))
        .and(path("/v2/sessions"))
        .and(body_partial_json(serde_json::json!({
            "checks": { "totp": { "code": "123456" } }
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "sessionId": "zit-session-2",
            "sessionToken": "zit-token-2",
            "details": {}
        })))
        .expect(1)
        .mount(&app.zitadel)
        .await;
    Mock::given(method("GET"))
        .and(path("/v2/users/z-mfauser/authentication_methods"))
        .respond_with(ResponseTemplate::new(200).set_body_json(methods_body(true)))
        .expect(0)
        .mount(&app.zitadel)
        .await;

    let res = app
        .post_json(
            "/api/v2/auth/login",
            &serde_json::json!({ "login": "mfauser", "password": "pw", "totp_code": "123456" }),
        )
        .await;
    assert_eq!(res.status, StatusCode::OK);
    assert!(res.session_cookie().is_some());
}

#[sqlx::test(migrations = "../../migrations")]
async fn wrong_totp_code_is_distinguished_from_bad_password(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.create_user("mfauser", "mfa@example.com", &["user"])
        .await;
    // Captured live: TOTP failure is code 3 with a plain detail (no
    // failedAttempts) — unlike password failures.
    Mock::given(method("POST"))
        .and(path("/v2/sessions"))
        .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
            "code": 3,
            "message": "Invalid code (EVENT-8isk2)",
            "details": [{ "id": "EVENT-8isk2", "message": "Invalid code" }]
        })))
        .mount(&app.zitadel)
        .await;

    let res = app
        .post_json(
            "/api/v2/auth/login",
            &serde_json::json!({ "login": "mfauser", "password": "pw", "totp_code": "999999" }),
        )
        .await;
    assert_eq!(res.status, StatusCode::BAD_REQUEST);
    assert_eq!(res.json()["code"], "invalid-totp-code");
}

#[sqlx::test(migrations = "../../migrations")]
async fn enrollment_activation_and_removal(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("enrollee", "e@example.com", &["user"])
        .await;
    let session = app.mint_session_for(user, &[]).await;
    let zid = format!("z-{user}");

    Mock::given(method("POST"))
        .and(path(format!("/v2/users/{zid}/totp")))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "details": {},
            "uri": "otpauth://totp/ZITADEL:e@example.com?secret=SECRET32",
            "secret": "SECRET32"
        })))
        .mount(&app.zitadel)
        .await;
    Mock::given(method("POST"))
        .and(path(format!("/v2/users/{zid}/totp/verify")))
        .and(body_partial_json(serde_json::json!({ "code": "654321" })))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({ "details": {} })),
        )
        .mount(&app.zitadel)
        .await;
    Mock::given(method("DELETE"))
        .and(path(format!("/v2/users/{zid}/totp")))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({ "details": {} })),
        )
        .mount(&app.zitadel)
        .await;

    let enroll = app
        .post_as(&session, "/api/v2/auth/mfa/totp", &serde_json::json!({}))
        .await;
    assert_eq!(enroll.status, StatusCode::OK);
    assert_eq!(enroll.json()["secret"], "SECRET32");
    assert!(
        enroll.json()["uri"]
            .as_str()
            .unwrap()
            .starts_with("otpauth://")
    );

    let verify = app
        .post_as(
            &session,
            "/api/v2/auth/mfa/totp/verify",
            &serde_json::json!({ "code": "654321" }),
        )
        .await;
    assert_eq!(verify.status, StatusCode::NO_CONTENT);

    let removed = app.delete_as(&session, "/api/v2/auth/mfa/totp").await;
    assert_eq!(removed.status, StatusCode::NO_CONTENT);

    let events: Vec<String> = sqlx::query_scalar(
        "SELECT event FROM auth_audit_log WHERE event LIKE 'mfa-%' ORDER BY created_at",
    )
    .fetch_all(&app.pool)
    .await
    .unwrap();
    assert_eq!(events, vec!["mfa-enrolled", "mfa-removed"]);
}
