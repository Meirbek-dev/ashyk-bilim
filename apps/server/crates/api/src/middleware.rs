//! Cross-cutting request middleware beyond tower-http layers.

use ab_core::{Error, ErrorCode};
use axum::extract::Request;
use axum::http::Method;
use axum::middleware::Next;
use axum::response::Response;

use crate::error::ApiError;

/// CSRF guard for the cookie-auth BFF (ARCHITECTURE §6).
///
/// Browsers send `Sec-Fetch-Site` on every request; a mutating request marked
/// `cross-site` is rejected outright — cookies are our only credential, and no
/// legitimate cross-site caller exists. (Mirrors the legacy middleware's
/// posture; `SameSite=Lax` on the cookie is the second belt.)
pub async fn csrf_guard(request: Request, next: Next) -> Result<Response, ApiError> {
    let mutating = matches!(
        *request.method(),
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    );
    if mutating {
        let sec_fetch_site = request
            .headers()
            .get("sec-fetch-site")
            .and_then(|v| v.to_str().ok());
        if sec_fetch_site == Some("cross-site") {
            return Err(ApiError(Error::app(
                ErrorCode::CsrfRejected,
                "cross-site mutation rejected",
            )));
        }
    }
    Ok(next.run(request).await)
}

tokio::task_local! {
    /// The `x-request-id` of the request being handled — read by the error
    /// mapper so the problem+json body carries the same id as the header.
    static REQUEST_ID: String;
}

/// Runs the rest of the stack inside a [`REQUEST_ID`] scope (the id is the
/// one `SetRequestIdLayer` generated or propagated).
pub async fn request_id_scope(request: Request, next: Next) -> Response {
    let id = request
        .extensions()
        .get::<tower_http::request_id::RequestId>()
        .and_then(|id| id.header_value().to_str().ok())
        .map(ToOwned::to_owned);
    match id {
        Some(id) => REQUEST_ID.scope(id, next.run(request)).await,
        None => next.run(request).await,
    }
}

/// The current request's id, when inside a handled request.
#[must_use]
pub fn current_request_id() -> Option<String> {
    REQUEST_ID.try_with(Clone::clone).ok()
}
