//! Teacher-side grading DTOs: review queue, stats, the grader's view of a
//! submission, grade saves, releases, bulk actions, the course gradebook.
// A grade save's `final_score` has three states: absent (keep), `null` (drop
// the override), value.
#![allow(clippy::option_option)]

use std::collections::BTreeMap;

use ab_core::assessments::{
    AssessmentKind, AutoSubmitReason, BulkActionStatus, BulkActionType, SubmissionStatus,
};
use ab_core::id::{
    ActivityId, AssessmentId, AssessmentItemId, BulkActionId, FileAttemptId, FileSubmissionId,
    GradingEntryId, SubmissionId, UserId,
};
use ab_domain::grading::answers::ItemAnswer;
use ab_domain::grading::breakdown::GradingBreakdown;
use ab_domain::grading::submissions::ReleaseState;
use ab_domain::grading::teacher as domain;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use super::double_option;

pub use ab_domain::grading::teacher::{
    ItemAnalytics, ItemFeedbackView, PublishSummary, ScoreBucket, UserSummary,
};

/// Queue filter; `needs_grading` is `pending`.
#[derive(Debug, Clone, Copy, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ReviewStatus {
    NeedsGrading,
    Pending,
    Graded,
    Published,
    Returned,
}

impl From<ReviewStatus> for domain::ReviewStatus {
    fn from(s: ReviewStatus) -> Self {
        match s {
            ReviewStatus::NeedsGrading => Self::NeedsGrading,
            ReviewStatus::Pending => Self::Pending,
            ReviewStatus::Graded => Self::Graded,
            ReviewStatus::Published => Self::Published,
            ReviewStatus::Returned => Self::Returned,
        }
    }
}

#[derive(Debug, Deserialize, ToSchema, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
pub struct ReviewQuery {
    pub status: Option<ReviewStatus>,
    #[serde(default)]
    pub late_only: bool,
    /// Substring of the learner's username or display name.
    pub search: Option<String>,
    /// `next_cursor` of the previous page.
    pub cursor: Option<SubmissionId>,
    /// 1..=100 (default 25).
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReviewItem {
    pub id: SubmissionId,
    pub user: UserSummary,
    pub status: SubmissionStatus,
    pub attempt_number: i32,
    pub auto_score: Option<f64>,
    pub final_score: Option<f64>,
    pub is_late: bool,
    pub submitted_at_unix: Option<i64>,
    pub graded_at_unix: Option<i64>,
    /// Teacher optimistic lock (`If-Match` on grade saves).
    pub version: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReviewPage {
    pub items: Vec<ReviewItem>,
    pub next_cursor: Option<SubmissionId>,
}

impl From<domain::ReviewPage> for ReviewPage {
    fn from(p: domain::ReviewPage) -> Self {
        Self {
            items: p
                .items
                .into_iter()
                .map(|i| ReviewItem {
                    id: i.id,
                    user: i.user,
                    status: i.status,
                    attempt_number: i.attempt_number,
                    auto_score: i.auto_score,
                    final_score: i.final_score,
                    is_late: i.is_late,
                    submitted_at_unix: i.submitted_at,
                    graded_at_unix: i.graded_at,
                    version: i.version,
                })
                .collect(),
            next_cursor: p.next_cursor,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct Stats {
    pub total: i64,
    pub needs_grading: i64,
    pub graded: i64,
    pub published: i64,
    pub returned: i64,
    pub late: i64,
    pub avg_score: Option<f64>,
    /// Percent of graded work at or above the passing score.
    pub pass_rate: Option<f64>,
    pub distribution: Vec<ScoreBucket>,
}

impl From<domain::Stats> for Stats {
    fn from(s: domain::Stats) -> Self {
        Self {
            total: s.total,
            needs_grading: s.needs_grading,
            graded: s.graded,
            published: s.published,
            returned: s.returned,
            late: s.late,
            avg_score: s.avg_score,
            pass_rate: s.pass_rate,
            distribution: s.distribution,
        }
    }
}

/// A submission as the grader sees it — nothing redacted.
#[derive(Debug, Serialize, ToSchema)]
pub struct TeacherSubmission {
    pub id: SubmissionId,
    pub assessment_id: AssessmentId,
    pub user: UserSummary,
    pub status: SubmissionStatus,
    pub release_state: ReleaseState,
    pub attempt_number: i32,
    pub answers: BTreeMap<AssessmentItemId, ItemAnswer>,
    pub grading: GradingBreakdown,
    pub auto_score: Option<f64>,
    pub final_score: Option<f64>,
    /// The raw score of the latest grading entry when it is a manual
    /// override (differs from the item-derived one); `null` otherwise.
    pub score_override: Option<f64>,
    pub is_late: bool,
    pub late_penalty_pct: f64,
    pub violation_count: i32,
    #[schema(value_type = Vec<Object>)]
    pub violations: serde_json::Value,
    pub auto_submit_reason: Option<AutoSubmitReason>,
    pub duration_seconds: Option<i32>,
    pub started_at_unix: Option<i64>,
    pub submitted_at_unix: Option<i64>,
    pub graded_at_unix: Option<i64>,
    /// Send back as `If-Match` on grade saves.
    pub version: i64,
    pub content_version: i32,
    pub policy_version: i32,
    pub feedback: Vec<ItemFeedbackView>,
}

impl From<domain::TeacherSubmission> for TeacherSubmission {
    fn from(s: domain::TeacherSubmission) -> Self {
        Self {
            id: s.id,
            assessment_id: s.assessment_id,
            user: s.user,
            status: s.status,
            release_state: s.release_state,
            attempt_number: s.attempt_number,
            answers: s.answers,
            grading: s.grading,
            auto_score: s.auto_score,
            final_score: s.final_score,
            score_override: s.score_override,
            is_late: s.is_late,
            late_penalty_pct: s.late_penalty_pct,
            violation_count: s.violation_count,
            violations: s.violations,
            auto_submit_reason: s.auto_submit_reason,
            duration_seconds: s.duration_seconds,
            started_at_unix: s.started_at,
            submitted_at_unix: s.submitted_at,
            graded_at_unix: s.graded_at,
            version: s.version,
            content_version: s.content_version,
            policy_version: s.policy_version,
            feedback: s.feedback,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum GradeAction {
    /// Keep teacher-only (`graded`).
    Save,
    /// Release to the learner (`published`).
    Publish,
    /// Send back for revision (`returned`).
    Return,
}

impl From<GradeAction> for domain::GradeAction {
    fn from(a: GradeAction) -> Self {
        match a {
            GradeAction::Save => Self::Save,
            GradeAction::Publish => Self::Publish,
            GradeAction::Return => Self::Return,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ItemGradeRequest {
    #[garde(skip)]
    pub item_id: AssessmentItemId,
    /// Points for this item (its `max_score` scale).
    #[garde(range(min = 0.0))]
    pub score: Option<f64>,
    #[garde(length(chars, max = 5000))]
    #[serde(default)]
    pub feedback: String,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct GradeRequest {
    #[garde(skip)]
    pub action: GradeAction,
    /// Raw 0..100 before the late penalty (a manual override). Omitted: the
    /// stored override (or the 0 of an integrity-annulled attempt) is kept,
    /// otherwise the raw is computed from the item scores (earned / possible
    /// × 100). An explicit `null` drops the override and recomputes (BUG-174).
    #[garde(range(min = 0.0, max = 100.0))]
    #[serde(default, deserialize_with = "double_option")]
    #[schema(value_type = Option<f64>)]
    pub final_score: Option<Option<f64>>,
    /// Overall feedback shown to the learner; omitted = keep the stored one.
    #[garde(length(chars, max = 10_000))]
    pub feedback: Option<String>,
    #[garde(dive)]
    #[serde(default)]
    pub item_grades: Vec<ItemGradeRequest>,
    /// Grader's note for the audit trail; never shown to the learner.
    #[garde(length(chars, max = 1000))]
    pub audit_note: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct GradingEntry {
    pub id: GradingEntryId,
    /// `null` = the auto-grader.
    pub graded_by: Option<UserId>,
    pub raw_score: f64,
    pub penalty_pct: f64,
    /// Absent for a draft save that left the attempt pending.
    pub final_score: Option<f64>,
    pub overall_feedback: String,
    pub published_at_unix: Option<i64>,
    pub created_at_unix: i64,
}

impl From<domain::GradingEntry> for GradingEntry {
    fn from(e: domain::GradingEntry) -> Self {
        Self {
            id: e.id,
            graded_by: e.graded_by,
            raw_score: e.raw_score,
            penalty_pct: e.penalty_pct,
            final_score: e.final_score,
            overall_feedback: e.overall_feedback,
            published_at_unix: e.published_at,
            created_at_unix: e.created_at,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DeadlineExtensionRequest {
    #[garde(length(min = 1, max = 500))]
    pub user_ids: Vec<UserId>,
    /// Unix seconds, at most 9999-12-31 (the timestamp range).
    #[garde(range(min = 0, max = super::EPOCH_MAX))]
    pub new_due_at_unix: i64,
    #[garde(length(chars, max = 500))]
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct BulkAction {
    pub id: BulkActionId,
    pub assessment_id: AssessmentId,
    pub performed_by: Option<UserId>,
    pub action_type: BulkActionType,
    pub status: BulkActionStatus,
    #[schema(value_type = Object)]
    pub params: serde_json::Value,
    pub target_user_ids: Vec<UserId>,
    pub affected_count: i32,
    pub error_log: String,
    pub created_at_unix: i64,
    pub completed_at_unix: Option<i64>,
}

impl From<ab_domain::grading::bulk::BulkAction> for BulkAction {
    fn from(a: ab_domain::grading::bulk::BulkAction) -> Self {
        Self {
            id: a.id,
            assessment_id: a.assessment_id,
            performed_by: a.performed_by,
            action_type: a.action_type,
            status: a.status,
            params: a.params,
            target_user_ids: a.target_user_ids,
            affected_count: a.affected_count,
            error_log: a.error_log,
            created_at_unix: a.created_at,
            completed_at_unix: a.completed_at,
        }
    }
}

#[derive(Debug, Deserialize, ToSchema, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
pub struct GradebookQuery {
    /// `next_cursor` of the previous page.
    pub cursor: Option<String>,
    /// 1..=500 cells (default 200).
    pub limit: Option<i64>,
}

/// One learner's grade-of-record attempt on one graded activity (the
/// projector's best-scored submission or latest scored file attempt).
///
/// Exactly one id pair is set: `assessment_id` + `submission_id` for an
/// assessment, `file_submission_id` + `attempt_id` for a file submission
/// (whose `submitted` reads as `pending` here).
#[derive(Debug, Serialize, ToSchema)]
pub struct GradebookCell {
    pub user_id: UserId,
    pub activity_id: ActivityId,
    pub assessment_id: Option<AssessmentId>,
    pub submission_id: Option<SubmissionId>,
    pub file_submission_id: Option<FileSubmissionId>,
    pub attempt_id: Option<FileAttemptId>,
    pub status: SubmissionStatus,
    pub attempt_number: i32,
    pub attempts: i64,
    /// The newest attempt still awaiting grading (`pending`), if any — set
    /// even when the grade of record is an older published attempt (BUG-175).
    pub pending_attempt: Option<i32>,
    /// The id of that pending attempt — a submission id or a file attempt
    /// id, whichever the cell is about — so the review deep link opens the
    /// work awaiting grading rather than the grade of record (UX-123).
    pub pending_attempt_id: Option<Uuid>,
    pub final_score: Option<f64>,
    pub is_late: bool,
    /// The learner's active due-date override for this assessment (UX-113):
    /// «overdue» is judged against it, not the assessment `due_at_unix`.
    pub due_at_override_unix: Option<i64>,
    pub submitted_at_unix: Option<i64>,
    pub graded_at_unix: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct GradebookAssessment {
    pub id: AssessmentId,
    pub activity_id: ActivityId,
    pub title: String,
    pub kind: AssessmentKind,
    pub due_at_unix: Option<i64>,
    pub passing_score: f64,
}

/// A file-submission activity as a gradebook column.
#[derive(Debug, Serialize, ToSchema)]
pub struct GradebookFileSubmission {
    pub id: FileSubmissionId,
    pub activity_id: ActivityId,
    pub title: String,
    pub due_at_unix: Option<i64>,
}

/// Latest submitted attempt per (learner, graded activity), keyset-paged;
/// `assessments` and `file_submissions` are the columns.
#[derive(Debug, Serialize, ToSchema)]
pub struct GradebookPage {
    pub cells: Vec<GradebookCell>,
    pub users: Vec<UserSummary>,
    pub assessments: Vec<GradebookAssessment>,
    pub file_submissions: Vec<GradebookFileSubmission>,
    pub next_cursor: Option<String>,
}

impl From<domain::GradebookPage> for GradebookPage {
    fn from(p: domain::GradebookPage) -> Self {
        Self {
            cells: p
                .cells
                .into_iter()
                .map(|c| GradebookCell {
                    user_id: c.user_id,
                    activity_id: c.activity_id,
                    assessment_id: c.assessment_id,
                    submission_id: c.submission_id,
                    file_submission_id: c.file_submission_id,
                    attempt_id: c.attempt_id,
                    status: c.status,
                    attempt_number: c.attempt_number,
                    attempts: c.attempts,
                    pending_attempt: c.pending_attempt,
                    pending_attempt_id: c.pending_attempt_id,
                    final_score: c.final_score,
                    is_late: c.is_late,
                    due_at_override_unix: c.due_at_override,
                    submitted_at_unix: c.submitted_at,
                    graded_at_unix: c.graded_at,
                })
                .collect(),
            users: p.users,
            assessments: p
                .assessments
                .into_iter()
                .map(|a| GradebookAssessment {
                    id: a.id,
                    activity_id: a.activity_id,
                    title: a.title,
                    kind: a.kind,
                    due_at_unix: a.due_at,
                    passing_score: a.passing_score,
                })
                .collect(),
            file_submissions: p
                .file_submissions
                .into_iter()
                .map(|f| GradebookFileSubmission {
                    id: f.id,
                    activity_id: f.activity_id,
                    title: f.title,
                    due_at_unix: f.due_at,
                })
                .collect(),
            next_cursor: p.next_cursor,
        }
    }
}
