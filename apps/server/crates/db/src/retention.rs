//! Retention of operational logs (schema review item 24).
//!
//! Run daily by the `maintenance:retention` job. Windows come from `AB__RETENTION__*`
//! ([`ab_core::config::RetentionConfig`]); each sweep deletes in 5 000-row
//! batches through the primary key so no statement holds locks for long.
//!
//! Nothing a learner or teacher still reads goes: graded (`final`) code runs
//! keep their output, practice runs keep their verdict rows (status, passed,
//! time, memory) and lose only stdout/stderr/compile output; AI events go
//! only for finished runs. Notifications and analytics keep their own sweeps
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
}

/// One sweep over every log table; returns the rows deleted (or, for code
/// runs, cleared) per table.
pub async fn sweep(pool: &PgPool, windows: &RetentionConfig) -> Result<RetentionCounts> {
    macro_rules! batched {
        ($query:expr) => {{
            let mut total = 0_u64;
            loop {
                let n = $query.execute(pool).await?.rows_affected();
                total += n;
                if n < BATCH {
                    break total;
                }
            }
        }};
    }
    let jobs = batched!(sqlx::query!(
        "DELETE FROM jobs WHERE id IN (
             SELECT id FROM jobs
             WHERE (status = 'succeeded' AND created_at < now() - make_interval(days => $1))
                OR (status IN ('failed', 'dead') AND created_at < now() - make_interval(days => $2))
             LIMIT 5000)",
        windows.jobs_succeeded_days,
        windows.jobs_dead_days,
    ));
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
    let code_run_outputs = batched!(sqlx::query!(
        "WITH old AS (
             SELECT r.id FROM code_runs r
             WHERE r.created_at < now() - make_interval(days => $1)
               AND r.purpose <> 'final'
               AND (r.compile_output IS NOT NULL
                    OR EXISTS (SELECT 1 FROM code_run_cases c
                               WHERE c.run_id = r.id
                                 AND (c.stdout IS NOT NULL OR c.stderr IS NOT NULL
                                      OR c.compile_output IS NOT NULL)))
             LIMIT 5000),
         cases AS (
             UPDATE code_run_cases c SET stdout = NULL, stderr = NULL, compile_output = NULL
             FROM old WHERE c.run_id = old.id)
         UPDATE code_runs r SET compile_output = NULL FROM old WHERE r.id = old.id",
        windows.code_run_output_days,
    ));
    let ai_events = batched!(sqlx::query!(
        "DELETE FROM ai_events WHERE id IN (
             SELECT e.id FROM ai_events e JOIN ai_runs r ON r.id = e.run_id
             WHERE e.created_at < now() - make_interval(days => $1)
               AND r.status IN ('succeeded', 'failed', 'aborted')
             LIMIT 5000)",
        windows.ai_events_days,
    ));
    Ok(RetentionCounts {
        jobs,
        auth_audit,
        code_run_outputs,
        ai_events,
    })
}
