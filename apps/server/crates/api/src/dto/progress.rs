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
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TrailRun {
    pub id: TrailRunId,
    pub course_id: CourseId,
    pub status: TrailRunStatus,
    pub course: Course,
    /// Published activities in the course.
    pub course_total_steps: i64,
    pub steps: Vec<TrailStep>,
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

impl From<domain::Trail> for Trail {
    fn from(t: domain::Trail) -> Self {
        Self {
            id: t.row.as_ref().map(|r| r.id),
            user_id: t.user_id,
            created_at_unix: t.row.as_ref().map(|r| r.created_at),
            updated_at_unix: t.row.as_ref().map(|r| r.updated_at),
            runs: t.runs.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<domain::TrailRun> for TrailRun {
    fn from(r: domain::TrailRun) -> Self {
        Self {
            id: r.row.id,
            course_id: r.row.course_id,
            status: r.row.status,
            course: r.course.into(),
            course_total_steps: r.course_total_steps,
            steps: r.steps.into_iter().map(Into::into).collect(),
            created_at_unix: r.row.created_at,
            updated_at_unix: r.row.updated_at,
        }
    }
}

impl From<domain::TrailStep> for TrailStep {
    fn from(s: domain::TrailStep) -> Self {
        Self {
            id: s.row.id,
            activity_id: s.row.activity_id,
            course_id: s.row.course_id,
            complete: s.row.complete,
            teacher_verified: s.row.teacher_verified,
            grade: s.row.grade,
            activity: s.activity.into(),
            created_at_unix: s.row.created_at,
            updated_at_unix: s.row.updated_at,
        }
    }
}
