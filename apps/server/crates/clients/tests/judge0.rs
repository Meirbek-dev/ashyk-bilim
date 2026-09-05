//! Wiremock contract fixtures for the Judge0 client (CE 1.13.1 shapes as the
//! legacy SDK exercised them): batch create → poll → base64 decode, the
//! breaker, poll timeouts, payload rejections.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::time::Duration;

use ab_clients::judge0::{Judge0Client, Judge0Config, Judge0Error, SubmissionSpec};
use secrecy::SecretString;
use wiremock::matchers::{body_partial_json, header, method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn client(server: &MockServer) -> Judge0Client {
    Judge0Client::new(Judge0Config {
        base_url: server.uri(),
        api_key: Some(SecretString::from("j0-token")),
        request_timeout: Duration::from_secs(5),
        poll_interval: Duration::from_millis(20),
        poll_max_wait: Duration::from_secs(2),
    })
    .unwrap()
}

fn spec(source: &str, stdin: &str) -> SubmissionSpec {
    SubmissionSpec {
        source_code: source.into(),
        language_id: 71,
        stdin: stdin.into(),
        cpu_time_limit: Some(2.0),
        wall_time_limit: Some(3.0),
        memory_limit_kb: Some(65_536),
        max_file_size_kb: Some(128),
        ..SubmissionSpec::default()
    }
}

#[tokio::test]
async fn batch_create_then_poll_until_done_decoding_base64() {
    let server = MockServer::start().await;
    // "print(1)" → cHJpbnQoMSk=, stdin "2" → Mg==
    Mock::given(method("POST"))
        .and(path("/submissions/batch"))
        .and(query_param("base64_encoded", "true"))
        .and(header("x-auth-token", "j0-token"))
        .and(body_partial_json(serde_json::json!({
            "submissions": [
                { "source_code": "cHJpbnQoMSk=", "language_id": 71, "stdin": "Mg==",
                  "cpu_time_limit": 2.0, "wall_time_limit": 3.0, "memory_limit": 65536,
                  "max_file_size": 128, "enable_network": false,
                  "enable_per_process_and_thread_time_limit": true,
                  "enable_per_process_and_thread_memory_limit": true },
                { "source_code": "cHJpbnQoMSk=", "stdin": "Mw==" }
            ]
        })))
        .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!([
            { "token": "tok-1" }, { "token": "tok-2" }
        ])))
        .expect(1)
        .mount(&server)
        .await;
    // First poll: one done, one still processing. Judge0 base64 output has
    // Ruby's 60-column line feeds — "4\n" → "NAo=\n".
    Mock::given(method("GET"))
        .and(path("/submissions/batch"))
        .and(query_param("tokens", "tok-1,tok-2"))
        .and(query_param("base64_encoded", "true"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "submissions": [
                { "token": "tok-1", "status": { "id": 3, "description": "Accepted" },
                  "stdout": "NAo=\n", "stderr": null, "compile_output": null, "message": null,
                  "time": "0.012", "memory": 3456 },
                { "token": "tok-2", "status": { "id": 2, "description": "Processing" },
                  "stdout": null, "stderr": null, "compile_output": null, "message": null,
                  "time": null, "memory": null }
            ]
        })))
        .up_to_n_times(1)
        .expect(1)
        .mount(&server)
        .await;
    // Second poll only asks for the pending token.
    Mock::given(method("GET"))
        .and(path("/submissions/batch"))
        .and(query_param("tokens", "tok-2"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "submissions": [
                { "token": "tok-2", "status": { "id": 6, "description": "Compilation Error" },
                  "stdout": null, "stderr": null,
                  "compile_output": "U3ludGF4RXJyb3I6IGludmFsaWQgc3lu\ndGF4Cg==", "message": null,
                  "time": null, "memory": null }
            ]
        })))
        .expect(1)
        .mount(&server)
        .await;

    let results = client(&server)
        .run_batch(&[spec("print(1)", "2"), spec("print(1)", "3")])
        .await
        .unwrap();
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].token, "tok-1");
    assert_eq!(results[0].status_id, 3);
    assert_eq!(results[0].stdout.as_deref(), Some("4\n"));
    assert_eq!(results[0].time_seconds, Some(0.012));
    assert_eq!(results[0].memory_kb, Some(3456));
    assert_eq!(results[1].token, "tok-2");
    assert_eq!(results[1].status_id, 6);
    assert_eq!(
        results[1].compile_output.as_deref(),
        Some("SyntaxError: invalid syntax\n")
    );
    assert!(results[1].stdout.is_none());
}

#[tokio::test]
async fn poll_timeout_is_unavailable() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/submissions/batch"))
        .respond_with(
            ResponseTemplate::new(201).set_body_json(serde_json::json!([{ "token": "t" }])),
        )
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/submissions/batch"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "submissions": [{ "token": "t", "status": { "id": 1, "description": "In Queue" } }]
        })))
        .mount(&server)
        .await;
    let client = Judge0Client::new(Judge0Config {
        base_url: server.uri(),
        api_key: None,
        request_timeout: Duration::from_secs(5),
        poll_interval: Duration::from_millis(20),
        poll_max_wait: Duration::from_millis(150),
    })
    .unwrap();
    match client.run_batch(&[spec("x", "")]).await {
        Err(Judge0Error::Unavailable(msg)) => assert!(msg.contains("timed out"), "{msg}"),
        other => panic!("expected timeout, got {other:?}"),
    }
}

#[tokio::test]
async fn breaker_opens_after_five_failures_and_skips_the_network() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/submissions/batch"))
        .respond_with(ResponseTemplate::new(503).set_body_string("maintenance"))
        .expect(5)
        .mount(&server)
        .await;
    let client = client(&server);
    for _ in 0..5 {
        assert!(matches!(
            client.run_batch(&[spec("x", "")]).await,
            Err(Judge0Error::Unavailable(_))
        ));
    }
    assert!(client.is_degraded());
    // Sixth call: refused locally (the mock's expect(5) proves no request).
    match client.run_batch(&[spec("x", "")]).await {
        Err(Judge0Error::Unavailable(msg)) => assert!(msg.contains("circuit"), "{msg}"),
        other => panic!("expected open circuit, got {other:?}"),
    }
}

#[tokio::test]
async fn payload_rejections_do_not_trip_the_breaker() {
    let server = MockServer::start().await;
    // Judge0 answers a batch with per-entry error objects instead of tokens.
    Mock::given(method("POST"))
        .and(path("/submissions/batch"))
        .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!([
            { "language_id": ["language with id 999 doesn't exist"] }
        ])))
        .mount(&server)
        .await;
    let client = client(&server);
    for _ in 0..6 {
        match client.run_batch(&[spec("x", "")]).await {
            Err(Judge0Error::Rejected(msg)) => assert!(msg.contains("999"), "{msg}"),
            other => panic!("expected rejection, got {other:?}"),
        }
    }
    assert!(!client.is_degraded());
}

#[tokio::test]
async fn languages_are_listed() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/languages"))
        .and(header("x-auth-token", "j0-token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([
            { "id": 71, "name": "Python (3.8.1)" },
            { "id": 62, "name": "Java (OpenJDK 13.0.1)" }
        ])))
        .mount(&server)
        .await;
    let languages = client(&server).languages().await.unwrap();
    assert_eq!(languages.len(), 2);
    assert_eq!(languages[0].id, 71);
    assert!(!languages[0].is_archived);
    assert_eq!(languages[1].name, "Java (OpenJDK 13.0.1)");
}
