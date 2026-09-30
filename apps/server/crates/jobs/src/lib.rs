//! `ab-jobs` — the worker runtime over `ab_db::queue`.
//!
//! A [`Worker`] holds a registry of [`JobHandler`]s and drives the loop:
//! claim (`SKIP LOCKED`) → execute bounded-concurrently → resolve
//! (succeed / fail-with-backoff / dead-letter). Wakeups come from Postgres
//! `LISTEN jobs_new` with an interval poll as the safety net. Heartbeats keep
//! claims fresh; a reaper tick recovers jobs from dead workers. Cancellation
//! drains in-flight jobs before returning (compose `stop_grace_period`).
//!
//! Remaining for slice 0.8: the cron leader (job_schedules ticker behind a
//! Postgres advisory lock).

pub mod handlers;

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use ab_core::id::JobId;
use ab_core::{Error, Result};
use ab_db::queue::{self, ClaimedJob, NOTIFY_CHANNEL};
use futures::future::BoxFuture;
use sqlx::PgPool;
use sqlx::postgres::PgListener;
use tokio_util::sync::CancellationToken;

/// A typed job handler. Implementations live in `ab-jobs::handlers` (one
/// module per domain) and are registered in [`Worker::register`].
pub trait JobHandler: Send + Sync + 'static {
    /// The queue `kind` this handler consumes, e.g. `"email:send"`.
    fn kind(&self) -> &'static str;
    /// Execute one job. An `Err` triggers retry-with-backoff until the job's
    /// `max_attempts`, then dead-letters.
    fn handle(&self, payload: serde_json::Value) -> BoxFuture<'static, Result<()>>;
}

#[derive(Debug, Clone)]
pub struct WorkerConfig {
    /// Max jobs executing concurrently.
    pub concurrency: usize,
    /// Fallback poll when no NOTIFY arrives.
    pub poll_interval: Duration,
    pub heartbeat_interval: Duration,
    /// A running job whose heartbeat is older than this is considered lost.
    pub reap_after: Duration,
    pub reap_interval: Duration,
    /// How often to check `job_schedules` for due recurring jobs.
    pub scheduler_interval: Duration,
}

impl Default for WorkerConfig {
    fn default() -> Self {
        Self {
            concurrency: 8,
            poll_interval: Duration::from_secs(1),
            heartbeat_interval: Duration::from_secs(15),
            reap_after: Duration::from_mins(1),
            reap_interval: Duration::from_secs(30),
            scheduler_interval: Duration::from_secs(5),
        }
    }
}

pub struct Worker {
    pool: PgPool,
    id: String,
    config: WorkerConfig,
    handlers: HashMap<&'static str, Arc<dyn JobHandler>>,
}

impl Worker {
    #[must_use]
    pub fn new(pool: PgPool, config: WorkerConfig) -> Self {
        Self {
            pool,
            id: format!("worker-{}", uuid::Uuid::now_v7()),
            config,
            handlers: HashMap::new(),
        }
    }

    /// Register a handler. Registering two handlers for one kind is a wiring
    /// bug and fails loudly at boot.
    pub fn register(mut self, handler: impl JobHandler) -> Result<Self> {
        let kind = handler.kind();
        if self.handlers.insert(kind, Arc::new(handler)).is_some() {
            return Err(Error::config(format!(
                "duplicate job handler registered for kind '{kind}'"
            )));
        }
        Ok(self)
    }

    /// Kinds with a registered handler (used by the registry drift test).
    #[must_use]
    pub fn registered_kinds(&self) -> Vec<&'static str> {
        self.handlers.keys().copied().collect()
    }

    /// Run until cancelled, then drain in-flight jobs.
    pub async fn run(self, cancel: CancellationToken) -> Result<()> {
        let mut listener = PgListener::connect_with(&self.pool).await?;
        listener.listen(NOTIFY_CHANNEL).await?;

        let semaphore = Arc::new(tokio::sync::Semaphore::new(self.config.concurrency));
        let mut tasks = tokio::task::JoinSet::new();
        // Heartbeats cover exactly the jobs with a live task: a task that
        // ended without resolving its row (completion UPDATE failed, panic)
        // stops being renewed, so the reaper recovers it (BUG-341).
        let mut running: HashMap<tokio::task::Id, JobId> = HashMap::new();
        let mut poll = tokio::time::interval(self.config.poll_interval);
        let mut heartbeat = tokio::time::interval(self.config.heartbeat_interval);
        let mut reaper = tokio::time::interval(self.config.reap_interval);
        let mut scheduler = tokio::time::interval(self.config.scheduler_interval);
        poll.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        tracing::info!(worker = %self.id, kinds = ?self.registered_kinds(), "worker started");

        loop {
            self.claim_available(&semaphore, &mut tasks, &mut running)
                .await;

            tokio::select! {
                () = cancel.cancelled() => break,
                _ = poll.tick() => {},
                notification = listener.recv() => {
                    if let Err(err) = notification {
                        // PgListener reconnects internally; the poll tick is
                        // the safety net while it does.
                        tracing::warn!(%err, "job listener error; relying on poll");
                    }
                },
                _ = heartbeat.tick() => {
                    let ids: Vec<JobId> = running.values().copied().collect();
                    if !ids.is_empty()
                        && let Err(err) = queue::heartbeat(&self.pool, &self.id, &ids).await
                    {
                        tracing::warn!(%err, "heartbeat failed");
                    }
                },
                _ = reaper.tick() => {
                    match queue::reap(&self.pool, self.config.reap_after).await {
                        Ok(0) => {},
                        Ok(n) => tracing::warn!(recovered = n, "reaped jobs from lost workers"),
                        Err(err) => tracing::warn!(%err, "reaper failed"),
                    }
                },
                _ = scheduler.tick() => {
                    match ab_db::schedule::tick(&self.pool).await {
                        Ok(0) => {},
                        Ok(n) => tracing::debug!(enqueued = n, "scheduler enqueued due jobs"),
                        Err(err) => tracing::warn!(%err, "scheduler tick failed"),
                    }
                },
                Some(joined) = tasks.join_next_with_id(), if !tasks.is_empty() => {
                    finished(&mut running, joined);
                },
            }
        }

        tracing::info!(in_flight = tasks.len(), "worker draining");
        while let Some(joined) = tasks.join_next_with_id().await {
            finished(&mut running, joined);
        }
        tracing::info!("worker drained");
        Ok(())
    }

    /// Claim up to the free concurrency slots and spawn executions.
    async fn claim_available(
        &self,
        semaphore: &Arc<tokio::sync::Semaphore>,
        tasks: &mut tokio::task::JoinSet<()>,
        running: &mut HashMap<tokio::task::Id, JobId>,
    ) {
        let free = semaphore.available_permits();
        if free == 0 {
            return;
        }
        let batch = i64::try_from(free).unwrap_or(i64::MAX);
        let jobs = match queue::claim(&self.pool, &self.id, batch).await {
            Ok(jobs) => jobs,
            Err(err) => {
                tracing::warn!(%err, "claim failed; will retry on next tick");
                return;
            }
        };
        for job in jobs {
            // Permits are free by construction (claim is bounded by them), so
            // this acquire never blocks meaningfully.
            let Ok(permit) = semaphore.clone().acquire_owned().await else {
                return; // semaphore closed — shutting down
            };
            let handler = self.handlers.get(job.kind.as_str()).cloned();
            let pool = self.pool.clone();
            let job_id = job.id;
            let task = tasks.spawn(async move {
                let _permit = permit;
                execute(&pool, handler, job).await;
            });
            running.insert(task.id(), job_id);
        }
    }
}

/// A job task ended: stop heartbeating its job; a panic is reported with the
/// job's id (the reaper retries or dead-letters it once its heartbeat is stale).
fn finished(
    running: &mut HashMap<tokio::task::Id, JobId>,
    joined: std::result::Result<(tokio::task::Id, ()), tokio::task::JoinError>,
) {
    let task = joined
        .as_ref()
        .map_or_else(tokio::task::JoinError::id, |(id, ())| *id);
    let job = running.remove(&task);
    if let Err(err) = joined {
        tracing::error!(%err, job = ?job, "job task panicked or was aborted");
    }
}

/// Execute one claimed job and resolve its status. A handler panic or a
/// failed resolution leaves the row `running`: this task ending stops its
/// heartbeat, and the reaper recovers the job.
async fn execute(pool: &PgPool, handler: Option<Arc<dyn JobHandler>>, job: ClaimedJob) {
    let span = tracing::info_span!("job", id = %job.id, kind = %job.kind, attempt = job.attempts);
    let _guard = span.enter();

    let Some(handler) = handler else {
        tracing::error!("no handler registered — dead-lettering");
        let resolved = queue::mark_dead(pool, &job, "no handler registered for kind").await;
        log_resolution(resolved, "dead-letter");
        return;
    };

    let outcome = handler.handle(job.payload.clone()).await;
    match outcome {
        Ok(()) => log_resolution(queue::succeed(pool, &job).await, "succeed"),
        Err(job_err) => {
            tracing::warn!(error = %job_err, "job failed");
            log_resolution(queue::fail(pool, &job, &job_err.to_string()).await, "fail");
        }
    }
}

/// `Ok(false)`: our claim was reaped (and maybe re-claimed) while we ran —
/// the late result is dropped, never applied to the newer claim (BUG-342).
fn log_resolution(resolved: Result<bool>, action: &str) {
    match resolved {
        Ok(true) => {}
        Ok(false) => tracing::warn!(action, "job lease lost before resolution; result dropped"),
        Err(err) => tracing::error!(%err, action, "failed to resolve job"),
    }
}
