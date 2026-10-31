//! `maintenance:retention` (daily): operational logs past their window go.
//!
//! Windows: `AB__RETENTION__*` (schema review item 24). Finished jobs,
//! sign-in audit rows, practice code-run output and finished AI runs' event
//! logs. See `ab_db::retention` for what is kept.

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
