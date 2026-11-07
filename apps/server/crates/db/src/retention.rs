//! Retention of operational logs (schema review item 24).
//!
//! Run daily by the `maintenance:retention` job. Windows come from `AB__RETENTION__*`
//! ([`ab_core::config::RetentionConfig`]); each sweep deletes in 5 000-row
//! batches through the primary key so no statement holds locks for long.
//!
//! Nothing a learner or teacher still reads goes: graded (`final`) code runs
//! keep their output, practice runs keep their verdict rows (status, passed,
//! time, memory) and lose only stdout/stderr/compile output; AI events go
//! only for finished runs. AI records (runs, Q&A messages, analyses, closed
//! grade drafts) age out like `analytics_events`, except what a grade or a
//! page still shows. Notifications and analytics keep their own sweeps
//! (`notifications:prune`, `analytics:rollup`).

use ab_core::Result;
use ab_core::config::RetentionConfig;
use sqlx::PgPool;

const BATCH: u64 = 5_000;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RetentionCounts {
    pub jobs: u64,
    pub auth_audit: u64,
    pub code_run_outputs: u64,
    pub ai_events: u64,
    pub ai_grade_drafts: u64,
    pub ai_runs: u64,
    pub ai_messages: u64,
    pub ai_threads: u64,
    pub ai_analyses: u64,
}

/// Runs a `LIMIT 5000` statement until it touches fewer rows; the total.
macro_rules! batched {
    ($pool:expr, $query:expr) => {{
        let mut total = 0_u64;
        loop {
            let n = $query.execute($pool).await?.rows_affected();
            total += n;
            if n < BATCH {
                break total;
            }
        }
    }};
}

/// One sweep over every log table; returns the rows deleted (or, for code
/// runs, cleared) per table.
pub async fn sweep(pool: &PgPool, windows: &RetentionConfig) -> Result<RetentionCounts> {
    let jobs = batched!(
        pool,
        sqlx::query!(
            "DELETE FROM jobs WHERE id IN (
             SELECT id FROM jobs
             WHERE (status = 'succeeded' AND created_at < now() - make_interval(days => $1))
                OR (status IN ('failed', 'dead') AND created_at < now() - make_interval(days => $2))
             LIMIT 5000)",
            windows.jobs_succeeded_days,
            windows.jobs_dead_days,
        )
    );
    // The app role may not delete audit rows: the owner's SECURITY DEFINER function does
    // (keeps at least 30 days whatever the window; migration 20261102050100).
    let auth_audit = {
        let mut total = 0_u64;
        loop {
            let n = sqlx::query_scalar!(
                r#"SELECT prune_auth_audit_log($1, 5000) AS "n!""#,
                windows.auth_audit_days,
            )
            .fetch_one(pool)
            .await?;
            let n = u64::try_from(n).unwrap_or(0);
            total += n;
            if n < BATCH {
                break total;
            }
        }
    };
    // Practice runs only (`custom`, `visible`, `reference_check`): a graded
    // run's output stays with its submission.
    let code_run_outputs = batched!(
        pool,
        sqlx::query!(
            "WITH old AS (
             SELECT r.id FROM code_runs r
             WHERE r.created_at < now() - make_interval(days => $1)
               AND r.purpose <> 'final'
               AND (r.compile_output IS NOT NULL
                    OR EXISTS (SELECT 1 FROM code_run_cases c
                               WHERE c.run_id = r.id
                                 AND (c.stdout IS NOT NULL OR c.stderr IS NOT NULL
                                      OR c.compile_output IS NOT NULL
                                      OR c.stdin IS NOT NULL OR c.expected_output IS NOT NULL)))
             LIMIT 5000),
         cases AS (
             UPDATE code_run_cases c SET stdout = NULL, stderr = NULL, compile_output = NULL,
                                        stdin = NULL, expected_output = NULL
             FROM old WHERE c.run_id = old.id)
         UPDATE code_runs r SET compile_output = NULL FROM old WHERE r.id = old.id",
            windows.code_run_output_days,
        )
    );
    let ai_events = batched!(
        pool,
        sqlx::query!(
            "DELETE FROM ai_events WHERE id IN (
             SELECT e.id FROM ai_events e JOIN ai_runs r ON r.id = e.run_id
             WHERE e.created_at < now() - make_interval(days => $1)
               AND r.status IN ('succeeded', 'failed', 'aborted')
             LIMIT 5000)",
            windows.ai_events_days,
        )
    );
    let (ai_grade_drafts, ai_runs, ai_messages, ai_threads, ai_analyses) =
        ai_records(pool, windows.ai_records_days).await?;
    Ok(RetentionCounts {
        jobs,
        auth_audit,
        code_run_outputs,
        ai_events,
        ai_grade_drafts,
        ai_runs,
        ai_messages,
        ai_threads,
        ai_analyses,
    })
}

/// AI records past `days` (REWRITE 5.7): grade drafts, runs, Q&A messages,
/// emptied threads and analyses deleted, in that order.
async fn ai_records(pool: &PgPool, days: i32) -> Result<(u64, u64, u64, u64, u64)> {
    // AI records (REWRITE 5.7). An applied grade draft lives as long as its grade (the
    // submission's cascade takes it) and a live one (queued, ready) until the teacher decides.
    let ai_grade_drafts = batched!(
        pool,
        sqlx::query!(
            "DELETE FROM ai_grade_drafts WHERE id IN (
             SELECT id FROM ai_grade_drafts
             WHERE status IN ('discarded', 'superseded', 'failed')
               AND created_at < now() - make_interval(days => $1)
             LIMIT 5000)",
            days,
        )
    );
    // Artifacts, evidence, approvals and events go with their run.
    let ai_runs = batched!(
        pool,
        sqlx::query!(
            "DELETE FROM ai_runs WHERE id IN (
             SELECT id FROM ai_runs
             WHERE status IN ('succeeded', 'failed', 'aborted')
               AND created_at < now() - make_interval(days => $1)
             LIMIT 5000)",
            days,
        )
    );
    let ai_messages = batched!(
        pool,
        sqlx::query!(
            "DELETE FROM ai_qa_messages WHERE id IN (
             SELECT id FROM ai_qa_messages
             WHERE created_at < now() - make_interval(days => $1)
             LIMIT 5000)",
            days,
        )
    );
    let ai_threads = batched!(
        pool,
        sqlx::query!(
            "DELETE FROM ai_threads WHERE id IN (
             SELECT t.id FROM ai_threads t
             WHERE t.updated_at < now() - make_interval(days => $1)
               AND NOT EXISTS (SELECT 1 FROM ai_qa_messages m WHERE m.thread_id = t.id)
               AND NOT EXISTS (SELECT 1 FROM ai_runs r WHERE r.thread_id = t.id)
             LIMIT 5000)",
            days,
        )
    );
    // A course keeps its newest analysis and its newest published one (the course page shows
    // it); a lesson keeps its active review.
    let ai_analyses = batched!(
        pool,
        sqlx::query!(
            "DELETE FROM ai_submission_analyses WHERE id IN (
             SELECT id FROM ai_submission_analyses
             WHERE created_at < now() - make_interval(days => $1)
             LIMIT 5000)",
            days,
        )
    ) + batched!(
        pool,
        sqlx::query!(
            "DELETE FROM ai_course_analyses WHERE id IN (
             SELECT a.id FROM ai_course_analyses a
             WHERE a.created_at < now() - make_interval(days => $1)
               AND a.id <> (SELECT n.id FROM ai_course_analyses n WHERE n.course_id = a.course_id
                            ORDER BY n.created_at DESC, n.id DESC LIMIT 1)
               AND a.id IS DISTINCT FROM
                   (SELECT p.id FROM ai_course_analyses p
                    WHERE p.course_id = a.course_id AND p.status = 'published'
                    ORDER BY p.created_at DESC, p.id DESC LIMIT 1)
             LIMIT 5000)",
            days,
        )
    ) + batched!(
        pool,
        sqlx::query!(
            "DELETE FROM ai_lecture_reviews WHERE id IN (
             SELECT id FROM ai_lecture_reviews
             WHERE status = 'superseded' AND created_at < now() - make_interval(days => $1)
             LIMIT 5000)",
            days,
        )
    );
    Ok((
        ai_grade_drafts,
        ai_runs,
        ai_messages,
        ai_threads,
        ai_analyses,
    ))
}
