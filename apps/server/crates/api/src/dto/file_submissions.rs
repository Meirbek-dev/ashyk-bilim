//! File-submission DTOs: activity config, attempts with attached files,
//! grading, review queue, signed downloads.
// Patches need three states per field: absent (keep), `null` (clear), value.
#![allow(clippy::option_option)]

use ab_core::assessments::{FileAttemptStatus, FileSubmissionLifecycle, GradeReleaseMode};
use ab_core::id::{
    ActivityId, ChapterId, CourseId, FileAttemptFileId, FileAttemptId, FileSubmissionId,
};
use ab_domain::files::submissions as domain;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::dto::assessments::LatePolicy;
pub use ab_domain::files::submissions::AttachedFile;
pub use ab_domain::grading::teacher::UserSummary;

/// Distinguish an absent field (keep) from an explicit `null` (clear).
fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

/// The configuration block; every field optional on create and patch.
#[derive(Debug, Default, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ConfigPatch {
    #[garde(length(max = 500))]
    pub title: Option<String>,
    #[garde(length(max = 50_000))]
    pub instructions: Option<String>,
    #[garde(skip)]
    #[schema(value_type = Option<Object>)]
    pub rubric: Option<serde_json::Value>,
    #[garde(skip)]
    pub allowed_mime_types: Option<Vec<String>>,
    #[garde(skip)]
    pub max_files: Option<i32>,
    /// `null` clears the limit.
    #[garde(skip)]
    #[serde(default, deserialize_with = "double_option")]
    #[schema(value_type = Option<i32>)]
    pub max_file_size_mb: Option<Option<i32>>,
    #[garde(skip)]
    #[serde(default, deserialize_with = "double_option")]
    #[schema(value_type = Option<i64>)]
    pub due_at_unix: Option<Option<i64>>,
    #[garde(skip)]
    pub allow_late: Option<bool>,
    #[garde(skip)]
    pub late_policy: Option<LatePolicy>,
    #[garde(skip)]
    #[serde(default, deserialize_with = "double_option")]
    #[schema(value_type = Option<i32>)]
    pub max_attempts: Option<Option<i32>>,
    #[garde(skip)]
    pub grade_release_mode: Option<GradeReleaseMode>,
    #[garde(skip)]
    #[schema(value_type = Option<Object>)]
    pub settings: Option<serde_json::Value>,
}

impl From<ConfigPatch> for domain::ConfigPatch {
    fn from(p: ConfigPatch) -> Self {
        Self {
            title: p.title,
            instructions: p.instructions,
            rubric: p.rubric,
            allowed_mime_types: p.allowed_mime_types,
            max_files: p.max_files,
            max_file_size_mb: p.max_file_size_mb,
            due_at: p.due_at_unix,
            allow_late: p.allow_late,
            late_policy: p.late_policy.map(Into::into),
            max_attempts: p.max_attempts,
            grade_release_mode: p.grade_release_mode,
            settings: p.settings,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateFileSubmissionRequest {
    #[garde(skip)]
    pub chapter_id: ChapterId,
    #[garde(length(min = 1, max = 500))]
    pub title: String,
    #[garde(dive)]
    #[serde(flatten)]
    pub config: ConfigPatch,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FileSubmission {
    pub id: FileSubmissionId,
    pub activity_id: ActivityId,
    pub course_id: CourseId,
    pub chapter_id: ChapterId,
    pub title: String,
    pub instructions: String,
    pub lifecycle: FileSubmissionLifecycle,
    /// The backing activity is live.
    pub published: bool,
    pub allowed_mime_types: Vec<String>,
    pub max_files: i32,
    pub max_file_size_mb: Option<i32>,
    pub due_at_unix: Option<i64>,
    pub allow_late: bool,
    pub late_policy: LatePolicy,
    pub max_attempts: Option<i32>,
    pub grade_release_mode: GradeReleaseMode,
    #[schema(value_type = Object)]
    pub rubric: serde_json::Value,
    #[schema(value_type = Object)]
    pub settings: serde_json::Value,
    /// The caller's newest attempt (learners).
    pub current_attempt: Option<Attempt>,
    /// The caller's attempts, newest first (learners).
    pub attempts: Vec<Attempt>,
    pub published_at_unix: Option<i64>,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl From<domain::FileSubmission> for FileSubmission {
    fn from(s: domain::FileSubmission) -> Self {
        let attempts: Vec<Attempt> = s.attempts.into_iter().map(Into::into).collect();
        Self {
            id: s.row.id,
            activity_id: s.row.activity_id,
            course_id: s.row.course_id,
            chapter_id: s.chapter_id,
            title: s.title,
            instructions: s.row.instructions,
            lifecycle: s.row.lifecycle,
            published: s.published,
            allowed_mime_types: s.row.allowed_mime_types,
            max_files: s.row.max_files,
            max_file_size_mb: s.row.max_file_size_mb,
            due_at_unix: s.row.due_at,
            allow_late: s.row.allow_late,
            late_policy: s.late_policy.into(),
            max_attempts: s.row.max_attempts,
            grade_release_mode: s.row.grade_release_mode,
            rubric: s.row.rubric,
            settings: s.row.settings,
            current_attempt: attempts.first().map(|a| Attempt {
                id: a.id,
                status: a.status,
                attempt_number: a.attempt_number,
                files: a.files.clone(),
                is_late: a.is_late,
                late_penalty_pct: a.late_penalty_pct,
                final_score: a.final_score,
                feedback: a.feedback.clone(),
                rubric_scores: a.rubric_scores.clone(),
                version: a.version,
                started_at_unix: a.started_at_unix,
                submitted_at_unix: a.submitted_at_unix,
                graded_at_unix: a.graded_at_unix,
                created_at_unix: a.created_at_unix,
                updated_at_unix: a.updated_at_unix,
                user: a.user.clone(),
            }),
            attempts,
            published_at_unix: s.row.published_at,
            created_at_unix: s.row.created_at,
            updated_at_unix: s.row.updated_at,
        }
    }
}

/// One attempt. For its owner, `final_score`, `feedback` and
/// `rubric_scores` are `null` until the grade is published or the work
/// returned.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Attempt {
    pub id: FileAttemptId,
    pub status: FileAttemptStatus,
    pub attempt_number: i32,
    pub files: Vec<AttachedFile>,
    pub is_late: bool,
    pub late_penalty_pct: f64,
    pub final_score: Option<f64>,
    pub feedback: Option<String>,
    #[schema(value_type = Option<Object>)]
    pub rubric_scores: Option<serde_json::Value>,
    /// Optimistic lock — send back as `If-Match`.
    pub version: i64,
    pub started_at_unix: Option<i64>,
    pub submitted_at_unix: Option<i64>,
    pub graded_at_unix: Option<i64>,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
    /// Present on grader views.
    pub user: Option<UserSummary>,
}

impl From<domain::Attempt> for Attempt {
    fn from(a: domain::Attempt) -> Self {
        let visible = a.grade_visible;
        Self {
            id: a.row.id,
            status: a.row.status,
            attempt_number: a.row.attempt_number,
            files: a.files,
            is_late: a.row.is_late,
            late_penalty_pct: a.row.late_penalty_pct,
            final_score: visible.then_some(a.row.final_score).flatten(),
            feedback: visible.then_some(a.row.feedback),
            rubric_scores: visible.then_some(a.row.rubric_scores),
            version: a.row.version,
            started_at_unix: a.row.started_at,
            submitted_at_unix: a.row.submitted_at,
            graded_at_unix: visible.then_some(a.row.graded_at).flatten(),
            created_at_unix: a.row.created_at,
            updated_at_unix: a.row.updated_at,
            user: a.user,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct FileRefRequest {
    #[garde(skip)]
    pub upload_id: uuid::Uuid,
    #[garde(length(max = 255))]
    pub display_name: Option<String>,
}

/// The draft's complete file list (replaces what was attached before).
#[derive(Debug, Default, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DraftRequest {
    #[garde(dive)]
    #[serde(default)]
    pub files: Vec<FileRefRequest>,
}

#[derive(Debug, Default, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SubmitRequest {
    /// Replace the attached files before submitting.
    #[garde(dive)]
    #[serde(default)]
    pub files: Option<Vec<FileRefRequest>>,
}

#[derive(Debug, Clone, Copy, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum FileGradeAction {
    Save,
    Publish,
    Return,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct FileGradeRequest {
    #[garde(skip)]
    pub action: FileGradeAction,
    /// Required for save/publish; 0..=100.
    #[garde(range(min = 0.0, max = 100.0))]
    pub final_score: Option<f64>,
    #[garde(length(max = 10_000))]
    #[serde(default)]
    pub feedback: String,
    /// Omit to keep the stored rubric scores.
    #[garde(skip)]
    #[schema(value_type = Option<Object>)]
    pub rubric_scores: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, ToSchema, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
pub struct FileReviewQuery {
    pub status: Option<FileAttemptStatus>,
    /// Substring of the learner's username, display name or email.
    pub search: Option<String>,
    pub cursor: Option<FileAttemptId>,
    /// 1..=100 (default 25).
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FileReviewItem {
    pub id: FileAttemptId,
    pub user: UserSummary,
    pub status: FileAttemptStatus,
    pub attempt_number: i32,
    pub submitted_at_unix: Option<i64>,
    pub graded_at_unix: Option<i64>,
    pub is_late: bool,
    pub final_score: Option<f64>,
    pub version: i64,
    pub file_count: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FileReviewPage {
    pub items: Vec<FileReviewItem>,
    pub next_cursor: Option<FileAttemptId>,
}

impl From<domain::ReviewPage> for FileReviewPage {
    fn from(p: domain::ReviewPage) -> Self {
        Self {
            items: p
                .items
                .into_iter()
                .map(|i| FileReviewItem {
                    id: i.id,
                    user: i.user,
                    status: i.status,
                    attempt_number: i.attempt_number,
                    submitted_at_unix: i.submitted_at,
                    graded_at_unix: i.graded_at,
                    is_late: i.is_late,
                    final_score: i.final_score,
                    version: i.version,
                    file_count: i.file_count,
                })
                .collect(),
            next_cursor: p.next_cursor,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SignedDownload {
    pub file_id: FileAttemptFileId,
    pub url: String,
    pub expires_at_unix: i64,
    pub filename: String,
    pub content_type: String,
}
