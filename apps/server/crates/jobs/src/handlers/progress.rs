//! `progress:*` — post-commit re-projections that did not finish inline.
//!
//! A member lock was busy past the short inline wait (BUG-305/310, UX-209):
//! `progress:staff-change` (roster / RBAC) and `progress:course-change`
//! (the course's published set), `progress:lateness` (a policy or override
//! write's lateness settle, BUG-312). Retries with backoff until it lands;
//! the projection is idempotent.

use ab_core::Result;
use ab_domain::progress::ProgressProjector;
use ab_domain::progress::projector::{COURSE_CHANGE_JOB, LATENESS_JOB, STAFF_CHANGE_JOB};
use futures::FutureExt;
use futures::future::BoxFuture;
use sqlx::PgPool;

use crate::JobHandler;

pub struct ProgressJob {
    pool: PgPool,
    kind: &'static str,
}

impl ProgressJob {
    #[must_use]
    pub const fn staff_change(pool: PgPool) -> Self {
        Self {
            pool,
            kind: STAFF_CHANGE_JOB,
        }
    }

    #[must_use]
    pub const fn course_change(pool: PgPool) -> Self {
        Self {
            pool,
            kind: COURSE_CHANGE_JOB,
        }
    }

    #[must_use]
    pub const fn lateness(pool: PgPool) -> Self {
        Self {
            pool,
            kind: LATENESS_JOB,
        }
    }
}

impl JobHandler for ProgressJob {
    fn kind(&self) -> &'static str {
        self.kind
    }

    fn handle(&self, payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let (pool, kind) = (self.pool.clone(), self.kind);
        async move { ProgressProjector::new(pool).run_job(kind, &payload).await }.boxed()
    }
}
