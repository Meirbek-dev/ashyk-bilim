//! File-task queries (compile-checked). Timestamps as epoch seconds.
//!
//! A file task is an `assessments` row (policy, lifecycle) and a `file_submissions` row with the same id
//! (instructions, rubric, file caps). A hand-in is a `submissions` row: [`FileSubmissionId`] holds the
//! assessment id, [`FileAttemptId`] the submission id. Its grades are `grading_entries`, a learner's own
//! due date is an `assessment_overrides` row (REWRITE 5.6 n6).

use ab_core::Result;
use ab_core::assessments::{
    FileAttemptStatus, FileSubmissionLifecycle, GradeReleaseMode, LatePolicyKind, ScanStatus,
};
use ab_core::id::{
    ActivityId, AssessmentId, AssessmentVersionId, CourseId, FileAttemptFileId, FileAttemptId,
    FileSubmissionId, UserId, UsergroupId,
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

// ── Activities ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct FileSubmissionRow {
    pub id: FileSubmissionId,
    pub activity_id: ActivityId,
    pub course_id: CourseId,
    pub instructions: String,
    pub rubric: serde_json::Value,
    pub allowed_mime_types: Vec<String>,
    pub max_files: i32,
    pub max_file_size_mb: Option<i32>,
    pub due_at: Option<i64>,
    pub allow_late: bool,
    pub late_policy_kind: LatePolicyKind,
    pub late_penalty_percent_per_day: Option<f64>,
    pub late_penalty_max_days: Option<i32>,
    pub late_cutoff_at: Option<i64>,
    pub max_attempts: Option<i32>,
    pub grade_release_mode: GradeReleaseMode,
    pub lifecycle: FileSubmissionLifecycle,
    pub published_at: Option<i64>,
    pub archived_at: Option<i64>,
    pub settings: serde_json::Value,
    pub creator_id: Option<UserId>,
    /// S-04 optimistic lock (any config change bumps it).
    pub version: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

/// The whole configuration block (replaced wholesale).
pub struct FileSubmissionValues<'a> {
    pub instructions: &'a str,
    pub rubric: &'a serde_json::Value,
    pub allowed_mime_types: &'a [String],
    pub max_files: i32,
    pub max_file_size_mb: Option<i32>,
    pub due_at: Option<i64>,
    pub allow_late: bool,
    pub late_policy_kind: LatePolicyKind,
    pub late_penalty_percent_per_day: Option<f64>,
    pub late_penalty_max_days: Option<i32>,
    pub late_cutoff_at: Option<i64>,
    pub max_attempts: Option<i32>,
    pub grade_release_mode: GradeReleaseMode,
    pub settings: &'a serde_json::Value,
}

/// The assessment and its file body in one statement, under one id.
///
/// The policy a file task never sets is fixed here as migration `20261115155501` mapped it: graded by a
/// teacher, always required, completed by a released grade, 60 passes.
pub async fn insert_file_submission<'e>(
    db: impl sqlx::PgExecutor<'e>,
    activity_id: ActivityId,
    course_id: CourseId,
    creator_id: UserId,
    v: FileSubmissionValues<'_>,
) -> Result<FileSubmissionId> {
    let id = sqlx::query_scalar!(
        r#"WITH a AS (
               INSERT INTO assessments
                   (activity_id, course_id, due_at, allow_late, late_policy_kind,
                    late_penalty_percent_per_day, late_penalty_max_days, late_cutoff_at,
                    max_attempts, grade_release_mode, creator_id,
                    grading_mode, completion_rule, passing_score, required)
               VALUES ($1, $2, to_timestamp($8), $9, $10, $11::float8, $12, to_timestamp($13),
                       $14, $15, $17, 'manual', 'graded', 60, true)
               RETURNING id)
           INSERT INTO file_submissions
               (id, activity_id, course_id, instructions, rubric, allowed_mime_types, max_files,
                max_file_size_mb, settings)
           SELECT a.id, $1, $2, $3, $4, $5, $6, $7, $16 FROM a
           RETURNING id AS "id: FileSubmissionId""#,
        activity_id.0,
        course_id.0,
        v.instructions,
        v.rubric,
        v.allowed_mime_types,
        v.max_files,
        v.max_file_size_mb,
        epoch(v.due_at),
        v.allow_late,
        v.late_policy_kind.as_str(),
        v.late_penalty_percent_per_day,
        v.late_penalty_max_days,
        epoch(v.late_cutoff_at),
        v.max_attempts,
        v.grade_release_mode.as_str(),
        v.settings,
        creator_id.0
    )
    .fetch_one(db)
    .await?;
    Ok(id)
}

pub async fn get_file_submission<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: FileSubmissionId,
) -> Result<Option<FileSubmissionRow>> {
    let row = sqlx::query_as!(
        FileSubmissionRow,
        r#"SELECT f.id AS "id: FileSubmissionId", f.activity_id AS "activity_id: ActivityId",
                  f.course_id AS "course_id: CourseId", f.instructions, f.rubric, f.allowed_mime_types,
                  f.max_files, f.max_file_size_mb,
                  (extract(epoch FROM a.due_at))::bigint AS "due_at?", a.allow_late,
                  a.late_policy_kind AS "late_policy_kind: LatePolicyKind",
                  a.late_penalty_percent_per_day::float8 AS "late_penalty_percent_per_day?", a.late_penalty_max_days,
                  (extract(epoch FROM a.late_cutoff_at))::bigint AS "late_cutoff_at?",
                  a.max_attempts, a.grade_release_mode AS "grade_release_mode: GradeReleaseMode",
                  a.lifecycle AS "lifecycle: FileSubmissionLifecycle",
                  (extract(epoch FROM a.published_at))::bigint AS "published_at?",
                  (extract(epoch FROM a.archived_at))::bigint AS "archived_at?",
                  f.settings, a.creator_id AS "creator_id: UserId", f.version,
                  (extract(epoch FROM f.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM f.updated_at))::bigint AS "updated_at!"
           FROM file_submissions f JOIN assessments a ON a.id = f.id WHERE f.id = $1"#,
        id.0
    )
    .fetch_optional(db)
    .await?;
    Ok(row)
}

pub async fn get_file_submission_by_activity<'e>(
    db: impl sqlx::PgExecutor<'e>,
    activity_id: ActivityId,
) -> Result<Option<FileSubmissionRow>> {
    let row = sqlx::query_as!(
        FileSubmissionRow,
        r#"SELECT f.id AS "id: FileSubmissionId", f.activity_id AS "activity_id: ActivityId",
                  f.course_id AS "course_id: CourseId", f.instructions, f.rubric, f.allowed_mime_types,
                  f.max_files, f.max_file_size_mb,
                  (extract(epoch FROM a.due_at))::bigint AS "due_at?", a.allow_late,
                  a.late_policy_kind AS "late_policy_kind: LatePolicyKind",
                  a.late_penalty_percent_per_day::float8 AS "late_penalty_percent_per_day?", a.late_penalty_max_days,
                  (extract(epoch FROM a.late_cutoff_at))::bigint AS "late_cutoff_at?",
                  a.max_attempts, a.grade_release_mode AS "grade_release_mode: GradeReleaseMode",
                  a.lifecycle AS "lifecycle: FileSubmissionLifecycle",
                  (extract(epoch FROM a.published_at))::bigint AS "published_at?",
                  (extract(epoch FROM a.archived_at))::bigint AS "archived_at?",
                  f.settings, a.creator_id AS "creator_id: UserId", f.version,
                  (extract(epoch FROM f.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM f.updated_at))::bigint AS "updated_at!"
           FROM file_submissions f JOIN assessments a ON a.id = f.id WHERE f.activity_id = $1"#,
        activity_id.0
    )
    .fetch_optional(db)
    .await?;
    Ok(row)
}

/// BUG-229: `SELECT … FOR UPDATE` on the task's assessment row, then the task as the previous writer left it.
///
/// Publish, the config PATCH and the curriculum publish toggle serialize here (the row
/// `catalog::refuse_learner_work` locks too).
pub async fn lock_file_submission(
    conn: &mut sqlx::PgConnection,
    id: FileSubmissionId,
) -> Result<Option<FileSubmissionRow>> {
    sqlx::query!(
        "SELECT a.id FROM assessments a JOIN file_submissions f ON f.id = a.id
         WHERE a.id = $1 FOR UPDATE OF a",
        id.0
    )
    .fetch_optional(&mut *conn)
    .await?;
    get_file_submission(conn, id).await
}

/// [`lock_file_submission`] by the activity it backs (BUG-232).
pub async fn lock_file_submission_by_activity(
    conn: &mut sqlx::PgConnection,
    activity_id: ActivityId,
) -> Result<Option<FileSubmissionRow>> {
    sqlx::query!(
        "SELECT a.id FROM assessments a JOIN file_submissions f ON f.id = a.id
         WHERE a.activity_id = $1 FOR UPDATE OF a",
        activity_id.0
    )
    .fetch_optional(&mut *conn)
    .await?;
    get_file_submission_by_activity(conn, activity_id).await
}

/// The policy lands on the assessment, the body on `file_submissions`.
///
/// The task's `version` (If-Match) moves once when either changed (`touch_row` bumps it for the body, the
/// assessment's own bump is carried over).
pub async fn update_file_submission<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: FileSubmissionId,
    v: FileSubmissionValues<'_>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"WITH old AS (SELECT version FROM assessments WHERE id = $1),
           a AS (
               UPDATE assessments SET
                   due_at = to_timestamp($7), allow_late = $8,
                   late_policy_kind = $9, late_penalty_percent_per_day = $10::float8,
                   late_penalty_max_days = $11, late_cutoff_at = to_timestamp($12),
                   max_attempts = $13, grade_release_mode = $14
               WHERE id = $1 RETURNING version)
           UPDATE file_submissions f SET
               instructions = $2, rubric = $3, allowed_mime_types = $4, max_files = $5,
               max_file_size_mb = $6, settings = $15,
               version = f.version + (a.version <> old.version)::int
           FROM a, old WHERE f.id = $1"#,
        id.0,
        v.instructions,
        v.rubric,
        v.allowed_mime_types,
        v.max_files,
        v.max_file_size_mb,
        epoch(v.due_at),
        v.allow_late,
        v.late_policy_kind.as_str(),
        v.late_penalty_percent_per_day,
        v.late_penalty_max_days,
        epoch(v.late_cutoff_at),
        v.max_attempts,
        v.grade_release_mode.as_str(),
        v.settings
    )
    .execute(db)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Publishing stamps `published_at` once; archiving stamps `archived_at`;
/// going back to draft clears `archived_at` only.
pub async fn set_file_submission_lifecycle<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: FileSubmissionId,
    lifecycle: FileSubmissionLifecycle,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"WITH old AS (SELECT version FROM assessments WHERE id = $1),
           a AS (
               UPDATE assessments SET
                   lifecycle = $2,
                   published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, now())
                                       ELSE published_at END,
                   archived_at = CASE WHEN $2 = 'archived' THEN now() ELSE NULL END
               WHERE id = $1 RETURNING version)
           UPDATE file_submissions f SET version = f.version + (a.version <> old.version)::int
           FROM a, old WHERE f.id = $1"#,
        id.0,
        lifecycle.as_str()
    )
    .execute(db)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// A file-submission activity as a gradebook column.
#[derive(Debug, Clone)]
pub struct GradebookFileSubmissionRow {
    pub id: FileSubmissionId,
    pub activity_id: ActivityId,
    pub title: String,
    pub due_at: Option<i64>,
}

/// The gradebook's file-submission columns, in curriculum order.
///
/// Tasks learners can open (published activity and task) plus any other one
/// a learner already handed work in to (see `assessments::gradebook_columns`).
pub async fn list_for_course(
    pool: &PgPool,
    course_id: CourseId,
) -> Result<Vec<GradebookFileSubmissionRow>> {
    let rows = sqlx::query_as!(
        GradebookFileSubmissionRow,
        r#"SELECT f.id AS "id: FileSubmissionId", f.activity_id AS "activity_id: ActivityId",
                  a.name AS title, (extract(epoch FROM s.due_at))::bigint AS "due_at?"
           FROM file_submissions f JOIN assessments s ON s.id = f.id
           JOIN activities a ON a.id = f.activity_id
           JOIN chapters c ON c.id = a.chapter_id
           WHERE f.course_id = $1
             AND (EXISTS (SELECT 1 FROM learner_visible_activities v WHERE v.activity_id = a.id)
                  OR EXISTS (SELECT 1 FROM submissions x
                             WHERE x.assessment_id = f.id
                               AND x.status <> 'draft' AND NOT x.preview))
           ORDER BY c.position, c.id, a.position, a.id"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Attempts ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct AttemptRow {
    pub id: FileAttemptId,
    pub file_submission_id: FileSubmissionId,
    pub course_id: CourseId,
    pub user_id: UserId,
    pub status: FileAttemptStatus,
    pub attempt_number: i32,
    pub started_at: Option<i64>,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
    pub is_late: bool,
    pub late_penalty_pct: f64,
    /// The grader's score before the late penalty (UX-121).
    pub raw_score: Option<f64>,
    pub final_score: Option<f64>,
    pub feedback: String,
    pub rubric_scores: serde_json::Value,
    pub graded_by: Option<UserId>,
    pub version: i64,
    /// A staff preview (UX-182).
    pub preview: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

impl AttemptRow {
    /// File attempts are revisions: the latest released one is the grade of
    /// record (`crate::submissions::GradeKey`).
    #[must_use]
    pub fn grade_key(&self) -> crate::submissions::GradeKey {
        crate::submissions::GradeKey {
            released: self.status == FileAttemptStatus::Published,
            score: None,
            attempt_number: self.attempt_number,
        }
    }
}

/// Open a draft (started now); `None` when a unique index refused it.
///
/// Either the learner already has an open (draft or returned) attempt, or a
/// concurrent submit took `attempt_number` (`submissions_attempt_number_key`);
/// the caller re-reads. A returned hand-in is the open one (the learner revises
/// it in place), which no index of `submissions` says: the insert asks.
pub async fn insert_attempt(
    db: impl sqlx::PgExecutor<'_>,
    file_submission_id: FileSubmissionId,
    course_id: CourseId,
    user_id: UserId,
    attempt_number: i32,
    preview: bool,
) -> Result<Option<FileAttemptId>> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO submissions
               (assessment_id, course_id, user_id, attempt_number, preview, started_at)
           SELECT $1::uuid, $2::uuid, $3::uuid, $4::int, $5::bool, now()
           WHERE NOT EXISTS (SELECT 1 FROM submissions o
                             WHERE o.assessment_id = $1 AND o.user_id = $3 AND o.status = 'returned')
           ON CONFLICT DO NOTHING
           RETURNING id AS "id: FileAttemptId""#,
        file_submission_id.0,
        course_id.0,
        user_id.0,
        attempt_number,
        preview
    )
    .fetch_optional(db)
    .await?;
    Ok(id)
}

pub async fn get_attempt(pool: &PgPool, id: FileAttemptId) -> Result<Option<AttemptRow>> {
    let row = sqlx::query_as!(
        AttemptRow,
        r#"SELECT s.id AS "id: FileAttemptId",
                  s.assessment_id AS "file_submission_id: FileSubmissionId",
                  s.course_id AS "course_id: CourseId", s.user_id AS "user_id: UserId",
                  s.status AS "status: FileAttemptStatus", s.attempt_number,
                  (extract(epoch FROM s.started_at))::bigint AS "started_at?",
                  (extract(epoch FROM s.submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM s.graded_at))::bigint AS "graded_at?",
                  s.is_late, s.late_penalty_pct::float8 AS "late_penalty_pct!",
                  CASE WHEN e.final_score IS NOT NULL THEN e.raw_score::float8 END AS "raw_score?",
                  s.final_score::float8 AS "final_score?",
                  CASE WHEN s.status = 'submitted' THEN '' ELSE COALESCE(e.overall_feedback, '') END AS "feedback!",
                  COALESCE(e.effective_breakdown, '{}'::jsonb) AS "rubric_scores!",
                  e.graded_by AS "graded_by?: UserId", s.version, s.preview,
                  (extract(epoch FROM s.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM s.updated_at))::bigint AS "updated_at!"
           FROM submissions s
           JOIN file_submissions f ON f.id = s.assessment_id
           LEFT JOIN LATERAL (SELECT g.raw_score, g.final_score, g.overall_feedback,
                                     g.effective_breakdown, g.graded_by
                              FROM grading_entries g WHERE g.submission_id = s.id
                              ORDER BY g.revision DESC LIMIT 1) e ON true WHERE s.id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// The learner's editable attempt: a draft, or a returned one.
pub async fn open_attempt(
    pool: &PgPool,
    file_submission_id: FileSubmissionId,
    user_id: UserId,
) -> Result<Option<AttemptRow>> {
    let row = sqlx::query_as!(
        AttemptRow,
        r#"SELECT s.id AS "id: FileAttemptId",
                  s.assessment_id AS "file_submission_id: FileSubmissionId",
                  s.course_id AS "course_id: CourseId", s.user_id AS "user_id: UserId",
                  s.status AS "status: FileAttemptStatus", s.attempt_number,
                  (extract(epoch FROM s.started_at))::bigint AS "started_at?",
                  (extract(epoch FROM s.submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM s.graded_at))::bigint AS "graded_at?",
                  s.is_late, s.late_penalty_pct::float8 AS "late_penalty_pct!",
                  CASE WHEN e.final_score IS NOT NULL THEN e.raw_score::float8 END AS "raw_score?",
                  s.final_score::float8 AS "final_score?",
                  CASE WHEN s.status = 'submitted' THEN '' ELSE COALESCE(e.overall_feedback, '') END AS "feedback!",
                  COALESCE(e.effective_breakdown, '{}'::jsonb) AS "rubric_scores!",
                  e.graded_by AS "graded_by?: UserId", s.version, s.preview,
                  (extract(epoch FROM s.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM s.updated_at))::bigint AS "updated_at!"
           FROM submissions s
           JOIN file_submissions f ON f.id = s.assessment_id
           LEFT JOIN LATERAL (SELECT g.raw_score, g.final_score, g.overall_feedback,
                                     g.effective_breakdown, g.graded_by
                              FROM grading_entries g WHERE g.submission_id = s.id
                              ORDER BY g.revision DESC LIMIT 1) e ON true
           WHERE s.assessment_id = $1 AND s.user_id = $2 AND s.status IN ('draft', 'returned')
           ORDER BY s.attempt_number DESC LIMIT 1"#,
        file_submission_id.0,
        user_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Every attempt of one learner, newest first.
/// `include_preview: false` drops staff previews (UX-182) - the progress
/// projection's view, which must never count them (UX-186).
pub async fn list_user_attempts<'e>(
    db: impl sqlx::PgExecutor<'e>,
    file_submission_id: FileSubmissionId,
    user_id: UserId,
    include_preview: bool,
) -> Result<Vec<AttemptRow>> {
    let rows = sqlx::query_as!(
        AttemptRow,
        r#"SELECT s.id AS "id: FileAttemptId",
                  s.assessment_id AS "file_submission_id: FileSubmissionId",
                  s.course_id AS "course_id: CourseId", s.user_id AS "user_id: UserId",
                  s.status AS "status: FileAttemptStatus", s.attempt_number,
                  (extract(epoch FROM s.started_at))::bigint AS "started_at?",
                  (extract(epoch FROM s.submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM s.graded_at))::bigint AS "graded_at?",
                  s.is_late, s.late_penalty_pct::float8 AS "late_penalty_pct!",
                  CASE WHEN e.final_score IS NOT NULL THEN e.raw_score::float8 END AS "raw_score?",
                  s.final_score::float8 AS "final_score?",
                  CASE WHEN s.status = 'submitted' THEN '' ELSE COALESCE(e.overall_feedback, '') END AS "feedback!",
                  COALESCE(e.effective_breakdown, '{}'::jsonb) AS "rubric_scores!",
                  e.graded_by AS "graded_by?: UserId", s.version, s.preview,
                  (extract(epoch FROM s.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM s.updated_at))::bigint AS "updated_at!"
           FROM submissions s
           JOIN file_submissions f ON f.id = s.assessment_id
           LEFT JOIN LATERAL (SELECT g.raw_score, g.final_score, g.overall_feedback,
                                     g.effective_breakdown, g.graded_by
                              FROM grading_entries g WHERE g.submission_id = s.id
                              ORDER BY g.revision DESC LIMIT 1) e ON true
           WHERE s.assessment_id = $1 AND s.user_id = $2 AND (NOT s.preview OR $3)
           ORDER BY s.attempt_number DESC"#,
        file_submission_id.0,
        user_id.0,
        include_preview
    )
    .fetch_all(db)
    .await?;
    Ok(rows)
}

/// Every learner attempt of the activity (no staff preview, UX-182), newest
/// submission first (export).
pub async fn list_attempts(
    pool: &PgPool,
    file_submission_id: FileSubmissionId,
) -> Result<Vec<AttemptRow>> {
    let rows = sqlx::query_as!(
        AttemptRow,
        r#"SELECT s.id AS "id: FileAttemptId",
                  s.assessment_id AS "file_submission_id: FileSubmissionId",
                  s.course_id AS "course_id: CourseId", s.user_id AS "user_id: UserId",
                  s.status AS "status: FileAttemptStatus", s.attempt_number,
                  (extract(epoch FROM s.started_at))::bigint AS "started_at?",
                  (extract(epoch FROM s.submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM s.graded_at))::bigint AS "graded_at?",
                  s.is_late, s.late_penalty_pct::float8 AS "late_penalty_pct!",
                  CASE WHEN e.final_score IS NOT NULL THEN e.raw_score::float8 END AS "raw_score?",
                  s.final_score::float8 AS "final_score?",
                  CASE WHEN s.status = 'submitted' THEN '' ELSE COALESCE(e.overall_feedback, '') END AS "feedback!",
                  COALESCE(e.effective_breakdown, '{}'::jsonb) AS "rubric_scores!",
                  e.graded_by AS "graded_by?: UserId", s.version, s.preview,
                  (extract(epoch FROM s.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM s.updated_at))::bigint AS "updated_at!"
           FROM submissions s
           JOIN file_submissions f ON f.id = s.assessment_id
           LEFT JOIN LATERAL (SELECT g.raw_score, g.final_score, g.overall_feedback,
                                     g.effective_breakdown, g.graded_by
                              FROM grading_entries g WHERE g.submission_id = s.id
                              ORDER BY g.revision DESC LIMIT 1) e ON true
           WHERE s.assessment_id = $1 AND NOT s.preview
           ORDER BY s.submitted_at DESC NULLS LAST, s.id DESC"#,
        file_submission_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Attempts past draft. `include_preview: false` is the learner's cap -
/// staff previews never count toward it (BUG-285).
pub async fn count_completed_attempts(
    pool: &PgPool,
    file_submission_id: FileSubmissionId,
    user_id: UserId,
    include_preview: bool,
) -> Result<i64> {
    let count = sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM submissions
           WHERE assessment_id = $1 AND user_id = $2 AND status <> 'draft'
             AND (NOT preview OR $3)"#,
        file_submission_id.0,
        user_id.0,
        include_preview
    )
    .fetch_one(pool)
    .await?;
    Ok(count)
}

/// Bump the lock after a file change. `false` = version mismatch.
pub async fn touch_attempt<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: FileAttemptId,
    expected_version: i64,
) -> Result<bool> {
    let updated = sqlx::query!(
        "UPDATE submissions SET version = version + 1 WHERE id = $1 AND version = $2",
        id.0,
        expected_version
    )
    .execute(db)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// The assessment version a hand-in of `task` names.
///
/// `assessment_versions::ensure`: its own short transaction, before the hand-in's. Its policy holds the
/// file caps and the rubric; the one item is the hand-in itself, worth 100 points: a file grade is a
/// percentage, so a grade entry's points equal it.
pub async fn ensure_version(
    pool: &PgPool,
    task: &FileSubmissionRow,
) -> Result<AssessmentVersionId> {
    crate::assessment_versions::ensure(
        pool,
        AssessmentId(task.id.0),
        &serde_json::json!({ "items": [{ "kind": "files", "max_score": 100 }] }),
        &serde_json::json!({
            "allowed_mime_types": task.allowed_mime_types,
            "max_files": task.max_files,
            "max_file_size_mb": task.max_file_size_mb,
            "rubric": task.rubric,
        }),
    )
    .await
}

/// Draft/returned → submitted under the lock. The first hand-in names `version` (and copies its
/// snapshots, `submissions_handed_in_snapshots_check`); a revision keeps the one it was handed in against.
pub async fn submit_attempt(
    db: impl sqlx::PgExecutor<'_>,
    id: FileAttemptId,
    expected_version: i64,
    is_late: bool,
    late_penalty_pct: f64,
    version: AssessmentVersionId,
) -> Result<bool> {
    let updated = sqlx::query!(
        // A revision handed in starts a new review round: the return comment
        // stays in the grading history, not on the form the grader reopens
        // (an attempt reads no feedback while it is `submitted`).
        r#"UPDATE submissions s SET
               status = 'submitted', submitted_at = now(), is_late = $3, late_penalty_pct = $4::float8,
               assessment_version_id = COALESCE(s.assessment_version_id, v.id),
               items_snapshot = COALESCE(s.items_snapshot, v.items),
               policy_snapshot = COALESCE(s.policy_snapshot, v.policy),
               version = s.version + 1
           FROM assessment_versions v
           WHERE s.id = $1 AND s.version = $2 AND s.status IN ('draft', 'returned') AND v.id = $5"#,
        id.0,
        expected_version,
        is_late,
        late_penalty_pct,
        version.0
    )
    .execute(db)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// What a grader writes.
pub struct GradeWrite<'a> {
    pub status: FileAttemptStatus,
    pub raw_score: Option<f64>,
    pub final_score: Option<f64>,
    /// `None` keeps the stored feedback.
    pub feedback: Option<&'a str>,
    /// `None` keeps the stored rubric scores.
    pub rubric_scores: Option<&'a serde_json::Value>,
    pub graded_by: UserId,
}

/// Grader write under the lock.
pub async fn grade_attempt(
    db: impl sqlx::PgExecutor<'_>,
    id: FileAttemptId,
    expected_version: i64,
    grade: GradeWrite<'_>,
) -> Result<bool> {
    // L-6: every save appends to the attempt's grading ledger in the same
    // statement - no ledger row without the grade and no grade without one.
    // The entry carries what the attempt reads back: feedback and rubric
    // scores a save leaves out are the previous entry's (`s` and `p` are the
    // statement's snapshot: the row before this save). An entry needs a raw
    // score, so a return without one stores 0 beside a NULL final score,
    // which is how every reader tells «no score».
    let updated = sqlx::query!(
        r#"WITH u AS (
               UPDATE submissions SET
                   status = $3, final_score = $4::float8, graded_at = now(), version = version + 1
               WHERE id = $1 AND version = $2
               RETURNING id, late_penalty_pct)
           INSERT INTO grading_entries
               (submission_id, revision, graded_by, raw_score, penalty_pct, final_score, max_points, raw_points,
                final_points, overall_feedback, effective_breakdown, published_at, returned)
           SELECT u.id, COALESCE(p.revision, 0) + 1, $7, COALESCE($8::float8, 0), u.late_penalty_pct, $4::float8,
                  v.max_points, points_of_percent(COALESCE($8::float8, 0)::percent, v.max_points),
                  points_of_percent(($4::float8)::percent, v.max_points),
                  COALESCE($5, CASE WHEN s.status = 'submitted' THEN '' ELSE p.overall_feedback END, ''),
                  COALESCE($6, p.effective_breakdown, '{}'::jsonb),
                  CASE WHEN $3 = 'released' THEN now() END, $3 = 'returned'
           FROM u JOIN submissions s ON s.id = u.id
           LEFT JOIN assessment_versions v ON v.id = s.assessment_version_id
           LEFT JOIN LATERAL (SELECT g.revision, g.overall_feedback, g.effective_breakdown
                              FROM grading_entries g WHERE g.submission_id = u.id
                              ORDER BY g.revision DESC LIMIT 1) p ON true"#,
        id.0,
        expected_version,
        grade.status.stored(),
        grade.final_score,
        grade.feedback,
        grade.rubric_scores,
        grade.graded_by.0,
        grade.raw_score
    )
    .execute(db)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// BUG-316: `(is_late, late_penalty_pct, raw_score)` of one attempt under
/// `FOR UPDATE` - the lateness settle's read, which a grade save contends for.
pub async fn lock_attempt_lateness(
    conn: &mut sqlx::PgConnection,
    id: FileAttemptId,
) -> Result<Option<(bool, f64, Option<f64>)>> {
    let row = sqlx::query!(
        r#"SELECT s.is_late, s.late_penalty_pct::float8 AS "late_penalty_pct!",
                  (SELECT CASE WHEN g.final_score IS NOT NULL THEN g.raw_score::float8 END
                   FROM grading_entries g WHERE g.submission_id = s.id
                   ORDER BY g.revision DESC LIMIT 1) AS "raw_score?"
           FROM submissions s WHERE s.id = $1 FOR UPDATE OF s"#,
        id.0
    )
    .fetch_optional(conn)
    .await?;
    Ok(row.map(|r| (r.is_late, r.late_penalty_pct, r.raw_score)))
}

/// BUG-316: re-judged lateness and the final score it prices; the version
/// bumps, so a grade save that priced the old penalty is stale (412).
///
/// A changed score of record is a new ledger entry (the latest one again, at the new penalty), as for a
/// quiz (`grading::bulk::settle_lateness`): the journal's latest entry is the grade
/// (`submissions_current_grade`).
pub async fn set_attempt_lateness(
    conn: &mut sqlx::PgConnection,
    id: FileAttemptId,
    is_late: bool,
    late_penalty_pct: f64,
    final_score: Option<f64>,
) -> Result<()> {
    sqlx::query!(
        r#"WITH u AS (
               UPDATE submissions SET is_late = $2, late_penalty_pct = $3::float8,
                   final_score = $4::float8, version = version + 1
               WHERE id = $1 RETURNING id)
           INSERT INTO grading_entries
               (submission_id, revision, graded_by, raw_score, penalty_pct, final_score, max_points, raw_points,
                final_points, overall_feedback, effective_breakdown, published_at, returned)
           SELECT u.id, p.revision + 1, p.graded_by, p.raw_score, $3::float8, $4::float8, p.max_points, p.raw_points,
                  points_of_percent(($4::float8)::percent, p.max_points),
                  p.overall_feedback, p.effective_breakdown,
                  CASE WHEN p.published_at IS NOT NULL THEN now() END, p.returned
           FROM u CROSS JOIN LATERAL (SELECT g.* FROM grading_entries g WHERE g.submission_id = u.id
                                      ORDER BY g.revision DESC LIMIT 1) p
           WHERE p.final_score IS DISTINCT FROM ($4::float8)::percent"#,
        id.0,
        is_late,
        late_penalty_pct,
        final_score
    )
    .execute(conn)
    .await?;
    Ok(())
}

// ── Review queue ────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ReviewAttemptRow {
    pub id: FileAttemptId,
    pub user_id: UserId,
    pub username: String,
    pub display_name: String,
    pub email: String,
    pub status: FileAttemptStatus,
    pub attempt_number: i32,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
    pub is_late: bool,
    pub final_score: Option<f64>,
    pub version: i64,
    pub file_count: i64,
    pub enrolled: bool,
    pub staff: bool,
}

/// Review-queue filter and order (L-6: parity with the assessment queue).
pub struct ReviewQuery<'a> {
    pub status: Option<FileAttemptStatus>,
    pub late_only: bool,
    pub search: Option<&'a str>,
    /// Members of this usergroup only.
    pub group_id: Option<UsergroupId>,
    /// `submitted_at` | `final_score` | `attempt_number`; `None` = id order
    /// (the pre-L-6 queue, newest attempt first).
    pub sort: Option<&'a str>,
    pub ascending: bool,
    /// The last row of the previous page; its sort key is re-read, so the
    /// cursor stays a plain attempt id under every order.
    pub cursor: Option<FileAttemptId>,
    pub limit: i64,
}

/// Non-draft attempts in `q.sort` order (keyset on (key, id)), filtered by
/// status, lateness, group and a learner-name/email substring.
pub async fn list_for_review(
    pool: &PgPool,
    file_submission_id: FileSubmissionId,
    q: ReviewQuery<'_>,
) -> Result<Vec<ReviewAttemptRow>> {
    let pattern = q.search.map(|s| format!("%{}%", crate::like_escape(s)));
    let rows = sqlx::query_as!(
        ReviewAttemptRow,
        r#"SELECT a.id AS "id: FileAttemptId", a.user_id AS "user_id: UserId",
                  u.username, u.display_name, u.email,
                  a.status AS "status: FileAttemptStatus", a.attempt_number,
                  (extract(epoch FROM a.submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM a.graded_at))::bigint AS "graded_at?",
                  a.is_late, a.final_score::float8 AS "final_score?", a.version,
                  (SELECT count(*) FROM file_submission_files f WHERE f.attempt_id = a.id)
                      AS "file_count!",
                  EXISTS (SELECT 1 FROM course_members r
                          WHERE r.course_id = a.course_id AND r.user_id = a.user_id) AS "enrolled!",
                  is_course_staff(a.course_id, a.user_id) AS "staff!"
           FROM submissions a JOIN users u ON u.id = a.user_id
           CROSS JOIN LATERAL (SELECT $8::float8 * CASE $7::text
                  WHEN 'final_score' THEN coalesce(a.final_score, -1)
                  WHEN 'attempt_number' THEN a.attempt_number::float8
                  WHEN 'submitted_at' THEN coalesce(extract(epoch FROM a.submitted_at)::float8, 0)
                  ELSE 0 END AS key) k
           LEFT JOIN LATERAL (SELECT $8::float8 * CASE $7::text
                  WHEN 'final_score' THEN coalesce(c.final_score, -1)
                  WHEN 'attempt_number' THEN c.attempt_number::float8
                  WHEN 'submitted_at' THEN coalesce(extract(epoch FROM c.submitted_at)::float8, 0)
                  ELSE 0 END AS key
                  FROM submissions c WHERE c.id = $4) ck ON true
           WHERE a.assessment_id = $1 AND a.status <> 'draft' AND NOT a.preview
             AND ($2::text[] IS NULL OR a.status = ANY($2))
             AND ($3::text IS NULL OR u.username ILIKE $3 ESCAPE '\' OR u.display_name ILIKE $3 ESCAPE '\'
                  OR u.email ILIKE $3 ESCAPE '\')
             AND ($4::uuid IS NULL OR (k.key, a.id) < (ck.key, $4))
             AND (NOT $6 OR a.is_late)
             AND ($9::uuid IS NULL OR EXISTS (SELECT 1 FROM usergroup_members m
                  WHERE m.usergroup_id = $9 AND m.user_id = a.user_id))
           ORDER BY k.key DESC, a.id DESC
           LIMIT $5"#,
        file_submission_id.0,
        q.status.map(FileAttemptStatus::stored_spellings) as _,
        pattern.as_deref(),
        q.cursor.map(|c| c.0),
        q.limit,
        q.late_only,
        q.sort,
        if q.ascending { -1.0_f64 } else { 1.0_f64 },
        q.group_id.map(|g| g.0)
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone, Copy, Default)]
pub struct ReviewCounts {
    pub total: i64,
    pub submitted: i64,
    pub graded: i64,
    pub published: i64,
    pub returned: i64,
    pub late: i64,
}

/// Queue counts of a file submission (non-draft, non-preview attempts).
pub async fn review_counts(
    pool: &PgPool,
    file_submission_id: FileSubmissionId,
    group_id: Option<UsergroupId>,
) -> Result<ReviewCounts> {
    let r = sqlx::query!(
        r#"SELECT count(*) AS "total!",
                  count(*) FILTER (WHERE status = 'submitted') AS "submitted!",
                  count(*) FILTER (WHERE status = 'graded') AS "graded!",
                  count(*) FILTER (WHERE status = 'released') AS "published!",
                  count(*) FILTER (WHERE status = 'returned') AS "returned!",
                  count(*) FILTER (WHERE is_late) AS "late!"
           FROM submissions a
           WHERE a.assessment_id = $1 AND a.status <> 'draft' AND NOT a.preview
             AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM usergroup_members m
                  WHERE m.usergroup_id = $2 AND m.user_id = a.user_id))"#,
        file_submission_id.0,
        group_id.map(|g| g.0)
    )
    .fetch_one(pool)
    .await?;
    Ok(ReviewCounts {
        total: r.total,
        submitted: r.submitted,
        graded: r.graded,
        published: r.published,
        returned: r.returned,
        late: r.late,
    })
}

/// Final scores (percent) of graded/published non-preview attempts, for the
/// average and the distribution; `group_id` as in [`review_counts`].
pub async fn graded_scores(
    pool: &PgPool,
    file_submission_id: FileSubmissionId,
    group_id: Option<UsergroupId>,
) -> Result<Vec<f64>> {
    let scores = sqlx::query_scalar!(
        r#"SELECT final_score::float8 AS "final_score!" FROM submissions a
           WHERE a.assessment_id = $1 AND a.status IN ('graded', 'released')
             AND a.final_score IS NOT NULL AND NOT a.preview
             AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM usergroup_members m
                  WHERE m.usergroup_id = $2 AND m.user_id = a.user_id))"#,
        file_submission_id.0,
        group_id.map(|g| g.0)
    )
    .fetch_all(pool)
    .await?;
    Ok(scores)
}

/// `(id, version)` of the non-preview attempts in `status` (bulk input).
pub async fn list_ids_in_status(
    pool: &PgPool,
    file_submission_id: FileSubmissionId,
    status: FileAttemptStatus,
) -> Result<Vec<(FileAttemptId, i64)>> {
    let rows = sqlx::query!(
        r#"SELECT id AS "id: FileAttemptId", version FROM submissions
           WHERE assessment_id = $1 AND status = ANY($2) AND NOT preview
           ORDER BY id"#,
        file_submission_id.0,
        status.stored_spellings() as _
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| (r.id, r.version)).collect())
}

#[derive(Debug, Clone)]
pub struct FileGradingEntryRow {
    pub id: uuid::Uuid,
    pub graded_by: Option<UserId>,
    pub status: FileAttemptStatus,
    pub raw_score: Option<f64>,
    pub penalty_pct: f64,
    pub final_score: Option<f64>,
    pub feedback: String,
    pub created_at: i64,
}

/// The grading ledger of one attempt, newest first (L-6). An entry's status is what its save did: released
/// the grade (`published_at`), returned the work (`returned`) or held the grade.
pub async fn list_grading_entries(
    pool: &PgPool,
    attempt_id: FileAttemptId,
) -> Result<Vec<FileGradingEntryRow>> {
    let rows = sqlx::query_as!(
        FileGradingEntryRow,
        r#"SELECT id, graded_by AS "graded_by: UserId",
                  CASE WHEN published_at IS NOT NULL THEN 'released' WHEN returned THEN 'returned'
                       ELSE 'graded' END AS "status!: FileAttemptStatus",
                  CASE WHEN final_score IS NOT NULL THEN raw_score::float8 END AS "raw_score?",
                  penalty_pct::float8 AS "penalty_pct!", final_score::float8 AS "final_score?",
                  overall_feedback AS feedback, (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM grading_entries WHERE submission_id = $1
           ORDER BY revision DESC"#,
        attempt_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Files ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct FileRow {
    pub id: FileAttemptFileId,
    pub attempt_id: FileAttemptId,
    pub upload_id: uuid::Uuid,
    pub display_name: String,
    /// `content_type`, `size_bytes` and `storage_key` are the upload row's
    /// `mime`, `size_bytes` and `key` (REWRITE 5.8 item 4).
    pub content_type: String,
    pub size_bytes: Option<i64>,
    pub storage_key: String,
    pub position: i32,
    pub scan_status: ScanStatus,
    pub created_at: i64,
}

pub struct NewFile<'a> {
    pub upload_id: uuid::Uuid,
    pub display_name: &'a str,
}

pub async fn list_files<'e>(
    db: impl sqlx::PgExecutor<'e>,
    attempt_id: FileAttemptId,
) -> Result<Vec<FileRow>> {
    let rows = sqlx::query_as!(
        FileRow,
        r#"SELECT f.id AS "id: FileAttemptFileId", f.attempt_id AS "attempt_id: FileAttemptId",
                  f.upload_id, f.display_name, u.mime AS content_type, u.size_bytes AS "size_bytes?",
                  u.key AS storage_key, f.position, f.scan_status AS "scan_status: ScanStatus",
                  (extract(epoch FROM f.created_at))::bigint AS "created_at!"
           FROM file_submission_files f JOIN uploads u ON u.id = f.upload_id WHERE f.attempt_id = $1 ORDER BY f.position, f.id"#,
        attempt_id.0
    )
    .fetch_all(db)
    .await?;
    Ok(rows)
}

/// Files of many attempts at once (review pages, exports).
pub async fn list_files_for_attempts(
    pool: &PgPool,
    attempt_ids: &[FileAttemptId],
) -> Result<Vec<FileRow>> {
    let ids: Vec<uuid::Uuid> = attempt_ids.iter().map(|a| a.0).collect();
    let rows = sqlx::query_as!(
        FileRow,
        r#"SELECT f.id AS "id: FileAttemptFileId", f.attempt_id AS "attempt_id: FileAttemptId",
                  f.upload_id, f.display_name, u.mime AS content_type, u.size_bytes AS "size_bytes?",
                  u.key AS storage_key, f.position, f.scan_status AS "scan_status: ScanStatus",
                  (extract(epoch FROM f.created_at))::bigint AS "created_at!"
           FROM file_submission_files f JOIN uploads u ON u.id = f.upload_id WHERE f.attempt_id = ANY($1) ORDER BY f.attempt_id, f.position, f.id"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_file(pool: &PgPool, id: FileAttemptFileId) -> Result<Option<FileRow>> {
    let row = sqlx::query_as!(
        FileRow,
        r#"SELECT f.id AS "id: FileAttemptFileId", f.attempt_id AS "attempt_id: FileAttemptId",
                  f.upload_id, f.display_name, u.mime AS content_type, u.size_bytes AS "size_bytes?",
                  u.key AS storage_key, f.position, f.scan_status AS "scan_status: ScanStatus",
                  (extract(epoch FROM f.created_at))::bigint AS "created_at!"
           FROM file_submission_files f JOIN uploads u ON u.id = f.upload_id WHERE f.id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Replace an attempt's file list wholesale (positions follow the slice),
/// on the caller's transaction (BUG-241: with the reference counts).
pub async fn replace_files(
    conn: &mut sqlx::PgConnection,
    attempt_id: FileAttemptId,
    files: &[NewFile<'_>],
) -> Result<()> {
    sqlx::query!(
        "DELETE FROM file_submission_files WHERE attempt_id = $1",
        attempt_id.0
    )
    .execute(&mut *conn)
    .await?;
    for (position, f) in files.iter().enumerate() {
        sqlx::query!(
            r#"INSERT INTO file_submission_files
                   (attempt_id, upload_id, display_name, position)
               VALUES ($1, $2, $3, $4)"#,
            attempt_id.0,
            f.upload_id,
            f.display_name,
            i32::try_from(position).unwrap_or(i32::MAX)
        )
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// Delete the submitted-file rows under locked activities.
///
/// One upload reference is released per row the DELETE returned (BUG-259:
/// the activity → assessment → submission cascade drops the rows, not the
/// counts). Lock order activity (caller) → file tasks (their assessment rows) → hand-ins → uploads by
/// key: the assessment row lock keeps new attempts out and the
/// attempt locks keep a racing draft swap (`touch_attempt`) out of the set.
pub async fn delete_files_releasing(
    conn: &mut sqlx::PgConnection,
    activity_ids: &[uuid::Uuid],
    grace_secs: f64,
) -> Result<u64> {
    let submissions = sqlx::query_scalar!(
        "SELECT a.id FROM assessments a JOIN file_submissions f ON f.id = a.id
         WHERE a.activity_id = ANY($1) ORDER BY a.id FOR UPDATE OF a",
        activity_ids
    )
    .fetch_all(&mut *conn)
    .await?;
    let attempts = sqlx::query_scalar!(
        "SELECT id FROM submissions WHERE assessment_id = ANY($1)
         ORDER BY id FOR UPDATE",
        &submissions
    )
    .fetch_all(&mut *conn)
    .await?;
    delete_attempt_files_releasing(conn, &attempts, grace_secs).await
}

/// BUG-295: drop a learner's open preview attempts (made while staff).
///
/// Draft or returned - a learner never resumes one. Their file rows go with
/// one upload reference released each, as in [`delete_files_releasing`].
pub async fn discard_preview_attempts(
    conn: &mut sqlx::PgConnection,
    file_submission_id: FileSubmissionId,
    user_id: UserId,
    grace_secs: f64,
) -> Result<()> {
    let attempts = sqlx::query_scalar!(
        "SELECT id FROM submissions
         WHERE assessment_id = $1 AND user_id = $2 AND preview
           AND status IN ('draft', 'returned')
         ORDER BY id FOR UPDATE",
        file_submission_id.0,
        user_id.0
    )
    .fetch_all(&mut *conn)
    .await?;
    delete_attempt_files_releasing(&mut *conn, &attempts, grace_secs).await?;
    sqlx::query!("DELETE FROM submissions WHERE id = ANY($1)", &attempts)
        .execute(conn)
        .await?;
    Ok(())
}

/// Delete the file rows of locked attempts, releasing their uploads
/// (uploads locked in key order first; `uploads::release_references`).
async fn delete_attempt_files_releasing(
    conn: &mut sqlx::PgConnection,
    attempts: &[uuid::Uuid],
    grace_secs: f64,
) -> Result<u64> {
    let uploads = sqlx::query_scalar!(
        "SELECT DISTINCT upload_id FROM file_submission_files WHERE attempt_id = ANY($1)",
        attempts
    )
    .fetch_all(&mut *conn)
    .await?;
    crate::uploads::lock_in_key_order(&mut *conn, &uploads).await?;
    let deleted = sqlx::query!(
        "DELETE FROM file_submission_files WHERE attempt_id = ANY($1)",
        attempts
    )
    .execute(&mut *conn)
    .await?;
    crate::uploads::release_references(conn, &uploads, grace_secs).await?;
    Ok(deleted.rows_affected())
}

// ── Per-learner due dates (L-6) ─────────────────────────────────────────────

/// Set (or move) a learner's own due date on a file submission.
pub async fn upsert_override_due(
    conn: &mut sqlx::PgConnection,
    file_submission_id: FileSubmissionId,
    user_id: UserId,
    due_at: i64,
    reason: &str,
    granted_by: UserId,
) -> Result<()> {
    sqlx::query!(
        "INSERT INTO assessment_overrides
             (assessment_id, user_id, due_at_override, due_extended, note, granted_by)
         VALUES ($1, $2, to_timestamp($3::bigint), true, $4, $5)
         ON CONFLICT (assessment_id, user_id) DO UPDATE
             SET due_at_override = EXCLUDED.due_at_override, due_extended = true,
                 note = EXCLUDED.note, granted_by = EXCLUDED.granted_by",
        file_submission_id.0,
        user_id.0,
        due_at,
        reason,
        granted_by.0
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// The learner's own due date (unix seconds), when one was granted.
pub async fn override_due<'e>(
    db: impl sqlx::PgExecutor<'e>,
    file_submission_id: FileSubmissionId,
    user_id: UserId,
) -> Result<Option<i64>> {
    let due = sqlx::query_scalar!(
        r#"SELECT (extract(epoch FROM due_at_override))::bigint AS "due!"
           FROM assessment_overrides
           WHERE assessment_id = $1 AND user_id = $2 AND due_at_override IS NOT NULL"#,
        file_submission_id.0,
        user_id.0
    )
    .fetch_optional(db)
    .await?;
    Ok(due)
}
