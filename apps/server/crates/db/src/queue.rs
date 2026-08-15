//! Transactional Postgres job queue (ARCHITECTURE §9).
//!
//! Design invariants:
//! - [`enqueue`] is a plain INSERT — call it with the caller's transaction and
//!   the job commits or rolls back atomically with the domain write that
//!   caused it. `NOTIFY jobs_new` fires on commit (same statement, via
//!   `pg_notify`), so workers wake with no polling latency.
//! - [`claim`] uses `FOR UPDATE SKIP LOCKED`: concurrent workers never receive
//!   the same job.
//! - A claimed job must be resolved with [`succeed`] or [`fail`]; if the worker
//!   dies, [`reap`] returns stale jobs to the queue (or dead-letters them).
//!
//! SQL here is runtime-checked (dynamic-ish operational statements, exercised
//! end-to-end by `crates/db/tests/queue.rs` on real Postgres in CI).

use std::time::Duration;

use ab_core::Result;
use ab_core::id::JobId;
use uuid::Uuid;

/// Postgres NOTIFY channel workers LISTEN on.
pub const NOTIFY_CHANNEL: &str = "jobs_new";

/// Backoff schedule: 5s · 2^(attempt-1), capped at 15 minutes.
/// (Deterministic; jitter can be layered in the worker if herds ever matter.)
#[must_use]
pub fn backoff_delay(attempt: i32) -> Duration {
    const BASE: Duration = Duration::from_secs(5);
    const CAP: Duration = Duration::from_mins(15);
    let exp = attempt.saturating_sub(1).clamp(0, 16);
    // Bounded by clamp above — the shift cannot overflow, and CAP bounds growth.
    let delay = BASE.saturating_mul(1_u32 << u32::try_from(exp).unwrap_or(0));
    delay.min(CAP)
}

/// A job to enqueue. Construct with [`NewJob::new`], refine with the builders.
#[derive(Debug, Clone)]
pub struct NewJob {
    pub kind: String,
    pub payload: serde_json::Value,
    pub priority: i16,
    pub delay: Option<Duration>,
    pub max_attempts: i32,
    pub dedupe_key: Option<String>,
}

impl NewJob {
    #[must_use]
    pub fn new(kind: impl Into<String>, payload: serde_json::Value) -> Self {
        Self {
            kind: kind.into(),
            payload,
            priority: 0,
            delay: None,
            max_attempts: 5,
            dedupe_key: None,
        }
    }

    #[must_use]
    pub const fn delayed(mut self, delay: Duration) -> Self {
        self.delay = Some(delay);
        self
    }

    #[must_use]
    pub const fn priority(mut self, priority: i16) -> Self {
        self.priority = priority;
        self
    }

    #[must_use]
    pub const fn max_attempts(mut self, max_attempts: i32) -> Self {
        self.max_attempts = max_attempts;
        self
    }

    /// At most one live (queued/running) job per key; duplicates are dropped.
    #[must_use]
    pub fn dedupe(mut self, key: impl Into<String>) -> Self {
        self.dedupe_key = Some(key.into());
        self
    }
}

/// A job handed to a worker. Must be resolved via [`succeed`] or [`fail`].
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ClaimedJob {
    pub id: JobId,
    pub kind: String,
    pub payload: serde_json::Value,
    pub attempts: i32,
    pub max_attempts: i32,
}

/// Insert a job. Returns `None` when a live job with the same `dedupe_key`
/// already exists. Pass `&mut *tx` to enqueue transactionally.
pub async fn enqueue<'e, E>(executor: E, job: &NewJob) -> Result<Option<JobId>>
where
    E: sqlx::PgExecutor<'e>,
{
    let result = sqlx::query_scalar::<_, JobId>(
        r"WITH ins AS (
              INSERT INTO jobs (kind, payload, priority, run_at, max_attempts, dedupe_key)
              VALUES ($1, $2, $3, now() + make_interval(secs => $4), $5, $6)
              RETURNING id, kind
          )
          SELECT id FROM ins, pg_notify($7, ins.kind) AS _n",
    )
    .bind(&job.kind)
    .bind(&job.payload)
    .bind(job.priority)
    .bind(job.delay.map_or(0.0, |d| d.as_secs_f64()))
    .bind(job.max_attempts)
    .bind(&job.dedupe_key)
    .bind(NOTIFY_CHANNEL)
    .fetch_one(executor)
    .await;

    match result {
        Ok(id) => Ok(Some(id)),
        Err(sqlx::Error::Database(db)) if db.is_unique_violation() => Ok(None),
        Err(err) => Err(err.into()),
    }
}

/// Atomically claim up to `batch` due jobs for `worker`. Increments `attempts`.
pub async fn claim<'e, E>(executor: E, worker: &str, batch: i64) -> Result<Vec<ClaimedJob>>
where
    E: sqlx::PgExecutor<'e>,
{
    let jobs = sqlx::query_as::<_, ClaimedJob>(
        r"UPDATE jobs
          SET status = 'running', locked_by = $1, locked_at = now(),
              heartbeat_at = now(), attempts = attempts + 1
          WHERE id IN (
              SELECT id FROM jobs
              WHERE status = 'queued' AND run_at <= now()
              ORDER BY priority DESC, run_at
              LIMIT $2
              FOR UPDATE SKIP LOCKED
          )
          RETURNING id, kind, payload, attempts, max_attempts",
    )
    .bind(worker)
    .bind(batch)
    .fetch_all(executor)
    .await?;
    Ok(jobs)
}

/// Refresh heartbeats for jobs this worker is still executing.
pub async fn heartbeat<'e, E>(executor: E, worker: &str, ids: &[JobId]) -> Result<()>
where
    E: sqlx::PgExecutor<'e>,
{
    let raw: Vec<Uuid> = ids.iter().map(|id| id.0).collect();
    sqlx::query(
        r"UPDATE jobs SET heartbeat_at = now()
          WHERE locked_by = $1 AND status = 'running' AND id = ANY($2)",
    )
    .bind(worker)
    .bind(&raw)
    .execute(executor)
    .await?;
    Ok(())
}

pub async fn succeed<'e, E>(executor: E, id: JobId) -> Result<()>
where
    E: sqlx::PgExecutor<'e>,
{
    sqlx::query(
        r"UPDATE jobs
          SET status = 'succeeded', locked_by = NULL, locked_at = NULL, heartbeat_at = NULL
          WHERE id = $1 AND status = 'running'",
    )
    .bind(id)
    .execute(executor)
    .await?;
    Ok(())
}

/// Record a failure: requeue with exponential backoff, or dead-letter once
/// `max_attempts` is exhausted.
pub async fn fail<'e, E>(executor: E, job: &ClaimedJob, error: &str) -> Result<()>
where
    E: sqlx::PgExecutor<'e>,
{
    if job.attempts >= job.max_attempts {
        sqlx::query(
            r"UPDATE jobs
              SET status = 'dead', last_error = $2,
                  locked_by = NULL, locked_at = NULL, heartbeat_at = NULL
              WHERE id = $1 AND status = 'running'",
        )
        .bind(job.id)
        .bind(error)
        .execute(executor)
        .await?;
    } else {
        sqlx::query(
            r"UPDATE jobs
              SET status = 'queued', last_error = $2,
                  run_at = now() + make_interval(secs => $3),
                  locked_by = NULL, locked_at = NULL, heartbeat_at = NULL
              WHERE id = $1 AND status = 'running'",
        )
        .bind(job.id)
        .bind(error)
        .bind(backoff_delay(job.attempts).as_secs_f64())
        .execute(executor)
        .await?;
    }
    Ok(())
}

/// Return stale `running` jobs (dead worker) to the queue, or dead-letter them
/// if attempts are exhausted. Returns how many jobs were recovered.
pub async fn reap<'e, E>(executor: E, stale_after: Duration) -> Result<u64>
where
    E: sqlx::PgExecutor<'e>,
{
    let result = sqlx::query(
        r"UPDATE jobs
          SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
              last_error = 'worker lost (reaped)',
              locked_by = NULL, locked_at = NULL, heartbeat_at = NULL
          WHERE status = 'running' AND heartbeat_at < now() - make_interval(secs => $1)",
    )
    .bind(stale_after.as_secs_f64())
    .execute(executor)
    .await?;
    Ok(result.rows_affected())
}

#[cfg(test)]
mod tests {
    use super::backoff_delay;
    use std::time::Duration;

    #[test]
    fn backoff_is_exponential_with_cap() {
        assert_eq!(backoff_delay(1), Duration::from_secs(5));
        assert_eq!(backoff_delay(2), Duration::from_secs(10));
        assert_eq!(backoff_delay(3), Duration::from_secs(20));
        assert_eq!(backoff_delay(10), Duration::from_mins(15));
        assert_eq!(backoff_delay(0), Duration::from_secs(5));
        assert_eq!(backoff_delay(i32::MAX), Duration::from_mins(15));
    }
}
