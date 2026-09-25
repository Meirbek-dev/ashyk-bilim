//! `progress:staff-change` — a roster / RBAC write's re-projection that
//! failed inline (member lock busy past the wait; BUG-305). Retries with
//! backoff until the sweep lands; the projection is idempotent.

use ab_core::Result;
use ab_core::id::{CourseId, UserId};
use ab_domain::progress::ProgressProjector;
use futures::FutureExt;
use futures::future::BoxFuture;
use sqlx::PgPool;

use crate::JobHandler;

pub const KIND: &str = ab_domain::progress::projector::STAFF_CHANGE_JOB;

pub struct StaffChangeReprojector {
    pool: PgPool,
}

impl StaffChangeReprojector {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl JobHandler for StaffChangeReprojector {
    fn kind(&self) -> &'static str {
        KIND
    }

    fn handle(&self, payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let pool = self.pool.clone();
        async move {
            let user_id: UserId = serde_json::from_value(payload["user_id"].clone())
                .map_err(|e| ab_core::Error::internal("staff-change payload", e))?;
            let course_id: Option<CourseId> = serde_json::from_value(payload["course_id"].clone())
                .map_err(|e| ab_core::Error::internal("staff-change payload", e))?;
            ProgressProjector::new(pool)
                .reproject_staff_change(user_id, course_id)
                .await
        }
        .boxed()
    }
}
