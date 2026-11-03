//! Progress projections + personal trail queries (compile-checked).
//!
//! Timestamps as epoch seconds.

use ab_core::Result;
use ab_core::assessments::{ActivityProgressState, TrailRunStatus};
use ab_core::id::{ActivityId, CourseId, SubmissionId, TrailId, TrailRunId, TrailStepId, UserId};
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
    pub state: ActivityProgressState,
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
    pub state: ActivityProgressState,
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
               (course_id, activity_id, user_id, state, required, score, passed,
                best_submission_id, latest_submission_id, attempt_count, started_at,
                last_activity_at, submitted_at, graded_at, completed_at, due_at, is_late,
                teacher_action_required, status_reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, to_timestamp($11),
                   to_timestamp($12), to_timestamp($13), to_timestamp($14), to_timestamp($15),
                   to_timestamp($16), $17, $18, $19)
           ON CONFLICT (activity_id, user_id) DO UPDATE SET
               state = EXCLUDED.state, required = EXCLUDED.required, score = EXCLUDED.score,
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
        w.state.as_str(),
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
                  state AS "state: ActivityProgressState", required, score, passed,
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
                  state AS "state: ActivityProgressState", required, score, passed,
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
           FROM (SELECT a.id, a.activity_type = 'file_submission' OR a.required
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
                  a.activity_type = 'file_submission' OR s.id IS NOT NULL OR a.required,
                  COALESCE(s.due_at, f.due_at)
           FROM activities a
           LEFT JOIN assessments s ON s.activity_id = a.id
           LEFT JOIN file_submissions f ON f.activity_id = a.id
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
             AND (o.expires_at IS NULL OR o.expires_at > now() OR o.due_extended)
           UNION ALL
           SELECT f.activity_id, (extract(epoch FROM fo.due_at))::bigint
           FROM file_submission_overrides fo
           JOIN file_submissions f ON f.id = fo.file_submission_id
           WHERE f.course_id = $1 AND fo.user_id = $2"#,
        course_id.0,
        user_id.0
    )
    .fetch_all(db)
    .await?;
    Ok(rows)
}

/// Assessment weights per activity (for the weighted course average).
pub struct ActivityWeightRow {
    pub activity_id: ActivityId,
    pub weight: f64,
}

pub async fn list_assessment_weights<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
) -> Result<Vec<ActivityWeightRow>> {
    let rows = sqlx::query_as!(
        ActivityWeightRow,
        r#"SELECT activity_id AS "activity_id: ActivityId", weight::float8 AS "weight!"
           FROM assessments WHERE course_id = $1"#,
        course_id.0
    )
    .fetch_all(db)
    .await?;
    Ok(rows)
}

// ── Course progress ─────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
/// Keyed by `(course_id, user_id)` (REWRITE 5.6 n12).
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
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
/// What the projector writes. `progress_pct` and `certificate_eligible`
/// are not written: they are generated columns over the counts and
/// `completed_at` (items 14/15).
pub struct CourseProgressWrite {
    pub course_id: CourseId,
    pub user_id: UserId,
    pub completed_required_count: i32,
    pub total_required_count: i32,
    pub grade_average: Option<f64>,
    pub weighted_grade_average: Option<f64>,
    pub missing_required_count: i32,
    pub needs_grading_count: i32,
    pub last_activity_at: Option<i64>,
    /// The course completion; set exactly when `certificate_eligible`.
    pub completed_at: Option<i64>,
    /// Every required activity done by a member: the stored flag's rule.
    pub certificate_eligible: bool,
}

pub async fn upsert_course_progress<'e>(
    db: impl sqlx::PgExecutor<'e>,
    w: &CourseProgressWrite,
) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO course_progress
               (course_id, user_id, completed_required_count, total_required_count,
                grade_average, weighted_grade_average, missing_required_count,
                needs_grading_count, last_activity_at, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9), to_timestamp($10))
           ON CONFLICT (course_id, user_id) DO UPDATE SET
               completed_required_count = EXCLUDED.completed_required_count,
               total_required_count = EXCLUDED.total_required_count,
               grade_average = EXCLUDED.grade_average,
               weighted_grade_average = EXCLUDED.weighted_grade_average,
               missing_required_count = EXCLUDED.missing_required_count,
               needs_grading_count = EXCLUDED.needs_grading_count,
               last_activity_at = EXCLUDED.last_activity_at,
               completed_at = EXCLUDED.completed_at"#,
        w.course_id.0,
        w.user_id.0,
        w.completed_required_count,
        w.total_required_count,
        w.grade_average,
        w.weighted_grade_average,
        w.missing_required_count,
        w.needs_grading_count,
        epoch(w.last_activity_at),
        epoch(w.completed_at)
    )
    .execute(db)
    .await?;
    Ok(())
}

pub async fn get_course_progress<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
    user_id: UserId,
) -> Result<Option<CourseProgressRow>> {
    let row = sqlx::query_as!(
        CourseProgressRow,
        r#"SELECT course_id AS "course_id: CourseId",
                  user_id AS "user_id: UserId", completed_required_count, total_required_count,
                  progress_pct, grade_average, weighted_grade_average, missing_required_count,
                  needs_grading_count,
                  (extract(epoch FROM last_activity_at))::bigint AS "last_activity_at?",
                  (extract(epoch FROM completed_at))::bigint AS "completed_at?",
                  certificate_eligible,
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM course_progress WHERE course_id = $1 AND user_id = $2"#,
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
        r#"SELECT user_id AS "user_id!: UserId" FROM enrolments
           WHERE course_id = $1 AND NOT is_course_staff(course_id, user_id)"#,
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

#[derive(Debug, Clone)]
pub struct TrailRow {
    pub id: TrailId,
    pub user_id: UserId,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn get_trail<'e>(
    db: impl sqlx::PgExecutor<'e>,
    user_id: UserId,
) -> Result<Option<TrailRow>> {
    let row = sqlx::query_as!(
        TrailRow,
        r#"SELECT id AS "id: TrailId", user_id AS "user_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM trails WHERE user_id = $1"#,
        user_id.0
    )
    .fetch_optional(db)
    .await?;
    Ok(row)
}

/// Create-or-get (one trail per user).
pub async fn ensure_trail(conn: &mut PgConnection, user_id: UserId) -> Result<TrailRow> {
    sqlx::query!(
        "INSERT INTO trails (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
        user_id.0
    )
    .execute(&mut *conn)
    .await?;
    get_trail(&mut *conn, user_id)
        .await?
        .ok_or_else(|| ab_core::Error::not_found("trail"))
}

#[derive(Debug, Clone)]
pub struct TrailRunRow {
    pub id: TrailRunId,
    pub trail_id: TrailId,
    pub course_id: CourseId,
    pub user_id: UserId,
    pub status: TrailRunStatus,
    pub data: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
}

/// One course the user is enrolled in, as the trail lists it.
///
/// The enrolment (the membership, REWRITE 5.6 n5) with the legacy run's id and
/// status where the run exists (every release still writes one; once the
/// trail tables go there is none).
#[derive(Debug, Clone)]
pub struct EnrolledRunRow {
    pub course_id: CourseId,
    pub user_id: UserId,
    pub run_id: Option<TrailRunId>,
    /// The run's status, `in_progress` without one.
    pub status: TrailRunStatus,
    pub enrolled_at: i64,
    /// The run's `updated_at`, `enrolled_at` without one.
    pub updated_at: i64,
}

/// The user's member enrolments, oldest first: an enrolment in a course the
/// user now staffs is kept (it counts again once they leave the staff) but
/// not listed (BUG-292).
pub async fn list_enrolled_runs(pool: &PgPool, user_id: UserId) -> Result<Vec<EnrolledRunRow>> {
    let rows = sqlx::query_as!(
        EnrolledRunRow,
        r#"SELECT e.course_id AS "course_id: CourseId", e.user_id AS "user_id: UserId",
                  r.id AS "run_id?: TrailRunId",
                  coalesce(r.status, 'in_progress') AS "status!: TrailRunStatus",
                  (extract(epoch FROM e.enrolled_at))::bigint AS "enrolled_at!",
                  (extract(epoch FROM coalesce(r.updated_at, e.enrolled_at)))::bigint
                      AS "updated_at!"
           FROM enrolments e
           LEFT JOIN trail_runs r ON r.course_id = e.course_id AND r.user_id = e.user_id
           WHERE e.user_id = $1 AND NOT is_course_staff(e.course_id, e.user_id)
           ORDER BY e.enrolled_at, e.course_id"#,
        user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_trail_run<'e>(
    db: impl sqlx::PgExecutor<'e>,
    trail_id: TrailId,
    course_id: CourseId,
) -> Result<Option<TrailRunRow>> {
    let row = sqlx::query_as!(
        TrailRunRow,
        r#"SELECT id AS "id: TrailRunId", trail_id AS "trail_id: TrailId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  status AS "status: TrailRunStatus", data,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM trail_runs WHERE trail_id = $1 AND course_id = $2"#,
        trail_id.0,
        course_id.0
    )
    .fetch_optional(db)
    .await?;
    Ok(row)
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
        r#"SELECT EXISTS(SELECT 1 FROM enrolments WHERE course_id = $1 AND user_id = $2
                         AND NOT is_course_staff(course_id, user_id))
           AS "exists!""#,
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

/// Create-or-get the run for a course; `true` when it was just created.
pub async fn ensure_trail_run(
    conn: &mut PgConnection,
    trail_id: TrailId,
    course_id: CourseId,
    user_id: UserId,
) -> Result<(TrailRunRow, bool)> {
    let created = sqlx::query!(
        r#"INSERT INTO trail_runs (trail_id, course_id, user_id) VALUES ($1, $2, $3)
           ON CONFLICT (trail_id, course_id) DO NOTHING"#,
        trail_id.0,
        course_id.0,
        user_id.0
    )
    .execute(&mut *conn)
    .await?
    .rows_affected()
        == 1;
    let run = get_trail_run(&mut *conn, trail_id, course_id)
        .await?
        .ok_or_else(|| ab_core::Error::not_found("trail run"))?;
    Ok((run, created))
}

/// Enrol `user_id` in the course (the membership fact, REWRITE 5.6 n5);
/// `true` when this call created it. Written with the trail run, in the
/// same transaction.
pub async fn enrol(conn: &mut PgConnection, course_id: CourseId, user_id: UserId) -> Result<bool> {
    let created = sqlx::query!(
        "INSERT INTO enrolments (course_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        course_id.0,
        user_id.0
    )
    .execute(&mut *conn)
    .await?
    .rows_affected()
        == 1;
    Ok(created)
}

/// End the membership (leave, roster removal); `true` when there was one.
pub async fn unenrol(
    conn: &mut PgConnection,
    course_id: CourseId,
    user_id: UserId,
) -> Result<bool> {
    let deleted = sqlx::query!(
        "DELETE FROM enrolments WHERE course_id = $1 AND user_id = $2",
        course_id.0,
        user_id.0
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

/// Remove the run and its steps (cascade).
pub async fn delete_trail_run<'e>(
    db: impl sqlx::PgExecutor<'e>,
    trail_id: TrailId,
    course_id: CourseId,
) -> Result<bool> {
    let deleted = sqlx::query!(
        "DELETE FROM trail_runs WHERE trail_id = $1 AND course_id = $2",
        trail_id.0,
        course_id.0
    )
    .execute(db)
    .await?;
    Ok(deleted.rows_affected() > 0)
}

/// A lesson-type activity the user completed, as the trail lists it.
///
/// The `completions` row with the legacy step's id and teacher fields where
/// the step exists. Graded kinds are left out: they complete through their
/// submissions and never had a step.
#[derive(Debug, Clone)]
pub struct CompletedStepRow {
    pub activity_id: ActivityId,
    pub course_id: CourseId,
    pub step_id: Option<TrailStepId>,
    pub teacher_verified: bool,
    pub grade: i32,
    /// The step's `created_at`, else the completion's time.
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn list_completed_steps(pool: &PgPool, user_id: UserId) -> Result<Vec<CompletedStepRow>> {
    let rows = sqlx::query_as!(
        CompletedStepRow,
        r#"SELECT c.activity_id AS "activity_id: ActivityId", a.course_id AS "course_id: CourseId",
                  s.id AS "step_id?: TrailStepId",
                  coalesce(s.teacher_verified, false) AS "teacher_verified!",
                  coalesce(s.grade, 0) AS "grade!",
                  (extract(epoch FROM coalesce(s.created_at, c.completed_at)))::bigint
                      AS "created_at!",
                  (extract(epoch FROM coalesce(s.updated_at, c.completed_at)))::bigint
                      AS "updated_at!"
           FROM completions c
           JOIN activities a ON a.id = c.activity_id
           LEFT JOIN trail_steps s ON s.activity_id = c.activity_id AND s.user_id = c.user_id
           WHERE c.user_id = $1 AND a.activity_type <> 'file_submission'
             AND NOT EXISTS (SELECT 1 FROM assessments x WHERE x.activity_id = a.id)
           ORDER BY coalesce(s.created_at, c.completed_at), c.activity_id"#,
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

/// How many members' `course_progress_v` row disagrees with their stored
/// `course_progress` row (or has none).
///
/// Compares the counts, percent, certificate flag and `completed_at` within
/// a second: the projector stores whole seconds, and a lesson mark stamps
/// its row from the server's clock just after the completion's `now()`. `maintenance:reconcile` logs it after
/// the re-projection; a month of zeros lets readers move to the view
/// (REWRITE 5.6 n8 step 4).
pub async fn course_progress_view_drift(pool: &PgPool) -> Result<i64> {
    let drift = sqlx::query_scalar!(
        r#"SELECT count(*) AS "drift!"
           FROM course_progress_v v
           LEFT JOIN course_progress p ON p.course_id = v.course_id AND p.user_id = v.user_id
           WHERE (p.total_required_count, p.completed_required_count, p.progress_pct,
                  p.certificate_eligible, p.completed_at IS NULL)
                 IS DISTINCT FROM
                 (v.total_required_count, v.completed_required_count, v.progress_pct,
                  v.certificate_eligible, v.completed_at IS NULL)
              OR abs(extract(epoch FROM p.completed_at - v.completed_at)) >= 1"#
    )
    .fetch_one(pool)
    .await?;
    Ok(drift)
}

/// Insert a completed step; `false` when it already existed.
pub async fn insert_trail_step<'e>(
    db: impl sqlx::PgExecutor<'e>,
    run: &TrailRunRow,
    activity_id: ActivityId,
) -> Result<bool> {
    let inserted = sqlx::query!(
        r#"INSERT INTO trail_steps (trail_run_id, trail_id, activity_id, course_id, user_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (trail_run_id, activity_id) DO NOTHING"#,
        run.id.0,
        run.trail_id.0,
        activity_id.0,
        run.course_id.0,
        run.user_id.0
    )
    .execute(db)
    .await
    .map_err(
        |e| match e.as_database_error().and_then(|d| d.constraint()) {
            // The run vanished under us (course deleted, …): a 404, not a 500.
            Some("trail_steps_trail_run_id_fkey") => ab_core::Error::not_found("trail run"),
            _ => e.into(),
        },
    )?;
    Ok(inserted.rows_affected() == 1)
}

pub async fn delete_trail_step<'e>(
    db: impl sqlx::PgExecutor<'e>,
    trail_id: TrailId,
    activity_id: ActivityId,
) -> Result<bool> {
    let deleted = sqlx::query!(
        "DELETE FROM trail_steps WHERE trail_id = $1 AND activity_id = $2",
        trail_id.0,
        activity_id.0
    )
    .execute(db)
    .await?;
    Ok(deleted.rows_affected() > 0)
}

/// One learner's `course_progress.progress_pct` per course, in one query.
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
        r#"SELECT c.course_id AS "course_id: CourseId", c.progress_pct,
                  EXISTS (SELECT 1 FROM activity_progress p
                           WHERE p.course_id = c.course_id AND p.user_id = c.user_id
                             AND p.state <> 'not_started') AS "started!"
           FROM course_progress c WHERE c.user_id = $1 AND c.course_id = ANY($2)"#,
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
           FROM enrolments e
           LEFT JOIN course_progress cp ON cp.course_id = e.course_id AND cp.user_id = e.user_id
           WHERE e.user_id = $1 AND e.course_id = ANY($2)
             AND NOT is_course_staff(e.course_id, e.user_id)"#,
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
                  (SELECT count(*) FROM enrolments e
                   WHERE e.course_id = c.id AND NOT is_course_staff(e.course_id, e.user_id)) AS "learners!",
                  (SELECT count(*) FROM activities a WHERE a.course_id = c.id) AS "activities!",
                  (SELECT count(*) FROM submissions s
                   WHERE s.course_id = c.id AND NOT s.preview AND s.status IN ('submitted', 'pending'))
                  + (SELECT count(*) FROM file_submission_attempts fa
                     WHERE fa.course_id = c.id AND NOT fa.preview AND fa.status = 'submitted') AS "ungraded!"
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
           FROM enrolments e
           JOIN users u ON u.id = e.user_id
           LEFT JOIN course_progress cp ON cp.course_id = e.course_id AND cp.user_id = e.user_id
           WHERE e.course_id = $1
             AND ($2::bigint IS NULL
                  OR (e.enrolled_at, e.user_id)
                     < ('epoch'::timestamptz + $2 * interval '1 microsecond', $3::uuid))
             AND NOT is_course_staff(e.course_id, e.user_id)
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

/// A roster cursor of the release before enrolments.
///
/// The trail run id of the last member shown, resolved to that member's enrolment keyset (or the
/// run's own time when the enrolment is gone); `None` for no such run.
// ponytail: goes with the trail tables, a release after the cursor changed.
pub async fn legacy_learner_cursor(
    pool: &PgPool,
    course_id: CourseId,
    run_id: TrailRunId,
) -> Result<Option<LearnerCursor>> {
    let row = sqlx::query_as!(
        LearnerCursor,
        r#"SELECT (extract(epoch FROM coalesce(e.enrolled_at, r.created_at)) * 1000000)::bigint
                      AS "enrolled_at_us!",
                  r.user_id AS "user_id: UserId"
           FROM trail_runs r
           LEFT JOIN enrolments e ON e.course_id = r.course_id AND e.user_id = r.user_id
           WHERE r.id = $1 AND r.course_id = $2"#,
        run_id.0,
        course_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
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
/// Every `activity_progress` row of the course and the `course_progress` row,
/// bookkeeping columns left out: the reconciliation compares it before and
/// after a re-projection to count the members whose projection had drifted
/// (schema review item 15).
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
               coalesce((SELECT (to_jsonb(cp) - 'id' - 'created_at' - 'updated_at')::text
                         FROM course_progress cp
                         WHERE cp.course_id = $1 AND cp.user_id = $2), '')) AS "fingerprint!""#,
        course_id.0,
        user_id.0
    )
    .fetch_one(&mut *conn)
    .await?)
}
