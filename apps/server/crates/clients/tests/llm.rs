//! Wiremock contract fixtures for the LLM client against an OpenAI-compatible
//! `/chat/completions` fake: request shape (bearer, model, messages, JSON
//! schema response format), non-streaming and SSE streaming replies, the
//! provider fallback chain, the structured-output repair round, timeouts.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::time::Duration;

use ab_clients::llm::{
    ChatMessage, CompletionRequest, LlmClient, LlmConfig, LlmError, OutputSchema, ProviderConfig,
    StreamChunk,
};
use futures::StreamExt;
use secrecy::SecretString;
use serde::Deserialize;
use wiremock::matchers::{body_partial_json, header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn provider(name: &str, server: &MockServer, model: &str, timeout: Duration) -> ProviderConfig {
    ProviderConfig {
        name: name.into(),
        base_url: format!("{}/v1", server.uri()),
        api_key: SecretString::from(format!("{name}-key")),
        model: model.into(),
        timeout,
    }
}

fn client(providers: Vec<ProviderConfig>) -> LlmClient {
    LlmClient::new(LlmConfig {
        providers,
        max_output_tokens: 512,
    })
    .unwrap()
}

fn completion_body(content: &str, model: &str) -> serde_json::Value {
    serde_json::json!({
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "model": model,
        "choices": [{ "index": 0, "finish_reason": "stop",
                      "message": { "role": "assistant", "content": content } }],
        "usage": { "prompt_tokens": 42, "completion_tokens": 7, "total_tokens": 49 }
    })
}

fn request() -> CompletionRequest {
    CompletionRequest {
        messages: vec![
            ChatMessage::system("You answer questions about a course."),
            ChatMessage::user("Role: student\nQuestion: what is a monad?"),
        ],
        output_schema: Some(OutputSchema {
            name: "course_qa_answer".into(),
            schema: serde_json::json!({
                "type": "object",
                "properties": { "answer_markdown": { "type": "string" } },
                "required": ["answer_markdown"]
            }),
        }),
        max_output_tokens: Some(256),
        temperature: None,
    }
}

#[derive(Debug, Deserialize, PartialEq)]
struct Answer {
    answer_markdown: String,
}

#[tokio::test]
async fn non_streaming_completion_sends_the_openai_shape() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .and(header("authorization", "Bearer openai-key"))
        .and(header("content-type", "application/json"))
        .and(body_partial_json(serde_json::json!({
            "model": "gpt-5.6-luna",
            "stream": false,
            "max_completion_tokens": 256,
            "messages": [
                { "role": "system", "content": "You answer questions about a course." },
                { "role": "user", "content": "Role: student\nQuestion: what is a monad?" }
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": { "name": "course_qa_answer", "strict": false,
                                 "schema": { "type": "object", "required": ["answer_markdown"] } }
            }
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(completion_body(
            "{\"answer_markdown\": \"A monad is a monoid in the category of endofunctors.\"}",
            "gpt-5.6-luna-2026-01",
        )))
        .expect(1)
        .mount(&server)
        .await;

    let llm = client(vec![provider(
        "openai",
        &server,
        "gpt-5.6-luna",
        Duration::from_secs(2),
    )]);
    let completion = llm.complete(&request()).await.unwrap();
    assert_eq!(completion.provider, "openai");
    assert_eq!(completion.model_name, "openai:gpt-5.6-luna-2026-01");
    assert_eq!(completion.usage.input_tokens, Some(42));
    assert_eq!(completion.usage.output_tokens, Some(7));
    assert!(completion.text.contains("monoid"));
}

#[tokio::test]
async fn streaming_yields_deltas_in_order_then_done_with_usage() {
    let server = MockServer::start().await;
    let sse = concat!(
        "data: {\"id\":\"c\",\"model\":\"gpt-5.6-luna\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"\"}}]}\n\n",
        "data: {\"id\":\"c\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"{\\\"answer_markdown\\\": \\\"Hel\"}}]}\n\n",
        "data: {\"id\":\"c\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"lo\\\"}\"}}]}\n\n",
        "data: {\"id\":\"c\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
        "data: {\"id\":\"c\",\"choices\":[],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":4}}\n\n",
        "data: [DONE]\n\n",
    );
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .and(body_partial_json(serde_json::json!({
            "stream": true,
            "stream_options": { "include_usage": true }
        })))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_string(sse),
        )
        .expect(1)
        .mount(&server)
        .await;

    let llm = client(vec![provider(
        "openai",
        &server,
        "gpt-5.6-luna",
        Duration::from_secs(2),
    )]);
    let mut stream = llm.stream(&request()).await.unwrap();
    let mut text = String::new();
    let mut done = None;
    while let Some(chunk) = stream.next().await {
        match chunk.unwrap() {
            StreamChunk::Delta(delta) => text.push_str(&delta),
            StreamChunk::Done { model_name, usage } => done = Some((model_name, usage)),
        }
    }
    assert_eq!(text, "{\"answer_markdown\": \"Hello\"}");
    let (model_name, usage) = done.expect("Done chunk");
    assert_eq!(model_name, "openai:gpt-5.6-luna");
    assert_eq!(usage.input_tokens, Some(10));
    assert_eq!(usage.output_tokens, Some(4));
}

#[tokio::test]
async fn falls_back_to_the_next_provider_on_5xx() {
    let primary = MockServer::start().await;
    let fallback = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(503).set_body_string("upstream overloaded"))
        .expect(1)
        .mount(&primary)
        .await;
    // OpenRouter speaks `max_tokens`, not `max_completion_tokens`.
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .and(header("authorization", "Bearer openrouter-key"))
        .and(body_partial_json(serde_json::json!({
            "model": "deepseek/deepseek-v4-flash", "max_tokens": 256
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(completion_body(
            "{\"answer_markdown\": \"fallback\"}",
            "deepseek/deepseek-v4-flash",
        )))
        .expect(1)
        .mount(&fallback)
        .await;

    let llm = client(vec![
        provider("openai", &primary, "gpt-5.6-luna", Duration::from_secs(2)),
        provider(
            "openrouter",
            &fallback,
            "deepseek/deepseek-v4-flash",
            Duration::from_secs(2),
        ),
    ]);
    let completion = llm.complete(&request()).await.unwrap();
    assert_eq!(completion.provider, "openrouter");
    assert_eq!(
        completion.model_name,
        "openrouter:deepseek/deepseek-v4-flash"
    );
    assert_eq!(
        llm.selected_model_name(),
        "openai:gpt-5.6-luna with openrouter:deepseek/deepseek-v4-flash fallback"
    );
}

#[tokio::test]
async fn every_provider_down_is_unavailable() {
    let primary = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(500))
        .expect(1)
        .mount(&primary)
        .await;
    let llm = client(vec![provider(
        "openai",
        &primary,
        "gpt-5.6-luna",
        Duration::from_secs(2),
    )]);
    let err = llm.complete(&request()).await.unwrap_err();
    assert!(matches!(err, LlmError::Unavailable(_)), "{err}");
    let mapped: ab_core::Error = err.into();
    assert_eq!(mapped.code(), ab_core::ErrorCode::AiProviderUnavailable);
}

#[tokio::test]
async fn structured_output_repairs_once_then_gives_up() {
    let server = MockServer::start().await;
    // First reply: prose. The repair request must carry the bad reply and
    // the correction as trailing messages.
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(completion_body(
            "Sure! Here is my answer without JSON.",
            "gpt-5.6-luna",
        )))
        .up_to_n_times(1)
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .and(body_partial_json(serde_json::json!({
            "messages": [
                { "role": "system" }, { "role": "user" },
                { "role": "assistant", "content": "Sure! Here is my answer without JSON." },
                { "role": "user" }
            ]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(completion_body(
            "```json\n{\"answer_markdown\": \"repaired\"}\n```",
            "gpt-5.6-luna",
        )))
        .expect(1)
        .mount(&server)
        .await;

    let llm = client(vec![provider(
        "openai",
        &server,
        "gpt-5.6-luna",
        Duration::from_secs(2),
    )]);
    let structured = llm.complete_structured::<Answer>(&request()).await.unwrap();
    assert!(structured.repaired);
    assert_eq!(structured.value.answer_markdown, "repaired");
    assert_eq!(structured.raw["answer_markdown"], "repaired");

    // Two bad replies in a row: InvalidOutput.
    let stubborn = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(completion_body("{\"wrong_field\": 1}", "gpt-5.6-luna")),
        )
        .expect(2)
        .mount(&stubborn)
        .await;
    let llm = client(vec![provider(
        "openai",
        &stubborn,
        "gpt-5.6-luna",
        Duration::from_secs(2),
    )]);
    let err = llm
        .complete_structured::<Answer>(&request())
        .await
        .unwrap_err();
    assert!(matches!(err, LlmError::InvalidOutput(_)), "{err}");
}

#[tokio::test]
async fn slow_provider_hits_the_hard_timeout() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_delay(Duration::from_secs(3))
                .set_body_json(completion_body("late", "gpt-5.6-luna")),
        )
        .mount(&server)
        .await;
    let llm = client(vec![provider(
        "openai",
        &server,
        "gpt-5.6-luna",
        Duration::from_millis(200),
    )]);
    let err = llm.complete(&request()).await.unwrap_err();
    assert!(
        matches!(&err, LlmError::Unavailable(msg) if msg.contains("timed out")),
        "{err}"
    );
}

#[tokio::test]
async fn no_providers_means_disabled() {
    let llm = client(vec![]);
    assert!(!llm.is_enabled());
    assert_eq!(llm.selected_model_name(), "disabled");
    assert_eq!(
        llm.complete(&request()).await.unwrap_err(),
        LlmError::Disabled
    );
    let mapped: ab_core::Error = LlmError::Disabled.into();
    assert_eq!(mapped.code(), ab_core::ErrorCode::AiDisabled);
}
