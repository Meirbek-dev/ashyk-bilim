//! Personal messages, stage 2 (docs/DIALOGS.md 12).
//!
//! - a message carries up to five `message-attachment` files, with or without
//!   text; the two sides download them, nobody else (404);
//! - only the sender's own finalized attachment uploads are accepted;
//! - deleting the message, erasing its author or retention lets its files go
//!   (the reaper's clock starts);
//! - a course teacher writes one message to many learners: a message in each
//!   conversation, those who are not learners of the course skipped, a resend
//!   with the same key sends nothing twice; a learner cannot;
//! - `intervention: true` records `message_sent` with the message, for a
//!   learner of the course context only.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::id::UserId;
use ab_testkit::{MintedSession, TestApp};
use axum::http::StatusCode;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

struct World {
    app: TestApp,
    pool: PgPool,
    course: Uuid,
    teacher: MintedSession,
    learner: MintedSession,
    other_learner: MintedSession,
}

async fn user(app: &TestApp, name: &str, roles: &[&str]) -> MintedSession {
    let id = app
        .create_user(name, &format!("{name}@example.com"), roles)
        .await;
    // Both roles hold `file:create:own` (the identity seed).
    app.mint_session_for(id, &["file:create:own"]).await
}

async fn enrol(pool: &PgPool, course: Uuid, user: UserId) {
    sqlx::query("INSERT INTO enrolments (course_id, user_id) VALUES ($1, $2)")
        .bind(course)
        .bind(user.0)
        .execute(pool)
        .await
        .unwrap();
}

async fn world(pool: PgPool) -> World {
    let app = TestApp::spawn(pool.clone()).await;
    let teacher = user(&app, "teacher", &["instructor"]).await;
    let learner = user(&app, "learner", &["user"]).await;
    let other_learner = user(&app, "learner2", &["user"]).await;
    let course: Uuid = sqlx::query_scalar(
        "INSERT INTO courses (name, creator_id, public) VALUES ('Course', $1, true) RETURNING id",
    )
    .bind(teacher.user_id.0)
    .fetch_one(&pool)
    .await
    .unwrap();
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

/// The browser's part of an upload: create, PUT to storage, finalize.
async fn upload(app: &TestApp, session: &MintedSession, purpose: &str, payload: &[u8]) -> String {
    let mime = "application/pdf";
    let created = app
        .post_as(
            session,
            "/api/v2/uploads",
            &json!({ "purpose": purpose, "mime": mime, "size_bytes": payload.len() }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let put_url = created.json()["put_url"].as_str().unwrap().to_owned();
    let put = reqwest::Client::new()
        .put(&put_url)
        .header("content-type", mime)
        .header("if-none-match", "*")
        .body(payload.to_vec())
        .send()
        .await
        .unwrap();
    assert!(put.status().is_success(), "presigned PUT: {}", put.status());
    let finalized = app
        .post_as(
            session,
            &format!("/api/v2/uploads/{id}/finalize"),
            &json!({}),
        )
        .await;
    assert_eq!(finalized.status, StatusCode::OK, "{}", finalized.text());
    id
}

async fn send(app: &TestApp, from: &MintedSession, body: &Value) -> ab_testkit::TestResponse {
    app.post_as(from, "/api/v2/messages", body).await
}

/// Whether the reaper's clock runs on the upload.
async fn clocked(pool: &PgPool, upload: &str) -> bool {
    sqlx::query_scalar("SELECT expires_at IS NOT NULL FROM uploads WHERE id = $1")
        .bind(Uuid::parse_str(upload).unwrap())
        .fetch_one(pool)
        .await
        .unwrap()
}

#[ab_testdb::test]
async fn a_message_carries_files_only_its_two_sides_download(pool: PgPool) {
    let w = world(pool).await;
    let file = upload(&w.app, &w.learner, "message-attachment", b"%PDF-1.4 report").await;
    assert!(clocked(&w.pool, &file).await, "unclaimed: on the clock");
    let sent = send(
        &w.app,
        &w.learner,
        &json!({ "to_user_id": w.teacher.user_id, "body": "  ", "client_key": Uuid::now_v7(),
                 "attachments": [{ "upload_id": file, "name": "report.pdf" }] }),
    )
    .await;
    assert_eq!(sent.status, StatusCode::CREATED, "{}", sent.text());
    let message = sent.json();
    assert_eq!(message["body"], "");
    assert_eq!(message["attachments"][0]["name"], "report.pdf");
    assert_eq!(message["attachments"][0]["size_bytes"], 15);
    assert!(!clocked(&w.pool, &file).await, "claimed: off the clock");
    let id = message["id"].as_str().unwrap();
    let conversation = message["conversation_id"].as_str().unwrap();

    let list = w
        .app
        .get_as(&w.teacher, "/api/v2/me/conversations")
        .await
        .json();
    assert_eq!(list["items"][0]["last_message"]["files"], 1);
    let feed = w
        .app
        .get_as(
            &w.teacher,
            &format!("/api/v2/conversations/{conversation}/messages"),
        )
        .await
        .json();
    assert_eq!(
        feed["items"][0]["attachments"][0]["upload_id"],
        file.as_str()
    );

    let url = format!("/api/v2/messages/{id}/attachments/{file}/url");
    for side in [&w.teacher, &w.learner] {
        let got = w.app.get_as(side, &url).await;
        assert_eq!(got.status, StatusCode::OK, "{}", got.text());
        assert_eq!(got.json()["name"], "report.pdf");
        assert!(got.json()["path"].as_str().unwrap().starts_with('/'));
        let bytes = reqwest::get(got.json()["url"].as_str().unwrap())
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();
        assert_eq!(&bytes[..], b"%PDF-1.4 report");
    }
    assert_eq!(
        w.app.get_as(&w.other_learner, &url).await.status,
        StatusCode::NOT_FOUND
    );

    let deleted = w
        .app
        .delete_as(&w.learner, &format!("/api/v2/messages/{id}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT, "{}", deleted.text());
    assert_eq!(
        w.app.get_as(&w.teacher, &url).await.status,
        StatusCode::NOT_FOUND
    );
    assert!(clocked(&w.pool, &file).await, "deleted with its message");
}

#[ab_testdb::test]
async fn only_ones_own_attachment_uploads_are_accepted(pool: PgPool) {
    let w = world(pool).await;
    let theirs = upload(&w.app, &w.other_learner, "message-attachment", b"x").await;
    let submission = upload(&w.app, &w.learner, "file-submission", b"x").await;
    let to = w.teacher.user_id;
    let with = |upload: &str| {
        json!({ "to_user_id": to, "body": "hi", "client_key": Uuid::now_v7(),
                "attachments": [{ "upload_id": upload, "name": "a.pdf" }] })
    };
    assert_eq!(
        send(&w.app, &w.learner, &with(&theirs)).await.status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        send(&w.app, &w.learner, &with(&submission)).await.status,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let empty = json!({ "to_user_id": to, "body": " ", "client_key": Uuid::now_v7() });
    assert_eq!(
        send(&w.app, &w.learner, &empty).await.status,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let six: Vec<Value> = (0..6)
        .map(|_| json!({ "upload_id": Uuid::now_v7(), "name": "a" }))
        .collect();
    let many =
        json!({ "to_user_id": to, "body": "hi", "client_key": Uuid::now_v7(), "attachments": six });
    assert_eq!(
        send(&w.app, &w.learner, &many).await.status,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    // Nothing was sent by the refused attempts.
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM messages")
        .fetch_one(&w.pool)
        .await
        .unwrap();
    assert_eq!(n, 0);
}

#[ab_testdb::test]
async fn erasure_and_retention_let_the_files_go(pool: PgPool) {
    let w = world(pool).await;
    let mut files = Vec::new();
    for from in [&w.learner, &w.other_learner] {
        let file = upload(&w.app, from, "message-attachment", b"%PDF").await;
        let sent = send(
            &w.app,
            from,
            &json!({ "to_user_id": w.teacher.user_id, "body": "see", "client_key": Uuid::now_v7(),
                     "attachments": [{ "upload_id": file, "name": "a.pdf" }] }),
        )
        .await;
        assert_eq!(sent.status, StatusCode::CREATED, "{}", sent.text());
        files.push(file);
    }
    let mut tx = w.pool.begin().await.unwrap();
    ab_db::identity::erase_personal_data(&mut tx, w.learner.user_id)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    assert!(clocked(&w.pool, &files[0]).await, "erased with the text");
    assert!(!clocked(&w.pool, &files[1]).await);

    sqlx::query("UPDATE messages SET created_at = now() - interval '4 years'")
        .execute(&w.pool)
        .await
        .unwrap();
    sqlx::query("UPDATE conversations SET created_at = now() - interval '4 years'")
        .execute(&w.pool)
        .await
        .unwrap();
    assert_eq!(
        ab_db::messages::prune_quiet(&w.pool, 1095).await.unwrap(),
        2
    );
    assert!(
        clocked(&w.pool, &files[1]).await,
        "gone with the conversation"
    );
}

async fn interventions(pool: &PgPool) -> Vec<(Uuid, String, Value)> {
    sqlx::query_as(
        "SELECT user_id, intervention_type, payload FROM teacher_interventions ORDER BY user_id",
    )
    .fetch_all(pool)
    .await
    .unwrap()
}

#[ab_testdb::test]
async fn a_teacher_writes_one_message_to_many_learners(pool: PgPool) {
    let w = world(pool).await;
    let outsider = user(&w.app, "outsider", &["user"]).await;
    let file = upload(&w.app, &w.teacher, "message-attachment", b"%PDF").await;
    let key = Uuid::now_v7();
    let request = json!({
        "course_id": w.course,
        "to_user_ids": [w.learner.user_id, w.other_learner.user_id, outsider.user_id],
        "body": "Deadline moved",
        "client_key": key,
        "attachments": [{ "upload_id": file, "name": "plan.pdf" }],
        "intervention": true,
    });
    let first = w
        .app
        .post_as(&w.teacher, "/api/v2/messages/bulk", &request)
        .await;
    assert_eq!(first.status, StatusCode::CREATED, "{}", first.text());
    let result = first.json();
    assert_eq!(result["sent"].as_array().unwrap().len(), 2);
    assert_eq!(result["skipped"][0]["user_id"], json!(outsider.user_id));
    assert_eq!(result["skipped"][0]["reason"], "no_relation");

    // Each learner has the message, with the file, in their own conversation.
    for sent in result["sent"].as_array().unwrap() {
        let reader = if sent["user_id"] == json!(w.learner.user_id) {
            &w.learner
        } else {
            &w.other_learner
        };
        let conversation = sent["conversation_id"].as_str().unwrap();
        let feed = w
            .app
            .get_as(
                reader,
                &format!("/api/v2/conversations/{conversation}/messages"),
            )
            .await
            .json();
        assert_eq!(feed["items"][0]["body"], "Deadline moved");
        assert_eq!(feed["items"][0]["attachments"][0]["name"], "plan.pdf");
        assert_eq!(feed["items"][0]["context"]["course_id"], json!(w.course));
    }
    let recorded = interventions(&w.pool).await;
    assert_eq!(recorded.len(), 2);
    assert!(recorded.iter().all(|(_, kind, _)| kind == "message_sent"));
    let ids: Vec<&Value> = result["sent"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| &s["message_id"])
        .collect();
    assert!(
        recorded
            .iter()
            .all(|(_, _, p)| ids.contains(&&p["message_id"]))
    );

    // A resend sends nothing twice.
    let again = w
        .app
        .post_as(&w.teacher, "/api/v2/messages/bulk", &request)
        .await;
    assert_eq!(again.status, StatusCode::CREATED, "{}", again.text());
    assert_eq!(again.json()["sent"], result["sent"]);
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM messages")
        .fetch_one(&w.pool)
        .await
        .unwrap();
    assert_eq!(n, 2);
    assert_eq!(interventions(&w.pool).await.len(), 2);

    // A learner writes to nobody this way.
    let by_learner = w
        .app
        .post_as(
            &w.learner,
            "/api/v2/messages/bulk",
            &json!({ "course_id": w.course, "to_user_ids": [w.other_learner.user_id],
                     "body": "hi", "client_key": Uuid::now_v7() }),
        )
        .await;
    assert_eq!(by_learner.status, StatusCode::FORBIDDEN);
}

#[ab_testdb::test]
async fn a_send_from_analytics_records_the_intervention(pool: PgPool) {
    let w = world(pool).await;
    let sent = send(
        &w.app,
        &w.teacher,
        &json!({ "to_user_id": w.learner.user_id, "body": "How are you doing?",
                 "client_key": Uuid::now_v7(), "course_id": w.course, "intervention": true }),
    )
    .await;
    assert_eq!(sent.status, StatusCode::CREATED, "{}", sent.text());
    let recorded = interventions(&w.pool).await;
    assert_eq!(recorded.len(), 1);
    assert_eq!(recorded[0].0, w.learner.user_id.0);
    assert_eq!(recorded[0].2["message_id"], sent.json()["id"]);

    // Without the course context, or by a learner: refused, nothing sent.
    let refused = [
        (
            &w.teacher,
            json!({ "to_user_id": w.other_learner.user_id, "body": "x",
                             "client_key": Uuid::now_v7(), "intervention": true }),
        ),
        (
            &w.learner,
            json!({ "to_user_id": w.teacher.user_id, "body": "x",
                             "client_key": Uuid::now_v7(), "course_id": w.course, "intervention": true }),
        ),
    ];
    for (from, body) in refused {
        let got = send(&w.app, from, &body).await;
        assert_eq!(
            got.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{}",
            got.text()
        );
    }
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM messages")
        .fetch_one(&w.pool)
        .await
        .unwrap();
    assert_eq!(n, 1);
}
