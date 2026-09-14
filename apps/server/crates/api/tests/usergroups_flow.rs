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
    // `can_write` mirrors the server rule: creator with create, or manage.
    assert_eq!(created.json()["can_write"], true);
    let reader = app.mint_session(&["usergroup:read:platform"]).await;
    let seen = app
        .get_as(&reader, &format!("/api/v2/usergroups/{id}"))
        .await;
    assert_eq!(seen.status, StatusCode::OK);
    assert_eq!(seen.json()["can_write"], false);

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

/// BUG-109: unknown member / course ids are 422s, not FK 500s.
#[sqlx::test(migrations = "../../migrations")]
async fn unknown_member_and_course_ids_are_validation_errors(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let owner = organizer(&app, "owner").await;
    let created = app
        .post_as(
            &owner,
            "/api/v2/usergroups",
            &serde_json::json!({ "name": "Cohort", "description": "" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let ghost = uuid::Uuid::now_v7();

    let members = app
        .post_as(
            &owner,
            &format!("/api/v2/usergroups/{id}/members"),
            &serde_json::json!({ "user_ids": [ghost] }),
        )
        .await;
    assert_eq!(
        members.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        members.text()
    );
    assert_eq!(members.json()["field_errors"][0]["field"], "user_ids");
    assert_eq!(members.json()["field_errors"][0]["code"], "unknown");

    let courses = app
        .post_as(
            &owner,
            &format!("/api/v2/usergroups/{id}/courses"),
            &serde_json::json!({ "course_ids": [ghost] }),
        )
        .await;
    assert_eq!(
        courses.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        courses.text()
    );
    assert_eq!(courses.json()["field_errors"][0]["field"], "course_ids");
    assert_eq!(courses.json()["field_errors"][0]["code"], "unknown");
}

/// BUG-142: a blank name is 422 `name`/`required` (create and rename);
/// surrounding whitespace is trimmed. Plus the manage grant: a non-creator
/// holding `usergroup:manage:platform` can rename and delete.
#[sqlx::test(migrations = "../../migrations")]
async fn blank_names_are_rejected_and_managers_can_write(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let owner = organizer(&app, "owner").await;

    let blank = app
        .post_as(
            &owner,
            "/api/v2/usergroups",
            &serde_json::json!({ "name": "   " }),
        )
        .await;
    assert_eq!(
        blank.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        blank.text()
    );
    assert_eq!(blank.json()["field_errors"][0]["field"], "name");
    assert_eq!(blank.json()["field_errors"][0]["code"], "required");

    let created = app
        .post_as(
            &owner,
            "/api/v2/usergroups",
            &serde_json::json!({ "name": "  Cohort  " }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    assert_eq!(created.json()["name"], "Cohort");
    let id = created.json()["id"].as_str().unwrap().to_owned();

    let blank_rename = app
        .patch_as(
            &owner,
            &format!("/api/v2/usergroups/{id}"),
            &serde_json::json!({ "name": " " }),
        )
        .await;
    assert_eq!(blank_rename.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(blank_rename.json()["field_errors"][0]["field"], "name");

    let manager = app
        .mint_session(&["usergroup:manage:platform", "usergroup:read:platform"])
        .await;
    let renamed = app
        .patch_as(
            &manager,
            &format!("/api/v2/usergroups/{id}"),
            &serde_json::json!({ "name": " Managed " }),
        )
        .await;
    assert_eq!(renamed.status, StatusCode::OK, "{}", renamed.text());
    assert_eq!(renamed.json()["name"], "Managed");
    assert_eq!(renamed.json()["can_write"], true);
    let deleted = app
        .delete_as(&manager, &format!("/api/v2/usergroups/{id}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
}

/// BUG-156: linking a course grants every member read access, so the link
/// needs write access on the course — an invisible private course is a 404,
/// a visible one the caller does not author is a 403, and the private course
/// never becomes readable through the group. Plus the `writable` miss (404
/// before the write check) and the members/courses read gate (403).
#[sqlx::test(migrations = "../../migrations")]
async fn linking_a_course_requires_write_access_on_it(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let admin_user = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app.mint_session_for(admin_user, &["*:*:*"]).await;
    let private_course = app
        .post_as(
            &admin,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Admin only" }),
        )
        .await;
    assert_eq!(private_course.status, StatusCode::CREATED);
    let private_id = private_course.json()["id"].as_str().unwrap().to_owned();
    let public_course = app
        .post_as(
            &admin,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Public but not mine" }),
        )
        .await;
    let public_id = public_course.json()["id"].as_str().unwrap().to_owned();
    app.publish_course(&public_id).await;

    let teacher = organizer(&app, "teacher").await;
    let invisible = app
        .get_as(&teacher, &format!("/api/v2/courses/{private_id}"))
        .await;
    assert_eq!(invisible.status, StatusCode::NOT_FOUND);
    let group = app
        .post_as(
            &teacher,
            "/api/v2/usergroups",
            &serde_json::json!({ "name": "leak" }),
        )
        .await;
    let group_id = group.json()["id"].as_str().unwrap().to_owned();

    let leak = app
        .post_as(
            &teacher,
            &format!("/api/v2/usergroups/{group_id}/courses"),
            &serde_json::json!({ "course_ids": [private_id] }),
        )
        .await;
    assert_eq!(leak.status, StatusCode::NOT_FOUND, "{}", leak.text());
    let foreign = app
        .post_as(
            &teacher,
            &format!("/api/v2/usergroups/{group_id}/courses"),
            &serde_json::json!({ "course_ids": [public_id] }),
        )
        .await;
    assert_eq!(foreign.status, StatusCode::FORBIDDEN, "{}", foreign.text());
    app.post_as(
        &teacher,
        &format!("/api/v2/usergroups/{group_id}/members"),
        &serde_json::json!({ "user_ids": [teacher.user_id] }),
    )
    .await;
    let still_invisible = app
        .get_as(&teacher, &format!("/api/v2/courses/{private_id}"))
        .await;
    assert_eq!(still_invisible.status, StatusCode::NOT_FOUND);

    // Own course links fine; the admin (platform updater) links anything.
    let own = app
        .post_as(
            &teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Mine" }),
        )
        .await;
    let own_id = own.json()["id"].as_str().unwrap().to_owned();
    let linked = app
        .post_as(
            &teacher,
            &format!("/api/v2/usergroups/{group_id}/courses"),
            &serde_json::json!({ "course_ids": [own_id] }),
        )
        .await;
    assert_eq!(linked.status, StatusCode::NO_CONTENT, "{}", linked.text());
    let admin_group = app
        .post_as(
            &admin,
            "/api/v2/usergroups",
            &serde_json::json!({ "name": "staff" }),
        )
        .await;
    let admin_group_id = admin_group.json()["id"].as_str().unwrap().to_owned();
    let by_admin = app
        .post_as(
            &admin,
            &format!("/api/v2/usergroups/{admin_group_id}/courses"),
            &serde_json::json!({ "course_ids": [private_id] }),
        )
        .await;
    assert_eq!(
        by_admin.status,
        StatusCode::NO_CONTENT,
        "{}",
        by_admin.text()
    );

    // A missing group is a 404 before any write check.
    let ghost = uuid::Uuid::now_v7();
    let missing = app
        .post_as(
            &teacher,
            &format!("/api/v2/usergroups/{ghost}/members"),
            &serde_json::json!({ "user_ids": [teacher.user_id] }),
        )
        .await;
    assert_eq!(missing.status, StatusCode::NOT_FOUND, "{}", missing.text());

    // Members / linked courses need the read grant.
    let pleb = app.mint_session(&[]).await;
    let members = app
        .get_as(&pleb, &format!("/api/v2/usergroups/{group_id}/members"))
        .await;
    assert_eq!(members.status, StatusCode::FORBIDDEN);
    let courses = app
        .get_as(&pleb, &format!("/api/v2/usergroups/{group_id}/courses"))
        .await;
    assert_eq!(courses.status, StatusCode::FORBIDDEN, "{}", courses.text());
    let reader = app.mint_session(&["usergroup:read:platform"]).await;
    let visible = app
        .get_as(&reader, &format!("/api/v2/usergroups/{group_id}/courses"))
        .await;
    assert_eq!(visible.status, StatusCode::OK, "{}", visible.text());
}
