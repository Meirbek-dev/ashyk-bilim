use ab_core::id::CollectionId;
use ab_domain::catalog::collections::CollectionChanges;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};

use crate::dto::collections::{
    Collection, CollectionListQuery, CollectionPage, CreateCollectionRequest,
    UpdateCollectionRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, MaybeActor, Path, Query, ValidJson, idempotent};
use crate::routes::curriculum::if_match;
use crate::state::AppState;

/// Create a collection (requires `collection:create:platform`); every
/// attached course must be readable by the caller. Honours
/// `Idempotency-Key` (a retry replays the 201 instead of a second row).
#[utoipa::path(
    post,
    path = "/collections",
    tag = "collections",
    params(("Idempotency-Key" = Option<String>, Header, description = "Retry-safe replay key")),
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
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    ab_domain::catalog::CollectionsService::require_create(&actor)?;
    let request = ValidJson::<CreateCollectionRequest>::parse(&body)?;
    idempotent(
        state.pool.clone(),
        actor.user_id,
        "collection",
        &headers,
        &body,
        move || async move {
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
            Ok((
                StatusCode::CREATED,
                Collection::for_actor(collection, &actor),
            ))
        },
    )
    .await
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
        items: collections
            .into_iter()
            .map(|c| Collection::for_actor(c, &actor))
            .collect(),
        next_cursor,
    }))
}

/// One collection with its member courses (404 when invisible).
#[utoipa::path(
    get,
    path = "/collections/{collection_id}",
    tag = "collections",
    params(("collection_id" = CollectionId, Path, description = "Collection id")),
    responses(
        (status = 200, description = "Collection", body = Collection,
         headers(("ETag" = String, description = "Quoted version"))),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_collection(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Path(id): Path<CollectionId>,
) -> ApiResult<Response> {
    Ok(with_etag(Collection::for_actor(
        state.collections.get(&actor, id).await?,
        &actor,
    )))
}

/// The collection JSON with an `ETag` carrying its version (the `If-Match`
/// of its update and delete).
fn with_etag(collection: Collection) -> Response {
    let etag = HeaderValue::from_str(&format!("\"{}\"", collection.version))
        .unwrap_or_else(|_| HeaderValue::from_static("\"0\""));
    ([(header::ETAG, etag)], Json(collection)).into_response()
}

/// Partial update; `courses` replaces the whole membership when present.
#[utoipa::path(
    patch,
    path = "/collections/{collection_id}",
    tag = "collections",
    params(
        ("collection_id" = CollectionId, Path, description = "Collection id"),
        ("If-Match" = Option<i32>, Header, description = "Current `version`; stale → 412"),
    ),
    request_body = UpdateCollectionRequest,
    responses(
        (status = 200, description = "Updated", body = Collection,
         headers(("ETag" = String, description = "Quoted new version"))),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown, inaccessible, or an attached course is unreadable", body = Problem,
         content_type = "application/problem+json"),
        (status = 412, description = "Stale version", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_collection(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CollectionId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    state.collections.require_updatable(&actor, id).await?;
    let request = ValidJson::<UpdateCollectionRequest>::parse(&body)?;
    let expected_version = if_match(&headers)?;
    let collection = state
        .collections
        .update(
            &actor,
            id,
            CollectionChanges {
                name: request.name.as_deref(),
                description: request.description.as_deref(),
                public: request.public,
                course_ids: request.courses,
                expected_version,
            },
        )
        .await?;
    Ok(with_etag(Collection::for_actor(collection, &actor)))
}

/// Delete a collection (membership rows cascade; courses stay).
#[utoipa::path(
    delete,
    path = "/collections/{collection_id}",
    tag = "collections",
    params(
        ("collection_id" = CollectionId, Path, description = "Collection id"),
        ("If-Match" = Option<i32>, Header, description = "Current `version`; stale → 412"),
    ),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, description = "No delete access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
        (status = 412, description = "Stale version", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_collection(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CollectionId>,
    headers: HeaderMap,
) -> ApiResult<StatusCode> {
    let expected_version = if_match(&headers)?;
    state
        .collections
        .delete(&actor, id, expected_version)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
