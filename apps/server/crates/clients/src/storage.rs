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
use hmac::{Hmac, KeyInit, Mac};
use object_store::aws::{AmazonS3, AmazonS3Builder};
use object_store::path::Path as ObjectPath;
use object_store::signer::Signer;
use object_store::{Attribute, GetOptions, ObjectStore, ObjectStoreExt};
use secrecy::{ExposeSecret, SecretString};
use sha2::{Digest, Sha256};

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
    /// Kept for the PUT presigner: `object_store` signs `host` only, and a
    /// browser upload must be pinned to its declared `Content-Type`.
    config: StorageConfig,
}

/// What a stored object looks like (finalize verification).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObjectHead {
    pub size: u64,
    pub content_type: Option<String>,
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
            config: config.clone(),
        })
    }

    fn bucket_name(&self, bucket: Bucket) -> &str {
        match bucket {
            Bucket::Public => &self.config.public_bucket,
            Bucket::Private => &self.config.private_bucket,
        }
    }

    fn store(&self, bucket: Bucket) -> &AmazonS3 {
        match bucket {
            Bucket::Public => &self.public,
            Bucket::Private => &self.private,
        }
    }

    /// Presigned PUT for direct browser upload, pinned to `content_type`:
    /// the header is part of the signature (`SignedHeaders=content-type;host`),
    /// so storage refuses a PUT that declares anything else.
    ///
    /// Hand-rolled SigV4 query signing (path-style, UNSIGNED-PAYLOAD):
    /// `object_store::Signer` cannot add headers to the signature.
    pub fn presign_put(
        &self,
        bucket: Bucket,
        key: &str,
        content_type: &str,
        expires_in: Duration,
    ) -> Result<String> {
        const ALGORITHM: &str = "AWS4-HMAC-SHA256";
        const REGION: &str = "us-east-1";
        let endpoint: http::Uri = self
            .config
            .endpoint
            .parse()
            .map_err(|e| Error::internal("parsing storage endpoint", e))?;
        let Some(host) = endpoint.authority().map(|a| a.as_str().to_owned()) else {
            return Err(Error::app(
                ErrorCode::Internal,
                "storage endpoint has no host",
            ));
        };
        let now = jiff::Timestamp::now();
        let amz_date = now.strftime("%Y%m%dT%H%M%SZ").to_string();
        let datestamp = now.strftime("%Y%m%d").to_string();
        let scope = format!("{datestamp}/{REGION}/s3/aws4_request");
        let path = format!("/{}/{key}", self.bucket_name(bucket));
        // Query parameters, already in canonical (sorted, encoded) order.
        let query = format!(
            "X-Amz-Algorithm={ALGORITHM}&X-Amz-Credential={}&X-Amz-Date={amz_date}\
             &X-Amz-Expires={}&X-Amz-SignedHeaders=content-type%3Bhost",
            aws_encode(&format!("{}/{scope}", self.config.access_key)),
            expires_in.as_secs(),
        );
        let canonical_request = format!(
            "PUT\n{path}\n{query}\ncontent-type:{content_type}\nhost:{host}\n\n\
             content-type;host\nUNSIGNED-PAYLOAD"
        );
        let string_to_sign = format!(
            "{ALGORITHM}\n{amz_date}\n{scope}\n{}",
            hex(&Sha256::digest(canonical_request.as_bytes()))
        );
        let mut signing_key = hmac_sha256(
            format!("AWS4{}", self.config.secret_key.expose_secret()).as_bytes(),
            datestamp.as_bytes(),
        )?;
        for part in [REGION, "s3", "aws4_request"] {
            signing_key = hmac_sha256(&signing_key, part.as_bytes())?;
        }
        let signature = hex(&hmac_sha256(&signing_key, string_to_sign.as_bytes())?);
        Ok(format!(
            "{}{path}?{query}&X-Amz-Signature={signature}",
            self.config.endpoint.trim_end_matches('/')
        ))
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

    /// Object size + stored content type if it exists (finalize
    /// verification). Goes through `get_opts(head)` because a plain `head`
    /// drops the response headers.
    pub async fn head(&self, bucket: Bucket, key: &str) -> Result<Option<ObjectHead>> {
        let options = GetOptions {
            head: true,
            ..GetOptions::default()
        };
        match self
            .store(bucket)
            .get_opts(&ObjectPath::from(key), options)
            .await
        {
            Ok(result) => Ok(Some(ObjectHead {
                size: result.meta.size,
                content_type: result
                    .attributes
                    .get(&Attribute::ContentType)
                    .map(|v| v.to_string()),
            })),
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

    /// Read an object for operational verification jobs.
    pub async fn get(&self, bucket: Bucket, key: &str) -> Result<Option<Vec<u8>>> {
        let result = match self.store(bucket).get(&ObjectPath::from(key)).await {
            Ok(result) => result,
            Err(object_store::Error::NotFound { .. }) => return Ok(None),
            Err(error) => return Err(Error::internal("object get", error)),
        };
        let bytes = result
            .bytes()
            .await
            .map_err(|error| Error::internal("reading object body", error))?;
        Ok(Some(bytes.to_vec()))
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

fn hmac_sha256(key: &[u8], data: &[u8]) -> Result<Vec<u8>> {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(key).map_err(|e| Error::internal("hmac key", e))?;
    mac.update(data);
    Ok(mac.finalize().into_bytes().to_vec())
}

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut out, b| {
            // Writing into a String is infallible.
            let _ = write!(out, "{b:02x}");
            out
        })
}

/// AWS query-string encoding: RFC 3986 unreserved characters stay.
fn aws_encode(value: &str) -> String {
    use std::fmt::Write;
    value
        .bytes()
        .fold(String::with_capacity(value.len()), |mut out, b| {
            if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
                out.push(char::from(b));
            } else {
                let _ = write!(out, "%{b:02X}");
            }
            out
        })
}
