//! Spreadsheet (DOT `.xlsx`) imports of tests: docs/XLSX-TEST-IMPORT.md.

use ab_core::assessments::AssessmentKind;
use ab_core::id::{AssessmentId, ChapterId};
use ab_domain::assessments::imports::{CommitOptions, CommitTarget};
use ab_domain::assessments::service::DrawStratum;
use serde::Deserialize;
use utoipa::ToSchema;

pub use ab_domain::assessments::imports::{
    AssessmentImport, ImportIssue, ImportResult, ImportSettings, ImportStatus, ImportSummary,
    IssueSeverity, PlannedItem,
};

/// Take an uploaded spreadsheet and read it.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
pub struct CreateImportRequest {
    /// A finalized `assessment-import` upload of the caller.
    #[garde(skip)]
    pub upload_id: uuid::Uuid,
    /// The name the teacher's file had (shown back and kept on the items).
    #[garde(length(min = 1, max = 255))]
    pub file_name: String,
    /// DOT mode: read the two characters `\n` as a line break (default on).
    #[garde(skip)]
    #[serde(default = "yes")]
    pub unescape_newlines: bool,
}

const fn yes() -> bool {
    true
}

/// Read the same file again with the other `\n` mode.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
pub struct ReparseImportRequest {
    #[garde(skip)]
    pub unescape_newlines: bool,
}

/// Where the questions go.
#[derive(Debug, Clone, Copy, Deserialize, garde::Validate, ToSchema)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum ImportTarget {
    /// A new draft test appended to this chapter.
    New {
        #[garde(skip)]
        chapter_id: ChapterId,
        /// `quiz` or `exam` (default `exam`).
        #[garde(skip)]
        #[serde(default = "exam")]
        kind: AssessmentKind,
    },
    /// Every question of this draft test replaced.
    Replace {
        #[garde(skip)]
        assessment_id: AssessmentId,
    },
    /// Added after this draft test's questions.
    Append {
        #[garde(skip)]
        assessment_id: AssessmentId,
    },
}

const fn exam() -> AssessmentKind {
    AssessmentKind::Exam
}

/// Create the test. Every setting is optional: the file's row 1 otherwise.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
pub struct CommitImportRequest {
    #[garde(dive)]
    pub target: ImportTarget,
    /// The test's title (a new test; default A1).
    #[garde(inner(length(min = 1, max = 200)))]
    #[serde(default)]
    pub title: Option<String>,
    /// Replace/append: also apply the file's settings (a new test always
    /// takes them).
    #[garde(skip)]
    #[serde(default)]
    pub apply_settings: bool,
    /// `null`: unlimited.
    #[garde(inner(inner(range(min = 1, max = 10))))]
    #[serde(default, deserialize_with = "crate::dto::double_option")]
    #[schema(value_type = Option<i32>, minimum = 1, maximum = 10)]
    pub max_attempts: Option<Option<i32>>,
    /// `null`: no time limit.
    #[garde(inner(inner(range(min = 60, max = 86_400))))]
    #[serde(default, deserialize_with = "crate::dto::double_option")]
    #[schema(value_type = Option<i32>, minimum = 60, maximum = 86_400)]
    pub time_limit_seconds: Option<Option<i32>>,
    /// `null`: every question in each attempt.
    #[garde(inner(inner(range(min = 1, max = 200))))]
    #[serde(default, deserialize_with = "crate::dto::double_option")]
    #[schema(value_type = Option<i32>, minimum = 1, maximum = 200)]
    pub draw_count: Option<Option<i32>>,
    #[garde(inner(length(max = 20)))]
    #[serde(default)]
    #[schema(max_items = 20)]
    pub draw_strata: Option<Vec<DrawStratum>>,
    /// Multiple choice and matching: score the right share (default off,
    /// as in DOT).
    #[garde(skip)]
    #[serde(default)]
    pub partial_credit: Option<bool>,
    /// Percent (default 50).
    #[garde(inner(range(min = 0.0, max = 100.0)))]
    #[serde(default)]
    pub passing_score: Option<f64>,
}

impl CommitImportRequest {
    pub fn into_parts(self) -> (CommitTarget, CommitOptions) {
        let target = match self.target {
            ImportTarget::New { chapter_id, kind } => CommitTarget::New { chapter_id, kind },
            ImportTarget::Replace { assessment_id } => CommitTarget::Replace { assessment_id },
            ImportTarget::Append { assessment_id } => CommitTarget::Append { assessment_id },
        };
        let options = CommitOptions {
            title: self.title,
            apply_settings: self.apply_settings,
            max_attempts: self.max_attempts,
            time_limit_seconds: self.time_limit_seconds,
            draw_count: self.draw_count,
            draw_strata: self.draw_strata,
            partial_credit: self.partial_credit,
            passing_score: self.passing_score,
        };
        (target, options)
    }
}
