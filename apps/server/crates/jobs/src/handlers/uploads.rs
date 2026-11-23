//! `uploads:reap` - scheduled cleanup of expired pending / unreferenced
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
            // Expired spreadsheet imports first: their files become reapable.
            let imports =
                ab_domain::assessments::imports::ImportsService::purge_expired(&pool).await?;
            if imports > 0 {
                tracing::info!(imports, "purged expired assessment imports");
            }
            let deleted = ab_domain::files::uploads::reap_expired(&pool, &storage).await?;
            if deleted > 0 {
                tracing::info!(deleted, "reaped expired uploads");
            }
            Ok(())
        }
        .boxed()
    }
}

/// `uploads:previews` - WebP previews of one picture (`ab_domain::files::previews`),
/// enqueued by finalize and by `ashyq admin image-previews`.
pub const PREVIEWS_KIND: &str = ab_domain::files::previews::PREVIEWS_JOB;

pub struct UploadPreviews {
    pool: PgPool,
    storage: Arc<StorageClient>,
}

impl UploadPreviews {
    #[must_use]
    pub const fn new(pool: PgPool, storage: Arc<StorageClient>) -> Self {
        Self { pool, storage }
    }
}

impl JobHandler for UploadPreviews {
    fn kind(&self) -> &'static str {
        PREVIEWS_KIND
    }

    fn handle(&self, payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let pool = self.pool.clone();
        let storage = Arc::clone(&self.storage);
        async move {
            let rendered = ab_domain::files::previews::render(&pool, &storage, payload).await?;
            tracing::debug!(?rendered, "image previews");
            Ok(())
        }
        .boxed()
    }
}
