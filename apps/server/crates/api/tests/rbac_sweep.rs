//! RBAC sweep (slice 0.11): every mutating operation in the OpenAPI document
//! must be explicitly security-classified, and permission-gated operations
//! must reject a session that holds zero grants.
//!
//! Adding a mutating endpoint without adding it to exactly one list below
//! fails this suite — that forced classification IS the review.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::TestApp;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use sqlx::PgPool;

/// No session required at all.
const PUBLIC: &[(&str, &str)] = &[("POST", "/api/v2/auth/login")];

/// Requires a live session, but no specific permission (self-service).
const AUTH_ONLY: &[(&str, &str)] = &[
    ("POST", "/api/v2/auth/logout"),
    ("DELETE", "/api/v2/auth/sessions/{handle}"),
    ("POST", "/api/v2/auth/mfa/totp"),
    ("POST", "/api/v2/auth/mfa/totp/verify"),
    ("DELETE", "/api/v2/auth/mfa/totp"),
    // Ownership checked internally (created_by == actor).
    ("POST", "/api/v2/uploads/{id}/finalize"),
];

/// Requires specific grants: a zero-grant session must NOT reach a 2xx.
const PERMISSION_GATED: &[(&str, &str)] = &[
    ("PATCH", "/api/v2/users/me"),
    ("POST", "/api/v2/users/{user_id}/roles"),
    ("DELETE", "/api/v2/users/{user_id}/roles/{slug}"),
    ("POST", "/api/v2/uploads"),
    // Ownership-gated (no grant needed beyond a session):
    // finalize checks created_by internally.
];

const MUTATING: &[&str] = &["post", "put", "patch", "delete"];

fn classified(method: &str, path: &str) -> bool {
    let entry = (method, path);
    PUBLIC.contains(&entry) || AUTH_ONLY.contains(&entry) || PERMISSION_GATED.contains(&entry)
}

/// Substitute path params with plausible junk.
fn concretize(path: &str) -> String {
    let mut out = String::new();
    for segment in path.split('/') {
        if segment.is_empty() {
            continue;
        }
        out.push('/');
        if segment.starts_with('{') {
            out.push_str("00000000-0000-7000-8000-000000000000");
        } else {
            out.push_str(segment);
        }
    }
    out
}

#[sqlx::test(migrations = "../../migrations")]
async fn every_mutating_operation_is_classified_and_gated(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let doc = ab_api::openapi_doc();
    let doc = serde_json::to_value(&doc).unwrap();
    let paths = doc["paths"].as_object().expect("openapi paths");

    let mut unclassified = Vec::new();
    for (path, ops) in paths {
        for (method, _op) in ops.as_object().expect("operations") {
            if !MUTATING.contains(&method.as_str()) {
                continue;
            }
            let method_upper = method.to_uppercase();
            if !classified(&method_upper, path) {
                unclassified.push(format!("{method_upper} {path}"));
            }
        }
    }
    assert!(
        unclassified.is_empty(),
        "unclassified mutating operations (add each to PUBLIC / AUTH_ONLY / \
         PERMISSION_GATED in rbac_sweep.rs after reviewing its checks):\n{}",
        unclassified.join("\n")
    );

    // Zero-grant probe: permission-gated operations must never answer 2xx.
    let powerless = app.mint_session(&[]).await;
    for (method, path) in PERMISSION_GATED {
        let res = app
            .send(
                Request::builder()
                    .method(*method)
                    .uri(concretize(path))
                    .header(header::COOKIE, &powerless.cookie)
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await;
        assert!(
            !res.status.is_success(),
            "{method} {path} answered {} to a zero-grant session",
            res.status
        );
    }

    // Auth-only operations must at least demand a session.
    for (method, path) in AUTH_ONLY {
        let res = app
            .send(
                Request::builder()
                    .method(*method)
                    .uri(concretize(path))
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await;
        assert_eq!(
            res.status,
            StatusCode::UNAUTHORIZED,
            "{method} {path} must require a session"
        );
    }
}
