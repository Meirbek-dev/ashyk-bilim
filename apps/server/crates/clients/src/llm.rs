//! `LlmClient` - the one facade the domain talks to for language models.
//!
//! Speaks the Anthropic Messages API (`POST {base_url}/messages`) for the
//! provider named [`ANTHROPIC`] and the OpenAI-compatible
//! `POST {base_url}/chat/completions` contract for the rest (OpenAI,
//! OpenRouter), so the provider chain is pure config. Provider wire types never leave this
//! module: `ab-domain` sees [`CompletionRequest`], [`Completion`],
//! [`StreamChunk`] and [`LlmError`] only. Structured output requests a JSON
//! schema (`response_format: json_schema`) and parses the reply with serde,
//! retrying once with the parse error fed back (the legacy pydantic-ai
//! behaviour). Every call has a hard per-provider timeout; a provider that
//! fails before producing output hands over to the next one in the chain.
//!
//! One request renders per provider (docs/AI-FIRST.md, owner decisions 2026-11-23):
//! - [`CompletionRequest::context`] is the stable prefix after the system prompt: on Anthropic a second system
//!   block marked `cache_control` (prompt caching), elsewhere a system message.
//! - [`CompletionRequest::documents`] are the citable sources: with `cite_documents` on Anthropic they go as
//!   `document` blocks with the Citations API on and the reply's citations come back in
//!   [`Completion::citations`]; otherwise they are listed as text after the last user turn (the model cites them
//!   by id in its JSON, the anchors the domain validates).
//! - [`CompletionRequest::attachments`] (submitted PDFs) go to Anthropic as `document` blocks; other providers get
//!   their extracted text in place of the placeholder.
//! - [`ModelTier::Grading`] picks the provider's grading model (Sonnet on Anthropic).
//!
//! Message Batches ([`LlmClient::submit_batch`] / [`LlmClient::poll_batch`]) run on the Anthropic provider only.
//! Fixtures in `tests/llm.rs` pin the shapes.

use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use ab_core::{Error, ErrorCode};
use base64::Engine as _;
use futures::{Stream, StreamExt};
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;
use serde::de::DeserializeOwned;

/// Provider name that selects the Anthropic Messages wire shape.
pub const ANTHROPIC: &str = "anthropic";

/// Messages API version header.
const ANTHROPIC_VERSION: &str = "2023-06-01";

/// `count_tokens` is an estimate before the call; a slow one is skipped, not waited for.
const COUNT_TOKENS_TIMEOUT: Duration = Duration::from_secs(5);

/// Header of the text list of citable sources (the anchors the model cites by id).
const SOURCES_HEADER: &str =
    "Citation sources:\nUse only these authoritative sources for the selected scope.";

/// One provider in the chain. `name` is the operator-facing label used in
/// `model_name` strings (`openai:gpt-…`), logs and admin filters.
#[derive(Clone)]
pub struct ProviderConfig {
    pub name: String,
    /// Origin + version prefix, no trailing slash (`https://api.openai.com/v1`).
    pub base_url: String,
    pub api_key: SecretString,
    pub model: String,
    /// The model for [`ModelTier::Grading`] requests; `None` = `model`.
    pub grading_model: Option<String>,
    /// Hard timeout for one HTTP call: connect + full body for
    /// non-streaming; connect, then each read (headers, every chunk) for
    /// streaming, so a long answer that keeps arriving is not cut.
    pub timeout: Duration,
}

impl ProviderConfig {
    fn model_for(&self, tier: ModelTier) -> &str {
        match tier {
            ModelTier::Standard => &self.model,
            ModelTier::Grading => self.grading_model.as_deref().unwrap_or(&self.model),
        }
    }
}

impl std::fmt::Debug for ProviderConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ProviderConfig")
            .field("name", &self.name)
            .field("base_url", &self.base_url)
            .field("model", &self.model)
            .field("grading_model", &self.grading_model)
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

/// Which of the provider's models answers (docs/AI-FIRST.md: Sonnet grades, Haiku does the rest).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum ModelTier {
    #[default]
    Standard,
    /// `grade_assistant` / `grade_draft`.
    Grading,
}

/// One citable source. `title` is its header line (`[id] type | ref | label`), `text` its excerpt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub text: String,
}

/// A submitted file the last user turn refers to by `placeholder`.
#[derive(Debug, Clone)]
pub struct Attachment {
    /// Replaced in the message text: by `text` for providers that cannot read the file, by a reference to the
    /// attached document on Anthropic.
    pub placeholder: String,
    pub name: String,
    /// `application/pdf` (the only kind sent as a file).
    pub media_type: String,
    pub data: Arc<Vec<u8>>,
    /// The extracted text (the fallback).
    pub text: String,
}

#[derive(Debug, Clone, Default)]
pub struct CompletionRequest {
    pub messages: Vec<ChatMessage>,
    /// The stable context after the system prompt (course outline, rubric): cached on Anthropic.
    pub context: Option<String>,
    /// Citable sources, listed after the last user turn (or Citations API documents, see `cite_documents`).
    pub documents: Vec<Document>,
    /// Anthropic: send `documents` as `document` blocks with citations on.
    pub cite_documents: bool,
    pub attachments: Vec<Attachment>,
    pub output_schema: Option<OutputSchema>,
    pub max_output_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub tier: ModelTier,
}

/// Provider-reported token usage (absent when the provider omits it).
/// `input_tokens` counts every prompt token, cached ones included.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Usage {
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    /// Prompt tokens read from the prompt cache (Anthropic).
    pub cache_read_tokens: Option<u32>,
    /// Prompt tokens written to the prompt cache (Anthropic).
    pub cache_write_tokens: Option<u32>,
}

impl Usage {
    /// Two calls' usage together; a count either call omitted stays absent
    /// (cache counts: the one that reported).
    #[must_use]
    pub fn plus(self, other: Self) -> Self {
        let add = |a: Option<u32>, b: Option<u32>| Some(a?.saturating_add(b?));
        let either = |a: Option<u32>, b: Option<u32>| match (a, b) {
            (Some(a), Some(b)) => Some(a.saturating_add(b)),
            (a, b) => a.or(b),
        };
        Self {
            input_tokens: add(self.input_tokens, other.input_tokens),
            output_tokens: add(self.output_tokens, other.output_tokens),
            cache_read_tokens: either(self.cache_read_tokens, other.cache_read_tokens),
            cache_write_tokens: either(self.cache_write_tokens, other.cache_write_tokens),
        }
    }
}

/// A span of the reply the provider attributes to one of the request's documents (Citations API).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cited {
    /// [`Document::id`].
    pub document_id: String,
    pub cited_text: String,
}

#[derive(Debug, Clone)]
pub struct Completion {
    pub text: String,
    /// `{provider}:{model}` as reported by the provider (falls back to the
    /// configured model).
    pub model_name: String,
    pub provider: String,
    pub usage: Usage,
    /// Citations API spans, in reply order (empty without `cite_documents` or off Anthropic).
    pub citations: Vec<Cited>,
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
    Done {
        model_name: String,
        usage: Usage,
        citations: Vec<Cited>,
    },
}

/// Why a call failed. `Unavailable`/`Rejected` are per-provider and drive
/// the fallback chain; `InvalidOutput` is about the reply, not the transport.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LlmError {
    /// No provider configured (or the master switch is off).
    Disabled,
    /// Transport failure, timeout, 5xx or 429 - try the next provider.
    Unavailable(String),
    /// The provider refused the request (other 4xx) - also falls through to
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
        // The provider's own words (a body snippet) stay in the log; the client gets the kind of failure only.
        let message = match &err {
            LlmError::Disabled => {
                return Self::app(ErrorCode::AiDisabled, "AI provider is not configured");
            }
            LlmError::Unavailable(_) => "AI provider unavailable",
            LlmError::Rejected(_) => "AI provider rejected the request",
            LlmError::InvalidOutput(_) => "AI provider returned unusable output",
        };
        tracing::warn!(%err, "llm call failed");
        Self::app(ErrorCode::AiProviderUnavailable, message)
    }
}

/// A submitted batch's state ([`LlmClient::poll_batch`]).
#[derive(Debug, Clone)]
pub enum BatchPoll {
    /// Still processing.
    Pending,
    /// The request's result: the raw Messages response, kept by the caller across restarts and turned into a
    /// [`Completion`] with [`LlmClient::batch_completion`].
    Succeeded(serde_json::Value),
    /// The request errored, expired or was canceled.
    Failed(String),
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
            ..Self::default()
        }
    }
}

#[derive(Deserialize)]
struct MessagesResponse {
    model: Option<String>,
    #[serde(default)]
    content: Vec<ContentBlock>,
    stop_reason: Option<String>,
    usage: Option<MessagesUsage>,
}

/// Text and thinking blocks alike; only `text` blocks carry the reply.
#[derive(Deserialize)]
struct ContentBlock {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
    #[serde(default)]
    citations: Option<Vec<WireCitation>>,
}

/// One Citations API location (`char_location`, `page_location`, ...): only the document and the quote matter.
#[derive(Deserialize)]
struct WireCitation {
    document_index: Option<usize>,
    cited_text: Option<String>,
}

#[derive(Deserialize, Default, Clone, Copy)]
#[allow(clippy::struct_field_names, reason = "the provider's field names")]
struct MessagesUsage {
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
    cache_read_input_tokens: Option<u32>,
    cache_creation_input_tokens: Option<u32>,
}

/// One Messages streaming event (`message_start`, `content_block_delta`,
/// `message_delta`, `message_stop`, `error`, `ping`, ...).
#[derive(Deserialize)]
struct MessagesEvent {
    #[serde(rename = "type")]
    kind: String,
    message: Option<MessagesResponse>,
    delta: Option<MessagesDelta>,
    usage: Option<MessagesUsage>,
    error: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct MessagesDelta {
    #[serde(rename = "type")]
    kind: Option<String>,
    text: Option<String>,
    stop_reason: Option<String>,
    citation: Option<WireCitation>,
}

#[derive(Deserialize)]
struct CountTokensResponse {
    input_tokens: u32,
}

#[derive(Deserialize)]
struct BatchResponse {
    id: String,
    processing_status: String,
}

#[derive(Deserialize)]
struct BatchResultLine {
    custom_id: String,
    result: BatchResult,
}

#[derive(Deserialize)]
struct BatchResult {
    #[serde(rename = "type")]
    kind: String,
    message: Option<serde_json::Value>,
    error: Option<serde_json::Value>,
}

impl LlmConfig {
    /// The provider chain the `AB__AI__*` section describes: Claude, then
    /// OpenAI, then OpenRouter, each when its key is set. Empty when
    /// neither is configured or the master switch is off.
    #[must_use]
    pub fn from_ai_config(config: &ab_core::config::AiConfig) -> Self {
        let mut providers = Vec::with_capacity(3);
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
        if let Some(api_key) = key_of(&config.claude_api_key) {
            providers.push(ProviderConfig {
                name: ANTHROPIC.into(),
                base_url: config.claude_base_url.trim_end_matches('/').to_owned(),
                api_key,
                model: config.claude_model.clone(),
                grading_model: Some(config.claude_grading_model.clone()),
                timeout: Duration::from_secs_f64(config.claude_timeout_secs.max(0.1)),
            });
        }
        if let Some(api_key) = key_of(&config.openai_api_key) {
            providers.push(ProviderConfig {
                name: "openai".into(),
                base_url: config.openai_base_url.trim_end_matches('/').to_owned(),
                api_key,
                model: config.openai_model.clone(),
                grading_model: None,
                timeout: Duration::from_secs_f64(config.openai_timeout_secs.max(0.1)),
            });
        }
        if let Some(api_key) = key_of(&config.openrouter_api_key) {
            providers.push(ProviderConfig {
                name: "openrouter".into(),
                base_url: config.openrouter_base_url.trim_end_matches('/').to_owned(),
                api_key,
                model: config.openrouter_model.clone(),
                grading_model: None,
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
                .connect_timeout(provider.timeout)
                .read_timeout(provider.timeout)
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
    pub const fn is_enabled(&self) -> bool {
        !self.providers.is_empty()
    }

    /// The primary provider when it is Anthropic (batches, token counting).
    fn anthropic(&self) -> Option<&Provider> {
        self.providers
            .first()
            .filter(|p| p.config.name == ANTHROPIC)
    }

    /// Whether requests can go through Message Batches (the primary provider is Anthropic).
    #[must_use]
    pub fn supports_batches(&self) -> bool {
        self.anthropic().is_some()
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
        names.next().map_or_else(
            || primary.clone(),
            |fallback| format!("{primary} with {fallback} fallback"),
        )
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
    /// repair round ([`repair_request`]); the returned usage covers both
    /// calls. Budgeted callers run the two rounds themselves so the repair
    /// is admitted like any request.
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
                let mut second = self
                    .complete(&repair_request(request, &first.text, &parse_err))
                    .await?;
                let (value, raw) =
                    parse_structured::<T>(&second.text).map_err(LlmError::InvalidOutput)?;
                second.usage = first.usage.plus(second.usage);
                Ok(Structured {
                    value,
                    raw,
                    completion: second,
                    repaired: true,
                })
            }
        }
    }

    /// The prompt's token count from Anthropic `count_tokens` when the primary provider is Anthropic; `None`
    /// otherwise or when the call fails (the caller falls back to [`tokens::estimate`]).
    pub async fn count_tokens(&self, request: &CompletionRequest) -> Option<u32> {
        let provider = self.anthropic()?;
        let mut body = self.messages_body(provider, request, false);
        if let Some(map) = body.as_object_mut() {
            for key in ["max_tokens", "stream", "output_config"] {
                map.remove(key);
            }
        }
        let response =
            Self::anthropic_request(provider, reqwest::Method::POST, "/messages/count_tokens")
                .json(&body)
                .timeout(COUNT_TOKENS_TIMEOUT.min(provider.config.timeout))
                .send()
                .await;
        let counted = match response {
            Ok(response) if response.status().is_success() => {
                response.json::<CountTokensResponse>().await.ok()
            }
            Ok(response) => {
                tracing::info!(status = %response.status(), "count_tokens refused; estimating");
                None
            }
            Err(err) => {
                tracing::info!(%err, "count_tokens failed; estimating");
                None
            }
        };
        counted.map(|c| c.input_tokens)
    }

    /// Submit one request as a Message Batch of one (Anthropic primary only). Returns the batch id.
    pub async fn submit_batch(
        &self,
        custom_id: &str,
        request: &CompletionRequest,
    ) -> Result<String, LlmError> {
        let provider = self.anthropic().ok_or(LlmError::Disabled)?;
        let mut params = self.messages_body(provider, request, false);
        if let Some(map) = params.as_object_mut() {
            map.remove("stream");
        }
        let body = serde_json::json!({
            "requests": [{ "custom_id": custom_id, "params": params }]
        });
        let response =
            Self::anthropic_request(provider, reqwest::Method::POST, "/messages/batches")
                .json(&body)
                .timeout(provider.config.timeout)
                .send()
                .await
                .map_err(|e| transport_error(&e))?;
        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| LlmError::Unavailable(format!("reading batch body: {e}")))?;
        if !status.is_success() {
            return Err(classify(status, &text));
        }
        let batch: BatchResponse = serde_json::from_str(&text)
            .map_err(|e| LlmError::Unavailable(format!("batch shape: {e}")))?;
        Ok(batch.id)
    }

    /// The state of a submitted batch; once it ended, the result of `custom_id`.
    pub async fn poll_batch(&self, batch_id: &str, custom_id: &str) -> Result<BatchPoll, LlmError> {
        let provider = self.anthropic().ok_or(LlmError::Disabled)?;
        let response = Self::anthropic_request(
            provider,
            reqwest::Method::GET,
            &format!("/messages/batches/{batch_id}"),
        )
        .timeout(provider.config.timeout)
        .send()
        .await
        .map_err(|e| transport_error(&e))?;
        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| LlmError::Unavailable(format!("reading batch body: {e}")))?;
        if !status.is_success() {
            return Err(classify(status, &text));
        }
        let batch: BatchResponse = serde_json::from_str(&text)
            .map_err(|e| LlmError::Unavailable(format!("batch shape: {e}")))?;
        if batch.processing_status != "ended" {
            return Ok(BatchPoll::Pending);
        }
        // Always our own origin: `results_url` comes from the response, the key must not follow it elsewhere.
        let response = Self::anthropic_request(
            provider,
            reqwest::Method::GET,
            &format!("/messages/batches/{batch_id}/results"),
        )
        .timeout(provider.config.timeout)
        .send()
        .await
        .map_err(|e| transport_error(&e))?;
        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| LlmError::Unavailable(format!("reading batch results: {e}")))?;
        if !status.is_success() {
            return Err(classify(status, &text));
        }
        for line in text.lines().filter(|l| !l.trim().is_empty()) {
            let parsed: BatchResultLine = serde_json::from_str(line)
                .map_err(|e| LlmError::Unavailable(format!("batch result shape: {e}")))?;
            if parsed.custom_id != custom_id {
                continue;
            }
            return Ok(match (parsed.result.kind.as_str(), parsed.result.message) {
                ("succeeded", Some(message)) => BatchPoll::Succeeded(message),
                (kind, _) => {
                    let detail = parsed.result.error.map_or_default(|e| e.to_string());
                    BatchPoll::Failed(format!(
                        "{kind}: {}",
                        detail.chars().take(300).collect::<String>()
                    ))
                }
            });
        }
        Ok(BatchPoll::Failed(
            "the batch has no result for this request".into(),
        ))
    }

    /// Cancel a batch (best effort: a run aborted while its batch is in flight).
    pub async fn cancel_batch(&self, batch_id: &str) {
        let Some(provider) = self.anthropic() else {
            return;
        };
        let sent = Self::anthropic_request(
            provider,
            reqwest::Method::POST,
            &format!("/messages/batches/{batch_id}/cancel"),
        )
        .timeout(provider.config.timeout)
        .send()
        .await;
        if let Err(err) = sent {
            tracing::info!(%batch_id, %err, "batch cancel failed");
        }
    }

    /// A batch result ([`BatchPoll::Succeeded`]) as a completion of the Anthropic provider.
    pub fn batch_completion(
        &self,
        tier: ModelTier,
        message: &serde_json::Value,
    ) -> Result<Completion, LlmError> {
        let provider = self.anthropic().ok_or(LlmError::Disabled)?;
        let parsed: MessagesResponse = serde_json::from_value(message.clone())
            .map_err(|e| LlmError::Unavailable(format!("batch message shape: {e}")))?;
        messages_completion(&provider.config, tier, parsed, &[])
    }

    fn anthropic_request(
        provider: &Provider,
        method: reqwest::Method,
        path: &str,
    ) -> reqwest::RequestBuilder {
        provider
            .http
            .request(method, format!("{}{path}", provider.config.base_url))
            .header("x-api-key", provider.config.api_key.expose_secret())
            .header("anthropic-version", ANTHROPIC_VERSION)
    }

    fn body(
        &self,
        provider: &Provider,
        request: &CompletionRequest,
        stream: bool,
    ) -> serde_json::Value {
        if provider.config.name == ANTHROPIC {
            return self.messages_body(provider, request, stream);
        }
        let mut body = serde_json::json!({
            "model": provider.config.model_for(request.tier),
            "messages": chat_messages(request),
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

    /// The Messages API body. System messages join into the first `system`
    /// block; the schema goes there as an instruction (the agents' schemas
    /// are not strict-mode schemas), the reply is parsed leniently and
    /// repaired once. The context is a second system block marked
    /// `cache_control`: instructions + context are the cached prefix.
    /// Cited documents and attachments are `document` blocks of the last
    /// user turn. No `temperature`: Claude Sonnet 5.5 rejects non-default
    /// sampling. Effort `low` keeps adaptive thinking short.
    fn messages_body(
        &self,
        provider: &Provider,
        request: &CompletionRequest,
        stream: bool,
    ) -> serde_json::Value {
        let mut instructions: Vec<String> = request
            .messages
            .iter()
            .filter(|m| m.role == Role::System)
            .map(|m| m.content.clone())
            .collect();
        if let Some(schema) = &request.output_schema {
            instructions.push(format!(
                "Reply with only a JSON object (no prose, no code fences) that matches \
                 the JSON schema \"{}\":\n{}",
                schema.name, schema.schema
            ));
        }
        let mut system = Vec::new();
        if !instructions.is_empty() {
            system.push(serde_json::json!({ "type": "text", "text": instructions.join("\n\n") }));
        }
        if let Some(context) = request.context.as_deref().filter(|c| !c.is_empty()) {
            system.push(serde_json::json!({
                "type": "text", "text": context, "cache_control": { "type": "ephemeral" }
            }));
        }
        let cite = request.cite_documents && !request.documents.is_empty();
        let turns: Vec<&ChatMessage> = request
            .messages
            .iter()
            .filter(|m| m.role != Role::System)
            .collect();
        let last_user = turns.iter().rposition(|m| m.role == Role::User);
        let messages: Vec<serde_json::Value> = turns
            .iter()
            .enumerate()
            .map(|(i, m)| {
                let mut text = m.content.clone();
                for attachment in &request.attachments {
                    text = text.replace(
                        &attachment.placeholder,
                        &format!("(the attached document «{}»)", attachment.name),
                    );
                }
                if Some(i) != last_user {
                    return serde_json::json!({ "role": m.role, "content": text });
                }
                if !cite {
                    append_sources(&mut text, &request.documents);
                }
                if !cite && request.attachments.is_empty() {
                    return serde_json::json!({ "role": m.role, "content": text });
                }
                let mut blocks = Vec::new();
                if cite {
                    for doc in &request.documents {
                        blocks.push(serde_json::json!({
                            "type": "document",
                            "source": { "type": "text", "media_type": "text/plain", "data": doc.text },
                            "title": doc.title,
                            "citations": { "enabled": true },
                        }));
                    }
                }
                for attachment in &request.attachments {
                    blocks.push(serde_json::json!({
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": attachment.media_type,
                            "data": base64::engine::general_purpose::STANDARD.encode(attachment.data.as_slice()),
                        },
                        "title": attachment.name,
                    }));
                }
                blocks.push(serde_json::json!({ "type": "text", "text": text }));
                serde_json::json!({ "role": m.role, "content": blocks })
            })
            .collect();
        let mut body = serde_json::json!({
            "model": provider.config.model_for(request.tier),
            "max_tokens": request.max_output_tokens.unwrap_or(self.max_output_tokens),
            "messages": messages,
            "output_config": { "effort": "low" },
            "stream": stream,
        });
        if !system.is_empty() {
            body["system"] = system.into();
        }
        body
    }

    fn post(
        &self,
        provider: &Provider,
        request: &CompletionRequest,
        stream: bool,
    ) -> reqwest::RequestBuilder {
        let body = self.body(provider, request, stream);
        let builder = if provider.config.name == ANTHROPIC {
            Self::anthropic_request(provider, reqwest::Method::POST, "/messages")
        } else {
            provider
                .http
                .post(format!("{}/chat/completions", provider.config.base_url))
                .bearer_auth(provider.config.api_key.expose_secret())
        };
        let builder = builder.json(&body);
        // A stream is bounded per read (the client's read timeout), a whole reply by the total.
        if stream {
            builder
        } else {
            builder.timeout(provider.config.timeout)
        }
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
        if provider.config.name == ANTHROPIC {
            let parsed: MessagesResponse = serde_json::from_str(&text)
                .map_err(|e| LlmError::Unavailable(format!("completion shape: {e}")))?;
            return messages_completion(
                &provider.config,
                request.tier,
                parsed,
                &cited_ids(request),
            );
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
            model_name: model_label(&provider.config, request.tier, parsed.model.as_deref()),
            provider: provider.config.name.clone(),
            usage: parsed.usage.map_or_default(Into::into),
            citations: Vec::new(),
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
        let tier = request.tier;
        if config.name == ANTHROPIC {
            return Ok(messages_stream(config, tier, cited_ids(request), response));
        }
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
                model_name: model_label(&config, tier, model.as_deref()),
                usage,
                citations: Vec::new(),
            });
        };
        Ok(Box::pin(stream))
    }
}

/// The OpenAI-compatible message list: the context as a system message after the instructions, attachments as
/// their text, the sources listed after the last user turn.
fn chat_messages(request: &CompletionRequest) -> Vec<ChatMessage> {
    let mut messages: Vec<ChatMessage> = Vec::with_capacity(request.messages.len() + 1);
    let leading = request
        .messages
        .iter()
        .take_while(|m| m.role == Role::System)
        .count();
    messages.extend(request.messages[..leading].iter().cloned());
    if let Some(context) = request.context.as_deref().filter(|c| !c.is_empty()) {
        messages.push(ChatMessage::system(context));
    }
    messages.extend(request.messages[leading..].iter().cloned());
    for message in &mut messages {
        for attachment in &request.attachments {
            message.content = message
                .content
                .replace(&attachment.placeholder, &attachment.text);
        }
    }
    if let Some(last) = messages.iter_mut().rfind(|m| m.role == Role::User) {
        append_sources(&mut last.content, &request.documents);
    }
    messages
}

/// The text list of citable sources (`[id] type | ref | label` / `Excerpt: ...`).
fn append_sources(text: &mut String, documents: &[Document]) {
    if documents.is_empty() {
        return;
    }
    text.push_str("\n\n");
    text.push_str(SOURCES_HEADER);
    for doc in documents {
        text.push('\n');
        text.push_str(&doc.title);
        text.push_str("\nExcerpt: ");
        text.push_str(&doc.text);
    }
}

/// The ids of the documents sent as Citations API blocks, by `document_index`.
fn cited_ids(request: &CompletionRequest) -> Vec<String> {
    if request.cite_documents {
        request.documents.iter().map(|d| d.id.clone()).collect()
    } else {
        Vec::new()
    }
}

impl From<MessagesUsage> for Usage {
    /// Messages `input_tokens` excludes cached tokens; ours counts the whole prompt.
    fn from(u: MessagesUsage) -> Self {
        let cached = u
            .cache_read_input_tokens
            .unwrap_or(0)
            .saturating_add(u.cache_creation_input_tokens.unwrap_or(0));
        Self {
            input_tokens: u.input_tokens.map(|n| n.saturating_add(cached)),
            output_tokens: u.output_tokens,
            cache_read_tokens: u.cache_read_input_tokens,
            cache_write_tokens: u.cache_creation_input_tokens,
        }
    }
}

fn cited(citation: WireCitation, ids: &[String]) -> Option<Cited> {
    let document_id = ids.get(citation.document_index?)?.clone();
    let cited_text = citation.cited_text.filter(|t| !t.trim().is_empty())?;
    Some(Cited {
        document_id,
        cited_text,
    })
}

/// A refusal falls through the chain like any rejection.
fn refused(stop_reason: Option<&str>) -> Option<LlmError> {
    (stop_reason == Some("refusal")).then(|| LlmError::Rejected("the model declined".into()))
}

fn messages_completion(
    config: &ProviderConfig,
    tier: ModelTier,
    parsed: MessagesResponse,
    ids: &[String],
) -> Result<Completion, LlmError> {
    if let Some(err) = refused(parsed.stop_reason.as_deref()) {
        return Err(err);
    }
    let mut text = String::new();
    let mut citations = Vec::new();
    for block in parsed.content.into_iter().filter(|b| b.kind == "text") {
        if let Some(t) = block.text {
            text.push_str(&t);
        }
        citations.extend(
            block
                .citations
                .unwrap_or_default()
                .into_iter()
                .filter_map(|c| cited(c, ids)),
        );
    }
    if text.is_empty() {
        return Err(LlmError::Rejected(format!(
            "completion carried no text (stop_reason {:?})",
            parsed.stop_reason
        )));
    }
    Ok(Completion {
        text,
        model_name: model_label(config, tier, parsed.model.as_deref()),
        provider: config.name.clone(),
        usage: parsed.usage.map_or_default(Into::into),
        citations,
    })
}

/// Messages SSE: text deltas in order, usage from `message_start` (input)
/// and `message_delta` (output, cumulative), citations from
/// `citations_delta`, done at `message_stop`.
fn messages_stream(
    config: ProviderConfig,
    tier: ModelTier,
    ids: Vec<String>,
    response: reqwest::Response,
) -> CompletionStream {
    let mut bytes = response.bytes_stream();
    Box::pin(async_stream::stream! {
        let mut buffer: Vec<u8> = Vec::new();
        let mut model: Option<String> = None;
        let mut usage = Usage::default();
        let mut citations = Vec::new();
        loop {
            let event = match take_event(&mut buffer) {
                Some(event) => event,
                None => match bytes.next().await {
                    Some(Ok(chunk)) => {
                        buffer.extend_from_slice(&chunk);
                        continue;
                    }
                    Some(Err(err)) => {
                        yield Err(LlmError::Unavailable(format!("stream interrupted: {err}")));
                        return;
                    }
                    // A final event without the trailing blank line.
                    None if !buffer.is_empty() => std::mem::take(&mut buffer),
                    None => {
                        yield Err(LlmError::Unavailable("stream ended before message_stop".into()));
                        return;
                    }
                },
            };
            let SseEvent::Data(data) = parse_event(&event) else { continue };
            let parsed = match serde_json::from_str::<MessagesEvent>(&data) {
                Ok(parsed) => parsed,
                Err(err) => {
                    yield Err(LlmError::Unavailable(format!("stream event shape: {err}")));
                    return;
                }
            };
            match parsed.kind.as_str() {
                "message_start" => {
                    if let Some(message) = parsed.message {
                        model = message.model.or(model);
                        if let Some(u) = message.usage {
                            let start = Usage::from(u);
                            usage.input_tokens = start.input_tokens;
                            usage.cache_read_tokens = start.cache_read_tokens;
                            usage.cache_write_tokens = start.cache_write_tokens;
                        }
                    }
                }
                "content_block_delta" => {
                    let Some(delta) = parsed.delta else { continue };
                    match delta.kind.as_deref() {
                        Some("text_delta") => {
                            if let Some(text) = delta.text
                                && !text.is_empty()
                            {
                                yield Ok(StreamChunk::Delta(text));
                            }
                        }
                        Some("citations_delta") => {
                            if let Some(c) = delta.citation.and_then(|c| cited(c, &ids)) {
                                citations.push(c);
                            }
                        }
                        _ => {}
                    }
                }
                "message_delta" => {
                    if let Some(err) = refused(parsed.delta.as_ref().and_then(|d| d.stop_reason.as_deref())) {
                        yield Err(err);
                        return;
                    }
                    if let Some(u) = parsed.usage.and_then(|u| u.output_tokens) {
                        usage.output_tokens = Some(u);
                    }
                }
                "message_stop" => break,
                "error" => {
                    let detail = parsed.error.map_or_default(|e| e.to_string());
                    yield Err(LlmError::Unavailable(format!("stream error: {detail}")));
                    return;
                }
                _ => {}
            }
        }
        yield Ok(StreamChunk::Done {
            model_name: model_label(&config, tier, model.as_deref()),
            usage,
            citations,
        });
    })
}

fn model_label(config: &ProviderConfig, tier: ModelTier, reported: Option<&str>) -> String {
    format!(
        "{}:{}",
        config.name,
        reported.unwrap_or_else(|| config.model_for(tier))
    )
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
    let start = unfenced
        .find('{')
        .ok_or_else(|| "no JSON object in reply".to_owned())?;
    let end = unfenced
        .rfind('}')
        .ok_or_else(|| "unterminated JSON object in reply".to_owned())?;
    if end <= start {
        return Err("unterminated JSON object in reply".into());
    }
    serde_json::from_str(&unfenced[start..=end]).map_err(|e| e.to_string())
}

/// The structured repair round: the invalid `reply` and the parse error go
/// back to the model, which must answer with the JSON object alone.
#[must_use]
pub fn repair_request(
    request: &CompletionRequest,
    reply: &str,
    parse_err: &str,
) -> CompletionRequest {
    let mut repair = request.clone();
    repair
        .messages
        .push(ChatMessage::assistant(reply.to_owned()));
    repair.messages.push(ChatMessage::user(format!(
        "Your previous reply was not valid JSON for the requested schema ({parse_err}). \
         Reply again with only the JSON object - no prose, no code fences."
    )));
    repair
}

/// Parse a structured reply as `T` (code fences and prose around the JSON
/// object tolerated); the error is the reason, for [`repair_request`].
pub fn parse_structured<T: DeserializeOwned>(text: &str) -> Result<(T, serde_json::Value), String> {
    let raw = extract_json(text)?;
    let value: T = serde_json::from_value(raw.clone()).map_err(|e| e.to_string())?;
    Ok((value, raw))
}

/// Token estimates where no provider count exists (docs/REWRITE.md 4.2).
///
/// The ledger reads `usage` from responses, Anthropic prompts are counted with
/// [`LlmClient::count_tokens`], everything else is characters / 3.5.
pub mod tokens {
    /// Tokens `text` occupies, rounded up: characters / 3.5.
    #[must_use]
    pub fn estimate(text: &str) -> usize {
        (text.chars().count() * 2).div_ceil(7)
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
    fn token_estimates_are_chars_over_three_and_a_half() {
        assert_eq!(tokens::estimate(""), 0);
        assert_eq!(tokens::estimate("1234567"), 2);
        assert_eq!(tokens::estimate("12345678"), 3);
        // Characters, not bytes: Cyrillic counts once per letter.
        assert_eq!(tokens::estimate("привет!"), 2);
    }

    #[test]
    fn usage_counts_cached_prompt_tokens_as_input() {
        let usage = Usage::from(MessagesUsage {
            input_tokens: Some(10),
            output_tokens: Some(5),
            cache_read_input_tokens: Some(900),
            cache_creation_input_tokens: None,
        });
        assert_eq!(usage.input_tokens, Some(910));
        assert_eq!(usage.cache_read_tokens, Some(900));
        let both = usage.plus(Usage {
            input_tokens: Some(1),
            output_tokens: Some(1),
            ..Usage::default()
        });
        assert_eq!(both.input_tokens, Some(911));
        assert_eq!(both.cache_read_tokens, Some(900));
    }

    #[test]
    fn selected_model_name_matches_legacy_shape() {
        let client = LlmClient::new(LlmConfig {
            providers: vec![
                ProviderConfig {
                    name: "openai".into(),
                    base_url: "http://x".into(),
                    api_key: SecretString::from("k"),
                    model: "gpt-6-luna".into(),
                    grading_model: None,
                    timeout: Duration::from_secs(1),
                },
                ProviderConfig {
                    name: "openrouter".into(),
                    base_url: "http://y".into(),
                    api_key: SecretString::from("k"),
                    model: "deepseek/deepseek-v4-flash".into(),
                    grading_model: None,
                    timeout: Duration::from_secs(1),
                },
            ],
            max_output_tokens: 100,
        })
        .unwrap();
        assert_eq!(
            client.selected_model_name(),
            "openai:gpt-6-luna with openrouter:deepseek/deepseek-v4-flash fallback"
        );
        assert!(!format!("{client:?}").contains("api_key: \"k\""));
    }

    #[test]
    fn openai_messages_put_context_after_instructions_and_sources_last() {
        let request = CompletionRequest {
            messages: vec![
                ChatMessage::system("rules"),
                ChatMessage::user("old"),
                ChatMessage::assistant("reply"),
                ChatMessage::user("Q {{file}}"),
            ],
            context: Some("Course context:\nOutline".into()),
            documents: vec![Document {
                id: "s1".into(),
                title: "[s1] activity | a | Lesson".into(),
                text: "Body".into(),
            }],
            attachments: vec![Attachment {
                placeholder: "{{file}}".into(),
                name: "w.pdf".into(),
                media_type: "application/pdf".into(),
                data: Arc::new(vec![1]),
                text: "extracted".into(),
            }],
            ..CompletionRequest::default()
        };
        let messages = chat_messages(&request);
        let roles: Vec<Role> = messages.iter().map(|m| m.role).collect();
        assert_eq!(
            roles,
            [
                Role::System,
                Role::System,
                Role::User,
                Role::Assistant,
                Role::User
            ]
        );
        assert_eq!(messages[1].content, "Course context:\nOutline");
        assert_eq!(messages[2].content, "old");
        assert!(
            messages[4]
                .content
                .starts_with("Q extracted\n\nCitation sources:")
        );
        assert!(
            messages[4]
                .content
                .ends_with("[s1] activity | a | Lesson\nExcerpt: Body")
        );
    }
}
