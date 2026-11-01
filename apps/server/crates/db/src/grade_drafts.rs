//! AI grade drafts, the teacher's corrections and the per-course switch (docs/AI-FIRST.md 4).

use ab_core::Result;
use ab_core::id::{
    ActivityId, AiRunId, CourseId, FileAttemptId, GradeDraftId, SubmissionId, UserId,
};
use sqlx::{PgConnection, PgPool};

#[derive(Debug, Clone)]
pub struct DraftRow {
    pub id: GradeDraftId,
    pub course_id: CourseId,
    pub activity_id: ActivityId,
    pub submission_id: Option<SubmissionId>,
    pub file_attempt_id: Option<FileAttemptId>,
    pub learner_id: UserId,
    pub run_id: Option<AiRunId>,
    pub status: String,
    pub subject_version: i64,
    pub proposal: serde_json::Value,
    pub ai_score: Option<f64>,
    pub calibrated_score: Option<f64>,
    pub max_score: Option<f64>,
    pub confidence: Option<f32>,
    pub flags: Vec<String>,
    pub model_name: Option<String>,
    pub error_code: Option<String>,
    pub agreement: Option<String>,
    pub final_score: Option<f64>,
    pub decided_at: Option<i64>,
    pub created_at: i64,
}

impl DraftRow {
    #[must_use]
    pub fn subject_id(&self) -> uuid::Uuid {
        self.submission_id
            .map(|s| s.0)
            .or_else(|| self.file_attempt_id.map(|a| a.0))
            .unwrap_or_default()
    }
}

pub async fn get_draft(pool: &PgPool, id: GradeDraftId) -> Result<Option<DraftRow>> {
    let row = sqlx::query_as!(
        DraftRow,
        r#"SELECT d.id AS "id: GradeDraftId", d.course_id AS "course_id: CourseId",
                  d.activity_id AS "activity_id: ActivityId",
                  d.submission_id AS "submission_id: SubmissionId",
                  d.file_attempt_id AS "file_attempt_id: FileAttemptId",
                  d.learner_id AS "learner_id: UserId", d.run_id AS "run_id: AiRunId", d.status,
                  d.subject_version, d.proposal, d.ai_score, d.calibrated_score, d.max_score,
                  d.confidence, d.flags, d.model_name, d.error_code, d.agreement, d.final_score,
                  extract(epoch FROM d.decided_at)::bigint AS decided_at,
                  extract(epoch FROM d.created_at)::bigint AS "created_at!"
               FROM ai_grade_drafts d WHERE d.id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// The newest draft of a work (any status).
pub async fn latest_for_subject(pool: &PgPool, subject: uuid::Uuid) -> Result<Option<DraftRow>> {
    let row = sqlx::query_as!(
        DraftRow,
        r#"SELECT d.id AS "id: GradeDraftId", d.course_id AS "course_id: CourseId",
                  d.activity_id AS "activity_id: ActivityId",
                  d.submission_id AS "submission_id: SubmissionId",
                  d.file_attempt_id AS "file_attempt_id: FileAttemptId",
                  d.learner_id AS "learner_id: UserId", d.run_id AS "run_id: AiRunId", d.status,
                  d.subject_version, d.proposal, d.ai_score, d.calibrated_score, d.max_score,
                  d.confidence, d.flags, d.model_name, d.error_code, d.agreement, d.final_score,
                  extract(epoch FROM d.decided_at)::bigint AS decided_at,
                  extract(epoch FROM d.created_at)::bigint AS "created_at!"
               FROM ai_grade_drafts d WHERE d.submission_id = $1 OR d.file_attempt_id = $1
             ORDER BY d.created_at DESC, d.id DESC LIMIT 1"#,
        subject
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// The newest draft of each work of an activity.
pub async fn latest_for_activity(pool: &PgPool, activity_id: ActivityId) -> Result<Vec<DraftRow>> {
    let rows = sqlx::query_as!(
        DraftRow,
        r#"SELECT d.id AS "id: GradeDraftId", d.course_id AS "course_id: CourseId",
                  d.activity_id AS "activity_id: ActivityId",
                  d.submission_id AS "submission_id: SubmissionId",
                  d.file_attempt_id AS "file_attempt_id: FileAttemptId",
                  d.learner_id AS "learner_id: UserId", d.run_id AS "run_id: AiRunId", d.status,
                  d.subject_version, d.proposal, d.ai_score, d.calibrated_score, d.max_score,
                  d.confidence, d.flags, d.model_name, d.error_code, d.agreement, d.final_score,
                  extract(epoch FROM d.decided_at)::bigint AS decided_at,
                  extract(epoch FROM d.created_at)::bigint AS "created_at!"
               FROM ai_grade_drafts d WHERE d.activity_id = $1 AND d.id = (
                 SELECT d2.id FROM ai_grade_drafts d2
                 WHERE d2.activity_id = d.activity_id
                   AND (d2.submission_id = d.submission_id OR d2.file_attempt_id = d.file_attempt_id)
                 ORDER BY d2.created_at DESC, d2.id DESC LIMIT 1)
             ORDER BY d.created_at DESC"#,
        activity_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Display names (or usernames) of `users`, for report rows that carry only ids.
pub async fn learner_names(
    pool: &PgPool,
    users: &[uuid::Uuid],
) -> Result<std::collections::HashMap<UserId, String>> {
    let rows = sqlx::query!(
        r#"SELECT u.id AS "id: UserId",
                  COALESCE(NULLIF(trim(u.display_name), ''), u.username) AS "name!"
             FROM users u WHERE u.id = ANY($1)"#,
        users
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| (r.id, r.name)).collect())
}

/// The live (queued or ready) draft of a work.
pub async fn live_for_subject(
    conn: &mut PgConnection,
    subject: uuid::Uuid,
) -> Result<Option<DraftRow>> {
    let row = sqlx::query_as!(
        DraftRow,
        r#"SELECT d.id AS "id: GradeDraftId", d.course_id AS "course_id: CourseId",
                  d.activity_id AS "activity_id: ActivityId",
                  d.submission_id AS "submission_id: SubmissionId",
                  d.file_attempt_id AS "file_attempt_id: FileAttemptId",
                  d.learner_id AS "learner_id: UserId", d.run_id AS "run_id: AiRunId", d.status,
                  d.subject_version, d.proposal, d.ai_score, d.calibrated_score, d.max_score,
                  d.confidence, d.flags, d.model_name, d.error_code, d.agreement, d.final_score,
                  extract(epoch FROM d.decided_at)::bigint AS decided_at,
                  extract(epoch FROM d.created_at)::bigint AS "created_at!"
               FROM ai_grade_drafts d WHERE (d.submission_id = $1 OR d.file_attempt_id = $1)
               AND d.status IN ('queued', 'ready')
             FOR UPDATE"#,
        subject
    )
    .fetch_optional(&mut *conn)
    .await?;
    Ok(row)
}

pub struct NewDraft {
    pub course_id: CourseId,
    pub activity_id: ActivityId,
    pub submission_id: Option<SubmissionId>,
    pub file_attempt_id: Option<FileAttemptId>,
    pub learner_id: UserId,
    pub requested_by: Option<UserId>,
    pub subject_version: i64,
}

/// A queued draft; a live draft of an older version is superseded first. `None` when an equally fresh
/// live draft already exists.
pub async fn insert_queued(conn: &mut PgConnection, d: &NewDraft) -> Result<Option<GradeDraftId>> {
    let subject = d
        .submission_id
        .map(|s| s.0)
        .or_else(|| d.file_attempt_id.map(|a| a.0));
    let fresh = sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM ai_grade_drafts
                          WHERE (submission_id = $1 OR file_attempt_id = $1)
                            AND status IN ('queued', 'ready') AND subject_version >= $2) AS "e!""#,
        subject,
        d.subject_version
    )
    .fetch_one(&mut *conn)
    .await?;
    if fresh {
        return Ok(None);
    }
    sqlx::query!(
        r#"UPDATE ai_grade_drafts SET status = 'superseded'
           WHERE (submission_id = $1 OR file_attempt_id = $1) AND status IN ('queued', 'ready')"#,
        subject
    )
    .execute(&mut *conn)
    .await?;
    let id = sqlx::query_scalar!(
        r#"INSERT INTO ai_grade_drafts
               (course_id, activity_id, submission_id, file_attempt_id, learner_id, requested_by,
                status, subject_version)
           VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7) RETURNING id"#,
        d.course_id.0,
        d.activity_id.0,
        d.submission_id.map(|s| s.0),
        d.file_attempt_id.map(|a| a.0),
        d.learner_id.0,
        d.requested_by.map(|u| u.0),
        d.subject_version
    )
    .fetch_one(&mut *conn)
    .await?;
    Ok(Some(GradeDraftId(id)))
}

pub async fn attach_run(pool: &PgPool, id: GradeDraftId, run_id: AiRunId) -> Result<()> {
    sqlx::query!(
        "UPDATE ai_grade_drafts SET run_id = $2 WHERE id = $1",
        id.0,
        run_id.0
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub struct ReadyDraft<'a> {
    pub proposal: &'a serde_json::Value,
    pub ai_score: f64,
    pub calibrated_score: f64,
    pub max_score: f64,
    pub confidence: f32,
    pub flags: &'a [String],
    pub model_name: &'a str,
}

/// queued -> ready; `false` when the draft is no longer queued (superseded or settled meanwhile).
pub async fn mark_ready(
    conn: &mut PgConnection,
    id: GradeDraftId,
    r: &ReadyDraft<'_>,
) -> Result<bool> {
    let done = sqlx::query!(
        r#"UPDATE ai_grade_drafts
           SET status = 'ready', proposal = $2, ai_score = $3, calibrated_score = $4, max_score = $5,
               confidence = $6, flags = $7, model_name = $8
           WHERE id = $1 AND status = 'queued'"#,
        id.0,
        r.proposal,
        r.ai_score,
        r.calibrated_score,
        r.max_score,
        r.confidence,
        r.flags,
        r.model_name
    )
    .execute(&mut *conn)
    .await?;
    Ok(done.rows_affected() == 1)
}

pub async fn mark_failed(pool: &PgPool, id: GradeDraftId, code: &str) -> Result<()> {
    sqlx::query!(
        "UPDATE ai_grade_drafts SET status = 'failed', error_code = $2 WHERE id = $1 AND status = 'queued'",
        id.0,
        code
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn discard(pool: &PgPool, id: GradeDraftId, by: UserId) -> Result<bool> {
    let done = sqlx::query!(
        r#"UPDATE ai_grade_drafts SET status = 'discarded', decided_by = $2, decided_at = now()
           WHERE id = $1 AND status IN ('queued', 'ready')"#,
        id.0,
        by.0
    )
    .execute(pool)
    .await?;
    Ok(done.rows_affected() == 1)
}

/// A live draft overtaken by a grade before it was ready.
pub async fn supersede(conn: &mut PgConnection, id: GradeDraftId) -> Result<()> {
    sqlx::query!(
        "UPDATE ai_grade_drafts SET status = 'superseded' WHERE id = $1 AND status IN ('queued', 'ready')",
        id.0
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn mark_applied(
    conn: &mut PgConnection,
    id: GradeDraftId,
    by: UserId,
    agreement: &str,
    final_score: Option<f64>,
) -> Result<()> {
    sqlx::query!(
        r#"UPDATE ai_grade_drafts
           SET status = 'applied', agreement = $3, final_score = $4, decided_by = $2, decided_at = now()
           WHERE id = $1"#,
        id.0,
        by.0,
        agreement,
        final_score
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub struct NewCorrection<'a> {
    pub course_id: CourseId,
    pub activity_id: ActivityId,
    pub draft_id: GradeDraftId,
    pub teacher_id: UserId,
    pub part_key: &'a str,
    pub criterion_key: &'a str,
    pub ai_score: f64,
    pub teacher_score: f64,
    pub max_score: f64,
    pub excerpt: &'a str,
    pub teacher_feedback: &'a str,
}

pub async fn insert_correction(conn: &mut PgConnection, c: &NewCorrection<'_>) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO ai_grade_corrections
               (course_id, activity_id, draft_id, teacher_id, part_key, criterion_key, ai_score,
                teacher_score, max_score, excerpt, teacher_feedback)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (draft_id, part_key, criterion_key) DO UPDATE
           SET teacher_score = EXCLUDED.teacher_score, teacher_feedback = EXCLUDED.teacher_feedback"#,
        c.course_id.0,
        c.activity_id.0,
        c.draft_id.0,
        c.teacher_id.0,
        c.part_key,
        c.criterion_key,
        c.ai_score,
        c.teacher_score,
        c.max_score,
        c.excerpt,
        c.teacher_feedback
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct CorrectionRow {
    pub part_key: String,
    pub criterion_key: String,
    pub ai_score: f64,
    pub teacher_score: f64,
    pub max_score: f64,
    pub excerpt: String,
    pub teacher_feedback: String,
}

/// The newest corrections of an activity (calibration input), at most `limit`.
pub async fn recent_corrections(
    pool: &PgPool,
    activity_id: ActivityId,
    limit: i64,
) -> Result<Vec<CorrectionRow>> {
    let rows = sqlx::query_as!(
        CorrectionRow,
        r#"SELECT part_key, criterion_key, ai_score, teacher_score, max_score, excerpt, teacher_feedback
           FROM ai_grade_corrections WHERE activity_id = $1
           ORDER BY created_at DESC, id DESC LIMIT $2"#,
        activity_id.0,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Course settings ─────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CourseSettingsRow {
    pub auto_grade_drafts: bool,
    pub enabled_by: Option<UserId>,
}

pub async fn course_settings(
    conn: &mut PgConnection,
    course_id: CourseId,
) -> Result<Option<CourseSettingsRow>> {
    let row = sqlx::query_as!(
        CourseSettingsRow,
        r#"SELECT auto_grade_drafts, enabled_by AS "enabled_by: UserId"
           FROM ai_course_settings WHERE course_id = $1"#,
        course_id.0
    )
    .fetch_optional(&mut *conn)
    .await?;
    Ok(row)
}

/// The settings of the course an activity belongs to (hand-in hooks know the activity only).
pub async fn settings_for_activity(
    conn: &mut PgConnection,
    activity_id: ActivityId,
) -> Result<Option<CourseSettingsRow>> {
    let row = sqlx::query_as!(
        CourseSettingsRow,
        r#"SELECT s.auto_grade_drafts, s.enabled_by AS "enabled_by: UserId"
           FROM ai_course_settings s JOIN activities a ON a.course_id = s.course_id
           WHERE a.id = $1"#,
        activity_id.0
    )
    .fetch_optional(&mut *conn)
    .await?;
    Ok(row)
}

pub async fn set_course_settings(
    pool: &PgPool,
    course_id: CourseId,
    auto_grade_drafts: bool,
    by: UserId,
) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO ai_course_settings (course_id, auto_grade_drafts, enabled_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (course_id) DO UPDATE
           SET auto_grade_drafts = EXCLUDED.auto_grade_drafts, enabled_by = EXCLUDED.enabled_by"#,
        course_id.0,
        auto_grade_drafts,
        by.0
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Work waiting for a grade ────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct PendingWork {
    pub subject_id: uuid::Uuid,
    pub is_file: bool,
    pub learner_id: UserId,
    pub version: i64,
}

/// Works of an activity waiting for a grade (pending submissions, submitted file attempts), not previews.
pub async fn pending_works(pool: &PgPool, activity_id: ActivityId) -> Result<Vec<PendingWork>> {
    let rows = sqlx::query_as!(
        PendingWork,
        r#"SELECT s.id AS "subject_id!", false AS "is_file!", s.user_id AS "learner_id!: UserId",
                  s.version AS "version!"
           FROM submissions s JOIN assessments a ON a.id = s.assessment_id
           WHERE a.activity_id = $1 AND s.status = 'pending' AND NOT s.preview
           UNION ALL
           SELECT t.id, true, t.user_id, t.version
           FROM file_submission_attempts t JOIN file_submissions f ON f.id = t.file_submission_id
           WHERE f.activity_id = $1 AND t.status = 'submitted' AND NOT t.preview"#,
        activity_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct PendingWorkOf {
    pub course_id: CourseId,
    pub activity_id: ActivityId,
    pub work: PendingWork,
}

/// One work if it is waiting for a grade (auto drafts).
pub async fn pending_work(pool: &PgPool, subject_id: uuid::Uuid) -> Result<Option<PendingWorkOf>> {
    let row = sqlx::query!(
        r#"SELECT a.course_id AS "course_id!: CourseId", a.activity_id AS "activity_id!: ActivityId",
                  s.id AS "subject_id!", false AS "is_file!", s.user_id AS "learner_id!: UserId",
                  s.version AS "version!"
           FROM submissions s JOIN assessments a ON a.id = s.assessment_id
           WHERE s.id = $1 AND s.status = 'pending' AND NOT s.preview
           UNION ALL
           SELECT c.course_id, f.activity_id, t.id, true, t.user_id, t.version
           FROM file_submission_attempts t
           JOIN file_submissions f ON f.id = t.file_submission_id
           JOIN activities c ON c.id = f.activity_id
           WHERE t.id = $1 AND t.status = 'submitted' AND NOT t.preview"#,
        subject_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| PendingWorkOf {
        course_id: r.course_id,
        activity_id: r.activity_id,
        work: PendingWork {
            subject_id: r.subject_id,
            is_file: r.is_file,
            learner_id: r.learner_id,
            version: r.version,
        },
    }))
}

// ── Metrics ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct DraftCounts {
    pub total: i64,
    pub ready: i64,
    pub applied_exact: i64,
    pub applied_adjusted: i64,
    pub discarded: i64,
    pub failed: i64,
    pub mean_abs_delta: Option<f64>,
}

pub async fn draft_counts(
    pool: &PgPool,
    course_id: CourseId,
    since_secs: i64,
) -> Result<DraftCounts> {
    let row = sqlx::query_as!(
        DraftCounts,
        r#"SELECT count(*) AS "total!",
                  count(*) FILTER (WHERE status = 'ready') AS "ready!",
                  count(*) FILTER (WHERE agreement = 'exact') AS "applied_exact!",
                  count(*) FILTER (WHERE agreement = 'adjusted') AS "applied_adjusted!",
                  count(*) FILTER (WHERE status = 'discarded') AS "discarded!",
                  count(*) FILTER (WHERE status = 'failed') AS "failed!",
                  avg(abs(final_score - calibrated_score))
                      FILTER (WHERE status = 'applied' AND final_score IS NOT NULL
                              AND calibrated_score IS NOT NULL) AS mean_abs_delta
           FROM ai_grade_drafts
           WHERE course_id = $1 AND status <> 'superseded'
             AND created_at >= to_timestamp($2::bigint)"#,
        course_id.0,
        since_secs
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}

/// Hours from hand-in to the first published grade, per work published in the window.
pub async fn feedback_hours(
    pool: &PgPool,
    course_id: CourseId,
    from: i64,
    to: i64,
) -> Result<Vec<f64>> {
    let rows = sqlx::query_scalar!(
        r#"SELECT (extract(epoch FROM first_pub - submitted_at) / 3600.0)::float8 AS "hours!"
           FROM (
               SELECT s.submitted_at,
                      (SELECT min(g.published_at) FROM grading_entries g
                       WHERE g.submission_id = s.id AND g.published_at IS NOT NULL
                         AND g.graded_by IS NOT NULL) AS first_pub
               FROM submissions s
               WHERE s.course_id = $1 AND NOT s.preview AND s.submitted_at IS NOT NULL
               UNION ALL
               SELECT t.submitted_at,
                      (SELECT min(e.created_at) FROM file_grading_entries e
                       WHERE e.attempt_id = t.id AND e.status = 'published')
               FROM file_submission_attempts t JOIN file_submissions f ON f.id = t.file_submission_id
               WHERE f.course_id = $1 AND NOT t.preview AND t.submitted_at IS NOT NULL
           ) w
           WHERE first_pub IS NOT NULL
             AND first_pub >= to_timestamp($2::bigint) AND first_pub < to_timestamp($3::bigint)"#,
        course_id.0,
        from,
        to
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct ActivityDraftStat {
    pub activity_id: ActivityId,
    pub activity_name: String,
    pub drafts: i64,
    pub ready: i64,
    pub applied: i64,
}

pub async fn activity_stats(pool: &PgPool, course_id: CourseId) -> Result<Vec<ActivityDraftStat>> {
    let rows = sqlx::query_as!(
        ActivityDraftStat,
        r#"SELECT d.activity_id AS "activity_id: ActivityId", a.name AS activity_name,
                  count(*) AS "drafts!",
                  count(*) FILTER (WHERE d.status = 'ready') AS "ready!",
                  count(*) FILTER (WHERE d.status = 'applied') AS "applied!"
           FROM ai_grade_drafts d JOIN activities a ON a.id = d.activity_id
           WHERE d.course_id = $1 AND d.status <> 'superseded'
           GROUP BY d.activity_id, a.name, a.position
           ORDER BY a.position, a.name"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Consistency ─────────────────────────────────────────────────────────────

/// A graded work's answer text per part and its final score per part, for the consistency report.
#[derive(Debug, Clone)]
pub struct GradedPart {
    pub subject_id: uuid::Uuid,
    pub learner_id: UserId,
    pub learner_name: String,
    pub part_key: String,
    pub text: String,
    pub score: f64,
    pub max_score: f64,
}

/// Open-text and form answers of graded submissions of an activity with their item scores.
pub async fn graded_submission_parts(
    pool: &PgPool,
    activity_id: ActivityId,
) -> Result<Vec<GradedPart>> {
    let rows = sqlx::query_as!(
        GradedPart,
        r#"SELECT s.id AS "subject_id!", s.user_id AS "learner_id!: UserId",
                  COALESCE(NULLIF(trim(u.display_name), ''), u.username) AS "learner_name!",
                  gi->>'item_id' AS "part_key!",
                  COALESCE(s.answers -> (gi->>'item_id') ->> 'text',
                           (s.answers -> (gi->>'item_id') -> 'values')::text, '') AS "text!",
                  COALESCE((gi->>'score')::float8, 0) AS "score!",
                  COALESCE((gi->>'max_score')::float8, 0) AS "max_score!"
           FROM submissions s
           JOIN assessments a ON a.id = s.assessment_id
           JOIN users u ON u.id = s.user_id
           CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.grading -> 'items', '[]'::jsonb)) gi
           JOIN assessment_items i ON i.id = (gi->>'item_id')::uuid AND i.kind IN ('open_text', 'form')
           WHERE a.activity_id = $1 AND NOT s.preview AND s.status IN ('graded', 'published')
             AND COALESCE((gi->>'needs_manual_review')::boolean, false) = false"#,
        activity_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Graded file attempts of an activity (`part_key` = 'file', the text is filled by the caller).
pub async fn graded_file_attempts(
    pool: &PgPool,
    activity_id: ActivityId,
) -> Result<Vec<GradedPart>> {
    let rows = sqlx::query_as!(
        GradedPart,
        r#"SELECT t.id AS "subject_id!", t.user_id AS "learner_id!: UserId",
                  COALESCE(NULLIF(trim(u.display_name), ''), u.username) AS "learner_name!",
                  'file' AS "part_key!", '' AS "text!",
                  COALESCE(t.final_score, 0) AS "score!", 100::float8 AS "max_score!"
           FROM file_submission_attempts t
           JOIN file_submissions f ON f.id = t.file_submission_id
           JOIN users u ON u.id = t.user_id
           WHERE f.activity_id = $1 AND NOT t.preview AND t.status IN ('graded', 'published')
             AND t.final_score IS NOT NULL"#,
        activity_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn cached_embedding(
    pool: &PgPool,
    subject_id: uuid::Uuid,
    part_key: &str,
    text_hash: &str,
    model: &str,
) -> Result<bool> {
    let hit = sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM ai_work_embeddings
                          WHERE subject_id = $1 AND part_key = $2 AND text_hash = $3
                            AND embedding_model = $4) AS "e!""#,
        subject_id,
        part_key,
        text_hash,
        model
    )
    .fetch_one(pool)
    .await?;
    Ok(hit)
}

pub async fn store_embedding(
    pool: &PgPool,
    subject_id: uuid::Uuid,
    part_key: &str,
    activity_id: ActivityId,
    text_hash: &str,
    model: &str,
    vector: &str,
) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO ai_work_embeddings (subject_id, part_key, activity_id, text_hash, embedding_model, embedding)
           VALUES ($1, $2, $3, $4, $5, $6::text::vector)
           ON CONFLICT (subject_id, part_key) DO UPDATE
           SET text_hash = EXCLUDED.text_hash, embedding_model = EXCLUDED.embedding_model,
               embedding = EXCLUDED.embedding, activity_id = EXCLUDED.activity_id"#,
        subject_id,
        part_key,
        activity_id.0,
        text_hash,
        model,
        vector
    )
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct SimilarPair {
    pub a: uuid::Uuid,
    pub b: uuid::Uuid,
    pub part_key: String,
    pub similarity: f64,
}

/// Pairs of works of an activity whose answers to the same part are at least `min_similarity` alike.
pub async fn similar_pairs(
    pool: &PgPool,
    activity_id: ActivityId,
    model: &str,
    min_similarity: f64,
) -> Result<Vec<SimilarPair>> {
    let rows = sqlx::query_as!(
        SimilarPair,
        r#"SELECT x.subject_id AS "a!", y.subject_id AS "b!", x.part_key AS "part_key!",
                  (1 - (x.embedding <=> y.embedding))::float8 AS "similarity!"
           FROM ai_work_embeddings x
           JOIN ai_work_embeddings y
             ON y.activity_id = x.activity_id AND y.part_key = x.part_key
            AND y.subject_id > x.subject_id AND y.embedding_model = x.embedding_model
           WHERE x.activity_id = $1 AND x.embedding_model = $2
             AND 1 - (x.embedding <=> y.embedding) >= $3
           ORDER BY 4 DESC
           LIMIT 200"#,
        activity_id.0,
        model,
        min_similarity
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
