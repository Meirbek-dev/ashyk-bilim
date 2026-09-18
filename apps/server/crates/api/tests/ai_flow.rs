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
    app.publish_course(&course_id).await;
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
    // The full AG-UI `RunAgentInput` shape `@ag-ui/client` sends.
    let body = serde_json::json!({
        "threadId": "client-thread-1", "runId": "client-run-1",
        "messages": [{ "id": "m1", "role": "user", "content": "What is a monad?" }],
        "forwardedProps": { "client_turn_id": "turn-1", "language": "en" },
        "tools": [], "context": [], "state": {}
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
    // `citations` is an object on every turn (the documented schema).
    assert!(messages[0]["citations"].is_object(), "{}", messages[0]);
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
    // The run stream accepts the same AG-UI input and settles from the journal.
    let mut followed = client
        .post(format!("{base}/api/v2/ai/runs/{run_id}/stream"))
        .header("cookie", &alice.cookie)
        .json(&serde_json::json!({
            "threadId": "client-thread-1", "runId": "client-run-2",
            "messages": [], "forwardedProps": {}, "tools": [], "context": [], "state": {}
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(followed.status(), StatusCode::OK);
    let mut journal_stream = String::new();
    read_until(&mut followed, &mut journal_stream, "RUN_FINISHED").await;
    assert_eq!(events(&journal_stream)[0]["runId"], "client-run-2");
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

/// UX-037: without a provider, draft mode answers in the requested
/// language (the legacy text was Russian regardless).
#[sqlx::test(migrations = "../../migrations")]
async fn draft_mode_answers_in_the_requested_language(pool: PgPool) {
    let app = TestApp::spawn_with(pool, |config| {
        config.ai.openai_api_key = None;
        config.ai.ai_draft_mode_enabled = true;
    })
    .await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let course_id = published_course(&app, &teacher, "Draft").await;
    let base = app.serve().await;
    let client = reqwest::Client::new();
    let mut stream = client
        .post(format!("{base}/api/v2/ai/qa/{course_id}/chat"))
        .header("cookie", &alice.cookie)
        .json(&serde_json::json!({
            "threadId": "t", "runId": "r",
            "messages": [{ "id": "m1", "role": "user", "content": "Монада дегеніміз не?" }],
            "forwardedProps": { "client_turn_id": "turn-kk", "language": "kk" },
            "tools": [], "context": [], "state": {}
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(stream.status(), StatusCode::OK);
    let mut buffer = String::new();
    read_until(&mut stream, &mut buffer, "RUN_FINISHED").await;
    let parsed = events(&buffer);
    let answer: String = parsed
        .iter()
        .filter(|e| e["type"] == "TEXT_MESSAGE_CONTENT")
        .filter_map(|e| e["delta"].as_str())
        .collect();
    assert!(answer.starts_with("Курс бойынша"), "{answer}");
    let finished = parsed.last().unwrap();
    assert_eq!(finished["type"], "RUN_FINISHED");
    assert_eq!(
        finished["result"]["follow_up_suggestions"][0],
        "Бұл сұраққа оқытушыдан жауап беруін сұрау"
    );
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

// ── File-submission attempts as analysis subjects ───────────────────────────

/// The browser's part of an upload: create, PUT to storage, finalize.
async fn finalized_upload(
    app: &TestApp,
    session: &MintedSession,
    mime: &str,
    payload: &[u8],
) -> String {
    let created = app
        .post_as(
            session,
            "/api/v2/uploads",
            &serde_json::json!({ "purpose": "file-submission", "mime": mime,
                                  "size_bytes": payload.len() }),
        )
        .await;
    assert_eq!(created.status, StatusCode::OK, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let put_url = created.json()["put_url"].as_str().unwrap().to_owned();
    let put = reqwest::Client::new()
        .put(&put_url)
        .header("content-type", mime)
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

/// A published file-submission activity in `course_id`, with one markdown
/// essay submitted by `alice`; returns `(attempt_id, activity_id)`.
async fn submitted_file_attempt(
    app: &TestApp,
    teacher: &MintedSession,
    alice: &MintedSession,
    course_id: &str,
) -> (String, String, String) {
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
            "/api/v2/file-submissions",
            &serde_json::json!({
                "chapter_id": chapter_id, "title": "Essay",
                "instructions": "Argue for monads in three paragraphs.",
            }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let fs_id = created.json()["id"].as_str().unwrap().to_owned();
    let activity_id = created.json()["activity_id"].as_str().unwrap().to_owned();
    let published = app
        .post_as(
            teacher,
            &format!("/api/v2/file-submissions/{fs_id}/publish"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    let opened = app
        .post_as(
            alice,
            &format!("/api/v2/file-submissions/{fs_id}/draft"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(opened.status, StatusCode::CREATED, "{}", opened.text());
    let attempt_id = opened.json()["id"].as_str().unwrap().to_owned();
    let upload = finalized_upload(
        app,
        alice,
        "text/markdown",
        b"# Monads\n\nBecause. MONAD-ESSAY-MARKER",
    )
    .await;
    let saved = app
        .patch_as(
            alice,
            &format!("/api/v2/file-submissions/{fs_id}/draft"),
            &serde_json::json!({ "files": [{ "upload_id": upload, "display_name": "essay.md" }] }),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.text());
    let version = saved.json()["version"].as_i64().unwrap();
    let submitted = app
        .send(
            axum::http::Request::builder()
                .method("POST")
                .uri(format!("/api/v2/file-submissions/{fs_id}/submit"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &alice.cookie)
                .header(axum::http::header::IF_MATCH, version.to_string())
                .body(axum::body::Body::from("{}"))
                .unwrap(),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    (attempt_id, activity_id, fs_id)
}

fn remediation_reply() -> serde_json::Value {
    serde_json::json!({
        "title": "Monads, again",
        "learning_objectives": ["State the monad laws"],
        "micro_lecture_markdown": "A monad is a monoid in the category of endofunctors.",
        "practice_questions": [{
            "prompt": "Which law is missing?", "choices": ["left identity", "commutativity"],
            "answer": "left identity", "explanation": "Monads need not commute."
        }],
        "pass_threshold": 70,
        "citations": [],
        "language": "en"
    })
}

/// A file-submission attempt is a first-class subject of the analyst and
/// the remediation generator (DECISIONS 2026-09-12): the same routes take
/// the attempt id, the context carries the submitted text, the records
/// point at the attempt, the owner and the teacher may look, strangers 404,
/// and the queued path re-derives the subject from the run.
#[sqlx::test(migrations = "../../migrations")]
async fn file_attempts_are_analysed_and_remediated(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice_user = app
        .create_user("alice", "alice@example.com", &["user"])
        .await;
    let alice = app
        .mint_session_for(
            alice_user,
            &[
                "assessment:submit:assigned",
                "assessment:read:assigned",
                "file:create:own",
            ],
        )
        .await;
    let course_id = published_course(&app, &teacher, "Files").await;
    let (attempt_id, activity_id, fs_id) =
        submitted_file_attempt(&app, &teacher, &alice, &course_id).await;
    // A second draft, opened before any gate exists (UX-105 below).
    let second_draft = app
        .post_as(
            &alice,
            &format!("/api/v2/file-submissions/{fs_id}/draft"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(
        second_draft.status,
        StatusCode::CREATED,
        "{}",
        second_draft.text()
    );
    let upload2 = finalized_upload(&app, &alice, "text/markdown", b"# v2").await;
    mount_json_reply(&app.llm, &analysis_reply(&attempt_id)).await;

    // Nothing yet, for the teacher; a stranger cannot even ask.
    let none = app
        .get_as(
            &teacher,
            &format!("/api/v2/ai/submission-analysis/{attempt_id}/latest"),
        )
        .await;
    assert_eq!(none.status, StatusCode::OK, "{}", none.text());
    assert!(none.json().is_null());
    let bob = learner(&app, "bob").await;
    assert_eq!(
        app.get_as(
            &bob,
            &format!("/api/v2/ai/submission-analysis/{attempt_id}/latest")
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );

    // Inline analysis by the teacher: the record names the attempt, and
    // the model saw the submitted markdown plus the instructions.
    let analysed = app
        .post_as(
            &teacher,
            &format!("/api/v2/ai/submission-analysis/{attempt_id}/analyze"),
            &serde_json::json!({ "language": "en" }),
        )
        .await;
    assert_eq!(analysed.status, StatusCode::OK, "{}", analysed.text());
    let analysed = analysed.json();
    assert_eq!(analysed["file_submission_attempt_id"], attempt_id.as_str());
    assert!(analysed["submission_id"].is_null());
    assert_eq!(analysed["gap_count"], 1);
    let requests = app.llm.received_requests().await.unwrap();
    let prompt = String::from_utf8_lossy(&requests.last().unwrap().body).into_owned();
    assert!(
        prompt.contains("MONAD-ESSAY-MARKER"),
        "file text missing: {prompt}"
    );
    assert!(prompt.contains("Argue for monads"), "instructions missing");
    assert!(prompt.contains("essay.md"), "file name missing");
    let latest = app
        .get_as(
            &alice,
            &format!("/api/v2/ai/submission-analysis/{attempt_id}/latest"),
        )
        .await;
    assert_eq!(latest.status, StatusCode::OK, "{}", latest.text());
    assert_eq!(latest.json()["id"], analysed["id"]);
    let run_id = analysed["run_id"].as_str().unwrap().to_owned();
    let run = app
        .get_as(&teacher, &format!("/api/v2/ai/runs/{run_id}"))
        .await;
    assert_eq!(run.json()["status"], "succeeded", "{}", run.text());

    // Remediation reuses the analysis; the session points at the attempt
    // and its activity, and the learner can read it.
    app.llm.reset().await;
    mount_json_reply(&app.llm, &remediation_reply()).await;
    let session = app
        .post_as(
            &teacher,
            &format!("/api/v2/ai/remediation/{attempt_id}/generate"),
            &serde_json::json!({ "gate_mode": true, "language": "en" }),
        )
        .await;
    assert_eq!(session.status, StatusCode::OK, "{}", session.text());
    let session = session.json();
    assert_eq!(session["file_submission_attempt_id"], attempt_id.as_str());
    assert!(session["submission_id"].is_null());
    assert_eq!(session["activity_id"], activity_id.as_str());
    assert_eq!(session["analysis_id"], analysed["id"]);
    assert_eq!(session["lecture"]["title"], "Monads, again");
    let session_id = session["id"].as_str().unwrap().to_owned();
    let mine = app
        .get_as(
            &alice,
            &format!("/api/v2/ai/remediation/sessions/{session_id}"),
        )
        .await;
    assert_eq!(mine.status, StatusCode::OK, "{}", mine.text());
    assert_eq!(
        app.get_as(
            &bob,
            &format!("/api/v2/ai/remediation/sessions/{session_id}")
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
    // BUG-141: a learner may not set a gate on their own work; another
    // learner's session list is 403.
    let self_gate = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/remediation/{attempt_id}/generate"),
            &serde_json::json!({ "gate_mode": true, "language": "en" }),
        )
        .await;
    assert_eq!(
        self_gate.status,
        StatusCode::FORBIDDEN,
        "{}",
        self_gate.text()
    );
    assert_eq!(
        app.get_as(
            &bob,
            &format!("/api/v2/ai/remediation/student/{}", alice.user_id)
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );
    // BUG-140: the gate blocks a new file attempt too (draft and start).
    let gated = app
        .post_as(
            &alice,
            &format!("/api/v2/file-submissions/{fs_id}/draft"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(gated.status, StatusCode::FORBIDDEN, "{}", gated.text());
    assert!(
        gated.json()["detail"]
            .as_str()
            .unwrap()
            .contains("REMEDIATION_REQUIRED")
    );
    // UX-105: a draft opened before the gate cannot be handed in while gated.
    let gated_submit = app
        .post_as(
            &alice,
            &format!("/api/v2/file-submissions/{fs_id}/submit"),
            &serde_json::json!({ "files": [{ "upload_id": upload2, "display_name": "v2.md" }] }),
        )
        .await;
    assert_eq!(
        gated_submit.status,
        StatusCode::FORBIDDEN,
        "{}",
        gated_submit.text()
    );
    assert!(gated_submit.text().contains("REMEDIATION_REQUIRED"));
    let passed = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/remediation/sessions/{session_id}/complete"),
            &serde_json::json!({ "score": 80 }),
        )
        .await;
    assert_eq!(passed.status, StatusCode::OK, "{}", passed.text());
    // UX-099: a passed session is final — a lower re-completion is 409, the gate stays lifted.
    let again = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/remediation/sessions/{session_id}/complete"),
            &serde_json::json!({ "score": 40 }),
        )
        .await;
    assert_eq!(again.status, StatusCode::CONFLICT, "{}", again.text());
    assert_eq!(again.json()["code"], "conflict");
    // Course staff without the platform-scoped `platform:read` get 403 on another learner's list.
    assert_eq!(
        app.get_as(
            &teacher,
            &format!("/api/v2/ai/remediation/student/{}", alice.user_id)
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );
    let reopened = app
        .post_as(
            &alice,
            &format!("/api/v2/file-submissions/{fs_id}/draft"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(reopened.status, StatusCode::OK, "{}", reopened.text());
    let handed_in = app
        .post_as(
            &alice,
            &format!("/api/v2/file-submissions/{fs_id}/submit"),
            &serde_json::json!({ "files": [{ "upload_id": upload2, "display_name": "v2.md" }] }),
        )
        .await;
    assert_eq!(handed_in.status, StatusCode::OK, "{}", handed_in.text());

    // Queued analysis: the worker re-derives the attempt from the run.
    app.llm.reset().await;
    mount_json_reply(&app.llm, &analysis_reply(&attempt_id)).await;
    let queued = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/submission-analysis/{attempt_id}/analyze/queue"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(queued.status, StatusCode::ACCEPTED, "{}", queued.text());
    let queued_id = queued.json()["id"].as_str().unwrap().to_owned();
    app.ai_service()
        .execute_queued(AiRunId(uuid::Uuid::parse_str(&queued_id).unwrap()))
        .await
        .unwrap();
    let done = app
        .get_as(&alice, &format!("/api/v2/ai/runs/{queued_id}"))
        .await;
    assert_eq!(done.json()["status"], "succeeded", "{}", done.text());
    let newest = app
        .get_as(
            &alice,
            &format!("/api/v2/ai/submission-analysis/{attempt_id}/latest"),
        )
        .await;
    assert_eq!(newest.json()["run_id"], queued_id.as_str());

    // An unknown id (neither table) is 404, not 500.
    assert_eq!(
        app.get_as(
            &teacher,
            &format!(
                "/api/v2/ai/submission-analysis/{}/latest",
                uuid::Uuid::now_v7()
            )
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
}

/// BUG-126: a gate-mode remediation blocks new attempts on the activity
/// (`REMEDIATION_REQUIRED`, `can_start false`, start → 403) until the
/// learner passes it.
#[sqlx::test(migrations = "../../migrations")]
async fn gate_mode_remediation_blocks_new_attempts_until_passed(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let course_id = published_course(&app, &teacher, "Gate").await;
    let sub_id = submitted_essay(&app, &teacher, &alice, &course_id).await;
    let assessment_id = app
        .get_as(&alice, &format!("/api/v2/submissions/{sub_id}"))
        .await
        .json()["assessment_id"]
        .as_str()
        .unwrap()
        .to_owned();
    let state_url = format!("/api/v2/assessments/{assessment_id}/attempt-state");
    assert_eq!(
        app.get_as(&alice, &state_url).await.json()["can_start"],
        true
    );
    // A draft opened before the gate (UX-105: it cannot be handed in while gated).
    let open_draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{assessment_id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(
        open_draft.status,
        StatusCode::CREATED,
        "{}",
        open_draft.text()
    );
    let draft_id = open_draft.json()["id"].as_str().unwrap().to_owned();

    mount_json_reply(&app.llm, &analysis_reply(&sub_id)).await;
    let analysed = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/submission-analysis/{sub_id}/analyze"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(analysed.status, StatusCode::OK, "{}", analysed.text());
    app.llm.reset().await;
    mount_json_reply(&app.llm, &remediation_reply()).await;
    let session = app
        .post_as(
            &teacher,
            &format!("/api/v2/ai/remediation/{sub_id}/generate"),
            &serde_json::json!({ "gate_mode": true }),
        )
        .await;
    assert_eq!(session.status, StatusCode::OK, "{}", session.text());
    assert_eq!(session.json()["status"], "assigned");
    let session_id = session.json()["id"].as_str().unwrap().to_owned();

    let blocked = app.get_as(&alice, &state_url).await;
    assert_eq!(blocked.json()["can_start"], false, "{}", blocked.text());
    assert_eq!(blocked.json()["can_continue"], false, "{}", blocked.text());
    assert_eq!(
        blocked.json()["disabled_reasons"],
        serde_json::json!(["REMEDIATION_REQUIRED"])
    );
    let refused = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{draft_id}/submit"),
            &serde_json::json!({ "answers": {} }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN, "{}", refused.text());
    assert!(refused.text().contains("REMEDIATION_REQUIRED"));

    let passed = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/remediation/sessions/{session_id}/complete"),
            &serde_json::json!({ "score": 80 }),
        )
        .await;
    assert_eq!(passed.status, StatusCode::OK, "{}", passed.text());
    assert_eq!(passed.json()["status"], "passed");
    let open = app.get_as(&alice, &state_url).await;
    assert_eq!(open.json()["can_continue"], true, "{}", open.text());
    assert_eq!(open.json()["disabled_reasons"], serde_json::json!([]));
    let handed_in = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{draft_id}/submit"),
            &serde_json::json!({ "answers": {} }),
        )
        .await;
    assert_eq!(handed_in.status, StatusCode::OK, "{}", handed_in.text());
}

/// The hourly AI limiter over HTTP: past `analysis_requests_per_hour_per_user`
/// the analyst answers 429 `ai-rate-limited` with the limit in `details`.
#[sqlx::test(migrations = "../../migrations")]
async fn hourly_limit_answers_429(pool: PgPool) {
    let app = TestApp::spawn_with(pool, |config| {
        config.ai.analysis_requests_per_hour_per_user = 0;
    })
    .await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let course_id = published_course(&app, &teacher, "Hourly").await;
    let sub_id = submitted_essay(&app, &teacher, &alice, &course_id).await;
    let limited = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/submission-analysis/{sub_id}/analyze"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(
        limited.status,
        StatusCode::TOO_MANY_REQUESTS,
        "{}",
        limited.text()
    );
    assert_eq!(limited.json()["code"], "ai-rate-limited");
    assert_eq!(limited.json()["details"]["limit"], 0);
    assert!(
        limited
            .headers
            .contains_key(axum::http::header::RETRY_AFTER)
    );
}

/// BUG-128: `language` is `auto`/ru/kk/en (422 otherwise) and a finding
/// review names a finding of the report (`finding-{index}` or its id).
#[sqlx::test(migrations = "../../migrations")]
async fn course_analysis_rejects_unknown_language_and_finding(pool: PgPool) {
    let app = TestApp::spawn_with(pool, |config| {
        config.ai.openai_api_key = None;
        config.ai.ai_draft_mode_enabled = true;
    })
    .await;
    let teacher = instructor(&app, "teacher").await;
    let course_id = published_course(&app, &teacher, "Findings").await;
    let analyze = format!("/api/v2/ai/course-analysis/{course_id}/analyze");
    let bad_language = app
        .post_as(&teacher, &analyze, &serde_json::json!({ "language": "xx" }))
        .await;
    assert_eq!(
        bad_language.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        bad_language.text()
    );
    assert_eq!(bad_language.json()["field_errors"][0]["field"], "language");
    let analysed = app
        .post_as(&teacher, &analyze, &serde_json::json!({ "language": "ru" }))
        .await;
    assert_eq!(analysed.status, StatusCode::OK, "{}", analysed.text());
    let analysis_id = analysed.json()["id"].as_str().unwrap().to_owned();
    let review = format!("/api/v2/ai/course-analysis/{analysis_id}/findings/review");
    let unknown = app
        .post_as(
            &teacher,
            &review,
            &serde_json::json!({ "finding_id": "nope", "action": "accepted" }),
        )
        .await;
    assert_eq!(
        unknown.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        unknown.text()
    );
    assert_eq!(unknown.json()["field_errors"][0]["field"], "finding_id");
    assert_eq!(unknown.json()["field_errors"][0]["code"], "unknown");
    let accepted = app
        .post_as(
            &teacher,
            &review,
            &serde_json::json!({ "finding_id": "finding-0", "action": "accepted" }),
        )
        .await;
    assert_eq!(accepted.status, StatusCode::OK, "{}", accepted.text());
    assert_eq!(
        accepted.json()["report"]["finding_reviews"]["finding-0"]["action"],
        "accepted"
    );

    // BUG-141: a lecture suggestion is dismissed by an id the review carries.
    let critique = app
        .post_as(
            &teacher,
            &format!("/api/v2/ai/lecture-authoring/{course_id}/critique"),
            &serde_json::json!({ "language": "ru" }),
        )
        .await;
    assert_eq!(critique.status, StatusCode::OK, "{}", critique.text());
    let review_id = critique.json()["id"].as_str().unwrap().to_owned();
    let suggestion_id = critique.json()["suggestions"]["suggestions"][0]["suggestion_id"]
        .as_str()
        .unwrap()
        .to_owned();
    let dismiss = format!("/api/v2/ai/lecture-authoring/reviews/{review_id}/dismiss");
    let unknown = app
        .post_as(
            &teacher,
            &dismiss,
            &serde_json::json!({ "suggestion_id": "nope" }),
        )
        .await;
    assert_eq!(
        unknown.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        unknown.text()
    );
    assert_eq!(unknown.json()["field_errors"][0]["code"], "unknown");
    let dismissed = app
        .post_as(
            &teacher,
            &dismiss,
            &serde_json::json!({ "suggestion_id": suggestion_id }),
        )
        .await;
    assert_eq!(dismissed.status, StatusCode::OK, "{}", dismissed.text());
    assert_eq!(
        dismissed.json()["dismissed_suggestion_ids"][0],
        suggestion_id.as_str()
    );
}
