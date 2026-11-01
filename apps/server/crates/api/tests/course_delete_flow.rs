//! Deleting a course that holds learner work (owner decision 2026-11-01: allowed, after the teacher
//! acknowledges that the work goes too):
//!
//! - the deletion preview counts the learners, their submissions and the issued certificates; a
//!   teacher's own preview attempts never count; someone who may not delete the course gets no preview;
//! - a delete without `acknowledge_learner_work=true` answers 409 `course-has-learner-work` with the
//!   counts and the course stays; with it the course and the learner's work are gone;
//! - an empty course deletes without the acknowledgement.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp, TestResponse};
use axum::http::StatusCode;
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
            "course:delete:own",
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

fn created(res: &TestResponse) -> Value {
    assert!(res.status.is_success(), "{} {}", res.status, res.text());
    res.json()
}

/// A published course with a published one-question quiz: `(course, quiz)`.
async fn course_with_quiz(app: &TestApp, teacher: &MintedSession, name: &str) -> (String, String) {
    let course = created(
        &app.post_as(teacher, "/api/v2/courses", &json!({ "name": name }))
            .await,
    );
    let course_id = course["id"].as_str().unwrap().to_owned();
    app.publish_course(&course_id).await;
    let chapter = created(
        &app.post_as(
            teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &json!({ "name": "Week 1" }),
        )
        .await,
    );
    let chapter_id = chapter["id"].as_str().unwrap();
    let quiz = created(
        &app.post_as(
            teacher,
            "/api/v2/assessments",
            &json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Check" }),
        )
        .await,
    );
    let quiz_id = quiz["id"].as_str().unwrap().to_owned();
    created(
        &app.post_as(
            teacher,
            &format!("/api/v2/assessments/{quiz_id}/items"),
            &json!({
                "title": "Recursion", "max_score": 10,
                "body": { "kind": "open_text", "prompt": "What is recursion?" }
            }),
        )
        .await,
    );
    created(
        &app.post_as(
            teacher,
            &format!("/api/v2/assessments/{quiz_id}/lifecycle"),
            &json!({ "to": "published" }),
        )
        .await,
    );
    (course_id, quiz_id)
}

async fn preview(app: &TestApp, who: &MintedSession, course_id: &str) -> TestResponse {
    app.get_as(
        who,
        &format!("/api/v2/courses/{course_id}/deletion-preview"),
    )
    .await
}

#[ab_testdb::test]
async fn a_course_with_learner_work_is_deleted_only_when_acknowledged(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let (course_id, quiz_id) = course_with_quiz(&app, &teacher, "Recursion").await;

    // Before any learner work (and with the teacher's own preview attempt) nothing counts.
    created(
        &app.post_as(
            &teacher,
            &format!("/api/v2/assessments/{quiz_id}/submissions"),
            &json!({}),
        )
        .await,
    );
    let empty = created(&preview(&app, &teacher, &course_id).await);
    assert_eq!(
        empty,
        json!({ "learners": 0, "submissions": 0, "file_attempts": 0, "certificates": 0 })
    );

    created(
        &app.post_as(
            &alice,
            &format!("/api/v2/assessments/{quiz_id}/submissions"),
            &json!({}),
        )
        .await,
    );
    let counts = created(&preview(&app, &teacher, &course_id).await);
    assert_eq!(counts["learners"], 1, "{counts}");
    assert_eq!(counts["submissions"], 1, "{counts}");
    let rival = instructor(&app, "rival").await;
    assert_eq!(
        preview(&app, &rival, &course_id).await.status,
        StatusCode::FORBIDDEN
    );

    let refused = app
        .delete_as(&teacher, &format!("/api/v2/courses/{course_id}"))
        .await;
    assert_eq!(refused.status, StatusCode::CONFLICT, "{}", refused.text());
    assert_eq!(refused.json()["code"], "course-has-learner-work");
    assert_eq!(
        refused.json()["details"]["submissions"],
        1,
        "{}",
        refused.text()
    );
    assert_eq!(
        app.get_as(&teacher, &format!("/api/v2/courses/{course_id}"))
            .await
            .status,
        StatusCode::OK
    );

    let deleted = app
        .delete_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}?acknowledge_learner_work=true"),
        )
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT, "{}", deleted.text());
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM submissions WHERE user_id = $1")
        .bind(alice.user_id.0)
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(left, 0);
}

#[ab_testdb::test]
async fn an_empty_course_deletes_without_acknowledgement(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, _) = course_with_quiz(&app, &teacher, "Empty").await;
    let deleted = app
        .delete_as(&teacher, &format!("/api/v2/courses/{course_id}"))
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT, "{}", deleted.text());
}
