//! `LlmClient` — the one facade the domain talks to for language models.
//!
//! Speaks the OpenAI-compatible `POST {base_url}/chat/completions` contract
//! (OpenAI primary, OpenRouter fallback — both use the same wire shape), so
//! the provider chain is pure config. Provider wire types never leave this
//! module: `ab-domain` sees [`CompletionRequest`], [`Completion`],
//! [`StreamChunk`] and [`LlmError`] only. Structured output requests a JSON
//! schema (`response_format: json_schema`) and parses the reply with serde,
//! retrying once with the parse error fed back (the legacy pydantic-ai
//! behaviour). Every call has a hard per-provider timeout; a provider that
//! fails before producing output hands over to the next one in the chain.
//! Fixtures in `tests/llm.rs` pin the shapes.

use std::pin::Pin;
use std::time::Duration;

use ab_core::{Error, ErrorCode};
use futures::{Stream, StreamExt};
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;
use serde::de::DeserializeOwned;

/// One provider in the chain. `name` is the operator-facing label used in
/// `model_name` strings (`openai:gpt-…`), logs and admin filters.
#[derive(Clone)]
pub struct ProviderConfig {
    pub name: String,
    /// Origin + version prefix, no trailing slash (`https://api.openai.com/v1`).
    pub base_url: String,
    pub api_key: SecretString,
    pub model: String,
    /// Hard timeout for one HTTP call (connect + full body for
    /// non-streaming; connect + headers for streaming).
    pub timeout: Duration,
}

impl std::fmt::Debug for ProviderConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ProviderConfig")
            .field("name", &self.name)
            .field("base_url", &self.base_url)
            .field("model", &self.model)
            .field("timeout", &self.timeout)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone)]
pub struct LlmConfig {
    /// Tried in order; the first provider that answers wins.
    pub providers: Vec<ProviderConfig>,
    /// Default completion cap when a request does not set one.
    pub max_output_tokens: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    System,
    User,
    Assistant,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

impl ChatMessage {
    #[must_use]
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: Role::System,
            content: content.into(),
        }
    }

    #[must_use]
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: Role::User,
            content: content.into(),
        }
    }

    #[must_use]
    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: Role::Assistant,
            content: content.into(),
        }
    }
}

/// A JSON schema the reply must satisfy (`response_format: json_schema`).
#[derive(Debug, Clone)]
pub struct OutputSchema {
    pub name: String,
    pub schema: serde_json::Value,
}

#[derive(Debug, Clone, Default)]
pub struct CompletionRequest {
    pub messages: Vec<ChatMessage>,
    pub output_schema: Option<OutputSchema>,
    pub max_output_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

/// Provider-reported token usage (absent when the provider omits it).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Usage {
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct Completion {
    pub text: String,
    /// `{provider}:{model}` as reported by the provider (falls back to the
    /// configured model).
    pub model_name: String,
    pub provider: String,
    pub usage: Usage,
}

/// A parsed structured reply plus the completion that produced it.
#[derive(Debug, Clone)]
pub struct Structured<T> {
    pub value: T,
    pub raw: serde_json::Value,
    pub completion: Completion,
    /// Whether the first reply failed to parse and a repair round was needed.
    pub repaired: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StreamChunk {
    /// A piece of the reply text, in order.
    Delta(String),
    /// The stream ended cleanly.
    Done { model_name: String, usage: Usage },
}

/// Why a call failed. `Unavailable`/`Rejected` are per-provider and drive
/// the fallback chain; `InvalidOutput` is about the reply, not the transport.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LlmError {
    /// No provider configured (or the master switch is off).
    Disabled,
    /// Transport failure, timeout, 5xx or 429 — try the next provider.
    Unavailable(String),
    /// The provider refused the request (other 4xx) — also falls through to
    /// the next provider (a bad key on one provider must not take AI down).
    Rejected(String),
    /// The reply was not the JSON the schema asked for, even after a repair.
    InvalidOutput(String),
}

impl std::fmt::Display for LlmError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Disabled => f.write_str("AI provider disabled"),
            Self::Unavailable(msg) => write!(f, "AI provider unavailable: {msg}"),
            Self::Rejected(msg) => write!(f, "AI provider rejected the request: {msg}"),
            Self::InvalidOutput(msg) => write!(f, "AI provider returned unusable output: {msg}"),
        }
    }
}

impl std::error::Error for LlmError {}

impl From<LlmError> for Error {
    fn from(err: LlmError) -> Self {
        match err {
            LlmError::Disabled => Self::app(ErrorCode::AiDisabled, "AI provider is not configured"),
            other => Self::app(ErrorCode::AiProviderUnavailable, other.to_string()),
        }
    }
}

struct Provider {
    config: ProviderConfig,
    http: reqwest::Client,
}

pub struct LlmClient {
    providers: Vec<Provider>,
    max_output_tokens: u32,
}

impl std::fmt::Debug for LlmClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LlmClient")
            .field(
                "providers",
                &self.providers.iter().map(|p| &p.config).collect::<Vec<_>>(),
            )
            .finish_non_exhaustive()
    }
}

pub type CompletionStream = Pin<Box<dyn Stream<Item = Result<StreamChunk, LlmError>> + Send>>;

// ── Wire shapes (private) ───────────────────────────────────────────────────

#[derive(Deserialize)]
struct ChatResponse {
    model: Option<String>,
    #[serde(default)]
    choices: Vec<Choice>,
    usage: Option<WireUsage>,
}

#[derive(Deserialize)]
struct Choice {
    message: Option<WireMessage>,
    delta: Option<WireMessage>,
}

#[derive(Deserialize, Default)]
struct WireMessage {
    content: Option<String>,
}

#[derive(Deserialize)]
struct WireUsage {
    prompt_tokens: Option<u32>,
    completion_tokens: Option<u32>,
}

impl From<WireUsage> for Usage {
    fn from(u: WireUsage) -> Self {
        Self {
            input_tokens: u.prompt_tokens,
            output_tokens: u.completion_tokens,
        }
    }
}

impl LlmConfig {
    /// The provider chain the `AB__AI__*` section describes: OpenAI when
    /// its key is set, then OpenRouter when its key is set. Empty when
    /// neither is configured or the master switch is off.
    #[must_use]
    pub fn from_ai_config(config: &ab_core::config::AiConfig) -> Self {
        let mut providers = Vec::with_capacity(2);
        if !config.ai_enabled {
            return Self {
                providers,
                max_output_tokens: config.max_output_tokens,
            };
        }
        let key_of = |key: &Option<SecretString>| {
            key.as_ref()
                .filter(|k| !k.expose_secret().trim().is_empty())
                .cloned()
        };
        if let Some(api_key) = key_of(&config.openai_api_key) {
            providers.push(ProviderConfig {
                name: "openai".into(),
                base_url: config.openai_base_url.trim_end_matches('/').to_owned(),
                api_key,
                model: config.openai_model.clone(),
                timeout: Duration::from_secs_f64(config.openai_timeout_secs.max(0.1)),
            });
        }
        if let Some(api_key) = key_of(&config.openrouter_api_key) {
            providers.push(ProviderConfig {
                name: "openrouter".into(),
                base_url: config.openrouter_base_url.trim_end_matches('/').to_owned(),
                api_key,
                model: config.openrouter_model.clone(),
                timeout: Duration::from_secs_f64(config.openrouter_timeout_secs.max(0.1)),
            });
        }
        Self {
            providers,
            max_output_tokens: config.max_output_tokens,
        }
    }
}

impl LlmClient {
    /// The client for the configured section, `None` when no provider is
    /// usable (AI routes then answer 503 `ai-disabled` / draft mode).
    pub fn from_ai_config(config: &ab_core::config::AiConfig) -> ab_core::Result<Option<Self>> {
        let llm = LlmConfig::from_ai_config(config);
        if llm.providers.is_empty() {
            return Ok(None);
        }
        Self::new(llm).map(Some)
    }

    pub fn new(config: LlmConfig) -> ab_core::Result<Self> {
        let mut providers = Vec::with_capacity(config.providers.len());
        for provider in config.providers {
            let http = reqwest::Client::builder()
                .timeout(provider.timeout)
                .build()
                .map_err(|e| Error::internal("building llm http client", e))?;
            providers.push(Provider {
                config: provider,
                http,
            });
        }
        Ok(Self {
            providers,
            max_output_tokens: config.max_output_tokens,
        })
    }

    /// Whether at least one provider is configured.
    #[must_use]
    pub fn is_enabled(&self) -> bool {
        !self.providers.is_empty()
    }

    /// Legacy `selected_model_name()`: `openai:m` or `openai:m with
    /// openrouter:n fallback`.
    #[must_use]
    pub fn selected_model_name(&self) -> String {
        let mut names = self
            .providers
            .iter()
            .map(|p| format!("{}:{}", p.config.name, p.config.model));
        let Some(primary) = names.next() else {
            return "disabled".into();
        };
        names.next().map_or(primary.clone(), |fallback| {
            format!("{primary} with {fallback} fallback")
        })
    }

    /// One non-streaming completion through the provider chain.
    pub async fn complete(&self, request: &CompletionRequest) -> Result<Completion, LlmError> {
        if self.providers.is_empty() {
            return Err(LlmError::Disabled);
        }
        let mut last = LlmError::Disabled;
        for provider in &self.providers {
            match self.complete_with(provider, request).await {
                Ok(completion) => return Ok(completion),
                Err(err) => {
                    tracing::warn!(provider = %provider.config.name, %err, "llm provider failed; trying next");
                    last = err;
                }
            }
        }
        Err(last)
    }

    /// Streamed completion. Fallback applies until the first provider
    /// accepts the request (status 2xx); a stream that breaks mid-way
    /// surfaces as an error item, not a retry.
    pub async fn stream(&self, request: &CompletionRequest) -> Result<CompletionStream, LlmError> {
        if self.providers.is_empty() {
            return Err(LlmError::Disabled);
        }
        let mut last = LlmError::Disabled;
        for provider in &self.providers {
            match self.open_stream(provider, request).await {
                Ok(stream) => return Ok(stream),
                Err(err) => {
                    tracing::warn!(provider = %provider.config.name, %err, "llm stream open failed; trying next");
                    last = err;
                }
            }
        }
        Err(last)
    }

    /// Ask for JSON matching the request's schema and parse it as `T`. One
    /// repair round: the invalid reply and the parse error go back to the
    /// model, which must answer with the JSON object alone.
    pub async fn complete_structured<T: DeserializeOwned>(
        &self,
        request: &CompletionRequest,
    ) -> Result<Structured<T>, LlmError> {
        let first = self.complete(request).await?;
        match parse_structured::<T>(&first.text) {
            Ok((value, raw)) => Ok(Structured {
                value,
                raw,
                completion: first,
                repaired: false,
            }),
            Err(parse_err) => {
                tracing::info!(%parse_err, "structured reply unparsable; repair round");
                let mut repair = request.clone();
                repair.messages.push(ChatMessage::assistant(first.text.clone()));
                repair.messages.push(ChatMessage::user(format!(
                    "Your previous reply was not valid JSON for the requested schema ({parse_err}). \
                     Reply again with only the JSON object — no prose, no code fences."
                )));
                let second = self.complete(&repair).await?;
                let (value, raw) =
                    parse_structured::<T>(&second.text).map_err(LlmError::InvalidOutput)?;
                Ok(Structured {
                    value,
                    raw,
                    completion: second,
                    repaired: true,
                })
            }
        }
    }

    fn body(&self, provider: &Provider, request: &CompletionRequest, stream: bool) -> serde_json::Value {
        let mut body = serde_json::json!({
            "model": provider.config.model,
            "messages": request.messages,
            "stream": stream,
        });
        let cap = request.max_output_tokens.unwrap_or(self.max_output_tokens);
        // OpenAI retired `max_tokens` for its newer chat models; the
        // OpenAI-compatible ecosystem (OpenRouter, DeepSeek) still speaks it.
        let cap_key = if provider.config.name == "openai" {
            "max_completion_tokens"
        } else {
            "max_tokens"
        };
        body[cap_key] = cap.into();
        if let Some(temperature) = request.temperature {
            body["temperature"] = temperature.into();
        }
        if let Some(schema) = &request.output_schema {
            body["response_format"] = serde_json::json!({
                "type": "json_schema",
                "json_schema": { "name": schema.name, "schema": schema.schema, "strict": false },
            });
        }
        if stream {
            body["stream_options"] = serde_json::json!({ "include_usage": true });
        }
        body
    }

    fn post(
        &self,
        provider: &Provider,
        request: &CompletionRequest,
        stream: bool,
    ) -> reqwest::RequestBuilder {
        provider
            .http
            .post(format!("{}/chat/completions", provider.config.base_url))
            .bearer_auth(provider.config.api_key.expose_secret())
            .json(&self.body(provider, request, stream))
    }

    async fn complete_with(
        &self,
        provider: &Provider,
        request: &CompletionRequest,
    ) -> Result<Completion, LlmError> {
        let response = self
            .post(provider, request, false)
            .send()
            .await
            .map_err(|e| transport_error(&e))?;
        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| LlmError::Unavailable(format!("reading completion body: {e}")))?;
        if !status.is_success() {
            return Err(classify(status, &text));
        }
        let parsed: ChatResponse = serde_json::from_str(&text)
            .map_err(|e| LlmError::Unavailable(format!("completion shape: {e}")))?;
        let content = parsed
            .choices
            .into_iter()
            .next()
            .and_then(|c| c.message)
            .and_then(|m| m.content)
            .ok_or_else(|| LlmError::Rejected("completion carried no message content".into()))?;
        Ok(Completion {
            text: content,
            model_name: model_label(&provider.config, parsed.model.as_deref()),
            provider: provider.config.name.clone(),
            usage: parsed.usage.map(Into::into).unwrap_or_default(),
        })
    }

    async fn open_stream(
        &self,
        provider: &Provider,
        request: &CompletionRequest,
    ) -> Result<CompletionStream, LlmError> {
        let response = self
            .post(provider, request, true)
            .send()
            .await
            .map_err(|e| transport_error(&e))?;
        let status = response.status();
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(classify(status, &text));
        }
        let config = provider.config.clone();
        let mut bytes = response.bytes_stream();
        let stream = async_stream::stream! {
            let mut buffer: Vec<u8> = Vec::new();
            let mut model: Option<String> = None;
            let mut usage = Usage::default();
            let mut done = false;
            'outer: while let Some(chunk) = bytes.next().await {
                let chunk = match chunk {
                    Ok(chunk) => chunk,
                    Err(err) => {
                        yield Err(LlmError::Unavailable(format!("stream interrupted: {err}")));
                        return;
                    }
                };
                buffer.extend_from_slice(&chunk);
                while let Some(event) = take_event(&mut buffer) {
                    match parse_event(&event) {
                        SseEvent::Done => {
                            done = true;
                            break 'outer;
                        }
                        SseEvent::Skip => {}
                        SseEvent::Data(data) => match serde_json::from_str::<ChatResponse>(&data) {
                            Ok(parsed) => {
                                if let Some(m) = parsed.model {
                                    model = Some(m);
                                }
                                if let Some(u) = parsed.usage {
                                    usage = u.into();
                                }
                                for choice in parsed.choices {
                                    if let Some(text) =
                                        choice.delta.or(choice.message).and_then(|d| d.content)
                                        && !text.is_empty()
                                    {
                                        yield Ok(StreamChunk::Delta(text));
                                    }
                                }
                            }
                            Err(err) => {
                                yield Err(LlmError::Unavailable(format!("stream chunk shape: {err}")));
                                return;
                            }
                        },
                    }
                }
            }
            if !done && !buffer.is_empty() {
                // A final event without the trailing blank line.
                if let SseEvent::Data(data) = parse_event(&buffer)
                    && let Ok(parsed) = serde_json::from_str::<ChatResponse>(&data)
                {
                    if let Some(u) = parsed.usage {
                        usage = u.into();
                    }
                    for choice in parsed.choices {
                        if let Some(text) = choice.delta.and_then(|d| d.content)
                            && !text.is_empty()
                        {
                            yield Ok(StreamChunk::Delta(text));
                        }
                    }
                }
            }
            yield Ok(StreamChunk::Done {
                model_name: model_label(&config, model.as_deref()),
                usage,
            });
        };
        Ok(Box::pin(stream))
    }
}

fn model_label(config: &ProviderConfig, reported: Option<&str>) -> String {
    format!("{}:{}", config.name, reported.unwrap_or(&config.model))
}

fn transport_error(err: &reqwest::Error) -> LlmError {
    if err.is_timeout() {
        LlmError::Unavailable("request timed out".into())
    } else {
        LlmError::Unavailable(format!("request failed: {err}"))
    }
}

/// 5xx / 429 → unavailable; other 4xx → rejected. Both fall through the
/// chain; the distinction is for logs and the breaker-less retry policy.
fn classify(status: reqwest::StatusCode, body: &str) -> LlmError {
    let snippet: String = body.chars().take(300).collect();
    if status.is_server_error() || status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        LlmError::Unavailable(format!("HTTP {status}: {snippet}"))
    } else {
        LlmError::Rejected(format!("HTTP {status}: {snippet}"))
    }
}

enum SseEvent {
    Data(String),
    Done,
    Skip,
}

/// Pop one complete SSE event (terminated by a blank line) off the buffer.
fn take_event(buffer: &mut Vec<u8>) -> Option<Vec<u8>> {
    let boundary = buffer
        .windows(2)
        .position(|w| w == b"\n\n")
        .map(|i| (i, 2))
        .or_else(|| {
            buffer
                .windows(4)
                .position(|w| w == b"\r\n\r\n")
                .map(|i| (i, 4))
        })?;
    let (at, len) = boundary;
    let event = buffer[..at].to_vec();
    buffer.drain(..at + len);
    Some(event)
}

/// Join the `data:` lines of one event; `[DONE]` is the OpenAI terminator.
fn parse_event(raw: &[u8]) -> SseEvent {
    let text = String::from_utf8_lossy(raw);
    let data: Vec<&str> = text
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(str::trim_start)
        .collect();
    if data.is_empty() {
        return SseEvent::Skip;
    }
    let joined = data.join("\n");
    if joined.trim() == "[DONE]" {
        SseEvent::Done
    } else {
        SseEvent::Data(joined)
    }
}

/// Lenient JSON extraction: strip code fences, fall back to the outermost
/// `{…}` when the model wrapped the object in prose.
pub fn extract_json(text: &str) -> Result<serde_json::Value, String> {
    let trimmed = text.trim();
    let unfenced = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .and_then(|s| s.strip_suffix("```"))
        .map_or(trimmed, str::trim);
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(unfenced) {
        return Ok(value);
    }
    let start = unfenced.find('{').ok_or_else(|| "no JSON object in reply".to_owned())?;
    let end = unfenced
        .rfind('}')
        .ok_or_else(|| "unterminated JSON object in reply".to_owned())?;
    if end <= start {
        return Err("unterminated JSON object in reply".into());
    }
    serde_json::from_str(&unfenced[start..=end]).map_err(|e| e.to_string())
}

fn parse_structured<T: DeserializeOwned>(text: &str) -> Result<(T, serde_json::Value), String> {
    let raw = extract_json(text)?;
    let value: T = serde_json::from_value(raw.clone()).map_err(|e| e.to_string())?;
    Ok((value, raw))
}

/// Token estimates for the budget ledger (legacy `TokenBudgetService.estimate_tokens`):
/// the model's tiktoken encoding, `cl100k_base` when the model is unknown.
pub mod tokens {
    /// Number of tokens `text` occupies for `model`.
    #[must_use]
    pub fn estimate(text: &str, model: &str) -> usize {
        let bare = model.split_once(':').map_or(model, |(_, m)| m);
        let bpe = tiktoken_rs::bpe_for_model(bare)
            .unwrap_or_else(|_| tiktoken_rs::cl100k_base_singleton());
        bpe.encode_ordinary(text).len()
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn extract_json_handles_fences_and_prose() {
        let fenced = "```json\n{\"a\": 1}\n```";
        assert_eq!(extract_json(fenced).unwrap()["a"], 1);
        let prose = "Sure! Here it is: {\"a\": {\"b\": 2}} hope that helps";
        assert_eq!(extract_json(prose).unwrap()["a"]["b"], 2);
        assert!(extract_json("no json here").is_err());
    }

    #[test]
    fn sse_events_split_and_parse() {
        let mut buffer = b"data: {\"x\":1}\n\ndata: [DONE]\n\npartial".to_vec();
        let first = take_event(&mut buffer).unwrap();
        assert!(matches!(parse_event(&first), SseEvent::Data(d) if d == "{\"x\":1}"));
        let second = take_event(&mut buffer).unwrap();
        assert!(matches!(parse_event(&second), SseEvent::Done));
        assert!(take_event(&mut buffer).is_none());
        assert_eq!(buffer, b"partial");
    }

    #[test]
    fn token_estimates_are_stable_and_model_tolerant() {
        let n = tokens::estimate("hello world, this is a budget check", "gpt-5.6-luna");
        assert!(n >= 5 && n <= 12, "got {n}");
        assert_eq!(
            tokens::estimate("same text", "openai:gpt-4o"),
            tokens::estimate("same text", "gpt-4o")
        );
        assert_eq!(tokens::estimate("", "unknown-model"), 0);
    }

    #[test]
    fn selected_model_name_matches_legacy_shape() {
        let client = LlmClient::new(LlmConfig {
            providers: vec![
                ProviderConfig {
                    name: "openai".into(),
                    base_url: "http://x".into(),
                    api_key: SecretString::from("k"),
                    model: "gpt-5.6-luna".into(),
                    timeout: Duration::from_secs(1),
                },
                ProviderConfig {
                    name: "openrouter".into(),
                    base_url: "http://y".into(),
                    api_key: SecretString::from("k"),
                    model: "deepseek/deepseek-v4-flash".into(),
                    timeout: Duration::from_secs(1),
                },
            ],
            max_output_tokens: 100,
        })
        .unwrap();
        assert_eq!(
            client.selected_model_name(),
            "openai:gpt-5.6-luna with openrouter:deepseek/deepseek-v4-flash fallback"
        );
        assert!(!format!("{client:?}").contains("api_key: \"k\""));
    }
}
