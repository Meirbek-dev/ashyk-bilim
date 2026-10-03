//! Learner attempt flows: start → draft (If-Match lock, throttle) →
//! submit (idempotent replay, auto-grade, immediate vs batch release,
//! manual review), the attempt cap, the timer sweep, anti-cheat zeroing.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::{MintedSession, TestApp, wait_until};
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
    // `Retry-After` is the live 5 s window, not the generic minute.
    let retry: u64 = throttled.headers[header::RETRY_AFTER]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!((1..=5).contains(&retry), "{retry}");
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
/// read - `score_only` strips correctness and the correct answers,
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

/// BUG-326: the grace period extends the timer - the sweep waits for it
/// and a submit past the limit but inside the grace is accepted.
#[sqlx::test(migrations = "../../migrations")]
async fn grace_period_extends_the_timer_for_submit_and_sweep(pool: PgPool) {
    async fn start_aged(app: &TestApp, who: &MintedSession, id: &str, secs: f64) -> String {
        let draft = app
            .post_as(
                who,
                &format!("/api/v2/assessments/{id}/submissions"),
                &serde_json::json!({}),
            )
            .await;
        assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
        let sub = draft.json()["id"].as_str().unwrap().to_owned();
        sqlx::query(
            "UPDATE submissions SET started_at = now() - make_interval(secs => $2) WHERE id = $1",
        )
        .bind(uuid::Uuid::parse_str(&sub).unwrap())
        .bind(secs)
        .execute(&app.pool)
        .await
        .unwrap();
        sub
    }
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "time_limit_seconds": 60, "grace_period_minutes": 1 }),
        &[choice_item("Q1")],
    )
    .await;
    let alice = learner(&app, "alice").await;
    let answer =
        serde_json::json!({ "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } } });
    let runner = app.code_runner();
    let sweep = || ab_domain::grading::SubmissionsService::sweep_expired_drafts(&runner, None, 10);

    // 90 s in: past limit + network slack, inside the 1-min grace.
    let first = start_aged(&app, &alice, &id, 90.0).await;
    assert_eq!(
        sweep().await.unwrap(),
        0,
        "the sweep waits for the grace period"
    );
    let state = app
        .get_as(&alice, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(state.json()["can_continue"], true, "{}", state.text());
    let done = app.send(submit(&alice, &first, None, &answer)).await;
    assert_eq!(done.status, StatusCode::OK, "{}", done.text());
    assert!(done.json()["auto_submit_reason"].is_null());

    // Past limit + grace: the sweep hands it in.
    let second = start_aged(&app, &alice, &id, 125.0).await;
    assert_eq!(sweep().await.unwrap(), 1);
    let mine = app
        .get_as(&alice, &format!("/api/v2/submissions/{second}"))
        .await;
    assert_eq!(mine.json()["auto_submit_reason"], "time_expired");
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
/// 409 - CAS lost or already submitted), the fourth submit inside the window
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

    // UX-111: the limiter runs after validation - a submit on an already
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
    // BUG-290: the draft is frozen too - the sweep scores only what was
    // saved before the deadline.
    let late_save = app
        .send(patch_draft(&bob, &bob_sub, Some("\"1\""), &answer))
        .await;
    assert_eq!(
        late_save.status,
        StatusCode::FORBIDDEN,
        "{}",
        late_save.text()
    );
    assert_eq!(late_save.json()["detail"], "PAST_DUE");
    let late = app.send(submit(&bob, &bob_sub, None, &answer)).await;
    assert_eq!(late.status, StatusCode::FORBIDDEN, "{}", late.text());
    assert_eq!(late.json()["detail"], "PAST_DUE");
    let still_draft: String = sqlx::query_scalar("SELECT status FROM submissions WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&bob_sub).unwrap())
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(still_draft, "draft");

    // BUG-278: the author's preview obeys only what attempt-state promises -
    // past due and past its time limit, it still opens, saves and finishes.
    let state = app
        .get_as(&teacher, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(state.json()["is_teacher_preview"], true);
    assert_eq!(state.json()["can_start"], true, "{}", state.text());
    let draft = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let preview = draft.json()["id"].as_str().unwrap().to_owned();
    sqlx::query("UPDATE assessments SET time_limit_seconds = 60 WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&id).unwrap())
        .execute(&app.pool)
        .await
        .unwrap();
    sqlx::query("UPDATE submissions SET started_at = now() - interval '10 minutes' WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&preview).unwrap())
        .execute(&app.pool)
        .await
        .unwrap();
    let saved = app
        .send(patch_draft(&teacher, &preview, Some("\"1\""), &answer))
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    let done = app.send(submit(&teacher, &preview, None, &answer)).await;
    assert_eq!(done.status, StatusCode::OK, "{}", done.text());
    // BUG-284: a waived penalty is not late (one rule with the overrides).
    assert_eq!(done.json()["is_late"], false);
    assert_eq!(done.json()["late_penalty_pct"], 0.0);
}

/// UX-111: only submits that pass validation spend the 3/10 s budget -
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
/// connection drops after the reservation still runs to completion - the
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
        sqlx::query_scalar(
            "SELECT status_code FROM idempotency_keys WHERE user_id = $1 AND key = $2",
        )
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
    assert!(
        reserve_idempotent(&app.pool, alice.user_id, &held, &hash)
            .await
            .unwrap()
    );
    let waited = tokio::time::Instant::now();
    let busy = app
        .send(submit(&alice, &sub_id, Some("k-held"), &body))
        .await;
    assert_eq!(busy.status, StatusCode::CONFLICT, "{}", busy.text());
    assert_eq!(busy.json()["code"], "idempotency-in-progress");
    assert!(waited.elapsed() >= Duration::from_secs(4));
    sqlx::query(
        "UPDATE idempotency_keys SET created_at = now() - interval '31 seconds' WHERE key = $1",
    )
    .bind(&held)
    .execute(&app.pool)
    .await
    .unwrap();
    let taken = app
        .send(submit(&alice, &sub_id, Some("k-held"), &body))
        .await;
    assert_eq!(taken.status, StatusCode::OK, "{}", taken.text());
    assert_eq!(taken.json()["status"], "published");
    assert_eq!(key_row(&app, &held).await, Some(200));

    // Attempt 2: a failed action (stale If-Match → 409) releases the key;
    // the same key + body then runs and lands.
    let sub_id = start(&app).await;
    let mut stale = submit(&alice, &sub_id, Some("k-err"), &body);
    stale
        .headers_mut()
        .insert(header::IF_MATCH, "\"99\"".parse().unwrap());
    let failed = app.send(stale).await;
    assert_eq!(failed.status, StatusCode::CONFLICT, "{}", failed.text());
    assert_eq!(key_row(&app, &format!("submit:{sub_id}:k-err")).await, None);
    let retried = app
        .send(submit(&alice, &sub_id, Some("k-err"), &body))
        .await;
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
                () = tokio::time::sleep(Duration::from_micros(200)) => {
                    if key_row(&app, &dropped).await.is_some() { break; }
                }
                response = &mut request => {
                    assert_eq!(response.status, StatusCode::OK, "{}", response.text());
                    break;
                }
            }
        }
        // `request` dropped here - mid-flight when the row was seen first.
    }
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    while key_row(&app, &dropped).await == Some(IDEMPOTENT_IN_PROGRESS) {
        assert!(
            tokio::time::Instant::now() < deadline,
            "reservation stranded"
        );
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert_eq!(key_row(&app, &dropped).await, Some(200));
    let replay = app
        .send(submit(&alice, &sub_id, Some("k-drop"), &body))
        .await;
    assert_eq!(replay.status, StatusCode::OK, "{}", replay.text());
    assert_eq!(replay.json()["status"], "published");
    let mine = app
        .get_as(&alice, &format!("/api/v2/submissions/{sub_id}"))
        .await;
    assert_eq!(mine.json()["status"], "published");
}

/// BUG-224: a learner's `start` and a teacher's item write on a published
/// quiz with no submissions serialize on the assessment row - the draft is
/// never behind the assessment's `content_version`, and a draft that is
/// (unpublish → add → republish) cannot be submitted until reopened.
#[sqlx::test(migrations = "../../migrations")]
async fn start_and_item_writes_serialize_and_stale_drafts_reopen(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let alice = learner(&app, "alice").await;

    for round in 0..20 {
        let (id, _) = published_assessment(
            &app,
            &teacher,
            &chapter_id,
            "quiz",
            serde_json::json!({}),
            &[choice_item("First?")],
        )
        .await;
        let start_path = format!("/api/v2/assessments/{id}/submissions");
        let items_path = format!("/api/v2/assessments/{id}/items");
        let empty = serde_json::json!({});
        let second = choice_item("Second?");
        let start = app.post_as(&alice, &start_path, &empty);
        let add = app.post_as(&teacher, &items_path, &second);
        let (started, added) = if round % 2 == 0 {
            tokio::join!(start, add)
        } else {
            let (added, started) = tokio::join!(add, start);
            (started, added)
        };
        let detail = app
            .get_as(&teacher, &format!("/api/v2/assessments/{id}"))
            .await;
        let content_version = detail.json()["content_version"].clone();
        assert_eq!(started.status, StatusCode::CREATED, "{}", started.text());
        if added.status == StatusCode::CREATED {
            // The item landed first: the draft opened on the new content.
            assert_eq!(started.json()["total_items"], 2, "round {round}");
            let draft_version: i32 =
                sqlx::query_scalar("SELECT content_version FROM submissions WHERE id = $1")
                    .bind(uuid::Uuid::parse_str(started.json()["id"].as_str().unwrap()).unwrap())
                    .fetch_one(&app.pool)
                    .await
                    .unwrap();
            assert_eq!(
                serde_json::json!(draft_version),
                content_version,
                "round {round}"
            );
        } else {
            // The draft landed first: the item write refused a live quiz.
            assert_eq!(
                added.status,
                StatusCode::CONFLICT,
                "round {round}: {}",
                added.text()
            );
            assert_eq!(started.json()["total_items"], 1, "round {round}");
        }
    }

    // A draft left behind by a republish is stale until `start` reopens it.
    let (id, _) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({}),
        &[choice_item("First?")],
    )
    .await;
    let lifecycle = format!("/api/v2/assessments/{id}/lifecycle");
    let started = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(started.status, StatusCode::CREATED, "{}", started.text());
    let sub_id = started.json()["id"].as_str().unwrap().to_owned();
    for (to, body) in [
        ("draft", serde_json::json!({ "to": "draft" })),
        ("published", serde_json::json!({ "to": "published" })),
    ] {
        if to == "published" {
            let added = app
                .post_as(
                    &teacher,
                    &format!("/api/v2/assessments/{id}/items"),
                    &choice_item("Late?"),
                )
                .await;
            assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
        }
        let moved = app.post_as(&teacher, &lifecycle, &body).await;
        assert_eq!(moved.status, StatusCode::OK, "{to}: {}", moved.text());
    }
    let stale = app
        .send(submit(
            &alice,
            &sub_id,
            None,
            &serde_json::json!({ "answers": {} }),
        ))
        .await;
    assert_eq!(stale.status, StatusCode::CONFLICT, "{}", stale.text());
    assert_eq!(stale.json()["details"]["field"], "content_version");
    let reopened = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(reopened.status, StatusCode::OK, "{}", reopened.text());
    assert_eq!(reopened.json()["total_items"], 2);
    let submitted = app
        .send(submit(
            &alice,
            &sub_id,
            None,
            &serde_json::json!({ "answers": {} }),
        ))
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
}

/// BUG-240: parallel violation reports all count (no lost update), the
/// stored count annuls the attempt, and a submitted attempt takes none.
#[sqlx::test(migrations = "../../migrations")]
async fn parallel_violation_reports_all_count(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "tab_switch_detection": true, "violation_threshold": 5 }),
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
    let path = format!("/api/v2/submissions/{sub_id}/violations");
    let report = serde_json::json!({ "kind": "tab_switch" });
    let replies =
        futures::future::join_all((0..8).map(|_| app.post_as(&alice, &path, &report))).await;
    let mut counts: Vec<i64> = replies
        .iter()
        .map(|r| {
            assert_eq!(r.status, StatusCode::OK, "{}", r.text());
            r.json()["violation_count"].as_i64().unwrap()
        })
        .collect();
    counts.sort_unstable();
    assert_eq!(counts, (1..=8).collect::<Vec<_>>());
    let (count, events): (i32, serde_json::Value) =
        sqlx::query_as("SELECT violation_count, violations FROM submissions WHERE id = $1")
            .bind(uuid::Uuid::parse_str(&sub_id).unwrap())
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(count, 8);
    assert_eq!(events.as_array().unwrap().len(), 8);

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
    assert_eq!(submitted.json()["final_score"], 0.0);
    let late = app.post_as(&alice, &path, &report).await;
    assert_eq!(late.status, StatusCode::CONFLICT, "{}", late.text());
}

/// BUG-239: starts racing the submit of the only allowed attempt never open
/// a second one (nor 404), and the timer sweep never grades a draft past
/// the cap.
#[sqlx::test(migrations = "../../migrations")]
async fn starts_racing_a_submit_never_pass_the_attempt_cap(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "max_attempts": 1, "time_limit_seconds": 60 }),
        &[choice_item("Q1")],
    )
    .await;
    let start_path = format!("/api/v2/assessments/{id}/submissions");
    let empty = serde_json::json!({});
    let answer =
        serde_json::json!({ "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } } });
    for round in 0..10 {
        // One learner per round: the submit limiter is per learner.
        let who = learner(&app, &format!("learner{round}")).await;
        let draft = app.post_as(&who, &start_path, &empty).await;
        assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
        let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
        let starts =
            futures::future::join_all((0..4).map(|_| app.post_as(&who, &start_path, &empty)));
        let (submitted, starts) =
            tokio::join!(app.send(submit(&who, &sub_id, None, &answer)), starts);
        assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
        for start in &starts {
            assert!(
                matches!(start.status, StatusCode::OK | StatusCode::FORBIDDEN),
                "round {round}: {} {}",
                start.status,
                start.text()
            );
        }
        let rows: Vec<(i32, String)> = sqlx::query_as(
            "SELECT attempt_number, status FROM submissions
             WHERE assessment_id = $1
               AND user_id = (SELECT user_id FROM submissions WHERE id = $2)",
        )
        .bind(uuid::Uuid::parse_str(&id).unwrap())
        .bind(uuid::Uuid::parse_str(&sub_id).unwrap())
        .fetch_all(&app.pool)
        .await
        .unwrap();
        assert_eq!(rows, vec![(1, "published".to_owned())], "round {round}");
    }
}

/// BUG-256: the cap bars opening an attempt, never finishing one - a draft
/// opened under an override stays submittable (manual and timer sweep)
/// after the override is deleted.
#[sqlx::test(migrations = "../../migrations")]
async fn a_draft_opened_under_an_override_survives_its_deletion(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "max_attempts": 1, "time_limit_seconds": 60 }),
        &[choice_item("Q1")],
    )
    .await;
    let start_path = format!("/api/v2/assessments/{id}/submissions");
    let empty = serde_json::json!({});
    let answer =
        serde_json::json!({ "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } } });
    let mut second_drafts = Vec::new();
    for name in ["manual", "swept"] {
        let who = learner(&app, name).await;
        let first = app.post_as(&who, &start_path, &empty).await;
        let first_id = first.json()["id"].as_str().unwrap().to_owned();
        let done = app.send(submit(&who, &first_id, None, &answer)).await;
        assert_eq!(done.status, StatusCode::OK, "{}", done.text());
        let override_path = format!("/api/v2/assessments/{id}/overrides/{}", who.user_id);
        let granted = app
            .post_as(
                &teacher,
                &override_path,
                &serde_json::json!({ "max_attempts_override": 2 }),
            )
            .await;
        assert_eq!(granted.status, StatusCode::CREATED, "{}", granted.text());
        let second = app.post_as(&who, &start_path, &empty).await;
        assert_eq!(second.status, StatusCode::CREATED, "{}", second.text());
        let removed = app.delete_as(&teacher, &override_path).await;
        assert_eq!(removed.status, StatusCode::NO_CONTENT);
        let state = app
            .get_as(&who, &format!("/api/v2/assessments/{id}/attempt-state"))
            .await;
        assert_eq!(state.json()["can_continue"], true, "{}", state.text());
        second_drafts.push((who, second.json()["id"].as_str().unwrap().to_owned()));
    }

    let (manual, manual_id) = &second_drafts[0];
    let submitted = app.send(submit(manual, manual_id, None, &answer)).await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    // The cap still bars a third attempt.
    let third = app.post_as(manual, &start_path, &empty).await;
    assert_eq!(third.status, StatusCode::FORBIDDEN, "{}", third.text());

    let (_, swept_id) = &second_drafts[1];
    let swept_id = uuid::Uuid::parse_str(swept_id).unwrap();
    sqlx::query("UPDATE submissions SET started_at = now() - interval '3 minutes' WHERE id = $1")
        .bind(swept_id)
        .execute(&app.pool)
        .await
        .unwrap();
    let swept =
        ab_domain::grading::SubmissionsService::sweep_expired_drafts(&app.code_runner(), None, 10)
            .await
            .unwrap();
    assert_eq!(swept, 1);
    let status: String = sqlx::query_scalar("SELECT status FROM submissions WHERE id = $1")
        .bind(swept_id)
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(status, "published");
}

/// BUG-257: only what the learner answers or is scored on stales a draft -
/// a title edit (the editor re-sends the unchanged body) or a reorder made
/// while unpublished leaves it submittable and auto-scored; an option change still answers 409.
#[sqlx::test(migrations = "../../migrations")]
async fn cosmetic_item_edits_keep_open_drafts_current(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let alice = learner(&app, "alice").await;
    let empty = serde_json::json!({});
    for option_change in [false, true] {
        let (id, items) = published_assessment(
            &app,
            &teacher,
            &chapter_id,
            "quiz",
            serde_json::json!({}),
            &[choice_item("Q1"), choice_item("Q2")],
        )
        .await;
        let started = app
            .post_as(
                &alice,
                &format!("/api/v2/assessments/{id}/submissions"),
                &empty,
            )
            .await;
        assert_eq!(started.status, StatusCode::CREATED, "{}", started.text());
        let sub_id = started.json()["id"].as_str().unwrap().to_owned();

        let lifecycle = format!("/api/v2/assessments/{id}/lifecycle");
        let unpublished = app
            .post_as(&teacher, &lifecycle, &serde_json::json!({ "to": "draft" }))
            .await;
        assert_eq!(unpublished.status, StatusCode::OK, "{}", unpublished.text());
        let mut edited = choice_item("Q1");
        edited["title"] = serde_json::json!("Q1 (typo fixed)");
        if option_change {
            edited["body"]["options"][1]["text"] = serde_json::json!("never");
        }
        let patched = app
            .patch_as(
                &teacher,
                &format!("/api/v2/assessment-items/{}", items[0]),
                &edited,
            )
            .await;
        assert_eq!(patched.status, StatusCode::OK, "{}", patched.text());
        let reordered = app
            .post_as(
                &teacher,
                &format!("/api/v2/assessments/{id}/items/reorder"),
                &serde_json::json!({ "items": [&items[1], &items[0]] }),
            )
            .await;
        assert_eq!(reordered.status, StatusCode::OK, "{}", reordered.text());

        let republished = app
            .post_as(
                &teacher,
                &lifecycle,
                &serde_json::json!({ "to": "published" }),
            )
            .await;
        assert_eq!(republished.status, StatusCode::OK, "{}", republished.text());

        let answer = serde_json::json!({ "answers": {
            &items[0]: { "kind": "choice", "selected": ["a"] },
            &items[1]: { "kind": "choice", "selected": ["a"] },
        } });
        let submitted = app.send(submit(&alice, &sub_id, None, &answer)).await;
        if option_change {
            assert_eq!(
                submitted.status,
                StatusCode::CONFLICT,
                "{}",
                submitted.text()
            );
            assert_eq!(submitted.json()["details"]["field"], "content_version");
        } else {
            assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
            assert_eq!(
                submitted.json()["status"],
                "published",
                "{}",
                submitted.text()
            );
            assert_eq!(submitted.json()["final_score"], 100.0);
        }
    }
}

/// BUG-237: a timed draft left behind by unpublish → add item → republish
/// is never auto-scored by the timer sweep - the item it never showed
/// would score `no-answer`; the attempt waits for a teacher instead.
#[sqlx::test(migrations = "../../migrations")]
async fn timer_sweep_hands_a_stale_draft_to_review(pool: PgPool) {
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
    let saved = app
        .send(patch_draft(
            &alice,
            &sub_id,
            Some("1"),
            &serde_json::json!({ "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } } }),
        ))
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    let lifecycle = format!("/api/v2/assessments/{id}/lifecycle");
    let unpublished = app
        .post_as(&teacher, &lifecycle, &serde_json::json!({ "to": "draft" }))
        .await;
    assert_eq!(unpublished.status, StatusCode::OK, "{}", unpublished.text());
    let added = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &choice_item("Unseen?"),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
    let republished = app
        .post_as(
            &teacher,
            &lifecycle,
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(republished.status, StatusCode::OK, "{}", republished.text());
    sqlx::query("UPDATE submissions SET started_at = now() - interval '3 minutes' WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&sub_id).unwrap())
        .execute(&app.pool)
        .await
        .unwrap();

    let swept =
        ab_domain::grading::SubmissionsService::sweep_expired_drafts(&app.code_runner(), None, 10)
            .await
            .unwrap();
    assert_eq!(swept, 1);
    let (status, final_score, reason): (String, Option<f64>, Option<String>) = sqlx::query_as(
        "SELECT status, final_score, auto_submit_reason FROM submissions WHERE id = $1",
    )
    .bind(uuid::Uuid::parse_str(&sub_id).unwrap())
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(status, "pending", "a teacher scores it, never the 50 %");
    assert_eq!(final_score, None);
    assert_eq!(reason.as_deref(), Some("time_expired"));
}

/// BUG-279: the timer sweep builds a preview's policy by the preview rule
/// (BUG-278) - an author's expired, past-due preview closes with no late
/// penalty.
#[sqlx::test(migrations = "../../migrations")]
async fn timer_sweep_closes_a_late_preview_without_penalty(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, _items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "time_limit_seconds": 60, "allow_late": true,
                            "late_policy": { "kind": "penalty", "percent_per_day": 10, "max_days": 3 } }),
        &[choice_item("Q1")],
    )
    .await;
    let draft = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let sub = uuid::Uuid::parse_str(draft.json()["id"].as_str().unwrap()).unwrap();
    sqlx::query("UPDATE assessments SET due_at = now() - interval '1 hour' WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&id).unwrap())
        .execute(&app.pool)
        .await
        .unwrap();
    sqlx::query("UPDATE submissions SET started_at = now() - interval '3 minutes' WHERE id = $1")
        .bind(sub)
        .execute(&app.pool)
        .await
        .unwrap();

    let swept =
        ab_domain::grading::SubmissionsService::sweep_expired_drafts(&app.code_runner(), None, 10)
            .await
            .unwrap();
    assert_eq!(swept, 1);
    let (preview, status, penalty): (bool, String, f64) =
        sqlx::query_as("SELECT preview, status, late_penalty_pct FROM submissions WHERE id = $1")
            .bind(sub)
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert!(preview);
    assert_ne!(status, "draft");
    assert!(
        penalty.abs() < f64::EPSILON,
        "a preview carries no late penalty: {penalty}"
    );
}

/// BUG-315: a timed draft whose clock ran out before the due date is on time
/// however late the sweep gets to it - judged, and handed in, at the moment
/// its time expired.
#[sqlx::test(migrations = "../../migrations")]
async fn timer_sweep_judges_lateness_when_the_clock_ran_out(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, _items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "time_limit_seconds": 60, "allow_late": true,
                            "late_policy": { "kind": "penalty", "percent_per_day": 25, "max_days": 3 } }),
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
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let sub = uuid::Uuid::parse_str(draft.json()["id"].as_str().unwrap()).unwrap();
    // Clock out 2 minutes ago, due 1 minute ago, the sweep only now.
    sqlx::query("UPDATE assessments SET due_at = now() - interval '1 minute' WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&id).unwrap())
        .execute(&app.pool)
        .await
        .unwrap();
    sqlx::query("UPDATE submissions SET started_at = now() - interval '3 minutes' WHERE id = $1")
        .bind(sub)
        .execute(&app.pool)
        .await
        .unwrap();

    let swept =
        ab_domain::grading::SubmissionsService::sweep_expired_drafts(&app.code_runner(), None, 10)
            .await
            .unwrap();
    assert_eq!(swept, 1);
    let (late, penalty, at_clock_out): (bool, f64, bool) = sqlx::query_as(
        "SELECT is_late, late_penalty_pct,
                submitted_at < now() - interval '90 seconds' AND duration_seconds = 60
         FROM submissions WHERE id = $1",
    )
    .bind(sub)
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert!(!late);
    assert!(penalty.abs() < f64::EPSILON, "{penalty}");
    assert!(at_clock_out, "handed in when the time ran out");
}

/// BUG-379: a timed draft the sweep can never grade (its stored answers no
/// longer fit the items) is handed in ungraded on the last allowed try -
/// pending review, answers as stored, at the clock-out moment - never
/// left a draft nobody can finish or see.
#[sqlx::test(migrations = "../../migrations")]
async fn timer_sweep_hands_an_ungradable_draft_in_for_review(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "time_limit_seconds": 60 }),
        &[open_text_item("Q1")],
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
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let sub = uuid::Uuid::parse_str(draft.json()["id"].as_str().unwrap()).unwrap();
    // Over the open-text cap (a draft stored before a lower cap): parses,
    // never canonicalizes.
    let stored =
        serde_json::json!({ &items[0]: { "kind": "open_text", "text": "x".repeat(50_001) } });
    sqlx::query(
        "UPDATE submissions SET answers = $2, started_at = now() - interval '3 minutes'
         WHERE id = $1",
    )
    .bind(sub)
    .bind(&stored)
    .execute(&app.pool)
    .await
    .unwrap();

    let runner = app.code_runner();
    for round in 1..=5 {
        let swept = ab_domain::grading::SubmissionsService::sweep_expired_drafts(&runner, None, 10)
            .await
            .unwrap();
        assert_eq!(swept, usize::from(round == 5), "round {round}");
        sqlx::query("UPDATE submissions SET auto_submit_retry_at = now() WHERE id = $1")
            .bind(sub)
            .execute(&app.pool)
            .await
            .unwrap();
    }
    let (status, reason, answers, attempts, at_clock_out): (
        String,
        Option<String>,
        serde_json::Value,
        i32,
        bool,
    ) = sqlx::query_as(
        "SELECT status, auto_submit_reason, answers, auto_submit_attempts,
                submitted_at < now() - interval '90 seconds' AND final_score IS NULL
         FROM submissions WHERE id = $1",
    )
    .bind(sub)
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(
        (status.as_str(), reason.as_deref(), attempts),
        ("pending", Some("time_expired"), 4)
    );
    assert_eq!(answers, stored, "answers kept as stored");
    assert!(at_clock_out, "handed in when the time ran out, ungraded");

    let state = app
        .get_as(&alice, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(state.json()["can_continue"], false, "{}", state.text());
    assert_eq!(state.json()["draft_id"], serde_json::Value::Null);
    assert_eq!(state.json()["attempts_used"], 1);
    let queue = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/submissions?status=needs_grading"),
        )
        .await;
    assert_eq!(queue.status, StatusCode::OK, "{}", queue.text());
    assert_eq!(queue.json()["items"][0]["id"], sub.to_string());
}

/// A user with author permissions who is no course contributor - a learner
/// until the teacher adds them to the staff.
async fn future_maintainer(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["instructor"])
        .await;
    app.mint_session_for(
        user,
        &[
            "course:read:all",
            "assessment:*:own",
            "assessment:submit:assigned",
            "assessment:read:assigned",
        ],
    )
    .await
}

async fn set_maintainer(
    app: &TestApp,
    teacher: &MintedSession,
    course_id: &str,
    who: &MintedSession,
    on: bool,
) {
    let res = if on {
        app.post_as(
            teacher,
            &format!("/api/v2/courses/{course_id}/contributors"),
            &serde_json::json!({ "user_id": who.user_id, "role": "maintainer" }),
        )
        .await
    } else {
        app.patch_as(
            teacher,
            &format!("/api/v2/courses/{course_id}/contributors/{}", who.user_id),
            &serde_json::json!({ "status": "inactive" }),
        )
        .await
    };
    assert!(res.status.is_success(), "{}", res.text());
}

/// BUG-294: a counted draft opened as a learner stays counted after its
/// owner joins the staff - past a hard due date attempt-state, save and
/// submit agree (PAST_DUE), none judges by the caller's new role.
#[sqlx::test(migrations = "../../migrations")]
async fn a_counted_draft_keeps_its_gates_after_promotion(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher).await;
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
    let lena = future_maintainer(&app, "lena").await;
    let draft = app
        .post_as(
            &lena,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    set_maintainer(&app, &teacher, &course_id, &lena, true).await;
    sqlx::query("UPDATE assessments SET due_at = now() - interval '1 minute' WHERE id = $1")
        .bind(uuid::Uuid::parse_str(&id).unwrap())
        .execute(&app.pool)
        .await
        .unwrap();
    let state = app
        .get_as(&lena, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    let state = state.json();
    assert_eq!(state["is_teacher_preview"], false, "{state}");
    assert_eq!(state["can_continue"], false, "{state}");
    assert_eq!(state["draft_id"], sub_id.as_str(), "{state}");
    assert_eq!(state["disabled_reasons"], serde_json::json!(["PAST_DUE"]));
    let save = app
        .send(patch_draft(&lena, &sub_id, Some("\"1\""), &answer))
        .await;
    assert_eq!(save.status, StatusCode::FORBIDDEN, "{}", save.text());
    assert_eq!(save.json()["detail"], "PAST_DUE");
    let late = app.send(submit(&lena, &sub_id, None, &answer)).await;
    assert_eq!(late.status, StatusCode::FORBIDDEN, "{}", late.text());
    assert_eq!(late.json()["detail"], "PAST_DUE");
}

/// BUG-295: a preview draft opened while staff is never resumed once its
/// owner is a learner - attempt-state offers a new attempt, the preview
/// refuses save/submit (404), and start discards it for a counted draft.
#[sqlx::test(migrations = "../../migrations")]
async fn a_learner_never_resumes_a_preview_draft(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (course_id, chapter_id) = public_course(&app, &teacher).await;
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
    let lena = future_maintainer(&app, "lena").await;
    set_maintainer(&app, &teacher, &course_id, &lena, true).await;
    let preview = app
        .post_as(
            &lena,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(preview.status, StatusCode::CREATED, "{}", preview.text());
    let preview_id = preview.json()["id"].as_str().unwrap().to_owned();
    set_maintainer(&app, &teacher, &course_id, &lena, false).await;

    let state = app
        .get_as(&lena, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    let state = state.json();
    assert_eq!(state["can_start"], true, "{state}");
    assert_eq!(state["draft_id"], serde_json::Value::Null, "{state}");
    assert_eq!(state["is_teacher_preview"], false, "{state}");
    let save = app
        .send(patch_draft(&lena, &preview_id, Some("\"1\""), &answer))
        .await;
    assert_eq!(save.status, StatusCode::NOT_FOUND, "{}", save.text());
    let sent = app.send(submit(&lena, &preview_id, None, &answer)).await;
    assert_eq!(sent.status, StatusCode::NOT_FOUND, "{}", sent.text());

    let counted = app
        .post_as(
            &lena,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(counted.status, StatusCode::CREATED, "{}", counted.text());
    let counted_id = counted.json()["id"].as_str().unwrap().to_owned();
    assert_ne!(counted_id, preview_id);
    assert_eq!(counted.json()["attempt_number"], 1);
    let (previews, drafts): (i64, i64) = sqlx::query_as(
        "SELECT count(*) FILTER (WHERE preview), count(*) FILTER (WHERE status = 'draft')
         FROM submissions WHERE assessment_id = $1",
    )
    .bind(uuid::Uuid::parse_str(&id).unwrap())
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!((previews, drafts), (0, 1));
    let state = app
        .get_as(&lena, &format!("/api/v2/assessments/{id}/attempt-state"))
        .await;
    assert_eq!(state.json()["can_continue"], true, "{}", state.text());
    assert_eq!(state.json()["draft_id"], counted_id.as_str());
    let done = app.send(submit(&lena, &counted_id, None, &answer)).await;
    assert_eq!(done.status, StatusCode::OK, "{}", done.text());
    let mine = app
        .get_as(&lena, &format!("/api/v2/assessments/{id}/submissions/me"))
        .await;
    assert_eq!(mine.json().as_array().unwrap().len(), 1, "{}", mine.text());
}

/// BUG-344: a violation report or draft save committed while the submit
/// grades is never overwritten by the draft that was graded - the violation
/// re-grades the attempt (zeroed past the threshold), a pinned draft version
/// that moved is a 409.
#[sqlx::test(migrations = "../../migrations")]
async fn submit_never_overwrites_a_draft_changed_while_grading(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "tab_switch_detection": true, "violation_threshold": 1, "max_attempts": 5 }),
        &[choice_item("Q1")],
    )
    .await;
    let answer = serde_json::json!({
        "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } },
        "violation_count": 0,
    });
    // Holds the row, lets the submit queue its final UPDATE behind the lock,
    // applies `change` as a concurrent writer, then releases.
    let race = async |name: &str, if_match: Option<&str>, change: &'static str| {
        let session = learner(&app, name).await;
        let draft = app
            .post_as(
                &session,
                &format!("/api/v2/assessments/{id}/submissions"),
                &serde_json::json!({}),
            )
            .await;
        let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
        let sub_uuid = uuid::Uuid::parse_str(&sub_id).unwrap();
        let mut holder = app.pool.begin().await.unwrap();
        sqlx::query("SELECT id FROM submissions WHERE id = $1 FOR UPDATE")
            .bind(sub_uuid)
            .execute(&mut *holder)
            .await
            .unwrap();
        let mut request = submit(&session, &sub_id, None, &answer);
        if let Some(version) = if_match {
            request
                .headers_mut()
                .insert(header::IF_MATCH, version.parse().unwrap());
        }
        let submitting = app.send(request);
        let writer = async {
            wait_until("submit's final UPDATE queued on the row lock", async || {
                sqlx::query_scalar::<_, bool>(
                    "SELECT EXISTS (SELECT 1 FROM pg_stat_activity
                     WHERE datname = current_database() AND wait_event_type = 'Lock'
                       AND query LIKE 'UPDATE submissions SET%status = $2%')",
                )
                .fetch_one(&app.pool)
                .await
                .unwrap()
            })
            .await;
            sqlx::query(change)
                .bind(sub_uuid)
                .execute(&mut *holder)
                .await
                .unwrap();
            holder.commit().await.unwrap();
        };
        let (response, ()) = tokio::join!(submitting, writer);
        response
    };

    let violated = race(
        "vera",
        None,
        "UPDATE submissions SET violation_count = violation_count + 1 WHERE id = $1",
    )
    .await;
    assert_eq!(violated.status, StatusCode::OK, "{}", violated.text());
    assert_eq!(violated.json()["violation_count"], 1, "{}", violated.text());
    assert_eq!(violated.json()["final_score"], 0.0, "{}", violated.text());

    let moved = race(
        "dana",
        Some("\"1\""),
        "UPDATE submissions SET answers = '{}'::jsonb, draft_version = draft_version + 1 WHERE id = $1",
    )
    .await;
    assert_eq!(moved.status, StatusCode::CONFLICT, "{}", moved.text());
    assert_eq!(moved.json()["details"]["actual"], 2, "{}", moved.text());
}

/// BUG-356 (BUG-344): a draft that moves under every re-grade round is
/// given up after three - the submit is a 409 «kept changing» that spent
/// the submit budget once, not once per round (two more accepted submits
/// go through, the fourth is the 429); the timer sweep gives up the same
/// way and backs the draft off instead of looping.
#[sqlx::test(migrations = "../../migrations")]
async fn hand_in_gives_up_after_three_regrade_rounds(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "max_attempts": 5, "time_limit_seconds": 60, "grace_period_minutes": 0 }),
        &[choice_item("Q1")],
    )
    .await;
    let alice = learner(&app, "alice").await;
    let answer =
        serde_json::json!({ "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } } });
    let start = async || {
        let draft = app
            .post_as(
                &alice,
                &format!("/api/v2/assessments/{id}/submissions"),
                &serde_json::json!({}),
            )
            .await;
        assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
        uuid::Uuid::parse_str(draft.json()["id"].as_str().unwrap()).unwrap()
    };
    // The hand-in re-reads the draft, grades it, then takes `lock_attempts`
    // (an advisory lock) right before its guarded UPDATE. The test holds that
    // lock: an advisory lock is one lock object, so its waiters are served
    // strictly in order - unlike a row lock, whose waiters race again for
    // each new tuple version (which made the row-lock version flaky in CI).
    let hold = async |sub: uuid::Uuid| {
        let (assessment, user): (uuid::Uuid, uuid::Uuid) =
            sqlx::query_as("SELECT assessment_id, user_id FROM submissions WHERE id = $1")
                .bind(sub)
                .fetch_one(&app.pool)
                .await
                .unwrap();
        let mut holder = app.pool.begin().await.unwrap();
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('attempt:' || $1 || $2, 0))")
            .bind(assessment.to_string())
            .bind(user.to_string())
            .execute(&mut *holder)
            .await
            .unwrap();
        holder
    };
    let waiting = async |n: i64| {
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM pg_stat_activity
             WHERE datname = current_database() AND wait_event_type = 'Lock'
               AND query LIKE 'SELECT pg_advisory_xact_lock(%'",
        )
        .fetch_one(&app.pool)
        .await
        .unwrap()
            >= n
    };
    // Three rounds: once the hand-in waits on the held lock (it has read the
    // draft), bump `draft_version`; queue the next round's lock behind it,
    // then release - the hand-in's write misses the moved version, and its
    // retry lines up behind the new holder.
    let keep_changing = async |sub: uuid::Uuid, holder: sqlx::Transaction<'_, sqlx::Postgres>| {
        let mut holder = holder;
        for round in 0..3 {
            wait_until("the hand-in never waited on lock_attempts", async || {
                waiting(1).await
            })
            .await;
            sqlx::query("UPDATE submissions SET draft_version = draft_version + 1 WHERE id = $1")
                .bind(sub)
                .execute(&app.pool)
                .await
                .unwrap();
            if round == 2 {
                holder.commit().await.unwrap();
                break;
            }
            let current = holder;
            let (next, ()) = tokio::join!(hold(sub), async {
                wait_until("the next round's lock never queued", async || {
                    waiting(2).await
                })
                .await;
                current.commit().await.unwrap();
            });
            holder = next;
        }
    };

    let first = start().await;
    let holder = hold(first).await;
    let (given_up, ()) = tokio::join!(
        app.send(submit(&alice, &first.to_string(), None, &answer)),
        keep_changing(first, holder)
    );
    assert_eq!(given_up.status, StatusCode::CONFLICT, "{}", given_up.text());
    assert!(
        given_up.text().contains("kept changing"),
        "{}",
        given_up.text()
    );
    let (status, version): (String, i64) =
        sqlx::query_as("SELECT status, draft_version FROM submissions WHERE id = $1")
            .bind(first)
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!((status.as_str(), version), ("draft", 4));

    // One spend for the three rounds: two more accepted, the fourth is 429.
    let done = app
        .send(submit(&alice, &first.to_string(), None, &answer))
        .await;
    assert_eq!(done.status, StatusCode::OK, "{}", done.text());
    let second = start().await;
    let done = app
        .send(submit(&alice, &second.to_string(), None, &answer))
        .await;
    assert_eq!(done.status, StatusCode::OK, "{}", done.text());
    let third = start().await;
    let spam = app
        .send(submit(&alice, &third.to_string(), None, &answer))
        .await;
    assert_eq!(
        spam.status,
        StatusCode::TOO_MANY_REQUESTS,
        "{}",
        spam.text()
    );

    // The sweep: the expired draft moves under every round → backed off.
    sqlx::query("UPDATE submissions SET started_at = now() - interval '1 hour' WHERE id = $1")
        .bind(third)
        .execute(&app.pool)
        .await
        .unwrap();
    let holder = hold(third).await;
    let runner = app.code_runner();
    let sweep = tokio::spawn(async move {
        ab_domain::grading::SubmissionsService::sweep_expired_drafts(&runner, None, 10).await
    });
    keep_changing(third, holder).await;
    assert_eq!(sweep.await.unwrap().unwrap(), 0, "given up, not handed in");
    let (status, attempts, backed_off): (String, i32, bool) = sqlx::query_as(
        "SELECT status, auto_submit_attempts, auto_submit_retry_at > now()
         FROM submissions WHERE id = $1",
    )
    .bind(third)
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!((status.as_str(), attempts, backed_off), ("draft", 1, true));
}

/// UX-260: a `start` racing an in-flight submit waits for it (the submit
/// holds `lock_attempts` from grading to the row write) and answers the
/// settled state - the next attempt as a draft, never attempt 1 still as
/// a draft while the submit turns it `pending`.
#[sqlx::test(migrations = "../../migrations")]
async fn start_waits_for_an_in_flight_submit(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({ "max_attempts": 5 }),
        &[choice_item("Q1")],
    )
    .await;
    let alice = learner(&app, "alice").await;
    let answer =
        serde_json::json!({ "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } } });
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let first = draft.json()["id"].as_str().unwrap().to_owned();
    let waiting_on = async |event: &str| {
        let event = event.to_owned();
        wait_until(&format!("no backend waiting on {event}"), async || {
            sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS (SELECT 1 FROM pg_stat_activity
                 WHERE datname = current_database() AND wait_event_type = 'Lock'
                   AND wait_event = $1)",
            )
            .bind(&event)
            .fetch_one(&app.pool)
            .await
            .unwrap()
        })
        .await;
    };
    // Hold the row so the submit stops at its final UPDATE, mid hand-in.
    let mut holder = app.pool.begin().await.unwrap();
    sqlx::query("SELECT id FROM submissions WHERE id = $1::uuid FOR UPDATE")
        .bind(&first)
        .execute(&mut *holder)
        .await
        .unwrap();
    let (submitted, started) =
        tokio::join!(app.send(submit(&alice, &first, None, &answer)), async {
            waiting_on("transactionid").await;
            // The start issued now queues behind the hand-in, not the row.
            let (path, body) = (
                format!("/api/v2/assessments/{id}/submissions"),
                serde_json::json!({}),
            );
            tokio::join!(app.post_as(&alice, &path, &body), async {
                waiting_on("advisory").await;
                holder.commit().await.unwrap();
            })
            .0
        });
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    assert_eq!(submitted.json()["status"], "published");
    assert_eq!(started.status, StatusCode::CREATED, "{}", started.text());
    assert_eq!(started.json()["attempt_number"], 2);
    assert_eq!(started.json()["status"], "draft");
    assert_ne!(started.json()["id"], first.as_str());
}

/// BUG-377: a hand-in holds exactly one pool connection at a time - more
/// concurrent submits than the pool has connections all land, where the
/// UX-260 lock on its own connection plus pool writes inside it used to
/// deadlock the pool (`PoolTimedOut` after the acquire timeout).
#[sqlx::test(migrations = "../../migrations")]
async fn concurrent_submits_beyond_the_pool_size_all_land(pool: PgPool) {
    const POOL: u32 = 3;
    let small = sqlx::postgres::PgPoolOptions::new()
        .max_connections(POOL)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect_with((*pool.connect_options()).clone())
        .await
        .unwrap();
    let app = TestApp::spawn(small).await;
    let teacher = instructor(&app, "teacher").await;
    let (_course_id, chapter_id) = public_course(&app, &teacher).await;
    let (id, items) = published_assessment(
        &app,
        &teacher,
        &chapter_id,
        "quiz",
        serde_json::json!({}),
        &[choice_item("Q1")],
    )
    .await;
    let answer =
        serde_json::json!({ "answers": { &items[0]: { "kind": "choice", "selected": ["a"] } } });
    let mut drafts = Vec::new();
    for n in 0..POOL * 3 {
        let who = learner(&app, &format!("learner{n}")).await;
        let draft = app
            .post_as(
                &who,
                &format!("/api/v2/assessments/{id}/submissions"),
                &serde_json::json!({}),
            )
            .await;
        assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
        drafts.push((who, draft.json()["id"].as_str().unwrap().to_owned()));
    }
    let results = futures::future::join_all(
        drafts
            .iter()
            .map(|(who, draft)| app.send(submit(who, draft, None, &answer))),
    )
    .await;
    for res in results {
        assert_eq!(res.status, StatusCode::OK, "{}", res.text());
        assert_eq!(res.json()["status"], "published");
    }
}
