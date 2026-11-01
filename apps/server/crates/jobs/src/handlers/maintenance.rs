//! Housekeeping jobs.
//!
//! `maintenance:retention` (daily): operational logs past their window go.
//! Windows: `AB__RETENTION__*` (schema review item 24). Finished jobs,
//! sign-in audit rows, practice code-run output and finished AI runs' event
//! logs. See `ab_db::retention` for what is kept.
//!
//! `maintenance:reconcile` (weekly): the stored aggregates are re-derived
//! from their sources and fixed where they drifted (schema review items 15,
//! 16): every member's progress projection (the `backfill` command's pass)
//! and every gamification profile's totals from its journals. Changes are
//! logged; a steady non-zero count is a projector bug to look into.

use ab_core::Result;
use ab_core::config::RetentionConfig;
use futures::FutureExt;
use futures::future::BoxFuture;
use sqlx::PgPool;

use crate::JobHandler;

pub const RETENTION_KIND: &str = "maintenance:retention";

pub struct RetentionSweep {
    pool: PgPool,
    windows: RetentionConfig,
}

impl RetentionSweep {
    #[must_use]
    pub const fn new(pool: PgPool, windows: RetentionConfig) -> Self {
        Self { pool, windows }
    }
}

impl JobHandler for RetentionSweep {
    fn kind(&self) -> &'static str {
        RETENTION_KIND
    }

    fn handle(&self, _payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let pool = self.pool.clone();
        let windows = self.windows;
        async move {
            let swept = ab_db::retention::sweep(&pool, &windows).await?;
            tracing::info!(
                jobs = swept.jobs,
                auth_audit = swept.auth_audit,
                code_run_outputs = swept.code_run_outputs,
                ai_events = swept.ai_events,
                "retention swept"
            );
            Ok(())
        }
        .boxed()
    }
}

pub const RECONCILE_KIND: &str = "maintenance:reconcile";

pub struct Reconcile {
    pool: PgPool,
}

impl Reconcile {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl JobHandler for Reconcile {
    fn kind(&self) -> &'static str {
        RECONCILE_KIND
    }

    fn handle(&self, _payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let pool = self.pool.clone();
        async move {
            let profiles = ab_db::gamification::reconcile_profiles(&pool).await?;
            if !profiles.is_empty() {
                tracing::warn!(
                    ?profiles,
                    "gamification totals drifted from the journals; fixed"
                );
            }
            let progress = ab_domain::progress::ProgressProjector::new(pool)
                .backfill(None)
                .await?;
            tracing::info!(
                courses = progress.courses,
                learners = progress.learners,
                changed = progress.changed,
                gamification_fixed = profiles.len(),
                "reconciled"
            );
            Ok(())
        }
        .boxed()
    }
}
