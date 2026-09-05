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
/// compile; anything else prints 0.
fn fake_python(source: &str, stdin: &str) -> CaseVerdict {
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
    assert_eq!(down.headers[header::RETRY_AFTER], "30");
    let run_id = down.json()["details"]["run_id"]
        .as_str()
        .unwrap()
        .to_owned();
    let recorded = app
        .get_as(&alice, &format!("/api/v2/code-runs/{run_id}"))
        .await;
    assert_eq!(recorded.json()["status"], "degraded");
    assert!(recorded.json()["error_message"].as_str().is_some());

    // Submitting is refused (retryable) and the draft stays open …
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let refused = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": {
                &item_id: { "kind": "code", "language": 71, "source": SQUARE }
            } }),
        )
        .await;
    assert_eq!(
        refused.status,
        StatusCode::SERVICE_UNAVAILABLE,
        "{}",
        refused.text()
    );
    assert_eq!(refused.json()["code"], "code-runner-degraded");
    assert_eq!(
        app.get_as(&alice, &format!("/api/v2/submissions/{sub_id}"))
            .await
            .json()["status"],
        "draft"
    );

    // … but the timer cannot wait: the expired draft goes to manual review.
    let saved = app
        .send(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/v2/submissions/{sub_id}/draft"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &alice.cookie)
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
        ab_domain::grading::SubmissionsService::sweep_expired_drafts(&app.code_runner(), 10)
            .await
            .unwrap();
    assert_eq!(swept, 1);
    let mine = app
        .get_as(&alice, &format!("/api/v2/submissions/{sub_id}"))
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
