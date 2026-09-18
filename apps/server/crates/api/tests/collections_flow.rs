//! Collection flows: CRUD, membership replacement, viewer-filtered courses,
//! visibility rules.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp};
use axum::http::StatusCode;
use sqlx::PgPool;

async fn curator(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["instructor"])
        .await;
    app.mint_session_for(
        user,
        &[
            "course:create:platform",
            "course:update:own",
            "collection:create:platform",
            "collection:read:all",
            "collection:update:own",
            "collection:delete:own",
        ],
    )
    .await
}

async fn course(app: &TestApp, session: &MintedSession, name: &str, publish: bool) -> String {
    let res = app
        .post_as(
            session,
            "/api/v2/courses",
            &serde_json::json!({ "name": name }),
        )
        .await;
    let id = res.json()["id"].as_str().unwrap().to_owned();
    if publish {
        app.publish_course(&id).await;
    }
    id
}

#[sqlx::test(migrations = "../../migrations")]
async fn crud_membership_and_visibility(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let owner = curator(&app, "owner").await;
    let public_course = course(&app, &owner, "Public course", true).await;
    let draft_course = course(&app, &owner, "Draft course", false).await;

    // Creation attaches both (the owner can read their own draft).
    let created = app
        .post_as(
            &owner,
            "/api/v2/collections",
            &serde_json::json!({
                "name": "Starter pack",
                "public": true,
                "courses": [public_course, draft_course],
            }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED);
    let id = created.json()["id"].as_str().unwrap().to_owned();
    assert_eq!(created.json()["courses"].as_array().unwrap().len(), 2);

    // UX-102: `Idempotency-Key` replays the 201 — one row, not two.
    let keyed = serde_json::json!({ "name": "Keyed", "public": false });
    let send = || {
        app.send(
            axum::http::Request::builder()
                .method("POST")
                .uri("/api/v2/collections")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &owner.cookie)
                .header("Idempotency-Key", "collection-keyed-1")
                .body(axum::body::Body::from(keyed.to_string()))
                .unwrap(),
        )
    };
    let first = send().await;
    assert_eq!(first.status, StatusCode::CREATED, "{}", first.text());
    let replay = send().await;
    assert_eq!(replay.status, StatusCode::CREATED, "{}", replay.text());
    assert_eq!(replay.json()["id"], first.json()["id"]);

    // A learner sees the public collection but only its public courses.
    let learner = app.mint_session(&[]).await;
    let seen = app
        .get_as(&learner, &format!("/api/v2/collections/{id}"))
        .await;
    assert_eq!(seen.status, StatusCode::OK);
    let names: Vec<_> = seen.json()["courses"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(names, ["Public course"]);

    // Update replaces the membership wholesale.
    let third = course(&app, &owner, "Third", true).await;
    let updated = app
        .patch_as(
            &owner,
            &format!("/api/v2/collections/{id}"),
            &serde_json::json!({ "courses": [third] }),
        )
        .await;
    assert_eq!(updated.status, StatusCode::OK);
    let names: Vec<_> = updated.json()["courses"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(names, ["Third"]);

    // A rival with update:own can't touch someone else's collection.
    let rival = curator(&app, "rival").await;
    let denied = app
        .patch_as(
            &rival,
            &format!("/api/v2/collections/{id}"),
            &serde_json::json!({ "name": "Hijacked" }),
        )
        .await;
    assert_eq!(denied.status, StatusCode::FORBIDDEN);

    // Private collections are invisible to strangers without read:all.
    let hidden_created = app
        .post_as(
            &owner,
            "/api/v2/collections",
            &serde_json::json!({ "name": "Secret", "public": false }),
        )
        .await;
    let hidden_id = hidden_created.json()["id"].as_str().unwrap().to_owned();
    let invisible = app
        .get_as(&learner, &format!("/api/v2/collections/{hidden_id}"))
        .await;
    assert_eq!(invisible.status, StatusCode::NOT_FOUND);

    // Listing: the learner sees only the public one; deletion cascades the
    // membership rows but keeps courses.
    let listed = app.get_as(&learner, "/api/v2/collections").await;
    assert_eq!(listed.json()["items"].as_array().unwrap().len(), 1);

    let deleted = app
        .delete_as(&owner, &format!("/api/v2/collections/{id}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let course_alive = app
        .get_as(&learner, &format!("/api/v2/courses/{third}"))
        .await;
    assert_eq!(course_alive.status, StatusCode::OK);
}

#[sqlx::test(migrations = "../../migrations")]
async fn attaching_unreadable_courses_is_refused(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let owner = curator(&app, "owner").await;
    let foreign_draft = course(&app, &owner, "Foreign draft", false).await;

    // Another curator without read access to the draft can't attach it —
    // and learns nothing about its existence (404).
    let other_user = app
        .create_user("other", "other@example.com", &["instructor"])
        .await;
    let other = app
        .mint_session_for(
            other_user,
            &["collection:create:platform", "collection:update:own"],
        )
        .await;
    let refused = app
        .post_as(
            &other,
            "/api/v2/collections",
            &serde_json::json!({ "name": "Steal", "courses": [foreign_draft] }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::NOT_FOUND);
}

/// BUG-168: a whitespace-only name is 422 `name`/`required` on create and
/// update; stored names are trimmed.
#[sqlx::test(migrations = "../../migrations")]
async fn blank_names_are_rejected_and_trimmed(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let owner = curator(&app, "owner").await;
    let created = app
        .post_as(
            &owner,
            "/api/v2/collections",
            &serde_json::json!({ "name": "  Pack  " }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    assert_eq!(created.json()["name"], "Pack");
    let id = created.json()["id"].as_str().unwrap().to_owned();

    let blank = serde_json::json!({ "name": "   " });
    for res in [
        app.post_as(&owner, "/api/v2/collections", &blank).await,
        app.patch_as(&owner, &format!("/api/v2/collections/{id}"), &blank)
            .await,
    ] {
        assert_eq!(
            res.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{}",
            res.text()
        );
        assert_eq!(res.json()["field_errors"][0]["field"], "name");
        assert_eq!(res.json()["field_errors"][0]["code"], "required");
    }
}
