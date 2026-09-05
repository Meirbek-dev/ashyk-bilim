//! Learner-side submission DTOs. The teacher surface (review queue, grade
//! save, releases) has its own module in 4.5.

use std::collections::BTreeMap;

use ab_core::assessments::SubmissionStatus;
use ab_core::id::{AssessmentId, AssessmentItemId, SubmissionId};
use ab_domain::grading::answers::ItemAnswer;
use ab_domain::grading::breakdown::GradingBreakdown;
use ab_domain::grading::submissions::{ReleaseState, StudentSubmission as DomainSubmission};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// One attempt as its owner sees it. Scores, grading and lateness penalty
/// are `null` until the grade is released.
#[derive(Debug, Serialize, ToSchema)]
pub struct StudentSubmission {
    pub id: SubmissionId,
    pub assessment_id: AssessmentId,
    pub attempt_number: i32,
    pub status: SubmissionStatus,
    pub release_state: ReleaseState,
    /// `{ "<item_id>": ItemAnswer }`.
    pub answers: BTreeMap<AssessmentItemId, ItemAnswer>,
    pub grading: Option<GradingBreakdown>,
    pub auto_score: Option<f64>,
    pub final_score: Option<f64>,
    pub is_late: bool,
    pub late_penalty_pct: Option<f64>,
    pub started_at_unix: Option<i64>,
    pub submitted_at_unix: Option<i64>,
    pub graded_at_unix: Option<i64>,
    /// Send back as `If-Match` on draft saves and submits.
    pub draft_version: i64,
    pub violation_count: i32,
    pub answered_count: usize,
    pub total_items: usize,
    /// Seconds left on an open timed draft; `null` when untimed or closed.
    pub time_remaining_seconds: Option<i64>,
}

impl From<DomainSubmission> for StudentSubmission {
    fn from(s: DomainSubmission) -> Self {
        Self {
            id: s.id,
            assessment_id: s.assessment_id,
            attempt_number: s.attempt_number,
            status: s.status,
            release_state: s.release_state,
            answers: s.answers,
            grading: s.grading,
            auto_score: s.auto_score,
            final_score: s.final_score,
            is_late: s.is_late,
            late_penalty_pct: s.late_penalty_pct,
            started_at_unix: s.started_at,
            submitted_at_unix: s.submitted_at,
            graded_at_unix: s.graded_at,
            draft_version: s.draft_version,
            violation_count: s.violation_count,
            answered_count: s.answered_count,
            total_items: s.total_items,
            time_remaining_seconds: s.time_remaining_seconds,
        }
    }
}

/// Partial answers; items not mentioned keep their current answer.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SaveDraftRequest {
    #[garde(skip)]
    pub answers: BTreeMap<AssessmentItemId, ItemAnswer>,
}

#[derive(Debug, Default, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SubmitRequest {
    /// A last patch applied before grading.
    #[garde(skip)]
    #[serde(default)]
    pub answers: Option<BTreeMap<AssessmentItemId, ItemAnswer>>,
    /// The client's anti-cheat count; the server's own count wins when higher.
    #[garde(range(min = 0))]
    #[serde(default)]
    pub violation_count: i32,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ViolationRequest {
    /// e.g. `tab_switch`, `copy_paste`, `devtools`, `fullscreen_exit`.
    #[garde(length(min = 1, max = 64))]
    pub kind: String,
    #[garde(length(max = 500))]
    pub detail: Option<String>,
}
