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

/// UX-110: a known route with the wrong verb answers in the envelope too.
#[sqlx::test(migrations = "../../migrations")]
async fn wrong_verbs_answer_problem_json(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let res = app
        .send(
            Request::builder()
                .method("PUT")
                .uri("/api/v2/auth/login")
                .body(Body::empty())
                .unwrap(),
        )
        .await;

    assert_eq!(res.status, StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(res.content_type(), "application/problem+json");
    assert_eq!(res.json()["code"], "method-not-allowed");
    assert_eq!(res.json()["status"], 405);
}

/// The problem+json body carries the same correlation id as the header —
/// a user copying the JSON gets something support can grep for.
#[sqlx::test(migrations = "../../migrations")]
async fn problem_bodies_carry_the_request_id(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let res = app.get("/api/v2/definitely-not-a-route").await;
    let header = res.headers.get("x-request-id").unwrap().to_str().unwrap();
    assert_eq!(res.json()["request_id"], header);

    // A client-supplied id is propagated verbatim (tower-http keeps it).
    let res = app
        .send(
            Request::builder()
                .uri("/api/v2/auth/session")
                .header("x-request-id", "trace-abc-123")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(res.status, StatusCode::UNAUTHORIZED);
    assert_eq!(res.json()["request_id"], "trace-abc-123");

    // UX-118: a client id with non-visible bytes is reduced to visible ASCII
    // in the header and the body alike; nothing visible → a fresh id.
    for (sent, expected) in [
        (b"tr\xfface\t-1".as_slice(), Some("trace-1")),
        (b"\xff\t".as_slice(), None),
    ] {
        let res = app
            .send(
                Request::builder()
                    .uri("/api/v2/auth/session")
                    .header(
                        "x-request-id",
                        header::HeaderValue::from_bytes(sent).unwrap(),
                    )
                    .body(Body::empty())
                    .unwrap(),
            )
            .await;
        let echoed = res.headers.get("x-request-id").unwrap().to_str().unwrap();
        match expected {
            Some(clean) => assert_eq!(echoed, clean),
            None => assert!(uuid::Uuid::parse_str(echoed).is_ok(), "{echoed}"),
        }
        assert_eq!(res.json()["request_id"], echoed);
    }
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

// ── CORS ────────────────────────────────────────────────────────────────────

/// The web client is served from a different origin than the API in split
/// deployments (and always in local dev). It stamps `traceparent` on every
/// request and `If-Match` on locked writes, and reads `ETag` back — a preflight
/// that omits any of those silently breaks every browser-side call.
#[sqlx::test(migrations = "../../migrations")]
async fn cors_preflight_allows_the_headers_the_web_client_sends(pool: PgPool) {
    let app = TestApp::spawn_with(pool, |config| {
        config.server.cors_origins = vec!["http://localhost:3000".to_owned()];
    })
    .await;

    let request = Request::builder()
        .method("OPTIONS")
        .uri("/api/v2/auth/sessions")
        .header(header::ORIGIN, "http://localhost:3000")
        .header(header::ACCESS_CONTROL_REQUEST_METHOD, "GET")
        .header(
            header::ACCESS_CONTROL_REQUEST_HEADERS,
            "content-type,traceparent,if-match,idempotency-key",
        )
        .body(Body::empty())
        .unwrap();
    let res = app.send(request).await;

    assert_eq!(res.status, StatusCode::OK);
    let allowed = res
        .headers
        .get(header::ACCESS_CONTROL_ALLOW_HEADERS)
        .expect("preflight answers with an allow-headers list")
        .to_str()
        .unwrap()
        .to_ascii_lowercase();
    for header_name in ["content-type", "traceparent", "if-match", "idempotency-key"] {
        assert!(
            allowed.contains(header_name),
            "`{header_name}` must be allowed; got `{allowed}`"
        );
    }
}

/// `Access-Control-Expose-Headers` rides the actual response, not the
/// preflight. Without it a cross-origin caller cannot read `ETag` (the new
/// version after a locked write) or `x-request-id` (shown in error toasts).
#[sqlx::test(migrations = "../../migrations")]
async fn cors_exposes_the_response_headers_the_web_client_reads(pool: PgPool) {
    let app = TestApp::spawn_with(pool, |config| {
        config.server.cors_origins = vec!["http://localhost:3000".to_owned()];
    })
    .await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/v2/health")
        .header(header::ORIGIN, "http://localhost:3000")
        .body(Body::empty())
        .unwrap();
    let res = app.send(request).await;

    assert_eq!(res.status, StatusCode::OK);
    let exposed = res
        .headers
        .get(header::ACCESS_CONTROL_EXPOSE_HEADERS)
        .expect("cross-origin responses carry an expose-headers list")
        .to_str()
        .unwrap()
        .to_ascii_lowercase();
    for header_name in ["etag", "x-request-id"] {
        assert!(
            exposed.contains(header_name),
            "`{header_name}` must be exposed; got `{exposed}`"
        );
    }
}
