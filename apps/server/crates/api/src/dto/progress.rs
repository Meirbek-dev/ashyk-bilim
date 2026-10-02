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
    /// The learner's course progress percent, the value `learner-state`'s
    /// `progress.progress_pct` reports; `null` until the progress
    /// projection has a row for the course (UX-250).
    pub progress_pct: Option<f64>,
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
        }
    }
}

impl TrailRun {
    fn for_actor(r: domain::TrailRun, actor: &ab_domain::identity::Actor) -> Self {
        let editable = ab_domain::catalog::CurriculumService::editable(actor, &r.course);
        Self {
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
