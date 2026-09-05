//! Progress projections + personal trail queries (compile-checked).
//!
//! Timestamps as epoch seconds.

use ab_core::Result;
use ab_core::assessments::{ActivityProgressState, TrailRunStatus};
use ab_core::id::{
    ActivityId, ActivityProgressId, CourseId, CourseProgressId, SubmissionId, TrailId, TrailRunId,
    TrailStepId, UserId,
};
use sqlx::PgPool;

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
pub struct ActivityProgressRow {
    pub id: ActivityProgressId,
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

pub async fn upsert_activity_progress(pool: &PgPool, w: &ActivityProgressWrite) -> Result<()> {
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
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_activity_progress(
    pool: &PgPool,
    activity_id: ActivityId,
    user_id: UserId,
) -> Result<Option<ActivityProgressRow>> {
    let row = sqlx::query_as!(
        ActivityProgressRow,
        r#"SELECT id AS "id: ActivityProgressId", course_id AS "course_id: CourseId",
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
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// One learner's rows across a course (every published activity, once
/// [`ensure_course_rows`] ran).
pub async fn list_course_progress_rows(
    pool: &PgPool,
    course_id: CourseId,
    user_id: UserId,
) -> Result<Vec<ActivityProgressRow>> {
    let rows = sqlx::query_as!(
        ActivityProgressRow,
        r#"SELECT id AS "id: ActivityProgressId", course_id AS "course_id: CourseId",
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
           FROM activity_progress WHERE course_id = $1 AND user_id = $2"#,
        course_id.0,
        user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Seed `not_started` rows for every published activity without one.
///
/// Every activity is required unless its `settings.required` is `false`
/// (legacy: the assessment-level flag is not consulted); `due_at` comes
/// from the assessment / file submission behind it.
pub async fn ensure_course_rows(pool: &PgPool, course_id: CourseId, user_id: UserId) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO activity_progress (course_id, activity_id, user_id, required, due_at)
           SELECT a.course_id, a.id, $2,
                  (a.settings->>'required') IS DISTINCT FROM 'false',
                  COALESCE(s.due_at, f.due_at)
           FROM activities a
           LEFT JOIN assessments s ON s.activity_id = a.id
           LEFT JOIN file_submissions f ON f.activity_id = a.id
           WHERE a.course_id = $1 AND a.published
           ON CONFLICT (activity_id, user_id) DO NOTHING"#,
        course_id.0,
        user_id.0
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Assessment weights per activity (for the weighted course average).
pub struct ActivityWeightRow {
    pub activity_id: ActivityId,
    pub weight: f64,
}

pub async fn list_assessment_weights(
    pool: &PgPool,
    course_id: CourseId,
) -> Result<Vec<ActivityWeightRow>> {
    let rows = sqlx::query_as!(
        ActivityWeightRow,
        r#"SELECT activity_id AS "activity_id: ActivityId", weight
           FROM assessments WHERE course_id = $1"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Course progress ─────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CourseProgressRow {
    pub id: CourseProgressId,
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
pub struct CourseProgressWrite {
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

pub async fn upsert_course_progress(pool: &PgPool, w: &CourseProgressWrite) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO course_progress
               (course_id, user_id, completed_required_count, total_required_count,
                progress_pct, grade_average, weighted_grade_average, missing_required_count,
                needs_grading_count, last_activity_at, completed_at, certificate_eligible)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10), to_timestamp($11), $12)
           ON CONFLICT (course_id, user_id) DO UPDATE SET
               completed_required_count = EXCLUDED.completed_required_count,
               total_required_count = EXCLUDED.total_required_count,
               progress_pct = EXCLUDED.progress_pct, grade_average = EXCLUDED.grade_average,
               weighted_grade_average = EXCLUDED.weighted_grade_average,
               missing_required_count = EXCLUDED.missing_required_count,
               needs_grading_count = EXCLUDED.needs_grading_count,
               last_activity_at = EXCLUDED.last_activity_at,
               completed_at = EXCLUDED.completed_at,
               certificate_eligible = EXCLUDED.certificate_eligible"#,
        w.course_id.0,
        w.user_id.0,
        w.completed_required_count,
        w.total_required_count,
        w.progress_pct,
        w.grade_average,
        w.weighted_grade_average,
        w.missing_required_count,
        w.needs_grading_count,
        epoch(w.last_activity_at),
        epoch(w.completed_at),
        w.certificate_eligible
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_course_progress(
    pool: &PgPool,
    course_id: CourseId,
    user_id: UserId,
) -> Result<Option<CourseProgressRow>> {
    let row = sqlx::query_as!(
        CourseProgressRow,
        r#"SELECT id AS "id: CourseProgressId", course_id AS "course_id: CourseId",
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
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Learners known to a course: trail runs, submissions, file attempts,
/// cohort members and existing projections (for backfills).
pub async fn known_course_users(pool: &PgPool, course_id: CourseId) -> Result<Vec<UserId>> {
    let ids = sqlx::query_scalar!(
        r#"SELECT DISTINCT u.user_id AS "user_id!: UserId" FROM (
               SELECT user_id FROM trail_runs WHERE course_id = $1
               UNION SELECT user_id FROM submissions WHERE course_id = $1
               UNION SELECT user_id FROM file_submission_attempts WHERE course_id = $1
               UNION SELECT m.user_id FROM usergroup_members m
                     JOIN usergroup_courses uc ON uc.usergroup_id = m.usergroup_id
                     WHERE uc.course_id = $1
               UNION SELECT user_id FROM activity_progress WHERE course_id = $1
           ) u"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(ids)
}

pub async fn list_course_ids(pool: &PgPool) -> Result<Vec<CourseId>> {
    let ids = sqlx::query_scalar!(r#"SELECT id AS "id: CourseId" FROM courses ORDER BY id"#)
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

pub async fn get_trail(pool: &PgPool, user_id: UserId) -> Result<Option<TrailRow>> {
    let row = sqlx::query_as!(
        TrailRow,
        r#"SELECT id AS "id: TrailId", user_id AS "user_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM trails WHERE user_id = $1"#,
        user_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Create-or-get (one trail per user).
pub async fn ensure_trail(pool: &PgPool, user_id: UserId) -> Result<TrailRow> {
    sqlx::query!(
        "INSERT INTO trails (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
        user_id.0
    )
    .execute(pool)
    .await?;
    get_trail(pool, user_id)
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

pub async fn list_trail_runs(pool: &PgPool, trail_id: TrailId) -> Result<Vec<TrailRunRow>> {
    let rows = sqlx::query_as!(
        TrailRunRow,
        r#"SELECT id AS "id: TrailRunId", trail_id AS "trail_id: TrailId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  status AS "status: TrailRunStatus", data,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM trail_runs WHERE trail_id = $1 ORDER BY created_at, id"#,
        trail_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_trail_run(
    pool: &PgPool,
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
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Whether the learner has a run for the course (enrollment signal).
pub async fn has_trail_run(pool: &PgPool, course_id: CourseId, user_id: UserId) -> Result<bool> {
    let exists = sqlx::query_scalar!(
        r#"SELECT EXISTS(SELECT 1 FROM trail_runs WHERE course_id = $1 AND user_id = $2)
           AS "exists!""#,
        course_id.0,
        user_id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(exists)
}

/// Create-or-get the run for a course.
pub async fn ensure_trail_run(
    pool: &PgPool,
    trail_id: TrailId,
    course_id: CourseId,
    user_id: UserId,
) -> Result<TrailRunRow> {
    sqlx::query!(
        r#"INSERT INTO trail_runs (trail_id, course_id, user_id) VALUES ($1, $2, $3)
           ON CONFLICT (trail_id, course_id) DO NOTHING"#,
        trail_id.0,
        course_id.0,
        user_id.0
    )
    .execute(pool)
    .await?;
    get_trail_run(pool, trail_id, course_id)
        .await?
        .ok_or_else(|| ab_core::Error::not_found("trail run"))
}

/// Remove the run and its steps (cascade).
pub async fn delete_trail_run(
    pool: &PgPool,
    trail_id: TrailId,
    course_id: CourseId,
) -> Result<bool> {
    let deleted = sqlx::query!(
        "DELETE FROM trail_runs WHERE trail_id = $1 AND course_id = $2",
        trail_id.0,
        course_id.0
    )
    .execute(pool)
    .await?;
    Ok(deleted.rows_affected() > 0)
}

#[derive(Debug, Clone)]
pub struct TrailStepRow {
    pub id: TrailStepId,
    pub trail_run_id: TrailRunId,
    pub trail_id: TrailId,
    pub activity_id: ActivityId,
    pub course_id: CourseId,
    pub user_id: UserId,
    pub complete: bool,
    pub teacher_verified: bool,
    pub grade: i32,
    pub data: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn list_trail_steps(pool: &PgPool, trail_id: TrailId) -> Result<Vec<TrailStepRow>> {
    let rows = sqlx::query_as!(
        TrailStepRow,
        r#"SELECT id AS "id: TrailStepId", trail_run_id AS "trail_run_id: TrailRunId",
                  trail_id AS "trail_id: TrailId", activity_id AS "activity_id: ActivityId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  complete, teacher_verified, grade, data,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM trail_steps WHERE trail_id = $1 ORDER BY created_at, id"#,
        trail_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Insert a completed step; `false` when it already existed.
pub async fn insert_trail_step(
    pool: &PgPool,
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
    .execute(pool)
    .await?;
    Ok(inserted.rows_affected() == 1)
}

pub async fn delete_trail_step(
    pool: &PgPool,
    trail_id: TrailId,
    activity_id: ActivityId,
) -> Result<bool> {
    let deleted = sqlx::query!(
        "DELETE FROM trail_steps WHERE trail_id = $1 AND activity_id = $2",
        trail_id.0,
        activity_id.0
    )
    .execute(pool)
    .await?;
    Ok(deleted.rows_affected() > 0)
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
