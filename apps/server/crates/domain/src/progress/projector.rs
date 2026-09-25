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

/// Queue kind of a deferred [`ProgressProjector::reproject_staff_change`];
/// payload `{ user_id, course_id | null }` (BUG-305).
pub const STAFF_CHANGE_JOB: &str = "progress:staff-change";
/// Queue kind of a deferred [`ProgressProjector::recalculate_course_for_all`];
/// payload `{ course_id }` (BUG-310).
pub const COURSE_CHANGE_JOB: &str = "progress:course-change";
/// Queue kind of a deferred lateness settle ([`ProgressProjector::after_lateness_change`]);
/// payload `{ assessment_id, user_id | null, granted_by | null }` (BUG-312).
pub const LATENESS_JOB: &str = "progress:lateness";

/// Queue kind of a deferred grader-side re-projection of one learner
/// ([`ProgressProjector::reproject_submission`] /
/// [`ProgressProjector::reproject_file_attempt`]); payload
/// `{ assessment_id | file_submission_id, user_id }` (BUG-313/314).
pub const LEARNER_JOB: &str = "progress:learner";

/// How long a post-commit re-projection holds the response (UX-209): far
/// under the 30 s request timeout, so a busy member lock never turns a
/// committed write into a 408 — the rest goes on in the background, with a
/// retrying job queued behind it.
const INLINE_WAIT: std::time::Duration = std::time::Duration::from_secs(5);

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
    /// working on a course enrols them. A staff `preview` (UX-182) neither
    /// enrols nor projects. Never fails the caller: projection errors are
    /// logged and the next write (or a backfill) repairs them.
    pub async fn after_submission(
        &self,
        assessment_id: AssessmentId,
        user_id: UserId,
        preview: bool,
    ) {
        if !preview {
            self.submission_changed(assessment_id, user_id, true).await;
        }
    }

    /// After a change the learner did not make (grade, publish, deadline
    /// extension, timer auto-submit): re-projects without enrolling —
    /// BUG-251, a grader's action never creates a trail run.
    ///
    /// Goes through [`Self::after_commit`] (BUG-313/314): a busy member lock
    /// or a failed pass is retried by a [`LEARNER_JOB`], never lost.
    pub async fn reproject_submission(&self, assessment_id: AssessmentId, user_id: UserId) {
        let this = self.clone();
        self.after_commit(
            LEARNER_JOB,
            serde_json::json!({ "assessment_id": assessment_id, "user_id": user_id }),
            async move { this.project_submission(assessment_id, user_id, false).await },
        )
        .await;
    }

    async fn submission_changed(&self, assessment_id: AssessmentId, user_id: UserId, enrol: bool) {
        if let Err(err) = self.project_submission(assessment_id, user_id, enrol).await {
            tracing::warn!(%assessment_id, %user_id, error = %err, "progress projection failed");
        }
    }

    /// After the learner's own file-attempt change (best-effort, enrols;
    /// a staff `preview` neither enrols nor projects, UX-182).
    pub async fn after_file_attempt(
        &self,
        file_submission_id: FileSubmissionId,
        user_id: UserId,
        preview: bool,
    ) {
        if !preview {
            self.file_attempt_changed(file_submission_id, user_id, true)
                .await;
        }
    }

    /// After a grader's file-attempt change (never enrols), through
    /// [`Self::after_commit`] like [`Self::reproject_submission`].
    pub async fn reproject_file_attempt(
        &self,
        file_submission_id: FileSubmissionId,
        user_id: UserId,
    ) {
        let this = self.clone();
        self.after_commit(
            LEARNER_JOB,
            serde_json::json!({ "file_submission_id": file_submission_id, "user_id": user_id }),
            async move {
                this.project_file_attempt(file_submission_id, user_id, false)
                    .await
            },
        )
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
        // BUG-260 / BUG-270: a non-member's grade is recorded (the row) and
        // nothing more — no progress, completion, certificate or XP.
        if !self
            .project(
                assessment.course_id,
                Some(assessment.activity_id),
                user_id,
                enrol,
            )
            .await?
        {
            return Ok(());
        }
        // A passing, published submission pays XP once (legacy award task).
        let passed =
            ab_db::submissions::list_user_submissions(&self.pool, assessment_id, user_id, false)
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
        self.project(fs.course_id, Some(fs.activity_id), user_id, enrol)
            .await?;
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

    /// The one per-member projection entry (BUG-270): one activity's row
    /// (when given) and the course aggregate, written under the member's
    /// trail lock with the run re-checked inside it. `enrol` — the learner's
    /// own work, never a grader's (BUG-251) — creates the run instead: the
    /// run is what `learner-state.enrolled` reads, and the legacy created it
    /// on the first submission too. Returns whether the user is a member; a
    /// non-member is left alone (BUG-260/268/269) and the caller fires no
    /// member hook (XP). One lock connection at a time; hooks fire after
    /// commit (BUG-235).
    async fn project(
        &self,
        course_id: CourseId,
        activity_id: Option<ActivityId>,
        user_id: UserId,
        enrol: bool,
    ) -> Result<bool> {
        let Some((mut tx, joined)) =
            super::trail::lock_member_joined(&self.pool, user_id, course_id, enrol).await?
        else {
            return Ok(false);
        };
        let mut hooks = AfterCommit::default();
        if let Some(activity_id) = activity_id
            && let Some(activity) = ab_db::catalog::get_activity(&mut *tx, activity_id).await?
            && let Some(write) = projection_for(&mut tx, &activity, user_id).await?
        {
            let was_completed =
                ab_db::progress::get_activity_progress(&mut *tx, activity_id, user_id)
                    .await?
                    .is_some_and(|row| row.state == ActivityProgressState::Completed);
            ab_db::progress::upsert_activity_progress(&mut *tx, &write).await?;
            if write.state == ActivityProgressState::Completed && !was_completed {
                hooks.activity_completed = Some((course_id, activity_id, user_id));
            }
        }
        if joined {
            // BUG-289: a submission that (re)creates the run re-projects the
            // whole member — grades published while they were away too.
            let (_, rejoin) = self
                .reproject_member_on(&mut tx, course_id, user_id)
                .await?;
            hooks = hooks.and(rejoin);
        } else {
            let course = self
                .recalculate_course_on(&mut tx, course_id, user_id)
                .await?;
            hooks.course_completed = course_completed(&course);
        }
        tx.commit().await?;
        hooks.fire(&self.pool).await;
        Ok(true)
    }

    /// Rebuild a member's course aggregate (seeding `not_started` rows
    /// first so `total_required_count` covers every published activity):
    /// [`Self::project`] without an activity.
    pub async fn recalculate_course(&self, course_id: CourseId, user_id: UserId) -> Result<()> {
        self.project(course_id, None, user_id, false).await?;
        Ok(())
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
        let mut rows =
            ab_db::progress::list_course_progress_rows(&mut *conn, course_id, user_id).await?;
        // BUG-318: an assessment the learner is not allowed to take is not
        // required of them (access changes re-run this via `after_course_change`).
        let restricted =
            ab_db::progress::restricted_activity_ids(&mut *conn, course_id, user_id).await?;
        for row in &mut rows {
            row.required &= !restricted.contains(&row.activity_id);
        }
        let weights = ab_db::progress::list_assessment_weights(&mut *conn, course_id).await?;
        let mut write = aggregate_course(course_id, user_id, &rows, &weights);
        // BUG-276: completion is a member's — a leaver keeps the counts, not
        // the completion or the certificate (the caller holds the trail lock).
        if !ab_db::progress::has_trail_run(&mut *conn, course_id, user_id).await? {
            write.certificate_eligible = false;
            write.completed_at = None;
        }
        ab_db::progress::upsert_course_progress(&mut *conn, &write).await?;
        if write.certificate_eligible {
            crate::certifications::issue_for_completion(&mut *conn, course_id, user_id).await?;
        }
        ab_db::progress::get_course_progress(&mut *conn, course_id, user_id)
            .await?
            .ok_or_else(|| Error::not_found("course progress"))
    }

    /// Re-aggregate every member of a course (trail run; BUG-268) — after an activity is
    /// (un)published or deleted, so `total_required_count` follows the
    /// published set. Every writer of `activities.published` (the curriculum
    /// toggle, assessment lifecycle transitions — studio + scheduler — and
    /// file-submission publish) flips the flag in its own transaction and
    /// calls this once it committed (BUG-232), through
    /// [`Self::after_course_change`] (BUG-310).
    ///
    /// A member whose recalculation fails (lock held past the wait) never
    /// drops the members after it (BUG-272): the loop goes on and returns
    /// the last error.
    pub async fn recalculate_course_for_all(&self, course_id: CourseId) -> Result<()> {
        let mut outcome = Ok(());
        for user_id in ab_db::progress::course_members(&self.pool, course_id).await? {
            if let Err(err) = self.recalculate_course(course_id, user_id).await {
                tracing::warn!(%course_id, %user_id, error = %err, "course recalculation failed");
                outcome = Err(err);
            }
        }
        outcome
    }

    /// Repair projections for every member of one course (or all; BUG-268),
    /// each under the member's trail lock (BUG-270). A member whose lock
    /// stays busy past the wait is logged and skipped — never every member
    /// and course after it (BUG-272); the last error is returned.
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
        let mut outcome = Ok(());
        for course in courses {
            for user_id in ab_db::progress::course_members(&self.pool, course).await? {
                match self.reproject_member(course, user_id, false).await {
                    Ok(Some(rows)) => {
                        report.learners += 1;
                        report.activity_rows += rows;
                    }
                    Ok(None) => {}
                    Err(err) => {
                        tracing::warn!(%course, %user_id, error = %err, "progress backfill failed");
                        outcome = Err(err);
                    }
                }
            }
        }
        outcome.map(|()| report)
    }

    /// Every roster / RBAC writer's post-commit step (BUG-305): see
    /// [`Self::after_commit`].
    pub async fn after_staff_change(&self, user_id: UserId, course_id: Option<CourseId>) {
        let this = self.clone();
        self.after_commit(
            STAFF_CHANGE_JOB,
            serde_json::json!({ "user_id": user_id, "course_id": course_id }),
            async move { this.reproject_staff_change(user_id, course_id).await },
        )
        .await;
    }

    /// Every writer that changed a course's published set (curriculum
    /// toggle, deletes, assessment lifecycle, file-submission publish),
    /// after commit (BUG-310): see [`Self::after_commit`].
    pub async fn after_course_change(&self, course_id: CourseId) {
        let this = self.clone();
        self.after_commit(
            COURSE_CHANGE_JOB,
            serde_json::json!({ "course_id": course_id }),
            async move { this.recalculate_course_for_all(course_id).await },
        )
        .await;
    }

    /// Every writer that changes what a hand-in pays for lateness, after
    /// commit (BUG-312): the assessment policy (`user_id: None` — every
    /// learner's hand-ins) or one learner's override. See
    /// [`Self::after_commit`]; `granted_by` signs the re-score entries.
    pub async fn after_lateness_change(
        &self,
        assessment_id: AssessmentId,
        user_id: Option<UserId>,
        granted_by: Option<UserId>,
    ) {
        let pool = self.pool.clone();
        self.after_commit(
            LATENESS_JOB,
            serde_json::json!({
                "assessment_id": assessment_id, "user_id": user_id, "granted_by": granted_by,
            }),
            async move {
                crate::grading::bulk::settle_assessment(&pool, assessment_id, user_id, granted_by)
                    .await
            },
        )
        .await;
    }

    /// A file submission's late rules changed (BUG-316): every learner's
    /// file hand-ins re-priced, through [`Self::after_commit`] on the
    /// [`LATENESS_JOB`] kind (payload `{ file_submission_id }`).
    pub async fn after_file_lateness_change(&self, file_submission_id: FileSubmissionId) {
        let pool = self.pool.clone();
        self.after_commit(
            LATENESS_JOB,
            serde_json::json!({ "file_submission_id": file_submission_id }),
            async move { crate::files::submissions::settle_lateness(&pool, file_submission_id).await },
        )
        .await;
    }

    /// The one durable post-commit path for course-wide progress work: the
    /// write already landed, so it never fails the caller. `work` runs on
    /// its own task (a hang-up or timeout of the request cannot drop it);
    /// the caller waits at most [`INLINE_WAIT`] (UX-209). Failed or not done
    /// by then → a `kind` job the worker retries with backoff (idempotent,
    /// so racing the still-running task is harmless).
    // ponytail: a crash between the commit and the enqueue loses the pass
    // (the next change or a backfill repairs it); enqueue in the writer's
    // transaction if that window ever matters.
    async fn after_commit(
        &self,
        kind: &'static str,
        payload: serde_json::Value,
        work: impl Future<Output = Result<()>> + Send + 'static,
    ) {
        let task = tokio::spawn(work);
        if matches!(
            tokio::time::timeout(INLINE_WAIT, task).await,
            Ok(Ok(Ok(())))
        ) {
            return;
        }
        let job = ab_db::queue::NewJob::new(kind, payload.clone()).max_attempts(10);
        if let Err(err) = ab_db::queue::enqueue(&self.pool, &job).await {
            tracing::error!(kind, %payload, error = %err, "progress job not enqueued");
        }
    }

    /// The worker's side of [`Self::after_commit`]'s jobs.
    pub async fn run_job(&self, kind: &str, payload: &serde_json::Value) -> Result<()> {
        fn field<T: serde::de::DeserializeOwned>(
            payload: &serde_json::Value,
            key: &str,
        ) -> Result<T> {
            serde_json::from_value(payload[key].clone())
                .map_err(|e| Error::internal("progress job payload", e))
        }
        match kind {
            STAFF_CHANGE_JOB => {
                self.reproject_staff_change(
                    field(payload, "user_id")?,
                    field(payload, "course_id")?,
                )
                .await
            }
            COURSE_CHANGE_JOB => {
                self.recalculate_course_for_all(field(payload, "course_id")?)
                    .await
            }
            LATENESS_JOB if !payload["file_submission_id"].is_null() => {
                crate::files::submissions::settle_lateness(
                    &self.pool,
                    field(payload, "file_submission_id")?,
                )
                .await
            }
            LATENESS_JOB => {
                crate::grading::bulk::settle_assessment(
                    &self.pool,
                    field(payload, "assessment_id")?,
                    field(payload, "user_id")?,
                    field(payload, "granted_by")?,
                )
                .await
            }
            LEARNER_JOB => {
                let user_id = field(payload, "user_id")?;
                if payload["file_submission_id"].is_null() {
                    self.project_submission(field(payload, "assessment_id")?, user_id, false)
                        .await
                } else {
                    self.project_file_attempt(field(payload, "file_submission_id")?, user_id, false)
                        .await
                }
            }
            other => Err(Error::internal(
                "progress job",
                std::io::Error::other(format!("unknown kind {other}")),
            )),
        }
    }

    /// Re-project a user whose course-staff standing may have changed
    /// (roster or RBAC writers, after commit; BUG-291): a user leaving the
    /// staff is a member again and picks up what was graded meanwhile; one
    /// joining it (no member) loses their allowlist and override rows
    /// (BUG-303). `course_id` narrows it to one course; else every course
    /// they hold a run in (the only courses such rows can name). A failing
    /// course never drops the ones after it (the last error is returned).
    pub async fn reproject_staff_change(
        &self,
        user_id: UserId,
        course_id: Option<CourseId>,
    ) -> Result<()> {
        let courses = match course_id {
            Some(id) => vec![id],
            None => ab_db::progress::user_run_course_ids(&self.pool, user_id).await?,
        };
        let mut outcome = Ok(());
        for course in courses {
            let step = match self.reproject_member(course, user_id, false).await {
                Ok(Some(_)) => Ok(()),
                Ok(None) => super::trail::drop_non_member_access(&self.pool, user_id, course).await,
                Err(err) => Err(err),
            };
            if let Err(err) = step {
                tracing::warn!(%course, %user_id, error = %err, "staff-change reprojection failed");
                outcome = Err(err);
            }
        }
        outcome
    }

    /// One member's backfill: every published activity row and the course
    /// aggregate under the member's trail lock. `enrol` (a learner joining)
    /// creates the run first, so a rejoin picks up what changed while they
    /// were away (BUG-275). `None` for a non-member; else the rows written.
    pub async fn reproject_member(
        &self,
        course_id: CourseId,
        user_id: UserId,
        enrol: bool,
    ) -> Result<Option<usize>> {
        let Some(mut tx) = super::trail::lock_member(&self.pool, user_id, course_id, enrol).await?
        else {
            return Ok(None);
        };
        let (rows, hooks) = self
            .reproject_member_on(&mut tx, course_id, user_id)
            .await?;
        tx.commit().await?;
        hooks.fire(&self.pool).await;
        Ok(Some(rows))
    }

    /// [`Self::reproject_member`] on the caller's lock transaction (a trail
    /// mark that re-creates the run, BUG-275). Fire the hooks after commit.
    pub async fn reproject_member_on(
        &self,
        conn: &mut PgConnection,
        course_id: CourseId,
        user_id: UserId,
    ) -> Result<(usize, AfterCommit)> {
        let mut rows = 0;
        for activity in ab_db::catalog::list_activities(&mut *conn, course_id).await? {
            if !activity.published {
                continue;
            }
            if let Some(write) = projection_for(&mut *conn, &activity, user_id).await? {
                ab_db::progress::upsert_activity_progress(&mut *conn, &write).await?;
                rows += 1;
            }
        }
        let aggregate = self.recalculate_course_on(conn, course_id, user_id).await?;
        Ok((
            rows,
            AfterCommit {
                activity_completed: None,
                course_completed: course_completed(&aggregate),
            },
        ))
    }
}

async fn projection_for(
    conn: &mut PgConnection,
    activity: &ActivityRow,
    user_id: UserId,
) -> Result<Option<ActivityProgressWrite>> {
    if activity.activity_type == "file_submission" {
        let Some(fs) =
            ab_db::file_submissions::get_file_submission_by_activity(&mut *conn, activity.id)
                .await?
        else {
            return Ok(None);
        };
        let attempts =
            ab_db::file_submissions::list_user_attempts(&mut *conn, fs.id, user_id, false).await?;
        return Ok(Some(project_file_attempts(
            activity, user_id, fs.due_at, &attempts,
        )));
    }
    let Some(assessment) =
        ab_db::assessments::get_assessment_by_activity(&mut *conn, activity.id).await?
    else {
        return Ok(None);
    };
    let submissions =
        ab_db::submissions::list_user_submissions(&mut *conn, assessment.id, user_id, false)
            .await?;
    Ok(Some(project_submissions(
        activity,
        user_id,
        &assessment,
        &submissions,
    )))
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
