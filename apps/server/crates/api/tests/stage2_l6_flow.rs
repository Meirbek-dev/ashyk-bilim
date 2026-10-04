//! Stage 2 server lane L-6 (all additive to the old web's contract):
//!
//! - Grading (S-6.1): a group filter on both review queues and the
//!   gradebook; gradebook `q` and `status=needs_grading`; the file queue at
//!   parity with the assessment queue (`late_only`, `sort` / `order`,
//!   `enrolled` / `staff`, stats, bulk publish, deadline extension); a bulk
//!   return for both kinds; the file grading history.
//! - Downloads: `disposition=inline` signs an inline disposition and the
//!   reply carries the origin-relative `path`.
//! - Event stream (S-3.8): `connected` carries the stream position as its
//!   id; `deadline.extended` reaches the learner.
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

async fn send(
    app: &TestApp,
    who: &MintedSession,
    method: &str,
    uri: &str,
    body: Option<Value>,
    headers: &[(&str, &str)],
) -> TestResponse {
    let mut req = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::COOKIE, &who.cookie);
    if body.is_some() {
        req = req.header(header::CONTENT_TYPE, "application/json");
    }
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    let body = body.map_or_else(Body::empty, |b| Body::from(b.to_string()));
    app.send(req.body(body).unwrap()).await
}

/// Published course + chapter; returns (course_id, chapter_id).
async fn course(app: &TestApp, teacher: &MintedSession) -> (String, String) {
    let course = app
        .post_as(teacher, "/api/v2/courses", &json!({ "name": "L-6" }))
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

/// A usergroup holding `members` (direct rows: the group API is not under test).
async fn group(app: &TestApp, members: &[&MintedSession]) -> String {
    let id: uuid::Uuid =
        sqlx::query_scalar("INSERT INTO usergroups (name) VALUES ('g') RETURNING id")
            .fetch_one(&app.pool)
            .await
            .unwrap();
    for m in members {
        sqlx::query("INSERT INTO usergroup_members (usergroup_id, user_id) VALUES ($1, $2)")
            .bind(id)
            .bind(m.user_id.0)
            .execute(&app.pool)
            .await
            .unwrap();
    }
    id.to_string()
}

async fn upload(app: &TestApp, who: &MintedSession, mime: &str, payload: &[u8]) -> String {
    let created = app
        .post_as(
            who,
            "/api/v2/uploads",
            &json!({ "purpose": "file-submission", "mime": mime,
                     "size_bytes": payload.len() }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK, "{}", created.text());
    let id = s(&created.json()["id"]);
    let put = reqwest::Client::new()
        .put(created.json()["put_url"].as_str().unwrap())
        .header("content-type", mime)
        .header("if-none-match", "*")
        .body(payload.to_vec())
        .send()
        .await
        .unwrap();
    assert!(put.status().is_success());
    let fin = app
        .post_as(who, &format!("/api/v2/uploads/{id}/finalize"), &json!({}))
        .await;
    assert_eq!(fin.status, StatusCode::OK, "{}", fin.text());
    id
}

/// Hand in one PDF; returns the attempt JSON.
async fn hand_in(app: &TestApp, who: &MintedSession, fs: &str) -> Value {
    let upload = upload(app, who, "application/pdf", b"%PDF-1.4 l6").await;
    let submitted = app
        .post_as(
            who,
            &format!("/api/v2/file-submissions/{fs}/submit"),
            &json!({ "files": [{ "upload_id": upload }] }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    submitted.json()
}

#[sqlx::test(migrations = "../../migrations")]
async fn file_review_has_assessment_parity(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_, chapter_id) = course(&app, &teacher).await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    let mallory = learner(&app, "mallory").await;
    let created = app
        .post_as(
            &teacher,
            "/api/v2/file-submissions",
            &json!({ "chapter_id": chapter_id, "title": "Essay",
                     "instructions": "PDF please.", "due_at_unix": now() + 3600,
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
    let a = hand_in(&app, &alice, &fs).await;
    let b = hand_in(&app, &bob, &fs).await;
    let (a_id, b_id) = (s(&a["id"]), s(&b["id"]));
    let g = group(&app, &[&alice]).await;
    let queue = format!("/api/v2/file-submissions/{fs}/submissions");

    // Group filter + membership flags.
    let page = app.get_as(&teacher, &format!("{queue}?group_id={g}")).await;
    assert_eq!(page.status, StatusCode::OK, "{}", page.text());
    let items = page.json()["items"].as_array().unwrap().clone();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["id"], a_id.as_str());
    assert_eq!(items[0]["enrolled"], true);
    assert_eq!(items[0]["staff"], false);
    // Nothing is late.
    let late = app
        .get_as(&teacher, &format!("{queue}?late_only=true"))
        .await;
    assert!(late.json()["items"].as_array().unwrap().is_empty());

    // Grade alice (held in batch mode): score order puts her first, and
    // ascending order with a one-row page pages through both by cursor.
    let graded = send(
        &app,
        &teacher,
        "PATCH",
        &format!("/api/v2/file-submission-attempts/{a_id}/grade"),
        Some(json!({ "action": "save", "final_score": 80 })),
        &[("if-match", &a["version"].to_string())],
    )
    .await;
    assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
    let by_score = app
        .get_as(&teacher, &format!("{queue}?sort=final_score"))
        .await
        .json();
    assert_eq!(by_score["items"][0]["id"], a_id.as_str());
    let first = app
        .get_as(
            &teacher,
            &format!("{queue}?sort=final_score&order=asc&limit=1"),
        )
        .await
        .json();
    assert_eq!(first["items"][0]["id"], b_id.as_str());
    let cursor = s(&first["next_cursor"]);
    let second = app
        .get_as(
            &teacher,
            &format!("{queue}?sort=final_score&order=asc&limit=1&cursor={cursor}"),
        )
        .await
        .json();
    assert_eq!(second["items"][0]["id"], a_id.as_str());

    let stats = app.get_as(&teacher, &format!("{queue}/stats")).await;
    assert_eq!(stats.status, StatusCode::OK, "{}", stats.text());
    assert_eq!(
        stats.json(),
        json!({ "total": 2, "submitted": 1, "graded": 1, "published": 0,
                "returned": 0, "late": 0 })
    );
    let grouped = app
        .get_as(&teacher, &format!("{queue}/stats?group_id={g}"))
        .await
        .json();
    assert_eq!(grouped["total"], 1);

    // Bulk publish releases the held grade; the ledger has both saves.
    let released = app
        .post_as(
            &teacher,
            &format!("/api/v2/file-submissions/{fs}/publish-grades"),
            &json!({}),
        )
        .await;
    assert_eq!(released.status, StatusCode::OK, "{}", released.text());
    assert_eq!(
        released.json(),
        json!({ "done_count": 1, "skipped_count": 0 })
    );
    let history = app
        .get_as(
            &teacher,
            &format!("/api/v2/file-submission-attempts/{a_id}/grading-history"),
        )
        .await;
    assert_eq!(history.status, StatusCode::OK, "{}", history.text());
    let entries = history.json();
    assert_eq!(entries.as_array().unwrap().len(), 2, "{entries}");
    assert_eq!(entries[0]["status"], "published");
    assert_eq!(entries[1]["status"], "graded");
    assert_eq!(entries[1]["raw_score"], 80.0);
    // Not the learner's to read.
    assert_eq!(
        app.get_as(
            &alice,
            &format!("/api/v2/file-submission-attempts/{a_id}/grading-history")
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );

    // Bulk return: alice's published grade is final (skipped), bob's work
    // goes back.
    let returned = app
        .post_as(
            &teacher,
            &format!("/api/v2/file-submissions/{fs}/return-grades"),
            &json!({ "attempt_ids": [a_id, b_id] }),
        )
        .await;
    assert_eq!(returned.status, StatusCode::OK, "{}", returned.text());
    assert_eq!(
        returned.json(),
        json!({ "done_count": 1, "skipped_count": 1 })
    );
    let bob_view = app
        .get_as(&bob, &format!("/api/v2/file-submission-attempts/{b_id}"))
        .await
        .json();
    assert_eq!(bob_view["status"], "returned");
    assert_eq!(
        app.post_as(
            &alice,
            &format!("/api/v2/file-submissions/{fs}/return-grades"),
            &json!({ "attempt_ids": [b_id] }),
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );

    // Deadline extension: members only, then bob's own due date shows.
    let due = now() + 86_400 * 3;
    let stranger = app
        .post_as(
            &teacher,
            &format!("/api/v2/file-submissions/{fs}/deadline-extensions"),
            &json!({ "user_ids": [mallory.user_id], "new_due_at_unix": due }),
        )
        .await;
    assert_eq!(stranger.status, StatusCode::UNPROCESSABLE_ENTITY);
    let extended = app
        .post_as(
            &teacher,
            &format!("/api/v2/file-submissions/{fs}/deadline-extensions"),
            &json!({ "user_ids": [bob.user_id], "new_due_at_unix": due, "reason": "ill" }),
        )
        .await;
    assert_eq!(extended.status, StatusCode::OK, "{}", extended.text());
    assert_eq!(extended.json()["done_count"], 1);
    let mine = app
        .get_as(&bob, &format!("/api/v2/file-submissions/{fs}"))
        .await
        .json();
    assert_eq!(mine["due_at_unix"], due);
    let theirs = app
        .get_as(&alice, &format!("/api/v2/file-submissions/{fs}"))
        .await
        .json();
    assert_ne!(theirs["due_at_unix"], due);

    // Inline preview URL: same signature path, origin-relative copy.
    let file_id = s(&a["files"][0]["id"]);
    let signed = app
        .get_as(
            &teacher,
            &format!("/api/v2/file-submission-files/{file_id}/url?disposition=inline"),
        )
        .await;
    assert_eq!(signed.status, StatusCode::OK, "{}", signed.text());
    let path = s(&signed.json()["path"]);
    let url = s(&signed.json()["url"]);
    assert!(path.starts_with("/ab-private/"), "{path}");
    assert!(url.ends_with(&path));
    assert!(
        path.contains("response-content-disposition=inline"),
        "{path}"
    );
    let fetched = reqwest::get(&url).await.unwrap();
    assert!(fetched.status().is_success(), "{}", fetched.status());
    assert!(
        fetched.headers()["content-disposition"]
            .to_str()
            .unwrap()
            .starts_with("inline")
    );
    assert_eq!(fetched.headers()["content-type"], "application/pdf");

    // REVIEW-1 H4: an HTML hand-in never previews - `inline` is ignored and
    // the bytes come back as a neutral download.
    let html = upload(&app, &mallory, "text/html", b"<script>alert(1)</script>").await;
    let handed = app
        .post_as(
            &mallory,
            &format!("/api/v2/file-submissions/{fs}/submit"),
            &json!({ "files": [{ "upload_id": html }] }),
        )
        .await;
    assert_eq!(handed.status, StatusCode::OK, "{}", handed.text());
    let html_file = s(&handed.json()["files"][0]["id"]);
    let signed = app
        .get_as(
            &teacher,
            &format!("/api/v2/file-submission-files/{html_file}/url?disposition=inline"),
        )
        .await;
    assert_eq!(signed.status, StatusCode::OK, "{}", signed.text());
    let fetched = reqwest::get(s(&signed.json()["url"])).await.unwrap();
    assert!(fetched.status().is_success(), "{}", fetched.status());
    assert!(
        fetched.headers()["content-disposition"]
            .to_str()
            .unwrap()
            .starts_with("attachment;"),
        "{:?}",
        fetched.headers()
    );
    assert_eq!(
        fetched.headers()["content-type"],
        "application/octet-stream"
    );
}

/// Public course with an essay quiz; alice and bob hand in (pending).
/// Returns (course_id, assessment_id, [alice_sub, bob_sub]).
async fn essay_quiz(
    app: &TestApp,
    teacher: &MintedSession,
    learners: [&MintedSession; 2],
) -> (String, String, Vec<String>) {
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
    let mut subs = Vec::new();
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
        subs.push(sub);
    }
    (course_id, id, subs)
}

#[sqlx::test(migrations = "../../migrations")]
async fn assessment_queue_groups_gradebook_filters_and_bulk_return(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    let (course_id, id, subs) = essay_quiz(&app, &teacher, [&alice, &bob]).await;
    let g = group(&app, &[&bob]).await;

    let queue = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/submissions?group_id={g}"),
        )
        .await;
    assert_eq!(queue.status, StatusCode::OK, "{}", queue.text());
    let items = queue.json()["items"].as_array().unwrap().clone();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["id"], subs[1].as_str());

    let book = format!("/api/v2/courses/{course_id}/gradebook");
    let users = |page: &Value| -> Vec<String> {
        page["users"]
            .as_array()
            .unwrap()
            .iter()
            .map(|u| s(&u["username"]))
            .collect()
    };
    let all = app.get_as(&teacher, &book).await;
    assert_eq!(all.status, StatusCode::OK, "{}", all.text());
    assert_eq!(users(&all.json()).len(), 2);
    assert_eq!(
        users(&app.get_as(&teacher, &format!("{book}?q=ALI")).await.json()),
        ["alice"]
    );
    assert_eq!(
        users(
            &app.get_as(&teacher, &format!("{book}?group_id={g}"))
                .await
                .json()
        ),
        ["bob"]
    );
    assert_eq!(
        users(
            &app.get_as(&teacher, &format!("{book}?status=needs_grading"))
                .await
                .json()
        )
        .len(),
        2
    );

    // Bulk return: both go back; a foreign id is a skip, a learner is refused.
    let foreign = uuid::Uuid::now_v7().to_string();
    let returned = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/return-grades"),
            &json!({ "submission_ids": [subs[0], subs[1], foreign] }),
        )
        .await;
    assert_eq!(returned.status, StatusCode::OK, "{}", returned.text());
    assert_eq!(
        returned.json(),
        json!({ "done_count": 2, "skipped_count": 1 })
    );
    assert!(
        users(
            &app.get_as(&teacher, &format!("{book}?status=needs_grading"))
                .await
                .json()
        )
        .is_empty()
    );
    assert_eq!(
        app.post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/return-grades"),
            &json!({ "submission_ids": [subs[1]] }),
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );
    let empty = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/return-grades"),
            &json!({ "submission_ids": [] }),
        )
        .await;
    assert_eq!(empty.status, StatusCode::UNPROCESSABLE_ENTITY);
}

/// `(event, data)` blocks read until `needle` shows.
async fn read_stream(
    base: &str,
    who: &MintedSession,
    last_event_id: Option<&str>,
    needle: &str,
) -> Vec<(String, Option<String>, Value)> {
    let mut request = reqwest::Client::new()
        .get(format!("{base}/api/v2/me/events"))
        .header("cookie", &who.cookie);
    if let Some(id) = last_event_id {
        request = request.header("last-event-id", id);
    }
    let mut response = request.send().await.unwrap();
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
            let id = block
                .lines()
                .find_map(|l| l.strip_prefix("id: "))
                .map(str::to_owned);
            let data = block.lines().find_map(|l| l.strip_prefix("data: "))?;
            Some((event.to_owned(), id, serde_json::from_str(data).unwrap()))
        })
        .collect()
}

#[sqlx::test(migrations = "../../migrations")]
async fn connected_carries_the_position_and_extensions_are_streamed(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let base = app.serve().await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    let (_, id, _) = essay_quiz(&app, &teacher, [&alice, &bob]).await;

    // A quiet stream: `connected` carries `0-0` both as id and event_id.
    let quiet = read_stream(&base, &alice, None, "event: connected").await;
    let (_, hello_id, hello) = quiet.last().unwrap();
    assert_eq!(hello["event"], "connected");
    assert_eq!(hello_id.as_deref(), hello["event_id"].as_str());
    let position = s(&hello["event_id"]);

    // An extension lands after that position: resuming from it replays
    // exactly the new event, then `connected` moves to its id.
    let due = now() + 86_400 * 2;
    let queued = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/overrides/{}", alice.user_id),
            &json!({ "due_at_override_unix": due }),
        )
        .await;
    assert!(queued.status.is_success(), "{}", queued.text());
    let resumed = read_stream(&base, &alice, Some(&position), "event: connected").await;
    let extended: Vec<_> = resumed
        .iter()
        .filter(|(event, ..)| event == "deadline.extended")
        .collect();
    assert_eq!(extended.len(), 1, "{resumed:?}");
    let (_, ext_id, ext) = extended[0];
    assert_eq!(ext["payload"]["assessment_id"], id.as_str());
    assert!(ext["payload"]["file_submission_id"].is_null());
    assert_eq!(ext["payload"]["due_at_unix"], due);
    // `connected` moves to the newest replayed event (the notification
    // follows the extension).
    let (_, _, hello) = resumed.last().unwrap();
    let (_, newest, _) = &resumed[resumed.len() - 2];
    assert!(ext_id.as_deref() <= newest.as_deref());
    assert_eq!(hello["event_id"].as_str(), newest.as_deref());
}
