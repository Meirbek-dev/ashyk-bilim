//! Object storage over the S3 API via `object_store` (ARCHITECTURE §11).
//! RustFS in compose today; R2/S3/MinIO later is pure config.
//!
//! Upload strategy (DECISIONS-worthy simplification, recorded in the plan):
//! single presigned PUT per object — course media tops out at hundreds of MB,
//! comfortably under the single-PUT limit, and file bytes never transit Axum.
//! Presigned multipart can layer in later without API changes.

use std::sync::Arc;
use std::time::Duration;

use ab_core::{Error, ErrorCode, Result};
use object_store::aws::{AmazonS3, AmazonS3Builder};
use object_store::path::Path as ObjectPath;
use object_store::signer::Signer;
use object_store::{ObjectStore, ObjectStoreExt};
use secrecy::{ExposeSecret, SecretString};

#[derive(Debug, Clone)]
pub struct StorageConfig {
    /// S3 endpoint origin, e.g. `http://rustfs:9000`.
    pub endpoint: String,
    pub access_key: String,
    pub secret_key: SecretString,
    pub public_bucket: String,
    pub private_bucket: String,
}

/// Which bucket an object lives in. `Public` objects are served through nginx
/// with immutable caching; `Private` objects only via short-lived presigned
/// GETs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Bucket {
    Public,
    Private,
}

pub struct StorageClient {
    public: Arc<AmazonS3>,
    private: Arc<AmazonS3>,
}

impl StorageClient {
    pub fn new(config: &StorageConfig) -> Result<Self> {
        let build = |bucket: &str| -> Result<AmazonS3> {
            AmazonS3Builder::new()
                .with_endpoint(config.endpoint.clone())
                .with_bucket_name(bucket)
                .with_access_key_id(config.access_key.clone())
                .with_secret_access_key(config.secret_key.expose_secret())
                .with_region("us-east-1")
                .with_allow_http(true)
                .with_virtual_hosted_style_request(false)
                .build()
                .map_err(|e| Error::internal("building s3 client", e))
        };
        Ok(Self {
            public: Arc::new(build(&config.public_bucket)?),
            private: Arc::new(build(&config.private_bucket)?),
        })
    }

    fn store(&self, bucket: Bucket) -> &AmazonS3 {
        match bucket {
            Bucket::Public => &self.public,
            Bucket::Private => &self.private,
        }
    }

    /// Presigned PUT for direct browser upload.
    pub async fn presign_put(
        &self,
        bucket: Bucket,
        key: &str,
        expires_in: Duration,
    ) -> Result<String> {
        let url = self
            .store(bucket)
            .signed_url(http::Method::PUT, &ObjectPath::from(key), expires_in)
            .await
            .map_err(|e| Error::internal("presigning put", e))?;
        Ok(url.into())
    }

    /// Presigned GET for private downloads.
    pub async fn presign_get(
        &self,
        bucket: Bucket,
        key: &str,
        expires_in: Duration,
    ) -> Result<String> {
        let url = self
            .store(bucket)
            .signed_url(http::Method::GET, &ObjectPath::from(key), expires_in)
            .await
            .map_err(|e| Error::internal("presigning get", e))?;
        Ok(url.into())
    }

    /// Object size if it exists (finalize verification).
    pub async fn head(&self, bucket: Bucket, key: &str) -> Result<Option<u64>> {
        match self.store(bucket).head(&ObjectPath::from(key)).await {
            Ok(meta) => Ok(Some(meta.size)),
            Err(object_store::Error::NotFound { .. }) => Ok(None),
            Err(e) => Err(Error::internal("object head", e)),
        }
    }

    /// Server-side write (small internal objects: avatars, exports).
    pub async fn put(&self, bucket: Bucket, key: &str, bytes: Vec<u8>) -> Result<()> {
        self.store(bucket)
            .put(&ObjectPath::from(key), bytes.into())
            .await
            .map_err(|e| Error::internal("object put", e))?;
        Ok(())
    }

    pub async fn delete(&self, bucket: Bucket, key: &str) -> Result<()> {
        match self.store(bucket).delete(&ObjectPath::from(key)).await {
            Ok(()) | Err(object_store::Error::NotFound { .. }) => Ok(()),
            Err(e) => Err(Error::internal("object delete", e)),
        }
    }

    /// Readiness probe: list one key in the public bucket.
    pub async fn health_check(&self) -> Result<()> {
        use futures::StreamExt;
        let mut stream = self.public.list(None);
        match stream.next().await {
            None | Some(Ok(_)) => Ok(()),
            Some(Err(e)) => Err(Error::app(
                ErrorCode::ServiceUnavailable,
                format!("object storage unreachable: {e}"),
            )),
        }
    }
}
