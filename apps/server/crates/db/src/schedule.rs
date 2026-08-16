//! Recurring job schedules (`job_schedules`), interval-based — see
//! docs/rewrite/DECISIONS.md (2026-08-16) for why not cron expressions.
//!
//! No elected leader: every worker calls [`tick`]; a transaction-scoped
//! advisory lock makes ticks mutually exclusive, `FOR UPDATE SKIP LOCKED`
//! makes them crash-safe, and per-occurrence dedupe keys make enqueueing
//! idempotent even if all of that somehow raced.

use std::time::Duration;

use ab_core::Result;
use sqlx::PgPool;

use crate::queue::{self, NewJob};

/// Advisory lock key for the scheduler tick (transaction-scoped).
const SCHEDULER_LOCK_KEY: i64 = 0x5CED_0001;

/// Create or update a schedule. `next_run_at` is preserved on update unless
/// the interval shrank below the pending gap (then it tightens), so calling
/// this at every boot is safe.
pub async fn upsert<'e, E>(
    executor: E,
    kind: &str,
    every: Duration,
    payload: serde_json::Value,
) -> Result<()>
where
    E: sqlx::PgExecutor<'e>,
{
    sqlx::query(
        r"INSERT INTO job_schedules (kind, interval_seconds, payload, next_run_at)
          VALUES ($1, $2, $3, now() + make_interval(secs => $2::double precision))
          ON CONFLICT (kind) DO UPDATE SET
              interval_seconds = EXCLUDED.interval_seconds,
              payload = EXCLUDED.payload,
              next_run_at = LEAST(job_schedules.next_run_at, EXCLUDED.next_run_at)",
    )
    .bind(kind)
    .bind(i64::try_from(every.as_secs()).unwrap_or(i64::MAX))
    .bind(payload)
    .execute(executor)
    .await?;
    Ok(())
}

pub async fn set_enabled<'e, E>(executor: E, kind: &str, enabled: bool) -> Result<()>
where
    E: sqlx::PgExecutor<'e>,
{
    sqlx::query("UPDATE job_schedules SET enabled = $2 WHERE kind = $1")
        .bind(kind)
        .bind(enabled)
        .execute(executor)
        .await?;
    Ok(())
}

#[derive(sqlx::FromRow)]
struct Due {
    kind: String,
    payload: serde_json::Value,
    occurrence: i64,
}

/// Enqueue every due schedule and advance its `next_run_at`. Returns how many
/// jobs were enqueued. Safe to call concurrently from any number of workers.
pub async fn tick(pool: &PgPool) -> Result<u32> {
    let mut tx = pool.begin().await?;

    let got_lock: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock($1)")
        .bind(SCHEDULER_LOCK_KEY)
        .fetch_one(&mut *tx)
        .await?;
    if !got_lock {
        // Another worker is mid-tick; nothing to do.
        return Ok(0);
    }

    let due: Vec<Due> = sqlx::query_as(
        r"SELECT kind, payload,
                 (extract(epoch FROM next_run_at))::bigint AS occurrence
          FROM job_schedules
          WHERE enabled AND next_run_at <= now()
          FOR UPDATE SKIP LOCKED",
    )
    .fetch_all(&mut *tx)
    .await?;

    let mut enqueued = 0_u32;
    for schedule in &due {
        // One job per (kind, occurrence): re-ticks cannot double-enqueue.
        let job = NewJob::new(schedule.kind.clone(), schedule.payload.clone())
            .dedupe(format!("sched:{}:{}", schedule.kind, schedule.occurrence));
        if queue::enqueue(&mut *tx, &job).await?.is_some() {
            enqueued += 1;
        }
        sqlx::query(
            r"UPDATE job_schedules
              SET next_run_at = now() + make_interval(secs => interval_seconds::double precision),
                  last_run_at = now()
              WHERE kind = $1",
        )
        .bind(&schedule.kind)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(enqueued)
}
