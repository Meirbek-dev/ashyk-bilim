//! The AI subsystem end to end (P8), against the wiremock OpenAI fake:
//!
//! - course Q&A over the AG-UI SSE transport: text deltas, the citations
//!   tool call, `RUN_FINISHED`, the persisted thread + messages, the run
//!   journal, and the `client_turn_id` replay;
//! - submission analysis inline (record + `latest`), then queued and driven
//!   through the worker entry point (events + final artifact);
//! - cancelling a queued run;
//! - the monthly budget → 503 `ai-budget-exhausted`;
//! - the master switch off → 503 `ai-disabled`;
//! - the admin views gate (`platform:read:platform`) and the usage numbers;
//! - capabilities for a learner and a teacher.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::time::Duration;

use ab_core::id::AiRunId;
use ab_testkit::llm::{mount_json_reply, mount_stream_reply};
use ab_testkit::{MintedSession, TestApp};
use axum::http::StatusCode;
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

async fn platform_reader(app: &TestApp, name: &str) -> MintedSession {
    let user = app
        .create_user(name, &format!("{name}@example.com"), &["admin"])
        .await;
    app.mint_session_for(user, &["platform:read:platform"])
        .await
}

/// A published public course with one published lesson; returns its id.
async fn published_course(app: &TestApp, teacher: &MintedSession, name: &str) -> String {
    let course = app
        .post_as(
            teacher,
            "/api/v2/courses",
            &serde_json::json!({ "name": name, "description": "Monads, gently." }),
        )
        .await;
    assert_eq!(course.status, StatusCode::CREATED, "{}", course.text());
    let course_id = course.json()["id"].as_str().unwrap().to_owned();
    let published = app
        .post_as(
            teacher,
            &format!("/api/v2/courses/{course_id}/lifecycle"),
            &serde_json::json!({ "action": "publish" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    let chapter = app
        .post_as(
            teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &serde_json::json!({ "name": "Week 1" }),
        )
        .await;
    let chapter_id = chapter.json()["id"].as_str().unwrap().to_owned();
    let activity = app
        .post_as(
            teacher,
            &format!("/api/v2/chapters/{chapter_id}/activities"),
            &serde_json::json!({
                "name": "Lesson 1", "activity_type": "video", "activity_sub_type": "video_youtube",
            }),
        )
        .await;
    assert_eq!(activity.status, StatusCode::CREATED, "{}", activity.text());
    let activity_id = activity.json()["id"].as_str().unwrap().to_owned();
    let flipped = app
        .patch_as(
            teacher,
            &format!("/api/v2/activities/{activity_id}"),
            &serde_json::json!({ "published": true }),
        )
        .await;
    assert_eq!(flipped.status, StatusCode::OK, "{}", flipped.text());
    course_id
}

/// A published quiz with one essay item in `course_id`, submitted by
/// `alice`; returns the submission id.
async fn submitted_essay(
    app: &TestApp,
    teacher: &MintedSession,
    alice: &MintedSession,
    course_id: &str,
) -> String {
    let chapter = app
        .post_as(
            teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &serde_json::json!({ "name": "Week 2" }),
        )
        .await;
    let chapter_id = chapter.json()["id"].as_str().unwrap().to_owned();
    let created = app
        .post_as(
            teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Essay" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
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
    let published = app
        .post_as(
            teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    let draft = app
        .post_as(
            alice,
            &format!("/api/v2/assessments/{id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let sub_id = draft.json()["id"].as_str().unwrap().to_owned();
    let submitted = app
        .post_as(
            alice,
            &format!("/api/v2/submissions/{sub_id}/submit"),
            &serde_json::json!({ "answers": { &essay_id: { "kind": "open_text", "text": "Because." } } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    sub_id
}

fn analysis_reply(sub_id: &str) -> serde_json::Value {
    serde_json::json!({
        "summary": "The learner answered in one word.",
        "knowledge_gaps": [{
            "concept": "Argumentation", "severity": "high",
            "evidence": "\"Because.\" is not an argument.",
            "remediation_goal": "Write three supporting sentences."
        }],
        "next_action": "Assign a structured rewrite.",
        "citations": [
            { "citation_id": format!("submission:{sub_id}"), "label": "Submission", "source_type": "submission",
              "excerpt": "Because.", "confidence": 0.9 },
            { "citation_id": "made-up", "label": "Ghost", "source_type": "activity", "excerpt": "?" }
        ],
        "confidence": "high",
        "language": "en"
    })
}

/// Read the body until `needle` appears or `secs` pass.
async fn read_until(response: &mut reqwest::Response, buffer: &mut String, needle: &str) {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    while !buffer.contains(needle) {
        let chunk = tokio::time::timeout_at(deadline, response.chunk())
            .await
            .unwrap_or_else(|_| panic!("timed out waiting for {needle}; got {buffer:?}"))
            .unwrap()
            .unwrap_or_else(|| panic!("stream ended before {needle}; got {buffer:?}"));
        buffer.push_str(&String::from_utf8_lossy(&chunk));
    }
}

/// Every `data:` line of an SSE body, parsed.
fn events(body: &str) -> Vec<serde_json::Value> {
    body.lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .filter_map(|data| serde_json::from_str(data.trim()).ok())
        .collect()
}

#[sqlx::test(migrations = "../../migrations")]
async fn course_qa_streams_persists_and_replays(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let course_id = published_course(&app, &teacher, "Streams").await;
    mount_stream_reply(
        &app.llm,
        &serde_json::json!({
            "answer_markdown": "A **monad** is a monoid in the category of endofunctors.\nSee lesson 1.",
            "citations": [{
                "citation_id": format!("course:{course_id}"), "label": "Streams",
                "source_type": "course", "excerpt": "Monads, gently.", "confidence": 0.8
            }],
            "confidence": "high",
            "out_of_scope": false,
            "follow_up_suggestions": ["What is a functor?"]
        }),
    )
    .await;
    let base = app.serve().await;
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "threadId": "client-thread-1", "runId": "client-run-1",
        "messages": [{ "id": "m1", "role": "user", "content": "What is a monad?" }],
        "forwardedProps": { "client_turn_id": "turn-1", "language": "en" }
    });

    let mut stream = client
        .post(format!("{base}/api/v2/ai/qa/{course_id}/chat"))
        .header("cookie", &alice.cookie)
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(stream.status(), StatusCode::OK);
    assert!(
        stream.headers()["content-type"]
            .to_str()
            .unwrap()
            .starts_with("text/event-stream")
    );
    let mut buffer = String::new();
    read_until(&mut stream, &mut buffer, "RUN_FINISHED").await;
    let parsed = events(&buffer);
    let types: Vec<&str> = parsed.iter().filter_map(|e| e["type"].as_str()).collect();
    assert_eq!(types[0], "RUN_STARTED");
    assert_eq!(types[1], "TEXT_MESSAGE_START");
    assert!(types.contains(&"TEXT_MESSAGE_CONTENT"));
    assert!(types.contains(&"TEXT_MESSAGE_END"));
    assert!(types.contains(&"TOOL_CALL_RESULT"), "{types:?}");
    assert_eq!(types.last(), Some(&"RUN_FINISHED"));
    let text: String = parsed
        .iter()
        .filter(|e| e["type"] == "TEXT_MESSAGE_CONTENT")
        .filter_map(|e| e["delta"].as_str())
        .collect();
    assert_eq!(
        text,
        "A **monad** is a monoid in the category of endofunctors.\nSee lesson 1."
    );
    let deltas = parsed
        .iter()
        .filter(|e| e["type"] == "TEXT_MESSAGE_CONTENT")
        .count();
    assert!(deltas > 3, "expected several deltas, got {deltas}");
    let finished = parsed.last().unwrap();
    assert_eq!(finished["threadId"], "client-thread-1");
    assert_eq!(finished["result"]["confidence"], "high");
    assert_eq!(
        finished["result"]["follow_up_suggestions"][0],
        "What is a functor?"
    );
    let thread_id = finished["result"]["thread_id"].as_str().unwrap().to_owned();
    let citations = parsed
        .iter()
        .find(|e| e["type"] == "TOOL_CALL_RESULT")
        .unwrap();
    let content: serde_json::Value =
        serde_json::from_str(citations["content"].as_str().unwrap()).unwrap();
    assert_eq!(
        content["citations"][0]["citation_id"],
        format!("course:{course_id}")
    );

    // The thread and both messages are persisted; the run finished.
    let threads = app
        .get_as(&alice, &format!("/api/v2/ai/qa/{course_id}/threads"))
        .await;
    assert_eq!(threads.status, StatusCode::OK, "{}", threads.text());
    let threads = threads.json();
    assert_eq!(threads.as_array().unwrap().len(), 1);
    assert_eq!(threads[0]["id"], thread_id);
    assert_eq!(threads[0]["message_count"], 2);
    assert_eq!(threads[0]["title"], "What is a monad?");
    let messages = app
        .get_as(
            &alice,
            &format!("/api/v2/ai/qa/{course_id}/threads/{thread_id}"),
        )
        .await;
    assert_eq!(messages.status, StatusCode::OK);
    let messages = messages.json();
    assert_eq!(messages[0]["role"], "user");
    assert_eq!(messages[0]["client_turn_id"], "turn-1");
    assert_eq!(messages[1]["role"], "assistant");
    assert_eq!(messages[1]["confidence"], "high");
    assert_eq!(
        messages[1]["citations"]["citations"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let (run_id, status): (uuid::Uuid, String) =
        sqlx::query_as("SELECT id, status FROM ai_runs ORDER BY created_at DESC LIMIT 1")
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(status, "succeeded");
    let journal = app
        .get_as(&alice, &format!("/api/v2/ai/runs/{run_id}/events"))
        .await;
    assert_eq!(journal.status, StatusCode::OK);
    let kinds: Vec<String> = journal
        .json()
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["event_type"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(kinds.first().map(String::as_str), Some("running"));
    assert_eq!(kinds.last().map(String::as_str), Some("finished"));
    assert!(kinds.iter().any(|k| k == "model_started"));
    // Strangers see neither the thread nor the run.
    let bob = learner(&app, "bob").await;
    let hidden = app
        .get_as(
            &bob,
            &format!("/api/v2/ai/qa/{course_id}/threads/{thread_id}"),
        )
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);
    let hidden_run = app.get_as(&bob, &format!("/api/v2/ai/runs/{run_id}")).await;
    assert_eq!(hidden_run.status, StatusCode::NOT_FOUND);

    // Retrying the same client turn replays without a model call.
    let mut replay = client
        .post(format!("{base}/api/v2/ai/qa/{course_id}/chat"))
        .header("cookie", &alice.cookie)
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(replay.status(), StatusCode::OK);
    let mut replayed = String::new();
    read_until(&mut replay, &mut replayed, "RUN_FINISHED").await;
    let replayed = events(&replayed);
    assert_eq!(replayed.last().unwrap()["result"]["replayed"], true);
    let stream_calls = app.llm.received_requests().await.unwrap().len();
    assert_eq!(stream_calls, 1, "the replay must not call the model");

    // The same turn id with another question is a conflict.
    let mut conflict = body.clone();
    conflict["messages"][0]["content"] = "Something else".into();
    let res = client
        .post(format!("{base}/api/v2/ai/qa/{course_id}/chat"))
        .header("cookie", &alice.cookie)
        .json(&conflict)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CONFLICT);

    // Deleting the thread removes it from the list.
    let deleted = app
        .delete_as(
            &alice,
            &format!("/api/v2/ai/qa/{course_id}/threads/{thread_id}"),
        )
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let after = app
        .get_as(&alice, &format!("/api/v2/ai/qa/{course_id}/threads"))
        .await;
    assert_eq!(after.json().as_array().unwrap().len(), 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn submission_analysis_inline_queued_cancelled_and_reported(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let admin = platform_reader(&app, "admin").await;
    let course_id = published_course(&app, &teacher, "Analysis").await;
    let sub_id = submitted_essay(&app, &teacher, &alice, &course_id).await;
    mount_json_reply(&app.llm, &analysis_reply(&sub_id)).await;

    // Nothing yet.
    let none = app
        .get_as(
            &alice,
            &format!("/api/v2/ai/submission-analysis/{sub_id}/latest"),
        )
        .await;
    assert_eq!(none.status, StatusCode::OK);
    assert!(none.json().is_null());

    // Inline: the owner analyses their own work.
    let analysed = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/submission-analysis/{sub_id}/analyze"),
            &serde_json::json!({ "language": "en" }),
        )
        .await;
    assert_eq!(analysed.status, StatusCode::OK, "{}", analysed.text());
    let analysed = analysed.json();
    assert_eq!(analysed["submission_id"], sub_id);
    assert_eq!(analysed["gap_count"], 1);
    assert_eq!(analysed["language"], "en");
    assert_eq!(
        analysed["model_name"],
        format!("openai:{}", ab_testkit::llm::TEST_MODEL)
    );
    assert_eq!(
        analysed["analysis"]["knowledge_gaps"][0]["concept"],
        "Argumentation"
    );
    // Only the citation naming a real source survived validation.
    assert_eq!(
        analysed["evidence"]["citations"].as_array().unwrap().len(),
        1
    );
    let latest = app
        .get_as(
            &alice,
            &format!("/api/v2/ai/submission-analysis/{sub_id}/latest"),
        )
        .await;
    assert_eq!(latest.json()["id"], analysed["id"]);
    let run_id = analysed["run_id"].as_str().unwrap().to_owned();
    let run = app
        .get_as(&alice, &format!("/api/v2/ai/runs/{run_id}"))
        .await;
    assert_eq!(run.status, StatusCode::OK, "{}", run.text());
    assert_eq!(run.json()["status"], "succeeded");
    assert_eq!(run.json()["output_tokens"], 7);
    assert!(run.json()["input_tokens"].as_i64().unwrap() > 0);
    // A stranger cannot see the submission's analysis.
    let bob = learner(&app, "bob").await;
    let hidden = app
        .get_as(
            &bob,
            &format!("/api/v2/ai/submission-analysis/{sub_id}/latest"),
        )
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);

    // Queued: the teacher enqueues; the worker entry point executes it.
    let queued = app
        .post_as(
            &teacher,
            &format!("/api/v2/ai/submission-analysis/{sub_id}/analyze/queue"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(queued.status, StatusCode::ACCEPTED, "{}", queued.text());
    let queued = queued.json();
    assert_eq!(queued["status"], "queued");
    assert_eq!(queued["kind"], "submission_analysis");
    let queued_id = queued["id"].as_str().unwrap().to_owned();
    let (kind, payload): (String, serde_json::Value) =
        sqlx::query_as("SELECT kind, payload FROM jobs ORDER BY created_at DESC LIMIT 1")
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(kind, "ai:execute_run");
    assert_eq!(payload["run_id"], queued_id.as_str());
    app.ai_service()
        .execute_queued(AiRunId(uuid::Uuid::parse_str(&queued_id).unwrap()))
        .await
        .unwrap();
    let done = app
        .get_as(&teacher, &format!("/api/v2/ai/runs/{queued_id}"))
        .await;
    assert_eq!(done.json()["status"], "succeeded", "{}", done.text());
    let journal = app
        .get_as(&teacher, &format!("/api/v2/ai/runs/{queued_id}/events"))
        .await;
    let kinds: Vec<String> = journal
        .json()
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["event_type"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(
        kinds,
        [
            "queued",
            "running",
            "collecting_context",
            "budget_checked",
            "model_started",
            "validating_output",
            "saving_artifact",
            "finished"
        ]
    );
    let artifacts = app
        .get_as(&teacher, &format!("/api/v2/ai/runs/{queued_id}/artifacts"))
        .await;
    let artifacts = artifacts.json();
    assert_eq!(artifacts.as_array().unwrap().len(), 1);
    assert_eq!(artifacts[0]["kind"], "submission_analysis");
    assert_eq!(artifacts[0]["final"], true);
    assert_eq!(
        artifacts[0]["content"]["summary"],
        "The learner answered in one word."
    );

    // Cancel a queued run: it flips to aborted and the worker skips it.
    let queued_again = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/submission-analysis/{sub_id}/analyze/queue"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(
        queued_again.status,
        StatusCode::ACCEPTED,
        "{}",
        queued_again.text()
    );
    let cancel_id = queued_again.json()["id"].as_str().unwrap().to_owned();
    let cancelled = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/runs/{cancel_id}/cancel"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(cancelled.status, StatusCode::OK, "{}", cancelled.text());
    assert_eq!(cancelled.json()["status"], "aborted");
    app.ai_service()
        .execute_queued(AiRunId(uuid::Uuid::parse_str(&cancel_id).unwrap()))
        .await
        .unwrap();
    let still = app
        .get_as(&alice, &format!("/api/v2/ai/runs/{cancel_id}"))
        .await;
    assert_eq!(still.json()["status"], "aborted");
    let journal = app
        .get_as(&alice, &format!("/api/v2/ai/runs/{cancel_id}/events"))
        .await;
    let kinds: Vec<String> = journal
        .json()
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["event_type"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(kinds, ["queued", "cancelled"]);
    // Cancelling a finished run is a no-op.
    let again = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/runs/{run_id}/cancel"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(again.json()["status"], "succeeded");

    // Admin views: a teacher is refused; a platform reader sees the runs.
    let refused = app.get_as(&teacher, "/api/v2/ai/admin/runs").await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN);
    let refused_usage = app.get_as(&teacher, "/api/v2/ai/usage").await;
    assert_eq!(refused_usage.status, StatusCode::FORBIDDEN);
    let runs = app
        .get_as(
            &admin,
            "/api/v2/ai/admin/runs?kind=submission_analysis&limit=2",
        )
        .await;
    assert_eq!(runs.status, StatusCode::OK, "{}", runs.text());
    let page = runs.json();
    assert_eq!(page["items"].as_array().unwrap().len(), 2);
    assert!(page["next_cursor"].is_string());
    let next = page["next_cursor"].as_str().unwrap();
    let rest = app
        .get_as(
            &admin,
            &format!("/api/v2/ai/admin/runs?kind=submission_analysis&limit=2&cursor={next}"),
        )
        .await;
    assert_eq!(rest.json()["items"].as_array().unwrap().len(), 1);
    assert!(rest.json()["next_cursor"].is_null());
    assert_eq!(page["items"][0]["feature"], "submission_analysis");
    assert_eq!(page["items"][0]["context"]["submission_id"], sub_id);
    assert!(page["items"][0]["context"].get("question").is_none());
    let aborted = app
        .get_as(&admin, "/api/v2/ai/admin/runs?status=aborted")
        .await;
    assert_eq!(aborted.json()["items"].as_array().unwrap().len(), 1);
    let detail = app
        .get_as(&admin, &format!("/api/v2/ai/admin/runs/{queued_id}"))
        .await;
    assert_eq!(detail.status, StatusCode::OK, "{}", detail.text());
    let detail = detail.json();
    assert_eq!(detail["run"]["status"], "succeeded");
    assert_eq!(detail["events"].as_array().unwrap().len(), 8);
    assert_eq!(detail["artifacts"].as_array().unwrap().len(), 1);
    assert_eq!(detail["evidence"].as_array().unwrap().len(), 1);
    let settings = app.get_as(&admin, "/api/v2/ai/admin/settings").await;
    assert_eq!(settings.status, StatusCode::OK);
    let settings = settings.json();
    assert_eq!(settings["ai_enabled"], true);
    assert_eq!(settings["provider_ready"], true);
    assert_eq!(settings["model"], ab_testkit::llm::TEST_MODEL);
    assert_eq!(settings["effective"]["openai_api_key"], "[redacted]");
    assert_eq!(settings["features"].as_array().unwrap().len(), 7);
    let evals = app.get_as(&admin, "/api/v2/ai/admin/evals").await;
    assert_eq!(evals.status, StatusCode::OK);
    assert_eq!(evals.json()["runs"]["succeeded"], 2);
    assert_eq!(evals.json()["runs"]["aborted"], 1);

    // Usage: two finished runs, tokens from both, budget minus tokens.
    let usage = app.get_as(&admin, "/api/v2/ai/usage/budget").await;
    assert_eq!(usage.status, StatusCode::OK, "{}", usage.text());
    let usage = usage.json();
    assert_eq!(usage["total_runs"], 3);
    assert_eq!(usage["output_tokens"], 14);
    let input = usage["input_tokens"].as_i64().unwrap();
    assert!(input > 0);
    assert_eq!(usage["monthly_budget"], 1_000_000);
    assert_eq!(usage["remaining_budget"], 1_000_000 - input - 14);
    assert_eq!(usage["users"].as_array().unwrap().len(), 2);
}

#[sqlx::test(migrations = "../../migrations")]
async fn budget_and_master_switch_answer_503(pool: PgPool) {
    let app = TestApp::spawn_with(pool.clone(), |config| {
        config.ai.monthly_token_budget = 5;
    })
    .await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let course_id = published_course(&app, &teacher, "Budget").await;
    let sub_id = submitted_essay(&app, &teacher, &alice, &course_id).await;
    let exhausted = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/submission-analysis/{sub_id}/analyze"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(
        exhausted.status,
        StatusCode::SERVICE_UNAVAILABLE,
        "{}",
        exhausted.text()
    );
    let problem = exhausted.json();
    assert_eq!(problem["code"], "ai-budget-exhausted");
    assert_eq!(problem["details"]["monthly_token_budget"], 5);
    assert_eq!(exhausted.content_type(), "application/problem+json");
    let no_run: i64 = sqlx::query_scalar("SELECT count(*) FROM ai_runs")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(no_run, 0, "a refused request must not open a run");

    let off = TestApp::spawn_with(pool, |config| {
        config.ai.ai_enabled = false;
    })
    .await;
    let teacher = instructor(&off, "teacher2").await;
    let course_id = published_course(&off, &teacher, "Off").await;
    let disabled = off
        .post_as(
            &teacher,
            &format!("/api/v2/ai/course-analysis/{course_id}/analyze"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(
        disabled.status,
        StatusCode::SERVICE_UNAVAILABLE,
        "{}",
        disabled.text()
    );
    assert_eq!(disabled.json()["code"], "ai-disabled");
    let capabilities = off
        .get_as(
            &teacher,
            &format!("/api/v2/ai/capabilities/scope/{course_id}"),
        )
        .await;
    assert_eq!(capabilities.status, StatusCode::OK);
    assert_eq!(capabilities.json()["available"], false);
    assert_eq!(capabilities.json()["reason"], "ai_disabled");
}

#[sqlx::test(migrations = "../../migrations")]
async fn capabilities_follow_role_and_surface(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let course_id = published_course(&app, &teacher, "Scope").await;

    let as_teacher = app
        .get_as(
            &teacher,
            &format!("/api/v2/ai/capabilities/scope/{course_id}?surface=course-page"),
        )
        .await;
    assert_eq!(as_teacher.status, StatusCode::OK, "{}", as_teacher.text());
    let as_teacher = as_teacher.json();
    assert_eq!(as_teacher["available"], true);
    assert_eq!(as_teacher["role"], "teacher");
    assert_eq!(as_teacher["context_visibility"], "teacher");
    assert_eq!(as_teacher["modes"], serde_json::json!(["ask", "analyze"]));
    assert_eq!(as_teacher["context"]["course_label"], "Scope");
    assert!(as_teacher["context"]["source_count"].as_u64().unwrap() >= 2);
    assert_eq!(as_teacher["features"][0]["key"], "course_qa_enabled");

    let as_learner = app
        .get_as(
            &alice,
            &format!("/api/v2/ai/capabilities/scope/{course_id}"),
        )
        .await;
    let as_learner = as_learner.json();
    assert_eq!(as_learner["role"], "student");
    assert_eq!(
        as_learner["modes"],
        serde_json::json!(["ask", "explain", "practice"])
    );
    assert_eq!(as_learner["surface"], "course-page");

    let unknown = app
        .get_as(
            &alice,
            "/api/v2/ai/capabilities/scope/00000000-0000-7000-8000-000000000000",
        )
        .await;
    assert_eq!(unknown.status, StatusCode::OK);
    assert_eq!(unknown.json()["available"], false);
    assert_eq!(unknown.json()["reason"], "course_not_found");
}
