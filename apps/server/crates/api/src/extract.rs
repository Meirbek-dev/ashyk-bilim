//! Request extractors. [`CurrentActor`] is the authenticated-caller gate:
//! handlers that take it are unreachable without a live session.

use ab_core::{Error, ErrorCode, FieldError};
use ab_domain::identity::Actor;
use axum::Json;
use axum::extract::{ConnectInfo, FromRequest, FromRequestParts, Request};
use axum::http::HeaderMap;
use axum::http::request::Parts;
use axum_extra::extract::CookieJar;
use serde::de::DeserializeOwned;
use std::convert::Infallible;
use std::fmt::Display;
use std::net::SocketAddr;

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

/// Like [`CurrentActor`] but never rejects: no cookie, an expired session,
/// or a garbage cookie all yield [`Actor::anonymous`] (public-only
/// visibility). For public catalog reads — never for mutations.
pub struct MaybeActor(pub Actor);

impl FromRequestParts<AppState> for MaybeActor {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_headers(&parts.headers);
        let Some(cookie) = jar.get(SESSION_COOKIE) else {
            return Ok(Self(Actor::anonymous()));
        };
        let record = state.sessions.get_and_touch(cookie.value()).await;
        let actor = match record {
            Ok(Some(record)) => Actor::from_session(cookie.value().to_owned(), &record)
                .unwrap_or_else(|_| Actor::anonymous()),
            _ => Actor::anonymous(),
        };
        Ok(Self(actor))
    }
}

/// Client address for rate limiting and the session audit trail (BUG-147).
///
/// Trust order: `X-Real-IP` (our nginx sets it from the socket peer), then
/// the LAST `X-Forwarded-For` hop (the one nginx appended — earlier hops are
/// client-supplied and spoofable), then the TCP peer. Never the first hop.
pub struct ClientIp(pub Option<String>);

fn client_ip(parts: &Parts) -> Option<String> {
    let header = |name: &str| parts.headers.get(name).and_then(|v| v.to_str().ok());
    header("x-real-ip")
        .into_iter()
        .chain(
            header("x-forwarded-for")
                .into_iter()
                .flat_map(|v| v.split(',').rev()),
        )
        .map(str::trim)
        .find(|v| !v.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            parts
                .extensions
                .get::<ConnectInfo<SocketAddr>>()
                .map(|peer| peer.0.ip().to_string())
        })
}

impl<S: Send + Sync> FromRequestParts<S> for ClientIp {
    type Rejection = Infallible;

    fn from_request_parts(
        parts: &mut Parts,
        _state: &S,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        std::future::ready(Ok(Self(client_ip(parts))))
    }
}

/// One malformed request part → 422 `validation-failed` with a single
/// field error, the shape [`ValidJson`] already uses for the body.
fn rejected(field: &str, err: impl Display) -> ApiError {
    ApiError(Error::validation(vec![FieldError {
        field: field.into(),
        code: "invalid".into(),
        message: err.to_string(),
    }]))
}

/// [`axum::extract::Query`] whose rejection is problem+json (`query`
/// field error) instead of axum's plain-text 400.
pub struct Query<T>(pub T);

impl<T: DeserializeOwned, S: Send + Sync> FromRequestParts<S> for Query<T> {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        axum::extract::Query::<T>::from_request_parts(parts, state)
            .await
            .map(|q| Self(q.0))
            .map_err(|err| rejected("query", err))
    }
}

/// [`axum::extract::Path`] whose rejection is problem+json (`path` field
/// error) instead of axum's plain-text 400.
pub struct Path<T>(pub T);

impl<T: DeserializeOwned + Send, S: Send + Sync> FromRequestParts<S> for Path<T> {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        axum::extract::Path::<T>::from_request_parts(parts, state)
            .await
            .map(|p| Self(p.0))
            .map_err(|err| rejected("path", err))
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

impl<T> ValidJson<T>
where
    T: DeserializeOwned + garde::Validate<Context = ()>,
{
    /// The same rules applied to an already-read body (handlers that hash
    /// the raw bytes for an idempotency check read the body first).
    pub fn parse(body: &[u8]) -> Result<T, ApiError> {
        let value: T = serde_json::from_slice(body).map_err(|err| {
            ApiError(Error::validation(vec![FieldError {
                field: "body".into(),
                code: "invalid-json".into(),
                message: err.to_string(),
            }]))
        })?;
        value.validate().map_err(|report| {
            ApiError(Error::validation(
                report
                    .iter()
                    .map(|(path, error)| FieldError {
                        field: path.to_string(),
                        code: "invalid".into(),
                        message: error.to_string(),
                    })
                    .collect(),
            ))
        })?;
        Ok(value)
    }
}

const IDEMPOTENCY_KEY: &str = "idempotency-key";
const MAX_IDEMPOTENCY_KEY_LEN: usize = 128;

/// `Idempotency-Key` header, validated (1..=128 ASCII); `None` when absent.
pub fn idempotency_key(headers: &HeaderMap) -> Result<Option<String>, ApiError> {
    let Some(raw) = headers.get(IDEMPOTENCY_KEY) else {
        return Ok(None);
    };
    let key = raw.to_str().map(str::trim).unwrap_or_default();
    if key.is_empty() || key.len() > MAX_IDEMPOTENCY_KEY_LEN || !key.is_ascii() {
        return Err(ApiError(Error::validation(vec![FieldError {
            field: "Idempotency-Key".into(),
            code: "invalid".into(),
            message: format!(
                "Idempotency-Key must be 1..={MAX_IDEMPOTENCY_KEY_LEN} ASCII characters"
            ),
        }])));
    }
    Ok(Some(key.to_owned()))
}

/// Request-body fingerprint for idempotent replays.
#[must_use]
pub fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::Digest;
    use std::fmt::Write;
    let digest = sha2::Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for b in digest {
        let _ = write!(out, "{b:02x}");
    }
    out
}
