//! The personal trail (legacy `services/trail/trail.py`).
//!
//! One trail per user, one run per course, one step per activity the
//! learner marked done. Adding an activity step also records an explicit
//! completion in the canonical projection for lesson-type activities;
//! assessment and file-submission activities are projected by their own
//! pipelines and the step is UX-only there.

use ab_core::id::{ActivityId, CourseId, UserId};
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, Result};
use ab_db::catalog::ActivityRow;
use ab_db::progress::{TrailRow, TrailRunRow, TrailStepRow};
use sqlx::PgPool;

use crate::assessments::service::AssessmentsService;
use crate::catalog::courses::{Course, CoursesService};
use crate::identity::Actor;
use crate::progress::ProgressProjector;

/// The trail hydrated with courses and activities.
#[derive(Debug, Clone)]
pub struct Trail {
    /// `None` until the learner adds something (nothing is stored on read).
    pub row: Option<TrailRow>,
    pub user_id: UserId,
    pub runs: Vec<TrailRun>,
}

#[derive(Debug, Clone)]
pub struct TrailRun {
    pub row: TrailRunRow,
    pub course: Course,
    /// Published activities in the course.
    pub course_total_steps: i64,
    pub steps: Vec<TrailStep>,
}

#[derive(Debug, Clone)]
pub struct TrailStep {
    pub row: TrailStepRow,
    pub activity: ActivityRow,
}

#[derive(Clone)]
pub struct TrailService {
    pool: PgPool,
    courses: CoursesService,
    assessments: AssessmentsService,
    projector: ProgressProjector,
}

const fn trail_perm(action: Action, scope: Scope) -> Permission {
    Permission {
        resource: ResourceType::Trail,
        action,
        scope: Some(scope),
    }
}

/// A 404 from the course behind an activity reads as the activity's own
/// 404: the detail must not tell an unknown id from an invisible course.
fn activity_not_found(err: Error) -> Error {
    if err.code() == ab_core::ErrorCode::NotFound {
        Error::not_found("activity")
    } else {
        err
    }
}

impl TrailService {
    #[must_use]
    pub fn new(pool: PgPool, courses: CoursesService, assessments: AssessmentsService) -> Self {
        Self {
            projector: ProgressProjector::new(pool.clone()),
            pool,
            courses,
            assessments,
        }
    }

    /// Anyone signed in may keep a trail; the legacy granted learners
    /// `trail:submit:assigned` and instructors `trail:update:own`.
    fn require_write(actor: &Actor) -> Result<()> {
        if actor.is_anonymous() {
            return Err(Error::forbidden("sign in to use your trail"));
        }
        let allowed = actor.has(trail_perm(Action::Submit, Scope::Assigned))
            || actor.has(trail_perm(Action::Update, Scope::Own))
            || actor.has(trail_perm(Action::Create, Scope::Own));
        if allowed {
            Ok(())
        } else {
            Err(Error::forbidden("missing permission trail:submit"))
        }
    }

    /// The caller's trail; empty (and unstored) for anonymous callers or
    /// learners who never added anything.
    pub async fn get(&self, actor: &Actor) -> Result<Trail> {
        if actor.is_anonymous() {
            return Ok(Trail {
                row: None,
                user_id: actor.user_id,
                runs: Vec::new(),
            });
        }
        match ab_db::progress::get_trail(&self.pool, actor.user_id).await? {
            Some(trail) => self.hydrate(actor, trail).await,
            None => Ok(Trail {
                row: None,
                user_id: actor.user_id,
                runs: Vec::new(),
            }),
        }
    }

    /// Runs whose course the caller can no longer see (unpublished under
    /// them, BUG-183) are kept but not listed: they come back on republish
    /// and `remove_course` still drops them by id.
    async fn hydrate(&self, actor: &Actor, trail: TrailRow) -> Result<Trail> {
        let runs = ab_db::progress::list_trail_runs(&self.pool, trail.id).await?;
        let steps = ab_db::progress::list_trail_steps(&self.pool, trail.id).await?;
        let course_ids: Vec<CourseId> = runs.iter().map(|r| r.course_id).collect();
        let totals = ab_db::progress::published_activity_counts(&self.pool, &course_ids).await?;
        let mut out = Vec::with_capacity(runs.len());
        for run in runs {
            let Some(course) = ab_db::catalog::get_course(&self.pool, run.course_id).await? else {
                continue;
            };
            if self.courses.require_read(actor, &course).await.is_err() {
                continue;
            }
            let activities = ab_db::catalog::list_activities(&self.pool, run.course_id).await?;
            let run_steps = steps
                .iter()
                .filter(|s| s.trail_run_id == run.id)
                .filter_map(|s| {
                    activities
                        .iter()
                        .find(|a| a.id == s.activity_id)
                        .map(|a| TrailStep {
                            row: s.clone(),
                            activity: a.clone(),
                        })
                })
                .collect();
            out.push(TrailRun {
                course_total_steps: totals
                    .iter()
                    .find(|t| t.course_id == run.course_id)
                    .map_or(0, |t| t.total),
                steps: run_steps,
                row: run,
                course,
            });
        }
        Ok(Trail {
            user_id: trail.user_id,
            row: Some(trail),
            runs: out,
        })
    }

    /// Visible course (404) the learner may access (403).
    async fn accessible_course(&self, actor: &Actor, course_id: CourseId) -> Result<Course> {
        let course = self.courses.get(actor, course_id).await?;
        if !self
            .assessments
            .user_has_course_access(&course, actor.user_id)
            .await?
        {
            return Err(Error::forbidden("no access to this course"));
        }
        Ok(course)
    }

    /// Start (or keep) a run for the course.
    pub async fn add_course(&self, actor: &Actor, course_id: CourseId) -> Result<Trail> {
        Self::require_write(actor)?;
        let course = self.accessible_course(actor, course_id).await?;
        let trail = ab_db::progress::ensure_trail(&self.pool, actor.user_id).await?;
        ab_db::progress::ensure_trail_run(&self.pool, trail.id, course.id, actor.user_id).await?;
        self.hydrate(actor, trail).await
    }

    /// Drop the run and every step in it, and reset the explicit lesson
    /// completions those steps stood for (legacy `remove_course_from_trail`
    /// deleted the `TrailStep`s). Assessment and file-submission rows are
    /// pipeline-owned and stay — the submissions still exist.
    ///
    /// The run is the caller's own, so no course visibility check: a learner
    /// can always leave a course that was unpublished under them (BUG-183).
    /// No run (unknown, invisible or never joined course) → 404, which
    /// tells the caller nothing about the course itself.
    pub async fn remove_course(&self, actor: &Actor, course_id: CourseId) -> Result<Trail> {
        Self::require_write(actor)?;
        let trail = ab_db::progress::get_trail(&self.pool, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("trail"))?;
        if !ab_db::progress::delete_trail_run(&self.pool, trail.id, course_id).await? {
            return Err(Error::not_found("trail run"));
        }
        for activity in ab_db::catalog::list_activities(&self.pool, course_id).await? {
            self.projector
                .unmark_complete(&activity, actor.user_id)
                .await?;
        }
        self.hydrate(actor, trail).await
    }

    /// Mark an activity done: run + step, and an explicit completion for
    /// lesson-type activities. Drafts do not exist for learners (404): a
    /// step on one would become a required row the course never counts.
    /// Pipeline-owned activities (quiz/exam/code/file submission) complete
    /// through their submissions only — a step here would fire the XP hook
    /// while the projection stays untouched (BUG-176) → 409.
    pub async fn add_activity(&self, actor: &Actor, activity_id: ActivityId) -> Result<Trail> {
        Self::require_write(actor)?;
        let activity = ab_db::catalog::get_activity(&self.pool, activity_id)
            .await?
            .filter(|a| a.published)
            .ok_or_else(|| Error::not_found("activity"))?;
        let course = self
            .accessible_course(actor, activity.course_id)
            .await
            .map_err(activity_not_found)?;
        if self.projector.is_pipeline_owned(&activity).await? {
            return Err(Error::conflict(
                "activity is completed through its submissions, not marked by hand",
            ));
        }
        let trail = ab_db::progress::ensure_trail(&self.pool, actor.user_id).await?;
        let run = ab_db::progress::ensure_trail_run(&self.pool, trail.id, course.id, actor.user_id)
            .await?;
        let created = ab_db::progress::insert_trail_step(&self.pool, &run, activity.id).await?;
        if created {
            self.projector
                .mark_complete(&activity, actor.user_id)
                .await?;
            crate::gamification::hooks::activity_completed(&self.pool, actor.user_id, activity.id)
                .await;
        }
        self.hydrate(actor, trail).await
    }

    /// Un-mark an activity. Deleting the caller's own step needs no
    /// visibility check; with nothing to delete the course must be visible
    /// (404 otherwise) so the reply is not an existence oracle (BUG-183).
    /// Every 404 here reads `activity not found` — the detail is not an
    /// oracle for the course or the trail either (UX-131).
    pub async fn remove_activity(&self, actor: &Actor, activity_id: ActivityId) -> Result<Trail> {
        Self::require_write(actor)?;
        let activity = ab_db::catalog::get_activity(&self.pool, activity_id)
            .await?
            .ok_or_else(|| Error::not_found("activity"))?;
        let trail = ab_db::progress::get_trail(&self.pool, actor.user_id)
            .await?
            .ok_or_else(|| Error::not_found("activity"))?;
        if ab_db::progress::delete_trail_step(&self.pool, trail.id, activity.id).await? {
            self.projector
                .unmark_complete(&activity, actor.user_id)
                .await?;
        } else {
            self.courses
                .get(actor, activity.course_id)
                .await
                .map_err(activity_not_found)?;
        }
        self.hydrate(actor, trail).await
    }
}
