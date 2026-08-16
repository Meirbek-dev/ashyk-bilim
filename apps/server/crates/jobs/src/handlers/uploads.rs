//! `uploads:reap` — scheduled cleanup of expired pending / unreferenced
//! uploads (rows + objects). Schedule seeded at worker boot (6h interval).

use std::sync::Arc;

use ab_clients::storage::StorageClient;
use ab_core::Result;
use futures::FutureExt;
use futures::future::BoxFuture;
use sqlx::PgPool;

use crate::JobHandler;

pub const KIND: &str = "uploads:reap";

pub struct UploadsReaper {
    pool: PgPool,
    storage: Arc<StorageClient>,
}

impl UploadsReaper {
    #[must_use]
    pub const fn new(pool: PgPool, storage: Arc<StorageClient>) -> Self {
        Self { pool, storage }
    }
}

impl JobHandler for UploadsReaper {
    fn kind(&self) -> &'static str {
        KIND
    }

    fn handle(&self, _payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let pool = self.pool.clone();
        let storage = Arc::clone(&self.storage);
        async move {
            let deleted = ab_domain::files::uploads::reap_expired(&pool, &storage).await?;
            if deleted > 0 {
                tracing::info!(deleted, "reaped expired uploads");
            }
            Ok(())
        }
        .boxed()
    }
}
