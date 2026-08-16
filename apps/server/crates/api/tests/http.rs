//! Full-stack HTTP tests: real router + middleware over a fresh test DB.
#![allow(clippy::unwrap_used, clippy::expect_used)]

use ab_testkit::TestApp;
use axum::http::StatusCode;
use sqlx::PgPool;

#[sqlx::test(migrations = "../../migrations")]
async fn health_live_and_ready(pool: PgPool) {
    let app = TestApp::spawn(pool);

    let live = app.get("/api/v2/health").await;
    assert_eq!(live.status, StatusCode::OK);
    assert_eq!(live.json()["status"], "ok");

    let ready = app.get("/api/v2/health/ready").await;
    assert_eq!(ready.status, StatusCode::OK);
}

#[sqlx::test(migrations = "../../migrations")]
async fn every_response_carries_a_request_id(pool: PgPool) {
    let app = TestApp::spawn(pool);
    let res = app.get("/api/v2/health").await;
    let request_id = res.headers.get("x-request-id").expect("x-request-id set");
    assert!(!request_id.to_str().unwrap().is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn unknown_routes_answer_problem_json(pool: PgPool) {
    let app = TestApp::spawn(pool);
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
    let app = TestApp::spawn(pool);
    let res = app.get("/api/v2/openapi.json").await;
    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.json()["info"]["title"], "Ashyq Bilim API");
}
