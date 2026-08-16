//! Course catalog flows: CRUD, visibility, lifecycle, keyset pagination.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp};
use axum::http::StatusCode;
use sqlx::PgPool;

async fn instructor(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["instructor"])
        .await;
    app.mint_session_for(
        user,
        &[
            "course:create:platform",
            "course:read:all",
            "course:update:own",
            "course:delete:own",
        ],
    )
    .await
}

async fn create_course(app: &TestApp, session: &MintedSession, name: &str) -> String {
    let res = app
        .post_as(
            session,
            "/api/v2/courses",
            &serde_json::json!({ "name": name, "description": "d", "tags": ["rust"] }),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED);
    res.json()["id"].as_str().unwrap().to_owned()
}

#[sqlx::test(migrations = "../../migrations")]
async fn crud_lifecycle_and_visibility(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let id = create_course(&app, &teacher, "Rust 101").await;

    // Creator sees their private course; a stranger gets 404 (not 403 — no
    // existence leak).
    let own = app.get_as(&teacher, &format!("/api/v2/courses/{id}")).await;
    assert_eq!(own.status, StatusCode::OK);
    assert_eq!(own.json()["public"], false);

    let stranger = app.mint_session(&["course:read:all"]).await; // read:all sees drafts
    let seen = app
        .get_as(&stranger, &format!("/api/v2/courses/{id}"))
        .await;
    assert_eq!(seen.status, StatusCode::OK);

    let learner = app.mint_session(&[]).await;
    let hidden = app.get_as(&learner, &format!("/api/v2/courses/{id}")).await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);

    // Publish → learners can see it.
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{id}/lifecycle"),
            &serde_json::json!({ "action": "publish" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK);
    assert_eq!(published.json()["public"], true);
    let visible = app.get_as(&learner, &format!("/api/v2/courses/{id}")).await;
    assert_eq!(visible.status, StatusCode::OK);

    // Update by owner works; by a non-owner instructor it doesn't.
    let updated = app
        .send(
            axum::http::Request::builder()
                .method("PATCH")
                .uri(format!("/api/v2/courses/{id}"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "name": "Rust 102" }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(updated.status, StatusCode::OK);
    assert_eq!(updated.json()["name"], "Rust 102");

    let rival = instructor(&app, "rival").await;
    let denied = app
        .send(
            axum::http::Request::builder()
                .method("PATCH")
                .uri(format!("/api/v2/courses/{id}"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &rival.cookie)
                .body(axum::body::Body::from(
                    serde_json::json!({ "name": "Hijacked" }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(denied.status, StatusCode::FORBIDDEN);

    // Delete by owner cascades away.
    let deleted = app
        .delete_as(&teacher, &format!("/api/v2/courses/{id}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let gone = app.get_as(&teacher, &format!("/api/v2/courses/{id}")).await;
    assert_eq!(gone.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "../../migrations")]
async fn listing_paginates_and_respects_visibility(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "prolific").await;
    for i in 0..5 {
        let id = create_course(&app, &teacher, &format!("Course {i}")).await;
        // Publish all but the last.
        if i < 4 {
            app.post_as(
                &teacher,
                &format!("/api/v2/courses/{id}/lifecycle"),
                &serde_json::json!({ "action": "publish" }),
            )
            .await;
        }
    }

    // A learner pages through public courses only (4), two at a time.
    let learner = app.mint_session(&[]).await;
    let page1 = app.get_as(&learner, "/api/v2/courses?limit=2").await;
    assert_eq!(page1.status, StatusCode::OK);
    let body1 = page1.json();
    assert_eq!(body1["items"].as_array().unwrap().len(), 2);
    let cursor = body1["next_cursor"].as_str().unwrap().to_owned();

    let page2 = app
        .get_as(
            &learner,
            &format!("/api/v2/courses?limit=2&cursor={cursor}"),
        )
        .await;
    let body2 = page2.json();
    assert_eq!(body2["items"].as_array().unwrap().len(), 2);
    // Newest-first and no overlap between pages.
    let names: Vec<_> = body1["items"]
        .as_array()
        .unwrap()
        .iter()
        .chain(body2["items"].as_array().unwrap())
        .map(|c| c["name"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(names, vec!["Course 3", "Course 2", "Course 1", "Course 0"]);

    // The creator sees all 5 (their draft included).
    let mine = app.get_as(&teacher, "/api/v2/courses?limit=10").await;
    assert_eq!(mine.json()["items"].as_array().unwrap().len(), 5);
}

#[sqlx::test(migrations = "../../migrations")]
async fn announcements_follow_course_access(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "announcer").await;
    let id = create_course(&app, &teacher, "Rust 101").await;

    let created = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{id}/updates"),
            &serde_json::json!({ "title": "Week 1", "content": "Read chapter 1" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED);
    let update_id = created.json()["id"].as_str().unwrap().to_owned();

    // A rival instructor (sees the draft via read:all) can't post or edit.
    let rival = instructor(&app, "rival-announcer").await;
    let denied = app
        .post_as(
            &rival,
            &format!("/api/v2/courses/{id}/updates"),
            &serde_json::json!({ "title": "Spam", "content": "spam" }),
        )
        .await;
    assert_eq!(denied.status, StatusCode::FORBIDDEN);

    let edited = app
        .patch_as(
            &teacher,
            &format!("/api/v2/course-updates/{update_id}"),
            &serde_json::json!({ "content": "Read chapters 1-2" }),
        )
        .await;
    assert_eq!(edited.status, StatusCode::OK);
    assert_eq!(edited.json()["content"], "Read chapters 1-2");

    // Learners read the feed only once the course is published.
    let learner = app.mint_session(&[]).await;
    let hidden = app
        .get_as(&learner, &format!("/api/v2/courses/{id}/updates"))
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);
    app.post_as(
        &teacher,
        &format!("/api/v2/courses/{id}/lifecycle"),
        &serde_json::json!({ "action": "publish" }),
    )
    .await;
    let feed = app
        .get_as(&learner, &format!("/api/v2/courses/{id}/updates"))
        .await;
    assert_eq!(feed.status, StatusCode::OK);
    assert_eq!(feed.json().as_array().unwrap().len(), 1);

    let deleted = app
        .delete_as(&teacher, &format!("/api/v2/course-updates/{update_id}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let empty = app
        .get_as(&learner, &format!("/api/v2/courses/{id}/updates"))
        .await;
    assert!(empty.json().as_array().unwrap().is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn creation_requires_the_grant(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let learner = app.mint_session(&["course:read:all"]).await;
    let res = app
        .post_as(
            &learner,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Nope" }),
        )
        .await;
    assert_eq!(res.status, StatusCode::FORBIDDEN);
}
