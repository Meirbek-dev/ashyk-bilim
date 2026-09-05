//! Unified inbox end to end (port contract for `services/work_queue.py`):
//! - auth required; an empty queue is `items: [], total: 0`;
//! - learner: draft → `in_progress` (high), past due → `overdue` (critical),
//!   submit → `waiting_for_grade` (low), released/decided → `feedback_released`;
//! - teacher: manual-grade submission → `needs_grading` (high) with the
//!   review href pointing at the submission; a saved file-attempt grade →
//!   `awaiting_release` with the attempt id; grading clears the item;
//! - `role=teacher` for someone without courses is empty;
//! - `total` counts the whole queue, `limit=1` pages through it once via
//!   `next_cursor`; a garbage cursor and an out-of-range limit are 422s on
//!   `cursor` / `limit`.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

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
        &[
            "assessment:submit:assigned",
            "assessment:read:assigned",
            "file:create:own",
        ],
    )
    .await
}

fn now_unix() -> i64 {
    i64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    )
    .unwrap()
}

/// Public course + chapter; returns (course_id, chapter_id).
async fn public_course(app: &TestApp, teacher: &MintedSession) -> (String, String) {
    let course = app
        .post_as(
            teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Work 101" }),
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
    (course_id, chapter.json()["id"].as_str().unwrap().to_owned())
}

/// A published quiz with one choice item and one essay, batch release;
/// pass `grading_mode: manual` for the teacher queue to pick it up. Returns
/// (assessment_id, activity_id, choice_item, essay_item).
async fn quiz_with_essay(
    app: &TestApp,
    teacher: &MintedSession,
    chapter_id: &str,
    title: &str,
    policy_patch: serde_json::Value,
) -> (String, String, String, String) {
    let created = app
        .post_as(
            teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": title }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let activity_id = created.json()["activity_id"].as_str().unwrap().to_owned();
    let choice = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &serde_json::json!({
                "title": "Q1", "max_score": 10,
                "body": { "kind": "choice", "prompt": "Q1",
                          "options": [{ "id": "a", "text": "yes", "is_correct": true },
                                      { "id": "b", "text": "no", "is_correct": false }] }
            }),
        )
        .await;
    let choice_id = choice.json()["id"].as_str().unwrap().to_owned();
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
    let mut policy = created.json()["policy"].clone();
    policy["grade_release_mode"] = serde_json::json!("batch");
    for (key, value) in policy_patch.as_object().unwrap() {
        policy[key] = value.clone();
    }
    let policy_res = app
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
    assert_eq!(policy_res.status, StatusCode::OK, "{}", policy_res.text());
    let published = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    (id, activity_id, choice_id, essay_id)
}

async fn start_draft(app: &TestApp, learner: &MintedSession, assessment_id: &str) -> String {
    let draft = app
        .post_as(
            learner,
            &format!("/api/v2/assessments/{assessment_id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    draft.json()["id"].as_str().unwrap().to_owned()
}

async fn submit(
    app: &TestApp,
    learner: &MintedSession,
    sub_id: &str,
    choice_id: &str,
    essay_id: &str,
) {
    let submitted = app
        .post_as(
            learner,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": {
                choice_id: { "kind": "choice", "selected": ["a"] },
                essay_id: { "kind": "open_text", "text": "Because." },
            } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    assert_eq!(submitted.json()["status"], "pending");
}

fn with_if_match(
    session: &MintedSession,
    method: &str,
    uri: String,
    if_match: &str,
    body: &serde_json::Value,
) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, &session.cookie)
        .header(header::IF_MATCH, if_match)
        .body(Body::from(body.to_string()))
        .unwrap()
}

/// A published file-submission activity; returns (file_submission_id, activity_id).
async fn published_file_submission(
    app: &TestApp,
    teacher: &MintedSession,
    chapter_id: &str,
) -> (String, String) {
    let created = app
        .post_as(
            teacher,
            "/api/v2/file-submissions",
            &serde_json::json!({
                "chapter_id": chapter_id, "title": "Essay PDF",
                "instructions": "Upload your essay as a PDF.",
            }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let activity_id = created.json()["activity_id"].as_str().unwrap().to_owned();
    let published = app
        .post_as(
            teacher,
            &format!("/api/v2/file-submissions/{id}/publish"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    (id, activity_id)
}

/// The browser's part of an upload: create, PUT to storage, finalize.
async fn finalized_upload(app: &TestApp, session: &MintedSession) -> String {
    let payload = b"%PDF essay";
    let created = app
        .post_as(
            session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "file-submission", "mime": "application/pdf",
                                  "size_bytes": payload.len() }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let put_url = created.json()["put_url"].as_str().unwrap().to_owned();
    let put = reqwest::Client::new()
        .put(&put_url)
        .body(payload.to_vec())
        .send()
        .await
        .unwrap();
    assert!(put.status().is_success(), "presigned PUT: {}", put.status());
    let finalized = app
        .post_as(
            session,
            &format!("/api/v2/uploads/{id}/finalize"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(finalized.status, StatusCode::OK, "{}", finalized.text());
    id
}

/// Open a draft, attach one PDF and submit it; returns the attempt id.
async fn submit_file_attempt(app: &TestApp, learner: &MintedSession, fs_id: &str) -> String {
    let upload = finalized_upload(app, learner).await;
    let draft = app
        .post_as(
            learner,
            &format!("/api/v2/file-submissions/{fs_id}/draft"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let attempt_id = draft.json()["id"].as_str().unwrap().to_owned();
    let saved = app
        .patch_as(
            learner,
            &format!("/api/v2/file-submissions/{fs_id}/draft"),
            &serde_json::json!({ "files": [{ "upload_id": upload, "display_name": "essay.pdf" }] }),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    let version = saved.json()["version"].as_i64().unwrap().to_string();
    let submitted = app
        .send(with_if_match(
            learner,
            "POST",
            format!("/api/v2/file-submissions/{fs_id}/submit"),
            &version,
            &serde_json::json!({}),
        ))
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    assert_eq!(submitted.json()["status"], "submitted");
    attempt_id
}

async fn queue(app: &TestApp, session: &MintedSession, query: &str) -> serde_json::Value {
    let res = app.get_as(session, &format!("/api/v2/work{query}")).await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.text());
    res.json()
}

fn items(queue: &serde_json::Value) -> &Vec<serde_json::Value> {
    queue["items"].as_array().unwrap()
}

fn item_for<'a>(queue: &'a serde_json::Value, activity_id: &str) -> Option<&'a serde_json::Value> {
    items(queue)
        .iter()
        .find(|i| i["activity_id"] == activity_id)
}

#[sqlx::test(migrations = "../../migrations")]
async fn learner_and_teacher_queues_follow_the_grading_lifecycle(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher).await;
    let (quiz_id, quiz_activity, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        "Quiz",
        serde_json::json!({ "grading_mode": "manual" }),
    )
    .await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;

    // Auth gate + empty queues.
    assert_eq!(
        app.get("/api/v2/work").await.status,
        StatusCode::UNAUTHORIZED
    );
    let empty = queue(&app, &alice, "").await;
    assert!(items(&empty).is_empty());
    assert_eq!(empty["total"], 0);
    assert!(empty["next_cursor"].is_null());
    let no_courses = queue(&app, &teacher, "?role=teacher").await;
    assert_eq!(no_courses["total"], 0);

    // A draft is open work.
    let alice_sub = start_draft(&app, &alice, &quiz_id).await;
    let started = queue(&app, &alice, "").await;
    assert_eq!(started["total"], 1);
    let open = &items(&started)[0];
    assert_eq!(open["kind"], "in_progress");
    assert_eq!(open["status"], "in_progress");
    assert_eq!(open["priority"], "high");
    assert_eq!(open["role"], "learner");
    assert!(
        open["id"]
            .as_str()
            .unwrap()
            .starts_with("learner-progress-")
    );
    assert_eq!(open["title"], "Continue Quiz");
    assert_eq!(open["course_title"], "Work 101");
    assert_eq!(open["activity_id"], quiz_activity.as_str());
    assert_eq!(
        open["href"],
        format!("/course/{course_id}/activity/{quiz_activity}")
    );
    assert_eq!(open["primary_action"], "Continue");
    assert_eq!(open["allowed_actions"], serde_json::json!(["continue"]));
    assert!(open["created_at_unix"].is_i64());
    assert!(open["due_at_unix"].is_null());
    // Nothing for the teacher yet.
    assert_eq!(queue(&app, &teacher, "?role=teacher").await["total"], 0);

    // Submitting hands the work to the teacher.
    submit(&app, &alice, &alice_sub, &choice_id, &essay_id).await;
    let waiting = queue(&app, &alice, "").await;
    let w = &items(&waiting)[0];
    assert_eq!(w["kind"], "waiting_for_grade");
    assert_eq!(w["status"], "needs_grading");
    assert_eq!(w["priority"], "low");
    assert_eq!(w["allowed_actions"], serde_json::json!(["view_receipt"]));
    let grading = queue(&app, &teacher, "?role=teacher").await;
    assert_eq!(grading["total"], 1);
    let g = &items(&grading)[0];
    assert_eq!(g["role"], "teacher");
    assert_eq!(g["kind"], "needs_grading");
    assert_eq!(g["status"], "needs_grading");
    assert_eq!(g["priority"], "high");
    assert!(g["id"].as_str().unwrap().starts_with("teacher-grade-"));
    assert_eq!(g["title"], "Grade Quiz");
    assert_eq!(g["description"], "alice submitted work in Work 101.");
    assert_eq!(
        g["href"],
        format!("/dash/courses/{course_id}/activity/{quiz_activity}/review?submission={alice_sub}")
    );
    assert_eq!(
        g["allowed_actions"],
        serde_json::json!(["grade", "return", "publish"])
    );
    // Learners never see teacher work; role=teacher for them is empty.
    assert_eq!(queue(&app, &alice, "?role=teacher").await["total"], 0);

    // Two submissions: total counts both, limit=1 pages through once.
    let bob_sub = start_draft(&app, &bob, &quiz_id).await;
    submit(&app, &bob, &bob_sub, &choice_id, &essay_id).await;
    let first = queue(&app, &teacher, "?role=teacher&limit=1").await;
    assert_eq!(first["total"], 2);
    assert_eq!(items(&first).len(), 1);
    let cursor = first["next_cursor"].as_str().unwrap().to_owned();
    let second = queue(
        &app,
        &teacher,
        &format!("?role=teacher&limit=1&cursor={cursor}"),
    )
    .await;
    assert_eq!(second["total"], 2, "total ignores the cursor");
    assert_eq!(items(&second).len(), 1);
    assert!(second["next_cursor"].is_null());
    assert_ne!(items(&first)[0]["id"], items(&second)[0]["id"]);
    let both = queue(&app, &teacher, "?role=teacher").await;
    assert_eq!(items(&both).len(), 2);
    assert_eq!(
        items(&both)[0]["id"],
        items(&first)[0]["id"],
        "stable order"
    );

    // Bad paging input is a 422 on the offending field.
    let garbage = app
        .get_as(&teacher, "/api/v2/work?role=teacher&cursor=not-a-cursor")
        .await;
    assert_eq!(
        garbage.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        garbage.text()
    );
    assert_eq!(garbage.json()["code"], "validation-failed");
    assert_eq!(garbage.json()["field_errors"][0]["field"], "cursor");
    let too_big = app.get_as(&alice, "/api/v2/work?limit=101").await;
    assert_eq!(too_big.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(too_big.json()["field_errors"][0]["field"], "limit");

    // Saving a grade clears the grading item; a scored quiz decision is
    // `passed` in the projection (legacy: `feedback_released`, normal).
    let saved = app
        .send(with_if_match(
            &teacher,
            "PATCH",
            format!("/api/v2/submissions/{alice_sub}/grade"),
            "1",
            &serde_json::json!({ "action": "save",
                "item_grades": [{ "item_id": &choice_id, "score": 10 },
                                { "item_id": &essay_id, "score": 8 }] }),
        ))
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    assert_eq!(saved.json()["status"], "graded");
    let after_save = queue(&app, &teacher, "?role=teacher").await;
    assert_eq!(after_save["total"], 1);
    assert_eq!(
        items(&after_save)[0]["description"],
        "bob submitted work in Work 101."
    );
    let decided = queue(&app, &alice, "").await;
    let d = item_for(&decided, &quiz_activity).unwrap();
    assert_eq!(d["kind"], "feedback_released");
    assert_eq!(d["status"], "published");
    assert_eq!(d["priority"], "normal");
    assert_eq!(d["allowed_actions"], serde_json::json!(["view_feedback"]));
    assert!(d["id"].as_str().unwrap().starts_with("learner-feedback-"));

    // A file attempt: submitted → needs_grading (attempt id in the href),
    // saved grade → awaiting_release, published → feedback_released.
    let (fs_id, fs_activity) = published_file_submission(&app, &teacher, &chapter_id).await;
    let attempt_id = submit_file_attempt(&app, &alice, &fs_id).await;
    let with_file = queue(&app, &teacher, "?role=teacher").await;
    assert_eq!(with_file["total"], 2);
    let f = item_for(&with_file, &fs_activity).unwrap();
    assert_eq!(f["kind"], "needs_grading");
    assert_eq!(
        f["href"],
        format!("/dash/courses/{course_id}/activity/{fs_activity}/review?submission={attempt_id}")
    );
    assert_eq!(
        item_for(&queue(&app, &alice, "").await, &fs_activity).unwrap()["kind"],
        "waiting_for_grade"
    );
    let saved_file = app
        .send(with_if_match(
            &teacher,
            "PATCH",
            format!("/api/v2/file-submission-attempts/{attempt_id}/grade"),
            "3",
            &serde_json::json!({ "action": "save", "final_score": 90 }),
        ))
        .await;
    assert_eq!(saved_file.status, StatusCode::OK, "{}", saved_file.text());
    assert_eq!(saved_file.json()["status"], "graded");
    let release = queue(&app, &teacher, "?role=teacher").await;
    assert_eq!(release["total"], 2, "bob + the unreleased file grade");
    let r = item_for(&release, &fs_activity).unwrap();
    assert_eq!(r["kind"], "awaiting_release");
    assert_eq!(r["status"], "graded_hidden");
    assert_eq!(r["priority"], "high");
    assert!(r["id"].as_str().unwrap().starts_with("teacher-release-"));
    assert_eq!(r["title"], "Release Essay PDF");
    assert_eq!(
        r["description"],
        "alice's grade in Work 101 is saved but not visible."
    );
    assert_eq!(
        r["href"],
        format!("/dash/courses/{course_id}/activity/{fs_activity}/review?submission={attempt_id}")
    );
    assert_eq!(r["primary_action"], "Review and release");
    assert_eq!(
        r["allowed_actions"],
        serde_json::json!(["review", "publish"])
    );
    assert!(r["due_at_unix"].is_null());
    // The learner sees nothing for a hidden grade.
    assert!(item_for(&queue(&app, &alice, "").await, &fs_activity).is_none());
    let published = app
        .send(with_if_match(
            &teacher,
            "PATCH",
            format!("/api/v2/file-submission-attempts/{attempt_id}/grade"),
            "4",
            &serde_json::json!({ "action": "publish", "final_score": 90 }),
        ))
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    assert!(item_for(&queue(&app, &teacher, "?role=teacher").await, &fs_activity).is_none());
    let released = item_for(&queue(&app, &alice, "").await, &fs_activity)
        .cloned()
        .unwrap();
    assert_eq!(released["kind"], "feedback_released");
    assert_eq!(released["priority"], "normal", "90 passes");

    // Overdue work is critical and sorts first.
    let (late_quiz, late_activity, _, _) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        "Late quiz",
        serde_json::json!({ "due_at_unix": now_unix() - 3600, "allow_late": true,
                             "late_policy": { "kind": "penalty", "percent_per_day": 10,
                                              "max_days": 3 } }),
    )
    .await;
    start_draft(&app, &alice, &late_quiz).await;
    let overdue = queue(&app, &alice, "").await;
    assert_eq!(overdue["total"], 3);
    let o = &items(&overdue)[0];
    assert_eq!(o["activity_id"], late_activity.as_str());
    assert_eq!(o["kind"], "overdue");
    assert_eq!(o["priority"], "critical");
    assert!(o["due_at_unix"].is_i64());
    assert_eq!(items(&overdue)[1]["priority"], "normal");
}
