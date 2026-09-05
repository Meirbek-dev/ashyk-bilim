//! Submission housekeeping on the interval scheduler:
//!
//! - `submissions:auto-submit` (every minute): timed drafts past their
//!   deadline are submitted with `auto_submit_reason = time_expired`;
//!   failures back off per row (120s · 2ⁿ, five tries) so one poisoned
//!   draft never starves the rest. Code challenges run their final tests
//!   through the worker's own Judge0 client; with the runner down they go
//!   to manual review rather than waiting.
//! - `submissions:sweep-idempotency` (hourly): `Idempotency-Key` replays
//!   older than 24h are dropped.

use ab_core::Result;
use ab_domain::code::CodeRunner;
use futures::FutureExt;
use futures::future::BoxFuture;
use sqlx::PgPool;

use crate::JobHandler;

pub const AUTO_SUBMIT_KIND: &str = "submissions:auto-submit";
pub const SWEEP_IDEMPOTENCY_KIND: &str = "submissions:sweep-idempotency";

/// Drafts handled per tick; the next tick picks up the rest.
const AUTO_SUBMIT_BATCH: i64 = 200;
const IDEMPOTENCY_TTL_SECS: f64 = 24.0 * 3600.0;

pub struct AutoSubmitter {
    runner: CodeRunner,
}

impl AutoSubmitter {
    #[must_use]
    pub const fn new(runner: CodeRunner) -> Self {
        Self { runner }
    }
}

impl JobHandler for AutoSubmitter {
    fn kind(&self) -> &'static str {
        AUTO_SUBMIT_KIND
    }

    fn handle(&self, _payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let runner = self.runner.clone();
        async move {
            let submitted = ab_domain::grading::SubmissionsService::sweep_expired_drafts(
                &runner,
                AUTO_SUBMIT_BATCH,
            )
            .await?;
            if submitted > 0 {
                tracing::info!(submitted, "auto-submitted expired drafts");
            }
            Ok(())
        }
        .boxed()
    }
}

pub struct IdempotencySweeper {
    pool: PgPool,
}

impl IdempotencySweeper {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl JobHandler for IdempotencySweeper {
    fn kind(&self) -> &'static str {
        SWEEP_IDEMPOTENCY_KIND
    }

    fn handle(&self, _payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let pool = self.pool.clone();
        async move {
            let deleted =
                ab_db::submissions::sweep_idempotency(&pool, IDEMPOTENCY_TTL_SECS).await?;
            if deleted > 0 {
                tracing::info!(deleted, "swept expired idempotency keys");
            }
            Ok(())
        }
        .boxed()
    }
}
