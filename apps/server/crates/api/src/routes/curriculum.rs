use ab_core::id::{ActivityId, BlockId, ChapterId, CourseId};
use ab_core::{Error, FieldError};
use ab_domain::catalog::curriculum::ActivityChanges;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};

use crate::detach::detached;
use crate::dto::curriculum::{
    Activity, ActivityDetail, Block, Chapter, CreateActivityRequest, CreateBlockRequest,
    CreateChapterRequest, Curriculum, MoveActivityRequest, MoveChapterRequest,
    UpdateActivityRequest, UpdateChapterRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, MaybeActor, Path, ValidJson};
use crate::state::AppState;

/// `If-Match: "<version>"` → version; absent → `None`; malformed → 422.
pub(crate) fn if_match(headers: &HeaderMap) -> ApiResult<Option<i32>> {
    let Some(raw) = headers.get(header::IF_MATCH) else {
        return Ok(None);
    };
    raw.to_str()
        .ok()
        .and_then(|s| s.trim().trim_matches('"').parse::<i32>().ok())
        .map(Some)
        .ok_or_else(|| {
            Error::validation(vec![FieldError {
                field: "If-Match".into(),
                code: "invalid".into(),
                message: "If-Match must carry the version as an integer".into(),
            }])
            .into()
        })
}

/// The activity JSON with an `ETag` carrying its version, so the editor can
/// echo it as `If-Match` without reading the body.
fn with_etag(body: ActivityDetail) -> Response {
    let etag = HeaderValue::from_str(&format!("\"{}\"", body.activity.version))
        .unwrap_or_else(|_| HeaderValue::from_static("\"0\""));
    let mut response = Json(body).into_response();
    response.headers_mut().insert(header::ETAG, etag);
    response
}

/// Chapters with nested activities, in course order. Unpublished
/// activities are listed for course editors only.
#[utoipa::path(
    get,
    path = "/courses/{id}/curriculum",
    tag = "courses",
    params(("id" = CourseId, Path, description = "Course id")),
    responses(
        (status = 200, description = "Ordered chapters + activities", body = Curriculum),
        (status = 404, description = "Unknown or inaccessible course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_curriculum(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<Curriculum>> {
    let chapters = state.curriculum.curriculum(&actor, id).await?;
    Ok(Json(Curriculum {
        chapters: chapters.into_iter().map(Into::into).collect(),
    }))
}

/// Append a chapter to a course (course write access).
#[utoipa::path(
    post,
    path = "/courses/{id}/chapters",
    tag = "courses",
    params(("id" = CourseId, Path, description = "Course id")),
    request_body = CreateChapterRequest,
    responses(
        (status = 201, description = "Created (appended last)", body = Chapter),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_chapter(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    ValidJson(request): ValidJson<CreateChapterRequest>,
) -> ApiResult<(StatusCode, Json<Chapter>)> {
    let chapter = state
        .curriculum
        .add_chapter(
            &actor,
            id,
            &request.name,
            request.description.as_deref().unwrap_or(""),
        )
        .await?;
    Ok((StatusCode::CREATED, Json(chapter.into())))
}

/// Rename/redescribe a chapter.
#[utoipa::path(
    patch,
    path = "/chapters/{id}",
    tag = "courses",
    params(("id" = ChapterId, Path, description = "Chapter id")),
    request_body = UpdateChapterRequest,
    responses(
        (status = 200, description = "Updated", body = Chapter),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_chapter(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ChapterId>,
    ValidJson(request): ValidJson<UpdateChapterRequest>,
) -> ApiResult<Json<Chapter>> {
    let chapter = state
        .curriculum
        .update_chapter(
            &actor,
            id,
            request.name.as_deref(),
            request.description.as_deref(),
        )
        .await?;
    Ok(Json(chapter.into()))
}

/// Delete a chapter and its activities; siblings renumber to stay contiguous.
#[utoipa::path(
    delete,
    path = "/chapters/{id}",
    tag = "courses",
    params(("id" = ChapterId, Path, description = "Chapter id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_chapter(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ChapterId>,
) -> ApiResult<StatusCode> {
    // BUG-242: the renumber + projection after the commit outlive the socket.
    detached(async move {
        state.curriculum.delete_chapter(&actor, id).await?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
}

/// Move a chapter to a new position (clamped; siblings renumber).
#[utoipa::path(
    post,
    path = "/chapters/{id}/move",
    tag = "courses",
    params(("id" = ChapterId, Path, description = "Chapter id")),
    request_body = MoveChapterRequest,
    responses(
        (status = 204, description = "Moved"),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn move_chapter(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ChapterId>,
    ValidJson(request): ValidJson<MoveChapterRequest>,
) -> ApiResult<StatusCode> {
    state
        .curriculum
        .move_chapter(&actor, id, request.position)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Append an activity to a chapter (type/subtype pair must be valid).
#[utoipa::path(
    post,
    path = "/chapters/{id}/activities",
    tag = "courses",
    params(("id" = ChapterId, Path, description = "Chapter id")),
    request_body = CreateActivityRequest,
    responses(
        (status = 201, description = "Created (appended last)", body = Activity),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Invalid type/subtype pair", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_activity(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ChapterId>,
    ValidJson(request): ValidJson<CreateActivityRequest>,
) -> ApiResult<(StatusCode, Json<Activity>)> {
    let activity = state
        .curriculum
        .add_activity(
            &actor,
            id,
            &request.name,
            &request.activity_type,
            &request.activity_sub_type,
        )
        .await?;
    Ok((StatusCode::CREATED, Json(activity.into())))
}

/// Full activity including content/details/settings. Unpublished
/// activities exist for course editors only (404 otherwise).
#[utoipa::path(
    get,
    path = "/activities/{id}",
    tag = "courses",
    params(("id" = ActivityId, Path, description = "Activity id")),
    responses(
        (status = 200, description = "Activity detail", body = ActivityDetail,
         headers(("ETag" = String, description = "Quoted version"))),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_activity(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Path(id): Path<ActivityId>,
) -> ApiResult<Response> {
    Ok(with_etag(
        state.curriculum.activity_detail(&actor, id).await?.into(),
    ))
}

/// Partial update: name, publish state, content/details/settings, or the
/// type pair (both `activity_type` and `activity_sub_type` together).
///
/// A `content` write (the editor autosave) requires `If-Match: "<version>"`;
/// other fields honour it when sent. A stale version is 412
/// `precondition-failed` with `details {expected, actual}` — never a silent
/// overwrite of another tab's save.
#[utoipa::path(
    patch,
    path = "/activities/{id}",
    tag = "courses",
    params(
        ("id" = ActivityId, Path, description = "Activity id"),
        ("If-Match" = Option<i32>, Header, description = "Current version (required with `content`)"),
    ),
    request_body = UpdateActivityRequest,
    responses(
        (status = 200, description = "Updated", body = ActivityDetail,
         headers(("ETag" = String, description = "Quoted new version"))),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
        (status = 412, description = "Stale version", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_activity(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ActivityId>,
    headers: HeaderMap,
    ValidJson(request): ValidJson<UpdateActivityRequest>,
) -> ApiResult<Response> {
    let expected_version = if_match(&headers)?;
    if request.content.is_some() && expected_version.is_none() {
        return Err(Error::validation(vec![FieldError {
            field: "If-Match".into(),
            code: "required".into(),
            message: "If-Match with the activity's current version is required to write content"
                .into(),
        }])
        .into());
    }
    let type_pair = match (&request.activity_type, &request.activity_sub_type) {
        (Some(t), Some(s)) => Some((t.as_str(), s.as_str())),
        (None, None) => None,
        _ => {
            return Err(Error::validation(vec![FieldError {
                field: "activity_type".into(),
                code: "incomplete-pair".into(),
                message: "activity_type and activity_sub_type change together".into(),
            }])
            .into());
        }
    };
    let detail = state
        .curriculum
        .update_activity(
            &actor,
            id,
            ActivityChanges {
                name: request.name.as_deref(),
                published: request.published,
                type_pair,
                content: request.content.as_ref(),
                details: request.details.as_ref(),
                settings: request.settings.as_ref(),
                expected_version,
            },
        )
        .await?;
    Ok(with_etag(detail.into()))
}

/// Delete an activity; chapter siblings renumber to stay contiguous.
#[utoipa::path(
    delete,
    path = "/activities/{id}",
    tag = "courses",
    params(("id" = ActivityId, Path, description = "Activity id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_activity(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ActivityId>,
) -> ApiResult<StatusCode> {
    detached(async move {
        state.curriculum.delete_activity(&actor, id).await?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
}

/// Move an activity within its chapter, or to another chapter of the same
/// course via `chapter_id`.
#[utoipa::path(
    post,
    path = "/activities/{id}/move",
    tag = "courses",
    params(("id" = ActivityId, Path, description = "Activity id")),
    request_body = MoveActivityRequest,
    responses(
        (status = 204, description = "Moved"),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Cross-course move", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn move_activity(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ActivityId>,
    ValidJson(request): ValidJson<MoveActivityRequest>,
) -> ApiResult<StatusCode> {
    state
        .curriculum
        .move_activity(&actor, id, request.position, request.chapter_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Attach a file block to an activity by claiming a finalized upload whose
/// purpose matches the block type (`image`→`block-image`, etc.).
#[utoipa::path(
    post,
    path = "/activities/{id}/blocks",
    tag = "courses",
    params(("id" = ActivityId, Path, description = "Activity id")),
    request_body = CreateBlockRequest,
    responses(
        (status = 201, description = "Created", body = Block),
        (status = 403, description = "No write access / not your upload", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Upload not finalized", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Bad block type or wrong upload purpose", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_block(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<ActivityId>,
    ValidJson(request): ValidJson<CreateBlockRequest>,
) -> ApiResult<(StatusCode, Json<Block>)> {
    detached(async move {
        let block = state
            .curriculum
            .add_block(
                &actor,
                id,
                &request.block_type,
                request.upload_id,
                request.file_name.as_deref(),
            )
            .await?;
        Ok((StatusCode::CREATED, Json(block.into())))
    })
    .await
}

/// Blocks attached to an activity.
#[utoipa::path(
    get,
    path = "/activities/{id}/blocks",
    tag = "courses",
    params(("id" = ActivityId, Path, description = "Activity id")),
    responses(
        (status = 200, description = "Blocks", body = [Block]),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_blocks(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Path(id): Path<ActivityId>,
) -> ApiResult<Json<Vec<Block>>> {
    let blocks = state.curriculum.list_blocks(&actor, id).await?;
    Ok(Json(blocks.into_iter().map(Into::into).collect()))
}

/// One block (visibility follows the course).
#[utoipa::path(
    get,
    path = "/blocks/{id}",
    tag = "courses",
    params(("id" = BlockId, Path, description = "Block id")),
    responses(
        (status = 200, description = "Block", body = Block),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_block(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Path(id): Path<BlockId>,
) -> ApiResult<Json<Block>> {
    Ok(Json(state.curriculum.get_block(&actor, id).await?.into()))
}

/// Delete a block and release its stored file for reaping.
#[utoipa::path(
    delete,
    path = "/blocks/{id}",
    tag = "courses",
    params(("id" = BlockId, Path, description = "Block id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, description = "No write access", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_block(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<BlockId>,
) -> ApiResult<StatusCode> {
    detached(async move {
        state.curriculum.delete_block(&actor, id).await?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
}
