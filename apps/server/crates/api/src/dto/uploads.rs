use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateUploadRequest {
    /// One of: avatar, course-thumbnail, block-image, block-pdf, block-video,
    /// file-submission.
    #[garde(length(min = 1, max = 64))]
    pub purpose: String,
    #[garde(length(min = 1, max = 255))]
    pub mime: String,
    #[garde(range(min = 1))]
    pub size_bytes: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CreatedUpload {
    pub id: Uuid,
    pub key: String,
    /// PUT the file bytes here (presigned; valid for ~15 minutes) with the
    /// declared `Content-Type` and `If-None-Match: *` — the URL writes the
    /// object once; a replay is a 412.
    pub put_url: String,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct FinalizedUpload {
    pub id: Uuid,
    pub key: String,
    pub size_bytes: i64,
}
