//! Analytics reads and writes (legacy `db/analytics.py` + the loaders in
//! `services/analytics/queries.py`).
//!
//! The read models are computed in the domain over an in-memory context
//! loaded for a set of course ids, so every query here is static,
//! compile-checked SQL over `= ANY($ids)` with optional bounds expressed as
//! `($n IS NULL OR …)`. Timestamps are epoch seconds; dates travel as
//! `YYYY-MM-DD` text (sqlx has no `date` type without a calendar crate).

use ab_core::Result;
use ab_core::assessments::{
    ActivityProgressState, AssessmentKind, GradingMode, Lifecycle, SubmissionStatus,
};
use ab_core::id::{
    ActivityId, AssessmentId, BulkActionId, ChapterId, CourseId, GradingEntryId, InterventionId,
    SavedViewId, SubmissionId, TrailRunId, UserId, UsergroupId,
};
use sqlx::PgPool;

/// Epoch seconds → `to_timestamp()` argument. Exact below 2^53.
#[allow(clippy::cast_precision_loss)]
const fn epoch(t: Option<i64>) -> Option<f64> {
    match t {
        Some(t) => Some(t as f64),
        None => None,
    }
}

fn uuids<T: Copy + Into<uuid::Uuid>>(ids: &[T]) -> Vec<uuid::Uuid> {
    ids.iter().map(|id| (*id).into()).collect()
}

// ── Scope ───────────────────────────────────────────────────────────────────

/// Courses the user created or actively co-authors (`resource_authors`).
pub async fn teacher_course_ids(pool: &PgPool, user_id: UserId) -> Result<Vec<CourseId>> {
    let rows = sqlx::query_scalar!(
        r#"SELECT c.id AS "id: CourseId"
           FROM courses c
           WHERE c.creator_id = $1 OR EXISTS (
                 SELECT 1 FROM resource_authors ra
                 WHERE ra.course_id = c.id AND ra.user_id = $1 AND ra.status = 'active')
           ORDER BY c.id"#,
        user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn all_course_ids(pool: &PgPool) -> Result<Vec<CourseId>> {
    let rows = sqlx::query_scalar!(r#"SELECT id AS "id: CourseId" FROM courses ORDER BY id"#)
        .fetch_all(pool)
        .await?;
    Ok(rows)
}

/// Course id → every author id (creator + active co-authors).
#[derive(Debug, Clone)]
pub struct CourseAuthorRow {
    pub course_id: CourseId,
    pub user_id: UserId,
}

pub async fn list_course_authors(
    pool: &PgPool,
    course_ids: &[CourseId],
) -> Result<Vec<CourseAuthorRow>> {
    let ids = uuids(course_ids);
    let rows = sqlx::query_as!(
        CourseAuthorRow,
        r#"SELECT c.id AS "course_id!: CourseId", c.creator_id AS "user_id!: UserId"
           FROM courses c WHERE c.id = ANY($1) AND c.creator_id IS NOT NULL
           UNION
           SELECT ra.course_id AS "course_id!: CourseId", ra.user_id AS "user_id!: UserId"
           FROM resource_authors ra
           WHERE ra.course_id = ANY($1) AND ra.status = 'active'"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Context loaders ─────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CourseInfoRow {
    pub id: CourseId,
    pub name: String,
    pub creator_id: Option<UserId>,
    pub updated_at: i64,
}

pub async fn list_courses(pool: &PgPool, course_ids: &[CourseId]) -> Result<Vec<CourseInfoRow>> {
    let ids = uuids(course_ids);
    let rows = sqlx::query_as!(
        CourseInfoRow,
        r#"SELECT id AS "id: CourseId", name, creator_id AS "creator_id: UserId",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM courses WHERE id = ANY($1) ORDER BY id"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct ChapterInfoRow {
    pub id: ChapterId,
    pub course_id: CourseId,
    pub name: String,
    pub position: i32,
}

pub async fn list_chapters(pool: &PgPool, course_ids: &[CourseId]) -> Result<Vec<ChapterInfoRow>> {
    let ids = uuids(course_ids);
    let rows = sqlx::query_as!(
        ChapterInfoRow,
        r#"SELECT id AS "id: ChapterId", course_id AS "course_id: CourseId", name, position
           FROM chapters WHERE course_id = ANY($1) ORDER BY course_id, position, id"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct ActivityInfoRow {
    pub id: ActivityId,
    pub course_id: CourseId,
    pub chapter_id: ChapterId,
    pub name: String,
    pub activity_type: String,
    pub position: i32,
    pub published: bool,
    pub updated_at: i64,
}

pub async fn list_activities(
    pool: &PgPool,
    course_ids: &[CourseId],
) -> Result<Vec<ActivityInfoRow>> {
    let ids = uuids(course_ids);
    let rows = sqlx::query_as!(
        ActivityInfoRow,
        r#"SELECT id AS "id: ActivityId", course_id AS "course_id: CourseId",
                  chapter_id AS "chapter_id: ChapterId", name, activity_type, position, published,
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM activities WHERE course_id = ANY($1) ORDER BY course_id, chapter_id, position, id"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct AssessmentInfoRow {
    pub id: AssessmentId,
    pub activity_id: ActivityId,
    pub course_id: CourseId,
    pub kind: AssessmentKind,
    pub title: String,
    pub lifecycle: Lifecycle,
    pub grading_mode: GradingMode,
    pub passing_score: f64,
    pub due_at: Option<i64>,
}

pub async fn list_assessments(
    pool: &PgPool,
    course_ids: &[CourseId],
) -> Result<Vec<AssessmentInfoRow>> {
    let ids = uuids(course_ids);
    let rows = sqlx::query_as!(
        AssessmentInfoRow,
        r#"SELECT id AS "id: AssessmentId", activity_id AS "activity_id: ActivityId",
                  course_id AS "course_id: CourseId", kind AS "kind: AssessmentKind", title,
                  lifecycle AS "lifecycle: Lifecycle", grading_mode AS "grading_mode: GradingMode",
                  passing_score, (extract(epoch FROM due_at))::bigint AS "due_at?"
           FROM assessments WHERE course_id = ANY($1) ORDER BY id"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// A non-draft submission with the fields the read models need.
#[derive(Debug, Clone)]
pub struct SubmissionInfoRow {
    pub id: SubmissionId,
    pub assessment_id: AssessmentId,
    pub course_id: CourseId,
    pub user_id: UserId,
    pub status: SubmissionStatus,
    pub auto_score: Option<f64>,
    pub final_score: Option<f64>,
    pub is_late: bool,
    pub violation_count: i32,
    pub duration_seconds: Option<i32>,
    pub started_at: Option<i64>,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub grading: serde_json::Value,
}

/// Non-draft submissions in the courses, optionally only those submitted
/// (or, unsubmitted, updated) at or after `since` (epoch seconds).
pub async fn list_submissions(
    pool: &PgPool,
    course_ids: &[CourseId],
    since: Option<i64>,
) -> Result<Vec<SubmissionInfoRow>> {
    let ids = uuids(course_ids);
    let rows = sqlx::query_as!(
        SubmissionInfoRow,
        r#"SELECT id AS "id: SubmissionId", assessment_id AS "assessment_id: AssessmentId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  status AS "status: SubmissionStatus", auto_score, final_score, is_late,
                  violation_count, duration_seconds,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM graded_at))::bigint AS "graded_at?",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!",
                  grading
           FROM submissions
           WHERE course_id = ANY($1) AND status <> 'draft'
             AND ($2::double precision IS NULL
                  OR COALESCE(submitted_at, updated_at) >= to_timestamp($2))
           ORDER BY id"#,
        &ids,
        epoch(since)
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct ProgressInfoRow {
    pub course_id: CourseId,
    pub activity_id: ActivityId,
    pub user_id: UserId,
    pub state: ActivityProgressState,
    pub required: bool,
    pub started_at: Option<i64>,
    pub last_activity_at: Option<i64>,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
    pub completed_at: Option<i64>,
}

pub async fn list_activity_progress(
    pool: &PgPool,
    course_ids: &[CourseId],
) -> Result<Vec<ProgressInfoRow>> {
    let ids = uuids(course_ids);
    let rows = sqlx::query_as!(
        ProgressInfoRow,
        r#"SELECT course_id AS "course_id: CourseId", activity_id AS "activity_id: ActivityId",
                  user_id AS "user_id: UserId", state AS "state: ActivityProgressState", required,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM last_activity_at))::bigint AS "last_activity_at?",
                  (extract(epoch FROM submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM graded_at))::bigint AS "graded_at?",
                  (extract(epoch FROM completed_at))::bigint AS "completed_at?"
           FROM activity_progress WHERE course_id = ANY($1) ORDER BY id"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct CourseProgressInfoRow {
    pub course_id: CourseId,
    pub user_id: UserId,
    pub completed_required_count: i32,
    pub total_required_count: i32,
    pub progress_pct: f64,
    pub certificate_eligible: bool,
    pub last_activity_at: Option<i64>,
}

pub async fn list_course_progress(
    pool: &PgPool,
    course_ids: &[CourseId],
) -> Result<Vec<CourseProgressInfoRow>> {
    let ids = uuids(course_ids);
    let rows = sqlx::query_as!(
        CourseProgressInfoRow,
        r#"SELECT course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  completed_required_count, total_required_count, progress_pct, certificate_eligible,
                  (extract(epoch FROM last_activity_at))::bigint AS "last_activity_at?"
           FROM course_progress WHERE course_id = ANY($1) ORDER BY id"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct TrailRunInfoRow {
    pub id: TrailRunId,
    pub course_id: CourseId,
    pub user_id: UserId,
}

pub async fn list_trail_runs(
    pool: &PgPool,
    course_ids: &[CourseId],
) -> Result<Vec<TrailRunInfoRow>> {
    let ids = uuids(course_ids);
    let rows = sqlx::query_as!(
        TrailRunInfoRow,
        r#"SELECT id AS "id: TrailRunId", course_id AS "course_id: CourseId",
                  user_id AS "user_id: UserId"
           FROM trail_runs WHERE course_id = ANY($1) ORDER BY id"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct CertificateInfoRow {
    pub course_id: CourseId,
    pub user_id: UserId,
    pub created_at: i64,
}

pub async fn list_certificates(
    pool: &PgPool,
    course_ids: &[CourseId],
) -> Result<Vec<CertificateInfoRow>> {
    let ids = uuids(course_ids);
    let rows = sqlx::query_as!(
        CertificateInfoRow,
        r#"SELECT c.course_id AS "course_id: CourseId", cu.user_id AS "user_id: UserId",
                  (extract(epoch FROM cu.created_at))::bigint AS "created_at!"
           FROM certificate_users cu
           JOIN certifications c ON c.id = cu.certification_id
           WHERE c.course_id = ANY($1) ORDER BY cu.id"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct UserInfoRow {
    pub id: UserId,
    pub username: String,
    pub display_name: String,
}

pub async fn list_users(pool: &PgPool, user_ids: &[UserId]) -> Result<Vec<UserInfoRow>> {
    let ids = uuids(user_ids);
    let rows = sqlx::query_as!(
        UserInfoRow,
        r#"SELECT id AS "id: UserId", username, display_name FROM users WHERE id = ANY($1)"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct MembershipRow {
    pub user_id: UserId,
    pub usergroup_id: UsergroupId,
    pub usergroup_name: String,
}

/// Cohort memberships of the given users, with the cohort names.
pub async fn list_memberships(pool: &PgPool, user_ids: &[UserId]) -> Result<Vec<MembershipRow>> {
    let ids = uuids(user_ids);
    let rows = sqlx::query_as!(
        MembershipRow,
        r#"SELECT m.user_id AS "user_id: UserId", m.usergroup_id AS "usergroup_id: UsergroupId",
                  g.name AS usergroup_name
           FROM usergroup_members m JOIN usergroups g ON g.id = m.usergroup_id
           WHERE m.user_id = ANY($1) ORDER BY g.name, m.user_id"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Event log ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct NewEvent<'a> {
    pub event_type: &'a str,
    pub course_id: Option<CourseId>,
    pub activity_id: Option<ActivityId>,
    pub assessment_id: Option<AssessmentId>,
    pub submission_id: Option<SubmissionId>,
    pub user_id: Option<UserId>,
    pub actor_id: Option<UserId>,
    pub payload: &'a serde_json::Value,
}

pub async fn insert_event(pool: &PgPool, e: NewEvent<'_>) -> Result<()> {
    sqlx::query!(
        r"INSERT INTO analytics_events
              (event_type, course_id, activity_id, assessment_id, submission_id, user_id, actor_id, payload)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        e.event_type,
        e.course_id.map(|c| c.0),
        e.activity_id.map(|a| a.0),
        e.assessment_id.map(|a| a.0),
        e.submission_id.map(|s| s.0),
        e.user_id.map(|u| u.0),
        e.actor_id.map(|u| u.0),
        e.payload
    )
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct EventInfoRow {
    pub event_type: String,
    pub course_id: Option<CourseId>,
    pub activity_id: Option<ActivityId>,
    pub assessment_id: Option<AssessmentId>,
    pub user_id: Option<UserId>,
    pub occurred_at: i64,
}

/// Course-scoped events at or after `since`.
pub async fn list_events(
    pool: &PgPool,
    course_ids: &[CourseId],
    since: Option<i64>,
) -> Result<Vec<EventInfoRow>> {
    let ids = uuids(course_ids);
    let rows = sqlx::query_as!(
        EventInfoRow,
        r#"SELECT event_type, course_id AS "course_id: CourseId",
                  activity_id AS "activity_id: ActivityId",
                  assessment_id AS "assessment_id: AssessmentId", user_id AS "user_id: UserId",
                  (extract(epoch FROM occurred_at))::bigint AS "occurred_at!"
           FROM analytics_events
           WHERE course_id = ANY($1)
             AND ($2::double precision IS NULL OR occurred_at >= to_timestamp($2))
           ORDER BY occurred_at, id"#,
        &ids,
        epoch(since)
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Audit history sources (assessment detail) ───────────────────────────────

#[derive(Debug, Clone)]
pub struct GradingEntryAuditRow {
    pub id: GradingEntryId,
    pub submission_id: SubmissionId,
    pub user_id: UserId,
    pub graded_by: Option<UserId>,
    pub final_score: f64,
    pub published_at: Option<i64>,
    pub created_at: i64,
}

pub async fn list_grading_entries_for_assessment(
    pool: &PgPool,
    assessment_id: AssessmentId,
) -> Result<Vec<GradingEntryAuditRow>> {
    let rows = sqlx::query_as!(
        GradingEntryAuditRow,
        r#"SELECT e.id AS "id: GradingEntryId", e.submission_id AS "submission_id: SubmissionId",
                  s.user_id AS "user_id: UserId", e.graded_by AS "graded_by: UserId",
                  e.final_score,
                  (extract(epoch FROM e.published_at))::bigint AS "published_at?",
                  (extract(epoch FROM e.created_at))::bigint AS "created_at!"
           FROM grading_entries e JOIN submissions s ON s.id = e.submission_id
           WHERE s.assessment_id = $1
           ORDER BY e.created_at DESC, e.id DESC"#,
        assessment_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct BulkActionAuditRow {
    pub id: BulkActionId,
    pub performed_by: Option<UserId>,
    pub action_type: String,
    pub status: String,
    pub target_user_ids: Vec<UserId>,
    pub affected_count: i32,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

pub async fn list_bulk_actions_for_assessment(
    pool: &PgPool,
    assessment_id: AssessmentId,
) -> Result<Vec<BulkActionAuditRow>> {
    let rows = sqlx::query_as!(
        BulkActionAuditRow,
        r#"SELECT id AS "id: BulkActionId", performed_by AS "performed_by: UserId", action_type,
                  status, target_user_ids AS "target_user_ids: Vec<UserId>", affected_count,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM completed_at))::bigint AS "completed_at?"
           FROM bulk_actions WHERE assessment_id = $1 ORDER BY created_at DESC"#,
        assessment_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Rollups: writes ─────────────────────────────────────────────────────────

/// Remove every rollup row for one `YYYY-MM-DD` date so the day can be
/// rebuilt from scratch inside the caller's transaction.
pub async fn delete_rollups_for_date(
    conn: &mut sqlx::PgConnection,
    date: &str,
) -> Result<()> {
    sqlx::query!(
        "DELETE FROM daily_teacher_metrics WHERE metric_date = ($1::text)::date",
        date
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        "DELETE FROM daily_course_metrics WHERE metric_date = ($1::text)::date",
        date
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        "DELETE FROM daily_course_engagement WHERE metric_date = ($1::text)::date",
        date
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        "DELETE FROM daily_assessment_metrics WHERE metric_date = ($1::text)::date",
        date
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        "DELETE FROM daily_user_course_progress WHERE metric_date = ($1::text)::date",
        date
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        "DELETE FROM learner_risk_snapshots WHERE snapshot_date = ($1::text)::date",
        date
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct TeacherMetricsWrite {
    pub teacher_user_id: Option<UserId>,
    pub managed_course_count: i32,
    pub active_learners_7d: i32,
    pub active_learners_28d: i32,
    pub active_learners_90d: i32,
    pub returning_learners_28d: i32,
    pub completion_rate: Option<f64>,
    pub avg_progress_pct: Option<f64>,
    pub at_risk_learners: i32,
    pub ungraded_submissions: i32,
    pub courses_with_negative_engagement: i32,
    pub certificates_issued_28d: i32,
}

pub async fn insert_teacher_metrics(
    conn: &mut sqlx::PgConnection,
    date: &str,
    generated_at: i64,
    w: &TeacherMetricsWrite,
) -> Result<()> {
    sqlx::query!(
        r"INSERT INTO daily_teacher_metrics
              (metric_date, teacher_user_id, managed_course_count, active_learners_7d,
               active_learners_28d, active_learners_90d, returning_learners_28d, completion_rate,
               avg_progress_pct, at_risk_learners, ungraded_submissions,
               courses_with_negative_engagement, certificates_issued_28d, generated_at)
          VALUES (($1::text)::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                  to_timestamp($14))
          ON CONFLICT (metric_date, teacher_user_id) DO UPDATE SET
              managed_course_count = EXCLUDED.managed_course_count,
              active_learners_7d = EXCLUDED.active_learners_7d,
              active_learners_28d = EXCLUDED.active_learners_28d,
              active_learners_90d = EXCLUDED.active_learners_90d,
              returning_learners_28d = EXCLUDED.returning_learners_28d,
              completion_rate = EXCLUDED.completion_rate,
              avg_progress_pct = EXCLUDED.avg_progress_pct,
              at_risk_learners = EXCLUDED.at_risk_learners,
              ungraded_submissions = EXCLUDED.ungraded_submissions,
              courses_with_negative_engagement = EXCLUDED.courses_with_negative_engagement,
              certificates_issued_28d = EXCLUDED.certificates_issued_28d,
              generated_at = EXCLUDED.generated_at",
        date,
        w.teacher_user_id.map(|u| u.0),
        w.managed_course_count,
        w.active_learners_7d,
        w.active_learners_28d,
        w.active_learners_90d,
        w.returning_learners_28d,
        w.completion_rate,
        w.avg_progress_pct,
        w.at_risk_learners,
        w.ungraded_submissions,
        w.courses_with_negative_engagement,
        w.certificates_issued_28d,
        epoch(Some(generated_at))
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct CourseMetricsWrite {
    pub course_id: CourseId,
    pub teacher_user_id: Option<UserId>,
    pub enrolled_learners: i32,
    pub active_learners_7d: i32,
    pub active_learners_28d: i32,
    pub completion_rate: Option<f64>,
    pub avg_progress_pct: Option<f64>,
    pub at_risk_learners: i32,
    pub ungraded_submissions: i32,
    pub certificates_issued: i32,
    pub content_health_score: Option<f64>,
    pub engagement_delta_pct: Option<f64>,
    pub last_content_update_at: Option<i64>,
}

pub async fn insert_course_metrics(
    conn: &mut sqlx::PgConnection,
    date: &str,
    generated_at: i64,
    w: &CourseMetricsWrite,
) -> Result<()> {
    sqlx::query!(
        r"INSERT INTO daily_course_metrics
              (metric_date, course_id, teacher_user_id, enrolled_learners, active_learners_7d,
               active_learners_28d, completion_rate, avg_progress_pct, at_risk_learners,
               ungraded_submissions, certificates_issued, content_health_score,
               engagement_delta_pct, last_content_update_at, generated_at)
          VALUES (($1::text)::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                  to_timestamp($14), to_timestamp($15))
          ON CONFLICT (metric_date, course_id) DO UPDATE SET
              teacher_user_id = EXCLUDED.teacher_user_id,
              enrolled_learners = EXCLUDED.enrolled_learners,
              active_learners_7d = EXCLUDED.active_learners_7d,
              active_learners_28d = EXCLUDED.active_learners_28d,
              completion_rate = EXCLUDED.completion_rate,
              avg_progress_pct = EXCLUDED.avg_progress_pct,
              at_risk_learners = EXCLUDED.at_risk_learners,
              ungraded_submissions = EXCLUDED.ungraded_submissions,
              certificates_issued = EXCLUDED.certificates_issued,
              content_health_score = EXCLUDED.content_health_score,
              engagement_delta_pct = EXCLUDED.engagement_delta_pct,
              last_content_update_at = EXCLUDED.last_content_update_at,
              generated_at = EXCLUDED.generated_at",
        date,
        w.course_id.0,
        w.teacher_user_id.map(|u| u.0),
        w.enrolled_learners,
        w.active_learners_7d,
        w.active_learners_28d,
        w.completion_rate,
        w.avg_progress_pct,
        w.at_risk_learners,
        w.ungraded_submissions,
        w.certificates_issued,
        w.content_health_score,
        w.engagement_delta_pct,
        epoch(w.last_content_update_at),
        epoch(Some(generated_at))
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct EngagementWrite {
    pub course_id: CourseId,
    pub chapter_id: Option<ChapterId>,
    pub activity_id: ActivityId,
    pub step_order: Option<i32>,
    pub started_learners: i32,
    pub completed_learners: i32,
    pub dropoff_from_previous_pct: Option<f64>,
}

pub async fn insert_engagement(
    conn: &mut sqlx::PgConnection,
    date: &str,
    generated_at: i64,
    w: &EngagementWrite,
) -> Result<()> {
    sqlx::query!(
        r"INSERT INTO daily_course_engagement
              (metric_date, course_id, chapter_id, activity_id, step_order, started_learners,
               completed_learners, dropoff_from_previous_pct, generated_at)
          VALUES (($1::text)::date, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9))
          ON CONFLICT (metric_date, activity_id) DO UPDATE SET
              chapter_id = EXCLUDED.chapter_id,
              step_order = EXCLUDED.step_order,
              started_learners = EXCLUDED.started_learners,
              completed_learners = EXCLUDED.completed_learners,
              dropoff_from_previous_pct = EXCLUDED.dropoff_from_previous_pct,
              generated_at = EXCLUDED.generated_at",
        date,
        w.course_id.0,
        w.chapter_id.map(|c| c.0),
        w.activity_id.0,
        w.step_order,
        w.started_learners,
        w.completed_learners,
        w.dropoff_from_previous_pct,
        epoch(Some(generated_at))
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct AssessmentMetricsWrite {
    pub assessment_id: AssessmentId,
    pub course_id: CourseId,
    pub activity_id: Option<ActivityId>,
    pub assessment_kind: AssessmentKind,
    pub eligible_learners: i32,
    pub submitted_learners: i32,
    pub submission_rate: Option<f64>,
    pub completion_rate: Option<f64>,
    pub pass_rate: Option<f64>,
    pub median_score: Option<f64>,
    pub avg_score: Option<f64>,
    pub avg_attempts: Option<f64>,
    pub grading_latency_hours_p50: Option<f64>,
    pub grading_latency_hours_p90: Option<f64>,
    pub difficulty_score: Option<f64>,
}

pub async fn insert_assessment_metrics(
    conn: &mut sqlx::PgConnection,
    date: &str,
    generated_at: i64,
    w: &AssessmentMetricsWrite,
) -> Result<()> {
    sqlx::query!(
        r"INSERT INTO daily_assessment_metrics
              (metric_date, assessment_id, course_id, activity_id, assessment_kind,
               eligible_learners, submitted_learners, submission_rate, completion_rate, pass_rate,
               median_score, avg_score, avg_attempts, grading_latency_hours_p50,
               grading_latency_hours_p90, difficulty_score, generated_at)
          VALUES (($1::text)::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                  $16, to_timestamp($17))
          ON CONFLICT (metric_date, assessment_id) DO UPDATE SET
              course_id = EXCLUDED.course_id,
              activity_id = EXCLUDED.activity_id,
              assessment_kind = EXCLUDED.assessment_kind,
              eligible_learners = EXCLUDED.eligible_learners,
              submitted_learners = EXCLUDED.submitted_learners,
              submission_rate = EXCLUDED.submission_rate,
              completion_rate = EXCLUDED.completion_rate,
              pass_rate = EXCLUDED.pass_rate,
              median_score = EXCLUDED.median_score,
              avg_score = EXCLUDED.avg_score,
              avg_attempts = EXCLUDED.avg_attempts,
              grading_latency_hours_p50 = EXCLUDED.grading_latency_hours_p50,
              grading_latency_hours_p90 = EXCLUDED.grading_latency_hours_p90,
              difficulty_score = EXCLUDED.difficulty_score,
              generated_at = EXCLUDED.generated_at",
        date,
        w.assessment_id.0,
        w.course_id.0,
        w.activity_id.map(|a| a.0),
        w.assessment_kind.as_str(),
        w.eligible_learners,
        w.submitted_learners,
        w.submission_rate,
        w.completion_rate,
        w.pass_rate,
        w.median_score,
        w.avg_score,
        w.avg_attempts,
        w.grading_latency_hours_p50,
        w.grading_latency_hours_p90,
        w.difficulty_score,
        epoch(Some(generated_at))
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct UserCourseProgressWrite {
    pub user_id: UserId,
    pub course_id: CourseId,
    pub trail_run_id: Option<TrailRunId>,
    pub progress_pct: f64,
    pub completed_steps: i32,
    pub total_steps: i32,
    pub last_activity_at: Option<i64>,
    pub is_completed: bool,
    pub has_certificate: bool,
}

pub async fn insert_user_course_progress(
    conn: &mut sqlx::PgConnection,
    date: &str,
    generated_at: i64,
    w: &UserCourseProgressWrite,
) -> Result<()> {
    sqlx::query!(
        r"INSERT INTO daily_user_course_progress
              (metric_date, user_id, course_id, trail_run_id, progress_pct, completed_steps,
               total_steps, last_activity_at, is_completed, has_certificate, generated_at)
          VALUES (($1::text)::date, $2, $3, $4, $5, $6, $7, to_timestamp($8), $9, $10,
                  to_timestamp($11))
          ON CONFLICT (metric_date, user_id, course_id) DO UPDATE SET
              trail_run_id = EXCLUDED.trail_run_id,
              progress_pct = EXCLUDED.progress_pct,
              completed_steps = EXCLUDED.completed_steps,
              total_steps = EXCLUDED.total_steps,
              last_activity_at = EXCLUDED.last_activity_at,
              is_completed = EXCLUDED.is_completed,
              has_certificate = EXCLUDED.has_certificate,
              generated_at = EXCLUDED.generated_at",
        date,
        w.user_id.0,
        w.course_id.0,
        w.trail_run_id.map(|t| t.0),
        w.progress_pct,
        w.completed_steps,
        w.total_steps,
        epoch(w.last_activity_at),
        w.is_completed,
        w.has_certificate,
        epoch(Some(generated_at))
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct RiskSnapshotWrite {
    pub user_id: UserId,
    pub course_id: CourseId,
    pub teacher_user_id: Option<UserId>,
    pub progress_pct: f64,
    pub days_since_last_activity: Option<i32>,
    pub failed_assessments: i32,
    pub missing_required_assessments: i32,
    pub open_grading_blocks: i32,
    pub risk_score: f64,
    pub risk_level: String,
    pub reason_codes: Vec<String>,
    pub recommended_action: Option<String>,
}

pub async fn insert_risk_snapshot(
    conn: &mut sqlx::PgConnection,
    date: &str,
    generated_at: i64,
    w: &RiskSnapshotWrite,
) -> Result<()> {
    sqlx::query!(
        r"INSERT INTO learner_risk_snapshots
              (snapshot_date, user_id, course_id, teacher_user_id, progress_pct,
               days_since_last_activity, failed_assessments, missing_required_assessments,
               open_grading_blocks, risk_score, risk_level, reason_codes, recommended_action,
               generated_at)
          VALUES (($1::text)::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                  to_timestamp($14))
          ON CONFLICT (snapshot_date, user_id, course_id) DO UPDATE SET
              teacher_user_id = EXCLUDED.teacher_user_id,
              progress_pct = EXCLUDED.progress_pct,
              days_since_last_activity = EXCLUDED.days_since_last_activity,
              failed_assessments = EXCLUDED.failed_assessments,
              missing_required_assessments = EXCLUDED.missing_required_assessments,
              open_grading_blocks = EXCLUDED.open_grading_blocks,
              risk_score = EXCLUDED.risk_score,
              risk_level = EXCLUDED.risk_level,
              reason_codes = EXCLUDED.reason_codes,
              recommended_action = EXCLUDED.recommended_action,
              generated_at = EXCLUDED.generated_at",
        date,
        w.user_id.0,
        w.course_id.0,
        w.teacher_user_id.map(|u| u.0),
        w.progress_pct,
        w.days_since_last_activity,
        w.failed_assessments,
        w.missing_required_assessments,
        w.open_grading_blocks,
        w.risk_score,
        w.risk_level,
        &w.reason_codes,
        w.recommended_action.as_deref(),
        epoch(Some(generated_at))
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

// ── Rollups: reads ──────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct TeacherMetricsRow {
    pub metric_date: String,
    pub teacher_user_id: Option<UserId>,
    pub managed_course_count: i32,
    pub active_learners_7d: i32,
    pub active_learners_28d: i32,
    pub active_learners_90d: i32,
    pub returning_learners_28d: i32,
    pub completion_rate: Option<f64>,
    pub avg_progress_pct: Option<f64>,
    pub at_risk_learners: i32,
    pub ungraded_submissions: i32,
    pub courses_with_negative_engagement: i32,
    pub certificates_issued_28d: i32,
    pub generated_at: i64,
}

/// The newest teacher rollup strictly before `before` (`YYYY-MM-DD`, or the
/// far future for "latest"); `None` teacher = the platform aggregate.
pub async fn latest_teacher_metrics_before(
    pool: &PgPool,
    teacher_user_id: Option<UserId>,
    before: &str,
) -> Result<Option<TeacherMetricsRow>> {
    let row = sqlx::query_as!(
        TeacherMetricsRow,
        r#"SELECT metric_date::text AS "metric_date!", teacher_user_id AS "teacher_user_id: UserId",
                  managed_course_count, active_learners_7d, active_learners_28d,
                  active_learners_90d, returning_learners_28d, completion_rate, avg_progress_pct,
                  at_risk_learners, ungraded_submissions, courses_with_negative_engagement,
                  certificates_issued_28d,
                  (extract(epoch FROM generated_at))::bigint AS "generated_at!"
           FROM daily_teacher_metrics
           WHERE teacher_user_id IS NOT DISTINCT FROM $1 AND metric_date < ($2::text)::date
           ORDER BY metric_date DESC LIMIT 1"#,
        teacher_user_id.map(|u| u.0),
        before
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

#[derive(Debug, Clone)]
pub struct CourseMetricsRow {
    pub metric_date: String,
    pub course_id: CourseId,
    pub completion_rate: Option<f64>,
    pub ungraded_submissions: i32,
    pub engagement_delta_pct: Option<f64>,
    pub generated_at: i64,
}

/// One row per course from the newest rollup date strictly before `before`
/// that covers any of the courses.
pub async fn course_metrics_before(
    pool: &PgPool,
    course_ids: &[CourseId],
    before: &str,
) -> Result<Vec<CourseMetricsRow>> {
    let ids = uuids(course_ids);
    let rows = sqlx::query_as!(
        CourseMetricsRow,
        r#"SELECT metric_date::text AS "metric_date!", course_id AS "course_id: CourseId",
                  completion_rate, ungraded_submissions, engagement_delta_pct,
                  (extract(epoch FROM generated_at))::bigint AS "generated_at!"
           FROM daily_course_metrics
           WHERE course_id = ANY($1)
             AND metric_date = (SELECT max(metric_date) FROM daily_course_metrics
                                WHERE course_id = ANY($1) AND metric_date < ($2::text)::date)"#,
        &ids,
        before
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct RiskSnapshotRow {
    pub snapshot_date: String,
    pub user_id: UserId,
    pub course_id: CourseId,
    pub risk_score: f64,
    pub risk_level: String,
}

/// The newest snapshot per (course, user) strictly before `before`.
pub async fn previous_risk_snapshots(
    pool: &PgPool,
    course_ids: &[CourseId],
    before: &str,
) -> Result<Vec<RiskSnapshotRow>> {
    let ids = uuids(course_ids);
    let rows = sqlx::query_as!(
        RiskSnapshotRow,
        r#"SELECT DISTINCT ON (course_id, user_id)
                  snapshot_date::text AS "snapshot_date!", user_id AS "user_id: UserId",
                  course_id AS "course_id: CourseId", risk_score, risk_level
           FROM learner_risk_snapshots
           WHERE course_id = ANY($1) AND snapshot_date < ($2::text)::date
           ORDER BY course_id, user_id, snapshot_date DESC"#,
        &ids,
        before
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Medium/high snapshots on the newest snapshot date strictly before
/// `before` (legacy `_query_previous_at_risk_count`); `None` when no
/// snapshot exists yet.
pub async fn previous_at_risk_count(
    pool: &PgPool,
    course_ids: &[CourseId],
    before: &str,
) -> Result<Option<i64>> {
    let ids = uuids(course_ids);
    let row = sqlx::query!(
        r#"SELECT count(*) AS "count!"
           FROM learner_risk_snapshots
           WHERE course_id = ANY($1) AND risk_level IN ('medium', 'high')
             AND snapshot_date = (SELECT max(snapshot_date) FROM learner_risk_snapshots
                                  WHERE course_id = ANY($1) AND snapshot_date < ($2::text)::date)"#,
        &ids,
        before
    )
    .fetch_one(pool)
    .await?;
    let has_date = sqlx::query_scalar!(
        r#"SELECT max(snapshot_date)::text AS "d?" FROM learner_risk_snapshots
           WHERE course_id = ANY($1) AND snapshot_date < ($2::text)::date"#,
        &ids,
        before
    )
    .fetch_one(pool)
    .await?;
    Ok(has_date.map(|_| row.count))
}

/// Latest risk score for one learner in one course (any date).
pub async fn latest_risk_score(
    pool: &PgPool,
    user_id: UserId,
    course_id: CourseId,
) -> Result<Option<f64>> {
    let score = sqlx::query_scalar!(
        r"SELECT risk_score FROM learner_risk_snapshots
          WHERE user_id = $1 AND course_id = $2 ORDER BY snapshot_date DESC LIMIT 1",
        user_id.0,
        course_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(score)
}

/// Number of rows the rollup produced for a date — for the admin command
/// report and tests.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RollupCounts {
    pub teacher_rows: i64,
    pub course_rows: i64,
    pub engagement_rows: i64,
    pub assessment_rows: i64,
    pub progress_rows: i64,
    pub risk_rows: i64,
}

pub async fn rollup_counts(pool: &PgPool, date: &str) -> Result<RollupCounts> {
    let row = sqlx::query!(
        r#"SELECT
             (SELECT count(*) FROM daily_teacher_metrics WHERE metric_date = ($1::text)::date) AS "teacher_rows!",
             (SELECT count(*) FROM daily_course_metrics WHERE metric_date = ($1::text)::date) AS "course_rows!",
             (SELECT count(*) FROM daily_course_engagement WHERE metric_date = ($1::text)::date) AS "engagement_rows!",
             (SELECT count(*) FROM daily_assessment_metrics WHERE metric_date = ($1::text)::date) AS "assessment_rows!",
             (SELECT count(*) FROM daily_user_course_progress WHERE metric_date = ($1::text)::date) AS "progress_rows!",
             (SELECT count(*) FROM learner_risk_snapshots WHERE snapshot_date = ($1::text)::date) AS "risk_rows!""#,
        date
    )
    .fetch_one(pool)
    .await?;
    Ok(RollupCounts {
        teacher_rows: row.teacher_rows,
        course_rows: row.course_rows,
        engagement_rows: row.engagement_rows,
        assessment_rows: row.assessment_rows,
        progress_rows: row.progress_rows,
        risk_rows: row.risk_rows,
    })
}

// ── Interventions ───────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct InterventionRow {
    pub id: InterventionId,
    pub teacher_user_id: UserId,
    pub user_id: UserId,
    pub course_id: CourseId,
    pub intervention_type: String,
    pub status: String,
    pub outcome: Option<String>,
    pub notes: Option<String>,
    pub risk_score_before: Option<f64>,
    pub risk_score_after: Option<f64>,
    pub payload: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
    pub resolved_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct NewIntervention<'a> {
    pub teacher_user_id: UserId,
    pub user_id: UserId,
    pub course_id: CourseId,
    pub intervention_type: &'a str,
    pub status: &'a str,
    pub outcome: Option<&'a str>,
    pub notes: Option<&'a str>,
    pub risk_score_before: Option<f64>,
    pub risk_score_after: Option<f64>,
    pub payload: &'a serde_json::Value,
    pub resolved: bool,
}

pub async fn insert_intervention(pool: &PgPool, i: NewIntervention<'_>) -> Result<InterventionRow> {
    let row = sqlx::query_as!(
        InterventionRow,
        r#"INSERT INTO teacher_interventions
              (teacher_user_id, user_id, course_id, intervention_type, status, outcome, notes,
               risk_score_before, risk_score_after, payload, resolved_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                   CASE WHEN $11 THEN now() ELSE NULL END)
           RETURNING id AS "id: InterventionId", teacher_user_id AS "teacher_user_id: UserId",
                     user_id AS "user_id: UserId", course_id AS "course_id: CourseId",
                     intervention_type, status, outcome, notes, risk_score_before,
                     risk_score_after, payload,
                     (extract(epoch FROM created_at))::bigint AS "created_at!",
                     (extract(epoch FROM updated_at))::bigint AS "updated_at!",
                     (extract(epoch FROM resolved_at))::bigint AS "resolved_at?""#,
        i.teacher_user_id.0,
        i.user_id.0,
        i.course_id.0,
        i.intervention_type,
        i.status,
        i.outcome,
        i.notes,
        i.risk_score_before,
        i.risk_score_after,
        i.payload,
        i.resolved
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}

/// The teacher's interventions across the scoped courses, newest first,
/// optionally narrowed to one learner and/or one course.
pub async fn list_interventions(
    pool: &PgPool,
    teacher_user_id: UserId,
    course_ids: &[CourseId],
    user_id: Option<UserId>,
    course_id: Option<CourseId>,
    limit: i64,
) -> Result<Vec<InterventionRow>> {
    let ids = uuids(course_ids);
    let rows = sqlx::query_as!(
        InterventionRow,
        r#"SELECT id AS "id: InterventionId", teacher_user_id AS "teacher_user_id: UserId",
                  user_id AS "user_id: UserId", course_id AS "course_id: CourseId",
                  intervention_type, status, outcome, notes, risk_score_before, risk_score_after,
                  payload,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!",
                  (extract(epoch FROM resolved_at))::bigint AS "resolved_at?"
           FROM teacher_interventions
           WHERE teacher_user_id = $1 AND course_id = ANY($2)
             AND ($3::uuid IS NULL OR user_id = $3)
             AND ($4::uuid IS NULL OR course_id = $4)
           ORDER BY created_at DESC, id DESC
           LIMIT $5"#,
        teacher_user_id.0,
        &ids,
        user_id.map(|u| u.0),
        course_id.map(|c| c.0),
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Saved views ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct SavedViewRow {
    pub id: SavedViewId,
    pub teacher_user_id: UserId,
    pub name: String,
    pub view_type: String,
    pub query: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn list_saved_views(pool: &PgPool, teacher_user_id: UserId) -> Result<Vec<SavedViewRow>> {
    let rows = sqlx::query_as!(
        SavedViewRow,
        r#"SELECT id AS "id: SavedViewId", teacher_user_id AS "teacher_user_id: UserId", name,
                  view_type, query,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM analytics_saved_views WHERE teacher_user_id = $1
           ORDER BY updated_at DESC, id DESC"#,
        teacher_user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Insert, or update the query of the existing (teacher, view_type, name).
pub async fn upsert_saved_view(
    pool: &PgPool,
    teacher_user_id: UserId,
    name: &str,
    view_type: &str,
    query: &serde_json::Value,
) -> Result<SavedViewRow> {
    let row = sqlx::query_as!(
        SavedViewRow,
        r#"INSERT INTO analytics_saved_views (teacher_user_id, name, view_type, query)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (teacher_user_id, view_type, name) DO UPDATE SET
               query = EXCLUDED.query, updated_at = now()
           RETURNING id AS "id: SavedViewId", teacher_user_id AS "teacher_user_id: UserId", name,
                     view_type, query,
                     (extract(epoch FROM created_at))::bigint AS "created_at!",
                     (extract(epoch FROM updated_at))::bigint AS "updated_at!""#,
        teacher_user_id.0,
        name,
        view_type,
        query
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}

/// Delete the teacher's own view; `false` when it does not exist (or is
/// someone else's — no existence leak).
pub async fn delete_saved_view(
    pool: &PgPool,
    teacher_user_id: UserId,
    id: SavedViewId,
) -> Result<bool> {
    let result = sqlx::query!(
        "DELETE FROM analytics_saved_views WHERE id = $1 AND teacher_user_id = $2",
        id.0,
        teacher_user_id.0
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}
