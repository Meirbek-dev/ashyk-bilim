//! Personal access tokens (`/me/access-tokens`, REWRITE 4.7). Behaviors, one per test:
//! - a signed-in caller creates a token: 201 with the secret once, the listing never shows it, and an
//!   `access-token-created` audit row names the token; an anonymous caller is 401 before the body;
//! - name, scope and expiry are validated (422); past 20 live tokens a create is 409 `conflict`;
//! - the owner revokes a token (204, again 204), another user's or an unknown id is 404, and a revoke writes
//!   `access-token-revoked`.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp};
use axum::http::StatusCode;
use serde_json::json;
use sqlx::PgPool;

async fn signed_in(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["user"])
        .await;
    app.mint_session_for(user, &[]).await
}

async fn audit_count(app: &TestApp, event: &str) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM auth_audit_log WHERE event = $1")
        .bind(event)
        .fetch_one(&app.pool)
        .await
        .unwrap()
}

#[ab_testdb::test]
async fn a_token_is_shown_once_and_listed_without_its_secret(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let me = signed_in(&app, "owner").await;

    let created = app
        .post_as(
            &me,
            "/api/v2/me/access-tokens",
            &json!({ "name": "  Claude Desktop ", "scope": "draft", "expires_in_days": 30 }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let body = created.json();
    let secret = body["token"].as_str().unwrap();
    assert!(secret.starts_with("abq_"), "{secret}");
    assert_eq!(body["access_token"]["name"], "Claude Desktop");
    assert_eq!(body["access_token"]["scope"], "draft");
    assert!(body["access_token"]["expires_at_unix"].is_i64());

    let listed = app.get_as(&me, "/api/v2/me/access-tokens").await;
    assert_eq!(listed.status, StatusCode::OK);
    let tokens = listed.json();
    assert_eq!(tokens.as_array().unwrap().len(), 1);
    assert!(
        !listed.text().contains(secret),
        "the listing leaks the secret"
    );
    assert_eq!(tokens[0]["id"], body["access_token"]["id"]);
    assert!(tokens[0]["last_used_at_unix"].is_null());

    // Only the hash is stored.
    let stored: Vec<u8> = sqlx::query_scalar("SELECT token_hash FROM personal_access_tokens")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(stored.len(), 32);
    assert_ne!(stored, secret.as_bytes());

    let metadata: serde_json::Value = sqlx::query_scalar(
        "SELECT metadata FROM auth_audit_log WHERE event = 'access-token-created'",
    )
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(metadata["token_id"], body["access_token"]["id"]);
    assert_eq!(metadata["scope"], "draft");
}

#[ab_testdb::test]
async fn an_anonymous_caller_is_refused_before_the_body(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let res = app
        .post_json("/api/v2/me/access-tokens", &json!({ "bogus": true }))
        .await;
    assert_eq!(res.status, StatusCode::UNAUTHORIZED);
    assert_eq!(
        app.get("/api/v2/me/access-tokens").await.status,
        StatusCode::UNAUTHORIZED
    );
}

#[ab_testdb::test]
async fn names_scopes_and_expiry_are_validated(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let me = signed_in(&app, "owner").await;
    for body in [
        json!({ "name": "", "scope": "read" }),
        json!({ "name": "   ", "scope": "read" }),
        json!({ "name": "x".repeat(101), "scope": "read" }),
        json!({ "name": "ok", "scope": "publish" }),
        json!({ "name": "ok", "scope": "read", "expires_in_days": 0 }),
        json!({ "name": "ok", "scope": "read", "expires_in_days": 366 }),
        json!({ "name": "ok", "scope": "read", "extra": 1 }),
    ] {
        let res = app.post_as(&me, "/api/v2/me/access-tokens", &body).await;
        assert_eq!(res.status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    }
}

#[ab_testdb::test]
async fn at_most_twenty_live_tokens(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let me = signed_in(&app, "owner").await;
    for i in 0..20 {
        let res = app
            .post_as(
                &me,
                "/api/v2/me/access-tokens",
                &json!({ "name": format!("t{i}"), "scope": "read" }),
            )
            .await;
        assert_eq!(res.status, StatusCode::CREATED);
    }
    let over = app
        .post_as(
            &me,
            "/api/v2/me/access-tokens",
            &json!({ "name": "one more", "scope": "read" }),
        )
        .await;
    assert_eq!(over.status, StatusCode::CONFLICT);

    // A revoked one frees a place.
    let first = app.get_as(&me, "/api/v2/me/access-tokens").await.json()[0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let revoked = app
        .delete_as(&me, &format!("/api/v2/me/access-tokens/{first}"))
        .await;
    assert_eq!(revoked.status, StatusCode::NO_CONTENT);
    let again = app
        .post_as(
            &me,
            "/api/v2/me/access-tokens",
            &json!({ "name": "one more", "scope": "read" }),
        )
        .await;
    assert_eq!(again.status, StatusCode::CREATED);
}

#[ab_testdb::test]
async fn only_the_owner_revokes_and_a_revoke_is_audited(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let me = signed_in(&app, "owner").await;
    let other = signed_in(&app, "other").await;
    let id = app
        .post_as(
            &me,
            "/api/v2/me/access-tokens",
            &json!({ "name": "cli", "scope": "read" }),
        )
        .await
        .json()["access_token"]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let path = format!("/api/v2/me/access-tokens/{id}");

    assert_eq!(
        app.delete_as(&other, &path).await.status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.delete_as(
            &me,
            &format!("/api/v2/me/access-tokens/{}", uuid::Uuid::now_v7())
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.delete_as(&me, &path).await.status,
        StatusCode::NO_CONTENT
    );
    let first: i64 = sqlx::query_scalar(
        "SELECT extract(epoch FROM revoked_at)::bigint FROM personal_access_tokens",
    )
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(
        app.delete_as(&me, &path).await.status,
        StatusCode::NO_CONTENT
    );
    let listed = app.get_as(&me, "/api/v2/me/access-tokens").await.json();
    assert_eq!(listed[0]["revoked_at_unix"], first);
    assert_eq!(audit_count(&app, "access-token-revoked").await, 2);
}
