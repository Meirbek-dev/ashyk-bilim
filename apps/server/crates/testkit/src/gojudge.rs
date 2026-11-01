//! A fake go-judge on wiremock.
//!
//! "Executes" each test with a closure the test supplies, answers `POST /run`
//! in the go-judge 1.13 wire shape (a compile step whose artifacts go to the
//! file store, then one run per test), and can be switched off or slowed down
//! to simulate an outage or saturation.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use wiremock::matchers::{method, path, path_regex};
use wiremock::{Mock, MockServer, Request, Respond, ResponseTemplate};

/// What the fake sandbox says about one test (Judge0 status ids, as the
/// platform stores them).
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

    /// Fails the compile (or syntax check) step: no test runs.
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
    next_file: usize,
    /// File store: id → the source it was compiled from.
    files: HashMap<String, String>,
    compiles: usize,
    runs: usize,
    deleted: usize,
    down: bool,
    busy: bool,
}

#[derive(Clone)]
pub struct FakeJudge {
    state: Arc<Mutex<State>>,
    eval: Evaluator,
}

impl FakeJudge {
    /// Mount the fake on `server`. `eval(source, stdin)` decides each test;
    /// the compile step asks it with an empty stdin and fails only on a
    /// [`CaseVerdict::compile_error`].
    pub async fn mount(
        server: &MockServer,
        eval: impl Fn(&str, &str) -> CaseVerdict + Send + Sync + 'static,
    ) -> Self {
        let judge = Self {
            state: Arc::new(Mutex::new(State::default())),
            eval: Arc::new(eval),
        };
        Mock::given(method("POST"))
            .and(path("/run"))
            .respond_with(RunResponder(judge.clone()))
            .mount(server)
            .await;
        Mock::given(method("DELETE"))
            .and(path_regex("^/file/[^/]+$"))
            .respond_with(DeleteResponder(judge.clone()))
            .mount(server)
            .await;
        judge
    }

    /// Simulate an outage: every run answers 500.
    pub fn set_down(&self, down: bool) {
        self.state.lock().unwrap().down = down;
    }

    /// Simulate saturation: runs answer only after the client's budget, so
    /// it gives up as `Busy`.
    pub fn set_busy(&self, busy: bool) {
        self.state.lock().unwrap().busy = busy;
    }

    /// Compile steps received.
    #[must_use]
    pub fn compiles(&self) -> usize {
        self.state.lock().unwrap().compiles
    }

    /// Test runs received (one per test, compile steps not counted).
    #[must_use]
    pub fn submissions(&self) -> usize {
        self.state.lock().unwrap().runs
    }

    /// Compiled programs freed from the file store.
    #[must_use]
    pub fn deleted(&self) -> usize {
        self.state.lock().unwrap().deleted
    }
}

fn result(
    status: &str,
    exit: i32,
    stdout: Option<&str>,
    stderr: Option<&str>,
) -> serde_json::Value {
    serde_json::json!({
        "status": status,
        "exitStatus": exit,
        "time": 10_000_000,
        "memory": 1_048_576,
        "runTime": 12_000_000,
        "files": { "stdout": stdout.unwrap_or_default(), "stderr": stderr.unwrap_or_default() },
    })
}

struct RunResponder(FakeJudge);

impl Respond for RunResponder {
    fn respond(&self, request: &Request) -> ResponseTemplate {
        let body: serde_json::Value = serde_json::from_slice(&request.body).unwrap_or_default();
        let cmd = &body["cmd"][0];
        let mut state = self.0.state.lock().unwrap();
        if state.down {
            drop(state);
            return ResponseTemplate::new(500).set_body_string("go-judge is down");
        }
        let busy = state.busy;
        // The source: copied in as content, or as the compiled program.
        let source = cmd["copyIn"]
            .as_object()
            .and_then(|files| files.values().next())
            .map(|file| match file["fileId"].as_str() {
                Some(id) => state.files.get(id).cloned().unwrap_or_default(),
                None => file["content"].as_str().unwrap_or_default().to_owned(),
            })
            .unwrap_or_default();
        let answer = if body["requestId"] == "compile" {
            state.compiles += 1;
            let verdict = (self.0.eval)(&source, "");
            if verdict.status_id == 6 {
                result(
                    "Nonzero Exit Status",
                    1,
                    None,
                    verdict.compile_output.as_deref(),
                )
            } else {
                let mut ok = result("Accepted", 0, None, None);
                let mut ids = serde_json::Map::new();
                for artifact in cmd["copyOutCached"].as_array().into_iter().flatten() {
                    state.next_file += 1;
                    let id = format!("file-{}", state.next_file);
                    state.files.insert(id.clone(), source.clone());
                    ids.insert(artifact.as_str().unwrap_or_default().into(), id.into());
                }
                ok["fileIds"] = ids.into();
                ok
            }
        } else {
            state.runs += 1;
            let stdin = cmd["files"][0]["content"].as_str().unwrap_or_default();
            let verdict = (self.0.eval)(&source, stdin);
            let (status, exit) = match verdict.status_id {
                3 => ("Accepted", 0),
                5 => ("Time Limit Exceeded", 9),
                6..=12 => ("Nonzero Exit Status", 1),
                _ => ("Internal Error", 0),
            };
            result(
                status,
                exit,
                verdict.stdout.as_deref(),
                verdict.stderr.as_deref(),
            )
        };
        drop(state);
        let response = ResponseTemplate::new(200).set_body_json(serde_json::json!([answer]));
        if busy {
            response.set_delay(Duration::from_secs(30))
        } else {
            response
        }
    }
}

struct DeleteResponder(FakeJudge);

impl Respond for DeleteResponder {
    fn respond(&self, request: &Request) -> ResponseTemplate {
        let id = request.url.path().trim_start_matches("/file/");
        let freed = {
            let mut state = self.0.state.lock().unwrap();
            let freed = state.files.remove(id).is_some();
            state.deleted += usize::from(freed);
            freed
        };
        if freed {
            ResponseTemplate::new(200).set_body_json("")
        } else {
            ResponseTemplate::new(404).set_body_json("file not found")
        }
    }
}
