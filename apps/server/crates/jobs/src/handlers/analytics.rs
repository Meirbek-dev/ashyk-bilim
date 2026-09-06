//! `analytics:rollup` — rebuilds today's daily rollup tables and learner
//! risk snapshots (legacy `refresh_teacher_analytics_rollups`, which no
//! scheduler ever invoked). Schedule seeded at worker boot every six hours;
//! the run is idempotent (the day's rows are replaced in one transaction),
//! so the last run of the day is the nightly snapshot dashboards compare
//! against. `ashyq admin analytics-rollup --from --to` backfills a range.

use ab_core::Result;
use futures::FutureExt;
use futures::future::BoxFuture;
use sqlx::PgPool;

use crate::JobHandler;

pub const KIND: &str = "analytics:rollup";

pub struct AnalyticsRollup {
    pool: PgPool,
}

impl AnalyticsRollup {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl JobHandler for AnalyticsRollup {
    fn kind(&self) -> &'static str {
        KIND
    }

    /// Optional payload `{ "date": "YYYY-MM-DD" }`; defaults to today (UTC).
    fn handle(&self, payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let pool = self.pool.clone();
        let date = payload
            .get("date")
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned);
        async move {
            let counts = ab_domain::analytics::AnalyticsService::new(pool)
                .run_rollup(date.as_deref())
                .await?;
            tracing::info!(
                courses = counts.course_rows,
                engagement = counts.engagement_rows,
                learners = counts.progress_rows,
                risk = counts.risk_rows,
                assessments = counts.assessment_rows,
                teachers = counts.teacher_rows,
                "analytics rollup written"
            );
            Ok(())
        }
        .boxed()
    }
}
