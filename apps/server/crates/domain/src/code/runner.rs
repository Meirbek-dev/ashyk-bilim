//! Executing one item's tests on Judge0 and recording the run — shared by
//! the learner-facing [`super::CodeRunsService`] and the submit pipeline.
//!
//! Compared to the legacy: hidden-test data is stored in full and masked
//! on the way out (the legacy nulled it in the DB too, so teachers could
//! not see what a learner's code printed); a run that Judge0 rejected is
//! `internal_error` rather than `degraded`, because retrying it is useless.

use std::sync::Arc;

use ab_clients::judge0::{Judge0Client, Judge0Error, SubmissionResult, SubmissionSpec};
use ab_core::assessments::{CodeRunPurpose, CodeRunStatus};
use ab_core::config::Judge0Limits;
use ab_core::id::{AssessmentId, AssessmentItemId, CodeRunId, SubmissionId, UserId};
use ab_core::{Error, ErrorCode, Result};
use ab_db::submissions::{CodeRunCaseRow, CodeRunRow, NewCodeRun};
use serde::Serialize;
use sqlx::PgPool;
use utoipa::ToSchema;

use crate::assessments::items::{CodeBody, CodeTestCase, MatchMode};
use crate::code::{compare, sandbox};
use crate::grading::breakdown::round2;

const OUTPUT_TRUNCATION_MARKER: &str = "\n[output truncated]";

/// One test's outcome. Hidden tests lose `stdin`/`expected`/`actual`/
/// `stdout`/`stderr` for non-authors (see [`CodeRun::masked`]).
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct CaseResult {
    pub test_id: String,
    pub passed: bool,
    pub is_visible: bool,
    pub status_id: Option<i32>,
    pub status_description: String,
    pub description: String,
    pub weight: f64,
    pub stdin: Option<String>,
    pub expected: Option<String>,
    /// `stdout` with surrounding whitespace trimmed (what was compared).
    pub actual: Option<String>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub compile_output: Option<String>,
    pub message: Option<String>,
    pub time_seconds: Option<f64>,
    pub memory_kb: Option<i32>,
}

/// A code run with its cases.
#[derive(Debug, Clone)]
pub struct CodeRun {
    pub id: CodeRunId,
    pub assessment_id: AssessmentId,
    pub item_id: AssessmentItemId,
    pub submission_id: Option<SubmissionId>,
    pub user_id: UserId,
    pub purpose: CodeRunPurpose,
    pub status: CodeRunStatus,
    pub language_id: i32,
    pub passed: i32,
    pub total: i32,
    /// Weighted pass share 0..100; `None` for unscored (custom-input) runs.
    pub score: Option<f64>,
    pub compile_output: Option<String>,
    pub error_message: Option<String>,
    pub created_at: i64,
    pub finished_at: Option<i64>,
    pub cases: Vec<CaseResult>,
    /// Served from an earlier run under the same `Idempotency-Key`.
    pub replayed: bool,
}

impl CodeRun {
    /// The runner is down or the breaker is open — the same request may
    /// succeed later.
    #[must_use]
    pub fn is_retryable(&self) -> bool {
        self.status == CodeRunStatus::Degraded
    }

    /// Strip what a learner must not see about hidden tests.
    #[must_use]
    pub fn masked(mut self) -> Self {
        for case in &mut self.cases {
            if !case.is_visible {
                case.stdin = None;
                case.expected = None;
                case.actual = None;
                case.stdout = None;
                case.stderr = None;
            }
        }
        self
    }
}

/// What a submit-time (`final`) run produced.
#[derive(Debug)]
pub enum FinalRun {
    Ran(CodeRun),
    /// Judge0 unavailable (or not configured) — nothing was graded.
    Degraded(String),
    /// The stored answer's language is not allowed for this item.
    LanguageNotAllowed {
        allowed: Vec<i32>,
    },
}

/// Who and what a final run is for.
#[derive(Debug, Clone, Copy)]
pub struct FinalTarget {
    pub submission_id: SubmissionId,
    pub assessment_id: AssessmentId,
    pub item_id: AssessmentItemId,
    pub user_id: UserId,
}

/// Everything one execution needs besides the runner.
pub struct RunSpec<'a> {
    pub assessment_id: AssessmentId,
    pub item_id: AssessmentItemId,
    pub submission_id: Option<SubmissionId>,
    pub user_id: UserId,
    pub purpose: CodeRunPurpose,
    pub language_id: i32,
    pub source: &'a str,
    /// `Some` = custom-input run: one unscored test.
    pub custom_input: Option<&'a str>,
    pub tests: &'a [CodeTestCase],
    pub body: &'a CodeBody,
    pub idempotency_key: Option<&'a str>,
}

#[derive(Clone)]
pub struct CodeRunner {
    pool: PgPool,
    judge0: Option<Arc<Judge0Client>>,
    limits: Arc<Judge0Limits>,
}

impl CodeRunner {
    #[must_use]
    pub fn new(pool: PgPool, judge0: Option<Arc<Judge0Client>>, limits: Judge0Limits) -> Self {
        Self {
            pool,
            judge0,
            limits: Arc::new(limits),
        }
    }

    #[must_use]
    pub const fn pool(&self) -> &PgPool {
        &self.pool
    }

    #[must_use]
    pub fn limits(&self) -> &Judge0Limits {
        &self.limits
    }

    #[must_use]
    pub const fn judge0(&self) -> Option<&Arc<Judge0Client>> {
        self.judge0.as_ref()
    }

    /// Whether a language passes the platform allowlist (empty = any).
    #[must_use]
    pub fn language_allowed(&self, language_id: i32) -> bool {
        self.limits.allowed_language_ids.is_empty()
            || self.limits.allowed_language_ids.contains(&language_id)
    }

    /// Size and blank-source checks shared by every entry point. Blank
    /// source is refused before any row exists — Judge0 would 422 it, and
    /// the auto-submit timer must not hammer the sandbox retrying that.
    pub fn validate_payload(&self, source: &str, custom_input: Option<&str>) -> Result<()> {
        if source.trim().is_empty() {
            return Err(Error::validation(vec![ab_core::FieldError {
                field: "source".into(),
                code: "required".into(),
                message: "source code is empty".into(),
            }]));
        }
        if source.len() > self.limits.max_source_bytes {
            return Err(Error::app_with_details(
                ErrorCode::PayloadTooLarge,
                "source code exceeds the size limit",
                serde_json::json!({ "max_source_bytes": self.limits.max_source_bytes }),
            ));
        }
        if let Some(stdin) = custom_input
            && stdin.len() > self.limits.max_stdin_bytes
        {
            return Err(Error::app_with_details(
                ErrorCode::PayloadTooLarge,
                "custom input exceeds the size limit",
                serde_json::json!({ "max_stdin_bytes": self.limits.max_stdin_bytes }),
            ));
        }
        Ok(())
    }

    /// Load a stored run with its cases.
    pub async fn load(&self, id: CodeRunId) -> Result<Option<CodeRun>> {
        let Some(row) = ab_db::submissions::get_code_run(&self.pool, id).await? else {
            return Ok(None);
        };
        Ok(Some(self.with_cases(row, false).await?))
    }

    async fn with_cases(&self, row: CodeRunRow, replayed: bool) -> Result<CodeRun> {
        let cases = ab_db::submissions::list_code_run_cases(&self.pool, row.id).await?;
        Ok(build(row, cases, replayed))
    }

    /// Run at submit time: every test, keyed so a retried submit replays.
    pub async fn final_run(
        &self,
        target: FinalTarget,
        body: &CodeBody,
        language_id: i32,
        source: &str,
    ) -> Result<FinalRun> {
        if !self.language_allowed(language_id)
            || (!body.languages.is_empty() && !body.languages.contains(&language_id))
        {
            return Ok(FinalRun::LanguageNotAllowed {
                allowed: if body.languages.is_empty() {
                    self.limits.allowed_language_ids.clone()
                } else {
                    body.languages.clone()
                },
            });
        }
        let key = format!(
            "final:{}:{}:{language_id}:{}",
            target.submission_id,
            target.item_id,
            sha256_hex(source)
        );
        let run = self
            .execute(RunSpec {
                assessment_id: target.assessment_id,
                item_id: target.item_id,
                submission_id: Some(target.submission_id),
                user_id: target.user_id,
                purpose: CodeRunPurpose::Final,
                language_id,
                source,
                custom_input: None,
                tests: &body.tests,
                body,
                idempotency_key: Some(&key),
            })
            .await?;
        if run.status == CodeRunStatus::Degraded {
            return Ok(FinalRun::Degraded(
                run.error_message
                    .unwrap_or_else(|| "code runner unavailable".into()),
            ));
        }
        Ok(FinalRun::Ran(run))
    }

    /// Record a run row, execute on Judge0, persist cases, return the run.
    /// An `Idempotency-Key` replays an accepted/wrong-answer run with the
    /// same source, stdin and language; a different payload under the same
    /// key is a conflict; any other prior status is retried.
    pub async fn execute(&self, spec: RunSpec<'_>) -> Result<CodeRun> {
        let source_sha = sha256_hex(spec.source);
        let stdin_sha = spec.custom_input.map(sha256_hex);
        if let Some(replay) = self
            .replay_or_clear(&spec, &source_sha, stdin_sha.as_deref())
            .await?
        {
            return Ok(replay);
        }

        let custom_case;
        let tests: &[CodeTestCase] = match spec.custom_input {
            Some(input) => {
                custom_case = [CodeTestCase {
                    id: "custom".into(),
                    input: input.to_owned(),
                    expected_output: String::new(),
                    is_visible: true,
                    weight: 1,
                    description: None,
                    match_mode: MatchMode::Exact,
                }];
                &custom_case
            }
            None => spec.tests,
        };
        let Some(run_id) = ab_db::submissions::insert_code_run(
            &self.pool,
            NewCodeRun {
                assessment_id: spec.assessment_id,
                item_id: spec.item_id,
                submission_id: spec.submission_id,
                user_id: spec.user_id,
                purpose: spec.purpose,
                language_id: spec.language_id,
                source_sha256: &source_sha,
                stdin_sha256: stdin_sha.as_deref(),
                idempotency_key: spec.idempotency_key,
                total: i32::try_from(tests.len()).unwrap_or(i32::MAX),
            },
        )
        .await?
        else {
            // Lost a race on the idempotency key: the other request owns it.
            return Err(Error::conflict(
                "a code run with this Idempotency-Key is in progress",
            ));
        };

        match self.run_on_judge0(&spec, tests).await {
            Ok(results) => {
                let scored = spec.custom_input.is_none();
                let graded = grade_cases(tests, &results, scored, self.limits.max_output_bytes);
                ab_db::submissions::insert_code_run_cases(&self.pool, run_id, &graded.rows).await?;
                ab_db::submissions::finish_code_run(
                    &self.pool,
                    run_id,
                    graded.status,
                    graded.passed,
                    graded.score,
                    graded.compile_output.as_deref(),
                    None,
                )
                .await?;
            }
            Err(err) => {
                let status = match &err {
                    Judge0Error::Unavailable(_) => CodeRunStatus::Degraded,
                    Judge0Error::Rejected(_) => CodeRunStatus::InternalError,
                };
                tracing::warn!(%run_id, %err, ?status, "code run did not execute");
                ab_db::submissions::finish_code_run(
                    &self.pool,
                    run_id,
                    status,
                    0,
                    None,
                    None,
                    Some(&err.to_string()),
                )
                .await?;
            }
        }
        self.load(run_id)
            .await?
            .ok_or_else(|| Error::not_found("code run"))
    }

    /// The idempotency contract: replay a finished run, refuse a different
    /// payload under the same key, or free the key of a failed run.
    async fn replay_or_clear(
        &self,
        spec: &RunSpec<'_>,
        source_sha: &str,
        stdin_sha: Option<&str>,
    ) -> Result<Option<CodeRun>> {
        let Some(key) = spec.idempotency_key else {
            return Ok(None);
        };
        let Some(existing) = ab_db::submissions::find_idempotent_run(
            &self.pool,
            spec.user_id,
            spec.item_id,
            spec.purpose,
            key,
        )
        .await?
        else {
            return Ok(None);
        };
        if existing.source_sha256 != source_sha
            || existing.stdin_sha256.as_deref() != stdin_sha
            || existing.language_id != spec.language_id
        {
            return Err(Error::app_with_details(
                ErrorCode::Conflict,
                "Idempotency-Key was already used for a different code run",
                serde_json::json!({ "run_id": existing.id }),
            ));
        }
        if matches!(
            existing.status,
            CodeRunStatus::Accepted | CodeRunStatus::WrongAnswer
        ) {
            return Ok(Some(self.with_cases(existing, true).await?));
        }
        ab_db::submissions::clear_idempotency_key(&self.pool, existing.id).await?;
        Ok(None)
    }

    async fn run_on_judge0(
        &self,
        spec: &RunSpec<'_>,
        tests: &[CodeTestCase],
    ) -> std::result::Result<Vec<SubmissionResult>, Judge0Error> {
        let Some(client) = &self.judge0 else {
            return Err(Judge0Error::Unavailable(
                "code runner is not configured".into(),
            ));
        };
        let limits = sandbox::Limits {
            time_limit_seconds: spec.body.time_limit_seconds,
            memory_limit_mb: spec.body.memory_limit_mb,
            max_output_file_kb: self.limits.max_output_file_kb,
        };
        let specs: Vec<SubmissionSpec> = tests
            .iter()
            .map(|t| sandbox::spec(spec.language_id, spec.source, &t.input, limits))
            .collect();
        client.run_batch(&specs).await
    }
}

struct Graded {
    rows: Vec<CodeRunCaseRow>,
    status: CodeRunStatus,
    passed: i32,
    score: Option<f64>,
    compile_output: Option<String>,
}

/// Judge0 status id → run status (legacy `normalize_status`).
const fn status_from_judge0(id: i32) -> CodeRunStatus {
    match id {
        1 => CodeRunStatus::Queued,
        2 => CodeRunStatus::Running,
        3 => CodeRunStatus::Accepted,
        4 => CodeRunStatus::WrongAnswer,
        5 => CodeRunStatus::TimeLimit,
        6 => CodeRunStatus::CompileError,
        7..=12 => CodeRunStatus::RuntimeError,
        _ => CodeRunStatus::InternalError,
    }
}

/// Per-case verdicts + the run-level rollup (legacy `_execute_sync`).
fn grade_cases(
    tests: &[CodeTestCase],
    results: &[SubmissionResult],
    scored: bool,
    max_output_bytes: usize,
) -> Graded {
    let mut rows = Vec::with_capacity(tests.len());
    let mut passed = 0;
    let mut overall = CodeRunStatus::Accepted;
    let mut compile_output = None;
    for (position, (test, result)) in tests.iter().zip(results).enumerate() {
        let mut case_status = status_from_judge0(result.status_id);
        let mut status_id = Some(result.status_id);
        let mut status_description = result.status_description.clone();
        let case_passed = if scored {
            if case_status == CodeRunStatus::Accepted
                && !compare::outputs_match(
                    result.stdout.as_deref(),
                    Some(&test.expected_output),
                    test.match_mode,
                )
            {
                case_status = CodeRunStatus::WrongAnswer;
                status_id = Some(4);
                status_description = "Wrong Answer".into();
            }
            case_status == CodeRunStatus::Accepted
        } else {
            true
        };
        if scored && case_passed {
            passed += 1;
        }
        if case_status != CodeRunStatus::Accepted && overall == CodeRunStatus::Accepted {
            overall = case_status;
        }
        let compile = truncate(result.compile_output.as_deref(), max_output_bytes);
        if compile_output.is_none() {
            compile_output.clone_from(&compile);
        }
        rows.push(CodeRunCaseRow {
            position: i32::try_from(position).unwrap_or(i32::MAX),
            test_id: test.id.clone(),
            judge0_token: Some(result.token.clone()),
            stdin: Some(test.input.clone()),
            expected_output: Some(test.expected_output.clone()),
            description: test.description.clone().unwrap_or_default(),
            weight: f64::from(test.weight.max(1)),
            is_visible: test.is_visible,
            status_id,
            status_description,
            passed: case_passed,
            stdout: truncate(result.stdout.as_deref(), max_output_bytes),
            stderr: truncate(result.stderr.as_deref(), max_output_bytes),
            compile_output: compile,
            message: truncate(result.message.as_deref(), max_output_bytes),
            time_seconds: result.time_seconds,
            memory_kb: result.memory_kb,
        });
    }
    let total = i32::try_from(tests.len()).unwrap_or(i32::MAX);
    let score = if scored && !rows.is_empty() {
        let total_weight: f64 = rows.iter().map(|r| r.weight).sum();
        let earned: f64 = rows.iter().filter(|r| r.passed).map(|r| r.weight).sum();
        Some(round2(earned / total_weight * 100.0))
    } else {
        None
    };
    if scored && passed < total && overall == CodeRunStatus::Accepted {
        overall = CodeRunStatus::WrongAnswer;
    }
    Graded {
        rows,
        status: overall,
        passed: if scored { passed } else { 0 },
        score,
        compile_output,
    }
}

/// Cap a captured stream at `max_bytes` on a char boundary, marking the cut.
fn truncate(value: Option<&str>, max_bytes: usize) -> Option<String> {
    let value = value?;
    if value.len() <= max_bytes {
        return Some(value.to_owned());
    }
    let budget = max_bytes.saturating_sub(OUTPUT_TRUNCATION_MARKER.len());
    let cut = value.floor_char_boundary(budget);
    Some(format!("{}{OUTPUT_TRUNCATION_MARKER}", &value[..cut]))
}

fn build(row: CodeRunRow, cases: Vec<CodeRunCaseRow>, replayed: bool) -> CodeRun {
    CodeRun {
        id: row.id,
        assessment_id: row.assessment_id,
        item_id: row.item_id,
        submission_id: row.submission_id,
        user_id: row.user_id,
        purpose: row.purpose,
        status: row.status,
        language_id: row.language_id,
        passed: row.passed,
        total: row.total,
        score: row.score,
        compile_output: row.compile_output,
        error_message: row.error_message,
        created_at: row.created_at,
        finished_at: row.finished_at,
        cases: cases
            .into_iter()
            .map(|c| CaseResult {
                actual: c.stdout.as_deref().map(|s| s.trim().to_owned()),
                test_id: c.test_id,
                passed: c.passed,
                is_visible: c.is_visible,
                status_id: c.status_id,
                status_description: c.status_description,
                description: c.description,
                weight: c.weight,
                stdin: c.stdin,
                expected: c.expected_output,
                stdout: c.stdout,
                stderr: c.stderr,
                compile_output: c.compile_output,
                message: c.message,
                time_seconds: c.time_seconds,
                memory_kb: c.memory_kb,
            })
            .collect(),
        replayed,
    }
}

pub fn sha256_hex(value: &str) -> String {
    use sha2::Digest;
    use std::fmt::Write;
    let digest = sha2::Sha256::digest(value.as_bytes());
    let mut out = String::with_capacity(64);
    for byte in digest {
        let _ = write!(out, "{byte:02x}");
    }
    out
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::float_cmp)]
mod tests {
    use super::*;

    fn result(status_id: i32, stdout: Option<&str>) -> SubmissionResult {
        SubmissionResult {
            token: "t".into(),
            status_id,
            status_description: "x".into(),
            stdout: stdout.map(str::to_owned),
            stderr: None,
            compile_output: None,
            message: None,
            time_seconds: Some(0.01),
            memory_kb: Some(100),
        }
    }

    fn test(id: &str, expected: &str, weight: i32, visible: bool) -> CodeTestCase {
        CodeTestCase {
            id: id.into(),
            input: "in".into(),
            expected_output: expected.into(),
            is_visible: visible,
            weight,
            description: None,
            match_mode: MatchMode::Exact,
        }
    }

    #[test]
    fn accepted_by_judge0_but_mismatching_output_is_wrong_answer() {
        let tests = [test("a", "4", 2, true), test("b", "9", 3, false)];
        let results = [result(3, Some("4\n")), result(3, Some("8\n"))];
        let graded = grade_cases(&tests, &results, true, 100);
        assert_eq!(graded.passed, 1);
        assert_eq!(graded.status, CodeRunStatus::WrongAnswer);
        assert_eq!(graded.score, Some(40.0));
        assert_eq!(graded.rows[1].status_id, Some(4));
        assert_eq!(graded.rows[1].status_description, "Wrong Answer");
        assert!(
            graded.rows[1].stdin.is_some(),
            "stored in full; masked on read"
        );
    }

    #[test]
    fn first_failing_status_wins_and_custom_runs_are_unscored() {
        let tests = [test("a", "1", 1, true), test("b", "2", 1, true)];
        let results = [result(6, None), result(5, None)];
        let graded = grade_cases(&tests, &results, true, 100);
        assert_eq!(graded.status, CodeRunStatus::CompileError);
        assert_eq!(graded.score, Some(0.0));

        let custom = grade_cases(&tests[..1], &[result(3, Some("anything"))], false, 100);
        assert_eq!(custom.status, CodeRunStatus::Accepted);
        assert_eq!(custom.passed, 0);
        assert_eq!(custom.score, None);
        assert!(custom.rows[0].passed);
    }

    #[test]
    fn outputs_are_truncated_with_a_marker() {
        let long = "x".repeat(200);
        let cut = truncate(Some(&long), 100).unwrap();
        assert!(cut.len() <= 100);
        assert!(cut.ends_with("[output truncated]"));
        assert_eq!(truncate(Some("short"), 100).as_deref(), Some("short"));
        assert_eq!(truncate(None, 100), None);
    }
}
