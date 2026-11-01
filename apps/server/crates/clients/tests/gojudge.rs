//! Wiremock contract fixtures for the go-judge client (1.13 shapes): compile
//! once with the artifact cached, one run per input with the artifact copied
//! in, the file freed after; verdict ids; the breaker; budgets; rejections.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::time::Duration;

use ab_clients::gojudge::{Batch, GoJudgeClient, GoJudgeConfig, Limits, RunnerError};
use secrecy::SecretString;
use wiremock::matchers::{body_partial_json, header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn config(server: &MockServer, max_wait: Duration, max_concurrency: usize) -> GoJudgeConfig {
    GoJudgeConfig {
        base_url: server.uri(),
        auth_token: Some(SecretString::from("gj-token")),
        max_wait,
        max_concurrency,
    }
}

fn client(server: &MockServer) -> GoJudgeClient {
    GoJudgeClient::new(config(server, Duration::from_secs(2), 2)).unwrap()
}

const LIMITS: Limits = Limits {
    cpu_time: Duration::from_secs(2),
    memory_bytes: 64 * 1024 * 1024,
    output_bytes: 1024,
};

fn batch<'a>(language_id: i32, source: &'a str, inputs: &[&'a str]) -> Batch<'a> {
    Batch {
        language_id,
        source,
        inputs: inputs.to_vec(),
        limits: LIMITS,
    }
}

fn result(status: &str, stdout: &str, stderr: &str) -> serde_json::Value {
    serde_json::json!({
        "status": status, "exitStatus": i32::from(status != "Accepted"), "time": 12_000_000,
        "memory": 3_538_944, "runTime": 13_000_000,
        "files": { "stdout": stdout, "stderr": stderr },
    })
}

#[tokio::test]
async fn compiles_once_runs_each_input_with_the_artifact_and_frees_it() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/run"))
        .and(header("authorization", "Bearer gj-token"))
        .and(body_partial_json(serde_json::json!({
            "requestId": "compile",
            "cmd": [{ "args": ["/usr/bin/gcc", "-O2", "-std=gnu17", "-pipe", "-o", "main", "main.c", "-lm"],
                      "copyIn": { "main.c": { "content": "int main(){}" } },
                      "copyOutCached": ["main"] }]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([{
            "status": "Accepted", "exitStatus": 0, "time": 80_000_000, "memory": 6_000_000,
            "files": { "stdout": "", "stderr": "" }, "fileIds": { "main": "BIN1" }
        }])))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/run"))
        .and(body_partial_json(serde_json::json!({
            "requestId": "case-0",
            "cmd": [{ "args": ["/w/main"], "copyIn": { "main": { "fileId": "BIN1" } },
                      "files": [{ "content": "2" }, { "name": "stdout", "max": 1024 },
                                { "name": "stderr", "max": 1024 }],
                      "cpuLimit": 2_000_000_000_u64, "clockLimit": 4_000_000_000_u64,
                      "memoryLimit": 67_108_864, "procLimit": 32 }]
        })))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!([result("Accepted", "4\n", "")])),
        )
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/run"))
        .and(body_partial_json(
            serde_json::json!({ "requestId": "case-1" }),
        ))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!([{
                "status": "Signalled", "exitStatus": 11, "time": 1_000_000, "memory": 1_000_000,
                "files": { "stdout": "", "stderr": "" }
            }])),
        )
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("DELETE"))
        .and(path("/file/BIN1"))
        .and(header("authorization", "Bearer gj-token"))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&server)
        .await;
    let outcomes = client(&server)
        .run_batch("u", &batch(50, "int main(){}", &["2", "3"]))
        .await
        .unwrap();
    assert_eq!(outcomes.len(), 2);
    assert_eq!(outcomes[0].status_id, 3);
    assert_eq!(outcomes[0].stdout.as_deref(), Some("4\n"));
    assert_eq!(outcomes[0].time_seconds, Some(0.012));
    assert_eq!(outcomes[0].memory_kb, Some(3456));
    assert_eq!(outcomes[1].status_id, 7);
    assert_eq!(outcomes[1].status_description, "Runtime Error (SIGSEGV)");
    assert_eq!(outcomes[1].message.as_deref(), Some("Killed by signal 11"));
}

/// A syntax-checked language runs the source itself; a failed check is the
/// compile error of every input, and nothing runs.
#[tokio::test]
async fn a_failed_check_is_every_inputs_compile_error() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/run"))
        .and(body_partial_json(serde_json::json!({
            "requestId": "compile",
            "cmd": [{ "args": ["/usr/bin/python3", "-m", "py_compile", "main.py"] }]
        })))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!([result(
                "Nonzero Exit Status",
                "",
                "  File \"main.py\", line 1\nSyntaxError: invalid syntax\n"
            )])),
        )
        .expect(1)
        .mount(&server)
        .await;
    let outcomes = client(&server)
        .run_batch("u", &batch(71, "print(", &["1", "2"]))
        .await
        .unwrap();
    assert_eq!(outcomes.len(), 2);
    for outcome in &outcomes {
        assert_eq!(outcome.status_id, 6);
        assert_eq!(
            outcome.compile_output.as_deref(),
            Some("  File \"main.py\", line 1\nSyntaxError: invalid syntax")
        );
        assert!(outcome.stdout.is_none());
    }
    // The mock's expect(1): no test run, no file to free.
    assert_eq!(server.received_requests().await.unwrap().len(), 1);
}

#[tokio::test]
async fn python_runs_copy_in_the_source() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/run"))
        .and(body_partial_json(
            serde_json::json!({ "requestId": "compile" }),
        ))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!([result("Accepted", "", "")])),
        )
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/run"))
        .and(body_partial_json(serde_json::json!({
            "requestId": "case-0",
            "cmd": [{ "args": ["/usr/bin/python3", "main.py"],
                      "copyIn": { "main.py": { "content": "print(input())" } } }]
        })))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!([result(
                "Nonzero Exit Status",
                "",
                "Traceback\n"
            )])),
        )
        .expect(1)
        .mount(&server)
        .await;
    let outcomes = client(&server)
        .run_batch("u", &batch(71, "print(input())", &["x"]))
        .await
        .unwrap();
    assert_eq!(outcomes[0].status_id, 11);
    assert_eq!(outcomes[0].stderr.as_deref(), Some("Traceback\n"));
    assert_eq!(
        outcomes[0].message.as_deref(),
        Some("Exited with error status 1")
    );
}

/// A runner whose programs never finish within the budget.
async fn stuck_runner(max_concurrency: usize) -> (MockServer, GoJudgeClient) {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/run"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!([result("Accepted", "", "")]))
                .set_delay(Duration::from_secs(5)),
        )
        .mount(&server)
        .await;
    let client = GoJudgeClient::new(GoJudgeConfig {
        auth_token: None,
        ..config(&server, Duration::from_millis(400), max_concurrency)
    })
    .unwrap();
    (server, client)
}

/// BUG-372: a saturated runner is `Busy` - retryable, and it never opens
/// the breaker for everyone else.
#[tokio::test]
async fn budget_timeouts_are_busy_and_never_trip_the_breaker() {
    let (_server, client) = stuck_runner(2).await;
    for _ in 0..6 {
        match client.run_batch("u", &batch(71, "x", &[""])).await {
            Err(RunnerError::Busy(msg)) => assert!(msg.contains("budget"), "{msg}"),
            other => panic!("expected busy, got {other:?}"),
        }
    }
    assert!(!client.is_degraded());
}

/// BUG-372: past `max_concurrency` a program waits for a slot instead of
/// piling onto go-judge, and gives up as `Busy` within the same budget.
#[tokio::test]
async fn programs_beyond_the_concurrency_cap_queue_for_a_slot() {
    let (server, client) = stuck_runner(1).await;
    let (a, b) = (batch(71, "a", &[""]), batch(71, "b", &[""]));
    let both: [_; 2] = tokio::join!(client.run_batch("a", &a), client.run_batch("b", &b)).into();
    let messages: Vec<String> = both
        .into_iter()
        .map(|r| match r {
            Err(RunnerError::Busy(msg)) => msg,
            other => panic!("expected busy, got {other:?}"),
        })
        .collect();
    assert!(
        messages.iter().any(|m| m.contains("no free slot")),
        "{messages:?}"
    );
    let requests = server.received_requests().await.unwrap().len();
    assert_eq!(requests, 1, "the queued program never reached go-judge");
}

/// UX-308: one owner's burst waits for their own previous batch, not in
/// the slot queue - another owner's batch still reaches go-judge.
#[tokio::test]
async fn one_owners_burst_does_not_queue_ahead_of_others() {
    let (server, client) = stuck_runner(2).await;
    let (a1, a2, b) = (
        batch(71, "a1", &[""]),
        batch(71, "a2", &[""]),
        batch(71, "b", &[""]),
    );
    let (r1, r2, r3) = tokio::join!(
        client.run_batch("alice", &a1),
        client.run_batch("alice", &a2),
        client.run_batch("bob", &b)
    );
    match r2 {
        Err(RunnerError::Busy(msg)) => assert!(msg.contains("previous run"), "{msg}"),
        other => panic!("expected alice's second batch to wait, got {other:?}"),
    }
    assert!(matches!(r1, Err(RunnerError::Busy(_))));
    assert!(matches!(r3, Err(RunnerError::Busy(_))));
    let sources: Vec<String> = server
        .received_requests()
        .await
        .unwrap()
        .iter()
        .map(|r| String::from_utf8_lossy(&r.body).into_owned())
        .collect();
    assert_eq!(sources.len(), 2, "{sources:?}");
    assert!(
        sources.iter().any(|s| s.contains(r#""content":"b""#)),
        "bob never ran"
    );
    assert!(
        !sources.iter().any(|s| s.contains(r#""content":"a2""#)),
        "alice ran twice at once"
    );
}

#[tokio::test]
async fn breaker_opens_after_five_failures_and_skips_the_network() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/run"))
        .respond_with(ResponseTemplate::new(500).set_body_string("cgroup failed"))
        .expect(5)
        .mount(&server)
        .await;
    let client = client(&server);
    for _ in 0..5 {
        assert!(matches!(
            client.run_batch("u", &batch(71, "x", &[""])).await,
            Err(RunnerError::Unavailable(_))
        ));
    }
    assert!(client.is_degraded());
    // Sixth call: refused locally (the mock's expect(5) proves no request).
    match client.run_batch("u", &batch(71, "x", &[""])).await {
        Err(RunnerError::Unavailable(msg)) => assert!(msg.contains("circuit"), "{msg}"),
        other => panic!("expected open circuit, got {other:?}"),
    }
}

/// UX-316: a batch queued for the slot while the breaker opened fails fast
/// once it gets the slot - no connect to the go-judge that just tripped it.
#[tokio::test]
async fn a_queued_batch_rechecks_the_breaker_after_its_slot() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/run"))
        .respond_with(
            ResponseTemplate::new(503)
                .set_body_string("down")
                .set_delay(Duration::from_millis(30)),
        )
        .expect(5)
        .mount(&server)
        .await;
    let client = GoJudgeClient::new(config(&server, Duration::from_secs(5), 1)).unwrap();
    let one = batch(71, "x", &[""]);
    let owners = ["u1", "u2", "u3", "u4", "u5", "u6"];
    // All six pass the breaker at once, then queue for the one slot.
    let results = futures::future::join_all(owners.iter().map(|o| client.run_batch(o, &one))).await;
    match &results[5] {
        Err(RunnerError::Unavailable(msg)) => assert!(msg.contains("circuit"), "{msg}"),
        other => panic!("expected the open circuit, got {other:?}"),
    }
    // The mock's expect(5) proves the sixth never reached go-judge.
}

#[tokio::test]
async fn rejections_do_not_trip_the_breaker() {
    let server = MockServer::start().await;
    // A wrong token or a request go-judge cannot parse.
    Mock::given(method("POST"))
        .and(path("/run"))
        .respond_with(ResponseTemplate::new(401).set_body_string("unauthorized"))
        .mount(&server)
        .await;
    let client = client(&server);
    for _ in 0..6 {
        match client.run_batch("u", &batch(71, "x", &[""])).await {
            Err(RunnerError::Rejected(msg)) => assert!(msg.contains("401"), "{msg}"),
            other => panic!("expected rejection, got {other:?}"),
        }
    }
    assert!(!client.is_degraded());
    // A language the image does not have never reaches go-judge.
    match client.run_batch("u", &batch(999, "x", &[""])).await {
        Err(RunnerError::Rejected(msg)) => assert!(msg.contains("999"), "{msg}"),
        other => panic!("expected rejection, got {other:?}"),
    }
}
