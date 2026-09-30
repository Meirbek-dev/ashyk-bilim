//! Code execution DTOs: run requests/results, the reference check, the
//! language list.

use ab_core::assessments::{CodeRunPurpose, CodeRunStatus};
use ab_core::id::{AssessmentId, AssessmentItemId, CodeRunId, SubmissionId};
use ab_domain::code::{CaseResult, CodeRun as DomainRun};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

pub use ab_domain::code::{LanguageInfo, ReferenceCheck};

/// Run source against an item's visible tests, or against one custom input.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RunRequest {
    /// Judge0 language id.
    #[garde(range(min = 1))]
    pub language_id: i32,
    #[garde(skip)]
    pub source: String,
    /// When present the run is unscored: one case named `custom`.
    #[garde(skip)]
    pub custom_input: Option<String>,
}

/// A code run and its per-test results. Learners never see hidden tests'
/// input, expected output, or their program's output on them.
#[derive(Debug, Serialize, ToSchema)]
pub struct CodeRun {
    pub id: CodeRunId,
    pub assessment_id: AssessmentId,
    pub item_id: AssessmentItemId,
    pub submission_id: Option<SubmissionId>,
    pub purpose: CodeRunPurpose,
    pub status: CodeRunStatus,
    pub language_id: i32,
    pub passed: i32,
    pub total: i32,
    /// Weighted pass share 0..100; `null` for custom-input runs.
    pub score: Option<f64>,
    pub compile_output: Option<String>,
    pub error_message: Option<String>,
    /// Served from an earlier run under the same `Idempotency-Key`.
    pub replayed: bool,
    pub created_at_unix: i64,
    pub finished_at_unix: Option<i64>,
    pub cases: Vec<CaseResult>,
}

impl From<DomainRun> for CodeRun {
    fn from(r: DomainRun) -> Self {
        Self {
            id: r.id,
            assessment_id: r.assessment_id,
            item_id: r.item_id,
            submission_id: r.submission_id,
            purpose: r.purpose,
            status: r.status,
            language_id: r.language_id,
            passed: r.passed,
            total: r.total,
            score: r.score,
            compile_output: r.compile_output,
            error_message: r.error_message,
            replayed: r.replayed,
            created_at_unix: r.created_at,
            finished_at_unix: r.finished_at,
            cases: r.cases,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReferenceCheckResponse {
    pub results: Vec<ReferenceCheck>,
}
