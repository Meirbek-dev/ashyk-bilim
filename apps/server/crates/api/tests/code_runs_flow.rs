//! Code challenges end to end against a fake Judge0: visible/custom runs
//! with idempotent replay and hidden-test masking, submit-time final runs
//! (hidden tests, compile errors, blank source), the author's reference
//! check, the degraded runner (learner 503, timer → manual review), and
//! the language list.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::judge0::{CaseVerdict, FakeJudge};
use ab_testkit::{MintedSession, TestApp};
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use sqlx::PgPool;

/// A "Python" that squares its input; `SYNTAX` in the source fails to
/// compile; `NUL` prints a NUL byte; anything else prints 0.
fn fake_python(source: &str, stdin: &str) -> CaseVerdict {
    if source.contains("NUL") {
        return CaseVerdict::accepted("4\0\n");
    }
    if source.contains("BOOM") {
        return CaseVerdict {
            status_id: 13,
            stdout: None,
            stderr: None,
            compile_output: None,
        };
    }
    if source.contains("SYNTAX") {
        return CaseVerdict::compile_error("SyntaxError: invalid syntax");
    }
    if source.contains("square") {
        let n: i64 = stdin.trim().parse().unwrap_or(0);
        return CaseVerdict::accepted(format!("{}\n", n * n));
    }
    CaseVerdict::accepted("0\n")
}

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

/// Public course + chapter + published code challenge with one visible and
/// one hidden test; returns (assessment_id, item_id).
async fn code_challenge(
    app: &TestApp,
    teacher: &MintedSession,
    time_limit_seconds: Option<i32>,
) -> (String, String) {
    let course = app
        .post_as(
            teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": "Algorithms" }),
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
    let chapter_id = chapter.json()["id"].as_str().unwrap().to_owned();
    let created = app
        .post_as(
            teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "code_challenge",
                                  "title": "Square" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let item_id = created.json()["items"][0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let edited = app
        .patch_as(
            teacher,
            &format!("/api/v2/assessment-items/{item_id}"),
            &serde_json::json!({
                "title": "Square",
                "body": {
                    "kind": "code", "prompt": "print n squared", "languages": [71, 62],
                    "reference_solutions": { "71": "print(int(input())**2)  # square" },
                    "time_limit_seconds": 2,
                    "tests": [
                        { "id": "t1", "input": "2", "expected_output": "4", "is_visible": true, "weight": 1 },
                        { "id": "t2", "input": "3", "expected_output": "9", "is_visible": false, "weight": 3 }
                    ]
                }
            }),
        )
        .await;
    assert_eq!(edited.status, StatusCode::OK, "{}", edited.text());
    let mut policy = created.json()["policy"].clone();
    policy["time_limit_seconds"] = serde_json::json!(time_limit_seconds);
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
    (id, item_id)
}

fn run(
    session: &MintedSession,
    item_id: &str,
    key: Option<&str>,
    body: &serde_json::Value,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method("POST")
        .uri(format!("/api/v2/assessment-items/{item_id}/runs"))
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, &session.cookie);
    if let Some(key) = key {
        builder = builder.header("idempotency-key", key);
    }
    builder.body(Body::from(body.to_string())).unwrap()
}

const SQUARE: &str = "print(int(input())**2)  # square";

#[sqlx::test(migrations = "../../migrations")]
async fn visible_and_custom_runs_replay_and_mask(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let judge = FakeJudge::mount(&app.judge0, fake_python).await;
    let teacher = instructor(&app, "teacher").await;
    let (_id, item_id) = code_challenge(&app, &teacher, None).await;
    let alice = learner(&app, "alice").await;

    // Visible tests only: one submission reaches Judge0.
    let first = app
        .send(run(
            &alice,
            &item_id,
            Some("run-1"),
            &serde_json::json!({ "language_id": 71, "source": SQUARE }),
        ))
        .await;
    assert_eq!(first.status, StatusCode::CREATED, "{}", first.text());
    let body = first.json();
    assert_eq!(body["status"], "accepted");
    assert_eq!(body["purpose"], "visible");
    assert_eq!(body["passed"], 1);
    assert_eq!(body["total"], 1);
    assert_eq!(body["score"], 100.0);
    assert_eq!(body["replayed"], false);
    assert_eq!(body["cases"][0]["test_id"], "t1");
    assert_eq!(body["cases"][0]["stdin"], "2");
    assert_eq!(body["cases"][0]["expected"], "4");
    assert_eq!(body["cases"][0]["actual"], "4");
    assert_eq!(body["cases"][0]["status_id"], 3);
    assert_eq!(judge.submissions(), 1);
    let run_id = body["id"].as_str().unwrap().to_owned();

    // Same key + payload replays (200) without touching Judge0; a different
    // payload under the key is a conflict.
    let replay = app
        .send(run(
            &alice,
            &item_id,
            Some("run-1"),
            &serde_json::json!({ "language_id": 71, "source": SQUARE }),
        ))
        .await;
    assert_eq!(replay.status, StatusCode::OK);
    assert_eq!(replay.json()["id"], run_id.as_str());
    assert_eq!(replay.json()["replayed"], true);
    assert_eq!(judge.submissions(), 1);
    let clash = app
        .send(run(
            &alice,
            &item_id,
            Some("run-1"),
            &serde_json::json!({ "language_id": 71, "source": "print(0)" }),
        ))
        .await;
    assert_eq!(clash.status, StatusCode::CONFLICT);
    assert_eq!(clash.json()["details"]["run_id"], run_id.as_str());

    // Custom input: unscored, one case named "custom".
    let custom = app
        .send(run(
            &alice,
            &item_id,
            None,
            &serde_json::json!({ "language_id": 71, "source": SQUARE, "custom_input": "5" }),
        ))
        .await;
    assert_eq!(custom.status, StatusCode::CREATED, "{}", custom.text());
    assert_eq!(custom.json()["purpose"], "custom");
    assert_eq!(custom.json()["status"], "accepted");
    assert!(custom.json()["score"].is_null());
    assert_eq!(custom.json()["cases"][0]["test_id"], "custom");
    assert_eq!(custom.json()["cases"][0]["actual"], "25");
    assert_eq!(custom.json()["cases"][0]["passed"], true);

    // Language gates: platform allowlist, then the item's own list.
    let unknown = app
        .send(run(
            &alice,
            &item_id,
            None,
            &serde_json::json!({ "language_id": 999, "source": SQUARE }),
        ))
        .await;
    assert_eq!(unknown.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(unknown.json()["code"], "language-not-allowed");
    let not_for_item = app
        .send(run(
            &alice,
            &item_id,
            None,
            &serde_json::json!({ "language_id": 63, "source": SQUARE }),
        ))
        .await;
    assert_eq!(not_for_item.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        not_for_item.json()["details"]["allowed_language_ids"],
        serde_json::json!([71, 62])
    );
    let blank = app
        .send(run(
            &alice,
            &item_id,
            None,
            &serde_json::json!({ "language_id": 71, "source": "   " }),
        ))
        .await;
    assert_eq!(blank.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(blank.json()["field_errors"][0]["field"], "source");

    // Compile errors are a normal run outcome, not an HTTP error.
    let broken = app
        .send(run(
            &alice,
            &item_id,
            None,
            &serde_json::json!({ "language_id": 71, "source": "SYNTAX" }),
        ))
        .await;
    assert_eq!(broken.status, StatusCode::CREATED, "{}", broken.text());
    assert_eq!(broken.json()["status"], "compile_error");
    assert_eq!(
        broken.json()["compile_output"],
        "SyntaxError: invalid syntax"
    );
    assert_eq!(broken.json()["cases"][0]["status_id"], 6);
    assert_eq!(broken.json()["cases"][0]["passed"], false);

    // Lookup: the owner and the author see it; other learners get 404.
    let bob = learner(&app, "bob").await;
    assert_eq!(
        app.get_as(&bob, &format!("/api/v2/code-runs/{run_id}"))
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.get_as(&alice, &format!("/api/v2/code-runs/{run_id}"))
            .await
            .status,
        StatusCode::OK
    );
    let as_teacher = app
        .get_as(&teacher, &format!("/api/v2/code-runs/{run_id}"))
        .await;
    assert_eq!(as_teacher.status, StatusCode::OK);
    assert_eq!(as_teacher.json()["cases"][0]["stdin"], "2");

    // Teachers preview freely (no submit grant needed).
    let preview = app
        .send(run(
            &teacher,
            &item_id,
            None,
            &serde_json::json!({ "language_id": 71, "source": SQUARE }),
        ))
        .await;
    assert_eq!(preview.status, StatusCode::CREATED, "{}", preview.text());
}

#[sqlx::test(migrations = "../../migrations")]
async fn submit_runs_hidden_tests_and_surfaces_compile_errors(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let judge = FakeJudge::mount(&app.judge0, fake_python).await;
    let teacher = instructor(&app, "teacher").await;
    let (id, item_id) = code_challenge(&app, &teacher, None).await;

    // A correct solution: both tests run at submit, published immediately.
    let alice = learner(&app, "alice").await;
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": {
                &item_id: { "kind": "code", "language": 71, "source": SQUARE }
            } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    assert_eq!(submitted.json()["status"], "published");
    assert_eq!(submitted.json()["auto_score"], 100.0);
    assert_eq!(submitted.json()["final_score"], 100.0);
    assert_eq!(
        submitted.json()["grading"]["items"][0]["feedback"],
        "2/2 tests passed"
    );
    assert_eq!(judge.submissions(), 2, "hidden tests run at submit");
    let (purpose, passed, total, run_id): (String, i32, i32, uuid::Uuid) =
        sqlx::query_as("SELECT purpose, passed, total, id FROM code_runs WHERE submission_id = $1")
            .bind(uuid::Uuid::parse_str(&sub_id).unwrap())
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!((purpose.as_str(), passed, total), ("final", 2, 2));
    // The learner sees the hidden case's verdict but not its data.
    let mine = app
        .get_as(&alice, &format!("/api/v2/code-runs/{run_id}"))
        .await;
    assert_eq!(mine.json()["cases"][1]["passed"], true);
    assert!(mine.json()["cases"][1]["stdin"].is_null());
    assert!(mine.json()["cases"][1]["actual"].is_null());
    let theirs = app
        .get_as(&teacher, &format!("/api/v2/code-runs/{run_id}"))
        .await;
    assert_eq!(theirs.json()["cases"][1]["stdin"], "3");
    assert_eq!(theirs.json()["cases"][1]["actual"], "9");

    // A compile error blocks the submit (422 with the output); the draft
    // survives, and a wrong answer then scores zero.
    let bob = learner(&app, "bob").await;
    let draft = app
        .post_as(
            &bob,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let bob_sub = draft.json()["id"].as_str().unwrap().to_owned();
    let refused = app
        .post_as(
            &bob,
            &format!("/api/v2/submissions/{bob_sub}/submit"),
            &serde_json::json!({ "answers": {
                &item_id: { "kind": "code", "language": 71, "source": "SYNTAX" }
            } }),
        )
        .await;
    assert_eq!(
        refused.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        refused.text()
    );
    assert_eq!(refused.json()["code"], "compile-error");
    assert_eq!(
        refused.json()["details"]["compile_output"],
        "SyntaxError: invalid syntax"
    );
    let still_open = app
        .get_as(&bob, &format!("/api/v2/assessments/{id}/submissions/draft"))
        .await;
    assert_eq!(still_open.status, StatusCode::OK);
    let wrong = app
        .post_as(
            &bob,
            &format!("/api/v2/submissions/{bob_sub}/submit"),
            &serde_json::json!({ "answers": {
                &item_id: { "kind": "code", "language": 71, "source": "print(0)" }
            } }),
        )
        .await;
    assert_eq!(wrong.status, StatusCode::OK, "{}", wrong.text());
    assert_eq!(wrong.json()["status"], "published");
    assert_eq!(wrong.json()["final_score"], 0.0);
    assert_eq!(
        wrong.json()["grading"]["items"][0]["feedback"],
        "0/2 tests passed"
    );

    // Blank source never reaches Judge0 and scores zero.
    let before = judge.submissions();
    let carol = learner(&app, "carol").await;
    let draft = app
        .post_as(
            &carol,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let carol_sub = draft.json()["id"].as_str().unwrap().to_owned();
    let empty = app
        .post_as(
            &carol,
            &format!("/api/v2/submissions/{carol_sub}/submit"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(empty.status, StatusCode::OK, "{}", empty.text());
    assert_eq!(empty.json()["final_score"], 0.0);
    assert_eq!(judge.submissions(), before);

    // Reference check: authors only; one verdict per allowed language.
    let denied = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/reference-check"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(denied.status, StatusCode::FORBIDDEN);
    let checked = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/reference-check"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(checked.status, StatusCode::OK, "{}", checked.text());
    let results = checked.json()["results"].as_array().unwrap().clone();
    assert_eq!(results.len(), 2);
    assert_eq!(results[0]["language_id"], 71);
    assert_eq!(results[0]["ok"], true);
    assert_eq!(results[0]["passed"], 2);
    assert_eq!(results[0]["score"], 100.0);
    assert_eq!(results[1]["language_id"], 62);
    assert_eq!(results[1]["status"], "missing_solution");
    assert_eq!(results[1]["ok"], false);
}

/// BUG-381: a deadline rush on a saturated runner. The submit arrives
/// before `due_at` (no late hand-ins), Judge0 answers «busy» only after the
/// due date has passed - the attempt is on time (judged at arrival) and
/// lands for manual review: 200 `pending`, counted in the teacher's stats.
#[sqlx::test(migrations = "../../migrations")]
async fn busy_runner_at_the_deadline_hands_the_submit_in_for_review(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let judge = FakeJudge::mount(&app.judge0, fake_python).await;
    let teacher = instructor(&app, "teacher").await;
    let (id, item_id) = code_challenge(&app, &teacher, None).await;
    let alice = learner(&app, "alice").await;
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    // The test runner's poll budget is 3 s: the busy answer comes after it.
    sqlx::query(
        "UPDATE assessments SET allow_late = false, due_at = now() + interval '2 seconds' WHERE id = $1",
    )
    .bind(uuid::Uuid::parse_str(&id).unwrap())
    .execute(&app.pool)
    .await
    .unwrap();
    judge.set_busy(true);
    let handed = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": {
                &item_id: { "kind": "code", "language": 71, "source": SQUARE }
            } }),
        )
        .await;
    assert_eq!(handed.status, StatusCode::OK, "{}", handed.text());
    assert_eq!(handed.json()["status"], "pending");
    assert_eq!(handed.json()["is_late"], false);
    let stats = app
        .get_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/submissions/stats"),
        )
        .await;
    assert_eq!(stats.status, StatusCode::OK, "{}", stats.text());
    assert_eq!(stats.json()["total"], 1);
    assert_eq!(stats.json()["needs_grading"], 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn degraded_runner_and_languages(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let judge = FakeJudge::mount(&app.judge0, fake_python).await;
    let teacher = instructor(&app, "teacher").await;
    let (id, item_id) = code_challenge(&app, &teacher, Some(60)).await;
    let alice = learner(&app, "alice").await;
    judge.set_down(true);

    // A learner run answers 503 with the recorded run id and Retry-After.
    let down = app
        .send(run(
            &alice,
            &item_id,
            None,
            &serde_json::json!({ "language_id": 71, "source": SQUARE }),
        ))
        .await;
    assert_eq!(
        down.status,
        StatusCode::SERVICE_UNAVAILABLE,
        "{}",
        down.text()
    );
    assert_eq!(down.json()["code"], "code-runner-degraded");
    assert_eq!(down.json()["details"]["is_retryable"], true);
    // UX-291: no upstream URL or transport error reaches the learner.
    assert_eq!(down.json()["detail"], "code runner unavailable");
    assert_eq!(down.headers[header::RETRY_AFTER], "30");
    let run_id = down.json()["details"]["run_id"]
        .as_str()
        .unwrap()
        .to_owned();
    let recorded = app
        .get_as(&alice, &format!("/api/v2/code-runs/{run_id}"))
        .await;
    assert_eq!(recorded.json()["status"], "degraded");
    assert_eq!(recorded.json()["error_message"], "code runner unavailable");

    // BUG-381: an on-time hand-in is never lost to the runner - it lands
    // for manual review instead of a 503 the learner retries past the due.
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let handed = draft.json()["id"].as_str().unwrap().to_owned();
    let accepted = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{handed}/submit"),
            &serde_json::json!({ "answers": {
                &item_id: { "kind": "code", "language": 71, "source": SQUARE }
            } }),
        )
        .await;
    assert_eq!(accepted.status, StatusCode::OK, "{}", accepted.text());
    assert_eq!(accepted.json()["status"], "pending");

    // … and the timer cannot wait either: the expired draft goes to review.
    let bob = learner(&app, "bob").await;
    let draft = app
        .post_as(
            &bob,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let saved = app
        .send(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v2/submissions/{sub_id}/draft"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &bob.cookie)
                .header(header::IF_MATCH, "1")
                .body(Body::from(
                    serde_json::json!({ "answers": {
                        &item_id: { "kind": "code", "language": 71, "source": SQUARE }
                    } })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
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
    let mine = app
        .get_as(&bob, &format!("/api/v2/submissions/{sub_id}"))
        .await;
    assert_eq!(mine.json()["status"], "pending");
    assert_eq!(mine.json()["release_state"], "hidden");

    // Languages: the platform allowlist filters what Judge0 offers.
    judge.set_down(false);
    let languages = app.get_as(&alice, "/api/v2/code/languages").await;
    assert_eq!(languages.status, StatusCode::OK, "{}", languages.text());
    let ids: Vec<i64> = languages
        .json()
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["id"].as_i64().unwrap())
        .collect();
    assert_eq!(ids, [71, 62]);
    assert_eq!(languages.json()[0]["monaco_language"], "python");
}

/// BUG-369: a program printing a NUL byte is a wrong answer, not a 500 -
/// on a visible run and at submit, and no run is left `running`.
#[sqlx::test(migrations = "../../migrations")]
async fn nul_bytes_in_output_are_stored_not_fatal(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    FakeJudge::mount(&app.judge0, fake_python).await;
    let teacher = instructor(&app, "teacher").await;
    let (id, item_id) = code_challenge(&app, &teacher, None).await;
    let alice = learner(&app, "alice").await;
    let nul = r"print('\0')  # NUL";

    let ran = app
        .send(run(
            &alice,
            &item_id,
            None,
            &serde_json::json!({ "language_id": 71, "source": nul }),
        ))
        .await;
    assert_eq!(ran.status, StatusCode::CREATED, "{}", ran.text());
    assert_eq!(ran.json()["status"], "wrong_answer");
    assert_eq!(ran.json()["cases"][0]["actual"], "4\u{FFFD}");

    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": {
                &item_id: { "kind": "code", "language": 71, "source": nul }
            } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    assert_eq!(submitted.json()["final_score"], 0.0);
    let stuck: i64 = sqlx::query_scalar("SELECT count(*) FROM code_runs WHERE status = 'running'")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(stuck, 0);
}

/// BUG-371: a key whose run is still executing answers 409 - never a
/// second execution; an abandoned run (crash) frees the key after a while.
#[sqlx::test(migrations = "../../migrations")]
async fn in_flight_run_keys_answer_409_until_abandoned(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let judge = FakeJudge::mount(&app.judge0, fake_python).await;
    let teacher = instructor(&app, "teacher").await;
    let (_id, item_id) = code_challenge(&app, &teacher, None).await;
    let alice = learner(&app, "alice").await;
    let body = serde_json::json!({ "language_id": 71, "source": SQUARE });

    let first = app.send(run(&alice, &item_id, Some("k"), &body)).await;
    assert_eq!(first.status, StatusCode::CREATED, "{}", first.text());
    let run_id = uuid::Uuid::parse_str(first.json()["id"].as_str().unwrap()).unwrap();
    sqlx::query("UPDATE code_runs SET status = 'running' WHERE id = $1")
        .bind(run_id)
        .execute(&app.pool)
        .await
        .unwrap();
    let busy = app.send(run(&alice, &item_id, Some("k"), &body)).await;
    assert_eq!(busy.status, StatusCode::CONFLICT, "{}", busy.text());
    assert_eq!(busy.json()["code"], "idempotency-in-progress");
    assert_eq!(judge.submissions(), 1);

    sqlx::query("UPDATE code_runs SET created_at = now() - interval '10 minutes' WHERE id = $1")
        .bind(run_id)
        .execute(&app.pool)
        .await
        .unwrap();
    let retried = app.send(run(&alice, &item_id, Some("k"), &body)).await;
    assert_eq!(retried.status, StatusCode::CREATED, "{}", retried.text());
    assert_ne!(retried.json()["id"], first.json()["id"]);
    let old: String = sqlx::query_scalar("SELECT status FROM code_runs WHERE id = $1")
        .bind(run_id)
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(old, "internal_error");
}

/// A learner's draft on `id` holding one code answer; returns its id.
async fn code_draft(
    app: &TestApp,
    who: &MintedSession,
    id: &str,
    item_id: &str,
    language: i32,
    source: &str,
) -> String {
    let draft = app
        .post_as(
            who,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let saved = app
        .send(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v2/submissions/{sub_id}/draft"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &who.cookie)
                .header(header::IF_MATCH, "1")
                .body(Body::from(
                    serde_json::json!({ "answers": {
                        item_id: { "kind": "code", "language": language, "source": source }
                    } })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    sub_id
}

/// BUG-370 + the grade branches: a manual submit refuses what the learner
/// can fix (runner internal error 503, disallowed language 422); the timer
/// sweep always finalizes - internal error / a run it cannot finish go to
/// manual review, a compile error, a disallowed language or NUL output
/// score what they earned.
#[sqlx::test(migrations = "../../migrations")]
async fn timer_sweep_finalizes_every_code_outcome(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    FakeJudge::mount(&app.judge0, fake_python).await;
    let teacher = instructor(&app, "teacher").await;
    let (id, item_id) = code_challenge(&app, &teacher, Some(60)).await;
    let submit = |who: &MintedSession, sub: &str, language: i32, source: &str| {
        let body = serde_json::json!({ "answers": {
            &item_id: { "kind": "code", "language": language, "source": source }
        } });
        let (cookie, uri) = (
            who.cookie.clone(),
            format!("/api/v2/submissions/{sub}/submit"),
        );
        Request::builder()
            .method("POST")
            .uri(uri)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, cookie)
            .body(Body::from(body.to_string()))
            .unwrap()
    };

    let bob = learner(&app, "bob").await;
    let bob_sub = code_draft(&app, &bob, &id, &item_id, 71, "BOOM").await;
    let refused = app.send(submit(&bob, &bob_sub, 71, "BOOM")).await;
    assert_eq!(
        refused.status,
        StatusCode::SERVICE_UNAVAILABLE,
        "{}",
        refused.text()
    );
    assert_eq!(refused.json()["details"]["is_retryable"], false);

    let carol = learner(&app, "carol").await;
    let carol_sub = code_draft(&app, &carol, &id, &item_id, 63, SQUARE).await;
    let refused = app.send(submit(&carol, &carol_sub, 63, SQUARE)).await;
    assert_eq!(
        refused.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        refused.text()
    );
    assert_eq!(refused.json()["code"], "language-not-allowed");

    let dave = learner(&app, "dave").await;
    let dave_sub = code_draft(&app, &dave, &id, &item_id, 71, "SYNTAX").await;
    let erin = learner(&app, "erin").await;
    let erin_sub = code_draft(&app, &erin, &id, &item_id, 71, r"print('\0')  # NUL").await;
    // Frank's final run is still executing (another hand-in, or a crashed
    // worker a moment ago): the sweep must not wait on it.
    let frank = learner(&app, "frank").await;
    let frank_sub = code_draft(&app, &frank, &id, &item_id, 71, SQUARE).await;
    sqlx::query(
        "INSERT INTO code_runs (assessment_id, item_id, submission_id, user_id, purpose, status,
                                language_id, source_sha256, idempotency_key, total, started_at)
         SELECT s.assessment_id, $2, s.id, s.user_id, 'final', 'running', 71, x.h,
                'final:' || s.id || ':' || $2::text || ':71:' || x.h, 2, now()
         FROM submissions s, (SELECT encode(sha256(convert_to($3, 'UTF8')), 'hex') AS h) x
         WHERE s.id = $1",
    )
    .bind(uuid::Uuid::parse_str(&frank_sub).unwrap())
    .bind(uuid::Uuid::parse_str(&item_id).unwrap())
    .bind(SQUARE)
    .execute(&app.pool)
    .await
    .unwrap();

    sqlx::query(
        "UPDATE submissions SET started_at = now() - interval '3 minutes' WHERE status = 'draft'",
    )
    .execute(&app.pool)
    .await
    .unwrap();
    let swept =
        ab_domain::grading::SubmissionsService::sweep_expired_drafts(&app.code_runner(), None, 10)
            .await
            .unwrap();
    assert_eq!(swept, 5);
    for (sub, status, score) in [
        (&bob_sub, "pending", None),
        (&carol_sub, "published", Some(0.0)),
        (&dave_sub, "published", Some(0.0)),
        (&erin_sub, "published", Some(0.0)),
        (&frank_sub, "pending", None),
    ] {
        let (got, final_score): (String, Option<f64>) =
            sqlx::query_as("SELECT status, final_score FROM submissions WHERE id = $1")
                .bind(uuid::Uuid::parse_str(sub).unwrap())
                .fetch_one(&app.pool)
                .await
                .unwrap();
        assert_eq!((got.as_str(), final_score), (status, score), "{sub}");
    }
}

/// L-6: the learner lists their own runs of an item (the submission's
/// final run by `submission_id` + `purpose=final`), the per-item reference
/// check replays under its `Idempotency-Key` with a typed status, and
/// `GET /code/runner` answers the runner state with the languages.
#[sqlx::test(migrations = "../../migrations")]
async fn run_history_item_reference_check_and_runner_state(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let judge = FakeJudge::mount(&app.judge0, fake_python).await;
    let teacher = instructor(&app, "teacher").await;
    let (id, item_id) = code_challenge(&app, &teacher, None).await;
    let alice = learner(&app, "alice").await;
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let visible = app
        .send(run(
            &alice,
            &item_id,
            None,
            &serde_json::json!({ "language_id": 71, "source": SQUARE }),
        ))
        .await;
    assert_eq!(visible.status, StatusCode::CREATED, "{}", visible.text());
    let submitted = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": {
                &item_id: { "kind": "code", "language": 71, "source": SQUARE }
            } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());

    let runs = format!("/api/v2/assessment-items/{item_id}/runs");
    let all = app.get_as(&alice, &runs).await;
    assert_eq!(all.status, StatusCode::OK, "{}", all.text());
    let all = all.json();
    assert_eq!(all.as_array().unwrap().len(), 2, "{all}");
    assert_eq!(all[0]["purpose"], "final");
    assert_eq!(all[1]["purpose"], "visible");
    // Hidden data stays masked in the list too.
    assert!(all[0]["cases"][1]["stdin"].is_null());
    let final_run = app
        .get_as(
            &alice,
            &format!("{runs}?submission_id={sub_id}&purpose=final"),
        )
        .await
        .json();
    assert_eq!(final_run.as_array().unwrap().len(), 1);
    assert_eq!(final_run[0]["submission_id"], sub_id.as_str());
    // Own runs only.
    assert!(
        app.get_as(&teacher, &runs)
            .await
            .json()
            .as_array()
            .unwrap()
            .is_empty()
    );

    let check = |who: &MintedSession| {
        Request::builder()
            .method("POST")
            .uri(format!(
                "/api/v2/assessment-items/{item_id}/reference-check"
            ))
            .header(header::COOKIE, &who.cookie)
            .header("idempotency-key", "check-1")
            .body(Body::empty())
            .unwrap()
    };
    assert_eq!(app.send(check(&alice)).await.status, StatusCode::FORBIDDEN);
    let first = app.send(check(&teacher)).await;
    assert_eq!(first.status, StatusCode::OK, "{}", first.text());
    assert_eq!(first.json()["results"][0]["status"], "accepted");
    assert_eq!(first.json()["results"][1]["status"], "missing_solution");
    let spent = judge.submissions();
    let replay = app.send(check(&teacher)).await;
    assert_eq!(replay.status, StatusCode::OK);
    assert_eq!(replay.json(), first.json());
    assert_eq!(judge.submissions(), spent, "a replay spends no runner time");

    let runner = app.get_as(&alice, "/api/v2/code/runner").await;
    assert_eq!(runner.status, StatusCode::OK, "{}", runner.text());
    assert_eq!(runner.json()["runner_configured"], true);
    let ids: Vec<i64> = runner.json()["languages"]
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["id"].as_i64().unwrap())
        .collect();
    assert_eq!(ids, [71, 62]);
}
