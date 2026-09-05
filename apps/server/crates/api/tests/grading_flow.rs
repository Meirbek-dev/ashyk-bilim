//! Teacher grading end to end: review queue and stats, the grader's view,
//! grade save / publish / return under `If-Match` (412 on a stale version),
//! the transition table, learner-visible feedback, bulk release, CSV export,
//! item analytics, the course gradebook, and deadline extensions as a
//! queued bulk action.
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
        &["assessment:submit:assigned", "assessment:read:assigned"],
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
            &serde_json::json!({ "name": "Grading 101" }),
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

/// A published quiz with one auto-graded choice item (10) and one essay
/// (10), batch release; returns (assessment_id, choice_item, essay_item).
async fn quiz_with_essay(
    app: &TestApp,
    teacher: &MintedSession,
    chapter_id: &str,
    policy_patch: serde_json::Value,
) -> (String, String, String) {
    let created = app
        .post_as(
            teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Quiz" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
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
    (id, choice_id, essay_id)
}

/// Start + submit with the choice answered correctly and an essay text.
async fn submit_attempt(
    app: &TestApp,
    learner: &MintedSession,
    assessment_id: &str,
    choice_id: &str,
    essay_id: &str,
) -> String {
    let draft = app
        .post_as(
            learner,
            &format!("/api/v2/assessments/{assessment_id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
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
    sub_id
}

fn grade(
    session: &MintedSession,
    id: &str,
    if_match: Option<&str>,
    body: &serde_json::Value,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method("PATCH")
        .uri(format!("/api/v2/submissions/{id}/grade"))
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, &session.cookie);
    if let Some(version) = if_match {
        builder = builder.header(header::IF_MATCH, version);
    }
    builder.body(Body::from(body.to_string())).unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn review_grade_publish_return_and_release(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "max_attempts": 1 }),
    )
    .await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    let carol = learner(&app, "carol").await;
    let alice_sub = submit_attempt(&app, &alice, &id, &choice_id, &essay_id).await;
    let bob_sub = submit_attempt(&app, &bob, &id, &choice_id, &essay_id).await;
    let carol_sub = submit_attempt(&app, &carol, &id, &choice_id, &essay_id).await;

    // Learners cannot reach the teacher surface.
    assert_eq!(
        app.get_as(&alice, &format!("/api/v2/assessments/{id}/submissions"))
            .await
            .status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.get_as(&alice, &format!("/api/v2/submissions/{bob_sub}/review"))
            .await
            .status,
        StatusCode::FORBIDDEN
    );

    // Queue + stats: three pending essays.
    let queue = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/submissions?status=needs_grading&limit=2"),
        )
        .await;
    assert_eq!(queue.status, StatusCode::OK, "{}", queue.text());
    assert_eq!(queue.json()["items"].as_array().unwrap().len(), 2);
    assert_eq!(
        queue.json()["items"][0]["id"],
        carol_sub.as_str(),
        "newest first"
    );
    assert_eq!(queue.json()["items"][0]["user"]["username"], "carol");
    assert_eq!(queue.json()["items"][0]["version"], 1);
    let cursor = queue.json()["next_cursor"].as_str().unwrap().to_owned();
    let rest = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/submissions?status=needs_grading&cursor={cursor}"),
        )
        .await;
    assert_eq!(rest.json()["items"].as_array().unwrap().len(), 1);
    assert!(rest.json()["next_cursor"].is_null());
    let by_name = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/submissions?search=ali"),
        )
        .await;
    assert_eq!(by_name.json()["items"].as_array().unwrap().len(), 1);
    let stats = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/submissions/stats"),
        )
        .await;
    assert_eq!(stats.json()["total"], 3);
    assert_eq!(stats.json()["needs_grading"], 3);
    assert!(stats.json()["avg_score"].is_null());

    // The grader sees everything; the version guards the save.
    let review = app
        .get_as(&teacher, &format!("/api/v2/submissions/{alice_sub}/review"))
        .await;
    assert_eq!(review.status, StatusCode::OK, "{}", review.text());
    assert_eq!(review.json()["answers"][&essay_id]["text"], "Because.");
    assert_eq!(review.json()["grading"]["needs_manual_review"], true);
    assert_eq!(review.json()["version"], 1);
    assert_eq!(review.json()["release_state"], "hidden");
    let missing = app
        .send(grade(
            &teacher,
            &alice_sub,
            None,
            &serde_json::json!({ "action": "save" }),
        ))
        .await;
    assert_eq!(missing.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(missing.json()["field_errors"][0]["field"], "If-Match");

    // Save: essay 8/10 → (10 + 8) / 20 = 90, teacher-only.
    let saved = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("\"1\""),
            &serde_json::json!({
                "action": "save", "feedback": "nice work",
                "item_grades": [{ "item_id": &essay_id, "score": 8, "feedback": "good argument" }],
            }),
        ))
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    assert_eq!(saved.json()["status"], "graded");
    assert_eq!(saved.json()["final_score"], 90.0);
    assert_eq!(saved.json()["version"], 2);
    assert_eq!(saved.json()["release_state"], "awaiting_release");
    assert_eq!(saved.json()["grading"]["needs_manual_review"], false);
    assert_eq!(saved.json()["grading"]["feedback"], "nice work");
    assert_eq!(saved.json()["feedback"][0]["comment"], "good argument");
    let mine = app
        .get_as(&alice, &format!("/api/v2/submissions/{alice_sub}"))
        .await;
    assert_eq!(mine.json()["release_state"], "awaiting_release");
    assert!(mine.json()["final_score"].is_null(), "held until release");
    let hidden_feedback = app
        .get_as(&alice, &format!("/api/v2/submissions/{alice_sub}/feedback"))
        .await;
    assert_eq!(hidden_feedback.json().as_array().unwrap().len(), 0);

    // Stale version → 412 with the numbers; then publish with an override.
    let stale = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("1"),
            &serde_json::json!({ "action": "publish" }),
        ))
        .await;
    assert_eq!(
        stale.status,
        StatusCode::PRECONDITION_FAILED,
        "{}",
        stale.text()
    );
    assert_eq!(stale.json()["code"], "precondition-failed");
    assert_eq!(stale.json()["details"]["actual"], 2);
    let published = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("2"),
            &serde_json::json!({ "action": "publish", "final_score": 95 }),
        ))
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    assert_eq!(published.json()["status"], "published");
    assert_eq!(published.json()["final_score"], 95.0);
    assert_eq!(published.json()["release_state"], "visible");
    let mine = app
        .get_as(&alice, &format!("/api/v2/submissions/{alice_sub}"))
        .await;
    assert_eq!(mine.json()["release_state"], "visible");
    assert_eq!(mine.json()["final_score"], 95.0);
    let feedback = app
        .get_as(&alice, &format!("/api/v2/submissions/{alice_sub}/feedback"))
        .await;
    assert_eq!(feedback.json()[0]["comment"], "good argument");
    assert_eq!(feedback.json()[0]["score"], 8.0);
    let history = app
        .get_as(
            &teacher,
            &format!("/api/v2/submissions/{alice_sub}/grading-history"),
        )
        .await;
    let entries = history.json();
    assert_eq!(entries.as_array().unwrap().len(), 2);
    assert!(entries[0]["published_at_unix"].is_i64());
    assert_eq!(entries[0]["raw_score"], 95.0);
    assert!(entries[1]["published_at_unix"].is_null());
    assert_eq!(entries[1]["graded_by"], teacher.user_id.to_string());
    // Published grades never go back.
    let illegal = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("3"),
            &serde_json::json!({ "action": "return" }),
        ))
        .await;
    assert_eq!(illegal.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        illegal.json()["field_errors"][0]["code"],
        "transition-not-allowed"
    );

    // Return bob's work: the cap of 1 is lifted for a revision.
    let returned = app
        .send(grade(
            &teacher,
            &bob_sub,
            Some("1"),
            &serde_json::json!({ "action": "return", "feedback": "please expand" }),
        ))
        .await;
    assert_eq!(returned.status, StatusCode::OK, "{}", returned.text());
    assert_eq!(returned.json()["status"], "returned");
    let state = app
        .get_as(&bob, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(state.json()["revision_requested"], true);
    assert_eq!(state.json()["can_start"], true);
    assert_eq!(state.json()["attempts_remaining"], 0);
    let bob_view = app
        .get_as(&bob, &format!("/api/v2/submissions/{bob_sub}"))
        .await;
    assert_eq!(bob_view.json()["release_state"], "returned_for_revision");
    let revision = app
        .post_as(
            &bob,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(revision.status, StatusCode::CREATED, "{}", revision.text());
    assert_eq!(revision.json()["attempt_number"], 2);

    // Bulk release: carol (saved) gets released, alice is already visible.
    let saved = app
        .send(grade(
            &teacher,
            &carol_sub,
            Some("1"),
            &serde_json::json!({ "action": "save",
                "item_grades": [{ "item_id": &essay_id, "score": 5 }] }),
        ))
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    assert_eq!(saved.json()["final_score"], 75.0);
    let released = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/publish-grades"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(released.status, StatusCode::OK, "{}", released.text());
    assert_eq!(released.json()["published_count"], 1);
    assert_eq!(released.json()["already_published_count"], 1);
    let carol_view = app
        .get_as(&carol, &format!("/api/v2/submissions/{carol_sub}"))
        .await;
    assert_eq!(carol_view.json()["status"], "published");
    assert_eq!(carol_view.json()["final_score"], 75.0);
    let again = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/publish-grades"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(again.json()["published_count"], 0);
    assert_eq!(again.json()["already_published_count"], 2);

    // Stats, analytics, CSV, gradebook.
    let stats = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/submissions/stats"),
        )
        .await;
    assert_eq!(stats.json()["published"], 2);
    assert_eq!(stats.json()["returned"], 1);
    assert_eq!(stats.json()["avg_score"], 85.0);
    assert_eq!(stats.json()["pass_rate"], 100.0);
    assert_eq!(stats.json()["distribution"][9]["count"], 1);
    assert_eq!(stats.json()["distribution"][7]["count"], 1);
    let analytics = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/item-analytics"),
        )
        .await;
    assert_eq!(analytics.status, StatusCode::OK, "{}", analytics.text());
    assert_eq!(analytics.json()[0]["item_id"], choice_id.as_str());
    assert_eq!(analytics.json()[0]["response_count"], 2);
    assert_eq!(analytics.json()[0]["correct_pct"], 100.0);
    assert_eq!(analytics.json()[1]["avg_score_pct"], 65.0);
    assert!(analytics.json()[1]["discrimination_index"].is_null());
    let csv = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/submissions/export"),
        )
        .await;
    assert_eq!(csv.status, StatusCode::OK);
    assert!(
        csv.headers[header::CONTENT_TYPE]
            .to_str()
            .unwrap()
            .starts_with("text/csv")
    );
    let text = csv.text();
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(
        lines[0],
        "student,email,attempt,status,late,submitted_at,auto_score,final_score,item: Q1,item: Essay"
    );
    assert_eq!(lines.len(), 4);
    assert!(lines[1].starts_with("alice,alice@example.com,1,published,no,"));
    assert!(lines[1].ends_with(",95,10,8"), "{}", lines[1]);
    let gradebook = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/gradebook?limit=2"),
        )
        .await;
    assert_eq!(gradebook.status, StatusCode::OK, "{}", gradebook.text());
    assert_eq!(gradebook.json()["cells"].as_array().unwrap().len(), 2);
    assert_eq!(gradebook.json()["assessments"][0]["id"], id.as_str());
    let cursor = gradebook.json()["next_cursor"].as_str().unwrap().to_owned();
    let page2 = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/gradebook?limit=2&cursor={cursor}"),
        )
        .await;
    assert_eq!(page2.json()["cells"].as_array().unwrap().len(), 1);
    assert!(page2.json()["next_cursor"].is_null());
    let bob_cell = gradebook.json()["cells"]
        .as_array()
        .unwrap()
        .iter()
        .chain(page2.json()["cells"].as_array().unwrap().iter())
        .find(|c| c["user_id"] == bob.user_id.to_string())
        .cloned()
        .unwrap();
    assert_eq!(
        bob_cell["status"], "returned",
        "the open revision draft is not a cell"
    );
    assert_eq!(bob_cell["attempts"], 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn deadline_extension_is_a_queued_bulk_action(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "due_at_unix": now_unix() - 3600, "allow_late": true,
                             "late_policy": { "kind": "penalty", "percent_per_day": 10, "max_days": 3 } }),
    )
    .await;
    let alice = learner(&app, "alice").await;
    let alice_sub = submit_attempt(&app, &alice, &id, &choice_id, &essay_id).await;
    let review = app
        .get_as(&teacher, &format!("/api/v2/submissions/{alice_sub}/review"))
        .await;
    assert_eq!(review.json()["is_late"], true);
    assert_eq!(review.json()["late_penalty_pct"], 10.0);

    // Validation: unknown learners, past dates.
    let unknown = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/deadline-extensions"),
            &serde_json::json!({ "user_ids": ["00000000-0000-7000-8000-000000000000"],
                                  "new_due_at_unix": now_unix() + 86_400 }),
        )
        .await;
    assert_eq!(
        unknown.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        unknown.text()
    );
    assert_eq!(
        unknown.json()["details"]["unknown_user_ids"][0],
        "00000000-0000-7000-8000-000000000000"
    );
    let past = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/deadline-extensions"),
            &serde_json::json!({ "user_ids": [alice.user_id], "new_due_at_unix": now_unix() - 5 }),
        )
        .await;
    assert_eq!(past.status, StatusCode::UNPROCESSABLE_ENTITY);

    // Queued (202), executed by the worker, then the learner is on time.
    let new_due = now_unix() + 86_400;
    let queued = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/deadline-extensions"),
            &serde_json::json!({ "user_ids": [alice.user_id], "new_due_at_unix": new_due,
                                  "reason": "illness" }),
        )
        .await;
    assert_eq!(queued.status, StatusCode::ACCEPTED, "{}", queued.text());
    assert_eq!(queued.json()["status"], "pending");
    assert_eq!(queued.json()["action_type"], "extend_deadline");
    let action_id = queued.json()["id"].as_str().unwrap().to_owned();
    let (kind, payload): (String, serde_json::Value) =
        sqlx::query_as("SELECT kind, payload FROM jobs ORDER BY created_at DESC LIMIT 1")
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(kind, "grading:bulk-action");
    assert_eq!(payload["action_id"], action_id.as_str());

    ab_domain::grading::GradingService::execute_bulk_action(
        &app.pool,
        None,
        ab_core::id::BulkActionId(uuid::Uuid::parse_str(&action_id).unwrap()),
    )
    .await
    .unwrap();
    let done = app
        .get_as(&teacher, &format!("/api/v2/bulk-actions/{action_id}"))
        .await;
    assert_eq!(done.status, StatusCode::OK, "{}", done.text());
    assert_eq!(done.json()["status"], "completed");
    assert_eq!(done.json()["affected_count"], 1);
    assert!(done.json()["completed_at_unix"].is_i64());
    let state = app
        .get_as(&alice, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(state.json()["effective"]["due_at_unix"], new_due);
    assert_eq!(state.json()["effective"]["override_applied"], true);
    let review = app
        .get_as(&teacher, &format!("/api/v2/submissions/{alice_sub}/review"))
        .await;
    assert_eq!(review.json()["is_late"], false);
    // Learners cannot read bulk actions.
    assert_eq!(
        app.get_as(&alice, &format!("/api/v2/bulk-actions/{action_id}"))
            .await
            .status,
        StatusCode::FORBIDDEN
    );
}
