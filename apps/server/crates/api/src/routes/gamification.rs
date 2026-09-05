//! Gamification: dashboard, leaderboard, rank, streaks, preferences, and the
//! platform-manager award and policy endpoints.

use ab_core::assessments::StreakKind;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;

use crate::dto::gamification::{
    AdminAwardRequest, AwardResponse, Dashboard, GamificationConfig, Leaderboard, LeaderboardQuery,
    Profile, StreakUpdate, UpdateGamificationConfigRequest, UserRank,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, ValidJson};
use crate::state::AppState;

/// Profile, recent XP, rank and the top-10 leaderboard in one call.
#[utoipa::path(
    get, path = "/gamification", tag = "gamification",
    responses((status = 200, description = "Dashboard", body = Dashboard)),
)]
pub async fn dashboard(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<Dashboard>> {
    Ok(Json(state.gamification.dashboard(&actor).await?.into()))
}

#[utoipa::path(
    get, path = "/gamification/leaderboard", tag = "gamification",
    params(LeaderboardQuery),
    responses((status = 200, description = "Leaderboard", body = Leaderboard)),
)]
pub async fn leaderboard(
    State(state): State<AppState>,
    CurrentActor(_actor): CurrentActor,
    Query(query): Query<LeaderboardQuery>,
) -> ApiResult<Json<Leaderboard>> {
    Ok(Json(
        state
            .gamification
            .leaderboard(query.limit.unwrap_or(10), query.offset.unwrap_or(0))
            .await?
            .into(),
    ))
}

#[utoipa::path(
    get, path = "/gamification/rank", tag = "gamification",
    responses((status = 200, description = "Rank", body = UserRank)),
)]
pub async fn rank(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<UserRank>> {
    let rank = state.gamification.rank(&actor).await?;
    Ok(Json(UserRank {
        user_id: actor.user_id,
        rank,
    }))
}

/// Touch a streak for today (same day keeps, next day extends, a gap resets).
#[utoipa::path(
    post, path = "/gamification/streaks/{kind}", tag = "gamification",
    params(("kind" = StreakKind, Path, description = "login or learning")),
    responses((status = 200, description = "Streak", body = StreakUpdate)),
)]
pub async fn record_streak(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(kind): Path<StreakKind>,
) -> ApiResult<Json<StreakUpdate>> {
    Ok(Json(
        state
            .gamification
            .record_streak(actor.user_id, kind)
            .await?
            .into(),
    ))
}

/// Merge preferences (`null` removes a key).
#[utoipa::path(
    patch, path = "/gamification/preferences", tag = "gamification",
    request_body(content = Object, description = "Preference patch"),
    responses((status = 200, description = "Profile", body = Profile)),
)]
pub async fn update_preferences(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Json(patch): Json<serde_json::Value>,
) -> ApiResult<Json<Profile>> {
    Ok(Json(
        state
            .gamification
            .update_preferences(&actor, &patch)
            .await?
            .into(),
    ))
}

/// Grant XP to a user (`platform:manage`). Learners never award themselves
/// in v2; XP is a side effect of completing things.
#[utoipa::path(
    post, path = "/gamification/xp", tag = "gamification",
    request_body = AdminAwardRequest,
    responses(
        (status = 201, description = "Awarded (or the earlier identical award)", body = AwardResponse),
        (status = 403, description = "Not a platform manager", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn admin_award(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ValidJson(request): ValidJson<AdminAwardRequest>,
) -> ApiResult<(StatusCode, Json<AwardResponse>)> {
    let award = state
        .gamification
        .admin_award(
            &actor,
            request.user_id,
            request.amount,
            request.reason.as_deref(),
            request.idempotency_key.as_deref(),
        )
        .await?;
    Ok((StatusCode::CREATED, Json(award.into())))
}

#[utoipa::path(
    get, path = "/gamification/config", tag = "gamification",
    responses((status = 200, description = "Policy overrides", body = GamificationConfig)),
)]
pub async fn get_config(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<GamificationConfig>> {
    Ok(Json(state.gamification.config(&actor).await?.into()))
}

/// Replace the policy overrides (`platform:manage`).
#[utoipa::path(
    put, path = "/gamification/config", tag = "gamification",
    request_body = UpdateGamificationConfigRequest,
    responses((status = 200, description = "Policy overrides", body = GamificationConfig)),
)]
pub async fn update_config(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ValidJson(request): ValidJson<UpdateGamificationConfigRequest>,
) -> ApiResult<Json<GamificationConfig>> {
    Ok(Json(
        state
            .gamification
            .update_config(&actor, request.daily_xp_limit, &request.rewards)
            .await?
            .into(),
    ))
}
