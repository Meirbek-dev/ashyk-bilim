use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{Redirect, Response};
use uuid::Uuid;

use crate::dto::uploads::{
    CompleteMultipartRequest, CreateUploadRequest, CreatedUpload, FinalizedUpload, MultipartUpload,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, Path, ValidJson, idempotent};
use crate::state::AppState;

/// Start an upload: validates the purpose policy and returns a presigned PUT.
///
/// Requires `file:create:own`; `platform-*` purposes also need
/// `platform:update:platform`, `course-thumbnail`/`block-*` course write
/// access. Bytes go directly to storage, not this API.
#[utoipa::path(
    post,
    path = "/uploads",
    tag = "uploads",
    request_body = CreateUploadRequest,
    responses(
        (status = 200, description = "Presigned upload slot", body = CreatedUpload),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Policy violation (size/mime/purpose)", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_upload(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    body: axum::body::Bytes,
) -> ApiResult<Json<CreatedUpload>> {
    // UX-311: permission before the body.
    ab_domain::files::uploads::UploadsService::require_create(&actor)?;
    let request = ValidJson::<CreateUploadRequest>::parse(&body)?;
    let created = state
        .uploads
        .create(
            &actor,
            &request.purpose,
            &request.mime,
            request.size_bytes,
            request.multipart,
        )
        .await?;
    Ok(Json(CreatedUpload {
        id: created.id,
        key: created.key,
        put_url: created.put_url,
        multipart: (!created.part_urls.is_empty()).then_some(MultipartUpload {
            part_size_bytes: ab_domain::files::uploads::MULTIPART_PART_BYTES,
            part_urls: created.part_urls,
        }),
    }))
}

/// Assemble this owner's pending video parts. Retry-safe until finalized;
/// final size and MIME verification still happens at /finalize.
#[utoipa::path(post, path = "/uploads/{upload_id}/multipart", tag = "uploads",
    params(("upload_id" = Uuid, Path, description = "Upload id")),
    request_body = CompleteMultipartRequest,
    responses((status = 204, description = "Parts assembled"),
        (status = 403, description = "Not your upload", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "Intent expired or finalized", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "Invalid parts", body = Problem, content_type = "application/problem+json")))]
pub async fn complete_multipart_upload(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<Uuid>,
    ValidJson(request): ValidJson<CompleteMultipartRequest>,
) -> ApiResult<StatusCode> {
    state
        .uploads
        .complete_multipart(&actor, id, request.etags)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Abort the caller's pending multipart video; expired intents are reaped.
#[utoipa::path(delete, path = "/uploads/{upload_id}/multipart", tag = "uploads",
    params(("upload_id" = Uuid, Path, description = "Upload id")),
    responses((status = 204, description = "Multipart upload cancelled"),
        (status = 403, description = "Not your upload", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "Intent expired or finalized", body = Problem, content_type = "application/problem+json")))]
pub async fn abort_multipart_upload(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    state.uploads.abort_multipart(&actor, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Finalize after the PUT: verifies the object exists and is within policy.
/// With an `Idempotency-Key`, a retry replays the original 200 for 24h
/// instead of the "already finalized" 409.
#[utoipa::path(
    post,
    path = "/uploads/{upload_id}/finalize",
    tag = "uploads",
    params(
        ("upload_id" = Uuid, Path, description = "Upload id"),
        ("Idempotency-Key" = Option<String>, Header, description = "Client retry token (optional)"),
    ),
    responses(
        (status = 200, description = "Upload verified", body = FinalizedUpload),
        (status = 409, description = "No object received / already finalized", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn finalize_upload(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    // No body to fingerprint: the path is the whole request.
    idempotent(
        state.pool.clone(),
        actor.user_id,
        &format!("finalize:{id}"),
        &headers,
        &[],
        move || async move {
            let finalized = state.uploads.finalize(&actor, id).await?;
            Ok((
                StatusCode::OK,
                FinalizedUpload {
                    id: finalized.id,
                    key: finalized.key,
                    size_bytes: finalized.size_bytes,
                },
            ))
        },
    )
    .await
}

/// Redirect to a short-lived presigned download URL.
///
/// Raster images, PDF, audio, video and plain text open inline; every other
/// type downloads as `application/octet-stream`.
#[utoipa::path(
    get,
    path = "/uploads/{upload_id}/download",
    tag = "uploads",
    params(("upload_id" = Uuid, Path, description = "Upload id")),
    responses(
        (status = 303, description = "Redirect to the presigned URL"),
        (status = 404, description = "Unknown upload", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn download_upload(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<Uuid>,
) -> ApiResult<Redirect> {
    let url = state.uploads.download_url(&actor, id).await?;
    Ok(Redirect::to(&url))
}
