//! File-submission queries (compile-checked). Timestamps as epoch seconds.

use ab_core::Result;
use ab_core::assessments::{
    FileAttemptStatus, FileSubmissionLifecycle, GradeReleaseMode, LatePolicyKind, ScanStatus,
};
use ab_core::id::{
    ActivityId, CourseId, FileAttemptFileId, FileAttemptId, FileSubmissionId, UserId,
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

pub async fn insert_file_submission(
    pool: &PgPool,
    activity_id: ActivityId,
    course_id: CourseId,
    creator_id: UserId,
    v: FileSubmissionValues<'_>,
) -> Result<FileSubmissionId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO file_submissions
               (activity_id, course_id, instructions, rubric, allowed_mime_types, max_files,
                max_file_size_mb, due_at, allow_late, late_policy_kind,
                late_penalty_percent_per_day, late_penalty_max_days, late_cutoff_at,
                max_attempts, grade_release_mode, settings, creator_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8), $9, $10, $11, $12,
                   to_timestamp($13), $14, $15, $16, $17)
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
    .fetch_one(pool)
    .await?;
    Ok(id)
}

pub async fn get_file_submission(
    pool: &PgPool,
    id: FileSubmissionId,
) -> Result<Option<FileSubmissionRow>> {
    let row = sqlx::query_as!(
        FileSubmissionRow,
        r#"SELECT id AS "id: FileSubmissionId", activity_id AS "activity_id: ActivityId",
                  course_id AS "course_id: CourseId", instructions, rubric, allowed_mime_types,
                  max_files, max_file_size_mb,
                  (extract(epoch FROM due_at))::bigint AS "due_at?", allow_late,
                  late_policy_kind AS "late_policy_kind: LatePolicyKind",
                  late_penalty_percent_per_day, late_penalty_max_days,
                  (extract(epoch FROM late_cutoff_at))::bigint AS "late_cutoff_at?",
                  max_attempts, grade_release_mode AS "grade_release_mode: GradeReleaseMode",
                  lifecycle AS "lifecycle: FileSubmissionLifecycle",
                  (extract(epoch FROM published_at))::bigint AS "published_at?",
                  (extract(epoch FROM archived_at))::bigint AS "archived_at?",
                  settings, creator_id AS "creator_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM file_submissions WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn get_file_submission_by_activity(
    pool: &PgPool,
    activity_id: ActivityId,
) -> Result<Option<FileSubmissionRow>> {
    let row = sqlx::query_as!(
        FileSubmissionRow,
        r#"SELECT id AS "id: FileSubmissionId", activity_id AS "activity_id: ActivityId",
                  course_id AS "course_id: CourseId", instructions, rubric, allowed_mime_types,
                  max_files, max_file_size_mb,
                  (extract(epoch FROM due_at))::bigint AS "due_at?", allow_late,
                  late_policy_kind AS "late_policy_kind: LatePolicyKind",
                  late_penalty_percent_per_day, late_penalty_max_days,
                  (extract(epoch FROM late_cutoff_at))::bigint AS "late_cutoff_at?",
                  max_attempts, grade_release_mode AS "grade_release_mode: GradeReleaseMode",
                  lifecycle AS "lifecycle: FileSubmissionLifecycle",
                  (extract(epoch FROM published_at))::bigint AS "published_at?",
                  (extract(epoch FROM archived_at))::bigint AS "archived_at?",
                  settings, creator_id AS "creator_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM file_submissions WHERE activity_id = $1"#,
        activity_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn update_file_submission(
    pool: &PgPool,
    id: FileSubmissionId,
    v: FileSubmissionValues<'_>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE file_submissions SET
               instructions = $2, rubric = $3, allowed_mime_types = $4, max_files = $5,
               max_file_size_mb = $6, due_at = to_timestamp($7), allow_late = $8,
               late_policy_kind = $9, late_penalty_percent_per_day = $10,
               late_penalty_max_days = $11, late_cutoff_at = to_timestamp($12),
               max_attempts = $13, grade_release_mode = $14, settings = $15
           WHERE id = $1"#,
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
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Publishing stamps `published_at` once; archiving stamps `archived_at`;
/// going back to draft clears `archived_at` only.
pub async fn set_file_submission_lifecycle(
    pool: &PgPool,
    id: FileSubmissionId,
    lifecycle: FileSubmissionLifecycle,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE file_submissions SET
               lifecycle = $2,
               published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, now())
                                   ELSE published_at END,
               archived_at = CASE WHEN $2 = 'archived' THEN now() ELSE NULL END
           WHERE id = $1"#,
        id.0,
        lifecycle.as_str()
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
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
    pub final_score: Option<f64>,
    pub feedback: String,
    pub rubric_scores: serde_json::Value,
    pub graded_by: Option<UserId>,
    pub version: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Open a draft (started now). `None` when the learner already has an open
/// (draft or returned) attempt — the partial unique index absorbs the race.
pub async fn insert_attempt(
    pool: &PgPool,
    file_submission_id: FileSubmissionId,
    course_id: CourseId,
    user_id: UserId,
    attempt_number: i32,
) -> Result<Option<FileAttemptId>> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO file_submission_attempts
               (file_submission_id, course_id, user_id, attempt_number, started_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (file_submission_id, user_id) WHERE status IN ('draft', 'returned')
           DO NOTHING
           RETURNING id AS "id: FileAttemptId""#,
        file_submission_id.0,
        course_id.0,
        user_id.0,
        attempt_number
    )
    .fetch_optional(pool)
    .await?;
    Ok(id)
}

pub async fn get_attempt(pool: &PgPool, id: FileAttemptId) -> Result<Option<AttemptRow>> {
    let row = sqlx::query_as!(
        AttemptRow,
        r#"SELECT id AS "id: FileAttemptId",
                  file_submission_id AS "file_submission_id: FileSubmissionId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  status AS "status: FileAttemptStatus", attempt_number,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM graded_at))::bigint AS "graded_at?",
                  is_late, late_penalty_pct, final_score, feedback, rubric_scores,
                  graded_by AS "graded_by: UserId", version,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM file_submission_attempts WHERE id = $1"#,
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
        r#"SELECT id AS "id: FileAttemptId",
                  file_submission_id AS "file_submission_id: FileSubmissionId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  status AS "status: FileAttemptStatus", attempt_number,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM graded_at))::bigint AS "graded_at?",
                  is_late, late_penalty_pct, final_score, feedback, rubric_scores,
                  graded_by AS "graded_by: UserId", version,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM file_submission_attempts
           WHERE file_submission_id = $1 AND user_id = $2 AND status IN ('draft', 'returned')
           ORDER BY attempt_number DESC LIMIT 1"#,
        file_submission_id.0,
        user_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Every attempt of one learner, newest first.
pub async fn list_user_attempts(
    pool: &PgPool,
    file_submission_id: FileSubmissionId,
    user_id: UserId,
) -> Result<Vec<AttemptRow>> {
    let rows = sqlx::query_as!(
        AttemptRow,
        r#"SELECT id AS "id: FileAttemptId",
                  file_submission_id AS "file_submission_id: FileSubmissionId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  status AS "status: FileAttemptStatus", attempt_number,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM graded_at))::bigint AS "graded_at?",
                  is_late, late_penalty_pct, final_score, feedback, rubric_scores,
                  graded_by AS "graded_by: UserId", version,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM file_submission_attempts
           WHERE file_submission_id = $1 AND user_id = $2
           ORDER BY attempt_number DESC"#,
        file_submission_id.0,
        user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Every attempt of the activity, newest submission first (export).
pub async fn list_attempts(
    pool: &PgPool,
    file_submission_id: FileSubmissionId,
) -> Result<Vec<AttemptRow>> {
    let rows = sqlx::query_as!(
        AttemptRow,
        r#"SELECT id AS "id: FileAttemptId",
                  file_submission_id AS "file_submission_id: FileSubmissionId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  status AS "status: FileAttemptStatus", attempt_number,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM graded_at))::bigint AS "graded_at?",
                  is_late, late_penalty_pct, final_score, feedback, rubric_scores,
                  graded_by AS "graded_by: UserId", version,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM file_submission_attempts
           WHERE file_submission_id = $1
           ORDER BY submitted_at DESC NULLS LAST, id DESC"#,
        file_submission_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Attempts that count against the cap (everything past draft).
pub async fn count_completed_attempts(
    pool: &PgPool,
    file_submission_id: FileSubmissionId,
    user_id: UserId,
) -> Result<i64> {
    let count = sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM file_submission_attempts
           WHERE file_submission_id = $1 AND user_id = $2 AND status <> 'draft'"#,
        file_submission_id.0,
        user_id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(count)
}

/// Bump the lock after a file change. `false` = version mismatch.
pub async fn touch_attempt(
    pool: &PgPool,
    id: FileAttemptId,
    expected_version: i64,
) -> Result<bool> {
    let updated = sqlx::query!(
        "UPDATE file_submission_attempts SET version = version + 1 WHERE id = $1 AND version = $2",
        id.0,
        expected_version
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Draft/returned → submitted under the lock.
pub async fn submit_attempt(
    pool: &PgPool,
    id: FileAttemptId,
    expected_version: i64,
    is_late: bool,
    late_penalty_pct: f64,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE file_submission_attempts SET
               status = 'submitted', submitted_at = now(), is_late = $3, late_penalty_pct = $4,
               version = version + 1
           WHERE id = $1 AND version = $2 AND status IN ('draft', 'returned')"#,
        id.0,
        expected_version,
        is_late,
        late_penalty_pct
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// What a grader writes.
pub struct GradeWrite<'a> {
    pub status: FileAttemptStatus,
    pub final_score: Option<f64>,
    pub feedback: &'a str,
    /// `None` keeps the stored rubric scores.
    pub rubric_scores: Option<&'a serde_json::Value>,
    pub graded_by: UserId,
}

/// Grader write under the lock.
pub async fn grade_attempt(
    pool: &PgPool,
    id: FileAttemptId,
    expected_version: i64,
    grade: GradeWrite<'_>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE file_submission_attempts SET
               status = $3, final_score = $4, feedback = $5,
               rubric_scores = COALESCE($6, rubric_scores),
               graded_by = $7, graded_at = now(), version = version + 1
           WHERE id = $1 AND version = $2"#,
        id.0,
        expected_version,
        grade.status.as_str(),
        grade.final_score,
        grade.feedback,
        grade.rubric_scores,
        grade.graded_by.0
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
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
}

/// Non-draft attempts, newest first (keyset on id), filtered by status and
/// a learner-name/email substring.
pub async fn list_for_review(
    pool: &PgPool,
    file_submission_id: FileSubmissionId,
    status: Option<FileAttemptStatus>,
    search: Option<&str>,
    cursor: Option<FileAttemptId>,
    limit: i64,
) -> Result<Vec<ReviewAttemptRow>> {
    let pattern = search.map(|s| format!("%{}%", s.replace('%', "\\%").replace('_', "\\_")));
    let rows = sqlx::query_as!(
        ReviewAttemptRow,
        r#"SELECT a.id AS "id: FileAttemptId", a.user_id AS "user_id: UserId",
                  u.username, u.display_name, u.email,
                  a.status AS "status: FileAttemptStatus", a.attempt_number,
                  (extract(epoch FROM a.submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM a.graded_at))::bigint AS "graded_at?",
                  a.is_late, a.final_score, a.version,
                  (SELECT count(*) FROM file_submission_files f WHERE f.attempt_id = a.id)
                      AS "file_count!"
           FROM file_submission_attempts a JOIN users u ON u.id = a.user_id
           WHERE a.file_submission_id = $1 AND a.status <> 'draft'
             AND ($2::text IS NULL OR a.status = $2)
             AND ($3::text IS NULL OR u.username ILIKE $3 OR u.display_name ILIKE $3
                  OR u.email ILIKE $3)
             AND ($4::uuid IS NULL OR a.id < $4)
           ORDER BY a.id DESC
           LIMIT $5"#,
        file_submission_id.0,
        status.map(FileAttemptStatus::as_str),
        pattern.as_deref(),
        cursor.map(|c| c.0),
        limit
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
    pub content_type: &'a str,
    pub size_bytes: Option<i64>,
    pub storage_key: &'a str,
}

pub async fn list_files(pool: &PgPool, attempt_id: FileAttemptId) -> Result<Vec<FileRow>> {
    let rows = sqlx::query_as!(
        FileRow,
        r#"SELECT id AS "id: FileAttemptFileId", attempt_id AS "attempt_id: FileAttemptId",
                  upload_id, display_name, content_type, size_bytes, storage_key, position,
                  scan_status AS "scan_status: ScanStatus",
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM file_submission_files WHERE attempt_id = $1 ORDER BY position, id"#,
        attempt_id.0
    )
    .fetch_all(pool)
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
        r#"SELECT id AS "id: FileAttemptFileId", attempt_id AS "attempt_id: FileAttemptId",
                  upload_id, display_name, content_type, size_bytes, storage_key, position,
                  scan_status AS "scan_status: ScanStatus",
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM file_submission_files WHERE attempt_id = ANY($1) ORDER BY attempt_id, position, id"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_file(pool: &PgPool, id: FileAttemptFileId) -> Result<Option<FileRow>> {
    let row = sqlx::query_as!(
        FileRow,
        r#"SELECT id AS "id: FileAttemptFileId", attempt_id AS "attempt_id: FileAttemptId",
                  upload_id, display_name, content_type, size_bytes, storage_key, position,
                  scan_status AS "scan_status: ScanStatus",
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM file_submission_files WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Replace an attempt's file list wholesale (positions follow the slice).
pub async fn replace_files(
    pool: &PgPool,
    attempt_id: FileAttemptId,
    files: &[NewFile<'_>],
) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query!(
        "DELETE FROM file_submission_files WHERE attempt_id = $1",
        attempt_id.0
    )
    .execute(&mut *tx)
    .await?;
    for (position, f) in files.iter().enumerate() {
        sqlx::query!(
            r#"INSERT INTO file_submission_files
                   (attempt_id, upload_id, display_name, content_type, size_bytes, storage_key,
                    position)
               VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
            attempt_id.0,
            f.upload_id,
            f.display_name,
            f.content_type,
            f.size_bytes,
            f.storage_key,
            i32::try_from(position).unwrap_or(i32::MAX)
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}
