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
                "description": "Helps with grading",
                "priority": 30,
            }),
        )
        .await;
    assert_eq!(created.status, StatusCode::NO_CONTENT);

    // Custom roles carry raw text; seeded roles keep catalog keys and null text.
    let listed = app.get_as(&admin, "/api/v2/rbac/roles").await;
    let roles = listed.json();
    let roles = roles.as_array().unwrap();
    let custom = roles
        .iter()
        .find(|r| r["slug"] == "teaching-assistant")
        .unwrap();
    assert_eq!(custom["display_name"], "Teaching assistant");
    assert_eq!(custom["description"], "Helps with grading");
    assert_eq!(custom["display_name_key"], "roles.teaching-assistant.name");
    let seeded = roles.iter().find(|r| r["slug"] == "admin").unwrap();
    assert_eq!(seeded["display_name"], serde_json::Value::Null);
    assert_eq!(seeded["display_name_key"], "roles.admin.name");

    // Metadata updates land on the text fields.
    let renamed = app
        .patch_as(
            &admin,
            "/api/v2/rbac/roles/teaching-assistant",
            &serde_json::json!({ "display_name": "TA", "description": "Grades" }),
        )
        .await;
    assert_eq!(renamed.status, StatusCode::NO_CONTENT);
    let listed = app.get_as(&admin, "/api/v2/rbac/roles").await;
    let roles = listed.json();
    let custom = roles
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["slug"] == "teaching-assistant")
        .unwrap()
        .clone();
    assert_eq!(custom["display_name"], "TA");
    assert_eq!(custom["description"], "Grades");

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
    assert_eq!(dup.json()["code"], "role-slug-taken");
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

#[sqlx::test(migrations = "../../migrations")]
async fn last_admin_role_cannot_be_removed(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let boss = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app.mint_session_for(boss, &["role:manage:platform"]).await;

    let refused = app
        .delete_as(&admin, &format!("/api/v2/users/{boss}/roles/admin"))
        .await;
    assert_eq!(refused.status, StatusCode::CONFLICT);
    assert_eq!(refused.json()["code"], "last-admin");

    // A second active admin lifts the guard.
    let other = app
        .create_user("deputy", "deputy@example.com", &["admin"])
        .await;
    let removed = app
        .delete_as(&admin, &format!("/api/v2/users/{other}/roles/admin"))
        .await;
    assert_eq!(removed.status, StatusCode::NO_CONTENT);
}

/// UX-135: two admins stripping each other at the same time — the guard
/// counts under a row lock on the `admin` role in the write's transaction,
/// so exactly one removal lands and one active admin always remains.
#[sqlx::test(migrations = "../../migrations")]
async fn concurrent_last_admin_removals_leave_one_admin(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    let boss = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let deputy = app
        .create_user("deputy", "deputy@example.com", &["admin"])
        .await;
    let boss_session = app.mint_session_for(boss, &["role:manage:platform"]).await;
    let deputy_session = app
        .mint_session_for(deputy, &["role:manage:platform"])
        .await;
    let strip_deputy = format!("/api/v2/users/{deputy}/roles/admin");
    let strip_boss = format!("/api/v2/users/{boss}/roles/admin");
    let (a, b) = tokio::join!(
        app.delete_as(&boss_session, &strip_deputy),
        app.delete_as(&deputy_session, &strip_boss),
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
    let admins: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         JOIN users u ON u.id = ur.user_id WHERE r.slug = 'admin' AND u.status = 'active'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(admins, 1);
}

/// BUG-118 / UX-043 / UX-045: unknown user → 404 (not an FK 500); removing a
/// role the user does not hold → 404 before the last-admin guard; a bad grant
/// names itself without the `internal:` prefix.
#[sqlx::test(migrations = "../../migrations")]
async fn role_errors_are_typed(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let boss = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app.mint_session_for(boss, &["*:*:*"]).await;

    let ghost = app
        .post_as(
            &admin,
            &format!("/api/v2/users/{}/roles", uuid::Uuid::now_v7()),
            &serde_json::json!({ "role": "instructor" }),
        )
        .await;
    assert_eq!(ghost.status, StatusCode::NOT_FOUND, "{}", ghost.text());

    let plain = app.create_user("plain", "plain@example.com", &[]).await;
    let not_held = app
        .delete_as(&admin, &format!("/api/v2/users/{plain}/roles/admin"))
        .await;
    assert_eq!(
        not_held.status,
        StatusCode::NOT_FOUND,
        "{}",
        not_held.text()
    );

    app.post_as(
        &admin,
        "/api/v2/rbac/roles",
        &serde_json::json!({ "slug": "helper", "display_name": "Helper", "priority": 10 }),
    )
    .await;
    let bad = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri("/api/v2/rbac/roles/helper/permissions")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &admin.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "permissions": ["course:read:all", "nope:zip:zap"] })
                        .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(
        bad.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        bad.text()
    );
    let message = bad.json()["field_errors"][0]["message"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(message.starts_with("nope:zip:zap:"), "{message}");
    assert!(!message.contains("internal:"), "{message}");
}

/// BUG-144: the last-admin guard asks "would another *active* admin remain",
/// so a disabled admin can lose the role (or be disabled again) while one
/// other admin is active — and the only active admin still cannot.
#[sqlx::test(migrations = "../../migrations")]
async fn disabled_admin_can_lose_the_role_while_another_is_active(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let boss = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app.mint_session_for(boss, &["*:*:*"]).await;
    let gamma = app
        .create_user("gamma", "gamma@example.com", &["admin"])
        .await;
    let disabled = app
        .patch_as(
            &admin,
            &format!("/api/v2/users/{gamma}/status"),
            &serde_json::json!({ "disabled": true }),
        )
        .await;
    assert_eq!(
        disabled.status,
        StatusCode::NO_CONTENT,
        "{}",
        disabled.text()
    );

    let again = app
        .patch_as(
            &admin,
            &format!("/api/v2/users/{gamma}/status"),
            &serde_json::json!({ "disabled": true }),
        )
        .await;
    assert_eq!(again.status, StatusCode::NO_CONTENT, "{}", again.text());
    let removed = app
        .delete_as(&admin, &format!("/api/v2/users/{gamma}/roles/admin"))
        .await;
    assert_eq!(removed.status, StatusCode::NO_CONTENT, "{}", removed.text());

    // Boss is now the only admin: still guarded.
    let refused = app
        .delete_as(&admin, &format!("/api/v2/users/{boss}/roles/admin"))
        .await;
    assert_eq!(refused.status, StatusCode::CONFLICT);
    assert_eq!(refused.json()["code"], "last-admin");
}

/// `GET /rbac/roles` needs `role:read:platform`; system roles cannot be
/// deleted even by an admin.
#[sqlx::test(migrations = "../../migrations")]
async fn role_reads_are_gated_and_system_roles_are_undeletable(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = app.mint_session(&["course:create:platform"]).await;
    let denied = app.get_as(&teacher, "/api/v2/rbac/roles").await;
    assert_eq!(denied.status, StatusCode::FORBIDDEN, "{}", denied.text());
    let anon = app.get("/api/v2/rbac/roles").await;
    assert_eq!(anon.status, StatusCode::UNAUTHORIZED);

    let admin = app.mint_session(&["*:*:*"]).await;
    let system = app.delete_as(&admin, "/api/v2/rbac/roles/admin").await;
    assert_eq!(system.status, StatusCode::FORBIDDEN, "{}", system.text());
}

/// `POST /rbac/roles` body validation: an out-of-range priority is a 422
/// field error (a blank display name is the service's `required`, see
/// `whitespace_display_name_is_required_on_create_and_rename`).
#[sqlx::test(migrations = "../../migrations")]
async fn create_role_rejects_bad_display_name_and_priority(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let boss = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app.mint_session_for(boss, &["*:*:*"]).await;
    let bad = app
        .post_as(
            &admin,
            "/api/v2/rbac/roles",
            &serde_json::json!({ "slug": "helper", "display_name": "", "priority": 100 }),
        )
        .await;
    assert_eq!(
        bad.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        bad.text()
    );
    let fields: Vec<String> = bad.json()["field_errors"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["field"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(fields, ["priority"]);
}

/// A whitespace-only display name is blank after trimming: 422
/// `display_name`/`required` on create and on rename alike (UX-100).
#[sqlx::test(migrations = "../../migrations")]
async fn whitespace_display_name_is_required_on_create_and_rename(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let admin = app.mint_session(&["role:manage:platform"]).await;
    let created = app
        .post_as(
            &admin,
            "/api/v2/rbac/roles",
            &serde_json::json!({ "slug": "helper", "display_name": "Help\u{202E}er\u{7}", "priority": 10 }),
        )
        .await;
    assert_eq!(created.status, StatusCode::NO_CONTENT, "{}", created.text());
    // UX-163: the stored display name carries no control characters.
    let stored: String = sqlx::query_scalar("SELECT display_name FROM roles WHERE slug = 'helper'")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(stored, "Helper");

    let blank_create = app
        .post_as(
            &admin,
            "/api/v2/rbac/roles",
            &serde_json::json!({ "slug": "helper-2", "display_name": "   ", "priority": 10 }),
        )
        .await;
    // UX-106: `""` answers the same `required` (not garde's `invalid`).
    let empty_create = app
        .post_as(
            &admin,
            "/api/v2/rbac/roles",
            &serde_json::json!({ "slug": "helper-3", "display_name": "", "priority": 10 }),
        )
        .await;
    let blank_rename = app
        .patch_as(
            &admin,
            "/api/v2/rbac/roles/helper",
            &serde_json::json!({ "display_name": "   " }),
        )
        .await;
    for response in [blank_create, empty_create, blank_rename] {
        assert_eq!(
            response.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{}",
            response.text()
        );
        let field = &response.json()["field_errors"][0];
        assert_eq!(field["field"], "display_name", "{field}");
        assert_eq!(field["code"], "required", "{field}");
    }
}
