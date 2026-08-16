//! Full-stack HTTP tests: real router + middleware over a fresh test DB and
//! the test Redis (sessions).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::TestApp;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use sqlx::PgPool;

#[sqlx::test(migrations = "../../migrations")]
async fn health_live_and_ready(pool: PgPool) {
    let app = TestApp::spawn(pool).await;

    let live = app.get("/api/v2/health").await;
    assert_eq!(live.status, StatusCode::OK);
    assert_eq!(live.json()["status"], "ok");

    let ready = app.get("/api/v2/health/ready").await;
    assert_eq!(ready.status, StatusCode::OK);
}

#[sqlx::test(migrations = "../../migrations")]
async fn every_response_carries_a_request_id(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let res = app.get("/api/v2/health").await;
    let request_id = res.headers.get("x-request-id").expect("x-request-id set");
    assert!(!request_id.to_str().unwrap().is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn unknown_routes_answer_problem_json(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let res = app.get("/api/v2/definitely-not-a-route").await;

    assert_eq!(res.status, StatusCode::NOT_FOUND);
    assert_eq!(res.content_type(), "application/problem+json");
    let body = res.json();
    assert_eq!(body["code"], "not-found");
    assert_eq!(body["status"], 404);
    assert!(body["type"].as_str().unwrap().ends_with("/not-found"));
}

#[sqlx::test(migrations = "../../migrations")]
async fn openapi_json_is_served(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let res = app.get("/api/v2/openapi.json").await;
    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.json()["info"]["title"], "Ashyq Bilim API");
}

// ── Sessions & auth ─────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../migrations")]
async fn session_endpoint_requires_authentication(pool: PgPool) {
    let app = TestApp::spawn(pool).await;

    let anon = app.get("/api/v2/auth/session").await;
    assert_eq!(anon.status, StatusCode::UNAUTHORIZED);
    assert_eq!(anon.json()["code"], "unauthenticated");
}

#[sqlx::test(migrations = "../../migrations")]
async fn minted_session_authenticates_and_carries_grants(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let session = app
        .mint_session(&["course:read:all", "assessment:submit:assigned"])
        .await;

    let res = app.get_as(&session, "/api/v2/auth/session").await;
    assert_eq!(res.status, StatusCode::OK);
    let body = res.json();
    assert_eq!(body["user_id"], session.user_id.to_string());
    assert_eq!(
        body["permissions"],
        serde_json::json!(["course:read:all", "assessment:submit:assigned"])
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn garbage_session_cookie_is_session_expired(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let res = app
        .send(
            Request::builder()
                .uri("/api/v2/auth/session")
                .header(header::COOKIE, "ab_session=deadbeef")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(res.status, StatusCode::UNAUTHORIZED);
    assert_eq!(res.json()["code"], "session-expired");
}

// ── CSRF guard ──────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../migrations")]
async fn cross_site_mutations_are_rejected(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let res = app
        .send(
            Request::builder()
                .method("POST")
                .uri("/api/v2/anything")
                .header("sec-fetch-site", "cross-site")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    // Rejected by the guard before routing — 403, not 404.
    assert_eq!(res.status, StatusCode::FORBIDDEN);
    assert_eq!(res.json()["code"], "csrf-rejected");
}

#[sqlx::test(migrations = "../../migrations")]
async fn same_origin_and_navigation_requests_pass_csrf(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    for site in ["same-origin", "same-site", "none"] {
        let res = app
            .send(
                Request::builder()
                    .method("POST")
                    .uri("/api/v2/anything")
                    .header("sec-fetch-site", site)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await;
        assert_eq!(
            res.status,
            StatusCode::NOT_FOUND,
            "site={site} should reach routing"
        );
    }
    // Cross-site GETs are fine (reads carry no CSRF risk).
    let res = app
        .send(
            Request::builder()
                .uri("/api/v2/health")
                .header("sec-fetch-site", "cross-site")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(res.status, StatusCode::OK);
}
