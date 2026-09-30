//! `assessments:publish-due` — flips scheduled assessments whose time has
//! come to published and brings their activities live. Schedule seeded at
//! worker boot (every minute; the legacy cron ran every two).

use ab_core::Result;
use futures::FutureExt;
use futures::future::BoxFuture;
use sqlx::PgPool;

use crate::JobHandler;

pub const KIND: &str = "assessments:publish-due";

pub struct AssessmentPublisher {
    pool: PgPool,
}

impl AssessmentPublisher {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl JobHandler for AssessmentPublisher {
    fn kind(&self) -> &'static str {
        KIND
    }

    fn handle(&self, _payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let pool = self.pool.clone();
        async move {
            let published = ab_domain::assessments::AssessmentsService::publish_due(&pool).await?;
            if published > 0 {
                tracing::info!(published, "auto-published scheduled assessments");
            }
            Ok(())
        }
        .boxed()
    }
}
