//! `grading:bulk-action` — executes a queued bulk gradebook action.
//!
//! Deadline extensions today. Enqueued in the same transaction as the
//! `bulk_actions` row; the row carries the outcome for the grader to poll.

use ab_core::Result;
use ab_core::id::BulkActionId;
use futures::FutureExt;
use futures::future::BoxFuture;
use sqlx::PgPool;

use crate::JobHandler;

pub const KIND: &str = ab_domain::grading::bulk::BULK_ACTION_JOB;

pub struct BulkActionRunner {
    pool: PgPool,
    events: Option<ab_domain::events::GradingEvents>,
}

impl BulkActionRunner {
    /// `events` is `None` when the worker runs without Redis.
    #[must_use]
    pub const fn new(pool: PgPool, events: Option<ab_domain::events::GradingEvents>) -> Self {
        Self { pool, events }
    }
}

impl JobHandler for BulkActionRunner {
    fn kind(&self) -> &'static str {
        KIND
    }

    fn handle(&self, payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let pool = self.pool.clone();
        let events = self.events.clone();
        async move {
            let id: BulkActionId = serde_json::from_value(payload["action_id"].clone())
                .map_err(|e| ab_core::Error::internal("bulk action payload", e))?;
            ab_domain::grading::GradingService::execute_bulk_action(&pool, events.as_ref(), id)
                .await
        }
        .boxed()
    }
}
