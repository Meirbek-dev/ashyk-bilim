use ab_core::{Error, ErrorCode};
use ab_domain::identity::LoginInput;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::Redirect;
use axum_extra::extract::CookieJar;
use axum_extra::extract::cookie::{Cookie, SameSite};
use secrecy::SecretString;
use serde::Deserialize;

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

// ── Google sign-in (browser navigation endpoints: errors redirect, never
//    render problem+json — the caller is a browser mid-navigation). ─────────

#[derive(Debug, Deserialize)]
pub struct GoogleStartQuery {
    /// Relative path to land on after sign-in.
    pub callback: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GoogleCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

fn login_error_redirect(code: &str) -> Redirect {
    Redirect::to(&format!("/auth/login?error={code}"))
}

/// Start Google sign-in: 303 to Google's consent screen.
#[utoipa::path(
    get,
    path = "/auth/google",
    tag = "auth",
    params(("callback" = Option<String>, Query, description = "Relative return path")),
    responses((status = 303, description = "Redirect to Google")),
)]
pub async fn google_start(
    State(state): State<AppState>,
    Query(query): Query<GoogleStartQuery>,
) -> Redirect {
    let Some(google) = &state.google else {
        return login_error_redirect("service-unavailable");
    };
    let callback = query.callback.as_deref().unwrap_or("/");
    match google.start(callback).await {
        Ok(url) => Redirect::to(&url),
        Err(err) => {
            tracing::warn!(error = %err, "google start failed");
            login_error_redirect(err.code().as_str())
        }
    }
}

/// Google redirects here; on success the session cookie is set and the
/// browser continues to the original callback path.
#[utoipa::path(
    get,
    path = "/auth/google/callback",
    tag = "auth",
    params(
        ("code" = Option<String>, Query, description = "Authorization code"),
        ("state" = Option<String>, Query, description = "Opaque state"),
        ("error" = Option<String>, Query, description = "Google-side error"),
    ),
    responses((status = 303, description = "Redirect into the app (or to login with ?error=)")),
)]
pub async fn google_callback(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Query(query): Query<GoogleCallbackQuery>,
) -> (CookieJar, Redirect) {
    let Some(google) = &state.google else {
        return (jar, login_error_redirect("service-unavailable"));
    };
    if query.error.is_some() {
        // User cancelled at Google's screen.
        return (jar, login_error_redirect("google-cancelled"));
    }
    let (Some(code), Some(oauth_state)) = (query.code.as_deref(), query.state.as_deref()) else {
        return (jar, login_error_redirect("google-oauth-expired"));
    };
    match google
        .callback(code, oauth_state, client_ip(&headers), user_agent(&headers))
        .await
    {
        Ok(ok) => {
            let jar = jar.add(session_cookie(&state, ok.session_id));
            (jar, Redirect::to(&ok.callback))
        }
        Err(err) => {
            tracing::warn!(error = %err, "google callback failed");
            (jar, login_error_redirect(err.code().as_str()))
        }
    }
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
