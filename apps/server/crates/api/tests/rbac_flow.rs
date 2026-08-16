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

#[sqlx::test(migrations = "../../migrations")]
async fn custom_role_lifecycle_propagates_to_sessions(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let admin = app
        .mint_session(&["role:manage:platform", "role:read:platform"])
        .await;

    // Create a custom role and give it a grant set.
    let created = app
        .post_as(
            &admin,
            "/api/v2/rbac/roles",
            &serde_json::json!({
                "slug": "teaching-assistant",
                "display_name": "Teaching assistant",
                "priority": 30,
            }),
        )
        .await;
    assert_eq!(created.status, StatusCode::NO_CONTENT);

    // Slug collisions are conflicts; system roles refuse edits.
    let dup = app
        .post_as(
            &admin,
            "/api/v2/rbac/roles",
            &serde_json::json!({ "slug": "teaching-assistant",
                                  "display_name": "Dup", "priority": 10 }),
        )
        .await;
    assert_eq!(dup.status, StatusCode::CONFLICT);
    let sys = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri("/api/v2/rbac/roles/instructor/permissions")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &admin.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "permissions": ["course:read:all"] }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(sys.status, StatusCode::FORBIDDEN);

    // Unparseable grants are rejected before anything is written.
    let garbage = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri("/api/v2/rbac/roles/teaching-assistant/permissions")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &admin.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "permissions": ["not-a-grant"] }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(garbage.status, StatusCode::UNPROCESSABLE_ENTITY);

    let set = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri("/api/v2/rbac/roles/teaching-assistant/permissions")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &admin.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "permissions": ["course:read:all"] }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(set.status, StatusCode::NO_CONTENT);

    // Assign it to a user with a live session: grants appear immediately.
    let member = app.create_user("ta", "ta@example.com", &[]).await;
    let member_session = app.mint_session_for(member, &[]).await;
    let assigned = app
        .post_as(
            &admin,
            &format!("/api/v2/users/{member}/roles"),
            &serde_json::json!({ "role": "teaching-assistant" }),
        )
        .await;
    assert_eq!(assigned.status, StatusCode::NO_CONTENT);
    let session_view = app.get_as(&member_session, "/api/v2/auth/session").await;
    assert!(
        session_view.json()["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p == "course:read:all"),
        "live session must pick up the custom role's grants"
    );

    // Deleting the role strips it from live sessions too.
    let deleted = app
        .delete_as(&admin, "/api/v2/rbac/roles/teaching-assistant")
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let session_view = app.get_as(&member_session, "/api/v2/auth/session").await;
    assert!(
        !session_view.json()["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p == "course:read:all"),
        "deleting the role must revoke its grants from live sessions"
    );
}
