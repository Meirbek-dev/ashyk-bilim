use ab_core::id::CollectionId;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;

use crate::dto::collections::{
    Collection, CollectionListQuery, CollectionPage, CreateCollectionRequest,
    UpdateCollectionRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, MaybeActor, ValidJson};
use crate::state::AppState;

/// Create a collection (requires `collection:create:platform`); every
/// attached course must be readable by the caller.
#[utoipa::path(
    post,
    path = "/collections",
    tag = "collections",
    request_body = CreateCollectionRequest,
    responses(
        (status = 201, description = "Created", body = Collection),
        (status = 403, description = "Missing permission", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_collection(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ValidJson(request): ValidJson<CreateCollectionRequest>,
) -> ApiResult<(StatusCode, Json<Collection>)> {
    let collection = state
        .collections
        .create(
            &actor,
            &request.name,
            request.description.as_deref().unwrap_or(""),
            request.public.unwrap_or(false),
            request.courses.unwrap_or_default(),
        )
        .await?;
    Ok((StatusCode::CREATED, Json(collection.into())))
}

/// Newest-first collection listing: public plus the caller's own.
#[utoipa::path(
    get,
    path = "/collections",
    tag = "collections",
    params(
        ("cursor" = Option<CollectionId>, Query, description = "next_cursor from the previous page"),
        ("limit" = Option<i64>, Query, description = "Page size, 1..=100 (default 20)"),
    ),
    responses((status = 200, description = "Page of collections", body = CollectionPage)),
)]
pub async fn list_collections(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Query(query): Query<CollectionListQuery>,
) -> ApiResult<Json<CollectionPage>> {
    let (collections, next_cursor) = state
        .collections
        .list(&actor, query.cursor, query.limit.unwrap_or(20))
        .await?;
    Ok(Json(CollectionPage {
        items: collections.into_iter().map(Into::into).collect(),
        next_cursor,
    }))
}

/// One collection with its member courses (404 when invisible).
#[utoipa::path(
    get,
    path = "/collections/{id}",
    tag = "collections",
    params(("id" = CollectionId, Path, description = "Collection id")),
    responses(
        (status = 200, description = "Collection", body = Collection),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_collection(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Path(id): Path<CollectionId>,
) -> ApiResult<Json<Collection>> {
    Ok(Json(state.collections.get(&actor, id).await?.into()))
}

/// Partial update; `courses` replaces the whole membership when present.
#[utoipa::path(
    patch,
    path = "/collections/{id}",
    tag = "collections",
    params(("id" = CollectionId, Path, description = "Collection id")),
    request_body = UpdateCollectionRequest,
    responses(
        (status = 200, description = "Updated", body = Collection),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_collection(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CollectionId>,
    ValidJson(request): ValidJson<UpdateCollectionRequest>,
) -> ApiResult<Json<Collection>> {
    let collection = state
        .collections
        .update(
            &actor,
            id,
            request.name.as_deref(),
            request.description.as_deref(),
            request.public,
            request.courses,
        )
        .await?;
    Ok(Json(collection.into()))
}

/// Delete a collection (membership rows cascade; courses stay).
#[utoipa::path(
    delete,
    path = "/collections/{id}",
    tag = "collections",
    params(("id" = CollectionId, Path, description = "Collection id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, description = "No delete access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_collection(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CollectionId>,
) -> ApiResult<StatusCode> {
    state.collections.delete(&actor, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
