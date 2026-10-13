use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateUploadRequest {
    /// One of: avatar, course-thumbnail, block-image, block-pdf, block-video,
    /// file-submission.
    #[garde(length(min = 1, max = 64))]
    #[schema(value_type = crate::dto::enums::UploadPurpose)]
    pub purpose: String,
    #[garde(length(min = 1, max = 255))]
    #[schema(min_length = 1, max_length = 255)]
    pub mime: String,
    #[garde(range(min = 1))]
    #[schema(minimum = 1)]
    pub size_bytes: i64,
    /// Videos may use 32 MiB parts to fit the outer proxy's request limit.
    #[serde(default)]
    #[garde(skip)]
    pub multipart: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CreatedUpload {
    pub id: Uuid,
    pub key: String,
    /// PUT the file bytes here (presigned; valid for ~15 minutes) with the
    /// declared `Content-Type` and `If-None-Match: *` - the URL writes the
    /// object once; a replay is a 412.
    pub put_url: String,
    /// Present for a multipart intent. PUT each slice in order, without
    /// If-None-Match, then complete with the returned ETags before finalize.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub multipart: Option<MultipartUpload>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct MultipartUpload {
    pub part_size_bytes: i64,
    /// Signed URLs valid for the intent's 12 hour claim window.
    pub part_urls: Vec<String>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CompleteMultipartRequest {
    /// ETag returned by each storage PUT, ordered by part number.
    #[garde(length(min = 1, max = 64))]
    #[schema(min_items = 1, max_items = 64)]
    pub etags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct FinalizedUpload {
    pub id: Uuid,
    pub key: String,
    pub size_bytes: i64,
}
