use ab_core::Error;
use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::Redirect;
use uuid::Uuid;

use crate::dto::uploads::{CreateUploadRequest, CreatedUpload, FinalizedUpload};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, Path, ValidJson, idempotency_key};
use crate::state::AppState;

/// Start an upload: validates the purpose policy and returns a presigned PUT
/// (requires `file:create:own`). Bytes go directly to storage, not this API.
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
    ValidJson(request): ValidJson<CreateUploadRequest>,
) -> ApiResult<Json<CreatedUpload>> {
    let created = state
        .uploads
        .create(&actor, &request.purpose, &request.mime, request.size_bytes)
        .await?;
    Ok(Json(CreatedUpload {
        id: created.id,
        key: created.key,
        put_url: created.put_url,
    }))
}

/// Finalize after the PUT: verifies the object exists and is within policy.
/// With an `Idempotency-Key`, a retry replays the original 200 for 24h
/// instead of the "already finalized" 409.
#[utoipa::path(
    post,
    path = "/uploads/{id}/finalize",
    tag = "uploads",
    params(
        ("id" = Uuid, Path, description = "Upload id"),
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
) -> ApiResult<Json<FinalizedUpload>> {
    let key = idempotency_key(&headers)?.map(|k| format!("finalize:{id}:{k}"));
    if let Some(key) = &key
        && let Some(stored) =
            ab_db::submissions::get_idempotent(&state.pool, actor.user_id, key).await?
    {
        let dto: FinalizedUpload = serde_json::from_value(stored.response)
            .map_err(|err| Error::internal("replay finalized upload", err))?;
        return Ok(Json(dto));
    }
    let finalized = state.uploads.finalize(&actor, id).await?;
    let dto = FinalizedUpload {
        id: finalized.id,
        key: finalized.key,
        size_bytes: finalized.size_bytes,
    };
    if let Some(key) = &key {
        // No body to fingerprint: the path is the whole request.
        let value = serde_json::to_value(&dto)
            .map_err(|err| Error::internal("serialize finalized upload", err))?;
        ab_db::submissions::store_idempotent(&state.pool, actor.user_id, key, "", 200, &value)
            .await?;
    }
    Ok(Json(dto))
}

/// Redirect to a short-lived presigned download URL.
#[utoipa::path(
    get,
    path = "/uploads/{id}/download",
    tag = "uploads",
    params(("id" = Uuid, Path, description = "Upload id")),
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
