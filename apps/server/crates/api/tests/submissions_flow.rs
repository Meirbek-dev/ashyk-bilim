//! Learner attempt flows: start → draft (If-Match lock, throttle) →
//! submit (idempotent replay, auto-grade, immediate vs batch release,
//! manual review), the attempt cap, the timer sweep, anti-cheat zeroing.
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

/// Public course + chapter; returns (course_id, chapter_id).
async fn public_course(app: &TestApp, teacher: &MintedSession) -> (String, String) {
    let course = app
        .post_as(
            teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Rust 101" }),
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

fn choice_item(prompt: &str) -> serde_json::Value {
    serde_json::json!({
        "title": prompt,
        "max_score": 10,
        "body": {
            "kind": "choice",
            "prompt": prompt,
            "options": [
                { "id": "a", "text": "yes", "is_correct": true },
                { "id": "b", "text": "no", "is_correct": false }
            ]
        }
    })
}

fn open_text_item(prompt: &str) -> serde_json::Value {
    serde_json::json!({
        "title": prompt,
        "max_score": 10,
        "body": { "kind": "open_text", "prompt": prompt }
    })
}

/// Create → items → policy patch → publish; returns (assessment_id, item_ids).
async fn published_assessment(
    app: &TestApp,
    teacher: &MintedSession,
    chapter_id: &str,
    kind: &str,
    policy_patch: serde_json::Value,
    items: &[serde_json::Value],
) -> (String, Vec<String>) {
    let created = app
        .post_as(
            teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": kind, "title": "Assessment" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let mut item_ids = Vec::new();
    for item in items {
        let res = app
            .post_as(teacher, &format!("/api/v2/assessments/{id}/items"), item)
            .await;
        assert_eq!(res.status, StatusCode::CREATED, "{}", res.text());
        item_ids.push(res.json()["id"].as_str().unwrap().to_owned());
    }
    let mut policy = created.json()["policy"].clone();
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
    (id, item_ids)
}

fn patch_draft(
    session: &MintedSession,
    id: &str,
    if_match: Option<&str>,
    body: &serde_json::Value,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method("PATCH")
        .uri(format!("/api/v2/submissions/{id}/draft"))
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, &session.cookie);
    if let Some(version) = if_match {
        builder = builder.header(header::IF_MATCH, version);
    }
    builder.body(Body::from(body.to_string())).unwrap()
}

fn submit(
    session: &MintedSession,
    id: &str,
    idempotency_key: Option<&str>,
    body: &serde_json::Value,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method("POST")
        .uri(format!("/api/v2/submissions/{id}/submit"))
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, &session.cookie);
    if let Some(key) = idempotency_key {
        builder = builder.header("idempotency-key", key);
    }
    builder.body(Body::from(body.to_string())).unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn quiz_attempt_draft_lock_submit_replay_and_attempt_cap(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "max_attempts": 2 }),
        &[choice_item("First?"), choice_item("Second?")],
    )
    .await;
    let alice = learner(&app, "alice").await;

    // Fresh: may start, nothing open.
    let state = app
        .get_as(&alice, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(state.status, StatusCode::OK, "{}", state.text());
    assert_eq!(state.json()["can_start"], true);
    assert_eq!(state.json()["can_continue"], false);
    assert_eq!(state.json()["attempts_used"], 0);
    assert_eq!(state.json()["attempts_remaining"], 2);
    let no_draft = app
        .get_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions/draft"),
        )
        .await;
    assert_eq!(no_draft.status, StatusCode::NOT_FOUND);

    // Start opens a draft; a second start returns the same one (200).
    let started = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(started.status, StatusCode::CREATED, "{}", started.text());
    let draft = started.json();
    let sub_id = draft["id"].as_str().unwrap().to_owned();
    assert_eq!(draft["status"], "draft");
    assert_eq!(draft["attempt_number"], 1);
    assert_eq!(draft["draft_version"], 1);
    assert_eq!(draft["total_items"], 2);
    assert_eq!(draft["answered_count"], 0);
    assert_eq!(draft["release_state"], "hidden");
    assert_eq!(started.headers[header::ETAG], "\"1\"");
    let again = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(again.status, StatusCode::OK);
    assert_eq!(again.json()["id"], sub_id.as_str());
    let state = app
        .get_as(&alice, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(state.json()["can_start"], false);
    assert_eq!(state.json()["can_continue"], true);
    assert_eq!(state.json()["draft_id"], sub_id.as_str());

    // Draft saves need If-Match; the lock bumps; stale versions are 409.
    let missing = app
        .send(patch_draft(
            &alice,
            &sub_id,
            None,
            &serde_json::json!({ "answers": {} }),
        ))
        .await;
    assert_eq!(missing.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(missing.json()["field_errors"][0]["field"], "If-Match");
    let saved = app
        .send(patch_draft(
            &alice,
            &sub_id,
            Some("\"1\""),
            &serde_json::json!({ "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } } }),
        ))
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    assert_eq!(saved.json()["draft_version"], 2);
    assert_eq!(saved.json()["answered_count"], 1);
    assert_eq!(saved.headers[header::ETAG], "\"2\"");
    let stale = app
        .send(patch_draft(
            &alice,
            &sub_id,
            Some("1"),
            &serde_json::json!({ "answers": {} }),
        ))
        .await;
    assert_eq!(stale.status, StatusCode::CONFLICT, "{}", stale.text());
    assert_eq!(
        stale.json()["details"],
        serde_json::json!({ "expected": 1, "actual": 2 })
    );
    // Autosave is throttled: a second save inside the window is 429.
    let throttled = app
        .send(patch_draft(
            &alice,
            &sub_id,
            Some("2"),
            &serde_json::json!({ "answers": {} }),
        ))
        .await;
    assert_eq!(throttled.status, StatusCode::TOO_MANY_REQUESTS);
    // Unknown items and wrong answer kinds are validation errors.
    let bogus = app
        .send(patch_draft(
            &alice,
            &sub_id,
            Some("2"),
            &serde_json::json!({ "answers": {
                "00000000-0000-7000-8000-000000000000": { "kind": "choice", "selected": [] },
                &items[1]: { "kind": "open_text", "text": "nope" },
            } }),
        ))
        .await;
    assert_eq!(
        bogus.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        bogus.text()
    );
    assert_eq!(bogus.json()["field_errors"].as_array().unwrap().len(), 2);

    // Nobody else can see or touch the draft.
    let bob = learner(&app, "bob").await;
    let hidden = app
        .get_as(&bob, &format!("/api/v2/submissions/{sub_id}"))
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);

    // Submit with a last patch (second item wrong) under an Idempotency-Key:
    // immediate release → published and visible, 1 of 2 → 50.
    let body = serde_json::json!({
        "answers": { &items[1]: { "kind": "choice", "selected": ["b"] } },
    });
    let submitted = app.send(submit(&alice, &sub_id, Some("k-1"), &body)).await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    let graded = submitted.json();
    assert_eq!(graded["status"], "published");
    assert_eq!(graded["release_state"], "visible");
    assert_eq!(graded["auto_score"], 50.0);
    assert_eq!(graded["final_score"], 50.0);
    assert_eq!(graded["is_late"], false);
    assert_eq!(graded["late_penalty_pct"], 0.0);
    assert_eq!(graded["grading"]["items"][0]["correct"], true);
    assert_eq!(graded["grading"]["items"][1]["correct"], false);
    assert_eq!(graded["grading"]["items"][1]["feedback"], "Incorrect");
    assert!(graded["submitted_at_unix"].is_i64());
    assert!(graded["graded_at_unix"].is_i64());
    // Replay: same key + body → the stored response; different body → 422;
    // no key on an already-submitted attempt → 409.
    let replay = app.send(submit(&alice, &sub_id, Some("k-1"), &body)).await;
    assert_eq!(replay.status, StatusCode::OK);
    assert_eq!(replay.json(), graded);
    let reused = app
        .send(submit(
            &alice,
            &sub_id,
            Some("k-1"),
            &serde_json::json!({ "violation_count": 1 }),
        ))
        .await;
    assert_eq!(reused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(reused.json()["field_errors"][0]["code"], "reused");
    let twice = app
        .send(submit(&alice, &sub_id, None, &serde_json::json!({})))
        .await;
    assert_eq!(twice.status, StatusCode::CONFLICT);

    // The ledger holds one auto entry, published.
    let (entries, published): (i64, i64) = sqlx::query_as(
        "SELECT count(*), count(published_at) FROM grading_entries WHERE submission_id = $1",
    )
    .bind(uuid::Uuid::parse_str(&sub_id).unwrap())
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!((entries, published), (1, 1));

    // Second attempt allowed, then the cap bites.
    let state = app
        .get_as(&alice, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(state.json()["attempts_used"], 1);
    assert_eq!(state.json()["attempts_remaining"], 1);
    assert_eq!(state.json()["can_start"], true);
    let second = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(second.status, StatusCode::CREATED);
    assert_eq!(second.json()["attempt_number"], 2);
    let second_id = second.json()["id"].as_str().unwrap().to_owned();
    let done = app
        .send(submit(&alice, &second_id, None, &serde_json::json!({})))
        .await;
    assert_eq!(done.status, StatusCode::OK, "{}", done.text());
    assert_eq!(done.json()["auto_score"], 0.0);
    let state = app
        .get_as(&alice, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(state.json()["can_start"], false);
    assert_eq!(state.json()["attempts_remaining"], 0);
    assert_eq!(
        state.json()["disabled_reasons"],
        serde_json::json!(["MAX_ATTEMPTS_REACHED"])
    );
    let refused = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN);
    assert_eq!(
        refused.json()["detail"],
        "cannot start: MAX_ATTEMPTS_REACHED",
        "UX-038: same vocabulary as disabled_reasons"
    );
    let mine = app
        .get_as(&alice, &format!("/api/v2/assessments/{id}/submissions/me"))
        .await;
    let attempts: Vec<i64> = mine
        .json()
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["attempt_number"].as_i64().unwrap())
        .collect();
    assert_eq!(attempts, [2, 1], "newest first");

    // The teacher may preview without a submit grant and never hits the cap.
    let preview = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(preview.json()["is_teacher_preview"], true);
    assert_eq!(preview.json()["can_start"], true);
    assert!(preview.json()["attempts_remaining"].is_null());
}

/// BUG-112: `review_visibility` is enforced on the wire for the owner's
/// read — `score_only` strips correctness and the correct answers,
/// `none` hides the item breakdown; scores stay visible in both.
#[sqlx::test(migrations = "../../migrations")]
async fn review_visibility_redacts_the_learner_breakdown(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let alice = learner(&app, "alice").await;
    for (visibility, items_expected) in [("score_only", true), ("none", false)] {
        let (id, items) = published_assessment(
            &app,
            &teacher,
            &chapter_id,
            "quiz",
            serde_json::json!({ "review_visibility": visibility }),
            &[choice_item("First?")],
        )
        .await;
        let started = app
            .post_as(
                &alice,
                &format!("/api/v2/assessments/{id}/submissions"),
                &serde_json::json!({}),
            )
            .await;
        let sub_id = started.json()["id"].as_str().unwrap().to_owned();
        let submitted = app
            .send(submit(
                &alice,
                &sub_id,
                None,
                &serde_json::json!({ "answers": { &items[0]: { "kind": "choice", "selected": ["b"] } } }),
            ))
            .await;
        assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
        let mine = app
            .get_as(&alice, &format!("/api/v2/submissions/{sub_id}"))
            .await;
        let body = mine.json();
        assert_eq!(body["release_state"], "visible", "{visibility}");
        assert_eq!(body["final_score"], 0.0, "{visibility}: the score stays");
        if items_expected {
            let item = &body["grading"]["items"][0];
            assert_eq!(item["score"], 0.0);
            assert!(item["correct"].is_null(), "{visibility}: {item}");
            assert!(item["correct_answer"].is_null(), "{visibility}: {item}");
            assert!(item.get("feedback_code").is_none(), "{visibility}: {item}");
            assert_eq!(item["feedback"], "", "{visibility}: {item}");
        } else {
            assert!(
                body["grading"].is_null(),
                "{visibility}: {}",
                body["grading"]
            );
        }
        // The grader's read is untouched.
        let graded = app
            .get_as(&teacher, &format!("/api/v2/submissions/{sub_id}/review"))
            .await;
        assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
        assert_eq!(
            graded.json()["grading"]["items"][0]["correct_answer"],
            serde_json::json!(["a"]),
            "{visibility}"
        );
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn batch_release_hides_scores_and_open_text_waits_for_review(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let alice = learner(&app, "alice").await;

    // Batch release: graded but hidden until the teacher releases.
    let (batch_id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "grade_release_mode": "batch" }),
        &[choice_item("Q1")],
    )
    .await;
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{batch_id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .send(submit(
            &alice,
            &sub_id,
            None,
            &serde_json::json!({ "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } } }),
        ))
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    assert_eq!(submitted.json()["status"], "graded");
    assert_eq!(submitted.json()["release_state"], "awaiting_release");
    assert!(submitted.json()["auto_score"].is_null());
    assert!(submitted.json()["final_score"].is_null());
    assert!(submitted.json()["grading"].is_null());
    assert!(submitted.json()["graded_at_unix"].is_null());
    let stored: (Option<f64>, Option<f64>) =
        sqlx::query_as("SELECT auto_score, final_score FROM submissions WHERE id = $1")
            .bind(uuid::Uuid::parse_str(&sub_id).unwrap())
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(stored, (Some(100.0), Some(100.0)), "graded, just not shown");

    // Open text → manual review: pending, nothing graded, no ledger entry.
    let (exam_id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "exam",
        serde_json::json!({ "time_limit_seconds": null, "fullscreen_required": false }),
        &[choice_item("Q1"), open_text_item("Essay")],
    )
    .await;
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{exam_id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .send(submit(
            &alice,
            &sub_id,
            None,
            &serde_json::json!({ "answers": {
                &items[0]: { "kind": "choice", "selected": ["a"] },
                &items[1]: { "kind": "open_text", "text": "  Because.  " },
            } }),
        ))
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    assert_eq!(submitted.json()["status"], "pending");
    assert_eq!(submitted.json()["release_state"], "hidden");
    assert_eq!(submitted.json()["answers"][&items[1]]["text"], "Because.");
    let (status, graded_at_set, entries): (String, bool, i64) = sqlx::query_as(
        "SELECT s.status, s.graded_at IS NOT NULL,
                (SELECT count(*) FROM grading_entries g WHERE g.submission_id = s.id)
         FROM submissions s WHERE s.id = $1",
    )
    .bind(uuid::Uuid::parse_str(&sub_id).unwrap())
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(status, "pending");
    assert!(!graded_at_set);
    assert_eq!(entries, 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn timer_sweep_auto_submits_expired_drafts(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "time_limit_seconds": 60 }),
        &[choice_item("Q1")],
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
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let remaining = draft.json()["time_remaining_seconds"].as_i64().unwrap();
    assert!(
        (50..=65).contains(&remaining),
        "{remaining} (clock skew between app and DB is tolerated)"
    );
    let saved = app
        .send(patch_draft(
            &alice,
            &sub_id,
            Some("1"),
            &serde_json::json!({ "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } } }),
        ))
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());

    // Time flies (the clock is the DB's started_at).
    sqlx::query("UPDATE submissions SET started_at = now() - interval '3 minutes' WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&sub_id).unwrap())
        .execute(&app.pool)
        .await
        .unwrap();
    let state = app
        .get_as(&alice, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(state.json()["can_continue"], false);
    assert_eq!(
        state.json()["disabled_reasons"],
        serde_json::json!(["TIME_LIMIT_EXPIRED"])
    );
    let late_save = app
        .send(patch_draft(
            &alice,
            &sub_id,
            Some("2"),
            &serde_json::json!({ "answers": {} }),
        ))
        .await;
    assert_eq!(late_save.status, StatusCode::FORBIDDEN);
    let late_submit = app
        .send(submit(&alice, &sub_id, None, &serde_json::json!({})))
        .await;
    assert_eq!(
        late_submit.status,
        StatusCode::FORBIDDEN,
        "past the grace period"
    );

    // The sweep submits what was saved; a second sweep finds nothing.
    let swept =
        ab_domain::grading::SubmissionsService::sweep_expired_drafts(&app.code_runner(), None, 10)
            .await
            .unwrap();
    assert_eq!(swept, 1);
    let mine = app
        .get_as(&alice, &format!("/api/v2/submissions/{sub_id}"))
        .await;
    assert_eq!(mine.json()["status"], "published");
    assert_eq!(mine.json()["auto_score"], 100.0);
    assert_eq!(mine.json()["auto_submit_reason"], "time_expired");
    assert!(mine.json()["time_remaining_seconds"].is_null());
    let (reason, auto_submitted): (Option<String>, bool) = sqlx::query_as(
        "SELECT auto_submit_reason, auto_submitted_at IS NOT NULL FROM submissions WHERE id = $1",
    )
    .bind(uuid::Uuid::parse_str(&sub_id).unwrap())
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(reason.as_deref(), Some("time_expired"));
    assert!(auto_submitted);
    let again =
        ab_domain::grading::SubmissionsService::sweep_expired_drafts(&app.code_runner(), None, 10)
            .await
            .unwrap();
    assert_eq!(again, 0);
    let state = app
        .get_as(&alice, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(
        state.json()["can_start"],
        true,
        "unlimited attempts, timer reset"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn violations_past_the_threshold_zero_the_attempt(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "tab_switch_detection": true, "violation_threshold": 2 }),
        &[choice_item("Q1")],
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
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();

    let first = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub_id}/violations"),
            &serde_json::json!({ "kind": "tab_switch" }),
        )
        .await;
    assert_eq!(first.status, StatusCode::OK, "{}", first.text());
    assert_eq!(first.json()["violation_count"], 1);
    assert_eq!(first.json()["threshold"], 2);
    assert_eq!(first.json()["exceeded"], false);
    let second = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub_id}/violations"),
            &serde_json::json!({ "kind": "tab_switch", "detail": "blur 4s" }),
        )
        .await;
    assert_eq!(second.json()["exceeded"], true);

    // A perfect answer still scores zero; the client can't talk it down.
    let submitted = app
        .send(submit(
            &alice,
            &sub_id,
            None,
            &serde_json::json!({
                "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } },
                "violation_count": 0,
            }),
        ))
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    assert_eq!(submitted.json()["status"], "published");
    assert_eq!(submitted.json()["auto_score"], 0.0);
    assert_eq!(submitted.json()["final_score"], 0.0);
    assert_eq!(submitted.json()["violation_count"], 2);
    let (reason, events): (Option<String>, serde_json::Value) =
        sqlx::query_as("SELECT auto_submit_reason, violations FROM submissions WHERE id = $1")
            .bind(uuid::Uuid::parse_str(&sub_id).unwrap())
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(reason.as_deref(), Some("integrity_violation"));
    assert_eq!(events.as_array().unwrap().len(), 2);
    assert_eq!(events[1]["detail"], "blur 4s");

    // With every detector off the count is informational only.
    let (calm_id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "violation_threshold": 1 }),
        &[choice_item("Q1")],
    )
    .await;
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{calm_id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .send(submit(
            &alice,
            &sub_id,
            None,
            &serde_json::json!({
                "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } },
                "violation_count": 5,
            }),
        ))
        .await;
    assert_eq!(submitted.json()["final_score"], 100.0);
    assert_eq!(submitted.json()["violation_count"], 5);
}

/// Submit guards: a stale `If-Match` is 409 with `{expected, actual}`, two
/// concurrent submits of one draft leave exactly one winner (the loser is a
/// 409 — CAS lost or already submitted), the fourth submit inside the window
/// is 429, and a draft opened before the deadline is 403 `PAST_DUE` at submit
/// once the deadline passes with `allow_late = false` (critic12 branch list).
#[sqlx::test(migrations = "../../migrations")]
async fn submit_guards_stale_version_races_rate_and_deadline(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "allow_late": false }),
        &[choice_item("Q1")],
    )
    .await;
    let answer = serde_json::json!({
        "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } }
    });

    // Alice: draft at version 2, submit with version 1 → 409 conflict.
    let alice = learner(&app, "alice").await;
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let saved = app
        .send(patch_draft(&alice, &sub_id, Some("\"1\""), &answer))
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    let stale = app
        .send(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v2/submissions/{sub_id}/submit"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &alice.cookie)
                .header(header::IF_MATCH, "\"1\"")
                .body(Body::from(answer.to_string()))
                .unwrap(),
        )
        .await;
    assert_eq!(stale.status, StatusCode::CONFLICT, "{}", stale.text());
    assert_eq!(stale.json()["code"], "conflict");
    assert_eq!(stale.json()["details"]["expected"], 1);
    assert_eq!(stale.json()["details"]["actual"], 2);

    // Two submits race: one wins, the other is a 409 (never a double grade).
    let (first, second) = tokio::join!(
        app.send(submit(&alice, &sub_id, None, &answer)),
        app.send(submit(&alice, &sub_id, None, &answer)),
    );
    let mut statuses = [first.status, second.status];
    statuses.sort();
    assert_eq!(
        statuses,
        [StatusCode::OK, StatusCode::CONFLICT],
        "{} / {}",
        first.text(),
        second.text()
    );
    let published: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM submissions WHERE id = $1 AND status = 'published'",
    )
    .bind(uuid::Uuid::parse_str(&sub_id).unwrap())
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(published, 1);

    // UX-111: the limiter runs after validation — a submit on an already
    // submitted attempt is a 409, never a 429.
    let again = app.send(submit(&alice, &sub_id, None, &answer)).await;
    assert_eq!(again.status, StatusCode::CONFLICT, "{}", again.text());

    // Bob opened his draft in time; the deadline passes; no late work → 403 PAST_DUE.
    let bob = learner(&app, "bob").await;
    let draft = app
        .post_as(
            &bob,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let bob_sub = draft.json()["id"].as_str().unwrap().to_owned();
    sqlx::query("UPDATE assessments SET due_at = now() - interval '1 minute' WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&id).unwrap())
        .execute(&app.pool)
        .await
        .unwrap();
    let late = app.send(submit(&bob, &bob_sub, None, &answer)).await;
    assert_eq!(late.status, StatusCode::FORBIDDEN, "{}", late.text());
    assert_eq!(late.json()["detail"], "PAST_DUE");
    let still_draft: String = sqlx::query_scalar("SELECT status FROM submissions WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&bob_sub).unwrap())
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(still_draft, "draft");
}

/// UX-111: only submits that pass validation spend the 3/10 s budget —
/// four 422s must not lock the learner out of the real submit.
#[sqlx::test(migrations = "../../migrations")]
async fn submit_limiter_counts_only_accepted_submits(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "max_attempts": 10 }),
        &[choice_item("Q1")],
    )
    .await;
    let alice = learner(&app, "alice").await;
    let ok = serde_json::json!({
        "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } }
    });
    let bogus = serde_json::json!({
        "answers": { "00000000-0000-7000-8000-000000000000": { "kind": "choice", "selected": [] } }
    });

    let start = async |app: &TestApp| {
        let draft = app
            .post_as(
                &alice,
                &format!("/api/v2/assessments/{id}/submissions"),
                &serde_json::json!({}),
            )
            .await;
        assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
        draft.json()["id"].as_str().unwrap().to_owned()
    };

    let sub_id = start(&app).await;
    for _ in 0..4 {
        let rejected = app.send(submit(&alice, &sub_id, None, &bogus)).await;
        assert_eq!(
            rejected.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{}",
            rejected.text()
        );
    }
    // Three accepted submits go through; the fourth is the one that is 429.
    let accepted = app.send(submit(&alice, &sub_id, None, &ok)).await;
    assert_eq!(accepted.status, StatusCode::OK, "{}", accepted.text());
    for _ in 0..2 {
        let sub_id = start(&app).await;
        let accepted = app.send(submit(&alice, &sub_id, None, &ok)).await;
        assert_eq!(accepted.status, StatusCode::OK, "{}", accepted.text());
    }
    let sub_id = start(&app).await;
    let spam = app.send(submit(&alice, &sub_id, None, &ok)).await;
    assert_eq!(
        spam.status,
        StatusCode::TOO_MANY_REQUESTS,
        "{}",
        spam.text()
    );
    assert_eq!(spam.json()["code"], "rate-limited");
    let retry_after: u64 = spam.headers["retry-after"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!((1..=10).contains(&retry_after), "{retry_after}");
}

/// BUG-169: a perfect attempt is exactly 100 whatever the item count
/// (6 equal items used to sum to 100.02, 3 to 99.99) and passes at
/// `passing_score: 100`.
#[sqlx::test(migrations = "../../migrations")]
async fn perfect_attempt_scores_exactly_100_and_passes(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let alice = learner(&app, "alice").await;
    for n in [6, 3] {
        let items: Vec<serde_json::Value> = (0..n).map(|i| choice_item(&format!("Q{i}"))).collect();
        let (id, item_ids) = published_assessment(
            &app,
            &teacher,
            &chapter_id,
            "quiz",
            serde_json::json!({ "passing_score": 100 }),
            &items,
        )
        .await;
        let draft = app
            .post_as(
                &alice,
                &format!("/api/v2/assessments/{id}/submissions"),
                &serde_json::json!({}),
            )
            .await;
        assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
        let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
        let mut answers = serde_json::Map::new();
        for item in &item_ids {
            answers.insert(
                item.clone(),
                serde_json::json!({ "kind": "choice", "selected": ["a"] }),
            );
        }
        let submitted = app
            .send(submit(
                &alice,
                &sub_id,
                None,
                &serde_json::json!({ "answers": answers }),
            ))
            .await;
        assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
        assert_eq!(submitted.json()["auto_score"], 100.0, "{n} items");
        assert_eq!(submitted.json()["final_score"], 100.0, "{n} items");
        let passed: Option<bool> = sqlx::query_scalar(
            "SELECT passed FROM activity_progress WHERE latest_submission_id = $1",
        )
        .bind(uuid::Uuid::parse_str(&sub_id).unwrap())
        .fetch_one(&app.pool)
        .await
        .unwrap();
        assert_eq!(passed, Some(true), "{n} items");
    }
}

/// BUG-204: the reservation made by an `Idempotency-Key` submit must not be
/// stranded by the client. A held key answers 409 `idempotency-in-progress`
/// after the wait; a stale one (older than 30 s) is taken over and the
/// action runs; a failed action releases the key; and a request whose
/// connection drops after the reservation still runs to completion — the
/// retry with the same key replays the stored 200.
#[sqlx::test(migrations = "../../migrations")]
async fn keyed_submit_in_progress_stale_release_and_dropped_connection(pool: PgPool) {
    use ab_db::submissions::{IDEMPOTENT_IN_PROGRESS, reserve_idempotent};
    use std::time::Duration;

    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "max_attempts": 3 }),
        &[choice_item("First?")],
    )
    .await;
    let alice = learner(&app, "alice").await;
    let body = serde_json::json!({
        "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } },
    });
    let hash = ab_api::extract::sha256_hex(body.to_string().as_bytes());
    let start = async |app: &TestApp| {
        let started = app
            .post_as(
                &alice,
                &format!("/api/v2/assessments/{id}/submissions"),
                &serde_json::json!({}),
            )
            .await;
        assert_eq!(started.status, StatusCode::CREATED, "{}", started.text());
        started.json()["id"].as_str().unwrap().to_owned()
    };
    let key_row = async |app: &TestApp, key: &str| -> Option<i32> {
        sqlx::query_scalar("SELECT status_code FROM idempotency_keys WHERE user_id = $1 AND key = $2")
            .bind(alice.user_id.0)
            .bind(key)
            .fetch_optional(&app.pool)
            .await
            .unwrap()
    };

    // Attempt 1: a key someone else holds → 409 after the wait; once the
    // reservation is stale the next caller takes it over and submits.
    let sub_id = start(&app).await;
    let held = format!("submit:{sub_id}:k-held");
    assert!(reserve_idempotent(&app.pool, alice.user_id, &held, &hash).await.unwrap());
    let waited = tokio::time::Instant::now();
    let busy = app.send(submit(&alice, &sub_id, Some("k-held"), &body)).await;
    assert_eq!(busy.status, StatusCode::CONFLICT, "{}", busy.text());
    assert_eq!(busy.json()["code"], "idempotency-in-progress");
    assert!(waited.elapsed() >= Duration::from_secs(4));
    sqlx::query("UPDATE idempotency_keys SET created_at = now() - interval '31 seconds' WHERE key = $1")
        .bind(&held)
        .execute(&app.pool)
        .await
        .unwrap();
    let taken = app.send(submit(&alice, &sub_id, Some("k-held"), &body)).await;
    assert_eq!(taken.status, StatusCode::OK, "{}", taken.text());
    assert_eq!(taken.json()["status"], "published");
    assert_eq!(key_row(&app, &held).await, Some(200));

    // Attempt 2: a failed action (stale If-Match → 409) releases the key;
    // the same key + body then runs and lands.
    let sub_id = start(&app).await;
    let mut stale = submit(&alice, &sub_id, Some("k-err"), &body);
    stale.headers_mut().insert(header::IF_MATCH, "\"99\"".parse().unwrap());
    let failed = app.send(stale).await;
    assert_eq!(failed.status, StatusCode::CONFLICT, "{}", failed.text());
    assert_eq!(key_row(&app, &format!("submit:{sub_id}:k-err")).await, None);
    let retried = app.send(submit(&alice, &sub_id, Some("k-err"), &body)).await;
    assert_eq!(retried.status, StatusCode::OK, "{}", retried.text());

    // Attempt 3: the client drops the connection right after the key is
    // reserved (the handler future is dropped). The action still completes
    // and the retry replays the stored reply instead of 409 / re-running.
    let sub_id = start(&app).await;
    let dropped = format!("submit:{sub_id}:k-drop");
    {
        let mut request = std::pin::pin!(app.send(submit(&alice, &sub_id, Some("k-drop"), &body)));
        loop {
            tokio::select! {
                biased;
                _ = tokio::time::sleep(Duration::from_micros(200)) => {
                    if key_row(&app, &dropped).await.is_some() { break; }
                }
                response = &mut request => {
                    assert_eq!(response.status, StatusCode::OK, "{}", response.text());
                    break;
                }
            }
        }
        // `request` dropped here — mid-flight when the row was seen first.
    }
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    while key_row(&app, &dropped).await == Some(IDEMPOTENT_IN_PROGRESS) {
        assert!(tokio::time::Instant::now() < deadline, "reservation stranded");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert_eq!(key_row(&app, &dropped).await, Some(200));
    let replay = app.send(submit(&alice, &sub_id, Some("k-drop"), &body)).await;
    assert_eq!(replay.status, StatusCode::OK, "{}", replay.text());
    assert_eq!(replay.json()["status"], "published");
    let mine = app
        .get_as(&alice, &format!("/api/v2/submissions/{sub_id}"))
        .await;
    assert_eq!(mine.json()["status"], "published");
}
