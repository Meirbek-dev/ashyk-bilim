//! Stage 2 server gaps (S-GAPS), all additive:
//!
//! - AI feature switches toggle at runtime (`PUT
//!   /ai/admin/settings/features/{key}`, platform admins, audited); the
//!   environment stays the ceiling.
//! - A file-submission deadline extension notifies the learner
//!   (`deadline_extended` with `file_submission_id`).
//! - The deadline reminder reads a learner's own file due date.
//! - Platform admins get `grading.updated` on `/me/events`.
//! - Assessment queue stats take a `group_id` filter and echo it.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::time::Duration;

use ab_testkit::{MintedSession, TestApp, TestResponse};
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use serde_json::{Value, json};
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
            "assessment:*:own",
        ],
    )
    .await
}

async fn learner(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["user"])
        .await;
    app.mint_session_for(
        user,
        &[
            "assessment:submit:assigned",
            "assessment:read:assigned",
            "trail:submit:assigned",
            "file:create:own",
        ],
    )
    .await
}

fn now() -> i64 {
    i64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    )
    .unwrap()
}

fn s(v: &Value) -> String {
    v.as_str().unwrap().to_owned()
}

async fn put_as(app: &TestApp, who: &MintedSession, uri: &str, body: &Value) -> TestResponse {
    app.send(
        Request::builder()
            .method("PUT")
            .uri(uri)
            .header(header::COOKIE, &who.cookie)
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string()))
            .unwrap(),
    )
    .await
}

/// Published course + chapter; returns (course_id, chapter_id).
async fn course(app: &TestApp, teacher: &MintedSession) -> (String, String) {
    let course = app
        .post_as(teacher, "/api/v2/courses", &json!({ "name": "Gaps" }))
        .await;
    let course_id = s(&course.json()["id"]);
    app.publish_course(&course_id).await;
    let chapter = app
        .post_as(
            teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &json!({ "name": "Week 1" }),
        )
        .await;
    (course_id, s(&chapter.json()["id"]))
}

async fn enrol(app: &TestApp, who: &MintedSession, course_id: &str) {
    let res = app
        .post_as(
            who,
            &format!("/api/v2/trail/courses/{course_id}"),
            &json!({}),
        )
        .await;
    assert!(res.status.is_success(), "{}", res.text());
}

async fn notes(app: &TestApp, who: &MintedSession) -> Vec<Value> {
    app.get_as(who, "/api/v2/me/notifications").await.json()["items"]
        .as_array()
        .unwrap()
        .clone()
}

/// A public course's essay quiz; alice and bob hand in (pending).
/// Returns (course_id, assessment_id).
async fn essay_quiz(
    app: &TestApp,
    teacher: &MintedSession,
    learners: [&MintedSession; 2],
) -> (String, String) {
    let (course_id, chapter_id) = course(app, teacher).await;
    let created = app
        .post_as(
            teacher,
            "/api/v2/assessments",
            &json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Essay" }),
        )
        .await;
    let id = s(&created.json()["id"]);
    let essay = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &json!({ "title": "Essay", "max_score": 10,
                     "body": { "kind": "open_text", "prompt": "Why?" } }),
        )
        .await;
    let essay_id = s(&essay.json()["id"]);
    let published = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    for who in learners {
        let draft = app
            .post_as(
                who,
                &format!("/api/v2/assessments/{id}/submissions"),
                &json!({}),
            )
            .await;
        let sub = s(&draft.json()["id"]);
        let submitted = app
            .post_as(
                who,
                &format!("/api/v2/submissions/{sub}/submit"),
                &json!({ "answers": { &essay_id: { "kind": "open_text", "text": "Because." } } }),
            )
            .await;
        assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    }
    (course_id, id)
}

fn feature(list: &Value, key: &str) -> Value {
    list["features"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["key"] == key)
        .unwrap()
        .clone()
}

#[sqlx::test(migrations = "../../migrations")]
async fn ai_feature_switches_toggle_at_runtime(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let admin_user = app
        .create_user("admin", "admin@example.com", &["admin"])
        .await;
    let admin = app
        .mint_session_for(
            admin_user,
            &["platform:read:platform", "platform:update:platform"],
        )
        .await;
    let reader_user = app
        .create_user("reader", "reader@example.com", &["user"])
        .await;
    let reader = app
        .mint_session_for(reader_user, &["platform:read:platform"])
        .await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, _) = course(&app, &teacher).await;
    let path = "/api/v2/ai/admin/settings/features/course_qa_enabled";
    let caps = format!("/api/v2/ai/capabilities/scope/{course_id}");
    let qa = "course_qa_enabled";

    let before = app.get_as(&admin, "/api/v2/ai/admin/settings").await.json();
    assert_eq!(
        feature(&before, qa),
        json!({ "key": qa, "enabled": true, "editable": true, "source": "environment" })
    );
    let open = app.get_as(&teacher, &caps).await.json();
    assert_eq!(feature(&open, qa)["enabled"], true);

    // A platform reader may not switch; an unknown key is 404.
    let refused = put_as(&app, &reader, path, &json!({ "enabled": false })).await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN, "{}", refused.text());
    let unknown = put_as(
        &app,
        &admin,
        "/api/v2/ai/admin/settings/features/bogus",
        &json!({ "enabled": false }),
    )
    .await;
    assert_eq!(unknown.status, StatusCode::NOT_FOUND, "{}", unknown.text());

    // Off: the settings and the capabilities follow at once, audited.
    let off = put_as(&app, &admin, path, &json!({ "enabled": false })).await;
    assert_eq!(off.status, StatusCode::OK, "{}", off.text());
    assert_eq!(
        feature(&off.json(), qa),
        json!({ "key": qa, "enabled": false, "editable": true, "source": "runtime" })
    );
    let closed = app.get_as(&teacher, &caps).await.json();
    assert_eq!(feature(&closed, qa)["enabled"], false);
    let audited: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM auth_audit_log WHERE event = 'ai-feature-switched'
         AND metadata->>'feature' = 'course_qa_enabled' AND metadata->>'enabled' = 'false'",
    )
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(audited, 1);

    // Back on.
    let on = put_as(&app, &admin, path, &json!({ "enabled": true })).await;
    assert_eq!(feature(&on.json(), qa)["enabled"], true);
    let reopened = app.get_as(&teacher, &caps).await.json();
    assert_eq!(feature(&reopened, qa)["enabled"], true);
}

#[sqlx::test(migrations = "../../migrations")]
async fn file_extensions_notify_and_move_the_reminder(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = course(&app, &teacher).await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    enrol(&app, &alice, &course_id).await;
    enrol(&app, &bob, &course_id).await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/file-submissions",
            &json!({ "chapter_id": chapter_id, "title": "Essay",
                     "instructions": "PDF please.", "due_at_unix": now() + 7200,
                     "grade_release_mode": "batch" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let fs = s(&created.json()["id"]);
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/file-submissions/{fs}/publish"),
            &json!({}),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());

    // Bob's own date moves past the reminder window.
    let due = now() + 3 * 86_400;
    let extended = app
        .post_as(
            &teacher,
            &format!("/api/v2/file-submissions/{fs}/deadline-extensions"),
            &json!({ "user_ids": [bob.user_id], "new_due_at_unix": due }),
        )
        .await;
    assert_eq!(extended.status, StatusCode::OK, "{}", extended.text());

    let bobs = notes(&app, &bob).await;
    assert_eq!(bobs.len(), 1, "{bobs:?}");
    assert_eq!(bobs[0]["type"], "deadline_extended");
    assert_eq!(bobs[0]["payload"]["file_submission_id"], fs.as_str());
    assert!(bobs[0]["payload"]["assessment_id"].is_null());
    assert_eq!(bobs[0]["payload"]["due_at_unix"], due);
    assert!(notes(&app, &alice).await.is_empty());

    // The reminder: alice against the activity date, bob not at all.
    ab_domain::progress::agenda::remind_deadlines(&app.pool)
        .await
        .unwrap();
    let alices = notes(&app, &alice).await;
    assert_eq!(alices.len(), 1, "{alices:?}");
    assert_eq!(alices[0]["type"], "deadline_approaching");
    assert!(
        notes(&app, &bob)
            .await
            .iter()
            .all(|n| n["type"] != "deadline_approaching")
    );
}

/// `(event, data)` blocks of `/me/events`, replayed from the start, read
/// until `needle` shows.
async fn read_stream(base: &str, who: &MintedSession, needle: &str) -> Vec<(String, Value)> {
    let mut response = reqwest::Client::new()
        .get(format!("{base}/api/v2/me/events"))
        .header("cookie", &who.cookie)
        .header("last-event-id", "0-0")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let mut buffer = String::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    while !buffer.contains(needle) {
        let chunk = tokio::time::timeout_at(deadline, response.chunk())
            .await
            .unwrap_or_else(|_| panic!("no {needle}; got {buffer:?}"))
            .unwrap()
            .unwrap();
        buffer.push_str(&String::from_utf8_lossy(&chunk));
    }
    buffer
        .split("\n\n")
        .filter_map(|block| {
            let event = block.lines().find_map(|l| l.strip_prefix("event: "))?;
            let data = block.lines().find_map(|l| l.strip_prefix("data: "))?;
            Some((event.to_owned(), serde_json::from_str(data).unwrap()))
        })
        .collect()
}

#[sqlx::test(migrations = "../../migrations")]
async fn platform_admins_get_grading_updates(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let base = app.serve().await;
    let admin_user = app
        .create_user("admin", "admin@example.com", &["admin"])
        .await;
    let admin = app.mint_session_for(admin_user, &["*:*:*"]).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    let (course_id, _) = essay_quiz(&app, &teacher, [&alice, &bob]).await;

    let events = read_stream(&base, &admin, "event: grading.updated").await;
    let graded: Vec<_> = events
        .iter()
        .filter(|(event, _)| event == "grading.updated")
        .collect();
    assert!(!graded.is_empty(), "{events:?}");
    assert_eq!(graded[0].1["payload"]["course_id"], course_id.as_str());
}

#[sqlx::test(migrations = "../../migrations")]
async fn assessment_stats_filter_by_group(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    let (_, id) = essay_quiz(&app, &teacher, [&alice, &bob]).await;
    let g: uuid::Uuid =
        sqlx::query_scalar("INSERT INTO usergroups (name) VALUES ('g') RETURNING id")
            .fetch_one(&app.pool)
            .await
            .unwrap();
    sqlx::query("INSERT INTO usergroup_members (usergroup_id, user_id) VALUES ($1, $2)")
        .bind(g)
        .bind(bob.user_id.0)
        .execute(&app.pool)
        .await
        .unwrap();

    let stats = format!("/api/v2/assessments/{id}/submissions/stats");
    let all = app.get_as(&teacher, &stats).await;
    assert_eq!(all.status, StatusCode::OK, "{}", all.text());
    assert_eq!(all.json()["total"], 2);
    assert!(all.json().get("group_id").is_none());
    let mine = app
        .get_as(&teacher, &format!("{stats}?group_id={g}"))
        .await
        .json();
    assert_eq!(mine["total"], 1);
    assert_eq!(mine["needs_grading"], 1);
    assert_eq!(mine["group_id"], g.to_string());
    let unknown = uuid::Uuid::now_v7();
    assert_eq!(
        app.get_as(&teacher, &format!("{stats}?group_id={unknown}"))
            .await
            .json()["total"],
        0
    );
    assert_eq!(
        app.get_as(&alice, &stats).await.status,
        StatusCode::FORBIDDEN
    );
}

// ── S-GAPS-2 ────────────────────────────────────────────────────────────────

/// INBOX-DATA: teacher items carry the submission, the learner and a
/// translatable message; `kind` / `course_id` filter, `sort` pages by
/// its own key.
#[sqlx::test(migrations = "../../migrations")]
async fn work_queue_items_name_the_work_and_filter(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    let (course_id, _) = essay_quiz(&app, &teacher, [&alice, &bob]).await;

    let page = app.get_as(&teacher, "/api/v2/work?role=teacher").await;
    assert_eq!(page.status, StatusCode::OK, "{}", page.text());
    let page = page.json();
    assert_eq!(page["total"], 2);
    let item = &page["items"][0];
    assert_eq!(item["kind"], "needs_grading");
    assert_eq!(item["message_key"], "grade");
    assert_eq!(item["message_params"]["activity"], "Essay");
    assert_eq!(item["message_params"]["course"], "Gaps");
    assert!(item["submission_id"].is_string(), "{item}");
    assert!(item["attempt_id"].is_null());
    let names: Vec<String> = page["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| s(&i["learner_name"]))
        .collect();
    assert!(names.contains(&"alice".to_owned()), "{names:?}");

    let only = |q: &str| format!("/api/v2/work?role=teacher&{q}");
    let kind = app.get_as(&teacher, &only("kind=sla_breach")).await.json();
    assert_eq!(kind["total"], 0);
    let other = uuid::Uuid::now_v7();
    let course = app
        .get_as(&teacher, &only(&format!("course_id={other}")))
        .await
        .json();
    assert_eq!(course["total"], 0);
    let mine = app
        .get_as(&teacher, &only(&format!("course_id={course_id}")))
        .await
        .json();
    assert_eq!(mine["total"], 2);

    // `sort=newest`, one per page: two pages, each item once.
    let first = app
        .get_as(&teacher, &only("sort=newest&limit=1"))
        .await
        .json();
    let cursor = s(&first["next_cursor"]);
    let second = app
        .get_as(
            &teacher,
            &only(&format!("sort=newest&limit=1&cursor={cursor}")),
        )
        .await
        .json();
    assert_ne!(first["items"][0]["id"], second["items"][0]["id"]);
    assert!(second["next_cursor"].is_null());
    let bad = app.get_as(&teacher, &only("sort=sideways")).await;
    assert_eq!(
        bad.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        bad.text()
    );
}

async fn send_with(
    app: &TestApp,
    who: &MintedSession,
    method: &str,
    uri: &str,
    if_match: &str,
    body: Option<Value>,
) -> TestResponse {
    let mut req = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::COOKIE, &who.cookie)
        .header(header::IF_MATCH, if_match);
    if body.is_some() {
        req = req.header(header::CONTENT_TYPE, "application/json");
    }
    app.send(
        req.body(body.map_or_else(Body::empty, |b| Body::from(b.to_string())))
            .unwrap(),
    )
    .await
}

/// IFM: deletes and the remaining replace/patch writes take `If-Match`
/// (stale -> 412, current -> the write); a like does not move a post's
/// version.
#[sqlx::test(migrations = "../../migrations")]
async fn if_match_guards_deletes_and_config_writes(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice_user = app
        .create_user("alice", "alice@example.com", &["user"])
        .await;
    let alice = app
        .mint_session_for(
            alice_user,
            &[
                "assessment:submit:assigned",
                "assessment:read:assigned",
                "trail:submit:assigned",
                "discussion:create:platform",
                "discussion:read:all",
                "discussion:delete:own",
            ],
        )
        .await;
    let (course_id, chapter_id) = course(&app, &teacher).await;
    enrol(&app, &alice, &course_id).await;

    // Discussion: a like leaves the version; stale delete 412, current 204.
    let post = app
        .post_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/discussions"),
            &json!({ "content": "Hello" }),
        )
        .await;
    assert!(post.status.is_success(), "{}", post.text());
    let post_id = s(&post.json()["id"]);
    assert_eq!(post.json()["version"], 1);
    let liked = send_with(
        &app,
        &alice,
        "PUT",
        &format!("/api/v2/discussions/{post_id}/like"),
        "1",
        None,
    )
    .await;
    assert!(liked.status.is_success(), "{}", liked.text());
    let path = format!("/api/v2/discussions/{post_id}");
    let stale = send_with(&app, &alice, "DELETE", &path, "\"7\"", None).await;
    assert_eq!(
        stale.status,
        StatusCode::PRECONDITION_FAILED,
        "{}",
        stale.text()
    );
    let gone = send_with(&app, &alice, "DELETE", &path, "\"1\"", None).await;
    assert_eq!(gone.status, StatusCode::NO_CONTENT, "{}", gone.text());

    // File submission PATCH: the version moves with each change.
    let created = app
        .post_as(
            &teacher,
            "/api/v2/file-submissions",
            &json!({ "chapter_id": chapter_id, "title": "Essay", "instructions": "PDF." }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let fs = s(&created.json()["id"]);
    let v = created.json()["version"].as_i64().unwrap();
    let fs_path = format!("/api/v2/file-submissions/{fs}");
    let patch = json!({ "instructions": "PDF, please." });
    let stale = send_with(
        &app,
        &teacher,
        "PATCH",
        &fs_path,
        &(v + 5).to_string(),
        Some(patch.clone()),
    )
    .await;
    assert_eq!(
        stale.status,
        StatusCode::PRECONDITION_FAILED,
        "{}",
        stale.text()
    );
    let ok = send_with(
        &app,
        &teacher,
        "PATCH",
        &fs_path,
        &v.to_string(),
        Some(patch),
    )
    .await;
    assert_eq!(ok.status, StatusCode::OK, "{}", ok.text());
    assert_eq!(ok.json()["version"], v + 1);

    // Gamification config PUT.
    let admin = app.mint_session(&["platform:manage:platform"]).await;
    let config = app
        .get_as(&admin, "/api/v2/gamification/config")
        .await
        .json();
    let cv = config["version"].as_i64().unwrap();
    let body = json!({ "daily_xp_limit": 30, "rewards": {} });
    let stale = send_with(
        &app,
        &admin,
        "PUT",
        "/api/v2/gamification/config",
        &(cv + 1).to_string(),
        Some(body.clone()),
    )
    .await;
    assert_eq!(
        stale.status,
        StatusCode::PRECONDITION_FAILED,
        "{}",
        stale.text()
    );
    let ok = send_with(
        &app,
        &admin,
        "PUT",
        "/api/v2/gamification/config",
        &cv.to_string(),
        Some(body),
    )
    .await;
    assert_eq!(ok.status, StatusCode::OK, "{}", ok.text());

    // Course delete last (it takes the rest with it); without the header
    // the old behaviour stands.
    let stale = send_with(
        &app,
        &teacher,
        "DELETE",
        &format!("/api/v2/courses/{course_id}"),
        "99",
        None,
    )
    .await;
    assert_eq!(
        stale.status,
        StatusCode::PRECONDITION_FAILED,
        "{}",
        stale.text()
    );
    let bad = send_with(
        &app,
        &teacher,
        "DELETE",
        &format!("/api/v2/courses/{course_id}"),
        "x",
        None,
    )
    .await;
    assert_eq!(
        bad.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        bad.text()
    );
    // A stranger with a stale If-Match learns nothing new (404, not 412).
    let stranger = learner(&app, "mallory").await;
    let private = app
        .post_as(&teacher, "/api/v2/courses", &json!({ "name": "Hidden" }))
        .await;
    let hidden = s(&private.json()["id"]);
    let peek = send_with(
        &app,
        &stranger,
        "DELETE",
        &format!("/api/v2/courses/{hidden}"),
        "99",
        None,
    )
    .await;
    assert_eq!(peek.status, StatusCode::NOT_FOUND, "{}", peek.text());
}
