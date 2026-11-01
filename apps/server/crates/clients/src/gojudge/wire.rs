//! go-judge 1.13 REST shapes (`cmd/go-judge/model`) and their translation to
//! [`Outcome`]s.

use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::languages::{HEAP, Language, Runtime};
use super::{
    COMPILE_CPU, COMPILE_MEMORY_BYTES, COMPILE_OUTPUT_BYTES, JVM_MIN_MEMORY_BYTES, Limits, MIB,
    Outcome, STACK_BYTES,
};

/// Every program's environment; a language adds its own.
const BASE_ENV: &[&str] = &[
    "PATH=/usr/local/bin:/usr/bin:/bin",
    "HOME=/w",
    "TMPDIR=/tmp",
    "LANG=C.UTF-8",
];
/// The wall clock a run may take beyond its CPU limit (start-up, I/O).
const CLOCK_SLACK: Duration = Duration::from_secs(2);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    /// Not used by go-judge's REST answer; names the step in its logs (and
    /// in the test fake).
    pub request_id: String,
    pub cmd: [Cmd; 1],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cmd {
    args: Vec<String>,
    env: Vec<String>,
    /// stdin, stdout, stderr.
    files: [File; 3],
    cpu_limit: u64,
    clock_limit: u64,
    memory_limit: u64,
    stack_limit: u64,
    proc_limit: u64,
    copy_in: HashMap<String, CopyIn>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    copy_out_cached: Vec<String>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum File {
    Content { content: String },
    Collector { name: &'static str, max: u64 },
}

/// A file put into the sandbox before the program starts.
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum CopyIn {
    Content {
        content: String,
    },
    Cached {
        #[serde(rename = "fileId")]
        file_id: String,
    },
}

impl CopyIn {
    pub fn content(text: &str) -> Self {
        Self::Content {
            content: text.to_owned(),
        }
    }

    pub fn file(id: &str) -> Self {
        Self::Cached {
            file_id: id.to_owned(),
        }
    }

    pub fn file_id(&self) -> Option<&str> {
        match self {
            Self::Cached { file_id } => Some(file_id),
            Self::Content { .. } => None,
        }
    }
}

/// One command's result.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireResult {
    pub status: String,
    #[serde(default)]
    pub exit_status: i32,
    #[serde(default)]
    pub error: Option<String>,
    /// CPU time, ns.
    #[serde(default)]
    pub time: u64,
    /// Peak memory, bytes.
    #[serde(default)]
    pub memory: u64,
    #[serde(default)]
    pub files: HashMap<String, String>,
    #[serde(default)]
    pub file_ids: HashMap<String, String>,
}

fn env(language: &Language) -> Vec<String> {
    BASE_ENV
        .iter()
        .chain(language.env)
        .map(|v| (*v).to_owned())
        .collect()
}

fn nanos(duration: Duration) -> u64 {
    u64::try_from(duration.as_nanos()).unwrap_or(u64::MAX)
}

const fn proc_limit(runtime: Runtime) -> u64 {
    match runtime {
        Runtime::Native => 32,
        Runtime::Jvm | Runtime::Threaded => 128,
    }
}

pub fn compile_cmd(language: &Language, source: &str) -> Cmd {
    Cmd {
        args: language.compile.iter().map(|a| (*a).to_owned()).collect(),
        env: env(language),
        files: [
            File::Content {
                content: String::new(),
            },
            File::Collector {
                name: "stdout",
                max: COMPILE_OUTPUT_BYTES,
            },
            File::Collector {
                name: "stderr",
                max: COMPILE_OUTPUT_BYTES,
            },
        ],
        cpu_limit: nanos(COMPILE_CPU),
        clock_limit: nanos(COMPILE_CPU),
        memory_limit: COMPILE_MEMORY_BYTES,
        stack_limit: STACK_BYTES,
        proc_limit: proc_limit(Runtime::Threaded),
        copy_in: HashMap::from([(language.source_file.to_owned(), CopyIn::content(source))]),
        copy_out_cached: language.artifacts.iter().map(|a| (*a).to_owned()).collect(),
    }
}

pub fn run_cmd(
    language: &Language,
    copy_in: &HashMap<String, CopyIn>,
    stdin: &str,
    limits: Limits,
) -> Cmd {
    let memory = if language.runtime == Runtime::Jvm {
        limits.memory_bytes.max(JVM_MIN_MEMORY_BYTES)
    } else {
        limits.memory_bytes
    };
    // Three quarters for the heap: the sandbox hides the cgroup limit from
    // the JVM, which would otherwise size its heap from the host's memory.
    let heap = format!("-Xmx{}m", (memory / MIB * 3 / 4).max(16));
    Cmd {
        args: language
            .run
            .iter()
            .map(|a| {
                if *a == HEAP {
                    heap.clone()
                } else {
                    (*a).to_owned()
                }
            })
            .collect(),
        env: env(language),
        files: [
            File::Content {
                content: stdin.to_owned(),
            },
            File::Collector {
                name: "stdout",
                max: limits.output_bytes,
            },
            File::Collector {
                name: "stderr",
                max: limits.output_bytes,
            },
        ],
        cpu_limit: nanos(limits.cpu_time),
        clock_limit: nanos(limits.cpu_time + CLOCK_SLACK),
        memory_limit: memory,
        stack_limit: STACK_BYTES.min(memory),
        proc_limit: proc_limit(language.runtime),
        copy_in: copy_in.clone(),
        copy_out_cached: Vec::new(),
    }
}

/// `None` when the compile step passed. A broken sandbox is an internal
/// error for every test; anything else the compiler did is the learner's
/// compile error, with what it printed.
pub fn compile_failure(result: &WireResult) -> Option<Outcome> {
    if result.status == "Accepted" {
        return None;
    }
    if matches!(result.status.as_str(), "Internal Error" | "File Error") {
        return Some(internal(result));
    }
    let printed: String = ["stdout", "stderr"]
        .iter()
        .filter_map(|name| result.files.get(*name))
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join("\n");
    let message = match result.status.as_str() {
        "Time Limit Exceeded" => Some("compilation time limit exceeded".to_owned()),
        "Memory Limit Exceeded" => Some("compilation memory limit exceeded".to_owned()),
        "Output Limit Exceeded" => Some("compiler output limit exceeded".to_owned()),
        _ => None,
    };
    Some(Outcome {
        status_id: 6,
        status_description: "Compilation Error".into(),
        stdout: None,
        stderr: None,
        compile_output: Some(storable(printed.trim_matches('\n'))),
        message,
        time_seconds: Some(seconds(result.time)),
        memory_kb: Some(kib(result.memory)),
    })
}

pub fn run_outcome(result: &WireResult) -> Outcome {
    let (status_id, description, message) = match result.status.as_str() {
        "Accepted" => (3, "Accepted".to_owned(), None),
        "Time Limit Exceeded" => (5, "Time Limit Exceeded".to_owned(), None),
        "Memory Limit Exceeded" => (12, "Memory Limit Exceeded".to_owned(), None),
        "Output Limit Exceeded" => (8, "Output Limit Exceeded".to_owned(), None),
        "Nonzero Exit Status" => (
            11,
            "Runtime Error (NZEC)".to_owned(),
            Some(format!("Exited with error status {}", result.exit_status)),
        ),
        "Signalled" => {
            let (id, name) = signal(result.exit_status);
            (
                id,
                format!("Runtime Error ({name})"),
                Some(format!("Killed by signal {}", result.exit_status)),
            )
        }
        "Dangerous Syscall" => (
            12,
            "Runtime Error (Other)".to_owned(),
            Some("a forbidden system call".to_owned()),
        ),
        _ => return internal(result),
    };
    Outcome {
        status_id,
        status_description: description,
        stdout: result.files.get("stdout").map(|s| storable(s)),
        stderr: result.files.get("stderr").map(|s| storable(s)),
        compile_output: None,
        message,
        time_seconds: Some(seconds(result.time)),
        memory_kb: Some(kib(result.memory)),
    }
}

/// Judge0's runtime-error ids by signal.
const fn signal(number: i32) -> (i32, &'static str) {
    match number {
        11 => (7, "SIGSEGV"),
        25 => (8, "SIGXFSZ"),
        8 => (9, "SIGFPE"),
        6 => (10, "SIGABRT"),
        _ => (12, "Other"),
    }
}

fn internal(result: &WireResult) -> Outcome {
    let detail = result
        .error
        .as_deref()
        .filter(|e| !e.is_empty())
        .unwrap_or(&result.status);
    Outcome {
        status_id: 13,
        status_description: "Internal Error".into(),
        stdout: None,
        stderr: None,
        compile_output: None,
        message: Some(storable(detail)),
        time_seconds: None,
        memory_kb: None,
    }
}

/// BUG-369: program output enters the platform here, so it is made storable:
/// NUL (which Postgres `text` rejects) becomes U+FFFD; go-judge already
/// replaced invalid UTF-8. A NUL never matches expected output anyway.
fn storable(text: &str) -> String {
    text.replace('\0', "\u{FFFD}")
}

#[allow(clippy::cast_precision_loss)] // ns of one run fit an f64 exactly
fn seconds(nanos: u64) -> f64 {
    nanos as f64 / 1e9
}

fn kib(bytes: u64) -> i32 {
    i32::try_from(bytes / 1024).unwrap_or(i32::MAX)
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    fn result(status: &str, exit: i32) -> WireResult {
        WireResult {
            status: status.into(),
            exit_status: exit,
            error: None,
            time: 12_000_000,
            memory: 3 * 1024 * 1024,
            files: HashMap::from([
                ("stdout".to_owned(), "4\0\n".to_owned()),
                ("stderr".to_owned(), String::new()),
            ]),
            file_ids: HashMap::new(),
        }
    }

    #[test]
    fn statuses_keep_judge0_ids() {
        let cases = [
            ("Accepted", 0, 3),
            ("Time Limit Exceeded", 9, 5),
            ("Memory Limit Exceeded", 9, 12),
            ("Output Limit Exceeded", 0, 8),
            ("Nonzero Exit Status", 1, 11),
            ("Signalled", 11, 7),
            ("Signalled", 8, 9),
            ("Signalled", 6, 10),
            ("Signalled", 31, 12),
            ("Dangerous Syscall", 31, 12),
            ("Internal Error", 0, 13),
            ("File Error", 0, 13),
        ];
        for (status, exit, id) in cases {
            assert_eq!(run_outcome(&result(status, exit)).status_id, id, "{status}");
        }
        let nzec = run_outcome(&result("Nonzero Exit Status", 3));
        assert_eq!(nzec.message.as_deref(), Some("Exited with error status 3"));
        let ok = run_outcome(&result("Accepted", 0));
        assert_eq!(ok.stdout.as_deref(), Some("4\u{FFFD}\n"));
        assert_eq!(ok.time_seconds, Some(0.012));
        assert_eq!(ok.memory_kb, Some(3072));
    }

    #[test]
    fn a_failed_compile_is_the_learners_compile_error_unless_the_sandbox_broke() {
        assert!(compile_failure(&result("Accepted", 0)).is_none());
        let mut broken = result("Nonzero Exit Status", 1);
        broken.files.insert("stdout".into(), String::new());
        broken
            .files
            .insert("stderr".into(), "main.c:1: error\n".into());
        let failed = compile_failure(&broken).unwrap();
        assert_eq!(failed.status_id, 6);
        assert_eq!(failed.compile_output.as_deref(), Some("main.c:1: error"));
        let slow = compile_failure(&result("Time Limit Exceeded", 9)).unwrap();
        assert_eq!(slow.status_id, 6);
        assert_eq!(
            slow.message.as_deref(),
            Some("compilation time limit exceeded")
        );
        let mut sandbox = result("Internal Error", 0);
        sandbox.error = Some("execve: no such file".into());
        let internal = compile_failure(&sandbox).unwrap();
        assert_eq!(internal.status_id, 13);
        assert_eq!(internal.message.as_deref(), Some("execve: no such file"));
    }

    #[test]
    fn a_jvm_run_gets_its_memory_floor_and_a_heap_flag() {
        let java = super::super::languages::find(62).unwrap();
        let limits = Limits {
            cpu_time: Duration::from_secs(2),
            memory_bytes: 64 * MIB,
            output_bytes: 1024,
        };
        let cmd = run_cmd(java, &HashMap::new(), "5", limits);
        assert_eq!(cmd.memory_limit, 256 * MIB);
        assert!(cmd.args.contains(&"-Xmx192m".to_owned()), "{:?}", cmd.args);
        assert_eq!(cmd.clock_limit, 4_000_000_000);
        let python = super::super::languages::find(71).unwrap();
        let cmd = run_cmd(python, &HashMap::new(), "5", limits);
        assert_eq!(cmd.memory_limit, 64 * MIB);
        assert_eq!(cmd.proc_limit, 32);
    }
}
