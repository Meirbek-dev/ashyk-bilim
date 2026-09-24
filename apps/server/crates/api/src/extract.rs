//! Request extractors. [`CurrentActor`] is the authenticated-caller gate:
//! handlers that take it are unreachable without a live session.

use ab_core::id::UserId;
use ab_core::{Error, ErrorCode, FieldError};
use ab_domain::identity::Actor;
use axum::Json;
use axum::extract::{ConnectInfo, FromRequest, FromRequestParts, Request};
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
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

/// U+0000 never reaches a query: Postgres rejects it in any text bind
/// (22021), which would be a 500 on every route (BUG-211). In a URI it can
/// only arrive percent-encoded, so the raw part is checked before decoding.
fn nul_free(field: &str, raw: &str) -> Result<(), ApiError> {
    if raw.contains("%00") {
        return Err(rejected(field, "must not contain U+0000"));
    }
    Ok(())
}

/// The same for a JSON body: any string value or object key (at any depth)
/// holding NUL — keys reach the jsonb bind too (BUG-223, 22P05).
fn has_nul(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::String(s) => s.contains('\0'),
        serde_json::Value::Array(items) => items.iter().any(has_nul),
        serde_json::Value::Object(map) => map.iter().any(|(k, v)| k.contains('\0') || has_nul(v)),
        _ => false,
    }
}

/// [`axum::extract::Query`] whose rejection is problem+json (`query`
/// field error) instead of axum's plain-text 400.
pub struct Query<T>(pub T);

impl<T: DeserializeOwned, S: Send + Sync> FromRequestParts<S> for Query<T> {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        nul_free("query", parts.uri.query().unwrap_or_default())?;
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
        nul_free("path", parts.uri.path())?;
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
        let Json(value) = Json::<serde_json::Value>::from_request(req, state)
            .await
            .map_err(|err| invalid_json(&err))?;
        Self::from_value(value).map(Self)
    }
}

/// A custom garde rule names its own field code as the message prefix
/// (`password-too-long: …`, BUG-293); every other rule is `invalid`.
fn field_code(message: &str) -> &str {
    message
        .split_once(": ")
        .map(|(code, _)| code)
        .filter(|code| {
            !code.is_empty() && code.bytes().all(|b| b.is_ascii_lowercase() || b == b'-')
        })
        .unwrap_or("invalid")
}

fn invalid_json(err: &impl Display) -> ApiError {
    ApiError(Error::validation(vec![FieldError {
        field: "body".into(),
        code: "invalid-json".into(),
        message: err.to_string(),
    }]))
}

impl<T> ValidJson<T>
where
    T: DeserializeOwned + garde::Validate<Context = ()>,
{
    /// The same rules applied to an already-read body (handlers that hash
    /// the raw bytes for an idempotency check read the body first).
    pub fn parse(body: &[u8]) -> Result<T, ApiError> {
        let value = serde_json::from_slice(body).map_err(|err| invalid_json(&err))?;
        Self::from_value(value)
    }

    /// NUL guard (BUG-211) → typed DTO → garde rules.
    fn from_value(value: serde_json::Value) -> Result<T, ApiError> {
        if has_nul(&value) {
            return Err(rejected("body", "must not contain U+0000"));
        }
        let value: T = serde_json::from_value(value).map_err(|err| invalid_json(&err))?;
        value.validate().map_err(|report| {
            ApiError(Error::validation(
                report
                    .iter()
                    .map(|(path, error)| FieldError {
                        field: path.to_string(),
                        code: field_code(error.message()).into(),
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

/// `Idempotency-Key` replay around a create.
///
/// The key `{scope}:{key}` is reserved **before** `fresh` runs (BUG-195):
/// the first caller owns it and stores its reply (24h) for the retry, a
/// concurrent duplicate waits for that reply and gets the same one (409
/// `idempotency-in-progress` if it takes longer than [`IN_PROGRESS_WAIT`]),
/// the same key with a different body is 422 `reused`, and a failed action
/// releases the key so the retry runs again. Without the header `fresh`
/// simply runs.
///
/// The reserve → action → complete/release sequence runs on its own task
/// (BUG-204): a client that drops the connection mid-flight makes hyper drop
/// the handler future, which must neither abort the action nor strand the
/// key IN_PROGRESS — the retry replays the completed reply. A reservation
/// that nevertheless goes stale (crash, panic) is taken over after
/// [`ab_db::submissions::IDEMPOTENT_STALE_SECS`]; a live action heartbeats
/// its reservation every [`IDEMPOTENT_HEARTBEAT`] so a long one (several
/// code items polled at Judge0) is never re-run by its own retry.
pub async fn idempotent<T, Fut>(
    pool: sqlx::PgPool,
    user_id: UserId,
    scope: &str,
    headers: &HeaderMap,
    body: &[u8],
    fresh: impl FnOnce() -> Fut + Send + 'static,
) -> Result<Response, ApiError>
where
    T: serde::Serialize + Send + 'static,
    Fut: Future<Output = Result<(StatusCode, T), ApiError>> + Send + 'static,
{
    let key = idempotency_key(headers)?.map(|k| format!("{scope}:{k}"));
    let request_hash = sha256_hex(body);
    let task_pool = pool.clone();
    let task_key = key.clone();
    let task = tokio::spawn(async move {
        let pool = &task_pool;
        let Some(key) = task_key else {
            let (status, _, value) = run(fresh).await?;
            return Ok((status, Json(value)).into_response());
        };
        if let Some(response) = reserve_or_replay(pool, user_id, &key, &request_hash).await? {
            return Ok(response);
        }
        let heartbeat = tokio::spawn({
            let (pool, key) = (pool.clone(), key.clone());
            async move {
                loop {
                    tokio::time::sleep(IDEMPOTENT_HEARTBEAT).await;
                    if let Err(err) =
                        ab_db::submissions::touch_idempotent(&pool, user_id, &key).await
                    {
                        tracing::warn!(error = %err, key, "idempotency heartbeat failed");
                    }
                }
            }
        });
        let outcome = run(fresh).await;
        heartbeat.abort();
        let (status, _, value) = match outcome {
            Ok(ok) => ok,
            Err(err) => {
                ab_db::submissions::release_idempotent(pool, user_id, &key).await?;
                return Err(err);
            }
        };
        let status_code = i32::from(status.as_u16());
        ab_db::submissions::complete_idempotent(pool, user_id, &key, status_code, &value).await?;
        Ok::<_, ApiError>((status, Json(value)).into_response())
    });
    match task.await {
        Ok(result) => result,
        Err(join) => {
            // Panicked mid-action: free the key so the retry runs again.
            if let Some(key) = &key {
                ab_db::submissions::release_idempotent(&pool, user_id, key).await?;
            }
            Err(ApiError(Error::internal("idempotent action", join)))
        }
    }
}

/// [`idempotent`] for an anonymous create that produces its own owner
/// (registration).
///
/// The key is looked up alone and the reply is stored under the user
/// `owner_of` names on the fresh reply. No owner is known before the
/// action, so the key is not reserved up front — concurrent duplicates
/// race to the unique email/username instead.
pub async fn idempotent_anonymous<T, Fut>(
    pool: &sqlx::PgPool,
    scope: &str,
    headers: &HeaderMap,
    body: &[u8],
    fresh: impl FnOnce() -> Fut,
    owner_of: impl FnOnce(&T) -> UserId,
) -> Result<Response, ApiError>
where
    T: serde::Serialize,
    Fut: Future<Output = Result<(StatusCode, T), ApiError>>,
{
    let key = idempotency_key(headers)?.map(|k| format!("{scope}:{k}"));
    let request_hash = sha256_hex(body);
    if let Some(key) = &key
        && let Some(stored) = ab_db::submissions::get_idempotent_by_key(pool, key).await?
    {
        return replay(stored, &request_hash);
    }
    let (status, dto, value) = run(fresh).await?;
    if let Some(key) = &key {
        ab_db::submissions::store_idempotent(
            pool,
            owner_of(&dto),
            key,
            &request_hash,
            i32::from(status.as_u16()),
            &value,
        )
        .await?;
    }
    Ok((status, Json(value)).into_response())
}

/// The action plus its serialized reply.
async fn run<T, Fut>(
    fresh: impl FnOnce() -> Fut,
) -> Result<(StatusCode, T, serde_json::Value), ApiError>
where
    T: serde::Serialize,
    Fut: Future<Output = Result<(StatusCode, T), ApiError>>,
{
    let (status, dto) = fresh().await?;
    let value = serde_json::to_value(&dto)
        .map_err(|err| Error::internal("serialize idempotent reply", err))?;
    Ok((status, dto, value))
}

/// Reservation heartbeat period — a third of the stale window.
const IDEMPOTENT_HEARTBEAT: std::time::Duration = std::time::Duration::from_secs(10);

/// How long a concurrent duplicate waits for the owner's reply.
// ponytail: 50 ms polling of the key row; LISTEN/NOTIFY if the wait shows up in latency.
const IN_PROGRESS_WAIT: std::time::Duration = std::time::Duration::from_secs(5);
const IN_PROGRESS_POLL: std::time::Duration = std::time::Duration::from_millis(50);

fn replay(
    stored: ab_db::submissions::IdempotentResponse,
    request_hash: &str,
) -> Result<Response, ApiError> {
    if stored.request_hash != request_hash {
        return Err(ApiError(Error::validation(vec![FieldError {
            field: "Idempotency-Key".into(),
            code: "reused".into(),
            message: "Idempotency-Key was already used with a different request body".into(),
        }])));
    }
    let status = StatusCode::from_u16(u16::try_from(stored.status_code).unwrap_or(500))
        .unwrap_or(StatusCode::OK);
    Ok((status, Json(stored.response)).into_response())
}

/// Reserve the key or replay the owner's reply; `Ok(None)` means this
/// caller owns the key and must run the action.
async fn reserve_or_replay(
    pool: &sqlx::PgPool,
    user_id: UserId,
    key: &str,
    request_hash: &str,
) -> Result<Option<Response>, ApiError> {
    let deadline = tokio::time::Instant::now() + IN_PROGRESS_WAIT;
    loop {
        if ab_db::submissions::reserve_idempotent(pool, user_id, key, request_hash).await? {
            return Ok(None);
        }
        // Released between the failed insert and this read: race again.
        let Some(stored) = ab_db::submissions::get_idempotent(pool, user_id, key).await? else {
            continue;
        };
        if stored.status_code != ab_db::submissions::IDEMPOTENT_IN_PROGRESS
            || stored.request_hash != request_hash
        {
            return replay(stored, request_hash).map(Some);
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(ApiError(Error::app(
                ab_core::ErrorCode::IdempotencyInProgress,
                "the same request is still being processed",
            )));
        }
        tokio::time::sleep(IN_PROGRESS_POLL).await;
    }
}
