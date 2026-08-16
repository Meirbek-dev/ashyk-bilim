//! Request extractors. [`CurrentActor`] is the authenticated-caller gate:
//! handlers that take it are unreachable without a live session.

use ab_core::{Error, ErrorCode, FieldError};
use ab_domain::identity::Actor;
use axum::Json;
use axum::extract::{FromRequest, FromRequestParts, Request};
use axum::http::request::Parts;
use axum_extra::extract::CookieJar;
use serde::de::DeserializeOwned;

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

/// JSON body extractor with garde validation: parse failures and rule
/// violations both surface as 422 `validation-failed` with per-field errors
/// (ARCHITECTURE §6).
pub struct ValidJson<T>(pub T);

impl<T, S> FromRequest<S> for ValidJson<T>
where
    T: DeserializeOwned + garde::Validate<Context = ()>,
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let Json(value) = Json::<T>::from_request(req, state).await.map_err(|err| {
            ApiError(Error::validation(vec![FieldError {
                field: "body".into(),
                code: "invalid-json".into(),
                message: err.to_string(),
            }]))
        })?;
        value.validate().map_err(|report| {
            let field_errors = report
                .iter()
                .map(|(path, error)| FieldError {
                    field: path.to_string(),
                    code: "invalid".into(),
                    message: error.to_string(),
                })
                .collect();
            ApiError(Error::validation(field_errors))
        })?;
        Ok(Self(value))
    }
}
