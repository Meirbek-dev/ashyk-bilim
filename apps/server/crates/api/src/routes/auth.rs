use ab_core::{Error, ErrorCode};
use ab_domain::identity::LoginInput;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum_extra::extract::CookieJar;
use axum_extra::extract::cookie::{Cookie, SameSite};
use secrecy::SecretString;

use crate::dto::auth::{LoginRequest, SessionInfo, SessionSummary};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, SESSION_COOKIE, ValidJson};
use crate::state::AppState;

/// Best-effort client IP behind nginx (`X-Forwarded-For` first hop).
fn client_ip(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(|v| v.trim().to_owned())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(ToOwned::to_owned)
        })
}

fn user_agent(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.chars().take(512).collect())
}

fn session_cookie(state: &AppState, value: String) -> Cookie<'static> {
    Cookie::build((SESSION_COOKIE, value))
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(state.config.environment.is_production())
        .path("/")
        .max_age(time::Duration::days(14))
        .build()
}

fn removal_cookie(state: &AppState) -> Cookie<'static> {
    let mut cookie = session_cookie(state, String::new());
    cookie.make_removal();
    cookie
}

/// Password login (headless Zitadel session check behind the BFF).
#[utoipa::path(
    post,
    path = "/auth/login",
    tag = "auth",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "Logged in; session cookie set", body = SessionInfo),
        (status = 401, description = "Invalid credentials", body = Problem,
         content_type = "application/problem+json"),
        (status = 403, description = "Account disabled", body = Problem,
         content_type = "application/problem+json"),
        (status = 429, description = "Too many attempts", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    ValidJson(request): ValidJson<LoginRequest>,
) -> ApiResult<(CookieJar, Json<SessionInfo>)> {
    let ok = state
        .identity
        .login(LoginInput {
            login: request.login,
            password: SecretString::from(request.password),
            ip: client_ip(&headers),
            user_agent: user_agent(&headers),
        })
        .await?;
    let jar = jar.add(session_cookie(&state, ok.session_id));
    Ok((
        jar,
        Json(SessionInfo {
            user_id: ok.user_id,
            roles: ok.roles,
            permissions: ok.permissions,
        }),
    ))
}

/// Logout: revoke the current session and clear the cookie. Idempotent.
#[utoipa::path(
    post,
    path = "/auth/logout",
    tag = "auth",
    responses(
        (status = 204, description = "Session terminated, cookie cleared"),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<(CookieJar, StatusCode)> {
    state.identity.logout(&actor).await?;
    Ok((jar.add(removal_cookie(&state)), StatusCode::NO_CONTENT))
}

/// The caller's current session (also the cheapest "am I logged in?" probe).
#[utoipa::path(
    get,
    path = "/auth/session",
    tag = "auth",
    responses(
        (status = 200, description = "Current session", body = SessionInfo),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn current_session(CurrentActor(actor): CurrentActor) -> Json<SessionInfo> {
    Json(SessionInfo {
        user_id: actor.user_id,
        roles: actor.roles,
        permissions: actor.permission_strings,
    })
}

/// All live sessions of the caller (handles are non-bearer identifiers).
#[utoipa::path(
    get,
    path = "/auth/sessions",
    tag = "auth",
    responses(
        (status = 200, description = "Live sessions", body = [SessionSummary]),
        (status = 401, description = "No live session", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn list_sessions(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<Vec<SessionSummary>>> {
    let sessions = state.identity.list_sessions(&actor).await?;
    Ok(Json(sessions.into_iter().map(Into::into).collect()))
}

/// Revoke one of the caller's own sessions by handle.
#[utoipa::path(
    delete,
    path = "/auth/sessions/{handle}",
    tag = "auth",
    params(("handle" = String, Path, description = "Session handle from the listing")),
    responses(
        (status = 204, description = "Revoked"),
        (status = 404, description = "No such session", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn revoke_session(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(handle): Path<String>,
) -> ApiResult<StatusCode> {
    if state.identity.revoke_session(&actor, &handle).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(Error::app(ErrorCode::NotFound, "no session with that handle").into())
    }
}
