//! The submission-to-progress projection (legacy `services/progress`).
//!
//! Idempotent: every write path calls it after the fact, and the backfill
//! rebuilds `activity_progress` / `course_progress` from current submission
//! state. Assessment-backed activities project from `submissions`,
//! file-submission activities from their attempts, everything else from
//! explicit completions (trail steps).

use ab_core::assessments::{
    ActivityProgressState, CompletionRule, FileAttemptStatus, SubmissionStatus,
};
use ab_core::id::{ActivityId, AssessmentId, CourseId, FileSubmissionId, UserId};
use ab_core::{Error, Result};
use ab_db::assessments::AssessmentRow;
use ab_db::catalog::ActivityRow;
use ab_db::file_submissions::AttemptRow;
use ab_db::progress::{
    ActivityProgressRow, ActivityProgressWrite, CourseProgressRow, CourseProgressWrite,
};
use ab_db::submissions::SubmissionRow;
use sqlx::{PgConnection, PgPool};

/// Default passing score for file submissions (legacy hard-coded 60).
const FILE_SUBMISSION_PASSING_SCORE: f64 = 60.0;

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BackfillReport {
    pub courses: usize,
    pub learners: usize,
    pub activity_rows: usize,
}

/// Hooks of a projection written on a caller's transaction.
///
/// They go through the pool, so they fire once that transaction committed:
/// inside the trail lock each holder would wait on a second pool connection
/// and enough holders deadlock the pool (BUG-235).
#[derive(Debug, Default, Clone, Copy)]
#[must_use = "fire after the transaction commits"]
pub struct AfterCommit {
    activity_completed: Option<(CourseId, ActivityId, UserId)>,
    course_completed: Option<(UserId, CourseId)>,
}

impl AfterCommit {
    pub fn and(self, other: Self) -> Self {
        Self {
            activity_completed: self.activity_completed.or(other.activity_completed),
            course_completed: self.course_completed.or(other.course_completed),
        }
    }

    pub async fn fire(self, pool: &PgPool) {
        if let Some((course_id, activity_id, user_id)) = self.activity_completed {
            crate::analytics::events::hooks::activity_completed(
                pool,
                course_id,
                activity_id,
                user_id,
            )
            .await;
        }
        if let Some((user_id, course_id)) = self.course_completed {
            crate::gamification::hooks::course_completed(pool, user_id, course_id).await;
        }
    }
}

#[derive(Clone)]
pub struct ProgressProjector {
    pool: PgPool,
}

impl ProgressProjector {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    // ── Entry points for write paths ────────────────────────────────────

    /// After the learner's own submission work (start, save, submit) —
    /// working on a course enrols them. Never fails the caller: projection
    /// errors are logged and the next write (or a backfill) repairs them.
    pub async fn after_submission(&self, assessment_id: AssessmentId, user_id: UserId) {
        self.submission_changed(assessment_id, user_id, true).await;
    }

    /// After a change the learner did not make (grade, publish, deadline
    /// extension, timer auto-submit): re-projects without enrolling —
    /// BUG-251, a grader's action never creates a trail run.
    pub async fn reproject_submission(&self, assessment_id: AssessmentId, user_id: UserId) {
        self.submission_changed(assessment_id, user_id, false).await;
    }

    async fn submission_changed(&self, assessment_id: AssessmentId, user_id: UserId, enrol: bool) {
        if let Err(err) = self.project_submission(assessment_id, user_id, enrol).await {
            tracing::warn!(%assessment_id, %user_id, error = %err, "progress projection failed");
        }
    }

    /// After the learner's own file-attempt change (best-effort, enrols).
    pub async fn after_file_attempt(&self, file_submission_id: FileSubmissionId, user_id: UserId) {
        self.file_attempt_changed(file_submission_id, user_id, true)
            .await;
    }

    /// After a grader's file-attempt change (best-effort, never enrols).
    pub async fn reproject_file_attempt(
        &self,
        file_submission_id: FileSubmissionId,
        user_id: UserId,
    ) {
        self.file_attempt_changed(file_submission_id, user_id, false)
            .await;
    }

    async fn file_attempt_changed(
        &self,
        file_submission_id: FileSubmissionId,
        user_id: UserId,
        enrol: bool,
    ) {
        if let Err(err) = self
            .project_file_attempt(file_submission_id, user_id, enrol)
            .await
        {
            tracing::warn!(%file_submission_id, %user_id, error = %err, "progress projection failed");
        }
    }

    async fn project_submission(
        &self,
        assessment_id: AssessmentId,
        user_id: UserId,
        enrol: bool,
    ) -> Result<()> {
        let Some(assessment) =
            ab_db::assessments::get_assessment(&self.pool, assessment_id).await?
        else {
            return Ok(());
        };
        if enrol {
            self.ensure_enrolled(assessment.course_id, user_id).await?;
        }
        self.recalculate_activity(assessment.activity_id, user_id)
            .await?;
        // A passing, published submission pays XP once (legacy award task).
        let passed = ab_db::submissions::list_user_submissions(&self.pool, assessment_id, user_id)
            .await?
            .into_iter()
            .find(|s| {
                s.status == SubmissionStatus::Published
                    && s.final_score
                        .or(s.auto_score)
                        .is_some_and(|score| score >= assessment.passing_score)
            });
        if let Some(submission) = passed {
            crate::gamification::hooks::submission_passed(
                &self.pool,
                user_id,
                submission.id,
                assessment.kind,
            )
            .await;
        }
        Ok(())
    }

    async fn project_file_attempt(
        &self,
        file_submission_id: FileSubmissionId,
        user_id: UserId,
        enrol: bool,
    ) -> Result<()> {
        let Some(fs) =
            ab_db::file_submissions::get_file_submission(&self.pool, file_submission_id).await?
        else {
            return Ok(());
        };
        if enrol {
            self.ensure_enrolled(fs.course_id, user_id).await?;
        }
        self.recalculate_activity(fs.activity_id, user_id).await?;
        Ok(())
    }

    // ── Explicit completion (non-submission activities) ─────────────────

    /// Mark a lesson/video/document complete (legacy
    /// `mark_manual_activity_complete`). Assessment and file-submission
    /// activities are owned by their pipelines and are left alone.
    ///
    /// Runs on the caller's connection (the trail lock transaction, BUG-220 /
    /// BUG-221): the step and the projection commit together; the caller
    /// fires the returned hooks after that commit (BUG-235).
    pub async fn mark_complete(
        &self,
        conn: &mut PgConnection,
        activity: &ActivityRow,
        user_id: UserId,
    ) -> Result<AfterCommit> {
        if is_pipeline_owned(&mut *conn, activity).await? {
            return Ok(AfterCommit::default());
        }
        let now = now_unix();
        let existing =
            ab_db::progress::get_activity_progress(&mut *conn, activity.id, user_id).await?;
        let write = ActivityProgressWrite {
            course_id: activity.course_id,
            activity_id: activity.id,
            user_id,
            state: ActivityProgressState::Completed,
            required: existing.as_ref().is_none_or(|e| e.required),
            score: None,
            passed: None,
            best_submission_id: None,
            latest_submission_id: None,
            attempt_count: 0,
            started_at: existing.as_ref().and_then(|e| e.started_at).or(Some(now)),
            last_activity_at: Some(now),
            submitted_at: None,
            graded_at: None,
            completed_at: Some(now),
            due_at: existing.as_ref().and_then(|e| e.due_at),
            is_late: false,
            teacher_action_required: false,
            status_reason: None,
        };
        ab_db::progress::upsert_activity_progress(&mut *conn, &write).await?;
        let course = self
            .recalculate_course_on(conn, activity.course_id, user_id)
            .await?;
        Ok(AfterCommit {
            activity_completed: Some((activity.course_id, activity.id, user_id)),
            course_completed: course_completed(&course),
        })
    }

    /// Undo an explicit completion (same connection rule as `mark_complete`).
    pub async fn unmark_complete(
        &self,
        conn: &mut PgConnection,
        activity: &ActivityRow,
        user_id: UserId,
    ) -> Result<AfterCommit> {
        if is_pipeline_owned(&mut *conn, activity).await? {
            return Ok(AfterCommit::default());
        }
        let Some(existing) =
            ab_db::progress::get_activity_progress(&mut *conn, activity.id, user_id).await?
        else {
            return Ok(AfterCommit::default());
        };
        let write = ActivityProgressWrite {
            course_id: activity.course_id,
            activity_id: activity.id,
            user_id,
            state: ActivityProgressState::NotStarted,
            required: existing.required,
            score: None,
            passed: None,
            best_submission_id: None,
            latest_submission_id: None,
            attempt_count: 0,
            started_at: None,
            last_activity_at: Some(now_unix()),
            submitted_at: None,
            graded_at: None,
            completed_at: None,
            due_at: existing.due_at,
            is_late: false,
            teacher_action_required: false,
            status_reason: None,
        };
        ab_db::progress::upsert_activity_progress(&mut *conn, &write).await?;
        let course = self
            .recalculate_course_on(conn, activity.course_id, user_id)
            .await?;
        Ok(AfterCommit {
            activity_completed: None,
            course_completed: course_completed(&course),
        })
    }

    /// Assessment and file-submission activities complete through their
    /// pipelines (submit → grade → project), never by an explicit mark.
    pub async fn is_pipeline_owned(&self, activity: &ActivityRow) -> Result<bool> {
        is_pipeline_owned(&self.pool, activity).await
    }

    // ── Recalculation ───────────────────────────────────────────────────

    /// Working on a course enrols the learner: the trail run is what
    /// `learner-state.enrolled` reads, and the legacy created it on the
    /// first submission too. Learner-initiated paths only (BUG-251).
    async fn ensure_enrolled(&self, course_id: CourseId, user_id: UserId) -> Result<()> {
        let mut conn = self.pool.acquire().await?;
        let trail = ab_db::progress::ensure_trail(&mut conn, user_id).await?;
        ab_db::progress::ensure_trail_run(&mut conn, trail.id, course_id, user_id).await?;
        Ok(())
    }

    /// Rebuild one learner's row for one activity, then the course
    /// aggregate. Returns `None` when the activity has no projection of its
    /// own (a lesson never explicitly completed).
    pub async fn recalculate_activity(
        &self,
        activity_id: ActivityId,
        user_id: UserId,
    ) -> Result<Option<ActivityProgressRow>> {
        let Some(activity) = ab_db::catalog::get_activity(&self.pool, activity_id).await? else {
            return Ok(None);
        };
        let write = self.projection_for(&activity, user_id).await?;
        if let Some(write) = write {
            let was_completed =
                ab_db::progress::get_activity_progress(&self.pool, activity_id, user_id)
                    .await?
                    .is_some_and(|row| row.state == ActivityProgressState::Completed);
            ab_db::progress::upsert_activity_progress(&self.pool, &write).await?;
            if write.state == ActivityProgressState::Completed && !was_completed {
                crate::analytics::events::hooks::activity_completed(
                    &self.pool,
                    activity.course_id,
                    activity.id,
                    user_id,
                )
                .await;
            }
        }
        self.recalculate_course(activity.course_id, user_id).await?;
        ab_db::progress::get_activity_progress(&self.pool, activity_id, user_id).await
    }

    async fn projection_for(
        &self,
        activity: &ActivityRow,
        user_id: UserId,
    ) -> Result<Option<ActivityProgressWrite>> {
        if activity.activity_type == "file_submission" {
            let Some(fs) =
                ab_db::file_submissions::get_file_submission_by_activity(&self.pool, activity.id)
                    .await?
            else {
                return Ok(None);
            };
            let attempts =
                ab_db::file_submissions::list_user_attempts(&self.pool, fs.id, user_id).await?;
            return Ok(Some(project_file_attempts(
                activity, user_id, fs.due_at, &attempts,
            )));
        }
        let Some(assessment) =
            ab_db::assessments::get_assessment_by_activity(&self.pool, activity.id).await?
        else {
            return Ok(None);
        };
        let submissions =
            ab_db::submissions::list_user_submissions(&self.pool, assessment.id, user_id).await?;
        Ok(Some(project_submissions(
            activity,
            user_id,
            &assessment,
            &submissions,
        )))
    }

    /// Rebuild the course aggregate (seeding `not_started` rows first so
    /// `total_required_count` covers every published activity).
    pub async fn recalculate_course(
        &self,
        course_id: CourseId,
        user_id: UserId,
    ) -> Result<CourseProgressRow> {
        let mut conn = self.pool.acquire().await?;
        let course = self
            .recalculate_course_on(&mut conn, course_id, user_id)
            .await?;
        drop(conn);
        AfterCommit {
            activity_completed: None,
            course_completed: course_completed(&course),
        }
        .fire(&self.pool)
        .await;
        Ok(course)
    }

    /// [`Self::recalculate_course`] on the caller's connection, so a trail
    /// mark / leave commits the aggregate with its step (BUG-221). Touches
    /// nothing but `conn`: the `course_completed` hook is the caller's, after
    /// commit (BUG-235).
    pub async fn recalculate_course_on(
        &self,
        conn: &mut PgConnection,
        course_id: CourseId,
        user_id: UserId,
    ) -> Result<CourseProgressRow> {
        ab_db::progress::ensure_course_rows(&mut *conn, course_id, user_id).await?;
        let rows =
            ab_db::progress::list_course_progress_rows(&mut *conn, course_id, user_id).await?;
        let weights = ab_db::progress::list_assessment_weights(&mut *conn, course_id).await?;
        let write = aggregate_course(course_id, user_id, &rows, &weights);
        ab_db::progress::upsert_course_progress(&mut *conn, &write).await?;
        if write.certificate_eligible {
            crate::certifications::issue_for_completion(&mut *conn, course_id, user_id).await?;
        }
        ab_db::progress::get_course_progress(&mut *conn, course_id, user_id)
            .await?
            .ok_or_else(|| Error::not_found("course progress"))
    }

    /// Re-aggregate every known learner of a course — after an activity is
    /// (un)published or deleted, so `total_required_count` follows the
    /// published set. Every writer of `activities.published` (the curriculum
    /// toggle, assessment lifecycle transitions — studio + scheduler — and
    /// file-submission publish) flips the flag in its own transaction and
    /// calls this once it committed (BUG-232).
    pub async fn recalculate_course_for_all(&self, course_id: CourseId) -> Result<()> {
        for user_id in ab_db::progress::known_course_users(&self.pool, course_id).await? {
            self.recalculate_course(course_id, user_id).await?;
        }
        Ok(())
    }

    /// Repair projections for every known learner of one course (or all).
    pub async fn backfill(&self, course_id: Option<CourseId>) -> Result<BackfillReport> {
        let courses = match course_id {
            Some(id) => vec![id],
            None => ab_db::progress::list_course_ids(&self.pool).await?,
        };
        let mut report = BackfillReport {
            courses: courses.len(),
            learners: 0,
            activity_rows: 0,
        };
        for course in courses {
            let activities = ab_db::catalog::list_activities(&self.pool, course).await?;
            let users = ab_db::progress::known_course_users(&self.pool, course).await?;
            for user_id in users {
                report.learners += 1;
                for activity in activities.iter().filter(|a| a.published) {
                    if let Some(write) = self.projection_for(activity, user_id).await? {
                        ab_db::progress::upsert_activity_progress(&self.pool, &write).await?;
                        report.activity_rows += 1;
                    }
                }
                self.recalculate_course(course, user_id).await?;
            }
        }
        Ok(report)
    }
}

const fn course_completed(course: &CourseProgressRow) -> Option<(UserId, CourseId)> {
    if course.certificate_eligible {
        Some((course.user_id, course.course_id))
    } else {
        None
    }
}

async fn is_pipeline_owned<'e>(
    db: impl sqlx::PgExecutor<'e>,
    activity: &ActivityRow,
) -> Result<bool> {
    if activity.activity_type == "file_submission" {
        return Ok(true);
    }
    Ok(
        ab_db::assessments::get_assessment_by_activity(db, activity.id)
            .await?
            .is_some(),
    )
}

// ── Pure projection logic ───────────────────────────────────────────────────

fn submission_score(s: &SubmissionRow) -> Option<f64> {
    s.final_score.or(s.auto_score)
}

fn submission_sort_key(s: &SubmissionRow) -> (i64, uuid::Uuid) {
    (s.submitted_at.unwrap_or(s.updated_at), s.id.0)
}

/// Legacy `_apply_progress_from_submissions`.
pub(crate) fn project_submissions(
    activity: &ActivityRow,
    user_id: UserId,
    assessment: &AssessmentRow,
    submissions: &[SubmissionRow],
) -> ActivityProgressWrite {
    let latest = submissions.iter().max_by_key(|s| submission_sort_key(s));
    let submitted: Vec<&SubmissionRow> = submissions
        .iter()
        .filter(|s| s.status != SubmissionStatus::Draft)
        .collect();
    // The grade of record is a released one (BUG-180 / BUG-187): a pending,
    // saved or returned attempt never scores the activity, whatever its
    // partial score — `GradeKey` is the gradebook's order too.
    let best = submitted
        .iter()
        .copied()
        .filter(|s| s.grade_key().released)
        .max_by(|a, b| a.grade_key().order(b.grade_key()));

    let mut state = ActivityProgressState::NotStarted;
    let mut score = None;
    let mut passed = None;
    let mut completed_at = None;
    let mut teacher_action = false;
    let mut status_reason = None;

    if let Some(latest) = latest {
        // Without a released grade only a returned attempt carries its
        // (provisional) score to the learner; pending / saved ones are
        // teacher-only, so `learner_state` needs no mask.
        score = best.and_then(|s| s.final_score).or_else(|| {
            (latest.status == SubmissionStatus::Returned)
                .then(|| submission_score(latest))
                .flatten()
        });
        passed = score.map(|s| s >= assessment.passing_score);
        state = match latest.status {
            SubmissionStatus::Draft => ActivityProgressState::InProgress,
            SubmissionStatus::Returned => {
                status_reason = Some("returned_for_revision".to_owned());
                ActivityProgressState::Returned
            }
            // `pending` only ever means "a teacher must score this" (manual
            // mode, or an auto-graded attempt with manual items), so it needs
            // a teacher in any grading mode (DECISIONS 2026-09-13).
            SubmissionStatus::Pending => {
                teacher_action = true;
                ActivityProgressState::NeedsGrading
            }
            // A saved-but-unreleased grade stays hidden (same as file attempts):
            // pass/fail is the learner's to see only once published.
            SubmissionStatus::Graded => ActivityProgressState::Graded,
            SubmissionStatus::Published => match score {
                None => ActivityProgressState::Graded,
                Some(s) if s >= assessment.passing_score => ActivityProgressState::Passed,
                Some(_) => ActivityProgressState::Failed,
            },
        };
        if completion_satisfied(assessment, latest, score) {
            completed_at = Some(
                latest
                    .graded_at
                    .or(latest.submitted_at)
                    .unwrap_or(latest.updated_at),
            );
            if matches!(
                assessment.completion_rule,
                CompletionRule::Submitted
                    | CompletionRule::Viewed
                    | CompletionRule::TeacherVerified
            ) {
                state = ActivityProgressState::Completed;
            }
        } else if let Some(released) = submissions
            .iter()
            .filter(|s| s.status == SubmissionStatus::Published)
            .max_by_key(|s| submission_sort_key(s))
            .filter(|s| completion_satisfied(assessment, s, score))
        {
            // Completion is sticky (BUG-129, DECISIONS 2026-09-13): a newer
            // attempt keeps the last released verdict until it is published.
            completed_at = Some(
                released
                    .graded_at
                    .or(released.submitted_at)
                    .unwrap_or(released.updated_at),
            );
        }
    }

    ActivityProgressWrite {
        course_id: activity.course_id,
        activity_id: activity.id,
        user_id,
        state,
        // Legacy: every submission-backed activity counts as required.
        required: true,
        score,
        passed,
        best_submission_id: best.map(|s| s.id),
        latest_submission_id: latest.map(|s| s.id),
        attempt_count: i32::try_from(submitted.len()).unwrap_or(i32::MAX),
        started_at: latest.and_then(|s| s.started_at),
        last_activity_at: latest.map(|s| submission_sort_key(s).0),
        submitted_at: latest.and_then(|s| s.submitted_at),
        graded_at: latest.and_then(|s| s.graded_at),
        completed_at,
        due_at: assessment.due_at,
        is_late: latest.is_some_and(|s| s.is_late),
        teacher_action_required: teacher_action,
        status_reason,
    }
}

/// A saved (unpublished) grade is teacher-only: `graded` completion means
/// `published`, so progress never leaks the decision early.
fn completion_satisfied(
    assessment: &AssessmentRow,
    latest: &SubmissionRow,
    score: Option<f64>,
) -> bool {
    match assessment.completion_rule {
        CompletionRule::Submitted => latest.status != SubmissionStatus::Draft,
        CompletionRule::Graded => latest.status == SubmissionStatus::Published,
        CompletionRule::Passed => {
            latest.status == SubmissionStatus::Published
                && score.is_some_and(|s| s >= assessment.passing_score)
        }
        CompletionRule::Viewed | CompletionRule::TeacherVerified => false,
    }
}

/// Legacy `_recalculate_file_submission_progress`.
pub(crate) fn project_file_attempts(
    activity: &ActivityRow,
    user_id: UserId,
    due_at: Option<i64>,
    attempts: &[AttemptRow],
) -> ActivityProgressWrite {
    let latest = attempts.iter().max_by_key(|a| (a.updated_at, a.id.0));
    // Completion is sticky (BUG-129, DECISIONS 2026-09-13): until a newer
    // attempt is published, the last released one keeps its verdict.
    let released = attempts
        .iter()
        .filter(|a| a.grade_key().released)
        .max_by(|a, b| a.grade_key().order(b.grade_key()));
    let submitted = attempts
        .iter()
        .filter(|a| a.status != FileAttemptStatus::Draft)
        .count();
    // Released grade first (BUG-180); a returned attempt carries its own.
    let score = released.and_then(|a| a.final_score).or_else(|| {
        latest
            .filter(|a| a.status == FileAttemptStatus::Returned)
            .and_then(|a| a.final_score)
    });
    let passed = score.map(|s| s >= FILE_SUBMISSION_PASSING_SCORE);
    let mut state = ActivityProgressState::NotStarted;
    let mut teacher_action = false;
    let mut completed_at = None;
    let mut status_reason = latest.map(|_| "file_submission".to_owned());
    if let Some(latest) = latest {
        state = match latest.status {
            FileAttemptStatus::Draft => ActivityProgressState::InProgress,
            FileAttemptStatus::Submitted => {
                teacher_action = true;
                ActivityProgressState::NeedsGrading
            }
            FileAttemptStatus::Returned => {
                status_reason = Some("returned_for_revision".to_owned());
                ActivityProgressState::Returned
            }
            FileAttemptStatus::Graded => ActivityProgressState::Graded,
            FileAttemptStatus::Published => {
                if passed == Some(true) {
                    ActivityProgressState::Passed
                } else {
                    ActivityProgressState::Failed
                }
            }
        };
        completed_at = released.map(|a| a.graded_at.or(a.submitted_at).unwrap_or(a.updated_at));
    }
    ActivityProgressWrite {
        course_id: activity.course_id,
        activity_id: activity.id,
        user_id,
        state,
        required: true,
        score,
        passed,
        best_submission_id: None,
        latest_submission_id: None,
        attempt_count: i32::try_from(submitted).unwrap_or(i32::MAX),
        started_at: latest.and_then(|a| a.started_at),
        last_activity_at: latest.map(|a| a.updated_at),
        submitted_at: latest.and_then(|a| a.submitted_at),
        graded_at: latest.and_then(|a| a.graded_at),
        completed_at,
        due_at,
        is_late: latest.is_some_and(|a| a.is_late),
        teacher_action_required: teacher_action,
        status_reason,
    }
}

pub(crate) const fn progress_is_completed(row: &ActivityProgressRow) -> bool {
    row.completed_at.is_some()
        || matches!(
            row.state,
            ActivityProgressState::Completed | ActivityProgressState::Passed
        )
}

/// Legacy `recalculate_course_progress` arithmetic over the required rows
/// (`rows` is the published set — `list_course_progress_rows` filters).
pub(crate) fn aggregate_course(
    course_id: CourseId,
    user_id: UserId,
    rows: &[ActivityProgressRow],
    weights: &[ab_db::progress::ActivityWeightRow],
) -> CourseProgressWrite {
    let required: Vec<&ActivityProgressRow> = rows.iter().filter(|r| r.required).collect();
    let total = required.len();
    let completed = required.iter().filter(|r| progress_is_completed(r)).count();
    let scored: Vec<f64> = required.iter().filter_map(|r| r.score).collect();
    let needs_grading = required
        .iter()
        .filter(|r| r.teacher_action_required)
        .count();
    let last_activity_at = required.iter().filter_map(|r| r.last_activity_at).max();
    let all_completed = total > 0 && completed >= total;
    let completed_at = if all_completed {
        required.iter().filter_map(|r| r.completed_at).max()
    } else {
        None
    };
    let (mut numerator, mut denominator) = (0.0, 0.0);
    for row in &required {
        let Some(score) = row.score else { continue };
        let weight = weights
            .iter()
            .find(|w| w.activity_id == row.activity_id)
            .map_or(1.0, |w| w.weight);
        if weight <= 0.0 {
            continue;
        }
        numerator = score.mul_add(weight, numerator);
        denominator += weight;
    }
    let count = |n: usize| i32::try_from(n).unwrap_or(i32::MAX);
    #[allow(clippy::cast_precision_loss)]
    let pct = if total == 0 {
        0.0
    } else {
        round2(completed as f64 / total as f64 * 100.0)
    };
    #[allow(clippy::cast_precision_loss)]
    let grade_average = if scored.is_empty() {
        None
    } else {
        Some(round2(scored.iter().sum::<f64>() / scored.len() as f64))
    };
    CourseProgressWrite {
        course_id,
        user_id,
        completed_required_count: count(completed),
        total_required_count: count(total),
        progress_pct: pct,
        grade_average,
        // BUG-208: inf/inf is NaN → JSON null; skip the average instead.
        weighted_grade_average: (denominator > 0.0)
            .then(|| numerator / denominator)
            .filter(|avg| avg.is_finite())
            .map(round2),
        missing_required_count: count(total.saturating_sub(completed)),
        needs_grading_count: count(needs_grading),
        last_activity_at,
        completed_at,
        certificate_eligible: all_completed,
    }
}
