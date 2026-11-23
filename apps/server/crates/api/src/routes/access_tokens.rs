//! The caller's personal access tokens for MCP clients (REWRITE 4.7): create (the secret is shown once),
//! list, revoke. Another user's token id is 404.

use ab_core::id::AccessTokenId;
use ab_domain::identity::access_tokens::RequestOrigin;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, header};

use crate::detach::detached;
use crate::dto::access_tokens::{AccessToken, CreateAccessTokenRequest, CreatedAccessToken};
use crate::error::{ApiResult, Problem};
use crate::extract::{ClientIp, CurrentActor, Path, ValidJson};
use crate::state::AppState;

fn origin(ip: ClientIp, headers: &HeaderMap) -> RequestOrigin {
    RequestOrigin {
        ip: ip.0,
        user_agent: headers
            .get(header::USER_AGENT)
            .and_then(|v| v.to_str().ok())
            .map(ToOwned::to_owned),
    }
}

/// The caller's access tokens, newest first; revoked and expired ones included.
#[utoipa::path(
    get, path = "/me/access-tokens", tag = "me",
    responses(
        (status = 200, description = "The caller's tokens", body = [AccessToken]),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_access_tokens(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<Vec<AccessToken>>> {
    let tokens = state.access_tokens.list(&actor).await?;
    Ok(Json(tokens.into_iter().map(Into::into).collect()))
}

/// Create an access token for an MCP client; the response carries the secret, shown this once.
///
/// At most 20 live tokens per account (409 `conflict` past it).
#[utoipa::path(
    post, path = "/me/access-tokens", tag = "me",
    request_body = CreateAccessTokenRequest,
    responses(
        (status = 201, description = "Created; `token` is shown this once", body = CreatedAccessToken),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Too many live tokens", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Bad name, scope or expiry", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_access_token(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ip: ClientIp,
    headers: HeaderMap,
    ValidJson(request): ValidJson<CreateAccessTokenRequest>,
) -> ApiResult<(StatusCode, Json<CreatedAccessToken>)> {
    let origin = origin(ip, &headers);
    // The token and its audit row outlive a client that hangs up.
    detached(async move {
        let created = state
            .access_tokens
            .create(
                &actor,
                &request.name,
                request.scope.into(),
                request.expires_in_days,
                &origin,
            )
            .await?;
        Ok((StatusCode::CREATED, Json(created.into())))
    })
    .await
}

/// Revoke one of the caller's tokens: it authenticates nothing from now on.
#[utoipa::path(
    delete, path = "/me/access-tokens/{token_id}", tag = "me",
    params(("token_id" = AccessTokenId, Path, description = "Access token id")),
    responses(
        (status = 204, description = "Revoked (again: still revoked)"),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "Unknown, or another user's", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn revoke_access_token(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ip: ClientIp,
    headers: HeaderMap,
    Path(id): Path<AccessTokenId>,
) -> ApiResult<StatusCode> {
    let origin = origin(ip, &headers);
    detached(async move {
        state.access_tokens.revoke(&actor, id, &origin).await?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
}
