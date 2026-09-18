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
    app.publish_course(&course).await;
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

    // UX-112: the published config keeps the type attached (the UX-104
    // guard covers file submissions too) — 409 `conflict`.
    let detached = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity_id}"),
            &serde_json::json!({ "activity_type": "dynamic", "activity_sub_type": "dynamic_page" }),
        )
        .await;
    assert_eq!(detached.status, StatusCode::CONFLICT, "{}", detached.text());
    assert_eq!(detached.json()["code"], "conflict");
}

/// The raw publish toggle refuses an assessment-backed activity whose
/// assessment is not `published` (BUG-102), and the gate reads the type
/// this PATCH sets, not the stored one (BUG-104).
#[sqlx::test(migrations = "../../migrations")]
async fn assessment_activities_publish_through_their_assessment(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let user = app
        .create_user("exams", "exams@example.com", &["instructor"])
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
    let course_id = create_course(&app, &teacher, "Exams").await;
    let chapter_id = create_chapter(&app, &teacher, &course_id, "Week 1").await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "exam", "title": "Final" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let assessment_id = created.json()["id"].as_str().unwrap().to_owned();
    let activity_id = created.json()["activity_id"].as_str().unwrap().to_owned();

    // Draft assessment → the activity cannot go live on its own.
    let refused = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity_id}"),
            &serde_json::json!({ "published": true }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::CONFLICT, "{}", refused.text());
    assert_eq!(refused.json()["code"], "activity-not-ready");
    assert_eq!(refused.json()["details"]["reason"], "assessment-not-ready");

    // Published assessment → the toggle is a no-op that succeeds.
    app.post_as(
        &teacher,
        &format!("/api/v2/assessments/{assessment_id}/items"),
        &serde_json::json!({
            "title": "1+1?", "max_score": 5,
            "body": { "kind": "choice", "prompt": "1+1?",
                      "options": [{ "id": "a", "text": "2", "is_correct": true },
                                  { "id": "b", "text": "3", "is_correct": false }] }
        }),
    )
    .await;
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{assessment_id}/lifecycle"),
            &serde_json::json!({ "to": "published", "note": "go" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    let toggled = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity_id}"),
            &serde_json::json!({ "published": true }),
        )
        .await;
    assert_eq!(toggled.status, StatusCode::OK, "{}", toggled.text());

    // UX-104: the live exam stays attached — the type cannot move away
    // from it (409 `conflict`) until the assessment is unpublished.
    let detached = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity_id}"),
            &serde_json::json!({ "activity_type": "dynamic", "activity_sub_type": "dynamic_page" }),
        )
        .await;
    assert_eq!(detached.status, StatusCode::CONFLICT, "{}", detached.text());
    assert_eq!(detached.json()["code"], "conflict");
    assert_eq!(
        app.get_as(&teacher, &format!("/api/v2/activities/{activity_id}"))
            .await
            .json()["activity_type"],
        "exam"
    );

    // UX-112: one name — a curriculum rename also renames the assessment.
    let renamed = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity_id}"),
            &serde_json::json!({ "name": "Final v2" }),
        )
        .await;
    assert_eq!(renamed.status, StatusCode::OK, "{}", renamed.text());
    assert_eq!(
        app.get_as(&teacher, &format!("/api/v2/assessments/{assessment_id}"))
            .await
            .json()["title"],
        "Final v2"
    );

    // Type change + publish in one body: the gate sees the NEW type.
    let draft = create_activity(&app, &teacher, &chapter_id, "Essay").await;
    let bypass = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{draft}"),
            &serde_json::json!({
                "activity_type": "file_submission",
                "activity_sub_type": "file_submission_standard",
                "published": true,
            }),
        )
        .await;
    assert_eq!(bypass.status, StatusCode::CONFLICT, "{}", bypass.text());
    assert_eq!(
        bypass.json()["details"]["reason"],
        "file-submission-unpublished"
    );
    let detail = app
        .get_as(&teacher, &format!("/api/v2/activities/{draft}"))
        .await;
    assert_eq!(detail.json()["published"], false);
    assert_eq!(detail.json()["activity_type"], "video");

    // BUG-135: a type change on an already-published activity runs the same
    // gate — a live page cannot silently become a quiz with no assessment.
    let live = create_activity(&app, &teacher, &chapter_id, "Live").await;
    let toggled = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{live}"),
            &serde_json::json!({ "published": true }),
        )
        .await;
    assert_eq!(toggled.status, StatusCode::OK, "{}", toggled.text());
    let retyped = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{live}"),
            &serde_json::json!({ "activity_type": "quiz", "activity_sub_type": "quiz_standard" }),
        )
        .await;
    assert_eq!(retyped.status, StatusCode::CONFLICT, "{}", retyped.text());
    assert_eq!(retyped.json()["code"], "activity-not-ready");
    let detail = app
        .get_as(&teacher, &format!("/api/v2/activities/{live}"))
        .await;
    assert_eq!(detail.json()["published"], true);
    assert_eq!(detail.json()["activity_type"], "video");
}

/// Unpublished activities exist for editors only: learners and anonymous
/// callers get a curriculum without them and a 404 for the activity and
/// its blocks (BUG-099).
#[sqlx::test(migrations = "../../migrations")]
async fn drafts_are_visible_to_editors_only(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let course = create_course(&app, &teacher, "Public").await;
    let chapter = create_chapter(&app, &teacher, &course, "One").await;
    let live = create_activity(&app, &teacher, &chapter, "Live").await;
    let draft = create_activity(&app, &teacher, &chapter, "Draft").await;
    let published = app
        .patch_as(
            &teacher,
            &format!("/api/v2/activities/{live}"),
            &serde_json::json!({ "published": true }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    app.publish_course(&course).await;

    let names = |res: ab_testkit::TestResponse| -> Vec<String> {
        res.json()["chapters"][0]["activities"]
            .as_array()
            .unwrap()
            .iter()
            .map(|a| a["name"].as_str().unwrap().to_owned())
            .collect()
    };
    let curriculum = format!("/api/v2/courses/{course}/curriculum");
    let activity = format!("/api/v2/activities/{draft}");
    let blocks = format!("/api/v2/activities/{draft}/blocks");

    // Editor: everything.
    assert_eq!(
        names(app.get_as(&teacher, &curriculum).await),
        ["Live", "Draft"]
    );
    assert_eq!(app.get_as(&teacher, &activity).await.status, StatusCode::OK);

    // Learner: filtered + 404s.
    let learner = app.mint_session(&[]).await;
    assert_eq!(names(app.get_as(&learner, &curriculum).await), ["Live"]);
    for path in [&activity, &blocks] {
        let hidden = app.get_as(&learner, path).await;
        assert_eq!(
            hidden.status,
            StatusCode::NOT_FOUND,
            "{path}: {}",
            hidden.text()
        );
        assert_eq!(hidden.json()["code"], "not-found");
    }
    // Anonymous: the same.
    assert_eq!(names(app.get(&curriculum).await), ["Live"]);
    assert_eq!(app.get(&activity).await.status, StatusCode::NOT_FOUND);
}

/// UX-027: the editor autosave (`content`) is an optimistic-lock write —
/// `If-Match` required, stale version 412, new version in the body + `ETag`.
#[sqlx::test(migrations = "../../migrations")]
async fn content_writes_are_version_locked(pool: PgPool) {
    use axum::body::Body;
    use axum::http::{Request, header};

    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let course = create_course(&app, &teacher, "Locked").await;
    let chapter = create_chapter(&app, &teacher, &course, "One").await;
    let activity = create_activity(&app, &teacher, &chapter, "Page").await;
    let path = format!("/api/v2/activities/{activity}");

    let loaded = app.get_as(&teacher, &path).await;
    assert_eq!(loaded.status, StatusCode::OK);
    assert_eq!(loaded.json()["version"], 1);
    assert_eq!(loaded.headers[header::ETAG], "\"1\"");

    let save = |if_match: Option<&str>, text: &str| {
        let mut builder = Request::builder()
            .method("PATCH")
            .uri(&path)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &teacher.cookie);
        if let Some(version) = if_match {
            builder = builder.header(header::IF_MATCH, version);
        }
        let body = serde_json::json!({ "content": { "type": "doc", "text": text } });
        builder.body(Body::from(body.to_string())).unwrap()
    };

    // Content without a version: refused, nothing written.
    let missing = app.send(save(None, "no lock")).await;
    assert_eq!(missing.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(missing.json()["field_errors"][0]["field"], "If-Match");

    // Tab A saves with the loaded version → version 2.
    let first = app.send(save(Some("\"1\""), "AAA")).await;
    assert_eq!(first.status, StatusCode::OK, "{}", first.text());
    assert_eq!(first.json()["version"], 2);
    assert_eq!(first.headers[header::ETAG], "\"2\"");

    // Tab B still holds version 1 → 412, AAA survives.
    let stale = app.send(save(Some("\"1\""), "BBB")).await;
    assert_eq!(
        stale.status,
        StatusCode::PRECONDITION_FAILED,
        "{}",
        stale.text()
    );
    assert_eq!(stale.json()["code"], "precondition-failed");
    assert_eq!(stale.json()["details"]["expected"], 1);
    assert_eq!(stale.json()["details"]["actual"], 2);
    assert_eq!(
        app.get_as(&teacher, &path).await.json()["content"]["text"],
        "AAA"
    );

    // Name/publish edits from the curriculum need no version.
    let rename = app
        .patch_as(&teacher, &path, &serde_json::json!({ "name": "Renamed" }))
        .await;
    assert_eq!(rename.status, StatusCode::OK, "{}", rename.text());
    assert_eq!(rename.json()["version"], 2);
}

/// BUG-168: blank names (`""` / `"   "`) are 422 `name`/`required` on
/// create and update, and stored names are trimmed.
#[sqlx::test(migrations = "../../migrations")]
async fn blank_names_are_rejected_and_trimmed(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let course_id = create_course(&app, &teacher, "  Trim me  ").await;
    let chapter_id = create_chapter(&app, &teacher, &course_id, "Ch").await;
    let activity_id = create_activity(&app, &teacher, &chapter_id, "Act").await;
    let course = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}"))
        .await;
    assert_eq!(course.json()["name"], "Trim me");

    let blank = serde_json::json!({ "name": "   " });
    let creates = [
        app.post_as(&teacher, "/api/v2/courses", &blank).await,
        app.post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &blank,
        )
        .await,
        app.post_as(
            &teacher,
            &format!("/api/v2/chapters/{chapter_id}/activities"),
            &serde_json::json!({
                "name": "",
                "activity_type": "video",
                "activity_sub_type": "video_youtube",
            }),
        )
        .await,
        app.patch_as(&teacher, &format!("/api/v2/courses/{course_id}"), &blank)
            .await,
        app.patch_as(&teacher, &format!("/api/v2/chapters/{chapter_id}"), &blank)
            .await,
        app.patch_as(
            &teacher,
            &format!("/api/v2/activities/{activity_id}"),
            &blank,
        )
        .await,
    ];
    for res in creates {
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
