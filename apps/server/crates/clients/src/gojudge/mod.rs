//! Typed go-judge client: compile once, run every test in the sandbox, a
//! circuit breaker in front of it.
//!
//! Wire shapes follow go-judge 1.13 (`infra/runner/Dockerfile`): `POST /run`
//! with one command per request answers when the program is done, a compile
//! step keeps its output in go-judge's file store (`copyOutCached`) for the
//! test runs to copy in, and `DELETE /file/{id}` frees it. The image's
//! commands live in [`languages`]. Verdicts keep Judge0's status ids (the
//! platform's stored and rendered verdict codes, see [`Outcome::status_id`]);
//! go-judge's own expected-output comparison is not used, the domain
//! compares outputs so match modes are ours. Fixtures in `tests/gojudge.rs`
//! pin the shapes.

pub mod languages;
mod wire;

use std::collections::HashMap;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use ab_core::{Error, Result};
use secrecy::{ExposeSecret, SecretString};

pub use languages::{Language, Runtime};
use wire::{CopyIn, WireResult};

/// Consecutive failures before the breaker opens.
const FAILURE_THRESHOLD: u32 = 5;
/// How long the breaker stays open before letting a probe through.
const RECOVERY_TIMEOUT: Duration = Duration::from_secs(30);
/// A slot freed with less budget than this left is not worth a sandbox run.
const MIN_RUN_BUDGET: Duration = Duration::from_millis(200);
/// What a compile step may spend (Kotlin's compiler needs ~5 s and 0.5 GB).
const COMPILE_CPU: Duration = Duration::from_secs(20);
const COMPILE_MEMORY_BYTES: u64 = 1024 * MIB;
const COMPILE_OUTPUT_BYTES: u64 = 64 * 1024;
/// The JVM's own metaspace, code cache and threads need room beside the heap.
const JVM_MIN_MEMORY_BYTES: u64 = 256 * MIB;
const STACK_BYTES: u64 = 64 * MIB;
const MIB: u64 = 1024 * 1024;

#[derive(Debug, Clone)]
pub struct GoJudgeConfig {
    /// Origin only, no trailing slash: `http://runner:5050`.
    pub base_url: String,
    /// Sent as `Authorization: Bearer` (go-judge `-auth-token`).
    pub auth_token: Option<SecretString>,
    /// Budget for one batch: waiting for a slot, compiling, running.
    pub max_wait: Duration,
    /// Sandbox programs in flight at once from this process (BUG-372) -
    /// size it to go-judge's `-parallelism`; the rest queue for a slot.
    pub max_concurrency: usize,
}

/// Resource limits of one test run.
#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub cpu_time: Duration,
    pub memory_bytes: u64,
    /// stdout (and stderr) a program may print; beyond is "Output Limit
    /// Exceeded".
    pub output_bytes: u64,
}

/// One program and the inputs to run it on.
#[derive(Debug, Clone)]
pub struct Batch<'a> {
    pub language_id: i32,
    pub source: &'a str,
    pub inputs: Vec<&'a str>,
    pub limits: Limits,
}

/// One input's outcome.
#[derive(Debug, Clone)]
pub struct Outcome {
    /// Judge0's status ids, kept as the platform's verdict codes: 3 Accepted,
    /// 4 Wrong Answer, 5 Time Limit Exceeded, 6 Compilation Error, 7-12
    /// Runtime Error (12 also memory limit and blocked system calls), 13
    /// Internal Error.
    pub status_id: i32,
    pub status_description: String,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub compile_output: Option<String>,
    pub message: Option<String>,
    /// CPU time.
    pub time_seconds: Option<f64>,
    /// Peak memory.
    pub memory_kb: Option<i32>,
}

/// Why a batch could not be executed.
#[derive(Debug, Clone)]
pub enum RunnerError {
    /// go-judge is down or the breaker is open - retry later. Counts
    /// against the breaker.
    Unavailable(String),
    /// go-judge refused the request (unknown language, bad limits, wrong
    /// token). Retrying the same request will not help.
    Rejected(String),
    /// No slot freed up, or the programs did not finish, within the budget:
    /// the runner is up but saturated. Retry later; never trips the breaker
    /// (BUG-372 - one burst must not take the runner away from everyone).
    Busy(String),
}

impl RunnerError {
    /// What a user may see. The variant's text (upstream URLs, transport
    /// errors, response bodies) is for the logs only (UX-291).
    #[must_use]
    pub const fn public_message(&self) -> &'static str {
        match self {
            Self::Unavailable(_) => "code runner unavailable",
            Self::Rejected(_) => "code runner rejected the submission",
            Self::Busy(_) => "code runner is busy; try again shortly",
        }
    }
}

impl std::fmt::Display for RunnerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unavailable(msg) => write!(f, "go-judge unavailable: {msg}"),
            Self::Rejected(msg) => write!(f, "go-judge rejected the request: {msg}"),
            Self::Busy(msg) => write!(f, "go-judge busy: {msg}"),
        }
    }
}

impl std::error::Error for RunnerError {}

type Outcomes = std::result::Result<Vec<Outcome>, RunnerError>;

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

pub struct GoJudgeClient {
    http: reqwest::Client,
    config: GoJudgeConfig,
    breaker: Mutex<Breaker>,
    slots: tokio::sync::Semaphore,
    /// UX-308: one batch per owner in the slot queue; an owner's next
    /// batch waits for their previous one, so a burst never queues ahead
    /// of everyone else. Entries live while someone holds or awaits them.
    turns: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
}

/// The program after its compile step: what each run copies in.
enum Built {
    Ready(HashMap<String, CopyIn>),
    /// Every input gets this outcome; nothing runs.
    Failed(Outcome),
}

impl GoJudgeClient {
    pub fn new(config: GoJudgeConfig) -> Result<Self> {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(3))
            .build()
            .map_err(|e| Error::internal("building go-judge http client", e))?;
        Ok(Self {
            http,
            slots: tokio::sync::Semaphore::new(config.max_concurrency.max(1)),
            config,
            breaker: Mutex::new(Breaker::default()),
            turns: Mutex::new(HashMap::new()),
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

    fn admit(&self) -> bool {
        self.breaker
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .admit()
    }

    fn record(&self, outcome: &Outcomes) {
        let mut breaker = self.breaker.lock().unwrap_or_else(PoisonError::into_inner);
        match outcome {
            Ok(_) | Err(RunnerError::Rejected(_)) => breaker.on_success(),
            Err(RunnerError::Unavailable(_)) => breaker.on_failure(),
            Err(RunnerError::Busy(_)) => {}
        }
    }

    /// Compile `batch.source` once and run it on every input; outcomes in
    /// input order. `owner` (the user) gets one batch in flight at a time
    /// (UX-308).
    pub async fn run_batch(&self, owner: &str, batch: &Batch<'_>) -> Outcomes {
        if batch.inputs.is_empty() {
            return Ok(Vec::new());
        }
        let Some(language) = languages::find(batch.language_id) else {
            return Err(RunnerError::Rejected(format!(
                "language {} is not in the runner image",
                batch.language_id
            )));
        };
        if !self.admit() {
            return Err(RunnerError::Unavailable(
                "circuit breaker open after repeated failures".into(),
            ));
        }
        let deadline = Instant::now() + self.config.max_wait;
        let turn = Arc::clone(
            self.turns
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .entry(owner.to_owned())
                .or_default(),
        );
        let outcome = self.run_in_turn(&turn, language, batch, deadline).await;
        drop(turn);
        let mut turns = self.turns.lock().unwrap_or_else(PoisonError::into_inner);
        if turns.get(owner).is_some_and(|t| Arc::strong_count(t) == 1) {
            turns.remove(owner);
        }
        outcome
    }

    async fn run_in_turn(
        &self,
        turn: &tokio::sync::Mutex<()>,
        language: &Language,
        batch: &Batch<'_>,
        deadline: Instant,
    ) -> Outcomes {
        let mine = tokio::time::timeout_at(deadline.into(), turn.lock()).await;
        let Some(_mine) = mine.ok().filter(|_| usable(deadline)) else {
            return Err(RunnerError::Busy(format!(
                "the previous run of the same user did not finish within {:?}",
                self.config.max_wait
            )));
        };
        let outcome = self.execute(language, batch, deadline).await;
        self.record(&outcome);
        outcome
    }

    async fn execute(&self, language: &Language, batch: &Batch<'_>, deadline: Instant) -> Outcomes {
        let copy_in = match self.build(language, batch.source, deadline).await? {
            Built::Ready(copy_in) => copy_in,
            Built::Failed(outcome) => return Ok(vec![outcome; batch.inputs.len()]),
        };
        let cached: Vec<&str> = copy_in.values().filter_map(CopyIn::file_id).collect();
        let runs = batch.inputs.iter().enumerate().map(|(index, input)| {
            let cmd = wire::run_cmd(language, &copy_in, input, batch.limits);
            self.call(format!("case-{index}"), cmd, deadline)
        });
        let results = futures::future::join_all(runs).await;
        // Free the compiled program; go-judge's `-file-timeout` sweeps what
        // a failed delete leaves behind.
        futures::future::join_all(cached.iter().map(|id| self.delete_file(id))).await;
        results
            .into_iter()
            .map(|result| result.map(|r| wire::run_outcome(&r)))
            .collect()
    }

    /// The compile (or syntax check) step.
    async fn build(
        &self,
        language: &Language,
        source: &str,
        deadline: Instant,
    ) -> std::result::Result<Built, RunnerError> {
        let cmd = wire::compile_cmd(language, source);
        let result = self.call("compile".into(), cmd, deadline).await?;
        if let Some(failed) = wire::compile_failure(&result) {
            futures::future::join_all(result.file_ids.values().map(|id| self.delete_file(id)))
                .await;
            return Ok(Built::Failed(failed));
        }
        if language.artifacts.is_empty() {
            return Ok(Built::Ready(HashMap::from([(
                language.source_file.to_owned(),
                CopyIn::content(source),
            )])));
        }
        let mut copy_in = HashMap::new();
        for artifact in language.artifacts {
            let Some(id) = result.file_ids.get(*artifact) else {
                return Err(RunnerError::Rejected(format!(
                    "compile step left no {artifact}"
                )));
            };
            copy_in.insert((*artifact).to_owned(), CopyIn::file(id));
        }
        Ok(Built::Ready(copy_in))
    }

    /// `POST /run` with one command, inside a slot and the batch's budget.
    async fn call(
        &self,
        request_id: String,
        cmd: wire::Cmd,
        deadline: Instant,
    ) -> std::result::Result<WireResult, RunnerError> {
        let slot = tokio::time::timeout_at(deadline.into(), self.slots.acquire()).await;
        let Some(Ok(_slot)) = slot.ok().filter(|_| usable(deadline)) else {
            return Err(RunnerError::Busy(format!(
                "no free slot within {:?}",
                self.config.max_wait
            )));
        };
        // UX-316: the breaker may have opened while this call waited - fail
        // fast instead of spending a refused connect on a dead go-judge.
        if self.is_degraded() {
            return Err(RunnerError::Unavailable(
                "circuit breaker open after repeated failures".into(),
            ));
        }
        let body = wire::Request {
            request_id,
            cmd: [cmd],
        };
        let request = self
            .auth(self.http.post(self.url("/run")))
            .timeout(deadline.saturating_duration_since(Instant::now()))
            .json(&body);
        let text = self.send(request, "run").await?;
        let mut results: Vec<WireResult> = serde_json::from_str(&text)
            .map_err(|e| RunnerError::Unavailable(format!("run response shape: {e}")))?;
        results
            .pop()
            .ok_or_else(|| RunnerError::Unavailable("run response without a result".into()))
    }

    async fn delete_file(&self, id: &str) {
        let request = self
            .auth(self.http.delete(self.url(&format!("/file/{id}"))))
            .timeout(Duration::from_secs(5));
        if let Err(err) = self.send(request, "delete file").await {
            tracing::debug!(%err, file_id = id, "freeing a compiled program failed");
        }
    }

    async fn send(
        &self,
        request: reqwest::RequestBuilder,
        what: &str,
    ) -> std::result::Result<String, RunnerError> {
        let response = request.send().await.map_err(|e| transport(what, &e))?;
        let status = response.status();
        let text = response.text().await.map_err(|e| transport(what, &e))?;
        if status.is_success() {
            Ok(text)
        } else {
            Err(classify(status, &text))
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.config.base_url)
    }

    fn auth(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.config.auth_token {
            Some(token) => req.bearer_auth(token.expose_secret()),
            None => req,
        }
    }
}

/// A turn or slot freed at the budget's edge leaves no time to run: sending
/// then only spends sandbox time on output nobody reads.
fn usable(deadline: Instant) -> bool {
    deadline.saturating_duration_since(Instant::now()) >= MIN_RUN_BUDGET
}

/// Our own budget running out is saturation; anything else on the way is an
/// outage.
fn transport(what: &str, err: &reqwest::Error) -> RunnerError {
    if err.is_timeout() {
        RunnerError::Busy(format!("{what}: no answer within the budget"))
    } else {
        RunnerError::Unavailable(format!("{what}: {err}"))
    }
}

/// 5xx / 429 mean "try later" (and trip the breaker); other 4xx mean our
/// request was wrong.
fn classify(status: reqwest::StatusCode, body: &str) -> RunnerError {
    let snippet: String = body.chars().take(300).collect();
    if status.is_server_error() || status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        RunnerError::Unavailable(format!("HTTP {status}: {snippet}"))
    } else {
        RunnerError::Rejected(format!("HTTP {status}: {snippet}"))
    }
}
