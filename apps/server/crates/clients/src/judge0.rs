//! Typed Judge0 CE client: batch submit + poll, base64 payloads, a circuit
//! breaker in front of the sandbox.
//!
//! Wire shapes follow Judge0 CE 1.13.1 (the image pinned in compose) as the
//! legacy's official Python SDK used them: `POST /submissions/batch` with
//! `base64_encoded=true`, then `GET /submissions/batch?tokens=…` until every
//! status id is past "Processing". Judge0's own `expected_output` comparison
//! is not used — the domain compares outputs itself so match modes are ours.
//! Fixtures in `tests/judge0.rs` pin the shapes.

use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use ab_core::{Error, Result};
use base64::Engine;
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;

/// Judge0 CE default `MAX_SUBMISSION_BATCH_SIZE`.
const MAX_BATCH: usize = 20;
/// Consecutive failures before the breaker opens.
const FAILURE_THRESHOLD: u32 = 5;
/// How long the breaker stays open before letting a probe through.
const RECOVERY_TIMEOUT: Duration = Duration::from_secs(30);
const RESPONSE_FIELDS: &str = "token,status,stdout,stderr,compile_output,message,time,memory";

#[derive(Debug, Clone)]
pub struct Judge0Config {
    /// Origin only, no trailing slash: `http://judge0-server:2358`.
    pub base_url: String,
    /// Sent as `X-Auth-Token` when set.
    pub api_key: Option<SecretString>,
    pub request_timeout: Duration,
    pub poll_interval: Duration,
    pub poll_max_wait: Duration,
}

/// One sandbox execution. Sizes are KB (Judge0's unit), times seconds.
#[derive(Debug, Clone, Default)]
pub struct SubmissionSpec {
    pub source_code: String,
    pub language_id: i32,
    pub stdin: String,
    pub cpu_time_limit: Option<f64>,
    pub wall_time_limit: Option<f64>,
    pub memory_limit_kb: Option<i32>,
    pub stack_limit_kb: Option<i32>,
    pub max_processes_and_or_threads: Option<i32>,
    pub compiler_options: Option<String>,
    pub max_file_size_kb: Option<i32>,
}

/// A finished submission, text fields already base64-decoded.
#[derive(Debug, Clone)]
pub struct SubmissionResult {
    pub token: String,
    /// Judge0 status id: 3 Accepted, 4 Wrong Answer, 5 TLE, 6 Compilation
    /// Error, 7–12 Runtime Error, 13 Internal Error, 14 Exec Format Error.
    pub status_id: i32,
    pub status_description: String,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub compile_output: Option<String>,
    pub message: Option<String>,
    pub time_seconds: Option<f64>,
    pub memory_kb: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Language {
    pub id: i32,
    pub name: String,
    #[serde(default)]
    pub is_archived: bool,
}

/// Why a run could not be executed.
#[derive(Debug, Clone)]
pub enum Judge0Error {
    /// Judge0 is down, slow, or the breaker is open — retry later. Counts
    /// against the breaker.
    Unavailable(String),
    /// Judge0 refused the payload (unknown language, bad limits). The
    /// service is healthy; retrying the same request will not help.
    Rejected(String),
}

impl std::fmt::Display for Judge0Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unavailable(msg) => write!(f, "judge0 unavailable: {msg}"),
            Self::Rejected(msg) => write!(f, "judge0 rejected the submission: {msg}"),
        }
    }
}

impl std::error::Error for Judge0Error {}

/// Closed → (N failures) → Open → (timeout) → probe; one more failure
/// while probing re-opens, a success closes.
#[derive(Debug, Default)]
struct Breaker {
    failures: u32,
    opened_at: Option<Instant>,
    probing: bool,
}

impl Breaker {
    fn admit(&mut self) -> bool {
        match self.opened_at {
            Some(at) if at.elapsed() < RECOVERY_TIMEOUT => false,
            Some(_) => {
                self.opened_at = None;
                self.probing = true;
                true
            }
            None => true,
        }
    }

    const fn on_success(&mut self) {
        self.failures = 0;
        self.probing = false;
        self.opened_at = None;
    }

    fn on_failure(&mut self) {
        self.failures += 1;
        if self.probing || self.failures >= FAILURE_THRESHOLD {
            self.opened_at = Some(Instant::now());
            self.probing = false;
        }
    }

    fn is_open(&self) -> bool {
        self.opened_at
            .is_some_and(|at| at.elapsed() < RECOVERY_TIMEOUT)
    }
}

pub struct Judge0Client {
    http: reqwest::Client,
    config: Judge0Config,
    breaker: Mutex<Breaker>,
}

#[derive(Deserialize)]
struct BatchEnvelope {
    #[serde(default)]
    submissions: Vec<RawSubmission>,
}

#[derive(Deserialize)]
struct RawSubmission {
    token: Option<String>,
    status: Option<RawStatus>,
    stdout: Option<String>,
    stderr: Option<String>,
    compile_output: Option<String>,
    message: Option<String>,
    /// Judge0 serialises `time` as a decimal string.
    time: Option<serde_json::Value>,
    memory: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct RawStatus {
    id: i32,
    #[serde(default)]
    description: String,
}

impl Judge0Client {
    pub fn new(config: Judge0Config) -> Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(config.request_timeout)
            .build()
            .map_err(|e| Error::internal("building judge0 http client", e))?;
        Ok(Self {
            http,
            config,
            breaker: Mutex::new(Breaker::default()),
        })
    }

    /// Whether the breaker is currently refusing calls (health reporting).
    #[must_use]
    pub fn is_degraded(&self) -> bool {
        self.breaker
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .is_open()
    }

    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.config.base_url)
    }

    fn auth(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.config.api_key {
            Some(key) => req.header("X-Auth-Token", key.expose_secret()),
            None => req,
        }
    }

    fn admit(&self) -> bool {
        self.breaker
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .admit()
    }

    fn record(&self, outcome: &std::result::Result<(), Judge0Error>) {
        let mut breaker = self.breaker.lock().unwrap_or_else(PoisonError::into_inner);
        match outcome {
            Ok(()) | Err(Judge0Error::Rejected(_)) => breaker.on_success(),
            Err(Judge0Error::Unavailable(_)) => breaker.on_failure(),
        }
    }

    /// Execute every spec and wait for all results (same order as `specs`).
    pub async fn run_batch(
        &self,
        specs: &[SubmissionSpec],
    ) -> std::result::Result<Vec<SubmissionResult>, Judge0Error> {
        if specs.is_empty() {
            return Ok(Vec::new());
        }
        if !self.admit() {
            return Err(Judge0Error::Unavailable(
                "circuit breaker open after repeated failures".into(),
            ));
        }
        let outcome = self.run_batch_inner(specs).await;
        self.record(&outcome.as_ref().map(|_| ()).map_err(Clone::clone));
        outcome
    }

    async fn run_batch_inner(
        &self,
        specs: &[SubmissionSpec],
    ) -> std::result::Result<Vec<SubmissionResult>, Judge0Error> {
        let mut tokens = Vec::with_capacity(specs.len());
        for chunk in specs.chunks(MAX_BATCH) {
            tokens.extend(self.create_batch(chunk).await?);
        }
        let deadline = Instant::now() + self.config.poll_max_wait;
        let mut results: Vec<Option<SubmissionResult>> = vec![None; tokens.len()];
        loop {
            let pending: Vec<(usize, &str)> = results
                .iter()
                .enumerate()
                .filter(|(_, r)| r.is_none())
                .map(|(i, _)| (i, tokens[i].as_str()))
                .collect();
            if pending.is_empty() {
                break;
            }
            for chunk in pending.chunks(MAX_BATCH) {
                let fetched = self
                    .fetch_batch(&chunk.iter().map(|(_, t)| *t).collect::<Vec<_>>())
                    .await?;
                for raw in fetched {
                    let Some(token) = raw.token.clone() else {
                        continue;
                    };
                    let Some(status) = &raw.status else { continue };
                    if status.id <= 2 {
                        continue;
                    }
                    if let Some(index) = tokens.iter().position(|t| *t == token) {
                        results[index] = Some(decode(raw));
                    }
                }
            }
            if results.iter().all(Option::is_some) {
                break;
            }
            if Instant::now() >= deadline {
                return Err(Judge0Error::Unavailable(format!(
                    "timed out after {:?} waiting for {} submission(s)",
                    self.config.poll_max_wait,
                    results.iter().filter(|r| r.is_none()).count()
                )));
            }
            tokio::time::sleep(self.config.poll_interval).await;
        }
        Ok(results.into_iter().flatten().collect())
    }

    /// `POST /submissions/batch?base64_encoded=true` → tokens in order.
    async fn create_batch(
        &self,
        specs: &[SubmissionSpec],
    ) -> std::result::Result<Vec<String>, Judge0Error> {
        let body = serde_json::json!({
            "submissions": specs.iter().map(encode_spec).collect::<Vec<_>>(),
        });
        let response = self
            .auth(
                self.http
                    .post(self.url("/submissions/batch?base64_encoded=true")),
            )
            .json(&body)
            .send()
            .await
            .map_err(|e| Judge0Error::Unavailable(format!("create submissions: {e}")))?;
        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| Judge0Error::Unavailable(format!("create submissions body: {e}")))?;
        if !status.is_success() {
            return Err(classify(status, &text));
        }
        let entries: Vec<serde_json::Value> = serde_json::from_str(&text)
            .map_err(|e| Judge0Error::Unavailable(format!("create submissions shape: {e}")))?;
        entries
            .into_iter()
            .map(|entry| {
                entry
                    .get("token")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned)
                    .ok_or_else(|| Judge0Error::Rejected(entry.to_string()))
            })
            .collect()
    }

    /// `GET /submissions/batch?tokens=…&base64_encoded=true&fields=…`.
    async fn fetch_batch(
        &self,
        tokens: &[&str],
    ) -> std::result::Result<Vec<RawSubmission>, Judge0Error> {
        // Tokens are Judge0 UUIDs, so the query needs no escaping.
        let url = self.url(&format!(
            "/submissions/batch?tokens={}&base64_encoded=true&fields={RESPONSE_FIELDS}",
            tokens.join(",")
        ));
        let response = self
            .auth(self.http.get(url))
            .send()
            .await
            .map_err(|e| Judge0Error::Unavailable(format!("get submissions: {e}")))?;
        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| Judge0Error::Unavailable(format!("get submissions body: {e}")))?;
        if !status.is_success() {
            return Err(classify(status, &text));
        }
        let envelope: BatchEnvelope = serde_json::from_str(&text)
            .map_err(|e| Judge0Error::Unavailable(format!("get submissions shape: {e}")))?;
        Ok(envelope.submissions)
    }

    /// `GET /languages` — the active (non-archived) languages.
    pub async fn languages(&self) -> std::result::Result<Vec<Language>, Judge0Error> {
        if !self.admit() {
            return Err(Judge0Error::Unavailable(
                "circuit breaker open after repeated failures".into(),
            ));
        }
        let outcome = self.languages_inner().await;
        self.record(&outcome.as_ref().map(|_| ()).map_err(Clone::clone));
        outcome
    }

    async fn languages_inner(&self) -> std::result::Result<Vec<Language>, Judge0Error> {
        let response = self
            .auth(self.http.get(self.url("/languages")))
            .send()
            .await
            .map_err(|e| Judge0Error::Unavailable(format!("list languages: {e}")))?;
        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| Judge0Error::Unavailable(format!("list languages body: {e}")))?;
        if !status.is_success() {
            return Err(classify(status, &text));
        }
        serde_json::from_str(&text)
            .map_err(|e| Judge0Error::Unavailable(format!("list languages shape: {e}")))
    }
}

/// 5xx / 429 mean "try later" (and trip the breaker); other 4xx mean our
/// request was wrong.
fn classify(status: reqwest::StatusCode, body: &str) -> Judge0Error {
    let snippet: String = body.chars().take(300).collect();
    if status.is_server_error() || status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        Judge0Error::Unavailable(format!("HTTP {status}: {snippet}"))
    } else {
        Judge0Error::Rejected(format!("HTTP {status}: {snippet}"))
    }
}

fn encode_spec(spec: &SubmissionSpec) -> serde_json::Value {
    let b64 = base64::engine::general_purpose::STANDARD;
    let mut body = serde_json::Map::new();
    body.insert("source_code".into(), b64.encode(&spec.source_code).into());
    body.insert("language_id".into(), spec.language_id.into());
    body.insert("stdin".into(), b64.encode(&spec.stdin).into());
    body.insert("enable_network".into(), false.into());
    body.insert(
        "enable_per_process_and_thread_time_limit".into(),
        true.into(),
    );
    body.insert(
        "enable_per_process_and_thread_memory_limit".into(),
        true.into(),
    );
    if let Some(v) = spec.cpu_time_limit {
        body.insert("cpu_time_limit".into(), v.into());
    }
    if let Some(v) = spec.wall_time_limit {
        body.insert("wall_time_limit".into(), v.into());
    }
    if let Some(v) = spec.memory_limit_kb {
        body.insert("memory_limit".into(), v.into());
    }
    if let Some(v) = spec.stack_limit_kb {
        body.insert("stack_limit".into(), v.into());
    }
    if let Some(v) = spec.max_processes_and_or_threads {
        body.insert("max_processes_and_or_threads".into(), v.into());
    }
    if let Some(v) = &spec.compiler_options {
        body.insert("compiler_options".into(), v.clone().into());
    }
    if let Some(v) = spec.max_file_size_kb {
        body.insert("max_file_size".into(), v.into());
    }
    serde_json::Value::Object(body)
}

/// Judge0 base64-encodes with line feeds every 60 chars (Ruby `encode64`);
/// strip whitespace before decoding. Undecodable text is passed through.
fn decode_text(value: Option<String>) -> Option<String> {
    let raw = value?;
    let compact: String = raw.chars().filter(|c| !c.is_whitespace()).collect();
    match base64::engine::general_purpose::STANDARD.decode(compact) {
        Ok(bytes) => Some(String::from_utf8_lossy(&bytes).into_owned()),
        Err(_) => Some(raw),
    }
}

fn decode(raw: RawSubmission) -> SubmissionResult {
    let (status_id, status_description) = raw.status.map_or_else(
        || (13, "Internal Error".to_owned()),
        |s| (s.id, s.description),
    );
    let time_seconds = raw.time.and_then(|t| match t {
        serde_json::Value::String(s) => s.parse::<f64>().ok(),
        other => other.as_f64(),
    });
    let memory_kb = raw.memory.and_then(|m| match m {
        serde_json::Value::String(s) => s.parse::<i32>().ok(),
        other => other.as_i64().and_then(|v| i32::try_from(v).ok()),
    });
    SubmissionResult {
        token: raw.token.unwrap_or_default(),
        status_id,
        status_description,
        stdout: decode_text(raw.stdout),
        stderr: decode_text(raw.stderr),
        compile_output: decode_text(raw.compile_output),
        message: decode_text(raw.message),
        time_seconds,
        memory_kb,
    }
}
