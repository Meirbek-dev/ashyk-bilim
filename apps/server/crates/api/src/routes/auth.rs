use ab_core::language::Language;
use ab_core::{Error, ErrorCode};
use ab_domain::identity::{LoginInput, NewAccount};
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{Redirect, Response};
use axum_extra::extract::CookieJar;
use axum_extra::extract::cookie::{Cookie, SameSite};
use secrecy::SecretString;
use serde::Deserialize;

use crate::detach::detached;
use crate::dto::auth::{
    ChangePasswordRequest, LoginRequest, RegisterRequest, SessionInfo, SessionSummary,
    VerifyEmailRequest,
};
use crate::dto::users::UserProfile;
use crate::error::{ApiResult, Problem};
use crate::extract::{
    ClientIp, CurrentActor, Path, Query, SESSION_COOKIE, ValidJson, idempotent_anonymous,
};
use crate::state::AppState;

pub(crate) fn user_agent(headers: &HeaderMap) -> Option<String> {
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
    ClientIp(ip): ClientIp,
    ValidJson(request): ValidJson<LoginRequest>,
) -> ApiResult<(CookieJar, Json<SessionInfo>)> {
    let ok = state
        .identity
        .login(LoginInput {
            login: request.login,
            password: SecretString::from(request.password),
            totp_code: request.totp_code,
            ip,
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
            mfa_enabled: ok.mfa_enabled,
        }),
    ))
}

/// Self-registration: creates the account (default `user` role) and emails
/// a verification code.
///
/// The link opens the web app under the `Accept-Language` locale (`/ru`,
/// `/kz`, `/en`). No session is opened — the client logs in next. Honours
/// `Idempotency-Key` (a retry replays the 201 instead of 409
/// `username-taken`).
#[utoipa::path(
    post,
    path = "/auth/register",
    tag = "auth",
    params(
        ("Idempotency-Key" = Option<String>, Header, description = "Retry-safe replay key"),
        ("Accept-Language" = Option<String>, Header, description = "ru, kk or en — the locale of the verification link"),
    ),
    request_body = RegisterRequest,
    responses(
        (status = 201, description = "Account created; verification code sent", body = UserProfile),
        (status = 409, description = "`username-taken` / `email-taken`", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Validation failed", body = Problem,
         content_type = "application/problem+json"),
        (status = 429, description = "Too many attempts", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    ClientIp(ip): ClientIp,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    let request = ValidJson::<RegisterRequest>::parse(&body)?;
    let language = Language::from_accept_language(
        headers
            .get(axum::http::header::ACCEPT_LANGUAGE)
            .and_then(|v| v.to_str().ok()),
    );
    // Lookup → Zitadel create → `users` row → code → key, as one unit the
    // client cannot abort by dropping the connection (BUG-213).
    detached(async move {
        idempotent_anonymous(
            &state.pool,
            "register",
            &headers,
            &body,
            || async {
                let profile = state
                    .identity
                    .register(NewAccount {
                        username: request.username,
                        email: request.email,
                        password: Some(SecretString::from(request.password)),
                        first_name: request.first_name,
                        last_name: request.last_name,
                        ip,
                        user_agent: user_agent(&headers),
                        language,
                    })
                    .await?;
                Ok((
                    StatusCode::CREATED,
                    // A registration always sets a password (UX-198).
                    UserProfile {
                        has_password: true,
                        ..UserProfile::from(profile)
                    },
                ))
            },
            |profile: &UserProfile| profile.id,
        )
        .await
    })
    .await
}

/// Confirm the email address with the emailed code (public).
#[utoipa::path(
    post,
    path = "/auth/verify-email",
    tag = "auth",
    request_body = VerifyEmailRequest,
    responses(
        (status = 204, description = "Email verified"),
        (status = 422, description = "Invalid or expired code (`field_errors[].field == \"code\"`)",
         body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "Too many attempts", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn verify_email(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    ValidJson(request): ValidJson<VerifyEmailRequest>,
) -> ApiResult<StatusCode> {
    // Zitadel verify → audit outlive the connection (UX-211).
    detached(async move {
        state
            .identity
            .verify_email(&request.email, &request.code, ip.as_deref())
            .await?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
}

/// Change the caller's password (current password checked by Zitadel).
/// Every other session of the caller is revoked.
#[utoipa::path(
    post,
    path = "/auth/password",
    tag = "auth",
    request_body = ChangePasswordRequest,
    responses(
        (status = 204, description = "Password changed"),
        (status = 401, description = "`invalid-credentials`: current password wrong", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "New password rejected by policy", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn change_password(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ValidJson(request): ValidJson<ChangePasswordRequest>,
) -> ApiResult<StatusCode> {
    // Zitadel change → revoke_others → audit outlive the connection (BUG-214).
    detached(async move {
        state
            .identity
            .change_password(
                &actor,
                &SecretString::from(request.current_password),
                &SecretString::from(request.new_password),
            )
            .await?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
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
    let cookie = removal_cookie(&state);
    // A hang-up must not leave the session live while the client drops its
    // cookie believing it logged out (BUG-311).
    detached(async move { Ok(state.identity.logout(&actor).await?) }).await?;
    Ok((jar.add(cookie), StatusCode::NO_CONTENT))
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
        mfa_enabled: actor.mfa_enabled,
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

// ── TOTP MFA self-service ───────────────────────────────────────────────────

/// Start TOTP enrollment (secrets are returned exactly once).
#[utoipa::path(
    post,
    path = "/auth/mfa/totp",
    tag = "auth",
    responses(
        (status = 200, description = "Enrollment secrets", body = crate::dto::auth::TotpEnrollment),
        (status = 409, description = "Already enrolled", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn totp_enroll(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<crate::dto::auth::TotpEnrollment>> {
    let registration = state.identity.totp_enroll(&actor).await?;
    Ok(Json(crate::dto::auth::TotpEnrollment {
        uri: registration.uri,
        secret: secrecy::ExposeSecret::expose_secret(&registration.secret).to_owned(),
    }))
}

/// Activate TOTP with the first code from the authenticator app.
#[utoipa::path(
    post,
    path = "/auth/mfa/totp/verify",
    tag = "auth",
    request_body = crate::dto::auth::TotpVerifyRequest,
    responses(
        (status = 204, description = "TOTP active"),
        (status = 400, description = "Invalid code", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "No enrolment pending, or already active", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn totp_verify(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    ValidJson(request): ValidJson<crate::dto::auth::TotpVerifyRequest>,
) -> ApiResult<StatusCode> {
    detached(async move {
        state.identity.totp_activate(&actor, &request.code).await?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
}

/// Remove the TOTP authenticator.
#[utoipa::path(
    delete,
    path = "/auth/mfa/totp",
    tag = "auth",
    responses((status = 204, description = "Removed (idempotent)")),
)]
pub async fn totp_remove(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<StatusCode> {
    detached(async move {
        state.identity.totp_remove(&actor).await?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
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

/// Browser-facing redirects are absolute to `AB__SERVER__WEB_URL` when set
/// (the API may live on another origin than the web app).
fn login_error_redirect(state: &AppState, code: &str) -> Redirect {
    Redirect::to(
        &state
            .config
            .server
            .web_href(&format!("/auth/login?error={code}")),
    )
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
        return login_error_redirect(&state, "service-unavailable");
    };
    let callback = query.callback.as_deref().unwrap_or("/");
    match google.start(callback).await {
        Ok(url) => Redirect::to(&url),
        Err(err) => {
            tracing::warn!(error = %err, "google start failed");
            login_error_redirect(&state, err.code().as_str())
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
    ClientIp(ip): ClientIp,
    Query(query): Query<GoogleCallbackQuery>,
) -> (CookieJar, Redirect) {
    let Some(google) = &state.google else {
        return (jar, login_error_redirect(&state, "service-unavailable"));
    };
    if query.error.is_some() {
        // User cancelled at Google's screen.
        return (jar, login_error_redirect(&state, "google-cancelled"));
    }
    let (Some(code), Some(oauth_state)) = (query.code.as_deref(), query.state.as_deref()) else {
        return (jar, login_error_redirect(&state, "google-oauth-expired"));
    };
    match google
        .callback(code, oauth_state, ip, user_agent(&headers))
        .await
    {
        Ok(ok) => {
            let jar = jar.add(session_cookie(&state, ok.session_id));
            (
                jar,
                Redirect::to(&state.config.server.web_href(&ok.callback)),
            )
        }
        Err(err) => {
            tracing::warn!(error = %err, "google callback failed");
            (jar, login_error_redirect(&state, err.code().as_str()))
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
    // Revoke → audit outlive the connection (UX-211).
    detached(async move {
        if state.identity.revoke_session(&actor, &handle).await? {
            Ok(StatusCode::NO_CONTENT)
        } else {
            Err(Error::app(ErrorCode::NotFound, "no session with that handle").into())
        }
    })
    .await
}
