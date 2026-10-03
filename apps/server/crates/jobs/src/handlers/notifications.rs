//! Notification housekeeping on the interval scheduler (S-07):
//!
//! - `notifications:deadline-reminders` (every 15 minutes): learners with
//!   unsubmitted work due within a day get one `deadline_approaching`
//!   notification per (activity, due date) - idempotent, so overlapping
//!   ticks and restarts never remind twice; an extension reminds again.
//! - `notifications:prune` (daily): rows older than 90 days are deleted.

use ab_core::Result;
use futures::FutureExt;
use futures::future::BoxFuture;
use sqlx::PgPool;

use crate::JobHandler;

pub const REMIND_KIND: &str = "notifications:deadline-reminders";
pub const PRUNE_KIND: &str = "notifications:prune";

pub struct DeadlineReminders {
    pool: PgPool,
}

impl DeadlineReminders {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl JobHandler for DeadlineReminders {
    fn kind(&self) -> &'static str {
        REMIND_KIND
    }

    fn handle(&self, _payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let pool = self.pool.clone();
        async move {
            let due = ab_domain::progress::agenda::remind_deadlines(&pool).await?;
            if due > 0 {
                tracing::info!(due, "deadline reminders considered");
            }
            Ok(())
        }
        .boxed()
    }
}

pub struct NotificationPruner {
    pool: PgPool,
}

impl NotificationPruner {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl JobHandler for NotificationPruner {
    fn kind(&self) -> &'static str {
        PRUNE_KIND
    }

    fn handle(&self, _payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let pool = self.pool.clone();
        async move {
            let deleted =
                ab_db::notifications::prune(&pool, ab_domain::notifications::RETENTION_DAYS)
                    .await?;
            if deleted > 0 {
                tracing::info!(deleted, "pruned old notifications");
            }
            Ok(())
        }
        .boxed()
    }
}
