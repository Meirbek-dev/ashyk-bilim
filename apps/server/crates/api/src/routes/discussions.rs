//! Course discussions: posts, replies, reactions, moderation.

use ab_core::assessments::ReactionKind;
use ab_core::id::{CourseId, DiscussionId};
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;

use crate::dto::discussions::{
    CreateDiscussionRequest, Discussion, DiscussionListQuery, DiscussionPage, ReactionState,
    RepliesQuery, UpdateDiscussionRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, ValidJson};
use crate::state::AppState;

const DEFAULT_PAGE: i64 = 50;

/// Newest posts first (keyset), optionally with replies embedded.
#[utoipa::path(
    get, path = "/courses/{id}/discussions", tag = "discussions",
    params(("id" = CourseId, Path, description = "Course id"), DiscussionListQuery),
    responses(
        (status = 200, description = "Posts", body = DiscussionPage),
        (status = 404, description = "Unknown or inaccessible course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_discussions(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    Query(query): Query<DiscussionListQuery>,
) -> ApiResult<Json<DiscussionPage>> {
    let page = state
        .discussions
        .list(
            &actor,
            id,
            query.include_replies.unwrap_or(false),
            query.cursor,
            query.limit.unwrap_or(DEFAULT_PAGE),
        )
        .await?;
    Ok(Json(page.into()))
}

/// Post, or reply to a post (`parent_id`).
#[utoipa::path(
    post, path = "/courses/{id}/discussions", tag = "discussions",
    params(("id" = CourseId, Path, description = "Course id")),
    request_body = CreateDiscussionRequest,
    responses(
        (status = 201, description = "Created", body = Discussion),
        (status = 422, description = "Empty content or nested reply", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_discussion(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    ValidJson(request): ValidJson<CreateDiscussionRequest>,
) -> ApiResult<(StatusCode, Json<Discussion>)> {
    let created = state
        .discussions
        .create(&actor, id, request.parent_id, &request.content)
        .await?;
    Ok((StatusCode::CREATED, Json(created.into())))
}

/// Edit content and/or status (owner, or a moderator).
#[utoipa::path(
    patch, path = "/discussions/{id}", tag = "discussions",
    params(("id" = DiscussionId, Path, description = "Discussion id")),
    request_body = UpdateDiscussionRequest,
    responses(
        (status = 200, description = "Updated", body = Discussion),
        (status = 403, description = "Not yours and not a moderator", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_discussion(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<DiscussionId>,
    ValidJson(request): ValidJson<UpdateDiscussionRequest>,
) -> ApiResult<Json<Discussion>> {
    let updated = state
        .discussions
        .update(&actor, id, request.content.as_deref(), request.status)
        .await?;
    Ok(Json(updated.into()))
}

/// Remove a post with its replies and reactions (owner, or a moderator).
#[utoipa::path(
    delete, path = "/discussions/{id}", tag = "discussions",
    params(("id" = DiscussionId, Path, description = "Discussion id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, description = "Not yours and not a moderator", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_discussion(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<DiscussionId>,
) -> ApiResult<StatusCode> {
    state.discussions.delete(&actor, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Toggle a like (a standing dislike is replaced).
#[utoipa::path(
    put, path = "/discussions/{id}/like", tag = "discussions",
    params(("id" = DiscussionId, Path, description = "Discussion id")),
    responses((status = 200, description = "Reaction state", body = ReactionState)),
)]
pub async fn toggle_like(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<DiscussionId>,
) -> ApiResult<Json<ReactionState>> {
    Ok(Json(
        state
            .discussions
            .toggle(&actor, id, ReactionKind::Like)
            .await?
            .into(),
    ))
}

/// Toggle a dislike (a standing like is replaced).
#[utoipa::path(
    put, path = "/discussions/{id}/dislike", tag = "discussions",
    params(("id" = DiscussionId, Path, description = "Discussion id")),
    responses((status = 200, description = "Reaction state", body = ReactionState)),
)]
pub async fn toggle_dislike(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<DiscussionId>,
) -> ApiResult<Json<ReactionState>> {
    Ok(Json(
        state
            .discussions
            .toggle(&actor, id, ReactionKind::Dislike)
            .await?
            .into(),
    ))
}

/// Replies under a post, oldest first (keyset).
#[utoipa::path(
    get, path = "/discussions/{id}/replies", tag = "discussions",
    params(("id" = DiscussionId, Path, description = "Discussion id"), RepliesQuery),
    responses((status = 200, description = "Replies", body = DiscussionPage)),
)]
pub async fn list_replies(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<DiscussionId>,
    Query(query): Query<RepliesQuery>,
) -> ApiResult<Json<DiscussionPage>> {
    let page = state
        .discussions
        .replies(
            &actor,
            id,
            query.cursor,
            query.limit.unwrap_or(DEFAULT_PAGE),
        )
        .await?;
    Ok(Json(page.into()))
}
