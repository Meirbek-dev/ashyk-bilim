//! Role administration flows — the key property: grant changes propagate to
//! LIVE sessions immediately, no re-login (mutation-time propagation).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::TestApp;
use axum::http::StatusCode;
use sqlx::PgPool;

#[sqlx::test(migrations = "../../migrations")]
async fn role_assignment_propagates_to_live_sessions(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let admin = app.mint_session(&["*:*:*"]).await;
    let target = app.create_user("student", "s@example.com", &["user"]).await;
    let target_session = app.mint_session_for(target, &["course:read:all"]).await;

    // Before: the live session cannot update courses.
    let before = app.get_as(&target_session, "/api/v2/auth/session").await;
    assert!(
        !before.json()["permissions"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("course:update:own"))
    );

    let res = app
        .post_as(
            &admin,
            &format!("/api/v2/users/{target}/roles"),
            &serde_json::json!({ "role": "instructor" }),
        )
        .await;
    assert_eq!(res.status, StatusCode::NO_CONTENT);

    // After: same cookie, fresh grants — no re-login.
    let after = app.get_as(&target_session, "/api/v2/auth/session").await;
    let perms = after.json()["permissions"].as_array().unwrap().clone();
    assert!(perms.contains(&serde_json::json!("course:update:own")));
    assert!(
        after.json()["roles"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("instructor"))
    );

    // rbac_version bumped and audit written.
    let version: i64 = sqlx::query_scalar("SELECT rbac_version FROM users WHERE id = $1")
        .bind(target.0)
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(version, 2);

    // Unassign flows back out of the live session too.
    let res = app
        .delete_as(&admin, &format!("/api/v2/users/{target}/roles/instructor"))
        .await;
    assert_eq!(res.status, StatusCode::NO_CONTENT);
    let stripped = app.get_as(&target_session, "/api/v2/auth/session").await;
    assert!(
        !stripped.json()["permissions"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("course:update:own"))
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn roles_listing_shows_grants(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let admin = app.mint_session(&["role:read:platform"]).await;

    let res = app.get_as(&admin, "/api/v2/rbac/roles").await;
    assert_eq!(res.status, StatusCode::OK);
    let roles = res.json();
    let roles = roles.as_array().unwrap();
    assert_eq!(roles.len(), 6);
    assert_eq!(roles[0]["slug"], "admin");
    assert_eq!(roles[0]["permissions"], serde_json::json!(["*:*:*"]));
    assert!(roles.iter().all(|r| r["is_system"] == true));
}

#[sqlx::test(migrations = "../../migrations")]
async fn assigning_unknown_role_is_not_found(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let admin = app.mint_session(&["*:*:*"]).await;
    let target = app.create_user("t", "t@example.com", &[]).await;

    let res = app
        .post_as(
            &admin,
            &format!("/api/v2/users/{target}/roles"),
            &serde_json::json!({ "role": "warlock" }),
        )
        .await;
    assert_eq!(res.status, StatusCode::NOT_FOUND);
}
