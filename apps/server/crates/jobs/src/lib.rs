//! `ab-jobs` — job handlers and the worker runtime.
//!
//! Slice 0.8 delivers the Postgres queue (`ab-db::queue`) and the real worker
//! loop: claim batches (`FOR UPDATE SKIP LOCKED`), LISTEN/NOTIFY wakeups,
//! heartbeats, backoff, dead-lettering, and the cron leader (advisory lock).
//! Until then this is a graceful-shutdown-correct shell so `ashyq worker` runs.

use tokio_util::sync::CancellationToken;

/// Run the worker until cancelled.
pub async fn run(cancel: CancellationToken) {
    tracing::info!("worker started (queue arrives with slice 0.8 — idling)");
    cancel.cancelled().await;
    tracing::info!("worker shut down cleanly");
}
