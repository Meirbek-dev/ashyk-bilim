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
            "file:create:own",
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

    // `course:read:all` is the public-catalogue grant every role holds; it
    // does not reveal drafts (legacy `_accessible_courses_filter`). Staff who
    // manage courses platform-wide do see them.
    let stranger = app.mint_session(&["course:read:all"]).await;
    let unseen = app
        .get_as(&stranger, &format!("/api/v2/courses/{id}"))
        .await;
    assert_eq!(unseen.status, StatusCode::NOT_FOUND);
    let listed = app.get_as(&stranger, "/api/v2/courses").await;
    assert!(listed.json()["items"].as_array().unwrap().is_empty());

    let maintainer = app
        .mint_session(&["course:read:all", "course:update:platform"])
        .await;
    let seen = app
        .get_as(&maintainer, &format!("/api/v2/courses/{id}"))
        .await;
    assert_eq!(seen.status, StatusCode::OK);

    let learner = app.mint_session(&[]).await;
    let hidden = app.get_as(&learner, &format!("/api/v2/courses/{id}")).await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);

    // Publish → learners can see it.
    app.publish_course(&id).await;
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
    // Nor may a non-creator with `course:delete:own` delete it.
    let rival_delete = app
        .delete_as(&rival, &format!("/api/v2/courses/{id}"))
        .await;
    assert_eq!(rival_delete.status, StatusCode::FORBIDDEN);

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
            app.publish_course(&id).await;
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

    // A rival instructor cannot even see the draft, let alone post to it.
    let rival = instructor(&app, "rival-announcer").await;
    let denied = app
        .post_as(
            &rival,
            &format!("/api/v2/courses/{id}/updates"),
            &serde_json::json!({ "title": "Spam", "content": "spam" }),
        )
        .await;
    assert_eq!(denied.status, StatusCode::NOT_FOUND);

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
    app.publish_course(&id).await;
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

/// Upload + finalize through the real pipeline; returns (upload id, key).
async fn finalized_upload(
    app: &TestApp,
    session: &MintedSession,
    purpose: &str,
) -> (String, String) {
    let payload = b"thumb bytes".to_vec();
    let created = app
        .post_as(
            session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": purpose, "mime": "image/png",
                                  "size_bytes": payload.len() }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK);
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let put_url = created.json()["put_url"].as_str().unwrap().to_owned();
    let put = reqwest::Client::new()
        .put(&put_url)
        .header("content-type", "image/png")
        .body(payload)
        .send()
        .await
        .unwrap();
    assert!(put.status().is_success());
    let finalized = app
        .post_as(
            session,
            &format!("/api/v2/uploads/{id}/finalize"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(finalized.status, StatusCode::OK);
    (id, finalized.json()["key"].as_str().unwrap().to_owned())
}

#[sqlx::test(migrations = "../../migrations")]
async fn thumbnail_travels_the_upload_pipeline(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let id = create_course(&app, &teacher, "Thumbs").await;
    let path = format!("/api/v2/courses/{id}");

    // Fresh courses carry no thumbnail; a wrong-purpose upload is refused.
    let fresh = app.get_as(&teacher, &path).await;
    assert!(fresh.json()["thumbnail_key"].is_null());
    let (avatar, _) = finalized_upload(&app, &teacher, "avatar").await;
    let refused = app
        .patch_as(
            &teacher,
            &path,
            &serde_json::json!({ "thumbnail_upload_id": avatar }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);

    // Claim → key on the course; a replacement releases the old key.
    let (first, first_key) = finalized_upload(&app, &teacher, "course-thumbnail").await;
    let claimed = app
        .patch_as(
            &teacher,
            &path,
            &serde_json::json!({ "thumbnail_upload_id": first }),
        )
        .await;
    assert_eq!(claimed.status, StatusCode::OK);
    assert_eq!(claimed.json()["thumbnail_key"], first_key);

    let (second, second_key) = finalized_upload(&app, &teacher, "course-thumbnail").await;
    let replaced = app
        .patch_as(
            &teacher,
            &path,
            &serde_json::json!({ "thumbnail_upload_id": second }),
        )
        .await;
    assert_eq!(replaced.json()["thumbnail_key"], second_key);
    let listed = app.get_as(&teacher, "/api/v2/courses").await;
    assert_eq!(listed.json()["items"][0]["thumbnail_key"], second_key);
    let released: bool =
        sqlx::query_scalar("SELECT expires_at IS NOT NULL FROM uploads WHERE id = $1")
            .bind(uuid::Uuid::parse_str(&first).unwrap())
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert!(
        released,
        "replaced thumbnail must re-enter the reaper's queue"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn mine_listing_filters_sorts_and_summarizes(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let rival = instructor(&app, "rival").await;
    let alpha = create_course(&app, &teacher, "Alpha").await;
    let beta = create_course(&app, &teacher, "Beta").await;
    let _draft = create_course(&app, &teacher, "Gamma draft").await;
    for id in [&alpha, &beta] {
        app.publish_course(id).await;
    }
    let other = create_course(&app, &rival, "Rival public").await;
    app.publish_course(&other).await;

    // Plain listing: everything visible (3 own + rival's public one).
    let all = app.get_as(&teacher, "/api/v2/courses").await;
    assert_eq!(all.json()["items"].as_array().unwrap().len(), 4);
    assert!(all.json().get("summary").is_none());

    // mine=true: own only, with the summary; both published courses have no
    // live activity → attention.
    let mine = app.get_as(&teacher, "/api/v2/courses?mine=true").await;
    assert_eq!(mine.status, StatusCode::OK, "{}", mine.text());
    let body = mine.json();
    let names: Vec<_> = body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap().to_owned())
        .collect();
    // Default sort: last updated first (publishing touched Alpha, then Beta).
    assert_eq!(names, vec!["Beta", "Alpha", "Gamma draft"]);
    assert_eq!(
        body["summary"],
        serde_json::json!({ "total": 3, "ready": 2, "private": 1, "attention": 2 })
    );

    let by_name = app
        .get_as(&teacher, "/api/v2/courses?mine=true&sort=name&limit=2")
        .await;
    let page1: Vec<_> = by_name.json()["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(page1, vec!["Alpha", "Beta"]);
    let cursor = by_name.json()["next_cursor"].as_str().unwrap().to_owned();
    let page2 = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses?mine=true&sort=name&limit=2&cursor={cursor}"),
        )
        .await;
    assert_eq!(page2.json()["items"][0]["name"], "Gamma draft");
    assert!(page2.json()["next_cursor"].is_null());

    let drafts = app
        .get_as(&teacher, "/api/v2/courses?mine=true&preset=drafts")
        .await;
    assert_eq!(drafts.json()["items"].as_array().unwrap().len(), 1);
    let attention = app
        .get_as(&teacher, "/api/v2/courses?mine=true&preset=attention")
        .await;
    assert_eq!(attention.json()["items"].as_array().unwrap().len(), 2);
    let searched = app
        .get_as(&teacher, "/api/v2/courses?mine=true&q=ALPH")
        .await;
    assert_eq!(searched.json()["items"].as_array().unwrap().len(), 1);
    assert_eq!(searched.json()["summary"]["total"], 3);

    // A platform updater's `mine` is everything; a learner's is empty.
    let staff = app
        .mint_session(&["course:read:all", "course:update:platform"])
        .await;
    let staff_mine = app.get_as(&staff, "/api/v2/courses?mine=true").await;
    assert_eq!(staff_mine.json()["items"].as_array().unwrap().len(), 4);
    let learner = app.mint_session(&[]).await;
    let learner_mine = app.get_as(&learner, "/api/v2/courses?mine=true").await;
    assert!(learner_mine.json()["items"].as_array().unwrap().is_empty());
    assert_eq!(learner_mine.json()["summary"]["total"], 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn readiness_reports_blockers_and_warnings(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let id = create_course(&app, &teacher, "Readiness").await;

    // Strangers: 404; a visible-but-not-writable course: 403.
    let stranger = instructor(&app, "stranger").await;
    let hidden = app
        .get_as(&stranger, &format!("/api/v2/courses/{id}/readiness"))
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);

    let empty = app
        .get_as(&teacher, &format!("/api/v2/courses/{id}/readiness"))
        .await;
    assert_eq!(empty.status, StatusCode::OK, "{}", empty.text());
    assert_eq!(empty.json()["ready"], false);
    assert_eq!(empty.json()["blockers"][0]["code"], "no-live-activity");

    let chapter = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{id}/chapters"),
            &serde_json::json!({ "name": "Week 1" }),
        )
        .await;
    let chapter_id = chapter.json()["id"].as_str().unwrap().to_owned();
    let activity = app
        .post_as(
            &teacher,
            &format!("/api/v2/chapters/{chapter_id}/activities"),
            &serde_json::json!({
                "name": "Intro", "activity_type": "video", "activity_sub_type": "video_youtube"
            }),
        )
        .await;
    let activity_id = activity.json()["id"].as_str().unwrap().to_owned();

    // Draft activity: still blocked, and the draft is a warning with a link.
    let drafted = app
        .get_as(&teacher, &format!("/api/v2/courses/{id}/readiness"))
        .await;
    assert_eq!(drafted.json()["ready"], false);
    let warnings = drafted.json()["warnings"].clone();
    let draft_warning = warnings
        .as_array()
        .unwrap()
        .iter()
        .find(|w| w["code"] == "activity-unpublished")
        .unwrap()
        .clone();
    assert_eq!(draft_warning["activity_id"], activity_id);
    assert_eq!(draft_warning["title"], "Intro");

    // The lifecycle endpoint runs the same checks: blocked while a blocker
    // remains, and the answer carries the blocker list.
    let refused = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{id}/lifecycle"),
            &serde_json::json!({ "action": "publish" }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused.json()["code"], "course-not-ready");
    assert_eq!(
        refused.json()["details"]["blockers"][0]["code"],
        "no-live-activity"
    );
    assert_eq!(
        app.get_as(&teacher, &format!("/api/v2/courses/{id}"))
            .await
            .json()["public"],
        false
    );

    app.patch_as(
        &teacher,
        &format!("/api/v2/activities/{activity_id}"),
        &serde_json::json!({ "published": true }),
    )
    .await;
    let ready = app
        .get_as(&teacher, &format!("/api/v2/courses/{id}/readiness"))
        .await;
    assert_eq!(ready.json()["ready"], true);
    assert!(ready.json()["blockers"].as_array().unwrap().is_empty());
    let codes: Vec<_> = ready.json()["warnings"]
        .as_array()
        .unwrap()
        .iter()
        .map(|w| w["code"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(
        codes,
        vec!["thumbnail-missing", "certificate-not-configured"]
    );

    // Publishing makes the course visible to everyone, but readiness stays
    // author-only.
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{id}/lifecycle"),
            &serde_json::json!({ "action": "publish" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    assert_eq!(published.json()["public"], true);
    let forbidden = app
        .get_as(&stranger, &format!("/api/v2/courses/{id}/readiness"))
        .await;
    assert_eq!(forbidden.status, StatusCode::FORBIDDEN);
}

/// Writes on an invisible course are 404s like the read (no existence
/// leak), and delete needs `course:delete:own` even for the creator.
#[sqlx::test(migrations = "../../migrations")]
async fn invisible_course_writes_are_404s_and_delete_needs_the_grant(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let id = create_course(&app, &teacher, "Hidden").await;
    let learner = app.mint_session(&[]).await;
    let patched = app
        .patch_as(
            &learner,
            &format!("/api/v2/courses/{id}"),
            &serde_json::json!({ "name": "Hijacked" }),
        )
        .await;
    assert_eq!(patched.status, StatusCode::NOT_FOUND, "{}", patched.text());
    let unpublished = app
        .post_as(
            &learner,
            &format!("/api/v2/courses/{id}/lifecycle"),
            &serde_json::json!({ "action": "unpublish" }),
        )
        .await;
    assert_eq!(
        unpublished.status,
        StatusCode::NOT_FOUND,
        "{}",
        unpublished.text()
    );
    let deleted = app
        .delete_as(&learner, &format!("/api/v2/courses/{id}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NOT_FOUND, "{}", deleted.text());

    let creator = app
        .create_user("creator", "creator@example.com", &["instructor"])
        .await;
    let creator = app
        .mint_session_for(creator, &["course:create:platform", "course:update:own"])
        .await;
    let own = create_course(&app, &creator, "Mine").await;
    let refused = app
        .delete_as(&creator, &format!("/api/v2/courses/{own}"))
        .await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN, "{}", refused.text());
}
