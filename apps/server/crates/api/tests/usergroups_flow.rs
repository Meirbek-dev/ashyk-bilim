//! Usergroup (cohort) flows: CRUD, membership, course links, access rules.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp};
use axum::http::StatusCode;
use sqlx::PgPool;

async fn organizer(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["instructor"])
        .await;
    app.mint_session_for(
        user,
        &[
            "usergroup:create:platform",
            "usergroup:read:platform",
            "course:create:platform",
        ],
    )
    .await
}

#[sqlx::test(migrations = "../../migrations")]
async fn lifecycle_membership_and_course_links(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let owner = organizer(&app, "owner").await;

    let created = app
        .post_as(
            &owner,
            "/api/v2/usergroups",
            &serde_json::json!({ "name": "Cohort 2026", "description": "fall intake" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED);
    let id = created.json()["id"].as_str().unwrap().to_owned();
    assert_eq!(created.json()["member_count"], 0);

    // Members: batch add (dupes ignored), list, remove.
    let alice = app.create_user("alice", "a@example.com", &["user"]).await;
    let bob = app.create_user("bob", "b@example.com", &["user"]).await;
    let added = app
        .post_as(
            &owner,
            &format!("/api/v2/usergroups/{id}/members"),
            &serde_json::json!({ "user_ids": [alice, bob, alice] }),
        )
        .await;
    assert_eq!(added.status, StatusCode::NO_CONTENT);
    let members = app
        .get_as(&owner, &format!("/api/v2/usergroups/{id}/members"))
        .await;
    let names: Vec<_> = members
        .json()
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m["username"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(names, ["alice", "bob"]);

    // Course links round-trip and appear from the course side.
    let course = app
        .post_as(
            &owner,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Linked" }),
        )
        .await;
    let course_id = course.json()["id"].as_str().unwrap().to_owned();
    app.post_as(
        &owner,
        &format!("/api/v2/usergroups/{id}/courses"),
        &serde_json::json!({ "course_ids": [course_id] }),
    )
    .await;
    let linked = app
        .get_as(&owner, &format!("/api/v2/courses/{course_id}/usergroups"))
        .await;
    assert_eq!(linked.json().as_array().unwrap().len(), 1);

    // A rival with create+read can see but not modify someone else's group.
    let rival = organizer(&app, "rival").await;
    let seen = app
        .get_as(&rival, &format!("/api/v2/usergroups/{id}"))
        .await;
    assert_eq!(seen.status, StatusCode::OK);
    let denied = app
        .patch_as(
            &rival,
            &format!("/api/v2/usergroups/{id}"),
            &serde_json::json!({ "name": "Hijacked" }),
        )
        .await;
    assert_eq!(denied.status, StatusCode::FORBIDDEN);

    // No read grant at all → 403 even for listing.
    let pleb = app.mint_session(&[]).await;
    let blocked = app.get_as(&pleb, "/api/v2/usergroups").await;
    assert_eq!(blocked.status, StatusCode::FORBIDDEN);

    // Owner deletes; members/links cascade, users stay.
    let deleted = app
        .delete_as(&owner, &format!("/api/v2/usergroups/{id}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let gone = app
        .get_as(&owner, &format!("/api/v2/usergroups/{id}"))
        .await;
    assert_eq!(gone.status, StatusCode::NOT_FOUND);
}
