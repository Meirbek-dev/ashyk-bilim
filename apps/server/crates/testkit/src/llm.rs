//! A fake OpenAI-compatible `POST /v1/chat/completions` on wiremock.
//!
//! Tests mount one of the reply helpers per scenario: a JSON reply for the
//! structured (non-streaming) agents, an SSE reply for the course Q&A
//! stream, or a failure status. Every mock asserts the request shape the
//! client must send (bearer key, `stream` flag).

use ab_core::config::AiConfig;
use secrecy::SecretString;
use wiremock::matchers::{body_partial_json, header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

pub const TEST_OPENAI_KEY: &str = "test-openai-key";
pub const TEST_MODEL: &str = "gpt-test";
pub const COMPLETIONS_PATH: &str = "/v1/chat/completions";

/// The `AB__AI__*` section pointed at the fake: OpenAI only, short
/// timeouts, every feature on, a generous budget.
#[must_use]
pub fn test_ai_config(server: &MockServer) -> AiConfig {
    AiConfig {
        openai_api_key: Some(SecretString::from(TEST_OPENAI_KEY)),
        openai_model: TEST_MODEL.into(),
        openai_base_url: format!("{}/v1", server.uri()),
        openai_timeout_secs: 5.0,
        openrouter_api_key: None,
        ..AiConfig::default()
    }
}

/// A non-streaming completion whose content is `content`.
#[must_use]
pub fn completion_body(content: &str) -> serde_json::Value {
    serde_json::json!({
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "model": TEST_MODEL,
        "choices": [{ "index": 0, "finish_reason": "stop",
                      "message": { "role": "assistant", "content": content } }],
        "usage": { "prompt_tokens": 42, "completion_tokens": 7, "total_tokens": 49 }
    })
}

/// Split `text` into an OpenAI SSE stream body, `chunk` characters per
/// delta, ending with a usage chunk and `[DONE]`.
#[must_use]
pub fn sse_body(text: &str, chunk: usize) -> String {
    let mut body = String::new();
    let chars: Vec<char> = text.chars().collect();
    for piece in chars.chunks(chunk.max(1)) {
        let delta: String = piece.iter().collect();
        let event = serde_json::json!({
            "id": "chatcmpl-test", "model": TEST_MODEL,
            "choices": [{ "index": 0, "delta": { "content": delta } }]
        });
        body.push_str(&format!("data: {event}\n\n"));
    }
    let usage = serde_json::json!({
        "id": "chatcmpl-test", "model": TEST_MODEL, "choices": [],
        "usage": { "prompt_tokens": 42, "completion_tokens": 9, "total_tokens": 51 }
    });
    body.push_str(&format!("data: {usage}\n\ndata: [DONE]\n\n"));
    body
}

fn completions(stream: bool) -> wiremock::MockBuilder {
    Mock::given(method("POST"))
        .and(path(COMPLETIONS_PATH))
        .and(header(
            "authorization",
            &format!("Bearer {TEST_OPENAI_KEY}"),
        ))
        .and(body_partial_json(serde_json::json!({ "stream": stream })))
}

/// Answer every non-streaming completion with `reply` serialised as the
/// message content (what a structured agent parses).
pub async fn mount_json_reply(server: &MockServer, reply: &serde_json::Value) {
    completions(false)
        .respond_with(ResponseTemplate::new(200).set_body_json(completion_body(&reply.to_string())))
        .mount(server)
        .await;
}

/// Answer every streaming completion with `reply` streamed as SSE deltas.
pub async fn mount_stream_reply(server: &MockServer, reply: &serde_json::Value) {
    completions(true)
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(sse_body(&reply.to_string(), 6)),
        )
        .mount(server)
        .await;
}

/// Every completion fails with `status` (5xx → the client reports the
/// provider unavailable; the agents fall back to draft mode).
pub async fn mount_failure(server: &MockServer, status: u16) {
    Mock::given(method("POST"))
        .and(path(COMPLETIONS_PATH))
        .respond_with(ResponseTemplate::new(status).set_body_string("upstream trouble"))
        .mount(server)
        .await;
}
