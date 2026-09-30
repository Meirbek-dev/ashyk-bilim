//! Utilities for the authoring UI.

use axum::Json;
use axum::extract::State;

use crate::dto::utils::{LinkPreview, LinkPreviewQuery};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, Query};
use crate::state::AppState;

/// OpenGraph preview of a public web page, for the editor's link block.
///
/// Any signed-in session. `http(s)` only; the hostname must resolve to a
/// public address (loopback is accepted outside production only), 5 s
/// deadline, 1 MiB read cap, 24 h cache per URL. A page that cannot be
/// read answers 502 `link-preview-failed`; a rejected URL 422 (`url`).
#[utoipa::path(
    get, path = "/utils/link-preview", tag = "utils",
    params(("url" = String, Query, description = "Page URL (http/https)")),
    responses(
        (status = 200, description = "Preview", body = LinkPreview),
        (status = 422, description = "Rejected URL (scheme, credentials, private address)",
         body = Problem, content_type = "application/problem+json"),
        (status = 502, description = "The page could not be fetched or is not HTML",
         body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn link_preview(
    State(state): State<AppState>,
    CurrentActor(_actor): CurrentActor,
    Query(query): Query<LinkPreviewQuery>,
) -> ApiResult<Json<LinkPreview>> {
    Ok(Json(state.link_preview.preview(&query.url).await?.into()))
}
