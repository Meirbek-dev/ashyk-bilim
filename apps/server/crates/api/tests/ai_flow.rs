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
use ab_testkit::llm::{mount_json_reply, mount_json_reply_after, mount_stream_reply};
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
    publish_grade(app, teacher, &sub_id, &essay_id, 10).await;
    sub_id
}

/// The teacher publishes `score` on `item_id` of `sub_id` (BUG-182: the
/// owner may read AI on the work only once its grade is released).
async fn publish_grade(
    app: &TestApp,
    teacher: &MintedSession,
    sub_id: &str,
    item_id: &str,
    score: u32,
) {
    let review = app
        .get_as(teacher, &format!("/api/v2/submissions/{sub_id}/review"))
        .await;
    assert_eq!(review.status, StatusCode::OK, "{}", review.text());
    let version = review.json()["version"].as_i64().unwrap();
    let body = serde_json::json!({
        "action": "publish",
        "item_grades": [{ "item_id": item_id, "score": score }],
    });
    let published = app
        .send(
            axum::http::Request::builder()
                .method("PATCH")
                .uri(format!("/api/v2/submissions/{sub_id}/grade"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .header(axum::http::header::IF_MATCH, format!("\"{version}\""))
                .body(axum::body::Body::from(body.to_string()))
                .unwrap(),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
    assert_eq!(published.json()["release_state"], "visible");
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
    // UX-156: an out-of-range page size is a 422, not a silent clamp.
    let refused = app
        .get_as(
            &alice,
            &format!("/api/v2/ai/qa/{course_id}/threads?limit=51"),
        )
        .await;
    assert_eq!(
        refused.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        refused.text()
    );
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
    // UX-156: an out-of-range page size is a 422, not a silent clamp.
    let refused = app.get_as(&admin, "/api/v2/ai/admin/runs?limit=201").await;
    assert_eq!(
        refused.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        refused.text()
    );
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
    // BUG-182: the owner may not read the analysis of an unreleased attempt.
    let owner = app
        .get_as(
            &alice,
            &format!("/api/v2/ai/submission-analysis/{attempt_id}/latest"),
        )
        .await;
    assert_eq!(owner.status, StatusCode::FORBIDDEN, "{}", owner.text());
    assert_eq!(owner.json()["code"], "grade-not-released");
    let latest = app
        .get_as(
            &teacher,
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
    // UX-134: another learner cannot tell alice's session id from an unknown one.
    let stranger = app
        .post_as(
            &bob,
            &format!("/api/v2/ai/remediation/sessions/{session_id}/complete"),
            &serde_json::json!({ "score": 80 }),
        )
        .await;
    assert_eq!(
        stranger.status,
        StatusCode::NOT_FOUND,
        "{}",
        stranger.text()
    );
    // …and the read says the same thing as an unknown id (no subject detail).
    let peek = app
        .get_as(
            &bob,
            &format!("/api/v2/ai/remediation/sessions/{session_id}"),
        )
        .await;
    assert_eq!(peek.status, StatusCode::NOT_FOUND, "{}", peek.text());
    assert_eq!(peek.json()["detail"], "remediation session not found");
    // UX-141: the grader can read the session but not complete it — 403, not 404.
    let grader_complete = app
        .post_as(
            &teacher,
            &format!("/api/v2/ai/remediation/sessions/{session_id}/complete"),
            &serde_json::json!({ "score": 80 }),
        )
        .await;
    assert_eq!(
        grader_complete.status,
        StatusCode::FORBIDDEN,
        "{}",
        grader_complete.text()
    );
    // BUG-224 nit: a pass racing a fail is final either way — the `UPDATE`
    // itself guards `status <> 'passed'`, so the session never ends `failed`.
    let complete_path = format!("/api/v2/ai/remediation/sessions/{session_id}/complete");
    let (pass, fail) = (
        serde_json::json!({ "score": 80 }),
        serde_json::json!({ "score": 10 }),
    );
    let (passed, failed) = tokio::join!(
        app.post_as(&alice, &complete_path, &pass),
        app.post_as(&alice, &complete_path, &fail),
    );
    assert_eq!(passed.status, StatusCode::OK, "{}", passed.text());
    assert!(
        matches!(failed.status, StatusCode::OK | StatusCode::CONFLICT),
        "{}",
        failed.text()
    );
    // UX-115: the grader reads the pass back on the work itself (the
    // learner's list is admin-only); a stranger gets 404.
    let latest = app
        .get_as(
            &teacher,
            &format!("/api/v2/ai/remediation/{attempt_id}/latest"),
        )
        .await;
    assert_eq!(latest.status, StatusCode::OK, "{}", latest.text());
    assert_eq!(latest.json()["id"], session_id.as_str());
    assert_eq!(latest.json()["status"], "passed");
    assert_eq!(
        app.get_as(&bob, &format!("/api/v2/ai/remediation/{attempt_id}/latest"))
            .await
            .status,
        StatusCode::NOT_FOUND
    );
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
            &teacher,
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
        .get_as(&teacher, &format!("/api/v2/ai/runs/{queued_id}"))
        .await;
    assert_eq!(done.json()["status"], "succeeded", "{}", done.text());
    let newest = app
        .get_as(
            &teacher,
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
    // UX-196: the gate freezes the quiz draft too (BUG-290), not just the submit.
    let version = open_draft.json()["draft_version"].as_i64().unwrap();
    let frozen = app
        .send(
            axum::http::Request::builder()
                .method("PATCH")
                .uri(format!("/api/v2/submissions/{draft_id}/draft"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &alice.cookie)
                .header(axum::http::header::IF_MATCH, format!("\"{version}\""))
                .body(axum::body::Body::from(
                    serde_json::json!({ "answers": {} }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(frozen.status, StatusCode::FORBIDDEN, "{}", frozen.text());
    assert_eq!(frozen.json()["detail"], "REMEDIATION_REQUIRED");

    // BUG-179: a second gate cannot stack behind the unpassed one (409 names
    // it); a later non-gate session does not hide the blocking one in `latest`.
    let stacked = app
        .post_as(
            &teacher,
            &format!("/api/v2/ai/remediation/{sub_id}/generate"),
            &serde_json::json!({ "gate_mode": true }),
        )
        .await;
    assert_eq!(stacked.status, StatusCode::CONFLICT, "{}", stacked.text());
    assert_eq!(stacked.json()["code"], "conflict");
    assert_eq!(stacked.json()["details"]["session_id"], session_id);
    let plain = app
        .post_as(
            &teacher,
            &format!("/api/v2/ai/remediation/{sub_id}/generate"),
            &serde_json::json!({ "gate_mode": false }),
        )
        .await;
    assert_eq!(plain.status, StatusCode::OK, "{}", plain.text());
    let plain_id = plain.json()["id"].as_str().unwrap().to_owned();
    let latest_url = format!("/api/v2/ai/remediation/{sub_id}/latest");
    assert_eq!(
        app.get_as(&teacher, &latest_url).await.json()["id"],
        session_id
    );

    let passed = app
        .post_as(
            &alice,
            &format!("/api/v2/ai/remediation/sessions/{session_id}/complete"),
            &serde_json::json!({ "score": 80 }),
        )
        .await;
    assert_eq!(passed.status, StatusCode::OK, "{}", passed.text());
    assert_eq!(passed.json()["status"], "passed");
    assert_eq!(
        app.get_as(&teacher, &latest_url).await.json()["id"],
        plain_id
    );
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

/// BUG-182: the owner may analyse (and read the analysis of) their own
/// work only once its grade is released — 403 `grade-not-released` before
/// that — and the context of a learner-triggered run is the learner's view
/// (no answer key, grading redacted by `review_visibility`); the grader's
/// run keeps the full grading.
#[sqlx::test(migrations = "../../migrations")]
async fn owner_analysis_waits_for_release_and_gets_the_learner_context(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let course_id = published_course(&app, &teacher, "Release").await;
    let chapter = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/chapters"),
            &serde_json::json!({ "name": "Week 3" }),
        )
        .await;
    let chapter_id = chapter.json()["id"].as_str().unwrap().to_owned();
    let created = app
        .post_as(
            &teacher,
            "/api/v2/assessments",
            &serde_json::json!({ "chapter_id": chapter_id, "kind": "quiz", "title": "Capitals" }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.text());
    let id = created.json()["id"].as_str().unwrap().to_owned();
    let choice = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/items"),
            &serde_json::json!({
                "title": "Capital", "max_score": 10,
                "body": { "kind": "choice", "prompt": "Capital of Kazakhstan?",
                          "options": [{ "id": "astana", "text": "Astana", "is_correct": true },
                                      { "id": "almaty", "text": "Almaty", "is_correct": false }] }
            }),
        )
        .await;
    let choice_id = choice.json()["id"].as_str().unwrap().to_owned();
    let mut policy = created.json()["policy"].clone();
    policy["grade_release_mode"] = serde_json::json!("batch");
    policy["review_visibility"] = serde_json::json!("score_only");
    let policy_res = app
        .send(
            axum::http::Request::builder()
                .method("PUT")
                .uri(format!("/api/v2/assessments/{id}/policy"))
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &teacher.cookie)
                .body(axum::body::Body::from(policy.to_string()))
                .unwrap(),
        )
        .await;
    assert_eq!(policy_res.status, StatusCode::OK, "{}", policy_res.text());
    let published = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/lifecycle"),
            &serde_json::json!({ "to": "published" }),
        )
        .await;
    assert_eq!(published.status, StatusCode::OK, "{}", published.text());
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
            &serde_json::json!({ "answers": { &choice_id: { "kind": "choice", "selected": ["almaty"] } } }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
    assert_eq!(submitted.json()["release_state"], "awaiting_release");
    mount_json_reply(&app.llm, &analysis_reply(&sub_id)).await;

    // Graded but unreleased: the owner is refused, analysing and reading.
    let analyze_url = format!("/api/v2/ai/submission-analysis/{sub_id}/analyze");
    let latest_url = format!("/api/v2/ai/submission-analysis/{sub_id}/latest");
    let refused = app
        .post_as(
            &alice,
            &analyze_url,
            &serde_json::json!({ "language": "en" }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN, "{}", refused.text());
    assert_eq!(refused.json()["code"], "grade-not-released");
    let hidden = app.get_as(&alice, &latest_url).await;
    assert_eq!(hidden.status, StatusCode::FORBIDDEN, "{}", hidden.text());
    assert_eq!(hidden.json()["code"], "grade-not-released");
    assert!(app.llm.received_requests().await.unwrap().is_empty());

    // The grader's run carries the answer key and the full grading.
    let graded = app
        .post_as(
            &teacher,
            &analyze_url,
            &serde_json::json!({ "language": "en" }),
        )
        .await;
    assert_eq!(graded.status, StatusCode::OK, "{}", graded.text());
    let requests = app.llm.received_requests().await.unwrap();
    let full = String::from_utf8_lossy(&requests.last().unwrap().body).into_owned();
    assert!(
        full.contains(r#"is_correct\":true"#),
        "answer key missing: {full}"
    );
    assert!(
        full.contains(r#"correct_answer\":[\"astana\"]"#),
        "grading key missing: {full}"
    );

    // Released: the owner's run sees neither the answer key nor the
    // correct-answer fields, only what `score_only` shows.
    let released = app
        .post_as(
            &teacher,
            &format!("/api/v2/assessments/{id}/publish-grades"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(released.status, StatusCode::OK, "{}", released.text());
    app.llm.reset().await;
    mount_json_reply(&app.llm, &analysis_reply(&sub_id)).await;
    let own = app
        .post_as(
            &alice,
            &analyze_url,
            &serde_json::json!({ "language": "en" }),
        )
        .await;
    assert_eq!(own.status, StatusCode::OK, "{}", own.text());
    let requests = app.llm.received_requests().await.unwrap();
    let redacted = String::from_utf8_lossy(&requests.last().unwrap().body).into_owned();
    assert!(redacted.contains("Capital of Kazakhstan?"), "{redacted}");
    assert!(redacted.contains("Grading:"), "{redacted}");
    assert!(redacted.contains("Final score: 0"), "{redacted}");
    assert!(
        !redacted.contains(r#"is_correct\":true"#),
        "answer key leaked: {redacted}"
    );
    assert!(
        !redacted.contains(r#"correct_answer\":[\"astana\"]"#),
        "grading key leaked: {redacted}"
    );
    assert!(
        !redacted.contains(r#"\"correct\":false"#),
        "verdict leaked: {redacted}"
    );
    let mine = app.get_as(&alice, &latest_url).await;
    assert_eq!(mine.status, StatusCode::OK, "{}", mine.text());
    assert_eq!(mine.json()["id"], own.json()["id"]);

    // BUG-185: a newer grader-triggered report (prose over the answer key)
    // never reaches the owner — `latest` stays their own run; the grader
    // reads the newest of all.
    app.llm.reset().await;
    let mut keyed = analysis_reply(&sub_id);
    keyed["knowledge_gaps"][0]["evidence"] = serde_json::json!("The key was astana, not almaty.");
    mount_json_reply(&app.llm, &keyed).await;
    let graded_again = app
        .post_as(
            &teacher,
            &analyze_url,
            &serde_json::json!({ "language": "en" }),
        )
        .await;
    assert_eq!(
        graded_again.status,
        StatusCode::OK,
        "{}",
        graded_again.text()
    );
    let mine = app.get_as(&alice, &latest_url).await;
    assert_eq!(mine.json()["id"], own.json()["id"], "{}", mine.text());
    assert!(!mine.text().contains("astana"), "{}", mine.text());
    assert_eq!(
        app.get_as(&teacher, &latest_url).await.json()["id"],
        graded_again.json()["id"]
    );
}

/// BUG-185: two queued gates enqueued inside the worker latency both pass
/// the enqueue-time check; executing them yields one `assigned` gate — the
/// other run fails and `latest` names the survivor.
#[sqlx::test(migrations = "../../migrations")]
async fn queued_gates_cannot_stack(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let course_id = published_course(&app, &teacher, "Gate race").await;
    let sub_id = submitted_essay(&app, &teacher, &alice, &course_id).await;
    mount_json_reply(&app.llm, &analysis_reply(&sub_id)).await;
    let analysed = app
        .post_as(
            &teacher,
            &format!("/api/v2/ai/submission-analysis/{sub_id}/analyze"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(analysed.status, StatusCode::OK, "{}", analysed.text());
    app.llm.reset().await;
    // A slow model: every worker passes the pre-check before any of them
    // reaches the insert, so the index alone decides (BUG-189 nit).
    mount_json_reply_after(&app.llm, &remediation_reply(), Duration::from_millis(300)).await;
    let queue_url = format!("/api/v2/ai/remediation/{sub_id}/generate/queue");
    let mut run_ids = Vec::new();
    for _ in 0..3 {
        let queued = app
            .post_as(
                &teacher,
                &queue_url,
                &serde_json::json!({ "gate_mode": true }),
            )
            .await;
        assert_eq!(queued.status, StatusCode::ACCEPTED, "{}", queued.text());
        run_ids.push(AiRunId(
            uuid::Uuid::parse_str(queued.json()["id"].as_str().unwrap()).unwrap(),
        ));
    }
    let ai = app.ai_service();
    let (first, second, third) = tokio::join!(
        ai.execute_queued(run_ids[0]),
        ai.execute_queued(run_ids[1]),
        ai.execute_queued(run_ids[2])
    );
    first.unwrap();
    second.unwrap();
    third.unwrap();
    let statuses: Vec<String> =
        sqlx::query_scalar("SELECT status FROM ai_runs WHERE id = ANY($1) ORDER BY status")
            .bind(run_ids.iter().map(|r| r.0).collect::<Vec<_>>())
            .fetch_all(&app.pool)
            .await
            .unwrap();
    assert_eq!(statuses, ["failed", "failed", "succeeded"]);
    // The slow model makes every worker usually pass the pre-check and lose
    // at the insert (3 artifacts); under load a late worker may lose at the
    // pre-check instead (no artifact). Either way exactly one gate survives.
    let artifacts: i64 =
        sqlx::query_scalar("SELECT count(*) FROM ai_artifacts WHERE run_id = ANY($1)")
            .bind(run_ids.iter().map(|r| r.0).collect::<Vec<_>>())
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert!((1..=3).contains(&artifacts), "artifacts {artifacts}");
    let gates: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM ai_remediation_sessions WHERE gate_mode AND status = 'assigned'",
    )
    .fetch_one(&app.pool)
    .await
    .unwrap();
    assert_eq!(gates, 1);
    let latest = app
        .get_as(&teacher, &format!("/api/v2/ai/remediation/{sub_id}/latest"))
        .await;
    assert_eq!(latest.json()["status"], "assigned", "{}", latest.text());
    // A third gate over the live one is refused at the door, naming it.
    let stacked = app
        .post_as(
            &teacher,
            &queue_url,
            &serde_json::json!({ "gate_mode": true }),
        )
        .await;
    assert_eq!(stacked.status, StatusCode::CONFLICT, "{}", stacked.text());
    assert_eq!(stacked.json()["details"]["session_id"], latest.json()["id"]);
}

/// BUG-189: the hourly lanes are counted apart — remediation requests never
/// spend the analysis allowance.
#[sqlx::test(migrations = "../../migrations")]
async fn remediation_calls_never_consume_the_analysis_lane(pool: PgPool) {
    let app = TestApp::spawn_with(pool, |config| {
        config.ai.analysis_requests_per_hour_per_user = 1;
    })
    .await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let course_id = published_course(&app, &teacher, "Lanes").await;
    let sub_id = submitted_essay(&app, &teacher, &alice, &course_id).await;
    for _ in 0..2 {
        let queued = app
            .post_as(
                &teacher,
                &format!("/api/v2/ai/remediation/{sub_id}/generate/queue"),
                &serde_json::json!({ "gate_mode": false }),
            )
            .await;
        assert_eq!(queued.status, StatusCode::ACCEPTED, "{}", queued.text());
    }
    mount_json_reply(&app.llm, &analysis_reply(&sub_id)).await;
    let analysed = app
        .post_as(
            &teacher,
            &format!("/api/v2/ai/submission-analysis/{sub_id}/analyze"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(analysed.status, StatusCode::OK, "{}", analysed.text());
    let limited = app
        .post_as(
            &teacher,
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
    assert_eq!(limited.json()["details"]["limit"], 1);
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

/// BUG-198: an open draft is 409 for the AI surface as for the grader —
/// analysis (inline and queued), remediation, `latest` and the review read.
#[sqlx::test(migrations = "../../migrations")]
async fn ai_refuses_an_open_draft(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let alice = learner(&app, "alice").await;
    let course_id = published_course(&app, &teacher, "Draft").await;
    let sub_id = submitted_essay(&app, &teacher, &alice, &course_id).await;
    let assessment_id = app
        .get_as(&alice, &format!("/api/v2/submissions/{sub_id}"))
        .await
        .json()["assessment_id"]
        .as_str()
        .unwrap()
        .to_owned();
    let draft = app
        .post_as(
            &alice,
            &format!("/api/v2/assessments/{assessment_id}/submissions"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED, "{}", draft.text());
    let draft_id = draft.json()["id"].as_str().unwrap().to_owned();

    for (path, body) in [
        (
            format!("/api/v2/ai/submission-analysis/{draft_id}/analyze"),
            serde_json::json!({}),
        ),
        (
            format!("/api/v2/ai/submission-analysis/{draft_id}/analyze/queue"),
            serde_json::json!({}),
        ),
        (
            format!("/api/v2/ai/remediation/{draft_id}/generate"),
            serde_json::json!({ "gate_mode": true }),
        ),
        (
            format!("/api/v2/ai/remediation/{draft_id}/generate/queue"),
            serde_json::json!({ "gate_mode": true }),
        ),
    ] {
        let refused = app.post_as(&teacher, &path, &body).await;
        assert_eq!(
            refused.status,
            StatusCode::CONFLICT,
            "{path}: {}",
            refused.text()
        );
        assert!(
            refused.json()["detail"]
                .as_str()
                .unwrap()
                .contains("open draft"),
            "{path}: {}",
            refused.text()
        );
    }
    for path in [
        format!("/api/v2/ai/submission-analysis/{draft_id}/latest"),
        format!("/api/v2/ai/remediation/{draft_id}/latest"),
        format!("/api/v2/submissions/{draft_id}/review"),
    ] {
        let refused = app.get_as(&teacher, &path).await;
        assert_eq!(
            refused.status,
            StatusCode::CONFLICT,
            "{path}: {}",
            refused.text()
        );
    }
    // BUG-202: a stranger sees 404 whether or not the id is a draft.
    let stranger = learner(&app, "stranger").await;
    for path in [
        format!("/api/v2/submissions/{draft_id}/review"),
        format!("/api/v2/submissions/{draft_id}/grading-history"),
        format!("/api/v2/ai/submission-analysis/{draft_id}/latest"),
    ] {
        let hidden = app.get_as(&stranger, &path).await;
        assert_eq!(
            hidden.status,
            StatusCode::NOT_FOUND,
            "{path}: {}",
            hidden.text()
        );
    }
    let hidden = app
        .patch_as(
            &stranger,
            &format!("/api/v2/submissions/{draft_id}/grade"),
            &serde_json::json!({ "action": "save", "feedback": "x" }),
        )
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND, "{}", hidden.text());
    // The learner is not gated out of their own open attempt.
    let state = app
        .get_as(
            &alice,
            &format!("/api/v2/assessments/{assessment_id}/attempt-state"),
        )
        .await;
    assert_eq!(state.json()["can_continue"], true, "{}", state.text());
    let submitted = app
        .post_as(
            &alice,
            &format!("/api/v2/submissions/{draft_id}/submit"),
            &serde_json::json!({ "answers": {} }),
        )
        .await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.text());
}

/// BUG-302: a learner promoted to maintainer may not set a blocking gate on
/// their own released attempt — a gate is a grader's action (BUG-286).
#[sqlx::test(migrations = "../../migrations")]
async fn gate_is_refused_on_the_callers_own_attempt(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let lena_id = app
        .create_user("lena", "lena@example.com", &["instructor"])
        .await;
    let lena = app
        .mint_session_for(
            lena_id,
            &[
                "course:read:all",
                "course:update:own",
                "assessment:*:own",
                "assessment:submit:assigned",
                "assessment:read:assigned",
            ],
        )
        .await;
    let course_id = published_course(&app, &teacher, "Own gate").await;
    let sub_id = submitted_essay(&app, &teacher, &lena, &course_id).await;
    let added = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/contributors"),
            &serde_json::json!({ "user_id": lena.user_id, "role": "maintainer" }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
    let gate = app
        .post_as(
            &lena,
            &format!("/api/v2/ai/remediation/{sub_id}/generate/queue"),
            &serde_json::json!({ "gate_mode": true }),
        )
        .await;
    assert_eq!(gate.status, StatusCode::FORBIDDEN, "{}", gate.text());
    assert_eq!(gate.json()["code"], "grade-own-attempt");
}

/// UX-136: a maintainer queues an analysis, the creator sets them
/// inactive before the worker runs — the run fails (`AI_ACCESS_REVOKED`),
/// no analysis is recorded, and the demoted user's run reads answer 404.
#[sqlx::test(migrations = "../../migrations")]
async fn queued_analysis_fails_for_a_demoted_maintainer(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    let teacher = instructor(&app, "teacher").await;
    let maint = instructor(&app, "maint").await;
    let alice = learner(&app, "alice").await;
    let course_id = published_course(&app, &teacher, "Demoted").await;
    let sub_id = submitted_essay(&app, &teacher, &alice, &course_id).await;
    let added = app
        .post_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/contributors"),
            &serde_json::json!({ "user_id": maint.user_id, "role": "maintainer" }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.text());
    mount_json_reply(&app.llm, &analysis_reply(&sub_id)).await;

    // A finished run of the maintainer's own stays readable while active…
    let done = app
        .post_as(
            &maint,
            &format!("/api/v2/ai/submission-analysis/{sub_id}/analyze"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(done.status, StatusCode::OK, "{}", done.text());
    let done_run = done.json()["run_id"].as_str().unwrap().to_owned();
    let artifacts = format!("/api/v2/ai/runs/{done_run}/artifacts");
    assert_eq!(app.get_as(&maint, &artifacts).await.status, StatusCode::OK);
    let queued = app
        .post_as(
            &maint,
            &format!("/api/v2/ai/submission-analysis/{sub_id}/analyze/queue"),
            &serde_json::json!({}),
        )
        .await;
    assert_eq!(queued.status, StatusCode::ACCEPTED, "{}", queued.text());
    let queued_id = queued.json()["id"].as_str().unwrap().to_owned();
    let demoted = app
        .patch_as(
            &teacher,
            &format!("/api/v2/courses/{course_id}/contributors/{}", maint.user_id),
            &serde_json::json!({ "status": "inactive" }),
        )
        .await;
    assert_eq!(demoted.status, StatusCode::OK, "{}", demoted.text());

    app.ai_service()
        .execute_queued(AiRunId(uuid::Uuid::parse_str(&queued_id).unwrap()))
        .await
        .unwrap();
    let run = app
        .get_as(&teacher, &format!("/api/v2/ai/runs/{queued_id}"))
        .await;
    assert_eq!(run.status, StatusCode::NOT_FOUND, "not the teacher's run");
    let (status, error_code): (String, Option<String>) =
        sqlx::query_as("SELECT status, error_code FROM ai_runs WHERE id = $1")
            .bind(uuid::Uuid::parse_str(&queued_id).unwrap())
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(status, "failed");
    assert_eq!(error_code.as_deref(), Some("AI_ACCESS_REVOKED"));
    let latest = app
        .get_as(
            &teacher,
            &format!("/api/v2/ai/submission-analysis/{sub_id}/latest"),
        )
        .await;
    assert_eq!(
        latest.json()["run_id"],
        done_run,
        "no analysis from the failed run"
    );
    // …and the demoted user's reads follow the current grant.
    assert_eq!(
        app.get_as(&maint, &artifacts).await.status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.get_as(&maint, &format!("/api/v2/ai/runs/{queued_id}"))
            .await
            .status,
        StatusCode::NOT_FOUND
    );
}
