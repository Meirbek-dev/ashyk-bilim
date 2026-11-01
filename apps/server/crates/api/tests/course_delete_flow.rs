//! Deleting a course that holds learner work (owner decision 2026-11-01: allowed, after the teacher
//! acknowledges that the work goes too):
//!
//! - the deletion preview counts the learners, their submissions and the issued certificates; a
//!   teacher's own preview attempts never count; someone who may not delete the course gets no preview;
//! - a delete without `acknowledge_learner_work=true` answers 409 `course-has-learner-work` with the
//!   counts and the course stays; with it the course is gone from reads while the learner's work
//!   waits for the purge;
//! - an empty course deletes without the acknowledgement.
//!
//! The delete is soft (schema review 2 item 22): the course is archived and stamped deleted, and
//! leaves every learner and teacher read at once (catalogue, search, profile, collections, trail,
//! agenda, work queue, direct reads of the course and its tasks, the teacher's workspace, archive
//! view and analytics). The retention purge hard-deletes it after the grace period, learner work and
//! grades included; within it `ashyq admin restore-course` brings it back archived.
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
    assert_eq!(
        app.get_as(&teacher, &format!("/api/v2/courses/{course_id}"))
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    let submissions = || async {
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM submissions WHERE user_id = $1")
            .bind(alice.user_id.0)
            .fetch_one(&app.pool)
            .await
            .unwrap()
    };
    assert_eq!(submissions().await, 1, "the work waits for the purge");

    // Inside the grace period the purge leaves it; after it, the course and the work go.
    assert_eq!(purge(&app).await, 0);
    sqlx::query("UPDATE courses SET deleted_at = now() - interval '31 days' WHERE id = $1::uuid")
        .bind(&course_id)
        .execute(&app.pool)
        .await
        .unwrap();
    assert_eq!(purge(&app).await, 1);
    assert_eq!(submissions().await, 0);
    let course: i64 = sqlx::query_scalar("SELECT count(*) FROM courses WHERE id = $1::uuid")
        .bind(&course_id)
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(course, 0);
}

/// The retention purge with the default 30-day grace period.
async fn purge(app: &TestApp) -> u64 {
    ab_db::catalog::purge_deleted_courses(&app.pool, 30, 60.0)
        .await
        .unwrap()
}

fn names(items: &Value) -> Vec<String> {
    items
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap().to_owned())
        .collect()
}

#[ab_testdb::test]
async fn a_deleted_course_leaves_every_read_until_restored(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher_id = app
        .create_user("author", "author@example.com", &["instructor"])
        .await;
    let teacher = app
        .mint_session_for(
            teacher_id,
            &[
                "course:create:platform",
                "course:read:all",
                "course:update:own",
                "course:delete:own",
                "assessment:*:own",
                "collection:create:platform",
                "collection:update:own",
                "collection:read:all",
                "analytics:read:assigned",
            ],
        )
        .await;
    let alice_id = app
        .create_user("alice", "alice@example.com", &["user"])
        .await;
    let alice = app
        .mint_session_for(
            alice_id,
            &[
                "assessment:submit:assigned",
                "assessment:read:assigned",
                "trail:read:all",
                "trail:submit:assigned",
            ],
        )
        .await;
    let (course_id, quiz_id) = course_with_quiz(&app, &teacher, "Rustacean gone").await;
    let (active, _) = course_with_quiz(&app, &teacher, "Rustacean kept").await;
    let collection = created(
        &app.post_as(
            &teacher,
            "/api/v2/collections",
            &json!({ "name": "Pack", "public": true, "courses": [course_id, active] }),
        )
        .await,
    );
    let collection_id = collection["id"].as_str().unwrap().to_owned();
    let enrolled = app
        .post_as(
            &alice,
            &format!("/api/v2/trail/courses/{course_id}"),
            &json!({}),
        )
        .await;
    assert_eq!(enrolled.status, StatusCode::OK, "{}", enrolled.text());
    created(
        &app.post_as(
            &alice,
            &format!("/api/v2/assessments/{quiz_id}/submissions"),
            &json!({}),
        )
        .await,
    );
    let both = ["Rustacean kept", "Rustacean gone"];
    let kept = ["Rustacean kept"];
    let course_path = format!("/api/v2/courses/{course_id}");
    let quiz_path = format!("/api/v2/assessments/{quiz_id}");
    let in_trail = |trail: &Value| {
        trail["runs"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["course_id"] == course_id.as_str())
    };
    let in_agenda = |agenda: &Value| {
        agenda["continue_learning"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["course_id"] == course_id.as_str())
    };
    let analytics = |res: &TestResponse| {
        res.json()["items"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|r| r["course_id"] == course_id.as_str())
            .count()
    };

    assert_eq!(
        names(&app.get_as(&alice, "/api/v2/courses").await.json()["items"]),
        both
    );
    assert!(in_trail(&app.get_as(&alice, "/api/v2/trail").await.json()));
    assert!(in_agenda(
        &app.get_as(&alice, "/api/v2/me/agenda").await.json()
    ));
    assert_eq!(
        app.get_as(&alice, "/api/v2/work").await.json()["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        analytics(
            &app.get_as(&teacher, "/api/v2/analytics/teacher/courses")
                .await
        ),
        1
    );

    let deleted = app
        .delete_as(
            &teacher,
            &format!("{course_path}?acknowledge_learner_work=true"),
        )
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT, "{}", deleted.text());

    // Learner reads.
    for path in ["/api/v2/courses", "/api/v2/users/author/courses"] {
        let res = app.get_as(&alice, path).await;
        assert_eq!(names(&res.json()["items"]), kept, "{path}");
    }
    let searched = app.get_as(&alice, "/api/v2/search?q=rustacean").await;
    assert_eq!(names(&searched.json()["courses"]), kept);
    let contents = app
        .get_as(&alice, &format!("/api/v2/collections/{collection_id}"))
        .await;
    assert_eq!(names(&contents.json()["courses"]), kept);
    for path in [&course_path, &quiz_path] {
        assert_eq!(
            app.get_as(&alice, path).await.status,
            StatusCode::NOT_FOUND,
            "{path}"
        );
    }
    assert!(!in_trail(&app.get_as(&alice, "/api/v2/trail").await.json()));
    assert!(!in_agenda(
        &app.get_as(&alice, "/api/v2/me/agenda").await.json()
    ));
    let work = app.get_as(&alice, "/api/v2/work").await;
    assert!(
        work.json()["items"].as_array().unwrap().is_empty(),
        "{}",
        work.text()
    );
    let resubmit = app
        .post_as(&alice, &format!("{quiz_path}/submissions"), &json!({}))
        .await;
    assert_eq!(
        resubmit.status,
        StatusCode::NOT_FOUND,
        "{}",
        resubmit.text()
    );

    // Teacher reads: the workspace, its archive view, the collection, the course, analytics.
    for path in [
        "/api/v2/courses?mine=true",
        "/api/v2/courses?mine=true&preset=archived",
    ] {
        let res = app.get_as(&teacher, path).await;
        assert_eq!(res.status, StatusCode::OK, "{path}: {}", res.text());
        let listed = names(&res.json()["items"]);
        assert!(
            !listed.contains(&"Rustacean gone".to_owned()),
            "{path}: {listed:?}"
        );
    }
    let mine = app.get_as(&teacher, "/api/v2/courses?mine=true").await;
    assert_eq!(mine.json()["summary"]["archived"], 0);
    let owner_view = app
        .get_as(&teacher, &format!("/api/v2/collections/{collection_id}"))
        .await;
    assert_eq!(names(&owner_view.json()["courses"]), kept);
    for path in [&course_path, &quiz_path] {
        assert_eq!(
            app.get_as(&teacher, path).await.status,
            StatusCode::NOT_FOUND,
            "{path}"
        );
    }
    assert_eq!(
        analytics(
            &app.get_as(&teacher, "/api/v2/analytics/teacher/courses")
                .await
        ),
        0
    );
    let again = app.delete_as(&teacher, &course_path).await;
    assert_eq!(again.status, StatusCode::NOT_FOUND, "{}", again.text());

    // Restored within the grace period: back, archived, with the learner's run.
    let id: uuid::Uuid = course_id.parse().unwrap();
    assert!(
        ab_db::catalog::restore_deleted_course(&app.pool, ab_core::id::CourseId(id))
            .await
            .unwrap()
    );
    let back = app.get_as(&teacher, &course_path).await;
    assert_eq!(back.status, StatusCode::OK, "{}", back.text());
    assert!(back.json()["archived_at_unix"].is_i64());
    assert!(in_trail(&app.get_as(&alice, "/api/v2/trail").await.json()));
    assert_eq!(purge(&app).await, 0);
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
