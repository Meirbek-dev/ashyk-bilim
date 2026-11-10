//! Personal messages (docs/DIALOGS.md, acceptance criteria of section 11).
//!
//! - a learner writes to a teacher of their course: the first message makes the
//!   conversation, the teacher sees it unread, reads it and answers;
//! - nobody writes without a course link (learner to learner, to a teacher of
//!   another course, an archived course): 403 `message-recipient-not-allowed`;
//! - another pair's conversation and message are 404;
//! - unenrolment closes sending and keeps reading; enrolment again reopens it;
//! - a resend with the same `client_key` stores one message;
//! - two first messages towards each other make one conversation;
//! - the author deletes (a tombstone); the other side reports once, the
//!   administrator reads the report with the text as reported, resolves it with
//!   a ban (403 `messages-banned`), lifts the ban; the reporter is notified;
//! - an administrator writes to anyone; one answers them, never starts;
//! - the sender's limit per minute is 429 `rate-limited`;
//! - erasing a person leaves the other side tombstones;
//! - retention deletes a conversation quiet for longer than the window.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::id::UserId;
use ab_testkit::{MintedSession, TestApp};
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

const ADMIN_USERS: &str = "platform:read:platform";

struct World {
    app: TestApp,
    pool: PgPool,
    course: Uuid,
    teacher: MintedSession,
    learner: MintedSession,
    other_learner: MintedSession,
}

async fn user(app: &TestApp, name: &str, roles: &[&str], grants: &[&str]) -> MintedSession {
    let id = app
        .create_user(name, &format!("{name}@example.com"), roles)
        .await;
    app.mint_session_for(id, grants).await
}

async fn course(pool: &PgPool, creator: UserId) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO courses (name, creator_id, public) VALUES ('Course', $1, true) RETURNING id",
    )
    .bind(creator.0)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn enrol(pool: &PgPool, course: Uuid, user: UserId) {
    sqlx::query("INSERT INTO enrolments (course_id, user_id) VALUES ($1, $2)")
        .bind(course)
        .bind(user.0)
        .execute(pool)
        .await
        .unwrap();
}

async fn unenrol(pool: &PgPool, course: Uuid, user: UserId) {
    sqlx::query("DELETE FROM enrolments WHERE course_id = $1 AND user_id = $2")
        .bind(course)
        .bind(user.0)
        .execute(pool)
        .await
        .unwrap();
}

async fn world(pool: PgPool) -> World {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = user(&app, "teacher", &["instructor"], &[]).await;
    let learner = user(&app, "learner", &["user"], &[]).await;
    let other_learner = user(&app, "learner2", &["user"], &[]).await;
    let course = course(&pool, teacher.user_id).await;
    sqlx::query(
        "INSERT INTO course_staff (course_id, user_id, authorship, status) VALUES ($1, $2, 'creator', 'active')",
    )
    .bind(course)
    .bind(teacher.user_id.0)
    .execute(&pool)
    .await
    .unwrap();
    enrol(&pool, course, learner.user_id).await;
    enrol(&pool, course, other_learner.user_id).await;
    World {
        app,
        pool,
        course,
        teacher,
        learner,
        other_learner,
    }
}

async fn send(
    app: &TestApp,
    from: &MintedSession,
    to: UserId,
    body: &str,
) -> ab_testkit::TestResponse {
    app.post_as(
        from,
        "/api/v2/messages",
        &json!({ "to_user_id": to, "body": body, "client_key": Uuid::now_v7() }),
    )
    .await
}

async fn put_as(app: &TestApp, session: &MintedSession, path: &str, body: &Value) -> StatusCode {
    app.send(
        Request::builder()
            .method("PUT")
            .uri(path)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &session.cookie)
            .body(Body::from(body.to_string()))
            .unwrap(),
    )
    .await
    .status
}

fn code(response: &ab_testkit::TestResponse) -> String {
    response.json()["code"]
        .as_str()
        .unwrap_or_default()
        .to_owned()
}

#[ab_testdb::test]
async fn an_anonymous_caller_is_refused(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    assert_eq!(
        app.get("/api/v2/me/conversations").await.status,
        StatusCode::UNAUTHORIZED
    );
    let sent = app
        .post_json(
            "/api/v2/messages",
            &json!({ "to_user_id": Uuid::now_v7(), "body": "hi", "client_key": Uuid::now_v7() }),
        )
        .await;
    assert_eq!(sent.status, StatusCode::UNAUTHORIZED);
}

#[ab_testdb::test]
async fn a_learner_writes_to_their_teacher_who_reads_and_answers(pool: PgPool) {
    let w = world(pool).await;
    let sent = send(
        &w.app,
        &w.learner,
        w.teacher.user_id,
        "  Hello, **teacher**  ",
    )
    .await;
    assert_eq!(sent.status, StatusCode::CREATED, "{}", sent.text());
    let message = sent.json();
    assert_eq!(message["body"], "Hello, **teacher**");
    assert_eq!(message["allowed_actions"], json!(["delete"]));
    let conversation = message["conversation_id"].as_str().unwrap().to_owned();

    let unread = w
        .app
        .get_as(&w.teacher, "/api/v2/me/conversations/unread-count")
        .await;
    assert_eq!(unread.json()["conversations"], 1);
    let list = w
        .app
        .get_as(&w.teacher, "/api/v2/me/conversations")
        .await
        .json();
    let row = &list["items"][0];
    assert_eq!(row["id"], conversation.as_str());
    assert_eq!(row["unread_count"], 1);
    assert_eq!(row["peer"]["username"], "learner");
    assert_eq!(row["last_message"]["excerpt"], "Hello, teacher");
    assert_eq!(row["allowed_actions"], json!(["send"]));
    // The author's own message is read for them.
    let mine = w
        .app
        .get_as(&w.learner, "/api/v2/me/conversations")
        .await
        .json();
    assert_eq!(mine["items"][0]["unread_count"], 0);

    let page = w
        .app
        .get_as(
            &w.teacher,
            &format!("/api/v2/conversations/{conversation}/messages"),
        )
        .await
        .json();
    assert_eq!(page["items"][0]["allowed_actions"], json!(["report"]));
    assert_eq!(page["last_read_message_id"], Value::Null);
    assert_eq!(page["shared_courses"][0]["id"], w.course.to_string());
    let status = put_as(
        &w.app,
        &w.teacher,
        &format!("/api/v2/conversations/{conversation}/read"),
        &json!({ "last_read_message_id": message["id"] }),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let unread = w
        .app
        .get_as(&w.teacher, "/api/v2/me/conversations/unread-count")
        .await;
    assert_eq!(unread.json()["conversations"], 0);

    let answer = send(&w.app, &w.teacher, w.learner.user_id, "Hi!").await;
    assert_eq!(answer.status, StatusCode::CREATED);
    assert_eq!(answer.json()["conversation_id"], conversation.as_str());
    let peer = w
        .app
        .get_as(
            &w.learner,
            &format!("/api/v2/me/conversations/peers/{}", w.teacher.user_id),
        )
        .await
        .json();
    assert_eq!(peer["conversation_id"], conversation.as_str());
    assert_eq!(peer["allowed_actions"], json!(["send"]));
}

#[ab_testdb::test]
async fn nobody_writes_without_a_course_link(pool: PgPool) {
    let w = world(pool).await;
    let refused = send(&w.app, &w.learner, w.other_learner.user_id, "hi").await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN);
    assert_eq!(code(&refused), "message-recipient-not-allowed");
    assert_eq!(refused.json()["details"]["reason"], "no_relation");

    let stranger = user(&w.app, "stranger", &["instructor"], &[]).await;
    course(&w.pool, stranger.user_id).await;
    let refused = send(&w.app, &w.learner, stranger.user_id, "hi").await;
    assert_eq!(code(&refused), "message-recipient-not-allowed");
    let peer = w
        .app
        .get_as(
            &w.learner,
            &format!("/api/v2/me/conversations/peers/{}", stranger.user_id),
        )
        .await
        .json();
    assert_eq!(peer["allowed_actions"], json!([]));
    assert_eq!(peer["deny_reason"], "no_relation");

    sqlx::query("UPDATE courses SET archived_at = now() WHERE id = $1")
        .bind(w.course)
        .execute(&w.pool)
        .await
        .unwrap();
    let refused = send(&w.app, &w.learner, w.teacher.user_id, "hi").await;
    assert_eq!(code(&refused), "message-recipient-not-allowed");
}

#[ab_testdb::test]
async fn an_observer_writes_to_the_team_but_not_to_learners(pool: PgPool) {
    let w = world(pool).await;
    let observer = user(&w.app, "observer", &["user"], &[]).await;
    sqlx::query(
        "INSERT INTO course_staff (course_id, user_id, authorship, status) VALUES ($1, $2, 'reporter', 'active')",
    )
    .bind(w.course)
    .bind(observer.user_id.0)
    .execute(&w.pool)
    .await
    .unwrap();
    assert_eq!(
        send(&w.app, &observer, w.teacher.user_id, "hi")
            .await
            .status,
        StatusCode::CREATED
    );
    assert_eq!(
        code(&send(&w.app, &observer, w.learner.user_id, "hi").await),
        "message-recipient-not-allowed"
    );
    assert_eq!(
        code(&send(&w.app, &w.learner, observer.user_id, "hi").await),
        "message-recipient-not-allowed"
    );
    let recipients = w
        .app
        .get_as(&w.teacher, "/api/v2/me/message-recipients")
        .await
        .json();
    let roles: Vec<(String, String)> = recipients["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| {
            (
                r["person"]["username"].as_str().unwrap().to_owned(),
                r["role"].as_str().unwrap().to_owned(),
            )
        })
        .collect();
    assert!(
        roles.contains(&("learner".into(), "learner".into())),
        "{roles:?}"
    );
    assert!(
        roles.contains(&("observer".into(), "observer".into())),
        "{roles:?}"
    );
    let found = w
        .app
        .get_as(&w.teacher, "/api/v2/me/message-recipients?q=learner2")
        .await
        .json();
    assert_eq!(found["items"].as_array().unwrap().len(), 1);
}

#[ab_testdb::test]
async fn another_pairs_conversation_is_not_found(pool: PgPool) {
    let w = world(pool).await;
    let message = send(&w.app, &w.learner, w.teacher.user_id, "private")
        .await
        .json();
    let conversation = message["conversation_id"].as_str().unwrap();
    let id = message["id"].as_str().unwrap();
    let read = w
        .app
        .get_as(
            &w.other_learner,
            &format!("/api/v2/conversations/{conversation}/messages"),
        )
        .await;
    assert_eq!(read.status, StatusCode::NOT_FOUND);
    let status = put_as(
        &w.app,
        &w.other_learner,
        &format!("/api/v2/conversations/{conversation}/read"),
        &json!({ "last_read_message_id": id }),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let delete = w
        .app
        .delete_as(&w.other_learner, &format!("/api/v2/messages/{id}"))
        .await;
    assert_eq!(delete.status, StatusCode::NOT_FOUND);
    let report = w
        .app
        .post_as(
            &w.other_learner,
            &format!("/api/v2/messages/{id}/report"),
            &json!({ "reason": "x" }),
        )
        .await;
    assert_eq!(report.status, StatusCode::NOT_FOUND);
}

#[ab_testdb::test]
async fn unenrolment_closes_sending_and_keeps_reading(pool: PgPool) {
    let w = world(pool).await;
    let message = send(&w.app, &w.learner, w.teacher.user_id, "question")
        .await
        .json();
    let conversation = message["conversation_id"].as_str().unwrap().to_owned();
    unenrol(&w.pool, w.course, w.learner.user_id).await;

    let page = w
        .app
        .get_as(
            &w.learner,
            &format!("/api/v2/conversations/{conversation}/messages"),
        )
        .await;
    assert_eq!(page.status, StatusCode::OK);
    assert_eq!(page.json()["items"].as_array().unwrap().len(), 1);
    assert_eq!(page.json()["deny_reason"], "no_relation");
    let refused = send(&w.app, &w.teacher, w.learner.user_id, "answer").await;
    assert_eq!(code(&refused), "message-recipient-not-allowed");

    enrol(&w.pool, w.course, w.learner.user_id).await;
    assert_eq!(
        send(&w.app, &w.teacher, w.learner.user_id, "answer")
            .await
            .status,
        StatusCode::CREATED
    );
}

#[ab_testdb::test]
async fn a_resend_with_the_same_key_stores_one_message(pool: PgPool) {
    let w = world(pool).await;
    let body =
        json!({ "to_user_id": w.teacher.user_id, "body": "once", "client_key": Uuid::now_v7() });
    let first = w
        .app
        .post_as(&w.learner, "/api/v2/messages", &body)
        .await
        .json();
    let again = w.app.post_as(&w.learner, "/api/v2/messages", &body).await;
    assert_eq!(again.status, StatusCode::CREATED);
    assert_eq!(again.json()["id"], first["id"]);
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM messages")
        .fetch_one(&w.pool)
        .await
        .unwrap();
    assert_eq!(n, 1);
}

#[ab_testdb::test]
async fn two_first_messages_towards_each_other_make_one_conversation(pool: PgPool) {
    let w = world(pool).await;
    let (a, b) = tokio::join!(
        send(&w.app, &w.learner, w.teacher.user_id, "a"),
        send(&w.app, &w.teacher, w.learner.user_id, "b"),
    );
    assert_eq!(a.status, StatusCode::CREATED, "{}", a.text());
    assert_eq!(b.status, StatusCode::CREATED, "{}", b.text());
    assert_eq!(a.json()["conversation_id"], b.json()["conversation_id"]);
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM conversations")
        .fetch_one(&w.pool)
        .await
        .unwrap();
    assert_eq!(n, 1);
}

#[ab_testdb::test]
async fn a_message_is_deleted_reported_and_moderated(pool: PgPool) {
    let w = world(pool).await;
    let admin = user(&w.app, "admin", &["admin"], &[ADMIN_USERS]).await;
    let mine = send(&w.app, &w.learner, w.teacher.user_id, "rude words")
        .await
        .json();
    let id = mine["id"].as_str().unwrap().to_owned();
    let conversation = mine["conversation_id"].as_str().unwrap().to_owned();

    // Only the author deletes; the other side reports.
    let not_theirs = w
        .app
        .delete_as(&w.teacher, &format!("/api/v2/messages/{id}"))
        .await;
    assert_eq!(not_theirs.status, StatusCode::FORBIDDEN);
    let own = w
        .app
        .post_as(
            &w.learner,
            &format!("/api/v2/messages/{id}/report"),
            &json!({ "reason": "x" }),
        )
        .await;
    assert_eq!(own.status, StatusCode::FORBIDDEN);
    let reported = w
        .app
        .post_as(
            &w.teacher,
            &format!("/api/v2/messages/{id}/report"),
            &json!({ "reason": "insults" }),
        )
        .await;
    assert_eq!(
        reported.status,
        StatusCode::NO_CONTENT,
        "{}",
        reported.text()
    );
    let twice = w
        .app
        .post_as(
            &w.teacher,
            &format!("/api/v2/messages/{id}/report"),
            &json!({ "reason": "again" }),
        )
        .await;
    assert_eq!(twice.status, StatusCode::CONFLICT);

    // A delete after the report keeps the evidence.
    let deleted = w
        .app
        .delete_as(&w.learner, &format!("/api/v2/messages/{id}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let page = w
        .app
        .get_as(
            &w.teacher,
            &format!("/api/v2/conversations/{conversation}/messages"),
        )
        .await
        .json();
    assert_eq!(page["items"][0]["deleted"], true);
    assert_eq!(page["items"][0]["body"], "");
    assert_eq!(page["items"][0]["allowed_actions"], json!([]));

    assert_eq!(
        w.app
            .get_as(&w.teacher, "/api/v2/admin/message-reports")
            .await
            .status,
        StatusCode::FORBIDDEN
    );
    let reports = w
        .app
        .get_as(&admin, "/api/v2/admin/message-reports?status=open")
        .await
        .json();
    let report = &reports["items"][0];
    assert_eq!(report["body_snapshot"], "rude words");
    assert_eq!(report["reason"], "insults");
    assert_eq!(report["author"]["username"], "learner");
    let report_id = report["id"].as_str().unwrap().to_owned();
    let detail = w
        .app
        .get_as(
            &admin,
            &format!("/api/v2/admin/message-reports/{report_id}"),
        )
        .await
        .json();
    assert_eq!(detail["context"].as_array().unwrap().len(), 1);

    let resolved = w
        .app
        .post_as(
            &admin,
            &format!("/api/v2/admin/message-reports/{report_id}/resolve"),
            &json!({ "resolution": "warned and banned", "ban": true }),
        )
        .await;
    assert_eq!(resolved.status, StatusCode::OK, "{}", resolved.text());
    assert_eq!(resolved.json()["status"], "resolved");
    assert_eq!(resolved.json()["author_banned"], true);
    let banned = send(&w.app, &w.learner, w.teacher.user_id, "more").await;
    assert_eq!(code(&banned), "messages-banned");
    let audited: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM auth_audit_log WHERE event LIKE 'message_report.%'",
    )
    .fetch_one(&w.pool)
    .await
    .unwrap();
    assert_eq!(audited, 2);
    let told: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM notifications WHERE user_id = $1 AND kind = 'message_report_resolved'",
    )
    .bind(w.teacher.user_id.0)
    .fetch_one(&w.pool)
    .await
    .unwrap();
    assert_eq!(told, 1);

    let lifted = w
        .app
        .delete_as(
            &admin,
            &format!("/api/v2/admin/message-bans/{}", w.learner.user_id),
        )
        .await;
    assert_eq!(lifted.status, StatusCode::NO_CONTENT);
    assert_eq!(
        send(&w.app, &w.learner, w.teacher.user_id, "sorry")
            .await
            .status,
        StatusCode::CREATED
    );
}

#[ab_testdb::test]
async fn one_answers_an_administrator_but_never_starts(pool: PgPool) {
    let w = world(pool).await;
    let admin = user(&w.app, "admin", &["admin"], &[ADMIN_USERS]).await;
    assert_eq!(
        code(&send(&w.app, &w.learner, admin.user_id, "hello").await),
        "message-recipient-not-allowed"
    );
    assert_eq!(
        send(&w.app, &admin, w.learner.user_id, "a question from support")
            .await
            .status,
        StatusCode::CREATED
    );
    assert_eq!(
        send(&w.app, &w.learner, admin.user_id, "my answer")
            .await
            .status,
        StatusCode::CREATED
    );
}

#[ab_testdb::test]
async fn the_minute_limit_is_rate_limited(pool: PgPool) {
    let w = world(pool).await;
    for i in 0..20 {
        let sent = send(&w.app, &w.learner, w.teacher.user_id, &format!("m{i}")).await;
        assert_eq!(sent.status, StatusCode::CREATED);
    }
    let limited = send(&w.app, &w.learner, w.teacher.user_id, "one more").await;
    assert_eq!(limited.status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(code(&limited), "rate-limited");
    assert_eq!(limited.json()["details"]["limit"], "minute");
    assert!(limited.headers.contains_key(header::RETRY_AFTER));
}

#[ab_testdb::test]
async fn erasing_a_person_leaves_the_other_side_tombstones(pool: PgPool) {
    let w = world(pool).await;
    let sent = send(&w.app, &w.learner, w.teacher.user_id, "personal")
        .await
        .json();
    let conversation = sent["conversation_id"].as_str().unwrap().to_owned();
    let mut tx = w.pool.begin().await.unwrap();
    ab_db::identity::erase_personal_data(&mut tx, w.learner.user_id)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let page = w
        .app
        .get_as(
            &w.teacher,
            &format!("/api/v2/conversations/{conversation}/messages"),
        )
        .await
        .json();
    assert_eq!(page["items"][0]["deleted"], true);
    assert_eq!(page["items"][0]["body"], "");
}

#[ab_testdb::test]
async fn retention_deletes_a_quiet_conversation(pool: PgPool) {
    let w = world(pool).await;
    send(&w.app, &w.learner, w.teacher.user_id, "old").await;
    let fresh = user(&w.app, "fresh", &["user"], &[]).await;
    enrol(&w.pool, w.course, fresh.user_id).await;
    send(&w.app, &fresh, w.teacher.user_id, "new").await;
    sqlx::query(
        "UPDATE messages m SET created_at = now() - interval '4 years'
         FROM conversation_members cm WHERE cm.conversation_id = m.conversation_id AND cm.user_id = $1",
    )
    .bind(w.learner.user_id.0)
    .execute(&w.pool)
    .await
    .unwrap();
    sqlx::query(
        "UPDATE conversations c SET created_at = now() - interval '4 years'
         FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $1",
    )
    .bind(w.learner.user_id.0)
    .execute(&w.pool)
    .await
    .unwrap();
    let deleted = ab_db::messages::prune_quiet(&w.pool, 1095).await.unwrap();
    assert_eq!(deleted, 1);
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM conversations")
        .fetch_one(&w.pool)
        .await
        .unwrap();
    assert_eq!(left, 1);
}
