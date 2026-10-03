//! The learner's "today" (S-09, `/home`): upcoming deadlines across the
//! enrolled courses, where to continue, recent results and announcements -
//! one read instead of a request per course.

use ab_core::assessments::{ActivityProgressState, TrailRunStatus};
use ab_core::id::{ActivityId, AssessmentId, CourseId, FileSubmissionId, UserId};
use ab_core::{Error, FieldError, Result};
use ab_db::work_queue::{DeadlineRow, RecentResultRow, RecentUpdateRow};
use serde::Serialize;
use sqlx::PgPool;
use utoipa::ToSchema;

use crate::identity::Actor;
use crate::progress::TrailService;

pub const DEFAULT_DAYS: i64 = 14;
pub const MAX_DAYS: i64 = 60;
/// How far back results and announcements count as recent.
const RECENT_SECS: i64 = 14 * 86_400;
const RECENT_LIMIT: i64 = 10;
const CONTINUE_LIMIT: usize = 3;
/// Reminders go out for work due within this window.
pub const REMIND_WITHIN_SECS: i64 = 86_400;

/// States in which the learner has nothing left to hand in.
#[must_use]
pub const fn handed_in(state: ActivityProgressState) -> bool {
    !matches!(
        state,
        ActivityProgressState::NotStarted
            | ActivityProgressState::InProgress
            | ActivityProgressState::Returned
    )
}

/// What a recent result is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ResultKind {
    GradePublished,
    SubmissionReturned,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AgendaDeadline {
    pub course_id: CourseId,
    pub course_name: String,
    pub activity_id: ActivityId,
    pub activity_name: String,
    /// `quiz`, `exam`, `code_challenge` or `file_submission`.
    pub activity_type: String,
    pub assessment_id: Option<AssessmentId>,
    pub file_submission_id: Option<FileSubmissionId>,
    /// The learner's effective due date (overrides applied).
    pub due_at_unix: i64,
    /// Late hand-ins close here (`cutoff` late policy); null otherwise.
    pub cutoff_at_unix: Option<i64>,
    pub state: ActivityProgressState,
}

/// Where to pick a course up.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ContinueLearning {
    pub course_id: CourseId,
    pub course_name: String,
    /// The first activity not done yet (course order).
    pub activity_id: ActivityId,
    pub activity_name: String,
    /// Null before the projection wrote the course's progress.
    pub progress_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RecentResult {
    pub kind: ResultKind,
    pub course_id: CourseId,
    pub course_name: String,
    pub activity_id: ActivityId,
    pub activity_name: String,
    /// The latest assessment submission, when the activity is one.
    pub submission_id: Option<ab_core::id::SubmissionId>,
    /// Released score (null for returned work).
    pub score: Option<f64>,
    pub at_unix: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AgendaCourseUpdate {
    pub update_id: ab_core::id::CourseUpdateId,
    pub course_id: CourseId,
    pub course_name: String,
    pub title: String,
    pub created_at_unix: i64,
}

/// `GET /me/agenda`.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Agenda {
    /// Due within the requested window, soonest first.
    pub deadlines: Vec<AgendaDeadline>,
    /// Up to three in-progress courses, most recently active first.
    pub continue_learning: Vec<ContinueLearning>,
    /// Grades released and work returned in the last 14 days, newest first.
    pub recent_results: Vec<RecentResult>,
    /// Announcements on enrolled courses in the last 14 days, newest first.
    pub course_updates: Vec<AgendaCourseUpdate>,
}

fn deadline(row: DeadlineRow) -> AgendaDeadline {
    AgendaDeadline {
        course_id: row.course_id,
        course_name: row.course_name,
        activity_id: row.activity_id,
        activity_name: row.activity_name,
        activity_type: row.activity_type,
        assessment_id: row.assessment_id,
        file_submission_id: row.file_submission_id,
        due_at_unix: row.due_at,
        cutoff_at_unix: row.cutoff_at,
        state: row.state,
    }
}

fn result(row: RecentResultRow) -> RecentResult {
    let returned = row.state == ActivityProgressState::Returned;
    RecentResult {
        kind: if returned {
            ResultKind::SubmissionReturned
        } else {
            ResultKind::GradePublished
        },
        course_id: row.course_id,
        course_name: row.course_name,
        activity_id: row.activity_id,
        activity_name: row.activity_name,
        submission_id: row.submission_id,
        score: if returned { None } else { row.score },
        at_unix: row.at,
    }
}

fn update(row: RecentUpdateRow) -> AgendaCourseUpdate {
    AgendaCourseUpdate {
        update_id: row.id,
        course_id: row.course_id,
        course_name: row.course_name,
        title: row.title,
        created_at_unix: row.created_at,
    }
}

#[derive(Clone)]
pub struct AgendaService {
    pool: PgPool,
    trail: TrailService,
}

impl AgendaService {
    #[must_use]
    pub const fn new(pool: PgPool, trail: TrailService) -> Self {
        Self { pool, trail }
    }

    /// The caller's agenda for the next `days` (1..=60).
    pub async fn agenda(&self, actor: &Actor, days: i64) -> Result<Agenda> {
        if actor.is_anonymous() {
            return Err(Error::unauthenticated());
        }
        if !(1..=MAX_DAYS).contains(&days) {
            return Err(Error::validation(vec![FieldError {
                field: "days".into(),
                code: "out-of-range".into(),
                message: format!("days must be between 1 and {MAX_DAYS}"),
            }]));
        }
        let now = jiff::Timestamp::now().as_second();
        let deadlines = ab_db::work_queue::upcoming_deadlines(
            &self.pool,
            Some(actor.user_id),
            now,
            now + days * 86_400,
        )
        .await?;
        let results = ab_db::work_queue::recent_results(
            &self.pool,
            actor.user_id,
            now - RECENT_SECS,
            RECENT_LIMIT,
        )
        .await?;
        let updates = ab_db::work_queue::recent_course_updates(
            &self.pool,
            actor.user_id,
            now - RECENT_SECS,
            RECENT_LIMIT,
        )
        .await?;
        Ok(Agenda {
            deadlines: deadlines.into_iter().map(deadline).collect(),
            continue_learning: self.continue_learning(actor).await?,
            recent_results: results.into_iter().map(result).collect(),
            course_updates: updates.into_iter().map(update).collect(),
        })
    }

    /// In-progress trail runs with a next activity, most recently touched
    /// first (the trail decides visibility and the next activity).
    async fn continue_learning(&self, actor: &Actor) -> Result<Vec<ContinueLearning>> {
        let mut runs: Vec<_> = self
            .trail
            .get(actor)
            .await?
            .runs
            .into_iter()
            .filter(|r| r.row.status == TrailRunStatus::InProgress)
            .filter_map(|r| r.next_activity_id.map(|next| (r, next)))
            .collect();
        runs.sort_by_key(|(r, _)| std::cmp::Reverse(r.row.updated_at));
        let mut out = Vec::new();
        for (run, next) in runs.into_iter().take(CONTINUE_LIMIT) {
            let Some((_, _, activity_name)) =
                ab_db::notifications::activity_names(&self.pool, next).await?
            else {
                continue;
            };
            out.push(ContinueLearning {
                course_id: run.course.id,
                course_name: run.course.name.clone(),
                activity_id: next,
                activity_name,
                progress_pct: run.progress_pct,
            });
        }
        Ok(out)
    }
}

/// The worker's deadline reminder pass.
///
/// One `deadline_approaching` notification per (learner, activity, due
/// date) for work not handed in and due within a day. Idempotent (the due date is in the dedup key, so an extension
/// reminds again for the new date). Returns how many were considered.
pub async fn remind_deadlines(pool: &PgPool) -> Result<usize> {
    let now = jiff::Timestamp::now().as_second();
    let rows =
        ab_db::work_queue::upcoming_deadlines(pool, None, now, now + REMIND_WITHIN_SECS).await?;
    let mut considered = 0;
    for row in rows.into_iter().filter(|r| !handed_in(r.state)) {
        considered += 1;
        let key = format!("deadline_approaching:{}:{}", row.activity_id, row.due_at);
        let user: UserId = row.user_id;
        crate::notifications::notify(
            pool,
            &[user],
            &crate::notifications::NotificationPayload::DeadlineApproaching {
                course_id: row.course_id,
                course_name: row.course_name,
                activity_id: row.activity_id,
                activity_name: row.activity_name,
                due_at_unix: row.due_at,
            },
            Some(&key),
        )
        .await;
    }
    Ok(considered)
}
