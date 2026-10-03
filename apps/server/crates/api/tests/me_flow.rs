//! The signed-in user's own surfaces (stage 2: S-06, S-07, S-09, S-13).
//!
//! Behaviours:
//! - a course announcement notifies every enrolled learner - never staff,
//!   never strangers; list (keyset, unread filter), unread count, mark one
//!   read (another user's id is 404), read all; a type switched off stops
//!   new notifications of it;
//! - grading fans out by role: the learner gets `submission.updated` and a
//!   `grade_published` notification on their own stream, the course's
//!   teacher `grading.updated`, a stranger nothing;
//! - a reply notifies the thread's author (not the replier); a contributor
//!   application notifies the course owner;
//! - XP grants reach the stream as `xp.awarded`;
//! - deadline reminders are idempotent per learner, activity and due date;
//! - the agenda lists the deadline, the released result and the
//!   announcement of the caller only;
//! - `/me/*` needs a session.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::time::Duration;

use ab_testkit::{MintedSession, TestApp};
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use sqlx::PgPool;

async fn teacher(app: &TestApp, name: &str) -> MintedSession {
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
            "discussion:read:all",
            "discussion:create:platform",
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
            "trail:read:all",
            "trail:submit:assigned",
            "discussion:create:platform",
            "discussion:read:all",
        ],
    )
    .await
}

async fn enrol(app: &TestApp, who: &MintedSession, course_id: &str) {
    let res = app
        .post_as(
            who,
            &format!("/api/v2/trail/courses/{course_id}"),
            &serde_json::json!({}),
        )
        .await;
    assert!(res.status.is_success(), "{}", res.text());
}

/// Public course (open to contributors) with a published essay quiz due
/// in `due_in` seconds; returns (course_id, assessment_id, essay_item_id,
/// activity_id).
async fn course_with_quiz(
    app: &TestApp,
    teacher: &MintedSession,
    due_in: i64,
) -> (String, String, String, String) {
    let course = app
        .post_as(
            teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Streams" }),
        )
        .await;
    let course_id = course.json()["id"].as_str().unwrap().to_owned();
    let opened = app
        .patch_as(
            teacher,
            &format!("/api/v2/courses/{course_id}"),
            &serde_json::json!({ "open_to_contributors": true }),
        )
        .await;
    assert_eq!(opened.status, StatusCode::OK, "{}", opened.text());
    app.publish_course(&course_id).await;
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
    let activity_id = created.json()["activity_id"].as_str().unwrap().to_owned();
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
    let mut policy = app
        .get_as(teacher, &format!("/api/v2/assessments/{id}"))
        .await
        .json()["policy"]
        .clone();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    policy["due_at_unix"] = serde_json::json!(i64::try_from(now).unwrap() + due_in);
    let set = app
        .send(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{id}/policy"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &teacher.cookie)
                .body(Body::from(policy.to_string()))
                .unwrap(),
        )
        .await;
    assert_eq!(set.status, StatusCode::OK, "{}", set.text());
    let published = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    (course_id, id, essay_id, activity_id)
}

async fn notifications(app: &TestApp, who: &MintedSession, query: &str) -> serde_json::Value {
    let res = app
        .get_as(who, &format!("/api/v2/me/notifications{query}"))
        .await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.text());
    res.json()
}

async fn unread(app: &TestApp, who: &MintedSession) -> i64 {
    app.get_as(who, "/api/v2/me/notifications/unread-count")
        .await
        .json()["unread_count"]
        .as_i64()
        .unwrap()
}

async fn announce(app: &TestApp, teacher: &MintedSession, course_id: &str, title: &str) {
    let res = app
        .post_as(
            teacher,
            &format!("/api/v2/courses/{course_id}/updates"),
            &serde_json::json!({ "title": title, "content": "Read chapter 1" }),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.text());
}

/// Everything on `who`'s stream so far (replayed from the start), as
/// `(event, data)` pairs, up to `connected`.
async fn stream_events(base: &str, who: &MintedSession) -> Vec<(String, serde_json::Value)> {
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
    while !buffer.contains("event: connected") {
        let chunk = tokio::time::timeout_at(deadline, response.chunk())
            .await
            .unwrap_or_else(|_| panic!("no connected event; got {buffer:?}"))
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
        .filter(|(event, _)| event != "connected")
        .collect()
}

#[sqlx::test(migrations = "../../migrations")]
async fn announcements_notify_enrolled_learners_only(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = teacher(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    let (course_id, ..) = course_with_quiz(&app, &teacher, 86_400 * 3).await;
    enrol(&app, &alice, &course_id).await;

    announce(&app, &teacher, &course_id, "Week 1").await;
    let page = notifications(&app, &alice, "").await;
    let items = page["items"].as_array().unwrap();
    assert_eq!(items.len(), 1, "{page}");
    let first = &items[0];
    assert_eq!(first["type"], "course_update");
    assert_eq!(first["payload"]["type"], "course_update");
    assert_eq!(first["payload"]["course_id"], course_id.as_str());
    assert_eq!(first["payload"]["title"], "Week 1");
    assert!(first["read_at_unix"].is_null());
    assert_eq!(unread(&app, &alice).await, 1);
    assert_eq!(
        notifications(&app, &bob, "").await["items"],
        serde_json::json!([])
    );
    assert_eq!(
        notifications(&app, &teacher, "").await["items"],
        serde_json::json!([]),
        "staff are never notified of their own announcements"
    );

    // Another user's id is 404; the owner marks it read (idempotent).
    let id = first["id"].as_str().unwrap();
    let path = format!("/api/v2/me/notifications/{id}/read");
    let stolen = app.post_as(&bob, &path, &serde_json::json!({})).await;
    assert_eq!(stolen.status, StatusCode::NOT_FOUND);
    assert_eq!(unread(&app, &alice).await, 1);
    for _ in 0..2 {
        let read = app.post_as(&alice, &path, &serde_json::json!({})).await;
        assert_eq!(read.status, StatusCode::OK, "{}", read.text());
        assert_eq!(read.json()["unread_count"], 0);
    }
    assert_eq!(
        notifications(&app, &alice, "?unread=true").await["items"],
        serde_json::json!([])
    );
    assert!(notifications(&app, &alice, "").await["items"][0]["read_at_unix"].is_i64());

    // Switched off: no new rows of that type.
    let prefs = app
        .get_as(&alice, "/api/v2/me/notification-preferences")
        .await
        .json();
    assert_eq!(prefs["course_update"], true);
    let mut off = prefs.clone();
    off["course_update"] = serde_json::json!(false);
    let put = app
        .send(
            Request::builder()
                .method("PUT")
                .uri("/api/v2/me/notification-preferences")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &alice.cookie)
                .body(Body::from(off.to_string()))
                .unwrap(),
        )
        .await;
    assert_eq!(put.status, StatusCode::OK, "{}", put.text());
    assert_eq!(put.json(), off);
    announce(&app, &teacher, &course_id, "Muted").await;
    assert_eq!(unread(&app, &alice).await, 0);
    let mut on = off;
    on["course_update"] = serde_json::json!(true);
    let restored = app
        .send(
            Request::builder()
                .method("PUT")
                .uri("/api/v2/me/notification-preferences")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &alice.cookie)
                .body(Body::from(on.to_string()))
                .unwrap(),
        )
        .await;
    assert_eq!(restored.status, StatusCode::OK);

    // Keyset pages, then read-all.
    for title in ["A", "B", "C"] {
        announce(&app, &teacher, &course_id, title).await;
    }
    let first_page = notifications(&app, &alice, "?unread=true&limit=2").await;
    assert_eq!(first_page["items"][0]["payload"]["title"], "C");
    let cursor = first_page["next_cursor"].as_str().unwrap();
    let second = notifications(
        &app,
        &alice,
        &format!("?unread=true&limit=2&cursor={cursor}"),
    )
    .await;
    assert_eq!(second["items"].as_array().unwrap().len(), 1);
    assert!(second["next_cursor"].is_null());
    let all = app
        .post_as(
            &alice,
            "/api/v2/me/notifications/read-all",
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(all.json()["unread_count"], 0);
    let bad = app
        .get_as(&alice, "/api/v2/me/notifications?cursor=nope")
        .await;
    assert_eq!(bad.status, StatusCode::UNPROCESSABLE_ENTITY);

    // The stream carried the creation and both read events.
    let base = app.serve().await;
    let events: Vec<String> = stream_events(&base, &alice)
        .await
        .into_iter()
        .map(|(event, _)| event)
        .collect();
    assert_eq!(
        events
            .iter()
            .filter(|e| *e == "notification.created")
            .count(),
        4
    );
    assert_eq!(
        events.iter().filter(|e| *e == "notification.read").count(),
        2
    );
    assert!(stream_events(&base, &bob).await.is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn grading_fans_out_by_role_and_feeds_the_agenda(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = teacher(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    let (course_id, id, essay_id, activity_id) = course_with_quiz(&app, &teacher, 86_400 * 3).await;
    enrol(&app, &alice, &course_id).await;
    announce(&app, &teacher, &course_id, "Welcome").await;

    // Before the hand-in the agenda lists the deadline.
    let agenda = app.get_as(&alice, "/api/v2/me/agenda").await;
    assert_eq!(agenda.status, StatusCode::OK, "{}", agenda.text());
    let agenda = agenda.json();
    assert_eq!(agenda["deadlines"][0]["activity_id"], activity_id.as_str());
    assert_eq!(agenda["deadlines"][0]["assessment_id"], id.as_str());
    assert_eq!(agenda["deadlines"][0]["state"], "not_started");
    assert_eq!(agenda["course_updates"][0]["title"], "Welcome");
    assert_eq!(
        app.get_as(&alice, "/api/v2/me/agenda?days=2").await.json()["deadlines"],
        serde_json::json!([]),
        "outside the window"
    );
    assert_eq!(
        app.get_as(&alice, "/api/v2/me/agenda?days=0").await.status,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let strangers = app.get_as(&bob, "/api/v2/me/agenda").await.json();
    assert_eq!(strangers["deadlines"], serde_json::json!([]));
    assert_eq!(strangers["course_updates"], serde_json::json!([]));

    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": { &essay_id: { "kind": "open_text", "text": "Because." } } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
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

    let mine = notifications(&app, &alice, "").await;
    let grade = mine["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["type"] == "grade_published")
        .expect("grade notification");
    assert_eq!(grade["payload"]["submission_id"], sub_id.as_str());
    assert_eq!(grade["payload"]["activity_id"], activity_id.as_str());
    assert_eq!(grade["payload"]["activity_name"], "Essay");
    assert_eq!(grade["payload"]["final_score"], 90.0);
    assert_eq!(
        notifications(&app, &teacher, "").await["items"],
        serde_json::json!([])
    );

    let base = app.serve().await;
    let learner_events = stream_events(&base, &alice).await;
    let updated: Vec<&serde_json::Value> = learner_events
        .iter()
        .filter(|(e, _)| e == "submission.updated")
        .map(|(_, d)| d)
        .collect();
    let last = updated.last().expect("submission.updated");
    assert_eq!(last["payload"]["status"], "published");
    assert_eq!(last["payload"]["final_score"], 90.0);
    assert_eq!(last["payload"]["course_id"], course_id.as_str());
    assert!(
        updated.iter().all(|d| d["payload"]["status"] == "published"
            || d["payload"]["final_score"].is_null()),
        "no score before release: {updated:?}"
    );
    assert!(!learner_events.iter().any(|(e, _)| e == "grading.updated"));
    let teacher_events = stream_events(&base, &teacher).await;
    let grading: Vec<&serde_json::Value> = teacher_events
        .iter()
        .filter(|(e, _)| e == "grading.updated")
        .map(|(_, d)| d)
        .collect();
    assert_eq!(grading.len(), 2, "hand-in and release: {teacher_events:?}");
    assert_eq!(grading[0]["payload"]["user_id"], alice.user_id.to_string());
    assert_eq!(grading[1]["payload"]["status"], "published");
    assert!(stream_events(&base, &bob).await.is_empty());

    // The agenda shows the released result.
    let agenda = app.get_as(&alice, "/api/v2/me/agenda").await.json();
    assert_eq!(agenda["recent_results"][0]["kind"], "grade_published");
    assert_eq!(
        agenda["recent_results"][0]["activity_id"],
        activity_id.as_str()
    );
    assert_eq!(agenda["deadlines"][0]["state"], "passed", "{agenda}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn replies_applications_and_xp_reach_their_people(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = teacher(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    let (course_id, ..) = course_with_quiz(&app, &teacher, 86_400 * 3).await;
    enrol(&app, &alice, &course_id).await;
    enrol(&app, &bob, &course_id).await;

    let post = app
        .post_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/discussions"),
            &serde_json::json!({ "content": "<p>Question?</p>" }),
        )
        .await;
    assert_eq!(post.status, StatusCode::CREATED, "{}", post.text());
    let post_id = post.json()["id"].as_str().unwrap().to_owned();
    let reply = app
        .post_as(
            &bob,
            &format!("/api/v2/courses/{course_id}/discussions"),
            &serde_json::json!({ "content": "<p>Answer.</p>", "parent_id": post_id }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED, "{}", reply.text());
    let mine = notifications(&app, &alice, "").await;
    let note = &mine["items"][0];
    assert_eq!(note["type"], "discussion_reply");
    assert_eq!(note["payload"]["discussion_id"], post_id.as_str());
    assert_eq!(note["payload"]["author_id"], bob.user_id.to_string());
    assert_eq!(
        notifications(&app, &bob, "").await["items"],
        serde_json::json!([])
    );

    let helper = learner(&app, "helper").await;
    let applied = app
        .post_as(
            &helper,
            &format!("/api/v2/courses/{course_id}/contributors/apply"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(applied.status, StatusCode::CREATED, "{}", applied.text());
    let owner = notifications(&app, &teacher, "").await;
    assert_eq!(owner["items"][0]["type"], "contributor_application");
    assert_eq!(
        owner["items"][0]["payload"]["applicant_id"],
        helper.user_id.to_string()
    );

    let boss = app
        .create_user("boss", "boss@example.com", &["admin"])
        .await;
    let admin = app.mint_session_for(boss, &["*:*:*"]).await;
    let award = app
        .post_as(
            &admin,
            "/api/v2/gamification/xp",
            &serde_json::json!({ "user_id": alice.user_id, "amount": 50, "reason": "Helpful" }),
        )
        .await;
    assert!(award.status.is_success(), "{}", award.text());
    let base = app.serve().await;
    let xp: Vec<serde_json::Value> = stream_events(&base, &alice)
        .await
        .into_iter()
        .filter(|(e, _)| e == "xp.awarded")
        .map(|(_, d)| d)
        .collect();
    let admin_award = xp
        .iter()
        .find(|d| d["payload"]["source"] == "admin_award")
        .expect("xp.awarded");
    assert_eq!(admin_award["payload"]["amount"], 50);
    assert_eq!(admin_award["payload"]["reason"], "Helpful");
    assert!(admin_award["payload"]["total_xp"].as_i64().unwrap() >= 50);
}

#[sqlx::test(migrations = "../../migrations")]
async fn deadline_reminders_go_out_once_per_due_date(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = teacher(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let (course_id, ..) = course_with_quiz(&app, &teacher, 6 * 3600).await;
    enrol(&app, &alice, &course_id).await;
    for _ in 0..2 {
        ab_domain::progress::agenda::remind_deadlines(&app.pool)
            .await
            .unwrap();
    }
    let mine = notifications(&app, &alice, "").await;
    let items = mine["items"].as_array().unwrap();
    assert_eq!(items.len(), 1, "{mine}");
    assert_eq!(items[0]["type"], "deadline_approaching");
    assert!(items[0]["payload"]["due_at_unix"].is_i64());
    assert_eq!(
        notifications(&app, &teacher, "").await["items"],
        serde_json::json!([])
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn me_routes_need_a_session(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    for path in [
        "/api/v2/me/events",
        "/api/v2/me/notifications",
        "/api/v2/me/notifications/unread-count",
        "/api/v2/me/notification-preferences",
        "/api/v2/me/agenda",
    ] {
        assert_eq!(
            app.get(path).await.status,
            StatusCode::UNAUTHORIZED,
            "{path}"
        );
    }
    let read_all = app
        .post_json("/api/v2/me/notifications/read-all", &serde_json::json!({}))
        .await;
    assert_eq!(read_all.status, StatusCode::UNAUTHORIZED);
}
