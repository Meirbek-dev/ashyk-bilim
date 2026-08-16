//! Request extractors. [`CurrentActor`] is the authenticated-caller gate:
//! handlers that take it are unreachable without a live session.

use ab_core::{Error, ErrorCode};
use ab_domain::identity::Actor;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum_extra::extract::CookieJar;

use crate::error::ApiError;
use crate::state::AppState;

/// The BFF session cookie (httponly; `Secure` outside development).
pub const SESSION_COOKIE: &str = "ab_session";

/// Extracts the authenticated [`Actor`] from the session cookie, touching the
/// session (sliding TTL). Rejects with 401 `unauthenticated` / `session-expired`.
pub struct CurrentActor(pub Actor);

impl FromRequestParts<AppState> for CurrentActor {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_headers(&parts.headers);
        let Some(cookie) = jar.get(SESSION_COOKIE) else {
            return Err(ApiError(Error::unauthenticated()));
        };
        let record = state
            .sessions
            .get_and_touch(cookie.value())
            .await
            .map_err(ApiError)?;
        let Some(record) = record else {
            return Err(ApiError(Error::app(
                ErrorCode::SessionExpired,
                "session is expired or revoked",
            )));
        };
        let actor = Actor::from_session(cookie.value().to_owned(), &record).map_err(ApiError)?;
        Ok(Self(actor))
    }
}
