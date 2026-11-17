//! Progress projections + personal trail queries (compile-checked).
//!
//! Timestamps as epoch seconds.

use ab_core::Result;
use ab_core::assessments::ActivityProgressStatus;
use ab_core::id::{ActivityId, CourseId, SubmissionId, UserId};
use sqlx::{PgConnection, PgPool};

/// `to_timestamp($n)` wants double precision; epoch seconds fit exactly.
#[allow(clippy::cast_precision_loss)]
const fn epoch(t: Option<i64>) -> Option<f64> {
    match t {
        Some(v) => Some(v as f64),
        None => None,
    }
}

// ── Activity progress ───────────────────────────────────────────────────────

#[derive(Debug, Clone)]
/// Keyed by `(activity_id, user_id)` (REWRITE 5.6 n12).
pub struct ActivityProgressRow {
    pub course_id: CourseId,
    pub activity_id: ActivityId,
    pub user_id: UserId,
    pub status: ActivityProgressStatus,
    pub required: bool,
    pub score: Option<f64>,
    pub passed: Option<bool>,
    pub best_submission_id: Option<SubmissionId>,
    pub latest_submission_id: Option<SubmissionId>,
    pub attempt_count: i32,
    pub started_at: Option<i64>,
    pub last_activity_at: Option<i64>,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub due_at: Option<i64>,
    pub is_late: bool,
    pub teacher_action_required: bool,
    pub status_reason: Option<String>,
    pub updated_at: i64,
}

/// Everything the projector writes (the row is replaced wholesale).
#[derive(Debug, Clone)]
pub struct ActivityProgressWrite {
    pub course_id: CourseId,
    pub activity_id: ActivityId,
    pub user_id: UserId,
    pub status: ActivityProgressStatus,
    pub required: bool,
    pub score: Option<f64>,
    pub passed: Option<bool>,
    pub best_submission_id: Option<SubmissionId>,
    pub latest_submission_id: Option<SubmissionId>,
    pub attempt_count: i32,
    pub started_at: Option<i64>,
    pub last_activity_at: Option<i64>,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub due_at: Option<i64>,
    pub is_late: bool,
    pub teacher_action_required: bool,
    pub status_reason: Option<String>,
}

pub async fn upsert_activity_progress<'e>(
    db: impl sqlx::PgExecutor<'e>,
    w: &ActivityProgressWrite,
) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO activity_progress
               (course_id, activity_id, user_id, status, required, score, passed,
                best_submission_id, latest_submission_id, attempt_count, started_at,
                last_activity_at, submitted_at, graded_at, completed_at, due_at, is_late,
                teacher_action_required, status_reason)
           VALUES ($1, $2, $3, $4, $5, $6::float8, $7, $8, $9, $10, to_timestamp($11),
                   to_timestamp($12), to_timestamp($13), to_timestamp($14), to_timestamp($15),
                   to_timestamp($16), $17, $18, $19)
           ON CONFLICT (activity_id, user_id) DO UPDATE SET
               status = EXCLUDED.status, required = EXCLUDED.required, score = EXCLUDED.score,
               passed = EXCLUDED.passed, best_submission_id = EXCLUDED.best_submission_id,
               latest_submission_id = EXCLUDED.latest_submission_id,
               attempt_count = EXCLUDED.attempt_count, started_at = EXCLUDED.started_at,
               last_activity_at = EXCLUDED.last_activity_at,
               submitted_at = EXCLUDED.submitted_at, graded_at = EXCLUDED.graded_at,
               completed_at = EXCLUDED.completed_at, due_at = EXCLUDED.due_at,
               is_late = EXCLUDED.is_late,
               teacher_action_required = EXCLUDED.teacher_action_required,
               status_reason = EXCLUDED.status_reason"#,
        w.course_id.0,
        w.activity_id.0,
        w.user_id.0,
        w.status.as_str(),
        w.required,
        w.score,
        w.passed,
        w.best_submission_id.map(|s| s.0),
        w.latest_submission_id.map(|s| s.0),
        w.attempt_count,
        epoch(w.started_at),
        epoch(w.last_activity_at),
        epoch(w.submitted_at),
        epoch(w.graded_at),
        epoch(w.completed_at),
        epoch(w.due_at),
        w.is_late,
        w.teacher_action_required,
        w.status_reason.as_deref()
    )
    .execute(db)
    .await?;
    Ok(())
}

pub async fn get_activity_progress<'e>(
    db: impl sqlx::PgExecutor<'e>,
    activity_id: ActivityId,
    user_id: UserId,
) -> Result<Option<ActivityProgressRow>> {
    let row = sqlx::query_as!(
        ActivityProgressRow,
        r#"SELECT course_id AS "course_id: CourseId",
                  activity_id AS "activity_id: ActivityId", user_id AS "user_id: UserId",
                  status AS "status: ActivityProgressStatus", required, score::float8 AS score, passed,
                  best_submission_id AS "best_submission_id: SubmissionId",
                  latest_submission_id AS "latest_submission_id: SubmissionId", attempt_count,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM last_activity_at))::bigint AS "last_activity_at?",
                  (extract(epoch FROM submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM graded_at))::bigint AS "graded_at?",
                  (extract(epoch FROM completed_at))::bigint AS "completed_at?",
                  (extract(epoch FROM due_at))::bigint AS "due_at?",
                  is_late, teacher_action_required, status_reason,
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM activity_progress WHERE activity_id = $1 AND user_id = $2"#,
        activity_id.0,
        user_id.0
    )
    .fetch_optional(db)
    .await?;
    Ok(row)
}

/// One learner's rows across a course: every published activity (once
/// [`ensure_course_rows`] ran) - rows of drafts and since-unpublished
/// activities are excluded so totals follow the published set.
pub async fn list_course_progress_rows<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
    user_id: UserId,
) -> Result<Vec<ActivityProgressRow>> {
    let rows = sqlx::query_as!(
        ActivityProgressRow,
        r#"SELECT course_id AS "course_id: CourseId",
                  activity_id AS "activity_id: ActivityId", user_id AS "user_id: UserId",
                  status AS "status: ActivityProgressStatus", required, score::float8 AS score, passed,
                  best_submission_id AS "best_submission_id: SubmissionId",
                  latest_submission_id AS "latest_submission_id: SubmissionId", attempt_count,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM last_activity_at))::bigint AS "last_activity_at?",
                  (extract(epoch FROM submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM graded_at))::bigint AS "graded_at?",
                  (extract(epoch FROM completed_at))::bigint AS "completed_at?",
                  (extract(epoch FROM due_at))::bigint AS "due_at?",
                  is_late, teacher_action_required, status_reason,
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM activity_progress
           WHERE course_id = $1 AND user_id = $2
             AND activity_id IN (SELECT id FROM activities WHERE published)"#,
        course_id.0,
        user_id.0
    )
    .fetch_all(db)
    .await?;
    Ok(rows)
}

/// `activities.required` (the lesson flag its trigger derives from `settings`).
pub async fn activity_required<'e>(
    db: impl sqlx::PgExecutor<'e>,
    activity_id: ActivityId,
) -> Result<Option<bool>> {
    Ok(sqlx::query_scalar!(
        "SELECT required FROM activities WHERE id = $1",
        activity_id.0
    )
    .fetch_optional(db)
    .await?)
}

/// Put a member's rows on the required rule as the activities say now.
///
/// REWRITE 5.6 n8 step 3, `course_progress_v`'s rule: a graded activity (an assessment or a file
/// task) always counts, a lesson by `activities.required`. A row keeps no flag of its own, so a
/// lesson made optional (or required) moves every member's totals on their next projection.
pub async fn refresh_required<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
    user_id: UserId,
) -> Result<()> {
    sqlx::query!(
        r#"UPDATE activity_progress p SET required = r.required
           FROM (SELECT a.id, a.kind = 'file_submission' OR a.required
                              OR EXISTS (SELECT 1 FROM assessments s WHERE s.activity_id = a.id) AS required
                 FROM activities a WHERE a.course_id = $1) r
           WHERE p.activity_id = r.id AND p.course_id = $1 AND p.user_id = $2
             AND p.required IS DISTINCT FROM r.required"#,
        course_id.0,
        user_id.0
    )
    .execute(db)
    .await?;
    Ok(())
}

/// Seed `not_started` rows for every published activity without one.
///
/// Required by [`refresh_required`]'s rule; `due_at` comes from the assessment /
/// file submission behind it.
pub async fn ensure_course_rows<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
    user_id: UserId,
) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO activity_progress (course_id, activity_id, user_id, required, due_at)
           SELECT a.course_id, a.id, $2,
                  a.kind = 'file_submission' OR s.id IS NOT NULL OR a.required,
                  s.due_at
           FROM activities a
           LEFT JOIN assessments s ON s.activity_id = a.id
           WHERE a.course_id = $1 AND a.published
           ON CONFLICT (activity_id, user_id) DO NOTHING"#,
        course_id.0,
        user_id.0
    )
    .execute(db)
    .await?;
    Ok(())
}

/// BUG-318: the course's assessments restricted to an allowlist `user_id`
/// is not on (`assessments::access_allows`, course-wide) - not theirs to
/// take, so not in their required set.
pub async fn restricted_activity_ids<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
    user_id: UserId,
) -> Result<Vec<ActivityId>> {
    let ids = sqlx::query_scalar!(
        r#"SELECT s.activity_id AS "id: ActivityId" FROM assessments s
           WHERE s.course_id = $1 AND s.access_mode = 'restricted'
             AND NOT EXISTS (SELECT 1 FROM assessment_access_users u
                             WHERE u.assessment_id = s.id AND u.user_id = $2)
             AND NOT EXISTS (SELECT 1 FROM assessment_access_usergroups g
                             JOIN usergroup_members m ON m.usergroup_id = g.usergroup_id
                             WHERE g.assessment_id = s.id AND m.user_id = $2)"#,
        course_id.0,
        user_id.0
    )
    .fetch_all(db)
    .await?;
    Ok(ids)
}

/// A learner's own due date for one task of a course (an extension or override).
pub struct DueOverrideRow {
    pub activity_id: ActivityId,
    pub due_at: i64,
}

/// The learner's own due dates in a course; the progress projection keeps
/// only each task's date.
///
/// An assessment override in force (or an extension, which outlives the
/// grant's expiry, BUG-300) and a file task's extension: the rule of
/// `work_queue::upcoming_deadlines` and of the attempt policy.
pub async fn due_overrides<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
    user_id: UserId,
) -> Result<Vec<DueOverrideRow>> {
    let rows = sqlx::query_as!(
        DueOverrideRow,
        r#"SELECT s.activity_id AS "activity_id!: ActivityId",
                  (extract(epoch FROM o.due_at_override))::bigint AS "due_at!"
           FROM assessment_overrides o
           JOIN assessments s ON s.id = o.assessment_id
           WHERE s.course_id = $1 AND o.user_id = $2 AND o.due_at_override IS NOT NULL
             AND (o.expires_at IS NULL OR o.expires_at > now() OR o.due_extended)"#,
        course_id.0,
        user_id.0
    )
    .fetch_all(db)
    .await?;
    Ok(rows)
}

// ── Course progress ─────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
/// A member's `course_progress_v` row (REWRITE 5.8 item 8): computed from
/// enrolments, completions and `activity_progress`, not the stored rollup.
pub struct CourseProgressRow {
    pub course_id: CourseId,
    pub user_id: UserId,
    pub completed_required_count: i32,
    pub total_required_count: i32,
    pub progress_pct: f64,
    pub grade_average: Option<f64>,
    pub weighted_grade_average: Option<f64>,
    pub missing_required_count: i32,
    pub needs_grading_count: i32,
    pub last_activity_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub certificate_eligible: bool,
}

/// What a recalculation found: whether the member's `course_progress_v` row
/// is complete, and whether this call recorded the completion.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CourseCompletion {
    pub eligible: bool,
    /// The first time: `enrolments.completed_at` was empty and is set now.
    pub recorded: bool,
}

/// Record a member's course completion once (REWRITE 5.8 item 10).
///
/// `enrolments.completed_at` takes the view's completion time the first time
/// the view says the course is complete, and is never cleared or moved
/// afterwards (a course that gains a required activity keeps it). `recorded`
/// is that transition, the completion signal. A non-member (no enrolment,
/// or staff: the view has no row) is never eligible.
pub async fn record_course_completion(
    conn: &mut PgConnection,
    course_id: CourseId,
    user_id: UserId,
) -> Result<CourseCompletion> {
    let row = sqlx::query!(
        r#"WITH v AS (
               SELECT certificate_eligible, completed_at FROM course_progress_v
                WHERE course_id = $1 AND user_id = $2),
           recorded AS (
               UPDATE enrolments e SET completed_at = coalesce(v.completed_at, now())
                 FROM v
                WHERE e.course_id = $1 AND e.user_id = $2 AND e.completed_at IS NULL
                  AND v.certificate_eligible
            RETURNING 1)
           SELECT coalesce((SELECT certificate_eligible FROM v), false) AS "eligible!",
                  EXISTS (SELECT 1 FROM recorded) AS "recorded!""#,
        course_id.0,
        user_id.0
    )
    .fetch_one(&mut *conn)
    .await?;
    Ok(CourseCompletion {
        eligible: row.eligible,
        recorded: row.recorded,
    })
}

/// The member's progress; `None` for anyone without an enrolment (a leaver)
/// and the course's staff.
pub async fn get_course_progress<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
    user_id: UserId,
) -> Result<Option<CourseProgressRow>> {
    let row = sqlx::query_as!(
        CourseProgressRow,
        r#"SELECT course_id AS "course_id!: CourseId", user_id AS "user_id!: UserId",
                  completed_required_count AS "completed_required_count!",
                  total_required_count AS "total_required_count!", progress_pct AS "progress_pct!",
                  grade_average::float8 AS grade_average,
                  weighted_grade_average::float8 AS weighted_grade_average,
                  missing_required_count AS "missing_required_count!",
                  needs_grading_count AS "needs_grading_count!",
                  (extract(epoch FROM last_activity_at))::bigint AS "last_activity_at?",
                  (extract(epoch FROM completed_at))::bigint AS "completed_at?",
                  certificate_eligible AS "certificate_eligible!"
           FROM course_progress_v WHERE course_id = $1 AND user_id = $2"#,
        course_id.0,
        user_id.0
    )
    .fetch_optional(db)
    .await?;
    Ok(row)
}

/// The course's members - learners with an enrolment.
///
/// The same predicate [`has_trail_run`] applies per learner (BUG-260). Course-wide
/// recalculations and backfills cover members only: a leaver's (or a staff
/// preview's) leftover rows never re-aggregate into a completion,
/// certificate or XP (BUG-268). The course's staff are never members, even
/// with a run left from before they joined it (BUG-287/288).
pub async fn course_members(pool: &PgPool, course_id: CourseId) -> Result<Vec<UserId>> {
    let ids = sqlx::query_scalar!(
        r#"SELECT user_id AS "user_id!: UserId" FROM course_members WHERE course_id = $1"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(ids)
}

/// Every course the user is enrolled in, staffed or not (BUG-291).
pub async fn user_run_course_ids(pool: &PgPool, user_id: UserId) -> Result<Vec<CourseId>> {
    let ids = sqlx::query_scalar!(
        r#"SELECT course_id AS "course_id!: CourseId" FROM enrolments WHERE user_id = $1"#,
        user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(ids)
}

pub async fn list_course_ids(pool: &PgPool) -> Result<Vec<CourseId>> {
    // A deleted course waits for its purge: nothing to project.
    let ids = sqlx::query_scalar!(
        r#"SELECT id AS "id: CourseId" FROM courses WHERE deleted_at IS NULL ORDER BY id"#
    )
    .fetch_all(pool)
    .await?;
    Ok(ids)
}

// ── Trail ───────────────────────────────────────────────────────────────────

/// One course the user is enrolled in, as the trail lists it.
///
/// The enrolment (the membership, REWRITE 5.6 n5).
#[derive(Debug, Clone)]
pub struct EnrolledRunRow {
    pub course_id: CourseId,
    pub user_id: UserId,
    pub enrolled_at: i64,
}

/// The user's member enrolments, oldest first: an enrolment in a course the
/// user now staffs is kept (it counts again once they leave the staff) but
/// not listed (BUG-292).
pub async fn list_enrolled_runs(pool: &PgPool, user_id: UserId) -> Result<Vec<EnrolledRunRow>> {
    let rows = sqlx::query_as!(
        EnrolledRunRow,
        r#"SELECT e.course_id AS "course_id!: CourseId", e.user_id AS "user_id!: UserId",
                  (extract(epoch FROM e.enrolled_at))::bigint AS "enrolled_at!"
           FROM course_members e
           WHERE e.user_id = $1
           ORDER BY e.enrolled_at, e.course_id"#,
        user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Whether the learner is a member: an enrolment in the course, and not one
/// of its staff - a learner who joined the staff keeps the enrolment but is
/// no member (BUG-288).
pub async fn has_trail_run<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
    user_id: UserId,
) -> Result<bool> {
    let exists = sqlx::query_scalar!(
        r#"SELECT EXISTS(SELECT 1 FROM course_members WHERE course_id = $1 AND user_id = $2) AS "exists!""#,
        course_id.0,
        user_id.0
    )
    .fetch_one(db)
    .await?;
    Ok(exists)
}

/// Enrolled for taking assessments (`courses.assessments_require_enrollment`):
/// an enrolment in the course, or membership of a usergroup linked to it -
/// the teacher enrolled the group.
pub async fn takes_assessments<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
    user_id: UserId,
) -> Result<bool> {
    let enrolled = sqlx::query_scalar!(
        r#"SELECT EXISTS(SELECT 1 FROM enrolments WHERE course_id = $1 AND user_id = $2)
               OR EXISTS(SELECT 1 FROM usergroup_courses uc
                         JOIN usergroup_members m ON m.usergroup_id = uc.usergroup_id
                         WHERE uc.course_id = $1 AND m.user_id = $2)
           AS "enrolled!""#,
        course_id.0,
        user_id.0
    )
    .fetch_one(db)
    .await?;
    Ok(enrolled)
}

/// The course's staff (`is_course_staff`, BUG-287): never enrolled.
pub async fn is_course_staff<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
    user_id: UserId,
) -> Result<bool> {
    let staff = sqlx::query_scalar!(
        r#"SELECT is_course_staff($1, $2) AS "staff!""#,
        course_id.0,
        user_id.0
    )
    .fetch_one(db)
    .await?;
    Ok(staff)
}

/// [`has_trail_run`] holding the enrolment `FOR SHARE` until the caller's
/// transaction ends: a concurrent leave (which deletes it) lands wholly
/// before (→ `false`) or after the caller's commit (BUG-281).
pub async fn has_trail_run_locked<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
    user_id: UserId,
) -> Result<bool> {
    let row = sqlx::query_scalar!(
        "SELECT 1 FROM enrolments
         WHERE course_id = $1 AND user_id = $2 AND NOT is_course_staff(course_id, user_id)
         FOR SHARE",
        course_id.0,
        user_id.0
    )
    .fetch_optional(db)
    .await?;
    Ok(row.is_some())
}

/// Hold the (user, course) enrolment row `FOR UPDATE` until the caller's
/// transaction ends: waits out a `set_access` that checked it `FOR SHARE`
/// (BUG-303). No enrolment → nothing to hold.
pub async fn lock_trail_run_row(
    conn: &mut PgConnection,
    course_id: CourseId,
    user_id: UserId,
) -> Result<()> {
    sqlx::query("SELECT 1 FROM enrolments WHERE course_id = $1 AND user_id = $2 FOR UPDATE")
        .bind(course_id.0)
        .bind(user_id.0)
        .fetch_optional(conn)
        .await?;
    Ok(())
}

/// Enrol `user_id` in the course (the membership fact, REWRITE 5.6 n5), on behalf of `by`;
/// `true` when this call created it.
pub async fn enrol(
    conn: &mut PgConnection,
    course_id: CourseId,
    user_id: UserId,
    by: UserId,
) -> Result<bool> {
    let created = sqlx::query!(
        "WITH joined AS (INSERT INTO enrolments (course_id, user_id) VALUES ($1, $2)
                         ON CONFLICT DO NOTHING RETURNING course_id, user_id)
         INSERT INTO enrolment_events (course_id, user_id, event, source, created_by)
         SELECT course_id, user_id, 'joined', CASE WHEN user_id = $3 THEN 'self' ELSE 'staff' END, $3
         FROM joined",
        course_id.0,
        user_id.0,
        by.0
    )
    .execute(&mut *conn)
    .await?
    .rows_affected()
        == 1;
    Ok(created)
}

/// End the membership (leave, roster removal) on behalf of `by`; `true` when there was one.
/// The event keeps the marks the leave is about to reset, so the history can answer what they had done.
pub async fn unenrol(
    conn: &mut PgConnection,
    course_id: CourseId,
    user_id: UserId,
    by: UserId,
) -> Result<bool> {
    let deleted = sqlx::query!(
        "WITH gone AS (DELETE FROM enrolments WHERE course_id = $1 AND user_id = $2
                       RETURNING course_id, user_id)
         INSERT INTO enrolment_events (course_id, user_id, event, source, created_by, completions)
         SELECT g.course_id, g.user_id, 'left', CASE WHEN g.user_id = $3 THEN 'self' ELSE 'staff' END, $3,
                (SELECT coalesce(jsonb_agg(jsonb_build_object('activity_id', c.activity_id,
                                                              'completed_at', c.completed_at)
                                           ORDER BY c.completed_at), '[]'::jsonb)
                 FROM completions c JOIN activities a ON a.id = c.activity_id
                 WHERE a.course_id = g.course_id AND c.user_id = g.user_id)
         FROM gone g",
        course_id.0,
        user_id.0,
        by.0
    )
    .execute(&mut *conn)
    .await?
    .rows_affected()
        > 0;
    Ok(deleted)
}

/// Try to serialize trail writes for one (user, course) pair (BUG-210).
///
/// `pg_try_advisory_xact_lock` on a fresh transaction: `Some(tx)` holds
/// the lock until commit or drop, `None` means another mark/leave owns it
/// and the connection is already back in the pool - a waiter never
/// parks a connection (BUG-220). The caller does every write through the
/// returned transaction, so the run, the step and the projection land or
/// vanish together (BUG-221).
pub async fn try_lock_trail_run(
    pool: &PgPool,
    user_id: UserId,
    course_id: CourseId,
) -> Result<Option<sqlx::Transaction<'static, sqlx::Postgres>>> {
    let mut tx = pool.begin().await?;
    let locked: bool = sqlx::query_scalar(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1::text || $2::text, 0))",
    )
    .bind(user_id.0.to_string())
    .bind(course_id.0.to_string())
    .fetch_one(&mut *tx)
    .await?;
    if locked {
        return Ok(Some(tx));
    }
    tx.rollback().await?;
    Ok(None)
}

/// A lesson-type activity the user completed, as the trail lists it.
///
/// The `completions` row. Graded kinds are left out: they complete through their submissions.
#[derive(Debug, Clone)]
pub struct CompletedStepRow {
    pub activity_id: ActivityId,
    pub course_id: CourseId,
    pub completed_at: i64,
}

pub async fn list_completed_steps(pool: &PgPool, user_id: UserId) -> Result<Vec<CompletedStepRow>> {
    let rows = sqlx::query_as!(
        CompletedStepRow,
        r#"SELECT c.activity_id AS "activity_id: ActivityId", a.course_id AS "course_id: CourseId",
                  (extract(epoch FROM c.completed_at))::bigint AS "completed_at!"
           FROM completions c
           JOIN activities a ON a.id = c.activity_id
           WHERE c.user_id = $1 AND a.kind <> 'file_submission'
             AND NOT EXISTS (SELECT 1 FROM assessments x WHERE x.activity_id = a.id)
           ORDER BY c.completed_at, c.activity_id"#,
        user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// When `user_id` completed `activity_id`, if they did (the `completions`
/// row) - what the projection of a lesson-type activity reads.
pub async fn completed_at(
    conn: &mut PgConnection,
    activity_id: ActivityId,
    user_id: UserId,
) -> Result<Option<i64>> {
    let at = sqlx::query_scalar!(
        r#"SELECT (extract(epoch FROM completed_at))::bigint AS "at!"
           FROM completions WHERE activity_id = $1 AND user_id = $2"#,
        activity_id.0,
        user_id.0
    )
    .fetch_optional(conn)
    .await?;
    Ok(at)
}

/// Record that `user_id` completed `activity_id` now; `false` when they
/// already had.
pub async fn insert_completion(
    conn: &mut PgConnection,
    activity_id: ActivityId,
    user_id: UserId,
) -> Result<bool> {
    let inserted = sqlx::query!(
        "INSERT INTO completions (activity_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        activity_id.0,
        user_id.0
    )
    .execute(conn)
    .await?;
    Ok(inserted.rows_affected() == 1)
}

/// Withdraw a completion; `false` when there was none.
pub async fn delete_completion(
    conn: &mut PgConnection,
    activity_id: ActivityId,
    user_id: UserId,
) -> Result<bool> {
    let deleted = sqlx::query!(
        "DELETE FROM completions WHERE activity_id = $1 AND user_id = $2",
        activity_id.0,
        user_id.0
    )
    .execute(conn)
    .await?;
    Ok(deleted.rows_affected() == 1)
}

/// Make a graded activity's `completions` row follow its projection row.
///
/// REWRITE 5.6 n8 step 1: present, at the projection's `completed_at`,
/// while that is set; gone when it is cleared or the row is missing. Call it
/// right after the projection write, in the same transaction. Lesson-type
/// completions are the learner's mark and never follow the projection.
pub async fn sync_graded_completion(
    conn: &mut PgConnection,
    activity_id: ActivityId,
    user_id: UserId,
) -> Result<()> {
    sqlx::query!(
        "INSERT INTO completions (activity_id, user_id, completed_at)
         SELECT activity_id, user_id, completed_at FROM activity_progress
         WHERE activity_id = $1 AND user_id = $2 AND completed_at IS NOT NULL
         ON CONFLICT (activity_id, user_id) DO UPDATE SET completed_at = EXCLUDED.completed_at
         WHERE completions.completed_at IS DISTINCT FROM EXCLUDED.completed_at",
        activity_id.0,
        user_id.0
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        "DELETE FROM completions c
         WHERE c.activity_id = $1 AND c.user_id = $2
           AND NOT EXISTS (SELECT 1 FROM activity_progress p
                           WHERE p.activity_id = c.activity_id AND p.user_id = c.user_id
                             AND p.completed_at IS NOT NULL)",
        activity_id.0,
        user_id.0
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// How many completions and projection rows disagree.
///
/// A completed `activity_progress` row with no `completions` row, or a
/// completion whose projection row is missing or not completed.
/// `maintenance:reconcile` logs it after the re-projection; a month of zeros
/// is the signal REWRITE 5.6 n8 waits for.
pub async fn completion_drift(pool: &PgPool) -> Result<i64> {
    let drift = sqlx::query_scalar!(
        r#"SELECT
             (SELECT count(*) FROM activity_progress p
              WHERE p.completed_at IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM completions c
                                WHERE c.activity_id = p.activity_id AND c.user_id = p.user_id))
           + (SELECT count(*) FROM completions c
              WHERE NOT EXISTS (SELECT 1 FROM activity_progress p
                                WHERE p.activity_id = c.activity_id AND p.user_id = c.user_id
                                  AND p.completed_at IS NOT NULL)) AS "drift!""#
    )
    .fetch_one(pool)
    .await?;
    Ok(drift)
}

/// One learner's `course_progress_v.progress_pct` per course, in one query.
///
/// UX-250: the trail run carries what `learner-state` shows. `started`: any
/// activity of the course is past `not_started` for them (work handed in, a
/// test opened), so handed-in work reads «В процессе» before it is graded.
pub struct CourseProgressPctRow {
    pub course_id: CourseId,
    pub progress_pct: f64,
    pub started: bool,
}

pub async fn course_progress_pcts(
    pool: &PgPool,
    user_id: UserId,
    course_ids: &[CourseId],
) -> Result<Vec<CourseProgressPctRow>> {
    let ids: Vec<uuid::Uuid> = course_ids.iter().map(|c| c.0).collect();
    let rows = sqlx::query_as!(
        CourseProgressPctRow,
        r#"SELECT c.course_id AS "course_id!: CourseId", c.progress_pct AS "progress_pct!",
                  EXISTS (SELECT 1 FROM activity_progress p
                           WHERE p.course_id = c.course_id AND p.user_id = c.user_id
                             AND p.status <> 'not_started') AS "started!"
           FROM course_progress_v c WHERE c.user_id = $1 AND c.course_id = ANY($2)"#,
        user_id.0,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// The user's progress in each listed course they are a member of
/// ([`has_trail_run`]'s rule: an enrolment, not staff); `0` before the first
/// projection lands.
pub struct MemberProgressRow {
    pub course_id: CourseId,
    pub progress_pct: f64,
    pub completed_at: Option<i64>,
}

pub async fn member_progress(
    pool: &PgPool,
    user_id: UserId,
    course_ids: &[CourseId],
) -> Result<Vec<MemberProgressRow>> {
    let ids: Vec<uuid::Uuid> = course_ids.iter().map(|c| c.0).collect();
    let rows = sqlx::query_as!(
        MemberProgressRow,
        r#"SELECT e.course_id AS "course_id!: CourseId",
                  coalesce(cp.progress_pct, 0) AS "progress_pct!",
                  (extract(epoch FROM cp.completed_at))::bigint AS "completed_at?"
           FROM course_members e
           LEFT JOIN course_progress_v cp ON cp.course_id = e.course_id AND cp.user_id = e.user_id
           WHERE e.user_id = $1 AND e.course_id = ANY($2)"#,
        user_id.0,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// What a teacher's course list shows beside each course: learners (members, not staff), activities and work
/// awaiting a grade (a `pending` submission or a `submitted` file attempt, previews left out).
pub struct TeachingStatsRow {
    pub course_id: CourseId,
    pub learners: i64,
    pub activities: i64,
    pub ungraded: i64,
}

pub async fn teaching_stats(
    pool: &PgPool,
    course_ids: &[CourseId],
) -> Result<Vec<TeachingStatsRow>> {
    let ids: Vec<uuid::Uuid> = course_ids.iter().map(|c| c.0).collect();
    let rows = sqlx::query_as!(
        TeachingStatsRow,
        r#"SELECT c.id AS "course_id!: CourseId",
                  (SELECT count(*) FROM course_members e
                   WHERE e.course_id = c.id) AS "learners!",
                  (SELECT count(*) FROM activities a WHERE a.course_id = c.id) AS "activities!",
                  (SELECT count(*) FROM submissions s
                   WHERE s.course_id = c.id AND NOT s.preview AND s.status = 'submitted') AS "ungraded!"
           FROM courses c WHERE c.id = ANY($1)"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Published-activity counts per course (trail `course_total_steps`).
pub struct CourseStepCountRow {
    pub course_id: CourseId,
    pub total: i64,
}

pub async fn published_activity_counts(
    pool: &PgPool,
    course_ids: &[CourseId],
) -> Result<Vec<CourseStepCountRow>> {
    let ids: Vec<uuid::Uuid> = course_ids.iter().map(|c| c.0).collect();
    let rows = sqlx::query_as!(
        CourseStepCountRow,
        r#"SELECT course_id AS "course_id: CourseId", count(*) AS "total!"
           FROM activities WHERE course_id = ANY($1) AND published GROUP BY course_id"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// One member of a course (an enrolment) with their progress.
#[derive(Debug, Clone)]
pub struct CourseLearnerRow {
    pub user_id: UserId,
    pub username: String,
    pub display_name: String,
    pub email: String,
    pub avatar_key: Option<String>,
    pub progress_pct: Option<f64>,
    pub completed_at: Option<i64>,
    pub last_activity_at: Option<i64>,
    pub enrolled_at: i64,
    /// `enrolled_at` in microseconds: the keyset position with `user_id`.
    pub enrolled_at_us: i64,
}

/// Where a page of [`list_course_learners`] starts: after the member
/// enrolled at `enrolled_at_us` (microseconds since the epoch) with `user_id`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LearnerCursor {
    pub enrolled_at_us: i64,
    pub user_id: UserId,
}

/// Newest members first (keyset on `(enrolled_at, user_id)`). `q` filters
/// on a substring of the username, display name or email. Staff with a
/// leftover enrolment are no members (BUG-288).
pub async fn list_course_learners(
    pool: &PgPool,
    course_id: CourseId,
    q: Option<&str>,
    after: Option<LearnerCursor>,
    limit: i64,
) -> Result<Vec<CourseLearnerRow>> {
    let pattern = q.map(|q| format!("%{}%", crate::like_escape(q)));
    let rows = sqlx::query_as!(
        CourseLearnerRow,
        r#"SELECT u.id AS "user_id: UserId", u.username,
                  u.display_name, u.email, u.avatar_key,
                  cp.progress_pct AS "progress_pct?",
                  (extract(epoch FROM cp.completed_at))::bigint AS "completed_at?",
                  (extract(epoch FROM cp.last_activity_at))::bigint AS "last_activity_at?",
                  (extract(epoch FROM e.enrolled_at))::bigint AS "enrolled_at!",
                  (extract(epoch FROM e.enrolled_at) * 1000000)::bigint AS "enrolled_at_us!"
           FROM course_members e
           JOIN users u ON u.id = e.user_id
           LEFT JOIN course_progress_v cp ON cp.course_id = e.course_id AND cp.user_id = e.user_id
           WHERE e.course_id = $1
             AND ($2::bigint IS NULL
                  OR (e.enrolled_at, e.user_id)
                     < ('epoch'::timestamptz + $2 * interval '1 microsecond', $3::uuid))
             AND ($5::text IS NULL OR u.username ILIKE $5 ESCAPE '\' OR u.display_name ILIKE $5 ESCAPE '\'
                  OR u.email ILIKE $5 ESCAPE '\')
           ORDER BY e.enrolled_at DESC, e.user_id DESC
           LIMIT $4"#,
        course_id.0,
        after.map(|c| c.enrolled_at_us),
        after.map(|c| c.user_id.0),
        limit,
        pattern.as_deref(),
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// A user named by an enrolment identifier, with where they stand on the
/// course (`resolve_enrol_targets`).
#[derive(Debug, Clone)]
pub struct EnrolTargetRow {
    pub user_id: UserId,
    pub username: String,
    pub display_name: String,
    pub email: String,
    pub active: bool,
    /// Holds an enrolment in the course.
    pub member: bool,
    /// `is_course_staff`: never enrolled (BUG-287).
    pub staff: bool,
}

/// The users whose lower-cased email or username is in `logins` (already
/// lower-cased by the caller).
pub async fn resolve_enrol_targets(
    pool: &PgPool,
    course_id: CourseId,
    logins: &[String],
) -> Result<Vec<EnrolTargetRow>> {
    let rows = sqlx::query_as!(
        EnrolTargetRow,
        r#"SELECT u.id AS "user_id: UserId", u.username, u.display_name, u.email,
                  u.disabled_at IS NULL AS "active!",
                  EXISTS (SELECT 1 FROM enrolments e
                          WHERE e.course_id = $1 AND e.user_id = u.id) AS "member!",
                  is_course_staff($1, u.id) AS "staff!"
           FROM users u
           WHERE lower(u.email) = ANY($2) OR lower(u.username) = ANY($2)"#,
        course_id.0,
        logins,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// A digest of one member's stored projection.
///
/// Every `activity_progress` row of the course, bookkeeping columns left out,
/// and the recorded completion (`enrolments.completed_at`; the course totals
/// are the view's, nothing stores them): the reconciliation compares it
/// before and after a re-projection to count the members whose projection had
/// drifted (schema review item 15).
pub async fn projection_fingerprint(
    conn: &mut PgConnection,
    course_id: CourseId,
    user_id: UserId,
) -> Result<String> {
    Ok(sqlx::query_scalar!(
        r#"SELECT md5(
               coalesce((SELECT string_agg((to_jsonb(ap) - 'id' - 'created_at' - 'updated_at')::text,
                                           ',' ORDER BY ap.activity_id)
                         FROM activity_progress ap
                         WHERE ap.course_id = $1 AND ap.user_id = $2), '')
               || '|' ||
               coalesce((SELECT e.completed_at::text FROM enrolments e
                         WHERE e.course_id = $1 AND e.user_id = $2), '')) AS "fingerprint!""#,
        course_id.0,
        user_id.0
    )
    .fetch_one(&mut *conn)
    .await?)
}
