//! Curriculum flows: chapter/activity CRUD, legacy ordering semantics
//! (1-based contiguous positions, clamp-and-renumber moves), access control.
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
            &serde_json::json!({ "name": name }),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED);
    res.json()["id"].as_str().unwrap().to_owned()
}

async fn create_chapter(
    app: &TestApp,
    session: &MintedSession,
    course_id: &str,
    name: &str,
) -> String {
    let res = app
        .post_as(
            session,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &serde_json::json!({ "name": name }),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED);
    res.json()["id"].as_str().unwrap().to_owned()
}

async fn create_activity(
    app: &TestApp,
    session: &MintedSession,
    chapter_id: &str,
    name: &str,
) -> String {
    let res = app
        .post_as(
            session,
            &format!("/api/v2/chapters/{chapter_id}/activities"),
            &serde_json::json!({
                "name": name,
                "activity_type": "video",
                "activity_sub_type": "video_youtube",
            }),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED);
    res.json()["id"].as_str().unwrap().to_owned()
}

/// Chapter names in curriculum order.
async fn chapter_names(app: &TestApp, session: &MintedSession, course_id: &str) -> Vec<String> {
    let res = app
        .get_as(session, &format!("/api/v2/courses/{course_id}/curriculum"))
        .await;
    assert_eq!(res.status, StatusCode::OK);
    res.json()["chapters"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap().to_owned())
        .collect()
}

#[sqlx::test(migrations = "../../migrations")]
async fn chapters_append_move_and_renumber(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let course = create_course(&app, &teacher, "Rust 101").await;

    let ch_a = create_chapter(&app, &teacher, &course, "A").await;
    create_chapter(&app, &teacher, &course, "B").await;
    let ch_c = create_chapter(&app, &teacher, &course, "C").await;
    assert_eq!(
        chapter_names(&app, &teacher, &course).await,
        ["A", "B", "C"]
    );

    // Move C to the front; positions stay 1-based contiguous.
    let moved = app
        .post_as(
            &teacher,
            &format!("/api/v2/chapters/{ch_c}/move"),
            &serde_json::json!({ "position": 1 }),
        )
        .await;
    assert_eq!(moved.status, StatusCode::NO_CONTENT);
    assert_eq!(
        chapter_names(&app, &teacher, &course).await,
        ["C", "A", "B"]
    );

    // Out-of-range positions clamp to the end (legacy semantics).
    app.post_as(
        &teacher,
        &format!("/api/v2/chapters/{ch_c}/move"),
        &serde_json::json!({ "position": 99 }),
    )
    .await;
    assert_eq!(
        chapter_names(&app, &teacher, &course).await,
        ["A", "B", "C"]
    );

    // Rename, then delete: the gap closes.
    let renamed = app
        .patch_as(
            &teacher,
            &format!("/api/v2/chapters/{ch_a}"),
            &serde_json::json!({ "name": "A2" }),
        )
        .await;
    assert_eq!(renamed.status, StatusCode::OK);
    assert_eq!(renamed.json()["name"], "A2");

    let deleted = app
        .delete_as(&teacher, &format!("/api/v2/chapters/{ch_a}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let res = app
        .get_as(&teacher, &format!("/api/v2/courses/{course}/curriculum"))
        .await;
    let chapters = res.json()["chapters"].as_array().unwrap().clone();
    assert_eq!(chapters.len(), 2);
    let positions: Vec<_> = chapters
        .iter()
        .map(|c| c["position"].as_i64().unwrap())
        .collect();
    assert_eq!(positions, [1, 2], "delete must renumber contiguously");
}

#[sqlx::test(migrations = "../../migrations")]
async fn activities_order_within_and_across_chapters(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let course = create_course(&app, &teacher, "Rust 101").await;
    let ch1 = create_chapter(&app, &teacher, &course, "One").await;
    let ch2 = create_chapter(&app, &teacher, &course, "Two").await;

    let v1 = create_activity(&app, &teacher, &ch1, "v1").await;
    let v2 = create_activity(&app, &teacher, &ch1, "v2").await;
    create_activity(&app, &teacher, &ch1, "v3").await;

    // Type/subtype pairs outside the closed set are rejected.
    let invalid = app
        .post_as(
            &teacher,
            &format!("/api/v2/chapters/{ch1}/activities"),
            &serde_json::json!({
                "name": "bad",
                "activity_type": "video",
                "activity_sub_type": "exam_standard",
            }),
        )
        .await;
    assert_eq!(invalid.status, StatusCode::UNPROCESSABLE_ENTITY);

    // Publish flag flips via PATCH.
    let published = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{v1}"),
            &serde_json::json!({ "published": true }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK);
    assert_eq!(published.json()["published"], true);

    // Move v2 into chapter two; both chapters renumber contiguously.
    let moved = app
        .post_as(
            &teacher,
            &format!("/api/v2/activities/{v2}/move"),
            &serde_json::json!({ "position": 1, "chapter_id": ch2 }),
        )
        .await;
    assert_eq!(moved.status, StatusCode::NO_CONTENT);

    let res = app
        .get_as(&teacher, &format!("/api/v2/courses/{course}/curriculum"))
        .await;
    let body = res.json();
    let chapters = body["chapters"].as_array().unwrap();
    let acts = |name: &str| -> Vec<(String, i64)> {
        chapters.iter().find(|c| c["name"] == name).unwrap()["activities"]
            .as_array()
            .unwrap()
            .iter()
            .map(|a| {
                (
                    a["name"].as_str().unwrap().to_owned(),
                    a["position"].as_i64().unwrap(),
                )
            })
            .collect()
    };
    assert_eq!(acts("One"), [("v1".into(), 1), ("v3".into(), 2)]);
    assert_eq!(acts("Two"), [("v2".into(), 1)]);

    // A move to a chapter of another course is refused.
    let other = create_course(&app, &teacher, "Other").await;
    let foreign = create_chapter(&app, &teacher, &other, "Foreign").await;
    let refused = app
        .post_as(
            &teacher,
            &format!("/api/v2/activities/{v2}/move"),
            &serde_json::json!({ "position": 1, "chapter_id": foreign }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);

    // Deleting an activity closes the gap.
    let deleted = app
        .delete_as(&teacher, &format!("/api/v2/activities/{v1}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let res = app
        .get_as(&teacher, &format!("/api/v2/courses/{course}/curriculum"))
        .await;
    let body = res.json();
    let one = body["chapters"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["name"] == "One")
        .unwrap();
    assert_eq!(
        one["activities"].as_array().unwrap()[0]["position"]
            .as_i64()
            .unwrap(),
        1,
        "delete must renumber contiguously"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn curriculum_respects_course_access(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let course = create_course(&app, &teacher, "Private").await;
    let chapter = create_chapter(&app, &teacher, &course, "One").await;

    // A rival instructor cannot see the draft (`course:read:all` is the
    // public-catalogue grant), so authoring on it is a 404 — no existence
    // leak; a learner can't see the private curriculum either.
    let rival = instructor(&app, "rival").await;
    let denied = app
        .post_as(
            &rival,
            &format!("/api/v2/courses/{course}/chapters"),
            &serde_json::json!({ "name": "Hijack" }),
        )
        .await;
    assert_eq!(denied.status, StatusCode::NOT_FOUND);
    let denied = app
        .patch_as(
            &rival,
            &format!("/api/v2/chapters/{chapter}"),
            &serde_json::json!({ "name": "Hijack" }),
        )
        .await;
    assert_eq!(denied.status, StatusCode::NOT_FOUND);

    let learner = app.mint_session(&[]).await;
    let hidden = app
        .get_as(&learner, &format!("/api/v2/courses/{course}/curriculum"))
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);

    // Published course → learners read the curriculum.
    app.post_as(
        &teacher,
        &format!("/api/v2/courses/{course}/lifecycle"),
        &serde_json::json!({ "action": "publish" }),
    )
    .await;
    let visible = app
        .get_as(&learner, &format!("/api/v2/courses/{course}/curriculum"))
        .await;
    assert_eq!(visible.status, StatusCode::OK);
    assert_eq!(visible.json()["chapters"].as_array().unwrap().len(), 1);
}

/// The raw activity toggle refuses to publish a file-submission activity
/// whose config is still a draft (409 `activity-not-ready`); publishing the
/// config flips both.
#[sqlx::test(migrations = "../../migrations")]
async fn file_submission_activity_needs_a_published_config(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("files", "files@example.com", &["instructor"])
        .await;
    let teacher = app
        .mint_session_for(
            user,
            &[
                "course:create:platform",
                "course:read:all",
                "course:update:own",
                "assessment:*:own",
            ],
        )
        .await;
    let course_id = create_course(&app, &teacher, "Files").await;
    let chapter_id = create_chapter(&app, &teacher, &course_id, "Week 1").await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/file-submissions",
            &serde_json::json!({
                "chapter_id": chapter_id, "title": "Essay",
                "instructions": "Upload your essay.",
            }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let config_id = created.json()["id"].as_str().unwrap().to_owned();
    let activity_id = created.json()["activity_id"].as_str().unwrap().to_owned();

    let refused = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity_id}"),
            &serde_json::json!({ "published": true }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::CONFLICT, "{}", refused.text());
    assert_eq!(refused.json()["code"], "activity-not-ready");

    // Readiness names the activity while the config is a draft — once it
    // is published through the file-submission route, the course is ready.
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/file-submissions/{config_id}/publish"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    let readiness = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}/readiness"))
        .await;
    assert_eq!(readiness.json()["ready"], true, "{}", readiness.text());

    // Renaming (no publish flip) is untouched by the gate.
    let renamed = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity_id}"),
            &serde_json::json!({ "name": "Essay v2", "published": true }),
        )
        .await;
    assert_eq!(renamed.status, StatusCode::OK, "{}", renamed.text());
}
