//! The learner-facing course state (legacy `services/learner_course_state.py`).
//!
//! A read-only assembly of the outline, canonical progress and the single
//! "next action" the client should surface. Certificates arrive with P6.3;
//! until then the block reports `configured: false`.

use ab_core::assessments::ActivityProgressState;
use ab_core::id::{ActivityId, ChapterId, CourseId, UserId};
use ab_core::{Error, Result};
use ab_db::progress::{ActivityProgressRow, CourseProgressRow};
use serde::Serialize;
use sqlx::PgPool;
use utoipa::ToSchema;

use crate::assessments::service::AssessmentsService;
use crate::catalog::courses::CoursesService;
use crate::identity::Actor;

const DUE_SOON_WINDOW_SECS: i64 = 7 * 86_400;

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// Product-level work state shown to the learner.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum WorkState {
    NotStarted,
    InProgress,
    Submitted,
    NeedsGrading,
    GradedHidden,
    Returned,
    Passed,
    Failed,
    Complete,
    Locked,
}

impl WorkState {
    const fn from_progress(state: Option<ActivityProgressState>) -> Self {
        match state {
            None | Some(ActivityProgressState::NotStarted) => Self::NotStarted,
            Some(ActivityProgressState::InProgress) => Self::InProgress,
            Some(ActivityProgressState::Submitted) => Self::Submitted,
            Some(ActivityProgressState::NeedsGrading) => Self::NeedsGrading,
            Some(ActivityProgressState::Returned) => Self::Returned,
            Some(ActivityProgressState::Graded) => Self::GradedHidden,
            Some(ActivityProgressState::Passed) => Self::Passed,
            Some(ActivityProgressState::Failed) => Self::Failed,
            Some(ActivityProgressState::Completed) => Self::Complete,
        }
    }

    const fn awaiting_grade(self) -> bool {
        matches!(
            self,
            Self::Submitted | Self::NeedsGrading | Self::GradedHidden
        )
    }

    fn allowed_actions(self) -> Vec<&'static str> {
        match self {
            Self::Returned => vec!["revise", "view_feedback"],
            Self::Submitted | Self::NeedsGrading | Self::GradedHidden => vec!["view_receipt"],
            Self::Passed | Self::Failed | Self::Complete => vec!["view_feedback"],
            Self::InProgress => vec!["continue"],
            Self::NotStarted | Self::Locked => vec!["start"],
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ActionId {
    Enroll,
    Start,
    Continue,
    Revise,
    ViewFeedback,
    WaitForGrade,
    ViewCertificate,
    ReviewCompletion,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum EnrollmentState {
    NotEnrolled,
    InProgress,
    Completed,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct NextAction {
    pub id: ActionId,
    pub label: String,
    pub reason: String,
    pub enabled: bool,
    pub activity_id: Option<ActivityId>,
    pub href: Option<String>,
}

// The legacy wire contract: flags, not a state machine.
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ActivityState {
    pub id: ActivityId,
    pub title: String,
    pub activity_type: String,
    pub required: bool,
    pub state: WorkState,
    pub complete: bool,
    pub score: Option<f64>,
    pub passed: Option<bool>,
    pub due_at_unix: Option<i64>,
    pub is_late: bool,
    pub available: bool,
    pub blocked_reason: Option<String>,
    pub allowed_actions: Vec<&'static str>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ChapterState {
    pub id: ChapterId,
    pub title: String,
    /// 0-based position among chapters that have published activities.
    pub index: usize,
    pub activities: Vec<ActivityState>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ProgressState {
    pub completed_required_count: i32,
    pub total_required_count: i32,
    pub missing_required_count: i32,
    pub needs_grading_count: i32,
    pub progress_pct: f64,
    pub grade_average: Option<f64>,
    pub completed_at_unix: Option<i64>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct CertificateState {
    pub configured: bool,
    pub eligible: bool,
    pub issued: bool,
    pub user_certification_id: Option<uuid::Uuid>,
    pub href: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct CoursePermissions {
    pub can_discover: bool,
    pub can_access: bool,
    pub can_enroll: bool,
    pub denial_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct LearnerCourseState {
    pub course_id: CourseId,
    pub title: String,
    pub public: bool,
    pub enrolled: bool,
    pub enrollment_state: EnrollmentState,
    pub permissions: CoursePermissions,
    pub progress: ProgressState,
    pub certificate: CertificateState,
    pub next_action: NextAction,
    pub outline: Vec<ChapterState>,
}

#[derive(Clone)]
pub struct LearnerStateService {
    pool: PgPool,
    courses: CoursesService,
    assessments: AssessmentsService,
}

impl LearnerStateService {
    #[must_use]
    pub const fn new(
        pool: PgPool,
        courses: CoursesService,
        assessments: AssessmentsService,
    ) -> Self {
        Self {
            pool,
            courses,
            assessments,
        }
    }

    /// Visible course (404) the caller may access (403).
    pub async fn course_state(
        &self,
        actor: &Actor,
        course_id: CourseId,
    ) -> Result<LearnerCourseState> {
        let course = self.courses.get(actor, course_id).await?;
        if !self
            .assessments
            .user_has_course_access(&course, actor.user_id)
            .await?
        {
            return Err(Error::forbidden("no access to this course"));
        }
        let user_id: UserId = actor.user_id;
        let chapters = ab_db::catalog::list_chapters(&self.pool, course.id).await?;
        let activities = ab_db::catalog::list_activities(&self.pool, course.id).await?;
        let rows =
            ab_db::progress::list_course_progress_rows(&self.pool, course.id, user_id).await?;
        let course_progress =
            ab_db::progress::get_course_progress(&self.pool, course.id, user_id).await?;
        let has_run = ab_db::progress::has_trail_run(&self.pool, course.id, user_id).await?;
        let enrolled = has_run || course_progress.is_some() || !rows.is_empty();

        let states: Vec<(ChapterId, ActivityState)> = activities
            .iter()
            .filter(|a| a.published)
            .map(|a| {
                let progress = rows.iter().find(|r| r.activity_id == a.id);
                (a.chapter_id, activity_state(a, progress))
            })
            .collect();
        let mut outline = Vec::new();
        for chapter in &chapters {
            let acts: Vec<ActivityState> = states
                .iter()
                .filter(|(c, _)| *c == chapter.id)
                .map(|(_, s)| s.clone())
                .collect();
            if acts.is_empty() {
                continue;
            }
            outline.push(ChapterState {
                id: chapter.id,
                title: chapter.name.clone(),
                index: outline.len(),
                activities: acts,
            });
        }
        let flat: Vec<&ActivityState> = states.iter().map(|(_, s)| s).collect();
        let progress = progress_state(course_progress.as_ref(), &flat);
        let certificate = CertificateState {
            configured: false,
            eligible: progress.progress_pct >= 100.0,
            issued: false,
            user_certification_id: None,
            href: None,
        };
        let next_action = next_action(enrolled, course.id, &flat, &certificate, &progress);
        let enrollment_state = if progress.progress_pct >= 100.0 {
            EnrollmentState::Completed
        } else if enrolled {
            EnrollmentState::InProgress
        } else {
            EnrollmentState::NotEnrolled
        };
        Ok(LearnerCourseState {
            course_id: course.id,
            title: course.name,
            public: course.public,
            enrolled,
            enrollment_state,
            permissions: CoursePermissions {
                can_discover: course.public,
                can_access: true,
                can_enroll: !enrolled,
                denial_reason: None,
            },
            progress,
            certificate,
            next_action,
            outline,
        })
    }
}

fn activity_state(
    activity: &ab_db::catalog::ActivityRow,
    progress: Option<&ActivityProgressRow>,
) -> ActivityState {
    let state = WorkState::from_progress(progress.map(|p| p.state));
    ActivityState {
        id: activity.id,
        title: activity.name.clone(),
        activity_type: activity.activity_type.clone(),
        required: progress.is_none_or(|p| p.required),
        state,
        complete: progress.is_some_and(|p| {
            matches!(
                p.state,
                ActivityProgressState::Passed | ActivityProgressState::Completed
            )
        }),
        score: progress.and_then(|p| p.score),
        passed: progress.and_then(|p| p.passed),
        due_at_unix: progress.and_then(|p| p.due_at),
        is_late: progress.is_some_and(|p| p.is_late),
        available: true,
        blocked_reason: None,
        allowed_actions: state.allowed_actions(),
    }
}

fn progress_state(
    persisted: Option<&CourseProgressRow>,
    activities: &[&ActivityState],
) -> ProgressState {
    if let Some(p) = persisted {
        return ProgressState {
            completed_required_count: p.completed_required_count,
            total_required_count: p.total_required_count,
            missing_required_count: p.missing_required_count,
            needs_grading_count: p.needs_grading_count,
            progress_pct: p.progress_pct,
            grade_average: p.weighted_grade_average.or(p.grade_average),
            completed_at_unix: p.completed_at,
        };
    }
    let required: Vec<&&ActivityState> = activities.iter().filter(|a| a.required).collect();
    let total = required.len();
    let completed = required.iter().filter(|a| a.complete).count();
    let count = |n: usize| i32::try_from(n).unwrap_or(i32::MAX);
    #[allow(clippy::cast_precision_loss)]
    let pct = if total == 0 {
        0.0
    } else {
        (completed as f64 / total as f64 * 10_000.0).round() / 100.0
    };
    ProgressState {
        completed_required_count: count(completed),
        total_required_count: count(total),
        missing_required_count: count(total.saturating_sub(completed)),
        needs_grading_count: count(
            activities
                .iter()
                .filter(|a| a.state == WorkState::NeedsGrading)
                .count(),
        ),
        progress_pct: pct,
        grade_average: None,
        completed_at_unix: None,
    }
}

fn activity_action(
    id: ActionId,
    label: &str,
    reason: &str,
    activity: &ActivityState,
    course_id: CourseId,
) -> NextAction {
    NextAction {
        id,
        label: label.to_owned(),
        reason: reason.to_owned(),
        enabled: true,
        activity_id: Some(activity.id),
        href: Some(format!("/course/{course_id}/activity/{}", activity.id)),
    }
}

/// Legacy `_next_action`, in priority order.
fn next_action(
    enrolled: bool,
    course_id: CourseId,
    activities: &[&ActivityState],
    certificate: &CertificateState,
    progress: &ProgressState,
) -> NextAction {
    if !enrolled {
        return NextAction {
            id: ActionId::Enroll,
            label: "Start course".to_owned(),
            reason: "not_enrolled".to_owned(),
            enabled: true,
            activity_id: None,
            href: Some(format!("/course/{course_id}")),
        };
    }
    if let Some(a) = activities.iter().find(|a| a.state == WorkState::Returned) {
        return activity_action(
            ActionId::Revise,
            "Revise returned work",
            "returned_for_revision",
            a,
            course_id,
        );
    }
    let now = now_unix();
    if let Some(a) = activities
        .iter()
        .find(|a| a.due_at_unix.is_some_and(|d| d < now) && !a.complete && a.available)
    {
        return activity_action(
            ActionId::Continue,
            "Complete overdue work",
            "overdue",
            a,
            course_id,
        );
    }
    if let Some(a) = activities.iter().find(|a| a.state == WorkState::InProgress) {
        return activity_action(
            ActionId::Continue,
            "Continue activity",
            "in_progress",
            a,
            course_id,
        );
    }
    if let Some(a) = activities.iter().find(|a| {
        a.required
            && !a.complete
            && a.due_at_unix
                .is_some_and(|d| d >= now && d <= now + DUE_SOON_WINDOW_SECS)
    }) {
        return activity_action(ActionId::Start, "Start due work", "due_soon", a, course_id);
    }
    if let Some(a) = activities
        .iter()
        .find(|a| a.required && !a.complete && !a.state.awaiting_grade())
    {
        return activity_action(
            ActionId::Start,
            "Continue course",
            "next_required",
            a,
            course_id,
        );
    }
    fallback_action(course_id, activities, certificate, progress)
}

/// After every required activity is done or waiting: certificate, review,
/// wait, optional work, or nothing.
fn fallback_action(
    course_id: CourseId,
    activities: &[&ActivityState],
    certificate: &CertificateState,
    progress: &ProgressState,
) -> NextAction {
    if certificate.issued
        && let Some(href) = &certificate.href
    {
        return NextAction {
            id: ActionId::ViewCertificate,
            label: "View certificate".to_owned(),
            reason: "certificate_issued".to_owned(),
            enabled: true,
            activity_id: None,
            href: Some(href.clone()),
        };
    }
    if progress.progress_pct >= 100.0 {
        return NextAction {
            id: ActionId::ReviewCompletion,
            label: "Review course completion".to_owned(),
            reason: "course_complete".to_owned(),
            enabled: true,
            activity_id: None,
            href: Some(format!("/course/{course_id}")),
        };
    }
    if activities.iter().any(|a| a.state.awaiting_grade()) {
        return NextAction {
            id: ActionId::WaitForGrade,
            label: "Waiting for feedback".to_owned(),
            reason: "waiting_for_grade".to_owned(),
            enabled: false,
            activity_id: None,
            href: None,
        };
    }
    if let Some(a) = activities.iter().find(|a| !a.required && !a.complete) {
        return activity_action(
            ActionId::Start,
            "Start optional activity",
            "optional",
            a,
            course_id,
        );
    }
    NextAction {
        id: ActionId::None,
        label: "No action available".to_owned(),
        reason: "no_available_action".to_owned(),
        enabled: false,
        activity_id: None,
        href: None,
    }
}
