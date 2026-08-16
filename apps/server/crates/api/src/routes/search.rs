use axum::Json;
use axum::extract::{Query, State};

use crate::dto::search::{SearchQuery, SearchResults};
use crate::error::ApiResult;
use crate::extract::MaybeActor;
use crate::state::AppState;

/// Platform search over courses, collections, and people. Anonymous callers
/// see public content only and no people section.
#[utoipa::path(
    get,
    path = "/search",
    tag = "search",
    params(
        ("q" = String, Query, description = "Search terms (websearch syntax)"),
        ("limit" = Option<i64>, Query, description = "Per-section cap, 1..=50 (default 10)"),
    ),
    responses((status = 200, description = "Grouped results", body = SearchResults)),
)]
pub async fn search(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Query(query): Query<SearchQuery>,
) -> ApiResult<Json<SearchResults>> {
    let results = state
        .search
        .search(&actor, &query.q, query.limit.unwrap_or(10))
        .await?;
    Ok(Json(results.into()))
}
