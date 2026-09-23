//! Teacher grading end to end: review queue and stats, the grader's view,
//! grade save / publish / return under `If-Match` (412 on a stale version),
//! the transition table, learner-visible feedback, bulk release, CSV export,
//! item analytics, the course gradebook, and deadline extensions as a
//! queued bulk action.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp, drop_request_when, wait_until};
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
    app.publish_course(&course_id).await;
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
    // UX-134: another learner's submission id answers like an unknown one.
    assert_eq!(
        app.get_as(&alice, &format!("/api/v2/submissions/{bob_sub}/review"))
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.get_as(
            &alice,
            &format!("/api/v2/submissions/{bob_sub}/grading-history")
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.patch_as(
            &alice,
            &format!("/api/v2/submissions/{bob_sub}/grade"),
            &serde_json::json!({ "action": "save", "final_score": 100 }),
        )
        .await
        .status,
        StatusCode::NOT_FOUND
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

    // A score above the item's own max is refused, not scaled into the breakdown.
    let over = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("\"1\""),
            &serde_json::json!({
                "action": "save",
                "item_grades": [{ "item_id": &essay_id, "score": 50 }],
            }),
        ))
        .await;
    assert_eq!(
        over.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        over.text()
    );
    assert_eq!(over.json()["field_errors"][0]["field"], "item_grades");
    assert_eq!(over.json()["field_errors"][0]["code"], "range");
    // An item id outside the assessment is refused before anything is
    // written: no version bump, no phantom breakdown item, no ledger entry.
    let unknown = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("\"1\""),
            &serde_json::json!({
                "action": "save",
                "item_grades": [
                    { "item_id": &essay_id, "score": 5 },
                    { "item_id": uuid::Uuid::now_v7(), "score": 5 },
                ],
            }),
        ))
        .await;
    assert_eq!(
        unknown.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        unknown.text()
    );
    assert_eq!(unknown.json()["field_errors"][0]["field"], "item_grades");
    assert_eq!(unknown.json()["field_errors"][0]["code"], "unknown");
    let untouched = app
        .get_as(&teacher, &format!("/api/v2/submissions/{alice_sub}/review"))
        .await;
    assert_eq!(untouched.json()["version"], 1);
    assert_eq!(untouched.json()["grading"], review.json()["grading"]);
    let no_ledger = app
        .get_as(
            &teacher,
            &format!("/api/v2/submissions/{alice_sub}/grading-history"),
        )
        .await;
    assert_eq!(no_ledger.json().as_array().unwrap().len(), 0);

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
    // UX-144: item-analytics count released grades only — carol's saved
    // (unreleased) grade and bob's returned one are not responses yet.
    let unreleased = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/item-analytics"),
        )
        .await;
    assert_eq!(
        unreleased.json()[0]["response_count"],
        1,
        "{}",
        unreleased.text()
    );
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
    // UX-105: localized like the gradebook CSV — Russian by default, BOM first.
    let text = csv.text();
    assert!(text.starts_with('\u{feff}'), "BOM first");
    let lines: Vec<&str> = text.trim_start_matches('\u{feff}').lines().collect();
    assert_eq!(
        lines[0],
        "Студент,Email,Попытка,Статус,Просрочено,Отправлено,Автооценка,Итоговый балл,Задание: Q1,Задание: Essay"
    );
    assert_eq!(lines.len(), 4);
    assert!(
        lines[1].starts_with("alice,alice@example.com,1,Опубликовано,Нет,"),
        "{}",
        lines[1]
    );
    assert!(lines[1].ends_with(",95,10,8"), "{}", lines[1]);
    let english = app
        .send(
            Request::builder()
                .method("GET")
                .uri(format!("/api/v2/assessments/{id}/submissions/export"))
                .header(header::COOKIE, &teacher.cookie)
                .header(header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    let english = english.text();
    assert!(
        english.contains("Learner,Email,Attempt,Status,Late,Submitted at,Auto score,Final score,Item: Q1,Item: Essay"),
        "{english}"
    );
    assert!(english.contains(",1,Published,No,"), "{english}");
    let gradebook = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/gradebook?limit=2"),
        )
        .await;
    assert_eq!(gradebook.status, StatusCode::OK, "{}", gradebook.text());
    assert_eq!(gradebook.json()["cells"].as_array().unwrap().len(), 2);
    // UX-156: an out-of-range page size is a 422, not a silent clamp.
    let refused = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/gradebook?limit=501"),
        )
        .await;
    assert_eq!(
        refused.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        refused.text()
    );
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

/// The cap is lifted for a revision at start (`attempt-state`) *and* at
/// submit: a returned attempt on a `max_attempts: 1` quiz could be started
/// again but its hand-in answered 403 `MAX_ATTEMPTS_REACHED`.
#[sqlx::test(migrations = "../../migrations")]
async fn a_returned_attempt_can_be_handed_in_again_at_the_cap(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "max_attempts": 1 }),
    )
    .await;
    let bob = learner(&app, "bob").await;
    let bob_sub = submit_attempt(&app, &bob, &id, &choice_id, &essay_id).await;
    let returned = app
        .send(grade(
            &teacher,
            &bob_sub,
            Some("1"),
            &serde_json::json!({ "action": "return", "feedback": "please expand" }),
        ))
        .await;
    assert_eq!(returned.status, StatusCode::OK, "{}", returned.text());
    let revision = app
        .post_as(
            &bob,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(revision.status, StatusCode::CREATED, "{}", revision.text());
    let revision_id = revision.json()["id"].as_str().unwrap().to_owned();
    let handed_in = app
        .post_as(
            &bob,
            &format!("/api/v2/submissions/{revision_id}/submit"),
            &serde_json::json!({ "answers": {
                &choice_id: { "kind": "choice", "selected": ["a"] },
                &essay_id: { "kind": "open_text", "text": "Expanded." },
            } }),
        )
        .await;
    assert_eq!(handed_in.status, StatusCode::OK, "{}", handed_in.text());
    assert_eq!(handed_in.json()["attempt_number"], 2);
    assert_eq!(handed_in.json()["status"], "pending");
    // A third attempt is still refused: the lift is for the revision only.
    let third = app
        .post_as(
            &bob,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(third.status, StatusCode::FORBIDDEN, "{}", third.text());
}

/// BUG-111: the teacher's grade is capped by the attempt penalty exactly
/// like the auto path — attempt 2 with a 20 % cap graded 100 lands at 80.
#[sqlx::test(migrations = "../../migrations")]
async fn teacher_grade_applies_the_attempt_cap(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "max_attempts": 2, "attempt_penalty_percent": 20 }),
    )
    .await;
    let bob = learner(&app, "bob").await;
    let first = submit_attempt(&app, &bob, &id, &choice_id, &essay_id).await;
    let graded = app
        .send(grade(
            &teacher,
            &first,
            Some("1"),
            &serde_json::json!({ "action": "publish", "final_score": 100 }),
        ))
        .await;
    assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
    assert_eq!(graded.json()["final_score"], 100.0, "attempt 1 is uncapped");
    let second = submit_attempt(&app, &bob, &id, &choice_id, &essay_id).await;
    let graded = app
        .send(grade(
            &teacher,
            &second,
            Some("1"),
            &serde_json::json!({ "action": "publish", "final_score": 100 }),
        ))
        .await;
    assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
    assert_eq!(graded.json()["attempt_number"], 2);
    assert_eq!(graded.json()["final_score"], 80.0, "capped at 100 − 20 × 1");
}

/// BUG-173: one grade of record — the gradebook cell (and the CSV) reports
/// the attempt learner progress scores: the best published attempt, not
/// the latest one. Attempt 2 published 76 %, attempt 3 zeroed → the cell
/// is attempt 2, 76 %, passed; the CSV says `76`.
#[sqlx::test(migrations = "../../migrations")]
async fn gradebook_reports_the_best_published_attempt(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "max_attempts": 3, "passing_score": 60 }),
    )
    .await;
    let bob = learner(&app, "bob").await;
    for score in [40, 76, 0] {
        let sub = submit_attempt(&app, &bob, &id, &choice_id, &essay_id).await;
        let published = app
            .send(grade(
                &teacher,
                &sub,
                Some("1"),
                &serde_json::json!({ "action": "publish", "final_score": score }),
            ))
            .await;
        assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    }
    let state = app
        .get_as(&bob, &format!("/api/v2/courses/{course_id}/learner-state"))
        .await;
    let entry = &state.json()["outline"][0]["activities"][0];
    assert_eq!(entry["score"], 76.0, "{entry}");
    assert_eq!(entry["passed"], true, "{entry}");
    let gradebook = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}/gradebook"))
        .await;
    assert_eq!(gradebook.status, StatusCode::OK, "{}", gradebook.text());
    let cell = &gradebook.json()["cells"][0];
    assert_eq!(cell["attempt_number"], 2, "{cell}");
    assert_eq!(cell["attempts"], 3, "{cell}");
    assert_eq!(cell["status"], "published", "{cell}");
    assert_eq!(cell["final_score"], 76.0, "{cell}");
    let csv = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/gradebook/export"),
        )
        .await;
    assert_eq!(csv.status, StatusCode::OK, "{}", csv.text());
    let text = csv.text();
    let row = text.lines().find(|l| l.starts_with("bob")).unwrap();
    assert!(row.ends_with(",76"), "{row}");
}

/// BUG-174: a stored override survives any save that does not name a new
/// raw — a feedback-only republish that re-sends every item keeps 55, and
/// the grader's view reports the override; dropping it takes an explicit
/// `final_score: null`; without an override an edited item recomputes.
#[sqlx::test(migrations = "../../migrations")]
async fn override_survives_a_feedback_only_republish(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) =
        quiz_with_essay(&app, &teacher, &chapter_id, serde_json::json!({})).await;
    let alice = learner(&app, "alice").await;
    let sub = submit_attempt(&app, &alice, &id, &choice_id, &essay_id).await;
    let items = |essay: i32| {
        serde_json::json!([
            { "item_id": choice_id, "score": 10 },
            { "item_id": essay_id, "score": essay, "feedback": "ok" },
        ])
    };
    let published = app
        .send(grade(
            &teacher,
            &sub,
            Some("1"),
            &serde_json::json!({ "action": "publish", "final_score": 55, "item_grades": items(2) }),
        ))
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    assert_eq!(published.json()["final_score"], 55.0);
    assert_eq!(published.json()["score_override"], 55.0);
    let view = app
        .get_as(&teacher, &format!("/api/v2/submissions/{sub}/review"))
        .await;
    assert_eq!(view.json()["score_override"], 55.0, "{}", view.text());

    // Feedback-only republish, every item re-sent unchanged: 55 stays.
    let republished = app
        .send(grade(
            &teacher,
            &sub,
            Some("2"),
            &serde_json::json!({ "action": "publish", "feedback": "ещё строка", "item_grades": items(2) }),
        ))
        .await;
    assert_eq!(republished.status, StatusCode::OK, "{}", republished.text());
    assert_eq!(republished.json()["final_score"], 55.0, "override kept");
    assert_eq!(republished.json()["grading"]["feedback"], "ещё строка");

    // Explicit null drops the override: the items (10 + 2 of 20) decide.
    let dropped = app
        .send(grade(
            &teacher,
            &sub,
            Some("3"),
            &serde_json::json!({ "action": "publish", "final_score": null, "item_grades": items(2) }),
        ))
        .await;
    assert_eq!(dropped.status, StatusCode::OK, "{}", dropped.text());
    assert_eq!(dropped.json()["final_score"], 60.0, "{}", dropped.text());
    assert_eq!(dropped.json()["score_override"], serde_json::Value::Null);

    // No override in place: an edited item recomputes (10 + 6 of 20).
    let edited = app
        .send(grade(
            &teacher,
            &sub,
            Some("4"),
            &serde_json::json!({ "action": "publish", "item_grades": items(6) }),
        ))
        .await;
    assert_eq!(edited.status, StatusCode::OK, "{}", edited.text());
    assert_eq!(edited.json()["final_score"], 80.0, "{}", edited.text());
}

/// BUG-174: an integrity-annulled attempt (auto 0) keeps its 0 through a
/// feedback-only republish that re-sends the item scores; only an explicit
/// `final_score` moves it.
#[sqlx::test(migrations = "../../migrations")]
async fn annulled_attempt_keeps_zero_unless_overridden(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "tab_switch_detection": true, "violation_threshold": 1 }),
    )
    .await;
    let alice = learner(&app, "alice").await;
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub = draft.json()["id"].as_str().unwrap().to_owned();
    app.post_as(
        &alice,
        &format!("/api/v2/submissions/{sub}/violations"),
        &serde_json::json!({ "kind": "tab_switch" }),
    )
    .await;
    let submitted = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub}/submit"),
            &serde_json::json!({ "answers": {
                &choice_id: { "kind": "choice", "selected": ["a"] },
                &essay_id: { "kind": "open_text", "text": "Because." },
            } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    assert_eq!(
        submitted.json()["auto_submit_reason"],
        "integrity_violation"
    );

    let items = serde_json::json!([
        { "item_id": choice_id, "score": 10 },
        { "item_id": essay_id, "score": 10 },
    ]);
    let published = app
        .send(grade(
            &teacher,
            &sub,
            Some("1"),
            &serde_json::json!({ "action": "publish", "feedback": "аннулировано", "item_grades": items }),
        ))
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    assert_eq!(published.json()["final_score"], 0.0, "{}", published.text());
    let again = app
        .send(grade(
            &teacher,
            &sub,
            Some("2"),
            &serde_json::json!({ "action": "publish", "feedback": "ещё", "final_score": null, "item_grades": items }),
        ))
        .await;
    assert_eq!(again.status, StatusCode::OK, "{}", again.text());
    assert_eq!(again.json()["final_score"], 0.0, "annulled stays 0");
    let overridden = app
        .send(grade(
            &teacher,
            &sub,
            Some("3"),
            &serde_json::json!({ "action": "publish", "final_score": 40 }),
        ))
        .await;
    assert_eq!(overridden.status, StatusCode::OK, "{}", overridden.text());
    assert_eq!(overridden.json()["final_score"], 40.0);
}

/// BUG-175: the cell keeps the grade of record (published attempt 1) and
/// flags the newer attempt awaiting grading.
#[sqlx::test(migrations = "../../migrations")]
async fn gradebook_flags_a_pending_attempt_behind_the_grade_of_record(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "max_attempts": 3 }),
    )
    .await;
    let bob = learner(&app, "bob").await;
    let first = submit_attempt(&app, &bob, &id, &choice_id, &essay_id).await;
    let published = app
        .send(grade(
            &teacher,
            &first,
            Some("1"),
            &serde_json::json!({ "action": "publish", "final_score": 80 }),
        ))
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    let second = submit_attempt(&app, &bob, &id, &choice_id, &essay_id).await;
    let gradebook = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}/gradebook"))
        .await;
    assert_eq!(gradebook.status, StatusCode::OK, "{}", gradebook.text());
    let cell = &gradebook.json()["cells"][0];
    assert_eq!(cell["attempt_number"], 1, "{cell}");
    assert_eq!(cell["submission_id"], first, "{cell}");
    assert_eq!(cell["status"], "published", "{cell}");
    assert_eq!(cell["final_score"], 80.0, "{cell}");
    assert_eq!(cell["pending_attempt"], 2, "{cell}");
    // UX-123: the «pending» deep link names the attempt awaiting grading.
    assert_eq!(cell["pending_attempt_id"], second, "{cell}");
    assert_eq!(cell["pending_attempt_status"], "pending", "{cell}");
}

/// BUG-180: a pending retake never becomes the grade of record, however
/// high its partial auto score (choice 10/20 = 50 here). Bob: attempt 1
/// published 40 < pending 50 → the cell is 40 published, `pending_attempt`
/// 2, learner-state 40 passed, CSV `40`. Alice: a 50 tie → published wins.
#[sqlx::test(migrations = "../../migrations")]
async fn pending_retake_never_outranks_the_released_grade(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "max_attempts": 3, "passing_score": 30 }),
    )
    .await;
    let bob = learner(&app, "bob").await;
    let alice = learner(&app, "alice").await;
    for (who, score) in [(&bob, 40), (&alice, 50)] {
        let first = submit_attempt(&app, who, &id, &choice_id, &essay_id).await;
        let published = app
            .send(grade(
                &teacher,
                &first,
                Some("1"),
                &serde_json::json!({ "action": "publish", "final_score": score }),
            ))
            .await;
        assert_eq!(published.status, StatusCode::OK, "{}", published.text());
        let second = submit_attempt(&app, who, &id, &choice_id, &essay_id).await;
        let view = app
            .get_as(&teacher, &format!("/api/v2/submissions/{second}/review"))
            .await;
        assert_eq!(view.json()["auto_score"], 50.0, "{}", view.text());
    }
    let gradebook = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}/gradebook"))
        .await;
    assert_eq!(gradebook.status, StatusCode::OK, "{}", gradebook.text());
    for (who, score) in [(&bob, 40.0), (&alice, 50.0)] {
        let cell = gradebook.json()["cells"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["user_id"] == who.user_id.to_string())
            .cloned()
            .unwrap();
        assert_eq!(cell["attempt_number"], 1, "{cell}");
        assert_eq!(cell["status"], "published", "{cell}");
        assert_eq!(cell["final_score"], score, "{cell}");
        assert_eq!(cell["pending_attempt"], 2, "{cell}");
    }
    let state = app
        .get_as(&bob, &format!("/api/v2/courses/{course_id}/learner-state"))
        .await;
    let entry = &state.json()["outline"][0]["activities"][0];
    assert_eq!(entry["score"], 40.0, "{entry}");
    assert_eq!(entry["passed"], true, "{entry}");
    let csv = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/gradebook/export"),
        )
        .await;
    let text = csv.text();
    let row = text.lines().find(|l| l.starts_with("bob")).unwrap();
    assert!(row.ends_with(",40"), "{row}");
}

/// BUG-187: only a released grade is the grade of record — a returned
/// attempt (60, provisional) or a graded-unreleased one (100) never outranks
/// the published 30 in the cell / CSV, as in the learner's projection; the
/// unreleased attempt 3 is the cell's «pending» flag. A whitespace-only
/// `feedback` is stored trimmed.
#[sqlx::test(migrations = "../../migrations")]
async fn returned_or_unreleased_retake_never_outranks_the_released_grade(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "max_attempts": 3, "passing_score": 50 }),
    )
    .await;
    let bob = learner(&app, "bob").await;
    let first = submit_attempt(&app, &bob, &id, &choice_id, &essay_id).await;
    let second = submit_attempt(&app, &bob, &id, &choice_id, &essay_id).await;
    let third = submit_attempt(&app, &bob, &id, &choice_id, &essay_id).await;
    for (sub, body) in [
        (
            &first,
            serde_json::json!({ "action": "publish", "final_score": 30 }),
        ),
        (
            &second,
            serde_json::json!({ "action": "return", "final_score": 60, "feedback": "  
 " }),
        ),
        (
            &third,
            serde_json::json!({ "action": "save", "final_score": 100 }),
        ),
    ] {
        let graded = app.send(grade(&teacher, sub, Some("1"), &body)).await;
        assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
    }
    let history = app
        .get_as(
            &teacher,
            &format!("/api/v2/submissions/{second}/grading-history"),
        )
        .await;
    assert_eq!(
        history.json()[0]["overall_feedback"],
        "",
        "{}",
        history.text()
    );
    let gradebook = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}/gradebook"))
        .await;
    assert_eq!(gradebook.status, StatusCode::OK, "{}", gradebook.text());
    let cell = &gradebook.json()["cells"][0];
    assert_eq!(cell["attempt_number"], 1, "{cell}");
    assert_eq!(cell["submission_id"], first, "{cell}");
    assert_eq!(cell["status"], "published", "{cell}");
    assert_eq!(cell["final_score"], 30.0, "{cell}");
    assert_eq!(cell["attempts"], 3, "{cell}");
    assert_eq!(cell["pending_attempt"], 3, "{cell}");
    assert_eq!(cell["pending_attempt_id"], third, "{cell}");
    // UX-146: saved-unreleased is owed a release, not a grade.
    assert_eq!(cell["pending_attempt_status"], "graded", "{cell}");
    let state = app
        .get_as(&bob, &format!("/api/v2/courses/{course_id}/learner-state"))
        .await;
    let entry = &state.json()["outline"][0]["activities"][0];
    assert_eq!(entry["score"], 30.0, "{entry}");
    assert_eq!(entry["passed"], false, "{entry}");
    let csv = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/gradebook/export"),
        )
        .await;
    let text = csv.text();
    let row = text.lines().find(|l| l.starts_with("bob")).unwrap();
    assert!(row.ends_with(",30"), "{row}");
}

/// BUG-138: a publish-only save (no score, no item grades) keeps the raw
/// score of the latest entry — the late penalty is not applied twice — and
/// an omitted `feedback` keeps the stored one; `audit_note` lands in the
/// audit trail only. Also the small refusals: an unparsable `If-Match`,
/// a draft, and another learner's feedback.
#[sqlx::test(migrations = "../../migrations")]
async fn publish_only_keeps_the_stored_raw_score_and_feedback(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "due_at_unix": now_unix() - 3600, "allow_late": true,
                             "late_policy": { "kind": "penalty", "percent_per_day": 5, "max_days": 3 } }),
    )
    .await;
    let alice = learner(&app, "alice").await;
    let bob = learner(&app, "bob").await;
    let alice_sub = submit_attempt(&app, &alice, &id, &choice_id, &essay_id).await;
    let saved = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("1"),
            &serde_json::json!({ "action": "save", "final_score": 95, "feedback": "скрытая" }),
        ))
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    assert_eq!(saved.json()["final_score"], 90.25, "95 − 5 % late");
    let published = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("2"),
            &serde_json::json!({ "action": "publish", "audit_note": "пакетная публикация" }),
        ))
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    assert_eq!(published.json()["status"], "published");
    assert_eq!(
        published.json()["final_score"],
        90.25,
        "not penalised again"
    );
    assert_eq!(published.json()["grading"]["feedback"], "скрытая");
    let history = app
        .get_as(
            &teacher,
            &format!("/api/v2/submissions/{alice_sub}/grading-history"),
        )
        .await;
    assert_eq!(history.json()[0]["raw_score"], 95.0);
    assert_eq!(history.json()[0]["overall_feedback"], "скрытая");
    let (payload,): (serde_json::Value,) = sqlx::query_as(
        "SELECT payload FROM assessment_audit_events WHERE event = 'grade-saved' ORDER BY id DESC LIMIT 1",
    )
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(payload["audit_note"], "пакетная публикация");

    // Unparsable If-Match → 422; a draft → 409; another learner → 404.
    let bad = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("abc"),
            &serde_json::json!({ "action": "publish" }),
        ))
        .await;
    assert_eq!(
        bad.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        bad.text()
    );
    assert_eq!(bad.json()["field_errors"][0]["field"], "If-Match");
    let draft = app
        .post_as(
            &bob,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let draft_id = draft.json()["id"].as_str().unwrap().to_owned();
    let refused = app
        .send(grade(
            &teacher,
            &draft_id,
            Some("1"),
            &serde_json::json!({ "action": "save", "final_score": 10 }),
        ))
        .await;
    assert_eq!(refused.status, StatusCode::CONFLICT, "{}", refused.text());
    assert_eq!(
        app.get_as(&bob, &format!("/api/v2/submissions/{alice_sub}/feedback"))
            .await
            .status,
        StatusCode::NOT_FOUND
    );
}

/// BUG-139: an extension that makes a late hand-in on time clears the late
/// penalty and re-scores graded work (the legacy kept deducting).
#[sqlx::test(migrations = "../../migrations")]
async fn deadline_extension_clears_the_late_penalty_of_graded_work(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher).await;
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
    let published = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("1"),
            &serde_json::json!({ "action": "publish", "final_score": 100 }),
        ))
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    assert_eq!(published.json()["final_score"], 90.0);
    let queued = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/deadline-extensions"),
            &serde_json::json!({ "user_ids": [alice.user_id], "new_due_at_unix": now_unix() + 86_400 }),
        )
        .await;
    assert_eq!(queued.status, StatusCode::ACCEPTED, "{}", queued.text());
    let action_id = queued.json()["id"].as_str().unwrap().to_owned();
    ab_domain::grading::GradingService::execute_bulk_action(
        &app.pool,
        None,
        ab_core::id::BulkActionId(uuid::Uuid::parse_str(&action_id).unwrap()),
    )
    .await
    .unwrap();
    let review = app
        .get_as(&teacher, &format!("/api/v2/submissions/{alice_sub}/review"))
        .await;
    assert_eq!(review.json()["is_late"], false);
    assert_eq!(review.json()["late_penalty_pct"], 0.0);
    assert_eq!(
        review.json()["final_score"],
        100.0,
        "re-scored without the penalty"
    );
    // UX-113: the gradebook cell carries the active override so «overdue»
    // is judged against the learner's own deadline.
    let gradebook = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}/gradebook"))
        .await;
    assert_eq!(gradebook.status, StatusCode::OK, "{}", gradebook.text());
    let cell = &gradebook.json()["cells"][0];
    assert_eq!(cell["user_id"], alice.user_id.to_string());
    assert!(
        cell["due_at_override_unix"].as_i64().unwrap() > now_unix() + 80_000,
        "{cell}"
    );
    let mine = app
        .get_as(&alice, &format!("/api/v2/submissions/{alice_sub}"))
        .await;
    assert_eq!(mine.json()["final_score"], 100.0);
    // A later publish-only save keeps it there.
    let version = review.json()["version"].as_i64().unwrap().to_string();
    let again = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some(&version),
            &serde_json::json!({ "action": "publish" }),
        ))
        .await;
    assert_eq!(again.status, StatusCode::OK, "{}", again.text());
    assert_eq!(again.json()["final_score"], 100.0);
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

/// The browser's part of an upload: create, PUT to storage, finalize.
async fn finalized_upload(app: &TestApp, session: &MintedSession, payload: &[u8]) -> String {
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
        .header("content-type", "application/pdf")
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

fn with_if_match(
    session: &MintedSession,
    method: &str,
    uri: String,
    version: &str,
    body: &serde_json::Value,
) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, &session.cookie)
        .header(header::IF_MATCH, version)
        .body(Body::from(body.to_string()))
        .unwrap()
}

/// Q-2026-09-12-2 #1 / #3: the gradebook carries file-submission attempts in
/// the same cell shape as assessment submissions (keyset on
/// `(user, activity)`), and `GET /courses/{id}/gradebook/export` is the
/// matrix as CSV with the header in the `Accept-Language` language.
#[sqlx::test(migrations = "../../migrations")]
async fn gradebook_carries_file_submission_cells_and_exports_csv(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher).await;
    let (quiz_id, choice_id, essay_id) =
        quiz_with_essay(&app, &teacher, &chapter_id, serde_json::json!({})).await;
    let alice = {
        let user = app
            .create_user("alice", "alice@example.com", &["user"])
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
    };
    let sub_id = submit_attempt(&app, &alice, &quiz_id, &choice_id, &essay_id).await;
    let graded = app
        .send(grade(
            &teacher,
            &sub_id,
            Some("1"),
            &serde_json::json!({ "action": "publish", "final_score": 95 }),
        ))
        .await;
    assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());

    // A published file-submission activity with one graded attempt.
    let created = app
        .post_as(
            &teacher,
            "/api/v2/file-submissions",
            &serde_json::json!({ "chapter_id": chapter_id, "title": "Project Upload",
                                  "instructions": "Upload the project." }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let file_submission_id = created.json()["id"].as_str().unwrap().to_owned();
    let file_activity_id = created.json()["activity_id"].as_str().unwrap().to_owned();
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/file-submissions/{file_submission_id}/publish"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    let upload = finalized_upload(&app, &alice, b"%PDF-1.4 project").await;
    let submitted = app
        .post_as(
            &alice,
            &format!("/api/v2/file-submissions/{file_submission_id}/submit"),
            &serde_json::json!({ "files": [{ "upload_id": upload, "display_name": "project.pdf" }] }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    let attempt_id = submitted.json()["id"].as_str().unwrap().to_owned();
    let version = submitted.json()["version"].as_i64().unwrap().to_string();
    let file_grade = app
        .send(with_if_match(
            &teacher,
            "PATCH",
            format!("/api/v2/file-submission-attempts/{attempt_id}/grade"),
            &version,
            &serde_json::json!({ "action": "publish", "final_score": 77 }),
        ))
        .await;
    assert_eq!(file_grade.status, StatusCode::OK, "{}", file_grade.text());

    // Both attempts are cells; the file one is keyed by its own id pair.
    let gradebook = app
        .get_as(&teacher, &format!("/api/v2/courses/{course_id}/gradebook"))
        .await;
    assert_eq!(gradebook.status, StatusCode::OK, "{}", gradebook.text());
    let cells = gradebook.json()["cells"].as_array().unwrap().clone();
    assert_eq!(cells.len(), 2);
    let file_cell = cells
        .iter()
        .find(|c| c["activity_id"] == file_activity_id.as_str())
        .unwrap();
    assert_eq!(file_cell["file_submission_id"], file_submission_id.as_str());
    assert_eq!(file_cell["attempt_id"], attempt_id.as_str());
    assert!(file_cell["assessment_id"].is_null() && file_cell["submission_id"].is_null());
    assert_eq!(file_cell["status"], "published");
    assert_eq!(file_cell["final_score"], 77.0);
    assert_eq!(file_cell["attempts"], 1);
    let quiz_cell = cells
        .iter()
        .find(|c| c["assessment_id"] == quiz_id.as_str())
        .unwrap();
    assert_eq!(quiz_cell["submission_id"], sub_id.as_str());
    assert!(quiz_cell["attempt_id"].is_null());
    assert_eq!(gradebook.json()["assessments"][0]["id"], quiz_id.as_str());
    assert_eq!(
        gradebook.json()["file_submissions"][0]["id"],
        file_submission_id.as_str()
    );
    assert_eq!(
        gradebook.json()["file_submissions"][0]["activity_id"],
        file_activity_id.as_str()
    );
    assert_eq!(
        gradebook.json()["file_submissions"][0]["title"],
        "Project Upload"
    );
    // The keyset walks (user, activity) across both kinds.
    let page1 = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/gradebook?limit=1"),
        )
        .await;
    let cursor = page1.json()["next_cursor"].as_str().unwrap().to_owned();
    assert_eq!(
        cursor,
        format!(
            "{}:{}",
            page1.json()["cells"][0]["user_id"].as_str().unwrap(),
            page1.json()["cells"][0]["activity_id"].as_str().unwrap()
        )
    );
    let page2 = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/gradebook?limit=1&cursor={cursor}"),
        )
        .await;
    assert_eq!(page2.json()["cells"].as_array().unwrap().len(), 1);
    assert_ne!(
        page2.json()["cells"][0]["activity_id"],
        page1.json()["cells"][0]["activity_id"]
    );
    assert!(page2.json()["next_cursor"].is_null());

    // CSV: BOM + Russian header by default, English on request; graders only.
    let csv = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/gradebook/export"),
        )
        .await;
    assert_eq!(csv.status, StatusCode::OK, "{}", csv.text());
    assert!(csv.content_type().starts_with("text/csv"));
    assert!(
        csv.headers[header::CONTENT_DISPOSITION]
            .to_str()
            .unwrap()
            .contains("gradebook-")
    );
    let text = csv.text();
    assert!(text.starts_with('\u{feff}'), "BOM first");
    let lines: Vec<&str> = text.trim_start_matches('\u{feff}').lines().collect();
    assert_eq!(lines[0], "Студент,Email,Quiz,Project Upload");
    assert_eq!(lines[1], "alice,alice@example.com,95,77");
    assert_eq!(lines.len(), 2);
    let english = app
        .send(
            Request::builder()
                .method("GET")
                .uri(format!("/api/v2/courses/{course_id}/gradebook/export"))
                .header(header::COOKIE, &teacher.cookie)
                .header(header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert!(english.text().contains("Learner,Email,Quiz,Project Upload"));
    assert_eq!(
        app.get_as(
            &alice,
            &format!("/api/v2/courses/{course_id}/gradebook/export")
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );
}

/// Grade-path edges over HTTP: a negative item score and a final score
/// above 100 are 422s; `user_ids` empty or above 500 is a 422; a garbage
/// gradebook cursor is 422 `cursor`/`invalid`; a publish-only save of a
/// never-graded attempt scores the breakdown (choice 10/20 → 50); the
/// attempt cap and the late penalty compose (100 → 80 → 72).
#[sqlx::test(migrations = "../../migrations")]
async fn grade_path_edges_over_http(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "max_attempts": 2, "attempt_penalty_percent": 20,
                             "due_at_unix": now_unix() - 3600, "allow_late": true,
                             "late_policy": { "kind": "penalty", "percent_per_day": 10, "max_days": 3 } }),
    )
    .await;
    let alice = learner(&app, "alice").await;
    let first = submit_attempt(&app, &alice, &id, &choice_id, &essay_id).await;

    let negative_item = app
        .send(grade(
            &teacher,
            &first,
            Some("1"),
            &serde_json::json!({ "action": "save",
                                  "item_grades": [{ "item_id": &essay_id, "score": -1 }] }),
        ))
        .await;
    assert_eq!(negative_item.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        negative_item.json()["field_errors"][0]["field"],
        "item_grades[0].score"
    );
    let over_final = app
        .send(grade(
            &teacher,
            &first,
            Some("1"),
            &serde_json::json!({ "action": "save", "final_score": 101 }),
        ))
        .await;
    assert_eq!(over_final.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(over_final.json()["field_errors"][0]["field"], "final_score");
    assert_eq!(over_final.json()["field_errors"][0]["code"], "invalid");

    let due = now_unix() + 86_400;
    let no_users = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/deadline-extensions"),
            &serde_json::json!({ "user_ids": [], "new_due_at_unix": due }),
        )
        .await;
    assert_eq!(no_users.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(no_users.json()["field_errors"][0]["field"], "user_ids");
    let crowd: Vec<String> = (0..501).map(|_| alice.user_id.to_string()).collect();
    let too_many = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/deadline-extensions"),
            &serde_json::json!({ "user_ids": crowd, "new_due_at_unix": due }),
        )
        .await;
    assert_eq!(too_many.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(too_many.json()["field_errors"][0]["field"], "user_ids");

    let bad_cursor = app
        .get_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/gradebook?cursor=garbage"),
        )
        .await;
    assert_eq!(
        bad_cursor.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        bad_cursor.text()
    );
    assert_eq!(bad_cursor.json()["field_errors"][0]["field"], "cursor");
    assert_eq!(bad_cursor.json()["field_errors"][0]["code"], "invalid");

    // Publish-only on a never-graded attempt is 409 while the essay is
    // unscored (BUG-197); an explicit 0 on it publishes: the breakdown (10
    // of 20) is the raw score; attempt 1 is uncapped; 10 % late.
    let unscored = app
        .send(grade(
            &teacher,
            &first,
            Some("1"),
            &serde_json::json!({ "action": "publish" }),
        ))
        .await;
    assert_eq!(unscored.status, StatusCode::CONFLICT, "{}", unscored.text());
    let published = app
        .send(grade(
            &teacher,
            &first,
            Some("1"),
            &serde_json::json!({ "action": "publish",
                                  "item_grades": [{ "item_id": &essay_id, "score": 0 }] }),
        ))
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    assert_eq!(published.json()["final_score"], 45.0, "50 − 10 % late");
    let history = app
        .get_as(
            &teacher,
            &format!("/api/v2/submissions/{first}/grading-history"),
        )
        .await;
    assert_eq!(history.json()[0]["raw_score"], 50.0);

    // Cap then late on the second attempt.
    let second = submit_attempt(&app, &alice, &id, &choice_id, &essay_id).await;
    let graded = app
        .send(grade(
            &teacher,
            &second,
            Some("1"),
            &serde_json::json!({ "action": "publish", "final_score": 100 }),
        ))
        .await;
    assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
    assert_eq!(graded.json()["attempt_number"], 2);
    assert_eq!(graded.json()["final_score"], 72.0, "(100 − 20 %) − 10 %");
}

/// BUG-197: a save that leaves an essay unscored is a draft — the attempt
/// stays `pending` (feedback kept), out of the bulk release, and a publish
/// is 409; scoring every manual item makes it `graded`, then released.
#[sqlx::test(migrations = "../../migrations")]
async fn feedback_only_save_keeps_the_attempt_pending(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) =
        quiz_with_essay(&app, &teacher, &chapter_id, serde_json::json!({})).await;
    let alice = learner(&app, "alice").await;
    let alice_sub = submit_attempt(&app, &alice, &id, &choice_id, &essay_id).await;

    let saved = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("1"),
            &serde_json::json!({ "action": "save", "feedback": "read so far",
                "item_grades": [{ "item_id": &essay_id, "feedback": "expand this" }] }),
        ))
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    assert_eq!(saved.json()["status"], "pending");
    assert_eq!(saved.json()["release_state"], "hidden");
    assert_eq!(saved.json()["grading"]["needs_manual_review"], true);
    assert_eq!(saved.json()["grading"]["feedback"], "read so far");
    assert_eq!(saved.json()["feedback"][0]["comment"], "expand this");
    // BUG-202: no score of record yet — the queue row shows no percent.
    assert!(saved.json()["final_score"].is_null(), "{}", saved.text());
    let queue = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/submissions"))
        .await;
    assert_eq!(queue.status, StatusCode::OK, "{}", queue.text());
    assert!(
        queue.json()["items"][0]["final_score"].is_null(),
        "{}",
        queue.text()
    );
    let stats = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/submissions/stats"),
        )
        .await;
    assert_eq!(stats.json()["needs_grading"], 1);
    assert_eq!(stats.json()["graded"], 0);
    let released = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/publish-grades"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(released.status, StatusCode::OK, "{}", released.text());
    assert_eq!(released.json()["published_count"], 0);
    assert_eq!(
        released.json()["needs_grading_count"],
        1,
        "the pending row is owed a grade (BUG-202)"
    );
    let refused = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("2"),
            &serde_json::json!({ "action": "publish" }),
        ))
        .await;
    assert_eq!(refused.status, StatusCode::CONFLICT, "{}", refused.text());

    // Scoring the essay grades it; the bulk release then takes it.
    let graded = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("2"),
            &serde_json::json!({ "action": "save",
                "item_grades": [{ "item_id": &essay_id, "score": 6 }] }),
        ))
        .await;
    assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
    assert_eq!(graded.json()["status"], "graded");
    assert_eq!(graded.json()["final_score"], 80.0);
    assert_eq!(graded.json()["grading"]["feedback"], "read so far");
    let released = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/publish-grades"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(released.json()["published_count"], 1);
    let mine = app
        .get_as(&alice, &format!("/api/v2/submissions/{alice_sub}"))
        .await;
    assert_eq!(mine.json()["status"], "published");
    assert_eq!(mine.json()["final_score"], 80.0);
}

/// BUG-205: an explicit `final_score` equal to the item-derived score is
/// still an override — the attempt is graded, survives a feedback-only save
/// and is released by the bulk publish.
#[sqlx::test(migrations = "../../migrations")]
async fn override_equal_to_the_derived_score_is_a_score_of_record(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) =
        quiz_with_essay(&app, &teacher, &chapter_id, serde_json::json!({})).await;
    let alice = learner(&app, "alice").await;
    let alice_sub = submit_attempt(&app, &alice, &id, &choice_id, &essay_id).await;

    // Choice 10/10 + unscored essay 0/10 → derived 50; override with 50.
    let overridden = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("1"),
            &serde_json::json!({ "action": "save", "final_score": 50 }),
        ))
        .await;
    assert_eq!(overridden.status, StatusCode::OK, "{}", overridden.text());
    assert_eq!(overridden.json()["status"], "graded");
    assert_eq!(overridden.json()["final_score"], 50.0);
    assert_eq!(overridden.json()["score_override"], 50.0);
    assert_eq!(overridden.json()["grading"]["needs_manual_review"], true);

    let feedback_only = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("2"),
            &serde_json::json!({ "action": "save", "feedback": "fine" }),
        ))
        .await;
    assert_eq!(
        feedback_only.status,
        StatusCode::OK,
        "{}",
        feedback_only.text()
    );
    assert_eq!(feedback_only.json()["status"], "graded");
    assert_eq!(feedback_only.json()["final_score"], 50.0);
    assert_eq!(feedback_only.json()["score_override"], 50.0);

    let released = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/publish-grades"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(released.status, StatusCode::OK, "{}", released.text());
    assert_eq!(released.json()["published_count"], 1);
    assert_eq!(released.json()["needs_grading_count"], 0);
    let mine = app
        .get_as(&alice, &format!("/api/v2/submissions/{alice_sub}"))
        .await;
    assert_eq!(mine.json()["status"], "published");
    assert_eq!(mine.json()["final_score"], 50.0);
}

/// BUG-206: a deadline extension re-scores only rows that have a score of
/// record — a feedback-only-saved (pending, `final null`) late attempt
/// loses its penalty but gains no score; its ledger entry carries no
/// final either. Nits: `new_due_at_unix` outside the timestamp range is
/// 422; the route honours `Idempotency-Key` (a replay is the same action).
#[sqlx::test(migrations = "../../migrations")]
async fn deadline_extension_leaves_a_pending_attempt_unscored(pool: PgPool) {
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
    let saved = app
        .send(grade(
            &teacher,
            &alice_sub,
            Some("1"),
            &serde_json::json!({ "action": "save", "feedback": "read so far" }),
        ))
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    assert_eq!(saved.json()["status"], "pending");
    assert_eq!(saved.json()["is_late"], true);
    let history = app
        .get_as(
            &teacher,
            &format!("/api/v2/submissions/{alice_sub}/grading-history"),
        )
        .await;
    assert_eq!(history.status, StatusCode::OK, "{}", history.text());
    assert!(
        history.json()[0]["final_score"].is_null(),
        "a draft entry carries no final: {}",
        history.text()
    );

    let out_of_range = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/deadline-extensions"),
            &serde_json::json!({ "user_ids": [alice.user_id], "new_due_at_unix": 1_i64 << 62 }),
        )
        .await;
    assert_eq!(
        out_of_range.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        out_of_range.text()
    );

    let body =
        serde_json::json!({ "user_ids": [alice.user_id], "new_due_at_unix": now_unix() + 86_400 });
    let queue = || {
        app.send(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v2/assessments/{id}/deadline-extensions"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &teacher.cookie)
                .header("idempotency-key", "extend-1")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
    };
    let queued = queue().await;
    assert_eq!(queued.status, StatusCode::ACCEPTED, "{}", queued.text());
    let replay = queue().await;
    assert_eq!(replay.status, StatusCode::ACCEPTED, "{}", replay.text());
    assert_eq!(
        replay.json()["id"],
        queued.json()["id"],
        "one action per key"
    );
    let action_id = queued.json()["id"].as_str().unwrap().to_owned();
    ab_domain::grading::GradingService::execute_bulk_action(
        &app.pool,
        None,
        ab_core::id::BulkActionId(uuid::Uuid::parse_str(&action_id).unwrap()),
    )
    .await
    .unwrap();
    let review = app
        .get_as(&teacher, &format!("/api/v2/submissions/{alice_sub}/review"))
        .await;
    assert_eq!(review.json()["status"], "pending");
    assert_eq!(review.json()["is_late"], false);
    assert_eq!(review.json()["late_penalty_pct"], 0.0);
    assert!(
        review.json()["final_score"].is_null(),
        "no score of record was invented: {}",
        review.text()
    );
    let queue_row = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/submissions"))
        .await;
    assert!(
        queue_row.json()["items"][0]["final_score"].is_null(),
        "{}",
        queue_row.text()
    );
}

/// UX-136: a maintainer's queued deadline extension fails at execution
/// once the creator has set them inactive — the grant is checked when the
/// worker runs, not only at the enqueue.
#[sqlx::test(migrations = "../../migrations")]
async fn queued_extension_fails_for_a_demoted_maintainer(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let maint = instructor(&app, "maint").await;
    let (course_id, chapter_id) = public_course(&app, &teacher).await;
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
    let added = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/contributors"),
            &serde_json::json!({ "user_id": maint.user_id, "role": "maintainer" }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
    let queued = app
        .post_as(
            &maint,
            &format!("/api/v2/assessments/{id}/deadline-extensions"),
            &serde_json::json!({ "user_ids": [alice.user_id], "new_due_at_unix": now_unix() + 86_400 }),
        )
        .await;
    assert_eq!(queued.status, StatusCode::ACCEPTED, "{}", queued.text());
    let action_id = queued.json()["id"].as_str().unwrap().to_owned();
    let demoted = app
        .patch_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/contributors/{}", maint.user_id),
            &serde_json::json!({ "status": "inactive" }),
        )
        .await;
    assert_eq!(demoted.status, StatusCode::OK, "{}", demoted.text());

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
    assert_eq!(done.json()["status"], "failed", "{}", done.text());
    assert_eq!(done.json()["affected_count"], 0);
    assert!(
        done.json()["error_log"]
            .as_str()
            .unwrap()
            .contains("no longer has grading access"),
        "{}",
        done.text()
    );
    let review = app
        .get_as(&teacher, &format!("/api/v2/submissions/{alice_sub}/review"))
        .await;
    assert_eq!(review.json()["is_late"], true, "the extension did not run");
}

/// BUG-215: an integrity-annulled attempt's 0 is an explicit override —
/// right or wrong choice, a feedback-only save keeps it `graded 0`, the
/// review reports `score_override 0`, and the bulk release takes it.
#[sqlx::test(migrations = "../../migrations")]
async fn annulled_attempt_is_a_score_of_record(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "tab_switch_detection": true, "violation_threshold": 1 }),
    )
    .await;
    let mut subs = Vec::new();
    for (name, selected) in [("right", "a"), ("wrong", "b")] {
        let who = learner(&app, name).await;
        let draft = app
            .post_as(
                &who,
                &format!("/api/v2/assessments/{id}/submissions"),
                &serde_json::json!({}),
            )
            .await;
        let sub = draft.json()["id"].as_str().unwrap().to_owned();
        app.post_as(
            &who,
            &format!("/api/v2/submissions/{sub}/violations"),
            &serde_json::json!({ "kind": "tab_switch" }),
        )
        .await;
        let submitted = app
            .post_as(
                &who,
                &format!("/api/v2/submissions/{sub}/submit"),
                &serde_json::json!({ "answers": {
                    &choice_id: { "kind": "choice", "selected": [selected] },
                    &essay_id: { "kind": "open_text", "text": "Because." },
                } }),
            )
            .await;
        assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
        assert_eq!(submitted.json()["status"], "graded", "{}", submitted.text());
        let review = app
            .get_as(&teacher, &format!("/api/v2/submissions/{sub}/review"))
            .await;
        assert_eq!(
            review.json()["score_override"],
            0.0,
            "{name}: {}",
            review.text()
        );
        let saved = app
            .send(grade(
                &teacher,
                &sub,
                Some("1"),
                &serde_json::json!({ "action": "save", "feedback": "annulled" }),
            ))
            .await;
        assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
        assert_eq!(saved.json()["status"], "graded", "{name}: {}", saved.text());
        assert_eq!(saved.json()["final_score"], 0.0, "{name}");
        assert_eq!(saved.json()["score_override"], 0.0, "{name}");
        subs.push(sub);
    }
    let released = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/publish-grades"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(released.status, StatusCode::OK, "{}", released.text());
    assert_eq!(released.json()["published_count"], 2, "{}", released.text());
    assert_eq!(released.json()["needs_grading_count"], 0);
    for sub in &subs {
        let review = app
            .get_as(&teacher, &format!("/api/v2/submissions/{sub}/review"))
            .await;
        assert_eq!(review.json()["status"], "published");
        assert_eq!(review.json()["final_score"], 0.0);
    }
    // BUG-224 nit: a typed override on an annulled row is dropped by an
    // explicit `null` — back to the annulled 0, not the derived score.
    let sub = &subs[0];
    let review = app
        .get_as(&teacher, &format!("/api/v2/submissions/{sub}/review"))
        .await;
    let overridden = app
        .send(grade(
            &teacher,
            sub,
            Some(&review.json()["version"].to_string()),
            &serde_json::json!({ "action": "publish", "final_score": 40 }),
        ))
        .await;
    assert_eq!(overridden.status, StatusCode::OK, "{}", overridden.text());
    assert_eq!(overridden.json()["final_score"], 40.0);
    let cleared = app
        .send(grade(
            &teacher,
            sub,
            Some(&overridden.json()["version"].to_string()),
            &serde_json::json!({ "action": "publish", "final_score": null }),
        ))
        .await;
    assert_eq!(cleared.status, StatusCode::OK, "{}", cleared.text());
    assert_eq!(cleared.json()["final_score"], 0.0, "{}", cleared.text());
    assert_eq!(cleared.json()["score_override"], 0.0);
}

/// BUG-216: a deadline extension racing a teacher publish on a late row
/// never leaves the penalised final behind — whichever lands first, the
/// other one either re-scores (worker) or is refused as stale and retried
/// (save). Both orders, twenty rounds.
#[sqlx::test(migrations = "../../migrations")]
async fn deadline_extension_racing_a_publish_settles_on_the_unpenalised_score(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) = quiz_with_essay(
        &app,
        &teacher,
        &chapter_id,
        serde_json::json!({ "due_at_unix": now_unix() - 3600, "allow_late": true,
                             "late_policy": { "kind": "penalty", "percent_per_day": 5, "max_days": 3 } }),
    )
    .await;
    for round in 0..20 {
        for worker_first in [false, true] {
            let who = learner(&app, &format!("l{round}{}", u8::from(worker_first))).await;
            let sub = submit_attempt(&app, &who, &id, &choice_id, &essay_id).await;
            let queued = app
                .post_as(
                    &teacher,
                    &format!("/api/v2/assessments/{id}/deadline-extensions"),
                    &serde_json::json!({ "user_ids": [who.user_id],
                                         "new_due_at_unix": now_unix() + 86_400 }),
                )
                .await;
            assert_eq!(queued.status, StatusCode::ACCEPTED, "{}", queued.text());
            let action = ab_core::id::BulkActionId(
                uuid::Uuid::parse_str(queued.json()["id"].as_str().unwrap()).unwrap(),
            );
            let extend =
                ab_domain::grading::GradingService::execute_bulk_action(&app.pool, None, action);
            let publish = grade(
                &teacher,
                &sub,
                Some("1"),
                &serde_json::json!({ "action": "publish", "final_score": 80 }),
            );
            let saved = if worker_first {
                let (extended, saved) = tokio::join!(extend, app.send(publish));
                extended.unwrap();
                saved
            } else {
                let (saved, extended) = tokio::join!(app.send(publish), extend);
                extended.unwrap();
                saved
            };
            if saved.status == StatusCode::PRECONDITION_FAILED {
                let version = saved.json()["details"]["actual"]
                    .as_i64()
                    .unwrap()
                    .to_string();
                let retried = app
                    .send(grade(
                        &teacher,
                        &sub,
                        Some(&version),
                        &serde_json::json!({ "action": "publish", "final_score": 80 }),
                    ))
                    .await;
                assert_eq!(retried.status, StatusCode::OK, "{}", retried.text());
            } else {
                assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
            }
            let review = app
                .get_as(&teacher, &format!("/api/v2/submissions/{sub}/review"))
                .await;
            let body = review.json();
            assert_eq!(body["status"], "published", "round {round}: {body}");
            assert_eq!(body["is_late"], false, "round {round}: {body}");
            assert_eq!(body["late_penalty_pct"], 0.0, "round {round}: {body}");
            assert_eq!(
                body["final_score"], 80.0,
                "round {round} worker_first={worker_first}: {body}"
            );
        }
    }
}

/// BUG-217: an item added between an unpublish and a republish, graded on
/// an attempt that predates it, joins the breakdown as a share of 100 —
/// the raw score weights it like its siblings (10/30), not 10/110.
#[sqlx::test(migrations = "../../migrations")]
async fn item_added_after_a_republish_is_weighted_into_the_set(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) =
        quiz_with_essay(&app, &teacher, &chapter_id, serde_json::json!({})).await;
    let alice = learner(&app, "alice").await;
    let sub = submit_attempt(&app, &alice, &id, &choice_id, &essay_id).await;
    let lifecycle = format!("/api/v2/assessments/{id}/lifecycle");
    let unpublished = app
        .post_as(&teacher, &lifecycle, &serde_json::json!({ "to": "draft" }))
        .await;
    assert_eq!(unpublished.status, StatusCode::OK, "{}", unpublished.text());
    let added = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &serde_json::json!({ "title": "Late", "max_score": 10,
                                 "body": { "kind": "open_text", "prompt": "Later" } }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
    let late_id = added.json()["id"].as_str().unwrap().to_owned();
    let republished = app
        .post_as(
            &teacher,
            &lifecycle,
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(republished.status, StatusCode::OK, "{}", republished.text());
    let graded = app
        .send(grade(
            &teacher,
            &sub,
            Some("1"),
            &serde_json::json!({ "action": "publish", "item_grades": [
                { "item_id": &essay_id, "score": 10 },
                { "item_id": &late_id, "score": 5 },
            ] }),
        ))
        .await;
    assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
    let body = graded.json();
    assert_eq!(body["final_score"], 83.33, "{body}");
    let late = body["grading"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["item_id"] == late_id)
        .unwrap()
        .clone();
    assert_eq!(late["max_score"], 33.33, "{late}");
    assert_eq!(late["score"], 16.66, "{late}");
}

/// BUG-225: an item whose `max_score` was set to 0 while the quiz was
/// unpublished accepts only a 0 — a 500 on it used to be stored on the
/// item's 50-point share (final 556 %).
#[sqlx::test(migrations = "../../migrations")]
async fn zero_max_item_accepts_only_zero(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) =
        quiz_with_essay(&app, &teacher, &chapter_id, serde_json::json!({})).await;
    let alice = learner(&app, "alice").await;
    let sub = submit_attempt(&app, &alice, &id, &choice_id, &essay_id).await;
    let unpublished = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "draft" }),
        )
        .await;
    assert_eq!(unpublished.status, StatusCode::OK, "{}", unpublished.text());
    let zeroed = app
        .patch_as(
            &teacher,
            &format!("/api/v2/assessment-items/{essay_id}"),
            &serde_json::json!({ "max_score": 0 }),
        )
        .await;
    assert_eq!(zeroed.status, StatusCode::OK, "{}", zeroed.text());

    let inflated = app
        .send(grade(
            &teacher,
            &sub,
            Some("1"),
            &serde_json::json!({ "action": "save",
                                  "item_grades": [{ "item_id": &essay_id, "score": 500 }] }),
        ))
        .await;
    assert_eq!(
        inflated.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        inflated.text()
    );
    assert_eq!(inflated.json()["field_errors"][0]["field"], "item_grades");
    assert_eq!(inflated.json()["field_errors"][0]["code"], "range");
    let zero = app
        .send(grade(
            &teacher,
            &sub,
            Some("1"),
            &serde_json::json!({ "action": "save",
                                  "item_grades": [{ "item_id": &essay_id, "score": 0 }] }),
        ))
        .await;
    assert_eq!(zero.status, StatusCode::OK, "{}", zero.text());
    assert_eq!(zero.json()["final_score"], 50.0, "{}", zero.text());
}

/// BUG-226: the bulk release races a teacher's save / return on one graded
/// row. Whoever commits first wins; the other is a 412 (save) or a skipped
/// row (release) — never a `published` row with the stale ledger score
/// over a 200 save, and a returned attempt is never released.
#[sqlx::test(migrations = "../../migrations")]
async fn publish_all_racing_a_save_or_return_never_releases_the_stale_row(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) =
        quiz_with_essay(&app, &teacher, &chapter_id, serde_json::json!({})).await;
    let release_path = format!("/api/v2/assessments/{id}/publish-grades");
    let empty = serde_json::json!({});
    for round in 0..10 {
        for (action, release_first) in [
            ("save", false),
            ("save", true),
            ("return", false),
            ("return", true),
        ] {
            let who = learner(&app, &format!("l{round}{action}{release_first}")).await;
            let sub = submit_attempt(&app, &who, &id, &choice_id, &essay_id).await;
            let graded = app
                .send(grade(
                    &teacher,
                    &sub,
                    Some("1"),
                    &serde_json::json!({ "action": "save", "final_score": 57 }),
                ))
                .await;
            assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
            let body = if action == "save" {
                serde_json::json!({ "action": "save", "final_score": 80 })
            } else {
                serde_json::json!({ "action": "return", "feedback": "redo" })
            };
            let teacher_write = app.send(grade(&teacher, &sub, Some("2"), &body));
            let release = app.post_as(&teacher, &release_path, &empty);
            let (written, released) = if release_first {
                let (released, written) = tokio::join!(release, teacher_write);
                (written, released)
            } else {
                tokio::join!(teacher_write, release)
            };
            assert_eq!(released.status, StatusCode::OK, "{}", released.text());
            let review = app
                .get_as(&teacher, &format!("/api/v2/submissions/{sub}/review"))
                .await
                .json();
            let tag = format!("round {round} {action} release_first={release_first}: {review}");
            match written.status {
                StatusCode::OK => {
                    if action == "save" {
                        // Released after the save committed, or skipped: either
                        // way the save's score, never the stale 57.
                        assert!(
                            review["status"] == "graded" || review["status"] == "published",
                            "{tag}"
                        );
                        assert_eq!(review["final_score"], 80.0, "{tag}");
                    } else {
                        assert_eq!(review["status"], "returned", "{tag}");
                    }
                }
                StatusCode::PRECONDITION_FAILED => {
                    assert_eq!(review["status"], "published", "{tag}");
                    assert_eq!(review["final_score"], 57.0, "{tag}");
                }
                other => panic!("{other} {}: {tag}", written.text()),
            }
            // A returned attempt stays out of the release for good.
            let again = app.post_as(&teacher, &release_path, &empty).await;
            assert_eq!(again.status, StatusCode::OK, "{}", again.text());
            let after = app
                .get_as(&teacher, &format!("/api/v2/submissions/{sub}/review"))
                .await
                .json();
            if action == "return" && written.status == StatusCode::OK {
                assert_eq!(after["status"], "returned", "{tag}");
            }
        }
    }
}

/// BUG-227: the client hangs up right after a publish (single or bulk)
/// committed its row and ledger. The SSE fan-out, the progress projection
/// and the analytics hook still run — the learner sees the score, not a
/// hidden grade forever.
#[sqlx::test(migrations = "../../migrations")]
async fn publish_dropped_after_the_commit_still_projects(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, choice_id, essay_id) =
        quiz_with_essay(&app, &teacher, &chapter_id, serde_json::json!({})).await;
    let state_path = format!("/api/v2/courses/{course_id}/learner-state");
    let row_published = async |sub: &str| {
        sqlx::query_scalar::<_, String>("SELECT status FROM submissions WHERE id = $1")
            .bind(uuid::Uuid::parse_str(sub).unwrap())
            .fetch_one(&app.pool)
            .await
            .unwrap()
            == "published"
    };
    let learner_score = async |who: &MintedSession| {
        app.get_as(who, &state_path).await.json()["outline"][0]["activities"][0]["score"].as_f64()
    };

    let alice = learner(&app, "alice").await;
    let single = submit_attempt(&app, &alice, &id, &choice_id, &essay_id).await;
    drop_request_when(
        app.send(grade(
            &teacher,
            &single,
            Some("1"),
            &serde_json::json!({ "action": "publish", "final_score": 80 }),
        )),
        async || row_published(&single).await,
        |response| assert_eq!(response.status, StatusCode::OK, "{}", response.text()),
    )
    .await;
    wait_until("the dropped publish never projected", async || {
        learner_score(&alice).await == Some(80.0)
    })
    .await;

    let bob = learner(&app, "bob").await;
    let bulk = submit_attempt(&app, &bob, &id, &choice_id, &essay_id).await;
    let graded = app
        .send(grade(
            &teacher,
            &bulk,
            Some("1"),
            &serde_json::json!({ "action": "save", "final_score": 57 }),
        ))
        .await;
    assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
    drop_request_when(
        app.post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/publish-grades"),
            &serde_json::json!({}),
        ),
        async || row_published(&bulk).await,
        |response| assert_eq!(response.status, StatusCode::OK, "{}", response.text()),
    )
    .await;
    wait_until("the dropped bulk release never projected", async || {
        learner_score(&bob).await == Some(57.0)
    })
    .await;
    let history = app
        .get_as(
            &teacher,
            &format!("/api/v2/submissions/{bulk}/grading-history"),
        )
        .await
        .json();
    assert!(
        history
            .as_array()
            .unwrap()
            .iter()
            .any(|e| !e["published_at_unix"].is_null()),
        "{history}"
    );
}
