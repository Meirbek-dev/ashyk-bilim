//! `ai:execute_run` - executes one queued AI run (legacy
//! `worker/tasks/ai.py`); `ai:batch_poll` - polls the Message Batch of a
//! run deferred to the provider's batch API and re-runs it once it ended.
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

pub const BATCH_POLL_KIND: &str = ab_domain::ai::BATCH_POLL_JOB;

pub struct BatchPollHandler {
    ai: AiService,
}

impl BatchPollHandler {
    #[must_use]
    pub const fn new(ai: AiService) -> Self {
        Self { ai }
    }
}

impl JobHandler for BatchPollHandler {
    fn kind(&self) -> &'static str {
        BATCH_POLL_KIND
    }

    fn handle(&self, payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let ai = self.ai.clone();
        async move {
            let run_id: AiRunId = serde_json::from_value(payload["run_id"].clone())
                .map_err(|e| ab_core::Error::internal("ai batch payload", e))?;
            let polls = payload["polls"]
                .as_u64()
                .and_then(|n| u32::try_from(n).ok())
                .unwrap_or(0);
            ai.poll_batch(run_id, polls).await
        }
        .boxed()
    }
}
