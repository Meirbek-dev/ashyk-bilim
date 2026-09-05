//! A fake Judge0 on wiremock.
//!
//! "Executes" each submission with a closure the test supplies, answers the
//! batch-create / batch-fetch endpoints in the CE 1.13 wire shape (base64,
//! tokens), and can be switched off to simulate an outage.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use base64::Engine;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, Request, Respond, ResponseTemplate};

/// What the fake sandbox says about one submission.
#[derive(Debug, Clone)]
pub struct CaseVerdict {
    pub status_id: i32,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub compile_output: Option<String>,
}

impl CaseVerdict {
    #[must_use]
    pub fn accepted(stdout: impl Into<String>) -> Self {
        Self {
            status_id: 3,
            stdout: Some(stdout.into()),
            stderr: None,
            compile_output: None,
        }
    }

    #[must_use]
    pub fn compile_error(output: impl Into<String>) -> Self {
        Self {
            status_id: 6,
            stdout: None,
            stderr: None,
            compile_output: Some(output.into()),
        }
    }

    #[must_use]
    pub fn runtime_error(stderr: impl Into<String>) -> Self {
        Self {
            status_id: 11,
            stdout: None,
            stderr: Some(stderr.into()),
            compile_output: None,
        }
    }

    #[must_use]
    pub const fn time_limit() -> Self {
        Self {
            status_id: 5,
            stdout: None,
            stderr: None,
            compile_output: None,
        }
    }
}

type Evaluator = Arc<dyn Fn(&str, &str) -> CaseVerdict + Send + Sync>;

#[derive(Default)]
struct State {
    next_token: usize,
    results: HashMap<String, serde_json::Value>,
    batches: usize,
    submissions: usize,
    down: bool,
}

#[derive(Clone)]
pub struct FakeJudge {
    state: Arc<Mutex<State>>,
    eval: Evaluator,
}

impl FakeJudge {
    /// Mount the fake on `server`. `eval(source, stdin)` decides each case.
    /// `GET /languages` lists Python 71, Java 62 and an unlisted 999.
    pub async fn mount(
        server: &MockServer,
        eval: impl Fn(&str, &str) -> CaseVerdict + Send + Sync + 'static,
    ) -> Self {
        let judge = Self {
            state: Arc::new(Mutex::new(State::default())),
            eval: Arc::new(eval),
        };
        Mock::given(method("POST"))
            .and(path("/submissions/batch"))
            .respond_with(CreateResponder(judge.clone()))
            .mount(server)
            .await;
        Mock::given(method("GET"))
            .and(path("/submissions/batch"))
            .respond_with(FetchResponder(judge.clone()))
            .mount(server)
            .await;
        Mock::given(method("GET"))
            .and(path("/languages"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([
                { "id": 71, "name": "Python (3.8.1)" },
                { "id": 62, "name": "Java (OpenJDK 13.0.1)" },
                { "id": 999, "name": "Brainfuck (unsafe)" }
            ])))
            .mount(server)
            .await;
        judge
    }

    /// Simulate an outage: every create answers 503.
    pub fn set_down(&self, down: bool) {
        self.state.lock().unwrap().down = down;
    }

    /// Batch-create calls received.
    #[must_use]
    pub fn batches(&self) -> usize {
        self.state.lock().unwrap().batches
    }

    /// Individual submissions received across all batches.
    #[must_use]
    pub fn submissions(&self) -> usize {
        self.state.lock().unwrap().submissions
    }
}

fn decode(value: Option<&str>) -> String {
    let compact: String = value
        .unwrap_or_default()
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    base64::engine::general_purpose::STANDARD
        .decode(compact)
        .map(|b| String::from_utf8_lossy(&b).into_owned())
        .unwrap_or_default()
}

fn encode(value: Option<&str>) -> serde_json::Value {
    value.map_or(serde_json::Value::Null, |v| {
        base64::engine::general_purpose::STANDARD.encode(v).into()
    })
}

const fn description(status_id: i32) -> &'static str {
    match status_id {
        1 => "In Queue",
        2 => "Processing",
        3 => "Accepted",
        4 => "Wrong Answer",
        5 => "Time Limit Exceeded",
        6 => "Compilation Error",
        7..=12 => "Runtime Error (NZEC)",
        _ => "Internal Error",
    }
}

struct CreateResponder(FakeJudge);

impl Respond for CreateResponder {
    fn respond(&self, request: &Request) -> ResponseTemplate {
        let body: serde_json::Value = serde_json::from_slice(&request.body).unwrap_or_default();
        let submissions = body["submissions"].as_array().cloned().unwrap_or_default();
        let mut state = self.0.state.lock().unwrap();
        if state.down {
            drop(state);
            return ResponseTemplate::new(503).set_body_string("judge0 is down");
        }
        state.batches += 1;
        let mut tokens = Vec::with_capacity(submissions.len());
        for sub in submissions {
            let source = decode(sub["source_code"].as_str());
            let stdin = decode(sub["stdin"].as_str());
            let verdict = (self.0.eval)(&source, &stdin);
            state.next_token += 1;
            state.submissions += 1;
            let token = format!("tok-{}", state.next_token);
            state.results.insert(
                token.clone(),
                serde_json::json!({
                    "token": token,
                    "status": { "id": verdict.status_id, "description": description(verdict.status_id) },
                    "stdout": encode(verdict.stdout.as_deref()),
                    "stderr": encode(verdict.stderr.as_deref()),
                    "compile_output": encode(verdict.compile_output.as_deref()),
                    "message": null,
                    "time": "0.010",
                    "memory": 1024,
                }),
            );
            tokens.push(serde_json::json!({ "token": token }));
        }
        drop(state);
        ResponseTemplate::new(201).set_body_json(serde_json::Value::Array(tokens))
    }
}

struct FetchResponder(FakeJudge);

impl Respond for FetchResponder {
    fn respond(&self, request: &Request) -> ResponseTemplate {
        let state = self.0.state.lock().unwrap();
        let tokens = request
            .url
            .query_pairs()
            .find(|(k, _)| k == "tokens")
            .map(|(_, v)| v.into_owned())
            .unwrap_or_default();
        let submissions: Vec<serde_json::Value> = tokens
            .split(',')
            .filter_map(|t| state.results.get(t).cloned())
            .collect();
        drop(state);
        ResponseTemplate::new(200).set_body_json(serde_json::json!({ "submissions": submissions }))
    }
}
