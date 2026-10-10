//! Trail + learner course state DTOs.

use ab_core::assessments::TrailRunStatus;
use ab_core::id::{ActivityId, CourseId, TrailId, TrailRunId, TrailStepId, UserId};
use ab_domain::progress::trail as domain;
use serde::Serialize;
use utoipa::ToSchema;

use crate::dto::courses::Course;
use crate::dto::curriculum::Activity;
pub use ab_domain::progress::learner_state::{
    ActionId, ActivityState, CertificateState, ChapterState, CoursePermissions, EnrollmentState,
    LearnerCourseState, NextAction, ProgressState, WorkState,
};

/// The caller's trail. `id` is `null` until something was added.
#[derive(Debug, Serialize, ToSchema)]
pub struct Trail {
    pub id: Option<TrailId>,
    pub user_id: UserId,
    pub runs: Vec<TrailRun>,
    pub created_at_unix: Option<i64>,
    pub updated_at_unix: Option<i64>,
    /// With `limit`/`cursor` on `GET /trail`: pass back as `cursor` for the
    /// next runs; `null` on the last page and without paging.
    pub next_cursor: Option<String>,
    /// On a trail write sent with `Prefer: return=representation`: the
    /// learner state of the course written to (no re-read needed);
    /// `null` otherwise.
    pub learner_state: Option<LearnerCourseState>,
}

/// Where the learner stands in one course.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum LearningStatus {
    NotStarted,
    InProgress,
    Completed,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TrailRun {
    pub id: TrailRunId,
    pub course_id: CourseId,
    pub status: TrailRunStatus,
    pub course: Course,
    /// Published activities in the course.
    pub course_total_steps: i64,
    /// The learner's course progress percent, the value `learner-state`'s
    /// `progress.progress_pct` reports; `null` until the progress
    /// projection has a row for the course (UX-250).
    pub progress_pct: Option<f64>,
    pub steps: Vec<TrailStep>,
    /// The real state (`status` is always `in_progress`, legacy):
    /// `completed` at 100 %, `not_started` with no progress and no steps.
    pub learning_status: LearningStatus,
    /// The first published activity (course order) not done yet and not
    /// waiting on a grade - the "continue" target; `null` when none is left.
    pub next_activity_id: Option<ActivityId>,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TrailStep {
    pub id: TrailStepId,
    pub activity_id: ActivityId,
    pub course_id: CourseId,
    pub complete: bool,
    pub teacher_verified: bool,
    pub grade: i32,
    pub activity: Activity,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl Trail {
    pub fn for_actor(t: domain::Trail, actor: &ab_domain::identity::Actor) -> Self {
        Self {
            id: t.row.as_ref().map(|r| r.id),
            user_id: t.user_id,
            created_at_unix: t.row.as_ref().map(|r| r.created_at),
            updated_at_unix: t.row.as_ref().map(|r| r.updated_at),
            runs: t
                .runs
                .into_iter()
                .map(|r| TrailRun::for_actor(r, actor))
                .collect(),
            next_cursor: None,
            learner_state: None,
        }
    }
}

impl TrailRun {
    fn for_actor(r: domain::TrailRun, actor: &ab_domain::identity::Actor) -> Self {
        let editable = ab_domain::catalog::CurriculumService::editable(actor, &r.course);
        let pct = r.progress_pct.unwrap_or(0.0);
        let learning_status = if pct >= 100.0 {
            LearningStatus::Completed
        } else if pct > 0.0 || !r.steps.is_empty() {
            LearningStatus::InProgress
        } else {
            LearningStatus::NotStarted
        };
        Self {
            learning_status,
            next_activity_id: r.next_activity_id,
            id: r.row.id,
            course_id: r.row.course_id,
            status: r.row.status,
            course: Course::for_actor(r.course, actor),
            course_total_steps: r.course_total_steps,
            progress_pct: r.progress_pct,
            steps: r
                .steps
                .into_iter()
                .map(|s| TrailStep::new(s, editable))
                .collect(),
            created_at_unix: r.row.created_at,
            updated_at_unix: r.row.updated_at,
        }
    }
}

impl TrailStep {
    fn new(s: domain::TrailStep, editable: bool) -> Self {
        Self {
            id: s.row.id,
            activity_id: s.row.activity_id,
            course_id: s.row.course_id,
            complete: s.row.complete,
            teacher_verified: s.row.teacher_verified,
            grade: s.row.grade,
            activity: Activity::new(s.activity, editable),
            created_at_unix: s.row.created_at,
            updated_at_unix: s.row.updated_at,
        }
    }
}

/// One member of a course with their progress (`GET /courses/{id}/learners`).
#[derive(Debug, Serialize, ToSchema)]
pub struct CourseLearner {
    pub user_id: UserId,
    pub username: String,
    pub display_name: String,
    pub email: String,
    pub avatar_key: Option<String>,
    /// `null` until the progress projection has a row.
    pub progress_pct: Option<f64>,
    pub completed_at_unix: Option<i64>,
    pub last_activity_at_unix: Option<i64>,
    pub enrolled_at_unix: i64,
    /// What the caller may do to this membership now.
    pub allowed_actions: Vec<CourseLearnerAction>,
}

/// `CourseLearner.allowed_actions`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CourseLearnerAction {
    /// `DELETE /courses/{id}/learners/{user_id}` (roster managers, open course).
    Remove,
}

/// Keyset page of a course's members (newest first).
#[derive(Debug, Serialize, ToSchema)]
pub struct CourseLearnerPage {
    pub items: Vec<CourseLearner>,
    pub next_cursor: Option<String>,
}

/// `GET /courses/{id}/learners`: keyset paging plus a search.
#[derive(Debug, serde::Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
#[serde(deny_unknown_fields)]
pub struct CourseLearnersQuery {
    /// `next_cursor` of the previous page.
    pub cursor: Option<String>,
    /// 1..=100 (default 20).
    pub limit: Option<i64>,
    /// Substring of the learner's username, display name or email.
    pub q: Option<String>,
}

/// Enrol existing users by email or username (`POST /courses/{id}/learners`).
#[derive(Debug, serde::Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct EnrollLearnersRequest {
    /// Emails or usernames (case-insensitive), 1..=1000; one outcome each.
    #[garde(length(min = 1, max = 1000), inner(length(chars, min = 1, max = 320)))]
    #[schema(min_items = 1, max_items = 1000)]
    pub identifiers: Vec<String>,
    /// Report the outcomes without enrolling anyone (CSV preview).
    #[garde(skip)]
    #[serde(default)]
    pub dry_run: bool,
}

/// One identifier of an [`EnrollLearnersRequest`].
#[derive(Debug, Serialize, ToSchema)]
pub struct EnrollLearnerResult {
    /// As sent, trimmed.
    pub identifier: String,
    pub outcome: domain::EnrollOutcome,
    /// The matched account; `null` for `not_found`.
    pub user: Option<crate::dto::file_submissions::UserSummary>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct EnrollLearnersResponse {
    pub dry_run: bool,
    /// In request order.
    pub results: Vec<EnrollLearnerResult>,
}

impl EnrollLearnerResult {
    #[must_use]
    pub fn new(r: domain::EnrolResult) -> Self {
        Self {
            identifier: r.identifier,
            outcome: r.outcome,
            user: r.user.map(|u| crate::dto::file_submissions::UserSummary {
                id: u.user_id,
                username: u.username,
                display_name: u.display_name,
                email: u.email,
            }),
        }
    }
}
