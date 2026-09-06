//! `ai:execute_run` — executes one queued AI run (legacy
//! `worker/tasks/ai.py`).
//!
//! Enqueued by the `/queue` variants after the run row is committed. The
//! domain records application failures on the run itself and returns `Ok`,
//! so the job only retries on infrastructure errors (DB, queue).

use ab_core::Result;
use ab_core::id::AiRunId;
use ab_domain::ai::AiService;
use futures::FutureExt;
use futures::future::BoxFuture;

use crate::JobHandler;

pub const KIND: &str = ab_domain::ai::EXECUTE_RUN_JOB;

pub struct ExecuteRunHandler {
    ai: AiService,
}

impl ExecuteRunHandler {
    #[must_use]
    pub const fn new(ai: AiService) -> Self {
        Self { ai }
    }
}

impl JobHandler for ExecuteRunHandler {
    fn kind(&self) -> &'static str {
        KIND
    }

    fn handle(&self, payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let ai = self.ai.clone();
        async move {
            let run_id: AiRunId = serde_json::from_value(payload["run_id"].clone())
                .map_err(|e| ab_core::Error::internal("ai run payload", e))?;
            ai.execute_queued(run_id).await
        }
        .boxed()
    }
}
