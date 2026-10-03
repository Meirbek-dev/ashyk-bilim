use axum::Json;
use axum::extract::State;

use crate::dto::search::{SearchQuery, SearchResults};
use crate::error::ApiResult;
use crate::extract::{MaybeActor, Query};
use crate::state::AppState;

/// Platform search over courses, collections, and people. Anonymous callers
/// see public content only and no people section.
#[utoipa::path(
    get,
    path = "/search",
    tag = "search",
    params(
        ("q" = String, Query, description = "Search terms: every word matches by prefix, `-word` excludes"),
        ("limit" = Option<i64>, Query, description = "Per-section cap, 1..=50 (default 10)"),
        ("cursor" = Option<String>, Query, description = "next_cursor from the previous page"),
    ),
    responses(
        (status = 200, description = "Grouped results", body = SearchResults),
        (status = 422, description = "Malformed `cursor`", body = crate::error::Problem,
         content_type = "application/problem+json"),
    ),
)]
pub async fn search(
    State(state): State<AppState>,
    MaybeActor(actor): MaybeActor,
    Query(query): Query<SearchQuery>,
) -> ApiResult<Json<SearchResults>> {
    let results = state
        .search
        .search(
            &actor,
            &query.q,
            query.limit.unwrap_or(10),
            query.cursor.as_deref(),
        )
        .await?;
    Ok(Json(SearchResults::for_actor(results, &actor)))
}
