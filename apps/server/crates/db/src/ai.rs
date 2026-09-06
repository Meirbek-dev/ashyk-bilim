//! AI runtime + feature queries (compile-checked).
//!
//! Timestamps as epoch seconds; enums decoded via `ab_core::ai`. Run
//! status changes are guarded updates (`WHERE status = $expected`)
//! returning whether the row moved — the domain turns a `false` into the
//! right conflict.

use ab_core::ai::{
    AiRunKind, AiRunStatus, AiThreadRole, CourseAnalysisStatus, LectureReviewStatus, QaMessageRole,
    RemediationStatus,
};
use ab_core::id::{
    ActivityId, AiArtifactId, AiCourseAnalysisId, AiEvalResultId, AiEventId, AiEvidenceId,
    AiLectureReviewId, AiMessageId, AiRemediationSessionId, AiRunId, AiSubmissionAnalysisId,
    AiThreadId, AssessmentId, ChapterId, CourseId, SubmissionId, UserId,
};
use ab_core::{Error, Result};
use sqlx::PgPool;

// ── Threads ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ThreadRow {
    pub id: AiThreadId,
    pub user_id: Option<UserId>,
    pub role: AiThreadRole,
    pub course_id: Option<CourseId>,
    pub activity_id: Option<ActivityId>,
    pub title: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn insert_thread(
    pool: &PgPool,
    user_id: UserId,
    role: AiThreadRole,
    course_id: Option<CourseId>,
    activity_id: Option<ActivityId>,
    title: Option<&str>,
) -> Result<AiThreadId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO ai_threads (user_id, role, course_id, activity_id, title)
           VALUES ($1, $2, $3, $4, $5) RETURNING id"#,
        user_id.0,
        role.as_str(),
        course_id.map(|c| c.0),
        activity_id.map(|a| a.0),
        title
    )
    .fetch_one(pool)
    .await?;
    Ok(AiThreadId(id))
}

pub async fn get_thread(pool: &PgPool, id: AiThreadId) -> Result<Option<ThreadRow>> {
    let row = sqlx::query_as!(
        ThreadRow,
        r#"SELECT id AS "id: AiThreadId", user_id AS "user_id: UserId",
                  role AS "role: AiThreadRole", course_id AS "course_id: CourseId",
                  activity_id AS "activity_id: ActivityId", title,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM ai_threads WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// A thread owned by `user_id` inside `course_id` (legacy `_owned_course_thread`).
pub async fn find_owned_course_thread(
    pool: &PgPool,
    id: AiThreadId,
    user_id: UserId,
    course_id: CourseId,
) -> Result<Option<ThreadRow>> {
    let row = sqlx::query_as!(
        ThreadRow,
        r#"SELECT id AS "id: AiThreadId", user_id AS "user_id: UserId",
                  role AS "role: AiThreadRole", course_id AS "course_id: CourseId",
                  activity_id AS "activity_id: ActivityId", title,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM ai_threads WHERE id = $1 AND user_id = $2 AND course_id = $3"#,
        id.0,
        user_id.0,
        course_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Re-scope an existing thread for a new run (legacy `_create_run` with a
/// thread: role replaced, course/activity kept unless given).
pub async fn rescope_thread(
    pool: &PgPool,
    id: AiThreadId,
    role: AiThreadRole,
    course_id: Option<CourseId>,
    activity_id: Option<ActivityId>,
) -> Result<()> {
    sqlx::query!(
        r#"UPDATE ai_threads SET role = $2,
               course_id = COALESCE($3, course_id),
               activity_id = COALESCE($4, activity_id)
           WHERE id = $1"#,
        id.0,
        role.as_str(),
        course_id.map(|c| c.0),
        activity_id.map(|a| a.0)
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn touch_thread(pool: &PgPool, id: AiThreadId) -> Result<()> {
    sqlx::query!(
        "UPDATE ai_threads SET updated_at = now() WHERE id = $1",
        id.0
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_thread(pool: &PgPool, id: AiThreadId) -> Result<bool> {
    let result = sqlx::query!("DELETE FROM ai_threads WHERE id = $1", id.0)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

#[derive(Debug, Clone)]
pub struct ThreadSummaryRow {
    pub id: AiThreadId,
    pub title: Option<String>,
    pub last_message: String,
    pub message_count: i64,
    pub updated_at: i64,
}

/// The caller's Q&A threads in a course that carry at least one message,
/// most recently active first.
pub async fn list_course_threads(
    pool: &PgPool,
    course_id: CourseId,
    user_id: UserId,
    limit: i64,
) -> Result<Vec<ThreadSummaryRow>> {
    let rows = sqlx::query_as!(
        ThreadSummaryRow,
        r#"SELECT t.id AS "id: AiThreadId", t.title,
                  m.content AS "last_message!",
                  c.message_count AS "message_count!",
                  (extract(epoch FROM t.updated_at))::bigint AS "updated_at!"
           FROM ai_threads t
           JOIN LATERAL (SELECT count(*) AS message_count
                         FROM ai_qa_messages WHERE thread_id = t.id) c ON true
           JOIN LATERAL (SELECT content FROM ai_qa_messages
                         WHERE thread_id = t.id
                         ORDER BY created_at DESC, id DESC LIMIT 1) m ON true
           WHERE t.course_id = $1 AND t.user_id = $2
           ORDER BY t.updated_at DESC, t.id DESC
           LIMIT $3"#,
        course_id.0,
        user_id.0,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Runs ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct RunRow {
    pub id: AiRunId,
    pub thread_id: AiThreadId,
    pub kind: AiRunKind,
    pub status: AiRunStatus,
    pub triggered_by: Option<UserId>,
    pub model_name: Option<String>,
    pub duration_ms: Option<i32>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cost_estimate: Option<f64>,
    pub safety_state: Option<String>,
    pub error_code: Option<String>,
    pub metadata: serde_json::Value,
    pub started_at: i64,
    pub completed_at: Option<i64>,
    pub created_at: i64,
}

pub async fn insert_run(
    pool: &PgPool,
    thread_id: AiThreadId,
    kind: AiRunKind,
    status: AiRunStatus,
    triggered_by: UserId,
    metadata: &serde_json::Value,
) -> Result<AiRunId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO ai_runs (thread_id, kind, status, triggered_by, metadata)
           VALUES ($1, $2, $3, $4, $5) RETURNING id"#,
        thread_id.0,
        kind.as_str(),
        status.as_str(),
        triggered_by.0,
        metadata
    )
    .fetch_one(pool)
    .await?;
    Ok(AiRunId(id))
}

pub async fn get_run(pool: &PgPool, id: AiRunId) -> Result<Option<RunRow>> {
    let row = sqlx::query_as!(
        RunRow,
        r#"SELECT id AS "id: AiRunId", thread_id AS "thread_id: AiThreadId",
                  kind AS "kind: AiRunKind", status AS "status: AiRunStatus",
                  triggered_by AS "triggered_by: UserId", model_name, duration_ms,
                  input_tokens, output_tokens,
                  cost_estimate::double precision AS "cost_estimate?",
                  safety_state, error_code, metadata,
                  (extract(epoch FROM started_at))::bigint AS "started_at!",
                  (extract(epoch FROM completed_at))::bigint AS "completed_at?",
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM ai_runs WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn get_run_status(pool: &PgPool, id: AiRunId) -> Result<Option<AiRunStatus>> {
    let status = sqlx::query_scalar!(
        r#"SELECT status AS "status: AiRunStatus" FROM ai_runs WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(status)
}

/// `queued → running` (restarts the clock). `false` = the run is not queued.
pub async fn mark_running(pool: &PgPool, id: AiRunId) -> Result<bool> {
    let result = sqlx::query!(
        r#"UPDATE ai_runs SET status = 'running', started_at = now(),
               completed_at = NULL, error_code = NULL
           WHERE id = $1 AND status = 'queued'"#,
        id.0
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// `running → succeeded` with the accounting columns. `false` = not running
/// any more (cancelled underneath us).
pub async fn finish_run(
    pool: &PgPool,
    id: AiRunId,
    model_name: &str,
    input_tokens: i32,
    output_tokens: i32,
    metadata_patch: &serde_json::Value,
) -> Result<bool> {
    let result = sqlx::query!(
        r#"UPDATE ai_runs SET status = 'succeeded', model_name = $2, input_tokens = $3,
               output_tokens = $4, metadata = metadata || $5, completed_at = now(),
               duration_ms = (extract(epoch FROM now() - started_at) * 1000)::integer
           WHERE id = $1 AND status = 'running'"#,
        id.0,
        model_name,
        input_tokens,
        output_tokens,
        metadata_patch
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// `{queued, running} → failed`. `false` = already terminal.
pub async fn fail_run(pool: &PgPool, id: AiRunId, error_code: &str) -> Result<bool> {
    let result = sqlx::query!(
        r#"UPDATE ai_runs SET status = 'failed', error_code = $2, completed_at = now(),
               duration_ms = (extract(epoch FROM now() - started_at) * 1000)::integer
           WHERE id = $1 AND status IN ('queued', 'running')"#,
        id.0,
        error_code
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// `{queued, running} → aborted`. `false` = already terminal.
pub async fn abort_run(pool: &PgPool, id: AiRunId) -> Result<bool> {
    let result = sqlx::query!(
        r#"UPDATE ai_runs SET status = 'aborted', error_code = 'CANCELLED', completed_at = now(),
               duration_ms = (extract(epoch FROM now() - started_at) * 1000)::integer
           WHERE id = $1 AND status IN ('queued', 'running')"#,
        id.0
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// Shallow-merge `patch` into the run metadata.
pub async fn merge_run_metadata(
    pool: &PgPool,
    id: AiRunId,
    patch: &serde_json::Value,
) -> Result<()> {
    sqlx::query!(
        "UPDATE ai_runs SET metadata = metadata || $2 WHERE id = $1",
        id.0,
        patch
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// The newest run of a thread whose `metadata.client_turn_id` matches.
pub async fn find_run_by_turn(
    pool: &PgPool,
    thread_id: AiThreadId,
    client_turn_id: &str,
) -> Result<Option<RunRow>> {
    let row = sqlx::query_as!(
        RunRow,
        r#"SELECT id AS "id: AiRunId", thread_id AS "thread_id: AiThreadId",
                  kind AS "kind: AiRunKind", status AS "status: AiRunStatus",
                  triggered_by AS "triggered_by: UserId", model_name, duration_ms,
                  input_tokens, output_tokens,
                  cost_estimate::double precision AS "cost_estimate?",
                  safety_state, error_code, metadata,
                  (extract(epoch FROM started_at))::bigint AS "started_at!",
                  (extract(epoch FROM completed_at))::bigint AS "completed_at?",
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM ai_runs
           WHERE thread_id = $1 AND metadata->>'client_turn_id' = $2
           ORDER BY id DESC LIMIT 1"#,
        thread_id.0,
        client_turn_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Admin filters; every optional filter is a typed NULL when unset.
#[derive(Debug, Clone, Default)]
pub struct RunFilter<'a> {
    pub since_days: i32,
    pub status: Option<AiRunStatus>,
    pub kind: Option<AiRunKind>,
    /// Case-insensitive substring of `model_name` (`openai`, `openrouter`).
    pub provider: Option<&'a str>,
    pub course_id: Option<CourseId>,
    pub cursor: Option<AiRunId>,
    pub limit: i64,
}

/// Keyset page of runs (newest first) for the admin operations view.
pub async fn list_runs(pool: &PgPool, filter: &RunFilter<'_>) -> Result<Vec<RunRow>> {
    let rows = sqlx::query_as!(
        RunRow,
        r#"SELECT id AS "id: AiRunId", thread_id AS "thread_id: AiThreadId",
                  kind AS "kind: AiRunKind", status AS "status: AiRunStatus",
                  triggered_by AS "triggered_by: UserId", model_name, duration_ms,
                  input_tokens, output_tokens,
                  cost_estimate::double precision AS "cost_estimate?",
                  safety_state, error_code, metadata,
                  (extract(epoch FROM started_at))::bigint AS "started_at!",
                  (extract(epoch FROM completed_at))::bigint AS "completed_at?",
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM ai_runs
           WHERE started_at >= now() - make_interval(days => $1)
             AND ($2::text IS NULL OR status = $2)
             AND ($3::text IS NULL OR kind = $3)
             AND ($4::text IS NULL OR model_name ILIKE '%' || $4 || '%')
             AND ($5::text IS NULL OR metadata->>'course_id' = $5)
             AND ($6::uuid IS NULL OR id < $6)
           ORDER BY id DESC
           LIMIT $7"#,
        filter.since_days,
        filter.status.map(AiRunStatus::as_str),
        filter.kind.map(AiRunKind::as_str),
        filter.provider,
        filter.course_id.map(|c| c.0.to_string()),
        filter.cursor.map(|c| c.0),
        filter.limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone, Copy, Default)]
pub struct RunAggregate {
    pub total: i64,
    pub queued: i64,
    pub running: i64,
    pub succeeded: i64,
    pub failed: i64,
    pub aborted: i64,
}

pub async fn run_aggregate(pool: &PgPool) -> Result<RunAggregate> {
    let row = sqlx::query!(
        r#"SELECT count(*) AS "total!",
                  count(*) FILTER (WHERE status = 'queued') AS "queued!",
                  count(*) FILTER (WHERE status = 'running') AS "running!",
                  count(*) FILTER (WHERE status = 'succeeded') AS "succeeded!",
                  count(*) FILTER (WHERE status = 'failed') AS "failed!",
                  count(*) FILTER (WHERE status = 'aborted') AS "aborted!"
           FROM ai_runs"#
    )
    .fetch_one(pool)
    .await?;
    Ok(RunAggregate {
        total: row.total,
        queued: row.queued,
        running: row.running,
        succeeded: row.succeeded,
        failed: row.failed,
        aborted: row.aborted,
    })
}

// ── Events ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct EventRow {
    pub id: AiEventId,
    pub run_id: AiRunId,
    pub sequence: i32,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub created_at: i64,
}

/// Append the next event of a run. The run row is locked so two writers
/// (the executor and a cancel request) cannot pick the same sequence.
pub async fn append_event(
    pool: &PgPool,
    run_id: AiRunId,
    event_type: &str,
    payload: &serde_json::Value,
) -> Result<EventRow> {
    let mut tx = pool.begin().await?;
    sqlx::query_scalar!("SELECT id FROM ai_runs WHERE id = $1 FOR UPDATE", run_id.0)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| Error::not_found("ai run"))?;
    let row = sqlx::query_as!(
        EventRow,
        r#"INSERT INTO ai_events (run_id, sequence, event_type, payload)
           VALUES ($1, (SELECT coalesce(max(sequence), 0) + 1 FROM ai_events WHERE run_id = $1),
                   $2, $3)
           RETURNING id AS "id: AiEventId", run_id AS "run_id: AiRunId", sequence, event_type,
                     payload, (extract(epoch FROM created_at))::bigint AS "created_at!""#,
        run_id.0,
        event_type,
        payload
    )
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(row)
}

pub async fn list_events(pool: &PgPool, run_id: AiRunId) -> Result<Vec<EventRow>> {
    let rows = sqlx::query_as!(
        EventRow,
        r#"SELECT id AS "id: AiEventId", run_id AS "run_id: AiRunId", sequence, event_type,
                  payload, (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM ai_events WHERE run_id = $1 ORDER BY sequence"#,
        run_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Artifacts & evidence ────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ArtifactRow {
    pub id: AiArtifactId,
    pub run_id: AiRunId,
    pub kind: String,
    pub content: serde_json::Value,
    pub final_: bool,
    pub created_at: i64,
}

pub async fn insert_artifact(
    pool: &PgPool,
    run_id: AiRunId,
    kind: &str,
    content: &serde_json::Value,
    final_: bool,
) -> Result<AiArtifactId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO ai_artifacts (run_id, kind, content, final)
           VALUES ($1, $2, $3, $4) RETURNING id"#,
        run_id.0,
        kind,
        content,
        final_
    )
    .fetch_one(pool)
    .await?;
    Ok(AiArtifactId(id))
}

/// Newest first (legacy order).
pub async fn list_artifacts(pool: &PgPool, run_id: AiRunId) -> Result<Vec<ArtifactRow>> {
    let rows = sqlx::query_as!(
        ArtifactRow,
        r#"SELECT id AS "id: AiArtifactId", run_id AS "run_id: AiRunId", kind, content,
                  final AS "final_", (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM ai_artifacts WHERE run_id = $1 ORDER BY created_at DESC, id DESC"#,
        run_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct EvidenceRow {
    pub id: AiEvidenceId,
    pub run_id: AiRunId,
    pub artifact_id: Option<AiArtifactId>,
    pub citation_id: String,
    pub label: String,
    pub source_type: String,
    pub source_ref: Option<String>,
    pub excerpt: String,
    pub score: Option<f64>,
    pub created_at: i64,
}

pub struct NewEvidence<'a> {
    pub citation_id: &'a str,
    pub label: &'a str,
    pub source_type: &'a str,
    pub source_ref: Option<&'a str>,
    pub excerpt: &'a str,
    pub score: Option<f64>,
}

pub async fn insert_evidence(
    pool: &PgPool,
    run_id: AiRunId,
    artifact_id: AiArtifactId,
    e: NewEvidence<'_>,
) -> Result<AiEvidenceId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO ai_evidence (run_id, artifact_id, citation_id, label, source_type,
                                    source_ref, excerpt, score)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id"#,
        run_id.0,
        artifact_id.0,
        e.citation_id,
        e.label,
        e.source_type,
        e.source_ref,
        e.excerpt,
        e.score
    )
    .fetch_one(pool)
    .await?;
    Ok(AiEvidenceId(id))
}

pub async fn list_evidence(pool: &PgPool, run_id: AiRunId) -> Result<Vec<EvidenceRow>> {
    let rows = sqlx::query_as!(
        EvidenceRow,
        r#"SELECT id AS "id: AiEvidenceId", run_id AS "run_id: AiRunId",
                  artifact_id AS "artifact_id: AiArtifactId", citation_id, label, source_type,
                  source_ref, excerpt, score,
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM ai_evidence WHERE run_id = $1 ORDER BY created_at, id"#,
        run_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Evals ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct EvalResultRow {
    pub id: AiEvalResultId,
    pub run_id: Option<AiRunId>,
    pub dataset: String,
    pub evaluator: String,
    pub score: Option<f64>,
    pub passed: Option<bool>,
    pub details: serde_json::Value,
    pub created_at: i64,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct EvalSummary {
    pub total: i64,
    pub passed: i64,
    pub failed: i64,
    pub average_score: Option<f64>,
}

pub async fn eval_summary(pool: &PgPool) -> Result<EvalSummary> {
    let row = sqlx::query!(
        r#"SELECT count(*) AS "total!",
                  count(*) FILTER (WHERE passed) AS "passed!",
                  count(*) FILTER (WHERE passed = false) AS "failed!",
                  avg(score) AS "average_score?"
           FROM ai_eval_results"#
    )
    .fetch_one(pool)
    .await?;
    Ok(EvalSummary {
        total: row.total,
        passed: row.passed,
        failed: row.failed,
        average_score: row.average_score,
    })
}

pub async fn list_recent_evals(pool: &PgPool, limit: i64) -> Result<Vec<EvalResultRow>> {
    let rows = sqlx::query_as!(
        EvalResultRow,
        r#"SELECT id AS "id: AiEvalResultId", run_id AS "run_id: AiRunId", dataset, evaluator,
                  score, passed, details,
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM ai_eval_results ORDER BY created_at DESC, id DESC LIMIT $1"#,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn insert_eval_result(
    pool: &PgPool,
    run_id: Option<AiRunId>,
    dataset: &str,
    evaluator: &str,
    score: Option<f64>,
    passed: Option<bool>,
    details: &serde_json::Value,
) -> Result<AiEvalResultId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO ai_eval_results (run_id, dataset, evaluator, score, passed, details)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id"#,
        run_id.map(|r| r.0),
        dataset,
        evaluator,
        score,
        passed,
        details
    )
    .fetch_one(pool)
    .await?;
    Ok(AiEvalResultId(id))
}

// ── Token ledger ────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct LedgerRow {
    pub month: String,
    pub user_id: UserId,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub run_count: i32,
}

/// Add one finished run's tokens to the caller's row for this month.
pub async fn ledger_record(
    pool: &PgPool,
    user_id: UserId,
    input_tokens: i64,
    output_tokens: i64,
) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO ai_token_ledger (month, user_id, input_tokens, output_tokens, run_count)
           VALUES (date_trunc('month', now())::date, $1, $2, $3, 1)
           ON CONFLICT (month, user_id) DO UPDATE SET
               input_tokens = ai_token_ledger.input_tokens + EXCLUDED.input_tokens,
               output_tokens = ai_token_ledger.output_tokens + EXCLUDED.output_tokens,
               run_count = ai_token_ledger.run_count + 1,
               updated_at = now()"#,
        user_id.0,
        input_tokens,
        output_tokens
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Platform-wide tokens (input + output) consumed this calendar month.
pub async fn ledger_month_total(pool: &PgPool) -> Result<i64> {
    let total = sqlx::query_scalar!(
        r#"SELECT coalesce(sum(input_tokens + output_tokens), 0)::bigint AS "total!"
           FROM ai_token_ledger WHERE month = date_trunc('month', now())::date"#
    )
    .fetch_one(pool)
    .await?;
    Ok(total)
}

/// This month's per-user rows, heaviest consumers first.
pub async fn ledger_month_rows(pool: &PgPool, limit: i64) -> Result<Vec<LedgerRow>> {
    let rows = sqlx::query_as!(
        LedgerRow,
        r#"SELECT to_char(month, 'YYYY-MM') AS "month!", user_id AS "user_id: UserId",
                  input_tokens, output_tokens, run_count
           FROM ai_token_ledger WHERE month = date_trunc('month', now())::date
           ORDER BY input_tokens + output_tokens DESC, user_id LIMIT $1"#,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone, Copy, Default)]
pub struct UsageTotals {
    pub total_runs: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
}

/// All-time run count + this month's tokens (the legacy summed every run
/// ever against a *monthly* budget; the ledger keeps the month honest).
pub async fn usage_totals(pool: &PgPool) -> Result<UsageTotals> {
    let row = sqlx::query!(
        r#"SELECT (SELECT count(*) FROM ai_runs) AS "total_runs!",
                  coalesce(sum(input_tokens), 0)::bigint AS "input_tokens!",
                  coalesce(sum(output_tokens), 0)::bigint AS "output_tokens!"
           FROM ai_token_ledger WHERE month = date_trunc('month', now())::date"#
    )
    .fetch_one(pool)
    .await?;
    Ok(UsageTotals {
        total_runs: row.total_runs,
        input_tokens: row.input_tokens,
        output_tokens: row.output_tokens,
    })
}

// ── Q&A messages ────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct QaMessageRow {
    pub id: AiMessageId,
    pub thread_id: AiThreadId,
    pub course_id: CourseId,
    pub user_id: Option<UserId>,
    pub role: QaMessageRole,
    pub client_turn_id: Option<String>,
    pub content: String,
    pub confidence: Option<String>,
    pub citations: serde_json::Value,
    pub metadata: serde_json::Value,
    pub created_at: i64,
}

pub struct NewQaMessage<'a> {
    pub thread_id: AiThreadId,
    pub course_id: CourseId,
    pub user_id: UserId,
    pub role: QaMessageRole,
    pub client_turn_id: Option<&'a str>,
    pub content: &'a str,
    pub confidence: Option<&'a str>,
    pub citations: &'a serde_json::Value,
    pub metadata: &'a serde_json::Value,
}

pub async fn insert_qa_message(pool: &PgPool, m: NewQaMessage<'_>) -> Result<AiMessageId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO ai_qa_messages (thread_id, course_id, user_id, role, client_turn_id,
                                       content, confidence, citations, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id"#,
        m.thread_id.0,
        m.course_id.0,
        m.user_id.0,
        m.role.as_str(),
        m.client_turn_id,
        m.content,
        m.confidence,
        m.citations,
        m.metadata
    )
    .fetch_one(pool)
    .await?;
    Ok(AiMessageId(id))
}

pub async fn get_qa_message(pool: &PgPool, id: AiMessageId) -> Result<Option<QaMessageRow>> {
    let row = sqlx::query_as!(
        QaMessageRow,
        r#"SELECT id AS "id: AiMessageId", thread_id AS "thread_id: AiThreadId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  role AS "role: QaMessageRole", client_turn_id, content, confidence,
                  citations, metadata,
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM ai_qa_messages WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Oldest first — the thread transcript.
pub async fn list_thread_messages(
    pool: &PgPool,
    thread_id: AiThreadId,
) -> Result<Vec<QaMessageRow>> {
    let rows = sqlx::query_as!(
        QaMessageRow,
        r#"SELECT id AS "id: AiMessageId", thread_id AS "thread_id: AiThreadId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  role AS "role: QaMessageRole", client_turn_id, content, confidence,
                  citations, metadata,
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM ai_qa_messages WHERE thread_id = $1 ORDER BY created_at, id"#,
        thread_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Newest first, at most `limit`, optionally skipping one message — the
/// raw material for the model's conversation history.
pub async fn recent_thread_messages(
    pool: &PgPool,
    thread_id: AiThreadId,
    exclude: Option<AiMessageId>,
    limit: i64,
) -> Result<Vec<QaMessageRow>> {
    let rows = sqlx::query_as!(
        QaMessageRow,
        r#"SELECT id AS "id: AiMessageId", thread_id AS "thread_id: AiThreadId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  role AS "role: QaMessageRole", client_turn_id, content, confidence,
                  citations, metadata,
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM ai_qa_messages
           WHERE thread_id = $1 AND ($2::uuid IS NULL OR id <> $2)
           ORDER BY created_at DESC, id DESC LIMIT $3"#,
        thread_id.0,
        exclude.map(|m| m.0),
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// The user message a client turn id was first attached to.
pub async fn find_user_message_by_turn(
    pool: &PgPool,
    course_id: CourseId,
    user_id: UserId,
    client_turn_id: &str,
) -> Result<Option<QaMessageRow>> {
    let row = sqlx::query_as!(
        QaMessageRow,
        r#"SELECT id AS "id: AiMessageId", thread_id AS "thread_id: AiThreadId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  role AS "role: QaMessageRole", client_turn_id, content, confidence,
                  citations, metadata,
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM ai_qa_messages
           WHERE course_id = $1 AND user_id = $2 AND client_turn_id = $3"#,
        course_id.0,
        user_id.0,
        client_turn_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// The assistant message that answered `reply_to` (`metadata.reply_to_message_id`).
pub async fn find_assistant_reply(
    pool: &PgPool,
    thread_id: AiThreadId,
    reply_to: AiMessageId,
) -> Result<Option<QaMessageRow>> {
    let row = sqlx::query_as!(
        QaMessageRow,
        r#"SELECT id AS "id: AiMessageId", thread_id AS "thread_id: AiThreadId",
                  course_id AS "course_id: CourseId", user_id AS "user_id: UserId",
                  role AS "role: QaMessageRole", client_turn_id, content, confidence,
                  citations, metadata,
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM ai_qa_messages
           WHERE thread_id = $1 AND role = 'assistant'
             AND metadata->>'reply_to_message_id' = $2
           ORDER BY created_at, id LIMIT 1"#,
        thread_id.0,
        reply_to.0.to_string()
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

// ── Submission analyses ─────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct SubmissionAnalysisRow {
    pub id: AiSubmissionAnalysisId,
    pub submission_id: SubmissionId,
    pub run_id: Option<AiRunId>,
    pub triggered_by: Option<UserId>,
    pub status: String,
    pub language: String,
    pub gap_count: i32,
    pub analysis: serde_json::Value,
    pub evidence: serde_json::Value,
    pub model_name: Option<String>,
    pub created_at: i64,
}

pub struct NewSubmissionAnalysis<'a> {
    pub submission_id: SubmissionId,
    pub run_id: AiRunId,
    pub triggered_by: UserId,
    pub language: &'a str,
    pub gap_count: i32,
    pub analysis: &'a serde_json::Value,
    pub evidence: &'a serde_json::Value,
    pub model_name: &'a str,
}

pub async fn insert_submission_analysis(
    pool: &PgPool,
    a: NewSubmissionAnalysis<'_>,
) -> Result<AiSubmissionAnalysisId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO ai_submission_analyses (submission_id, run_id, triggered_by, language,
                                               gap_count, analysis, evidence, model_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id"#,
        a.submission_id.0,
        a.run_id.0,
        a.triggered_by.0,
        a.language,
        a.gap_count,
        a.analysis,
        a.evidence,
        a.model_name
    )
    .fetch_one(pool)
    .await?;
    Ok(AiSubmissionAnalysisId(id))
}

pub async fn get_submission_analysis(
    pool: &PgPool,
    id: AiSubmissionAnalysisId,
) -> Result<Option<SubmissionAnalysisRow>> {
    let row = sqlx::query_as!(
        SubmissionAnalysisRow,
        r#"SELECT id AS "id: AiSubmissionAnalysisId", submission_id AS "submission_id: SubmissionId",
                  run_id AS "run_id: AiRunId", triggered_by AS "triggered_by: UserId", status,
                  language, gap_count, analysis, evidence, model_name,
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM ai_submission_analyses WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn latest_submission_analysis(
    pool: &PgPool,
    submission_id: SubmissionId,
) -> Result<Option<SubmissionAnalysisRow>> {
    let row = sqlx::query_as!(
        SubmissionAnalysisRow,
        r#"SELECT id AS "id: AiSubmissionAnalysisId", submission_id AS "submission_id: SubmissionId",
                  run_id AS "run_id: AiRunId", triggered_by AS "triggered_by: UserId", status,
                  language, gap_count, analysis, evidence, model_name,
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM ai_submission_analyses WHERE submission_id = $1
           ORDER BY created_at DESC, id DESC LIMIT 1"#,
        submission_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

// ── Course analyses ─────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CourseAnalysisRow {
    pub id: AiCourseAnalysisId,
    pub course_id: CourseId,
    pub run_id: Option<AiRunId>,
    pub triggered_by: Option<UserId>,
    pub status: CourseAnalysisStatus,
    pub language: String,
    pub public_score: i32,
    pub report: serde_json::Value,
    pub evidence: serde_json::Value,
    pub model_name: Option<String>,
    pub content_hash: Option<String>,
    pub created_at: i64,
    pub published_at: Option<i64>,
}

pub struct NewCourseAnalysis<'a> {
    pub course_id: CourseId,
    pub run_id: AiRunId,
    pub triggered_by: UserId,
    pub status: CourseAnalysisStatus,
    pub language: &'a str,
    pub public_score: i32,
    pub report: &'a serde_json::Value,
    pub evidence: &'a serde_json::Value,
    pub model_name: &'a str,
    pub content_hash: &'a str,
}

pub async fn insert_course_analysis(
    pool: &PgPool,
    a: NewCourseAnalysis<'_>,
) -> Result<AiCourseAnalysisId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO ai_course_analyses (course_id, run_id, triggered_by, status, language,
                                           public_score, report, evidence, model_name, content_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id"#,
        a.course_id.0,
        a.run_id.0,
        a.triggered_by.0,
        a.status.as_str(),
        a.language,
        a.public_score,
        a.report,
        a.evidence,
        a.model_name,
        a.content_hash
    )
    .fetch_one(pool)
    .await?;
    Ok(AiCourseAnalysisId(id))
}

pub async fn get_course_analysis(
    pool: &PgPool,
    id: AiCourseAnalysisId,
) -> Result<Option<CourseAnalysisRow>> {
    let row = sqlx::query_as!(
        CourseAnalysisRow,
        r#"SELECT id AS "id: AiCourseAnalysisId", course_id AS "course_id: CourseId",
                  run_id AS "run_id: AiRunId", triggered_by AS "triggered_by: UserId",
                  status AS "status: CourseAnalysisStatus", language, public_score, report,
                  evidence, model_name, content_hash,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM published_at))::bigint AS "published_at?"
           FROM ai_course_analyses WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// The newest analyses of a course (published only for learners).
pub async fn latest_course_analyses(
    pool: &PgPool,
    course_id: CourseId,
    published_only: bool,
    limit: i64,
) -> Result<Vec<CourseAnalysisRow>> {
    let rows = sqlx::query_as!(
        CourseAnalysisRow,
        r#"SELECT id AS "id: AiCourseAnalysisId", course_id AS "course_id: CourseId",
                  run_id AS "run_id: AiRunId", triggered_by AS "triggered_by: UserId",
                  status AS "status: CourseAnalysisStatus", language, public_score, report,
                  evidence, model_name, content_hash,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM published_at))::bigint AS "published_at?"
           FROM ai_course_analyses
           WHERE course_id = $1 AND (NOT $2 OR status = 'published')
           ORDER BY created_at DESC, id DESC LIMIT $3"#,
        course_id.0,
        published_only,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn publish_course_analysis(pool: &PgPool, id: AiCourseAnalysisId) -> Result<()> {
    sqlx::query!(
        "UPDATE ai_course_analyses SET status = 'published', published_at = now() WHERE id = $1",
        id.0
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_course_analysis_report(
    pool: &PgPool,
    id: AiCourseAnalysisId,
    report: &serde_json::Value,
) -> Result<()> {
    sqlx::query!(
        "UPDATE ai_course_analyses SET report = $2 WHERE id = $1",
        id.0,
        report
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Lecture reviews ─────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct LectureReviewRow {
    pub id: AiLectureReviewId,
    pub course_id: CourseId,
    pub activity_id: Option<ActivityId>,
    pub run_id: Option<AiRunId>,
    pub triggered_by: Option<UserId>,
    pub status: LectureReviewStatus,
    pub language: String,
    pub suggestions: serde_json::Value,
    pub dismissed_suggestion_ids: Vec<String>,
    pub created_at: i64,
    pub superseded_at: Option<i64>,
}

pub struct NewLectureReview<'a> {
    pub course_id: CourseId,
    pub activity_id: Option<ActivityId>,
    pub run_id: AiRunId,
    pub triggered_by: UserId,
    pub language: &'a str,
    pub suggestions: &'a serde_json::Value,
}

pub async fn insert_lecture_review(
    pool: &PgPool,
    r: NewLectureReview<'_>,
) -> Result<AiLectureReviewId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO ai_lecture_reviews (course_id, activity_id, run_id, triggered_by,
                                           language, suggestions)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id"#,
        r.course_id.0,
        r.activity_id.map(|a| a.0),
        r.run_id.0,
        r.triggered_by.0,
        r.language,
        r.suggestions
    )
    .fetch_one(pool)
    .await?;
    Ok(AiLectureReviewId(id))
}

pub async fn get_lecture_review(
    pool: &PgPool,
    id: AiLectureReviewId,
) -> Result<Option<LectureReviewRow>> {
    let row = sqlx::query_as!(
        LectureReviewRow,
        r#"SELECT id AS "id: AiLectureReviewId", course_id AS "course_id: CourseId",
                  activity_id AS "activity_id: ActivityId", run_id AS "run_id: AiRunId",
                  triggered_by AS "triggered_by: UserId", status AS "status: LectureReviewStatus",
                  language, suggestions, dismissed_suggestion_ids,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM superseded_at))::bigint AS "superseded_at?"
           FROM ai_lecture_reviews WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Active reviews of a course, newest first.
pub async fn list_active_lecture_reviews(
    pool: &PgPool,
    course_id: CourseId,
) -> Result<Vec<LectureReviewRow>> {
    let rows = sqlx::query_as!(
        LectureReviewRow,
        r#"SELECT id AS "id: AiLectureReviewId", course_id AS "course_id: CourseId",
                  activity_id AS "activity_id: ActivityId", run_id AS "run_id: AiRunId",
                  triggered_by AS "triggered_by: UserId", status AS "status: LectureReviewStatus",
                  language, suggestions, dismissed_suggestion_ids,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM superseded_at))::bigint AS "superseded_at?"
           FROM ai_lecture_reviews WHERE course_id = $1 AND status = 'active'
           ORDER BY created_at DESC, id DESC"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Add a suggestion id to the dismissed set (idempotent).
pub async fn dismiss_lecture_suggestion(
    pool: &PgPool,
    id: AiLectureReviewId,
    suggestion_id: &str,
) -> Result<()> {
    sqlx::query!(
        r#"UPDATE ai_lecture_reviews
           SET dismissed_suggestion_ids = array_append(
                   array_remove(dismissed_suggestion_ids, $2), $2)
           WHERE id = $1"#,
        id.0,
        suggestion_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Remediation sessions ────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct RemediationSessionRow {
    pub id: AiRemediationSessionId,
    pub submission_id: SubmissionId,
    pub activity_id: ActivityId,
    pub student_user_id: UserId,
    pub analysis_id: Option<AiSubmissionAnalysisId>,
    pub run_id: Option<AiRunId>,
    pub status: RemediationStatus,
    pub gate_mode: bool,
    pub language: String,
    pub lecture: serde_json::Value,
    pub test: serde_json::Value,
    pub score: Option<i32>,
    pub passed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct NewRemediationSession<'a> {
    pub submission_id: SubmissionId,
    pub activity_id: ActivityId,
    pub student_user_id: UserId,
    pub analysis_id: Option<AiSubmissionAnalysisId>,
    pub run_id: AiRunId,
    pub gate_mode: bool,
    pub language: &'a str,
    pub lecture: &'a serde_json::Value,
    pub test: &'a serde_json::Value,
}

pub async fn insert_remediation_session(
    pool: &PgPool,
    s: NewRemediationSession<'_>,
) -> Result<AiRemediationSessionId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO ai_remediation_sessions (submission_id, activity_id, student_user_id,
                                                analysis_id, run_id, gate_mode, language,
                                                lecture, test)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id"#,
        s.submission_id.0,
        s.activity_id.0,
        s.student_user_id.0,
        s.analysis_id.map(|a| a.0),
        s.run_id.0,
        s.gate_mode,
        s.language,
        s.lecture,
        s.test
    )
    .fetch_one(pool)
    .await?;
    Ok(AiRemediationSessionId(id))
}

pub async fn get_remediation_session(
    pool: &PgPool,
    id: AiRemediationSessionId,
) -> Result<Option<RemediationSessionRow>> {
    let row = sqlx::query_as!(
        RemediationSessionRow,
        r#"SELECT id AS "id: AiRemediationSessionId", submission_id AS "submission_id: SubmissionId",
                  activity_id AS "activity_id: ActivityId",
                  student_user_id AS "student_user_id: UserId",
                  analysis_id AS "analysis_id: AiSubmissionAnalysisId", run_id AS "run_id: AiRunId",
                  status AS "status: RemediationStatus", gate_mode, language, lecture, test, score,
                  (extract(epoch FROM passed_at))::bigint AS "passed_at?",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM ai_remediation_sessions WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// A learner's sessions, newest first.
pub async fn list_student_remediation_sessions(
    pool: &PgPool,
    student_user_id: UserId,
) -> Result<Vec<RemediationSessionRow>> {
    let rows = sqlx::query_as!(
        RemediationSessionRow,
        r#"SELECT id AS "id: AiRemediationSessionId", submission_id AS "submission_id: SubmissionId",
                  activity_id AS "activity_id: ActivityId",
                  student_user_id AS "student_user_id: UserId",
                  analysis_id AS "analysis_id: AiSubmissionAnalysisId", run_id AS "run_id: AiRunId",
                  status AS "status: RemediationStatus", gate_mode, language, lecture, test, score,
                  (extract(epoch FROM passed_at))::bigint AS "passed_at?",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM ai_remediation_sessions WHERE student_user_id = $1
           ORDER BY created_at DESC, id DESC"#,
        student_user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Legacy `active_remediation_gate`: an unpassed gate-mode session blocks
/// the learner on this activity.
pub async fn active_remediation_gate(
    pool: &PgPool,
    student_user_id: UserId,
    activity_id: ActivityId,
) -> Result<Option<AiRemediationSessionId>> {
    let id = sqlx::query_scalar!(
        r#"SELECT id FROM ai_remediation_sessions
           WHERE student_user_id = $1 AND activity_id = $2 AND gate_mode
             AND status IN ('assigned', 'in_progress', 'failed')
           ORDER BY created_at DESC LIMIT 1"#,
        student_user_id.0,
        activity_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(id.map(AiRemediationSessionId))
}

pub async fn complete_remediation_session(
    pool: &PgPool,
    id: AiRemediationSessionId,
    score: i32,
    status: RemediationStatus,
) -> Result<()> {
    sqlx::query!(
        r#"UPDATE ai_remediation_sessions SET score = $2, status = $3,
               passed_at = CASE WHEN $3 = 'passed' THEN now() ELSE passed_at END
           WHERE id = $1"#,
        id.0,
        score,
        status.as_str()
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Context sources ─────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CourseContextRow {
    pub id: CourseId,
    pub name: String,
    pub description: String,
    pub about: String,
    pub learnings: serde_json::Value,
    pub tags: Vec<String>,
}

pub async fn course_context(pool: &PgPool, id: CourseId) -> Result<Option<CourseContextRow>> {
    let row = sqlx::query_as!(
        CourseContextRow,
        r#"SELECT id AS "id: CourseId", name, description, about, learnings, tags
           FROM courses WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

#[derive(Debug, Clone)]
pub struct ChapterNameRow {
    pub id: ChapterId,
    pub name: String,
}

pub async fn chapter_names(pool: &PgPool, course_id: CourseId) -> Result<Vec<ChapterNameRow>> {
    let rows = sqlx::query_as!(
        ChapterNameRow,
        r#"SELECT id AS "id: ChapterId", name FROM chapters WHERE course_id = $1
           ORDER BY position, id"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct ActivityContextRow {
    pub id: ActivityId,
    pub chapter_id: ChapterId,
    pub name: String,
    pub activity_type: String,
    pub published: bool,
    pub content: serde_json::Value,
    pub details: serde_json::Value,
}

/// Every activity of a course with its content, in curriculum order.
pub async fn activities_with_content(
    pool: &PgPool,
    course_id: CourseId,
) -> Result<Vec<ActivityContextRow>> {
    let rows = sqlx::query_as!(
        ActivityContextRow,
        r#"SELECT a.id AS "id: ActivityId", a.chapter_id AS "chapter_id: ChapterId", a.name,
                  a.activity_type, a.published, a.content, a.details
           FROM activities a JOIN chapters c ON c.id = a.chapter_id
           WHERE a.course_id = $1
           ORDER BY c.position, c.id, a.position, a.id"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn activity_context(pool: &PgPool, id: ActivityId) -> Result<Option<ActivityContextRow>> {
    let row = sqlx::query_as!(
        ActivityContextRow,
        r#"SELECT id AS "id: ActivityId", chapter_id AS "chapter_id: ChapterId", name,
                  activity_type, published, content, details
           FROM activities WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

#[derive(Debug, Clone)]
pub struct AssessmentContextRow {
    pub id: AssessmentId,
    pub activity_id: ActivityId,
    pub title: String,
    pub kind: String,
    pub grading_mode: String,
    pub passing_score: f64,
    pub max_attempts: Option<i32>,
    pub time_limit_seconds: Option<i32>,
    pub due_at: Option<i64>,
}

/// Assessment headers of a course (policy scalars stand in for the legacy
/// `settings_json`).
pub async fn assessments_context(
    pool: &PgPool,
    course_id: CourseId,
) -> Result<Vec<AssessmentContextRow>> {
    let rows = sqlx::query_as!(
        AssessmentContextRow,
        r#"SELECT id AS "id: AssessmentId", activity_id AS "activity_id: ActivityId", title, kind,
                  grading_mode, passing_score, max_attempts, time_limit_seconds,
                  (extract(epoch FROM due_at))::bigint AS "due_at?"
           FROM assessments WHERE course_id = $1 ORDER BY id"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct ItemContextRow {
    pub id: ab_core::id::AssessmentItemId,
    pub assessment_id: AssessmentId,
    pub title: String,
    pub kind: String,
    pub body: serde_json::Value,
}

pub async fn items_context(
    pool: &PgPool,
    assessment_id: AssessmentId,
) -> Result<Vec<ItemContextRow>> {
    let rows = sqlx::query_as!(
        ItemContextRow,
        r#"SELECT id AS "id: ab_core::id::AssessmentItemId", assessment_id AS "assessment_id: AssessmentId",
                  title, kind, body
           FROM assessment_items WHERE assessment_id = $1 ORDER BY position, id"#,
        assessment_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
