//! The grading event stream over a real socket: connect, receive a
//! `grade.published` pushed by a teacher's save, resume with
//! `Last-Event-ID`, the per-user connection cap, and access rules.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::time::Duration;

use ab_testkit::{MintedSession, TestApp};
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
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
        &["assessment:submit:assigned", "assessment:read:assigned"],
    )
    .await
}

/// Public course with a published essay quiz (batch release) and one
/// pending submission by `alice`; returns (submission_id, essay_item_id).
async fn pending_submission(
    app: &TestApp,
    teacher: &MintedSession,
    alice: &MintedSession,
) -> (String, String) {
    let course = app
        .post_as(
            teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Streams" }),
        )
        .await;
    let course_id = course.json()["id"].as_str().unwrap().to_owned();
    app.post_as(
        teacher,
        &format!("/api/v2/courses/{course_id}/lifecycle"),
        &serde_json::json!({ "action": "publish" }),
    )
    .await;
    let chapter = app
        .post_as(
            teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &serde_json::json!({ "name": "Week 1" }),
        )
        .await;
    let chapter_id = chapter.json()["id"].as_str().unwrap().to_owned();
    let created = app
        .post_as(
            teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Essay" }),
        )
        .await;
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let essay = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &serde_json::json!({
                "title": "Essay", "max_score": 10,
                "body": { "kind": "open_text", "prompt": "Why?" }
            }),
        )
        .await;
    let essay_id = essay.json()["id"].as_str().unwrap().to_owned();
    let published = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    let draft = app
        .post_as(
            alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .post_as(
            alice,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": { &essay_id: { "kind": "open_text", "text": "Because." } } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    (sub_id, essay_id)
}

/// Read chunks until `needle` appears (or 10s pass); returns what was read.
async fn read_until(response: &mut reqwest::Response, buffer: &mut String, needle: &str) {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    while !buffer.contains(needle) {
        let chunk = tokio::time::timeout_at(deadline, response.chunk())
            .await
            .unwrap_or_else(|_| panic!("timed out waiting for {needle}; got {buffer:?}"))
            .unwrap()
            .unwrap_or_else(|| panic!("stream ended before {needle}; got {buffer:?}"));
        buffer.push_str(&String::from_utf8_lossy(&chunk));
    }
}

fn open(
    client: &reqwest::Client,
    base: &str,
    session: &MintedSession,
    sub_id: &str,
    last_event_id: Option<&str>,
) -> reqwest::RequestBuilder {
    let mut request = client
        .get(format!("{base}/api/v2/submissions/{sub_id}/events"))
        .header("cookie", &session.cookie)
        .header("accept", "text/event-stream");
    if let Some(id) = last_event_id {
        request = request.header("last-event-id", id);
    }
    request
}

#[sqlx::test(migrations = "../../migrations")]
async fn stream_delivers_grade_events_and_resumes(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    let (sub_id, essay_id) = pending_submission(&app, &teacher, &alice).await;
    let base = app.serve().await;
    let client = reqwest::Client::new();

    // Strangers get a 404 (no existence leak); graders may listen.
    let denied = open(&client, &base, &bob, &sub_id, None)
        .send()
        .await
        .unwrap();
    assert_eq!(denied.status(), StatusCode::NOT_FOUND);
    let as_teacher = open(&client, &base, &teacher, &sub_id, None)
        .send()
        .await
        .unwrap();
    assert_eq!(as_teacher.status(), StatusCode::OK);
    drop(as_teacher);

    // Owner connects, then the teacher publishes a grade.
    let mut stream = open(&client, &base, &alice, &sub_id, None)
        .send()
        .await
        .unwrap();
    assert_eq!(stream.status(), StatusCode::OK);
    assert!(
        stream.headers()["content-type"]
            .to_str()
            .unwrap()
            .starts_with("text/event-stream")
    );
    let mut buffer = String::new();
    read_until(&mut stream, &mut buffer, "event: connected").await;

    let graded = app
        .send(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v2/submissions/{sub_id}/grade"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &teacher.cookie)
                .header(header::IF_MATCH, "1")
                .body(Body::from(
                    serde_json::json!({ "action": "publish",
                        "item_grades": [{ "item_id": &essay_id, "score": 9 }] })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
    read_until(&mut stream, &mut buffer, "event: grade.published").await;
    read_until(&mut stream, &mut buffer, "\n\n").await;
    let published_block = buffer
        .split("\n\n")
        .find(|b| b.contains("event: grade.published"))
        .unwrap()
        .to_owned();
    let event_id = published_block
        .lines()
        .find_map(|l| l.strip_prefix("id: "))
        .unwrap()
        .to_owned();
    let data: serde_json::Value = serde_json::from_str(
        published_block
            .lines()
            .find_map(|l| l.strip_prefix("data: "))
            .unwrap(),
    )
    .unwrap();
    assert_eq!(data["event"], "grade.published");
    assert_eq!(data["event_id"], event_id.as_str());
    assert_eq!(data["submission_id"], sub_id.as_str());
    assert_eq!(data["payload"]["final_score"], 90.0);
    drop(stream);

    // Resume after the event: nothing replayed, straight to `connected`.
    let mut resumed = open(&client, &base, &alice, &sub_id, Some(&event_id))
        .send()
        .await
        .unwrap();
    let mut buffer = String::new();
    read_until(&mut resumed, &mut buffer, "event: connected").await;
    assert!(!buffer.contains("grade.published"));
    drop(resumed);

    // Resume from the beginning: the missed event is replayed first.
    let mut from_start = open(&client, &base, &alice, &sub_id, Some("0-0"))
        .send()
        .await
        .unwrap();
    let mut buffer = String::new();
    read_until(&mut from_start, &mut buffer, "event: connected").await;
    let replayed = buffer.find("event: grade.published").unwrap();
    assert!(replayed < buffer.find("event: connected").unwrap());
    assert!(buffer.contains(&format!("id: {event_id}")));
}

#[sqlx::test(migrations = "../../migrations")]
async fn concurrent_streams_are_capped_per_user(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let (sub_id, _) = pending_submission(&app, &teacher, &alice).await;
    let base = app.serve().await;
    let client = reqwest::Client::new();

    let mut held = Vec::new();
    for _ in 0..5 {
        let mut stream = open(&client, &base, &alice, &sub_id, None)
            .send()
            .await
            .unwrap();
        assert_eq!(stream.status(), StatusCode::OK);
        let mut buffer = String::new();
        read_until(&mut stream, &mut buffer, "event: connected").await;
        held.push(stream);
    }
    let sixth = open(&client, &base, &alice, &sub_id, None)
        .send()
        .await
        .unwrap();
    assert_eq!(sixth.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(sixth.headers()["retry-after"], "60");
    let problem: serde_json::Value = sixth.json().await.unwrap();
    assert_eq!(problem["code"], "rate-limited");
    assert_eq!(problem["details"]["limit"], 5);
    drop(held);
}
