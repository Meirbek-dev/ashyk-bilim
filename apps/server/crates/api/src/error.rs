//! HTTP mapping of [`ab_core::Error`]: RFC 9457 `application/problem+json`,
//! extended with `code`, `field_errors`, and `request_id` (ARCHITECTURE §5).
//!
//! Implemented exactly once. Handlers return [`ApiResult<T>`] and use `?`;
//! they never construct error responses themselves.

use ab_core::{Error, ErrorCode, FieldError};
use axum::Json;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use utoipa::ToSchema;

pub const PROBLEM_CONTENT_TYPE: &str = "application/problem+json";
const ERROR_DOC_BASE: &str = "https://docs.ashyq-bilim.dev/errors";

pub type ApiResult<T> = Result<T, ApiError>;

/// Newtype over [`ab_core::Error`] (orphan rules prevent implementing
/// `IntoResponse` on the core type directly). `?` converts via `From`.
#[derive(Debug)]
pub struct ApiError(pub Error);

impl<E: Into<Error>> From<E> for ApiError {
    fn from(err: E) -> Self {
        Self(err.into())
    }
}

/// The wire shape of every error response.
#[derive(Debug, Serialize, ToSchema)]
pub struct Problem {
    /// Stable documentation URI for this error class.
    #[serde(rename = "type")]
    pub type_uri: String,
    pub status: u16,
    /// Stable machine code — the frontend's i18n key.
    pub code: ErrorCode,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub field_errors: Vec<FieldError>,
    /// Correlation id; also present as the `x-request-id` response header.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}

impl Problem {
    #[must_use]
    pub fn from_error(err: &Error) -> Self {
        let code = err.code();
        let (detail, field_errors) = match err {
            Error::App { message, .. } => (Some(message.clone()), Vec::new()),
            Error::Validation { field_errors } => (None, field_errors.clone()),
            // Internal family: opaque on the wire, loud in the logs.
            Error::Config { .. } | Error::Db(_) | Error::Internal { .. } => (None, Vec::new()),
        };
        Self {
            type_uri: format!("{ERROR_DOC_BASE}/{code}"),
            status: code.status(),
            code,
            title: code.title().to_owned(),
            detail,
            field_errors,
            request_id: None,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let err = self.0;
        if err.is_public() {
            tracing::debug!(error = %err, code = %err.code(), "request failed");
        } else {
            // Full chain to telemetry; opaque 500 to the client.
            tracing::error!(error = ?err, "internal error");
        }
        let problem = Problem::from_error(&err);
        let status =
            StatusCode::from_u16(problem.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        let mut response = (status, Json(problem)).into_response();
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static(PROBLEM_CONTENT_TYPE),
        );
        response
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn app_errors_expose_detail() {
        let err = Error::app(ErrorCode::Conflict, "attempt already submitted");
        let problem = Problem::from_error(&err);
        assert_eq!(problem.status, 409);
        assert_eq!(problem.code, ErrorCode::Conflict);
        assert_eq!(problem.detail.as_deref(), Some("attempt already submitted"));
        insta::assert_json_snapshot!(problem);
    }

    #[test]
    fn internal_errors_are_opaque() {
        let err = Error::internal("boom", std::io::Error::other("secret detail"));
        let problem = Problem::from_error(&err);
        assert_eq!(problem.status, 500);
        assert_eq!(problem.detail, None);
        assert!(!serde_json::to_string(&problem).unwrap().contains("secret"));
    }

    #[test]
    fn validation_errors_carry_field_codes() {
        let err = Error::validation(vec![FieldError {
            field: "title".into(),
            code: "required".into(),
            message: "title is required".into(),
        }]);
        let problem = Problem::from_error(&err);
        assert_eq!(problem.status, 422);
        assert_eq!(problem.field_errors.len(), 1);
    }
}
