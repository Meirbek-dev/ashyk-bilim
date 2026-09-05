//! Submission, grading-ledger, feedback, code-run, bulk-action and
//! idempotency queries (compile-checked). Timestamps as epoch seconds.

use ab_core::Result;
use ab_core::assessments::{
    AnnotationType, AutoSubmitReason, BulkActionStatus, BulkActionType, CodeRunPurpose,
    CodeRunStatus, SubmissionStatus,
};
use ab_core::id::{
    AssessmentId, AssessmentItemId, BulkActionId, CodeRunId, CourseId, GradingEntryId,
    ItemFeedbackId, SubmissionId, UserId,
};
use sqlx::PgPool;

// ── Submissions ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct SubmissionRow {
    pub id: SubmissionId,
    pub assessment_id: AssessmentId,
    pub course_id: CourseId,
    pub user_id: UserId,
    pub status: SubmissionStatus,
    pub attempt_number: i32,
    pub answers: serde_json::Value,
    pub grading: serde_json::Value,
    pub auto_score: Option<f64>,
    pub final_score: Option<f64>,
    pub is_late: bool,
    pub late_penalty_pct: f64,
    pub violation_count: i32,
    pub violations: serde_json::Value,
    pub auto_submit_reason: Option<AutoSubmitReason>,
    pub auto_submitted_at: Option<i64>,
    pub auto_submit_attempts: i32,
    pub auto_submit_retry_at: Option<i64>,
    pub duration_seconds: Option<i32>,
    pub started_at: Option<i64>,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
    pub version: i64,
    pub draft_version: i64,
    pub grading_version: i32,
    pub content_version: i32,
    pub policy_version: i32,
    pub items_snapshot: Option<serde_json::Value>,
    pub policy_snapshot: Option<serde_json::Value>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Open a draft (started now). `None` when the learner already has one —
/// the partial unique index turns the race into a no-op.
pub async fn insert_draft(
    pool: &PgPool,
    assessment_id: AssessmentId,
    course_id: CourseId,
    user_id: UserId,
    attempt_number: i32,
    content_version: i32,
    policy_version: i32,
) -> Result<Option<SubmissionId>> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO submissions
               (assessment_id, course_id, user_id, attempt_number, content_version,
                policy_version, started_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (assessment_id, user_id) WHERE status = 'draft' DO NOTHING
           RETURNING id AS "id: SubmissionId""#,
        assessment_id.0,
        course_id.0,
        user_id.0,
        attempt_number,
        content_version,
        policy_version
    )
    .fetch_optional(pool)
    .await?;
    Ok(id)
}

pub async fn get_submission(pool: &PgPool, id: SubmissionId) -> Result<Option<SubmissionRow>> {
    let row = sqlx::query_as!(
        SubmissionRow,
        r#"SELECT id AS "id: SubmissionId", assessment_id AS "assessment_id: AssessmentId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  status AS "status: SubmissionStatus", attempt_number, answers, grading,
                  auto_score, final_score, is_late, late_penalty_pct,
                  violation_count, violations,
                  auto_submit_reason AS "auto_submit_reason: AutoSubmitReason",
                  (extract(epoch FROM auto_submitted_at))::bigint AS "auto_submitted_at?",
                  auto_submit_attempts,
                  (extract(epoch FROM auto_submit_retry_at))::bigint AS "auto_submit_retry_at?",
                  duration_seconds,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM graded_at))::bigint AS "graded_at?",
                  version, draft_version, grading_version, content_version, policy_version,
                  items_snapshot, policy_snapshot,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM submissions WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn open_draft(
    pool: &PgPool,
    assessment_id: AssessmentId,
    user_id: UserId,
) -> Result<Option<SubmissionRow>> {
    let row = sqlx::query_as!(
        SubmissionRow,
        r#"SELECT id AS "id: SubmissionId", assessment_id AS "assessment_id: AssessmentId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  status AS "status: SubmissionStatus", attempt_number, answers, grading,
                  auto_score, final_score, is_late, late_penalty_pct,
                  violation_count, violations,
                  auto_submit_reason AS "auto_submit_reason: AutoSubmitReason",
                  (extract(epoch FROM auto_submitted_at))::bigint AS "auto_submitted_at?",
                  auto_submit_attempts,
                  (extract(epoch FROM auto_submit_retry_at))::bigint AS "auto_submit_retry_at?",
                  duration_seconds,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM graded_at))::bigint AS "graded_at?",
                  version, draft_version, grading_version, content_version, policy_version,
                  items_snapshot, policy_snapshot,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM submissions WHERE assessment_id = $1 AND user_id = $2 AND status = 'draft'"#,
        assessment_id.0,
        user_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Every attempt by one learner, newest first.
pub async fn list_user_submissions(
    pool: &PgPool,
    assessment_id: AssessmentId,
    user_id: UserId,
) -> Result<Vec<SubmissionRow>> {
    let rows = sqlx::query_as!(
        SubmissionRow,
        r#"SELECT id AS "id: SubmissionId", assessment_id AS "assessment_id: AssessmentId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  status AS "status: SubmissionStatus", attempt_number, answers, grading,
                  auto_score, final_score, is_late, late_penalty_pct,
                  violation_count, violations,
                  auto_submit_reason AS "auto_submit_reason: AutoSubmitReason",
                  (extract(epoch FROM auto_submitted_at))::bigint AS "auto_submitted_at?",
                  auto_submit_attempts,
                  (extract(epoch FROM auto_submit_retry_at))::bigint AS "auto_submit_retry_at?",
                  duration_seconds,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM graded_at))::bigint AS "graded_at?",
                  version, draft_version, grading_version, content_version, policy_version,
                  items_snapshot, policy_snapshot,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM submissions WHERE assessment_id = $1 AND user_id = $2 ORDER BY id DESC"#,
        assessment_id.0,
        user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Attempts that left the draft state (the attempt-limit counter).
pub async fn count_completed_attempts(
    pool: &PgPool,
    assessment_id: AssessmentId,
    user_id: UserId,
) -> Result<i64> {
    let count = sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM submissions
           WHERE assessment_id = $1 AND user_id = $2 AND status <> 'draft'"#,
        assessment_id.0,
        user_id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(count)
}

/// Learner draft save under optimistic lock (`draft_version`). `false` =
/// version mismatch or not a draft any more.
pub async fn save_draft_answers(
    pool: &PgPool,
    id: SubmissionId,
    answers: &serde_json::Value,
    expected_draft_version: i64,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE submissions
           SET answers = $2, draft_version = draft_version + 1
           WHERE id = $1 AND status = 'draft' AND draft_version = $3"#,
        id.0,
        answers,
        expected_draft_version
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Record anti-cheat violations on an open draft.
pub async fn record_violations(
    pool: &PgPool,
    id: SubmissionId,
    violation_count: i32,
    violations: &serde_json::Value,
) -> Result<()> {
    sqlx::query!(
        "UPDATE submissions SET violation_count = $2, violations = $3 WHERE id = $1",
        id.0,
        violation_count,
        violations
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Write-once snapshots of what the learner answered against.
pub async fn set_snapshots(
    pool: &PgPool,
    id: SubmissionId,
    items: &serde_json::Value,
    policy: &serde_json::Value,
) -> Result<()> {
    sqlx::query!(
        r#"UPDATE submissions SET items_snapshot = $2, policy_snapshot = $3
           WHERE id = $1 AND items_snapshot IS NULL"#,
        id.0,
        items,
        policy
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Everything the submit pipeline decides, written in one statement.
pub struct SubmitOutcome<'a> {
    pub status: SubmissionStatus,
    pub answers: &'a serde_json::Value,
    pub grading: &'a serde_json::Value,
    pub auto_score: Option<f64>,
    pub final_score: Option<f64>,
    pub is_late: bool,
    pub late_penalty_pct: f64,
    pub violation_count: i32,
    pub auto_submit_reason: Option<AutoSubmitReason>,
    pub graded: bool,
    pub duration_seconds: Option<i32>,
}

/// Draft → submitted. `false` when the row is no longer a draft (a
/// concurrent submit or the timer got there first).
pub async fn persist_submit(pool: &PgPool, id: SubmissionId, o: SubmitOutcome<'_>) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE submissions SET
               status = $2, answers = $3, grading = $4, auto_score = $5, final_score = $6,
               is_late = $7, late_penalty_pct = $8, violation_count = $9,
               auto_submit_reason = $10,
               auto_submitted_at = CASE WHEN $10::text IS NULL THEN NULL ELSE now() END,
               submitted_at = now(),
               graded_at = CASE WHEN $11 THEN now() ELSE NULL END,
               duration_seconds = $12
           WHERE id = $1 AND status = 'draft'"#,
        id.0,
        o.status.as_str(),
        o.answers,
        o.grading,
        o.auto_score,
        o.final_score,
        o.is_late,
        o.late_penalty_pct,
        o.violation_count,
        o.auto_submit_reason.map(AutoSubmitReason::as_str),
        o.graded,
        o.duration_seconds
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Teacher write under optimistic lock (`version`). `false` = mismatch.
pub async fn teacher_save(
    pool: &PgPool,
    id: SubmissionId,
    expected_version: i64,
    status: SubmissionStatus,
    grading: &serde_json::Value,
    final_score: f64,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE submissions SET
               status = $2, grading = $3, final_score = $4,
               graded_at = now(), version = version + 1
           WHERE id = $1 AND version = $5"#,
        id.0,
        status.as_str(),
        grading,
        final_score,
        expected_version
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Bulk release: flip graded → published carrying the entry's final score.
pub async fn mark_published(pool: &PgPool, id: SubmissionId, final_score: f64) -> Result<()> {
    sqlx::query!(
        r#"UPDATE submissions SET status = 'published', final_score = $2, version = version + 1
           WHERE id = $1"#,
        id.0,
        final_score
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Recompute lateness after a deadline change.
pub async fn set_is_late(pool: &PgPool, id: SubmissionId, is_late: bool) -> Result<()> {
    sqlx::query!(
        "UPDATE submissions SET is_late = $2 WHERE id = $1",
        id.0,
        is_late
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Review queue (teacher) ──────────────────────────────────────────────────

/// A submission joined with who made it.
#[derive(Debug, Clone)]
pub struct ReviewRow {
    pub id: SubmissionId,
    pub user_id: UserId,
    pub username: String,
    pub display_name: String,
    pub status: SubmissionStatus,
    pub attempt_number: i32,
    pub auto_score: Option<f64>,
    pub final_score: Option<f64>,
    pub is_late: bool,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
    pub version: i64,
}

/// Non-draft submissions of an assessment, newest first (keyset on id),
/// optionally filtered by status / lateness / learner-name substring.
pub async fn list_for_review(
    pool: &PgPool,
    assessment_id: AssessmentId,
    status: Option<SubmissionStatus>,
    late_only: bool,
    search: Option<&str>,
    cursor: Option<SubmissionId>,
    limit: i64,
) -> Result<Vec<ReviewRow>> {
    let pattern = search.map(|s| format!("%{}%", s.replace('%', "\\%").replace('_', "\\_")));
    let rows = sqlx::query_as!(
        ReviewRow,
        r#"SELECT s.id AS "id: SubmissionId", s.user_id AS "user_id: UserId",
                  u.username, u.display_name, s.status AS "status: SubmissionStatus",
                  s.attempt_number, s.auto_score, s.final_score, s.is_late,
                  (extract(epoch FROM s.submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM s.graded_at))::bigint AS "graded_at?",
                  s.version
           FROM submissions s JOIN users u ON u.id = s.user_id
           WHERE s.assessment_id = $1 AND s.status <> 'draft'
             AND ($2::text IS NULL OR s.status = $2)
             AND (NOT $3 OR s.is_late)
             AND ($4::text IS NULL OR u.username ILIKE $4 OR u.display_name ILIKE $4)
             AND ($5::uuid IS NULL OR s.id < $5)
           ORDER BY s.id DESC
           LIMIT $6"#,
        assessment_id.0,
        status.map(SubmissionStatus::as_str),
        late_only,
        pattern.as_deref(),
        cursor.map(|c| c.0),
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone, Copy, Default)]
pub struct SubmissionStats {
    pub total: i64,
    pub pending: i64,
    pub graded: i64,
    pub published: i64,
    pub returned: i64,
    pub late: i64,
}

pub async fn stats(pool: &PgPool, assessment_id: AssessmentId) -> Result<SubmissionStats> {
    let row = sqlx::query!(
        r#"SELECT count(*) FILTER (WHERE status <> 'draft') AS "total!",
                  count(*) FILTER (WHERE status = 'pending') AS "pending!",
                  count(*) FILTER (WHERE status = 'graded') AS "graded!",
                  count(*) FILTER (WHERE status = 'published') AS "published!",
                  count(*) FILTER (WHERE status = 'returned') AS "returned!",
                  count(*) FILTER (WHERE status <> 'draft' AND is_late) AS "late!"
           FROM submissions WHERE assessment_id = $1"#,
        assessment_id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(SubmissionStats {
        total: row.total,
        pending: row.pending,
        graded: row.graded,
        published: row.published,
        returned: row.returned,
        late: row.late,
    })
}

/// Final scores of graded/published work (for pass rate + distribution).
pub async fn graded_scores(pool: &PgPool, assessment_id: AssessmentId) -> Result<Vec<f64>> {
    let scores = sqlx::query_scalar!(
        r#"SELECT final_score AS "final_score!" FROM submissions
           WHERE assessment_id = $1 AND status IN ('graded', 'published')
             AND final_score IS NOT NULL"#,
        assessment_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(scores)
}

/// Graded/published submissions of an assessment (bulk release input).
pub async fn list_releasable(
    pool: &PgPool,
    assessment_id: AssessmentId,
) -> Result<Vec<SubmissionRow>> {
    let rows = sqlx::query_as!(
        SubmissionRow,
        r#"SELECT id AS "id: SubmissionId", assessment_id AS "assessment_id: AssessmentId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  status AS "status: SubmissionStatus", attempt_number, answers, grading,
                  auto_score, final_score, is_late, late_penalty_pct,
                  violation_count, violations,
                  auto_submit_reason AS "auto_submit_reason: AutoSubmitReason",
                  (extract(epoch FROM auto_submitted_at))::bigint AS "auto_submitted_at?",
                  auto_submit_attempts,
                  (extract(epoch FROM auto_submit_retry_at))::bigint AS "auto_submit_retry_at?",
                  duration_seconds,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM graded_at))::bigint AS "graded_at?",
                  version, draft_version, grading_version, content_version, policy_version,
                  items_snapshot, policy_snapshot,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM submissions WHERE assessment_id = $1 AND status IN ('graded', 'published') ORDER BY id"#,
        assessment_id.0

    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Submitted work of one learner on an assessment (deadline recompute).
pub async fn list_submitted_for_user(
    pool: &PgPool,
    assessment_id: AssessmentId,
    user_id: UserId,
) -> Result<Vec<SubmissionRow>> {
    let rows = sqlx::query_as!(
        SubmissionRow,
        r#"SELECT id AS "id: SubmissionId", assessment_id AS "assessment_id: AssessmentId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  status AS "status: SubmissionStatus", attempt_number, answers, grading,
                  auto_score, final_score, is_late, late_penalty_pct,
                  violation_count, violations,
                  auto_submit_reason AS "auto_submit_reason: AutoSubmitReason",
                  (extract(epoch FROM auto_submitted_at))::bigint AS "auto_submitted_at?",
                  auto_submit_attempts,
                  (extract(epoch FROM auto_submit_retry_at))::bigint AS "auto_submit_retry_at?",
                  duration_seconds,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM submitted_at))::bigint AS "submitted_at?",
                  (extract(epoch FROM graded_at))::bigint AS "graded_at?",
                  version, draft_version, grading_version, content_version, policy_version,
                  items_snapshot, policy_snapshot,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM submissions WHERE assessment_id = $1 AND user_id = $2 AND status <> 'draft' ORDER BY id"#,
        assessment_id.0,
        user_id.0

    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Timer sweep ─────────────────────────────────────────────────────────────

/// Open timed drafts past their deadline and not backing off.
pub async fn list_expired_drafts(pool: &PgPool, limit: i64) -> Result<Vec<SubmissionId>> {
    let ids = sqlx::query_scalar!(
        r#"SELECT s.id AS "id: SubmissionId"
           FROM submissions s JOIN assessments a ON a.id = s.assessment_id
           WHERE s.status = 'draft' AND s.started_at IS NOT NULL
             AND a.time_limit_seconds IS NOT NULL
             AND s.started_at + make_interval(secs => a.time_limit_seconds) <= now()
             AND (s.auto_submit_retry_at IS NULL OR s.auto_submit_retry_at <= now())
             AND s.auto_submit_attempts < 5
           ORDER BY s.started_at
           LIMIT $1"#,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(ids)
}

/// Exponential backoff bookkeeping when an auto-submit fails.
pub async fn record_auto_submit_failure(
    pool: &PgPool,
    id: SubmissionId,
    retry_after_secs: f64,
) -> Result<()> {
    sqlx::query!(
        r#"UPDATE submissions
           SET auto_submit_attempts = auto_submit_attempts + 1,
               auto_submit_retry_at = now() + make_interval(secs => $2)
           WHERE id = $1"#,
        id.0,
        retry_after_secs
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Grading ledger ──────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct GradingEntryRow {
    pub id: GradingEntryId,
    pub submission_id: SubmissionId,
    pub graded_by: Option<UserId>,
    pub raw_score: f64,
    pub penalty_pct: f64,
    pub final_score: f64,
    pub raw_breakdown: serde_json::Value,
    pub effective_breakdown: serde_json::Value,
    pub overall_feedback: String,
    pub grading_version: i32,
    pub published_at: Option<i64>,
    pub created_at: i64,
}

pub struct NewGradingEntry<'a> {
    pub submission_id: SubmissionId,
    pub graded_by: Option<UserId>,
    pub raw_score: f64,
    pub penalty_pct: f64,
    pub final_score: f64,
    pub raw_breakdown: &'a serde_json::Value,
    pub effective_breakdown: &'a serde_json::Value,
    pub overall_feedback: &'a str,
    pub published: bool,
}

pub async fn insert_grading_entry(pool: &PgPool, e: NewGradingEntry<'_>) -> Result<GradingEntryId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO grading_entries
               (submission_id, graded_by, raw_score, penalty_pct, final_score,
                raw_breakdown, effective_breakdown, overall_feedback, published_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                   CASE WHEN $9 THEN now() ELSE NULL END)
           RETURNING id AS "id: GradingEntryId""#,
        e.submission_id.0,
        e.graded_by.map(|u| u.0),
        e.raw_score,
        e.penalty_pct,
        e.final_score,
        e.raw_breakdown,
        e.effective_breakdown,
        e.overall_feedback,
        e.published
    )
    .fetch_one(pool)
    .await?;
    Ok(id)
}

pub async fn latest_grading_entry(
    pool: &PgPool,
    submission_id: SubmissionId,
) -> Result<Option<GradingEntryRow>> {
    let row = sqlx::query_as!(
        GradingEntryRow,
        r#"SELECT id AS "id: GradingEntryId", submission_id AS "submission_id: SubmissionId",
                  graded_by AS "graded_by: UserId", raw_score, penalty_pct, final_score,
                  raw_breakdown, effective_breakdown, overall_feedback, grading_version,
                  (extract(epoch FROM published_at))::bigint AS "published_at?",
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM grading_entries WHERE submission_id = $1 ORDER BY id DESC LIMIT 1"#,
        submission_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_grading_entries(
    pool: &PgPool,
    submission_id: SubmissionId,
) -> Result<Vec<GradingEntryRow>> {
    let rows = sqlx::query_as!(
        GradingEntryRow,
        r#"SELECT id AS "id: GradingEntryId", submission_id AS "submission_id: SubmissionId",
                  graded_by AS "graded_by: UserId", raw_score, penalty_pct, final_score,
                  raw_breakdown, effective_breakdown, overall_feedback, grading_version,
                  (extract(epoch FROM published_at))::bigint AS "published_at?",
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM grading_entries WHERE submission_id = $1 ORDER BY id DESC"#,
        submission_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Does the learner have a released grade on this submission?
pub async fn has_published_entry(pool: &PgPool, submission_id: SubmissionId) -> Result<bool> {
    let published = sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM grading_entries
                          WHERE submission_id = $1 AND published_at IS NOT NULL) AS "published!""#,
        submission_id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(published)
}

// ── Item feedback ───────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ItemFeedbackRow {
    pub id: ItemFeedbackId,
    pub grading_entry_id: GradingEntryId,
    pub submission_id: SubmissionId,
    pub item_id: Option<AssessmentItemId>,
    pub item_ref: String,
    pub comment: String,
    pub score: Option<f64>,
    pub max_score: Option<f64>,
    pub annotation_type: AnnotationType,
    pub annotation_key: Option<String>,
    pub graded_by: Option<UserId>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct NewItemFeedback<'a> {
    pub grading_entry_id: GradingEntryId,
    pub submission_id: SubmissionId,
    pub item_id: Option<AssessmentItemId>,
    pub item_ref: &'a str,
    pub comment: &'a str,
    pub score: Option<f64>,
    pub max_score: Option<f64>,
    pub annotation_type: AnnotationType,
    pub annotation_key: Option<&'a str>,
    pub graded_by: UserId,
}

pub async fn insert_item_feedback(pool: &PgPool, f: NewItemFeedback<'_>) -> Result<ItemFeedbackId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO item_feedback
               (grading_entry_id, submission_id, item_id, item_ref, comment, score, max_score,
                annotation_type, annotation_key, graded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id AS "id: ItemFeedbackId""#,
        f.grading_entry_id.0,
        f.submission_id.0,
        f.item_id.map(|i| i.0),
        f.item_ref,
        f.comment,
        f.score,
        f.max_score,
        f.annotation_type.as_str(),
        f.annotation_key,
        f.graded_by.0
    )
    .fetch_one(pool)
    .await?;
    Ok(id)
}

pub async fn get_item_feedback(
    pool: &PgPool,
    id: ItemFeedbackId,
) -> Result<Option<ItemFeedbackRow>> {
    let row = sqlx::query_as!(
        ItemFeedbackRow,
        r#"SELECT id AS "id: ItemFeedbackId",
                  grading_entry_id AS "grading_entry_id: GradingEntryId",
                  submission_id AS "submission_id: SubmissionId",
                  item_id AS "item_id: AssessmentItemId", item_ref, comment, score, max_score,
                  annotation_type AS "annotation_type: AnnotationType", annotation_key,
                  graded_by AS "graded_by: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM item_feedback WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Feedback on a submission; `published_only` hides teacher drafts (the
/// learner view).
pub async fn list_item_feedback(
    pool: &PgPool,
    submission_id: SubmissionId,
    published_only: bool,
) -> Result<Vec<ItemFeedbackRow>> {
    let rows = sqlx::query_as!(
        ItemFeedbackRow,
        r#"SELECT f.id AS "id: ItemFeedbackId",
                  f.grading_entry_id AS "grading_entry_id: GradingEntryId",
                  f.submission_id AS "submission_id: SubmissionId",
                  f.item_id AS "item_id: AssessmentItemId", f.item_ref, f.comment, f.score,
                  f.max_score, f.annotation_type AS "annotation_type: AnnotationType",
                  f.annotation_key, f.graded_by AS "graded_by: UserId",
                  (extract(epoch FROM f.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM f.updated_at))::bigint AS "updated_at!"
           FROM item_feedback f JOIN grading_entries g ON g.id = f.grading_entry_id
           WHERE f.submission_id = $1 AND (NOT $2 OR g.published_at IS NOT NULL)
           ORDER BY f.id"#,
        submission_id.0,
        published_only
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn update_item_feedback(
    pool: &PgPool,
    id: ItemFeedbackId,
    comment: Option<&str>,
    score: Option<Option<f64>>,
    max_score: Option<Option<f64>>,
    annotation_type: Option<AnnotationType>,
    annotation_key: Option<Option<&str>>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE item_feedback SET
               comment = COALESCE($2, comment),
               score = CASE WHEN $3 THEN $4 ELSE score END,
               max_score = CASE WHEN $5 THEN $6 ELSE max_score END,
               annotation_type = COALESCE($7, annotation_type),
               annotation_key = CASE WHEN $8 THEN $9 ELSE annotation_key END
           WHERE id = $1"#,
        id.0,
        comment,
        score.is_some(),
        score.flatten(),
        max_score.is_some(),
        max_score.flatten(),
        annotation_type.map(AnnotationType::as_str),
        annotation_key.is_some(),
        annotation_key.flatten()
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

pub async fn delete_item_feedback(pool: &PgPool, id: ItemFeedbackId) -> Result<bool> {
    let deleted = sqlx::query!("DELETE FROM item_feedback WHERE id = $1", id.0)
        .execute(pool)
        .await?;
    Ok(deleted.rows_affected() == 1)
}

// ── Code runs ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CodeRunRow {
    pub id: CodeRunId,
    pub assessment_id: AssessmentId,
    pub item_id: AssessmentItemId,
    pub submission_id: Option<SubmissionId>,
    pub user_id: UserId,
    pub purpose: CodeRunPurpose,
    pub status: CodeRunStatus,
    pub language_id: i32,
    pub source_sha256: String,
    pub stdin_sha256: Option<String>,
    pub idempotency_key: Option<String>,
    pub passed: i32,
    pub total: i32,
    pub score: Option<f64>,
    pub compile_output: Option<String>,
    pub error_message: Option<String>,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub created_at: i64,
}

pub struct NewCodeRun<'a> {
    pub assessment_id: AssessmentId,
    pub item_id: AssessmentItemId,
    pub submission_id: Option<SubmissionId>,
    pub user_id: UserId,
    pub purpose: CodeRunPurpose,
    pub language_id: i32,
    pub source_sha256: &'a str,
    pub stdin_sha256: Option<&'a str>,
    pub idempotency_key: Option<&'a str>,
    pub total: i32,
}

/// Insert as `running`. `None` when the idempotency key is already taken
/// (the caller decides whether that's a replay or a conflict).
pub async fn insert_code_run(pool: &PgPool, r: NewCodeRun<'_>) -> Result<Option<CodeRunId>> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO code_runs
               (assessment_id, item_id, submission_id, user_id, purpose, status, language_id,
                source_sha256, stdin_sha256, idempotency_key, total, started_at)
           VALUES ($1, $2, $3, $4, $5, 'running', $6, $7, $8, $9, $10, now())
           ON CONFLICT (user_id, item_id, purpose, idempotency_key) DO NOTHING
           RETURNING id AS "id: CodeRunId""#,
        r.assessment_id.0,
        r.item_id.0,
        r.submission_id.map(|s| s.0),
        r.user_id.0,
        r.purpose.as_str(),
        r.language_id,
        r.source_sha256,
        r.stdin_sha256,
        r.idempotency_key,
        r.total
    )
    .fetch_optional(pool)
    .await?;
    Ok(id)
}

pub async fn finish_code_run(
    pool: &PgPool,
    id: CodeRunId,
    status: CodeRunStatus,
    passed: i32,
    score: Option<f64>,
    compile_output: Option<&str>,
    error_message: Option<&str>,
) -> Result<()> {
    sqlx::query!(
        r#"UPDATE code_runs SET status = $2, passed = $3, score = $4, compile_output = $5,
               error_message = $6, finished_at = now()
           WHERE id = $1"#,
        id.0,
        status.as_str(),
        passed,
        score,
        compile_output,
        error_message
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_code_run(pool: &PgPool, id: CodeRunId) -> Result<Option<CodeRunRow>> {
    let row = sqlx::query_as!(
        CodeRunRow,
        r#"SELECT id AS "id: CodeRunId", assessment_id AS "assessment_id: AssessmentId",
                  item_id AS "item_id: AssessmentItemId",
                  submission_id AS "submission_id: SubmissionId", user_id AS "user_id: UserId",
                  purpose AS "purpose: CodeRunPurpose", status AS "status: CodeRunStatus",
                  language_id, source_sha256, stdin_sha256, idempotency_key, passed, total,
                  score, compile_output, error_message,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM finished_at))::bigint AS "finished_at?",
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM code_runs WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// The run stored under an idempotency key (replay candidate).
pub async fn find_idempotent_run(
    pool: &PgPool,
    user_id: UserId,
    item_id: AssessmentItemId,
    purpose: CodeRunPurpose,
    key: &str,
) -> Result<Option<CodeRunRow>> {
    let row = sqlx::query_as!(
        CodeRunRow,
        r#"SELECT id AS "id: CodeRunId", assessment_id AS "assessment_id: AssessmentId",
                  item_id AS "item_id: AssessmentItemId",
                  submission_id AS "submission_id: SubmissionId", user_id AS "user_id: UserId",
                  purpose AS "purpose: CodeRunPurpose", status AS "status: CodeRunStatus",
                  language_id, source_sha256, stdin_sha256, idempotency_key, passed, total,
                  score, compile_output, error_message,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM finished_at))::bigint AS "finished_at?",
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM code_runs
           WHERE user_id = $1 AND item_id = $2 AND purpose = $3 AND idempotency_key = $4"#,
        user_id.0,
        item_id.0,
        purpose.as_str(),
        key
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Failed/degraded runs release their key so a retry can execute.
pub async fn clear_idempotency_key(pool: &PgPool, id: CodeRunId) -> Result<()> {
    sqlx::query!(
        "UPDATE code_runs SET idempotency_key = NULL WHERE id = $1",
        id.0
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Newest FINAL run for an item on a submission (grading input).
pub async fn latest_final_run(
    pool: &PgPool,
    submission_id: SubmissionId,
    item_id: AssessmentItemId,
) -> Result<Option<CodeRunRow>> {
    let row = sqlx::query_as!(
        CodeRunRow,
        r#"SELECT id AS "id: CodeRunId", assessment_id AS "assessment_id: AssessmentId",
                  item_id AS "item_id: AssessmentItemId",
                  submission_id AS "submission_id: SubmissionId", user_id AS "user_id: UserId",
                  purpose AS "purpose: CodeRunPurpose", status AS "status: CodeRunStatus",
                  language_id, source_sha256, stdin_sha256, idempotency_key, passed, total,
                  score, compile_output, error_message,
                  (extract(epoch FROM started_at))::bigint AS "started_at?",
                  (extract(epoch FROM finished_at))::bigint AS "finished_at?",
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM code_runs
           WHERE submission_id = $1 AND item_id = $2 AND purpose = 'final'
           ORDER BY id DESC LIMIT 1"#,
        submission_id.0,
        item_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

#[derive(Debug, Clone)]
pub struct CodeRunCaseRow {
    pub position: i32,
    pub test_id: String,
    pub judge0_token: Option<String>,
    pub stdin: Option<String>,
    pub expected_output: Option<String>,
    pub description: String,
    pub weight: f64,
    pub is_visible: bool,
    pub status_id: Option<i32>,
    pub status_description: String,
    pub passed: bool,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub compile_output: Option<String>,
    pub message: Option<String>,
    pub time_seconds: Option<f64>,
    pub memory_kb: Option<i32>,
}

pub async fn insert_code_run_cases(
    pool: &PgPool,
    run_id: CodeRunId,
    cases: &[CodeRunCaseRow],
) -> Result<()> {
    let mut tx = pool.begin().await?;
    for c in cases {
        sqlx::query!(
            r#"INSERT INTO code_run_cases
                   (run_id, position, test_id, judge0_token, stdin, expected_output, description,
                    weight, is_visible, status_id, status_description, passed, stdout, stderr,
                    compile_output, message, time_seconds, memory_kb)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                       $17, $18)"#,
            run_id.0,
            c.position,
            c.test_id,
            c.judge0_token,
            c.stdin,
            c.expected_output,
            c.description,
            c.weight,
            c.is_visible,
            c.status_id,
            c.status_description,
            c.passed,
            c.stdout,
            c.stderr,
            c.compile_output,
            c.message,
            c.time_seconds,
            c.memory_kb
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn list_code_run_cases(pool: &PgPool, run_id: CodeRunId) -> Result<Vec<CodeRunCaseRow>> {
    let rows = sqlx::query_as!(
        CodeRunCaseRow,
        r#"SELECT position, test_id, judge0_token, stdin, expected_output, description, weight,
                  is_visible, status_id, status_description, passed, stdout, stderr,
                  compile_output, message, time_seconds, memory_kb
           FROM code_run_cases WHERE run_id = $1 ORDER BY position"#,
        run_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Bulk actions ────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct BulkActionRow {
    pub id: BulkActionId,
    pub assessment_id: AssessmentId,
    pub performed_by: Option<UserId>,
    pub action_type: BulkActionType,
    pub params: serde_json::Value,
    pub target_user_ids: Vec<UserId>,
    pub status: BulkActionStatus,
    pub affected_count: i32,
    pub error_log: String,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

pub async fn insert_bulk_action(
    pool: &PgPool,
    assessment_id: AssessmentId,
    performed_by: UserId,
    action_type: BulkActionType,
    params: &serde_json::Value,
    target_user_ids: &[UserId],
) -> Result<BulkActionId> {
    let targets: Vec<uuid::Uuid> = target_user_ids.iter().map(|u| u.0).collect();
    let id = sqlx::query_scalar!(
        r#"INSERT INTO bulk_actions
               (assessment_id, performed_by, action_type, params, target_user_ids)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id AS "id: BulkActionId""#,
        assessment_id.0,
        performed_by.0,
        action_type.as_str(),
        params,
        &targets
    )
    .fetch_one(pool)
    .await?;
    Ok(id)
}

pub async fn get_bulk_action(pool: &PgPool, id: BulkActionId) -> Result<Option<BulkActionRow>> {
    let row = sqlx::query_as!(
        BulkActionRow,
        r#"SELECT id AS "id: BulkActionId", assessment_id AS "assessment_id: AssessmentId",
                  performed_by AS "performed_by: UserId",
                  action_type AS "action_type: BulkActionType", params,
                  target_user_ids AS "target_user_ids: Vec<UserId>",
                  status AS "status: BulkActionStatus", affected_count, error_log,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM completed_at))::bigint AS "completed_at?"
           FROM bulk_actions WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn set_bulk_action_status(
    pool: &PgPool,
    id: BulkActionId,
    status: BulkActionStatus,
    affected_count: i32,
    error_log: &str,
) -> Result<()> {
    sqlx::query!(
        r#"UPDATE bulk_actions SET status = $2, affected_count = $3, error_log = $4,
               completed_at = CASE WHEN $2 IN ('completed', 'failed') THEN now() ELSE completed_at END
           WHERE id = $1"#,
        id.0,
        status.as_str(),
        affected_count,
        error_log
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Idempotency keys ────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct IdempotentResponse {
    pub request_hash: String,
    pub status_code: i32,
    pub response: serde_json::Value,
}

pub async fn get_idempotent(
    pool: &PgPool,
    user_id: UserId,
    key: &str,
) -> Result<Option<IdempotentResponse>> {
    let row = sqlx::query_as!(
        IdempotentResponse,
        "SELECT request_hash, status_code, response FROM idempotency_keys
         WHERE user_id = $1 AND key = $2",
        user_id.0,
        key
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn store_idempotent(
    pool: &PgPool,
    user_id: UserId,
    key: &str,
    request_hash: &str,
    status_code: i32,
    response: &serde_json::Value,
) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO idempotency_keys (user_id, key, request_hash, status_code, response)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, key) DO NOTHING"#,
        user_id.0,
        key,
        request_hash,
        status_code,
        response
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Drop keys older than the retention window (24h sweep).
pub async fn sweep_idempotency(pool: &PgPool, older_than_secs: f64) -> Result<u64> {
    let deleted = sqlx::query!(
        "DELETE FROM idempotency_keys WHERE created_at < now() - make_interval(secs => $1)",
        older_than_secs
    )
    .execute(pool)
    .await?;
    Ok(deleted.rows_affected())
}
