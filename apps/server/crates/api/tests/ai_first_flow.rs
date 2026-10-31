//! The AI-first foundation and AI pre-grading end to end (docs/AI-FIRST.md), against the wiremock
//! model:
//!
//! - the concept graph: a teacher creates concepts, prerequisites (a cycle answers 422
//!   `concept-cycle`) and tags; a learner reads only the approved graph and cannot write it;
//! - mastery: a released grade on a tagged activity becomes evidence the learner sees;
//! - material search: the sweep indexes the course, a learner finds it, anonymous callers are refused;
//! - pre-grading: a pending essay is queued, the worker drafts it (quotes not in the answer are
//!   dropped and flagged), the teacher approves it through the ordinary grade save, the draft closes
//!   as `applied` with a calibration row, and the metrics count it; a learner can neither queue nor
//!   approve.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::id::AiRunId;
use ab_testkit::llm::mount_json_reply;
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
        &["assessment:submit:assigned", "assessment:read:assigned"],
    )
    .await
}

async fn put_as(app: &TestApp, who: &MintedSession, uri: &str, body: &Value) -> TestResponse {
    app.send(
        Request::builder()
            .method("PUT")
            .uri(uri)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &who.cookie)
            .body(Body::from(body.to_string()))
            .unwrap(),
    )
    .await
}

fn created(res: &TestResponse) -> Value {
    assert!(res.status.is_success(), "{} {}", res.status, res.text());
    res.json()
}

fn refused(res: &TestResponse) {
    assert!(
        matches!(
            res.status,
            StatusCode::FORBIDDEN | StatusCode::NOT_FOUND | StatusCode::UNAUTHORIZED
        ),
        "expected a refusal, got {} {}",
        res.status,
        res.text()
    );
}

/// A published public course with one published lesson: `(course, chapter, lesson)`.
async fn course(app: &TestApp, teacher: &MintedSession, name: &str) -> (String, String, String) {
    let course = created(
        &app.post_as(
            teacher,
            "/api/v2/courses",
            &json!({ "name": name, "description": "Recursion and the call stack, gently." }),
        )
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
    let chapter_id = chapter["id"].as_str().unwrap().to_owned();
    let lesson = created(
        &app.post_as(
            teacher,
            &format!("/api/v2/chapters/{chapter_id}/activities"),
            &json!({ "name": "Lesson 1", "activity_type": "dynamic", "activity_sub_type": "dynamic_page" }),
        )
        .await,
    );
    let lesson_id = lesson["id"].as_str().unwrap().to_owned();
    created(
        &app.patch_as(
            teacher,
            &format!("/api/v2/activities/{lesson_id}"),
            &json!({ "published": true }),
        )
        .await,
    );
    (course_id, chapter_id, lesson_id)
}

const ANSWER: &str =
    "Рекурсия - это вызов функцией самой себя. Нужен базовый случай, иначе стек переполнится.";

/// A published quiz with one 10-point essay in `chapter`, submitted by `learner` and waiting for a
/// grade: `(activity, item, submission)`.
async fn pending_essay(
    app: &TestApp,
    teacher: &MintedSession,
    learner: &MintedSession,
    chapter_id: &str,
) -> (String, String, String) {
    let quiz = created(
        &app.post_as(
            teacher,
            "/api/v2/assessments",
            &json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Essay" }),
        )
        .await,
    );
    let quiz_id = quiz["id"].as_str().unwrap().to_owned();
    let activity_id = quiz["activity_id"].as_str().unwrap().to_owned();
    let item = created(
        &app.post_as(
            teacher,
            &format!("/api/v2/assessments/{quiz_id}/items"),
            &json!({
                "title": "Recursion", "max_score": 10,
                "body": { "kind": "open_text", "prompt": "What is recursion?",
                          "rubric": "Definition and the base case." }
            }),
        )
        .await,
    );
    let item_id = item["id"].as_str().unwrap().to_owned();
    created(
        &app.post_as(
            teacher,
            &format!("/api/v2/assessments/{quiz_id}/lifecycle"),
            &json!({ "to": "published" }),
        )
        .await,
    );
    let draft = created(
        &app.post_as(
            learner,
            &format!("/api/v2/assessments/{quiz_id}/submissions"),
            &json!({}),
        )
        .await,
    );
    let sub_id = draft["id"].as_str().unwrap().to_owned();
    let submitted = created(
        &app.post_as(
            learner,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &json!({ "answers": { &item_id: { "kind": "open_text", "text": ANSWER } } }),
        )
        .await,
    );
    assert_eq!(submitted["status"], "pending", "{submitted}");
    (activity_id, item_id, sub_id)
}

#[ab_testdb::test]
async fn concept_graph_is_curated_by_teachers_and_read_by_learners(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let (course_id, _, lesson_id) = course(&app, &teacher, "Concepts").await;
    let base = format!("/api/v2/courses/{course_id}");

    let recursion = created(
        &app.post_as(
            &teacher,
            &format!("{base}/concepts"),
            &json!({ "name": "Рекурсия" }),
        )
        .await,
    );
    assert_eq!(recursion["status"], "approved");
    assert_eq!(recursion["origin"], "teacher");
    let stack = created(
        &app.post_as(
            &teacher,
            &format!("{base}/concepts"),
            &json!({ "name": "Call stack" }),
        )
        .await,
    );
    assert_eq!(stack["slug"], "call-stack");
    let (recursion_id, stack_id) = (
        recursion["id"].as_str().unwrap().to_owned(),
        stack["id"].as_str().unwrap().to_owned(),
    );

    let requires = put_as(
        &app,
        &teacher,
        &format!("{base}/concepts/{recursion_id}/prerequisites"),
        &json!({ "requires": [stack_id] }),
    )
    .await;
    assert_eq!(requires.status, StatusCode::OK, "{}", requires.text());
    let cycle = put_as(
        &app,
        &teacher,
        &format!("{base}/concepts/{stack_id}/prerequisites"),
        &json!({ "requires": [recursion_id] }),
    )
    .await;
    assert_eq!(
        cycle.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        cycle.text()
    );
    assert_eq!(cycle.json()["code"], "concept-cycle");

    let tag = created(
        &app.post_as(
            &teacher,
            &format!("{base}/concept-tags"),
            &json!({ "concept_id": recursion_id, "activity_id": lesson_id, "weight": 0.8 }),
        )
        .await,
    );
    assert_eq!(tag["status"], "approved");

    // The learner reads the approved graph and may not write it.
    let graph = app.get_as(&alice, &format!("{base}/concepts")).await;
    let graph = created(&graph);
    assert_eq!(graph["concepts"].as_array().unwrap().len(), 2);
    assert_eq!(graph["tags"].as_array().unwrap().len(), 1);
    assert_eq!(graph["can_edit"], false);
    refused(
        &app.post_as(
            &alice,
            &format!("{base}/concepts"),
            &json!({ "name": "Mine" }),
        )
        .await,
    );
    refused(
        &app.patch_as(
            &alice,
            &format!("{base}/concepts/{recursion_id}"),
            &json!({ "status": "rejected" }),
        )
        .await,
    );

    // A rejected concept leaves the learner's view.
    let rejected = app
        .patch_as(
            &teacher,
            &format!("{base}/concepts/{stack_id}"),
            &json!({ "status": "rejected" }),
        )
        .await;
    assert_eq!(created(&rejected)["status"], "rejected");
    let graph = created(&app.get_as(&alice, &format!("{base}/concepts")).await);
    assert_eq!(graph["concepts"].as_array().unwrap().len(), 1);
    assert_eq!(graph["prerequisites"].as_array().unwrap().len(), 0);
    let teacher_graph = created(&app.get_as(&teacher, &format!("{base}/concepts")).await);
    assert_eq!(teacher_graph["concepts"].as_array().unwrap().len(), 2);
    assert_eq!(teacher_graph["can_edit"], true);

    // Mastery: nothing observed yet; the class view is staff's.
    let mine = created(&app.get_as(&alice, &format!("{base}/mastery/me")).await);
    assert_eq!(mine["concepts"][0]["level"], "not_started");
    refused(&app.get_as(&alice, &format!("{base}/mastery")).await);
    created(&app.get_as(&teacher, &format!("{base}/mastery")).await);

    // A suggestion run is queued for teachers only.
    refused(
        &app.post_as(&alice, &format!("{base}/concepts/suggest"), &json!({}))
            .await,
    );
    let queued = app
        .post_as(&teacher, &format!("{base}/concepts/suggest"), &json!({}))
        .await;
    assert_eq!(queued.status, StatusCode::ACCEPTED, "{}", queued.text());
    assert_eq!(queued.json()["kind"], "concept_mapping");
}

#[ab_testdb::test]
async fn material_search_answers_members_only(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let (course_id, _, _) = course(&app, &teacher, "Search").await;
    let report = app.ai_service().retrieval().sweep().await.unwrap();
    assert!(report.sources >= 1, "{report:?}");

    let hits = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/retrieval/{course_id}/search"),
            &json!({ "query": "call stack" }),
        )
        .await;
    let hits = created(&hits);
    assert!(
        hits.as_array()
            .unwrap()
            .iter()
            .any(|h| h["source_type"] == "course"),
        "{hits}"
    );
    let status = created(
        &app.get_as(
            &teacher,
            &format!("/api/v2/ai/retrieval/{course_id}/status"),
        )
        .await,
    );
    assert!(status["chunks"].as_i64().unwrap() >= 1, "{status}");
    refused(
        &app.get_as(&alice, &format!("/api/v2/ai/retrieval/{course_id}/status"))
            .await,
    );

    refused(
        &app.post_json(
            &format!("/api/v2/ai/retrieval/{course_id}/search"),
            &json!({ "query": "stack" }),
        )
        .await,
    );
}

#[ab_testdb::test]
async fn grade_drafts_are_verified_approved_and_calibrated(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let (course_id, chapter_id, _) = course(&app, &teacher, "Pre-grading").await;
    let (activity_id, item_id, sub_id) = pending_essay(&app, &teacher, &alice, &chapter_id).await;

    // The concept the quiz exercises, so the released grade becomes evidence.
    let concept = created(
        &app.post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/concepts"),
            &json!({ "name": "Recursion" }),
        )
        .await,
    );
    created(
        &app.post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/concept-tags"),
            &json!({ "concept_id": concept["id"], "activity_id": activity_id }),
        )
        .await,
    );

    mount_json_reply(
        &app.llm,
        &json!({
            "parts": [{
                "part_id": item_id,
                "criteria": [{
                    "criterion_id": "overall",
                    "score": 8,
                    "evidence": ["вызов функцией самой себя", "a quote the learner never wrote"],
                    "rationale": "Correct definition, base case named."
                }],
                "feedback": "Хорошее определение; покажите пример."
            }],
            "overall_feedback": "Хорошая работа.",
            "confidence": 0.9,
            "flags": []
        }),
    )
    .await;

    // Learners never queue or approve.
    refused(
        &app.post_as(
            &alice,
            &format!("/api/v2/ai/grading/activities/{activity_id}/drafts/queue"),
            &json!({}),
        )
        .await,
    );

    let queued = app
        .post_as(
            &teacher,
            &format!("/api/v2/ai/grading/activities/{activity_id}/drafts/queue"),
            &json!({}),
        )
        .await;
    assert_eq!(queued.status, StatusCode::ACCEPTED, "{}", queued.text());
    assert_eq!(queued.json()["queued"].as_array().unwrap().len(), 1);
    // A second queueing finds the draft fresh.
    let again = app
        .post_as(
            &teacher,
            &format!("/api/v2/ai/grading/activities/{activity_id}/drafts/queue"),
            &json!({}),
        )
        .await;
    assert_eq!(again.json()["queued"].as_array().unwrap().len(), 0);

    let draft = created(
        &app.get_as(
            &teacher,
            &format!("/api/v2/ai/grading/drafts/subject/{sub_id}"),
        )
        .await,
    );
    assert_eq!(draft["status"], "queued");
    let run_id = draft["run_id"].as_str().unwrap().to_owned();
    app.ai_service()
        .execute_queued(AiRunId(uuid::Uuid::parse_str(&run_id).unwrap()))
        .await
        .unwrap();

    let draft = created(
        &app.get_as(
            &teacher,
            &format!("/api/v2/ai/grading/drafts/subject/{sub_id}"),
        )
        .await,
    );
    assert_eq!(draft["status"], "ready", "{draft}");
    assert_eq!(draft["ai_score"], 80.0);
    let criterion = &draft["proposal"]["parts"][0]["criteria"][0];
    assert_eq!(criterion["ai_score"], 8.0);
    // Only the quote that is really in the answer counts.
    assert_eq!(criterion["evidence"].as_array().unwrap().len(), 1);
    assert_eq!(criterion["unsupported"], false);
    let listed = created(
        &app.get_as(
            &teacher,
            &format!("/api/v2/ai/grading/activities/{activity_id}/drafts"),
        )
        .await,
    );
    assert_eq!(listed.as_array().unwrap().len(), 1);
    refused(
        &app.get_as(
            &alice,
            &format!("/api/v2/ai/grading/drafts/subject/{sub_id}"),
        )
        .await,
    );

    // A learner may not approve in an activity they do not grade: refused before the body.
    let draft_id = draft["id"].as_str().unwrap().to_owned();
    let theirs = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/grading/activities/{activity_id}/drafts/approve"),
            &json!({ "items": [{ "draft_id": draft_id }], "action": "publish" }),
        )
        .await;
    refused(&theirs);

    let approved = created(
        &app.post_as(
            &teacher,
            &format!("/api/v2/ai/grading/activities/{activity_id}/drafts/approve"),
            &json!({ "items": [{ "draft_id": draft_id }], "action": "publish" }),
        )
        .await,
    );
    assert_eq!(approved[0]["result"], "applied", "{approved}");

    let draft = created(
        &app.get_as(
            &teacher,
            &format!("/api/v2/ai/grading/drafts/subject/{sub_id}"),
        )
        .await,
    );
    assert_eq!(draft["status"], "applied");
    assert_eq!(draft["agreement"], "exact");
    assert_eq!(draft["final_score"], 80.0);
    let review = created(
        &app.get_as(&teacher, &format!("/api/v2/submissions/{sub_id}/review"))
            .await,
    );
    assert_eq!(review["status"], "published", "{review}");
    let corrections: i64 =
        sqlx::query_scalar("SELECT count(*) FROM ai_grade_corrections WHERE teacher_score = 8")
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(corrections, 1);

    let metrics = created(
        &app.get_as(&teacher, &format!("/api/v2/ai/grading/{course_id}/metrics"))
            .await,
    );
    assert_eq!(metrics["applied_exact"], 1, "{metrics}");
    assert_eq!(metrics["saved_hours"], 0.1);
    refused(
        &app.get_as(&alice, &format!("/api/v2/ai/grading/{course_id}/metrics"))
            .await,
    );

    // The released grade is owed to the mastery model inside the grade's transaction.
    let owed: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM jobs WHERE kind = 'mastery:ingest' AND payload->>'source_id' = $1",
    )
    .bind(&sub_id)
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert!(owed >= 1);
    let ai = app.ai_service();
    ab_domain::mastery::MasteryService::new(app.pool.clone(), ai.retrieval().clone())
        .ingest("item", uuid::Uuid::parse_str(&sub_id).unwrap())
        .await
        .unwrap();
    let mine = created(
        &app.get_as(&alice, &format!("/api/v2/courses/{course_id}/mastery/me"))
            .await,
    );
    assert_eq!(mine["concepts"][0]["evidence_count"], 1, "{mine}");
    assert!(
        mine["concepts"][0]["p_known"].as_f64().unwrap() > 0.15,
        "{mine}"
    );

    // Settings: the switch is the course teacher's.
    let on = put_as(
        &app,
        &teacher,
        &format!("/api/v2/ai/grading/{course_id}/settings"),
        &json!({ "auto_grade_drafts": true }),
    )
    .await;
    assert_eq!(created(&on)["auto_grade_drafts"], true);
    refused(
        &put_as(
            &app,
            &alice,
            &format!("/api/v2/ai/grading/{course_id}/settings"),
            &json!({ "auto_grade_drafts": false }),
        )
        .await,
    );
}
