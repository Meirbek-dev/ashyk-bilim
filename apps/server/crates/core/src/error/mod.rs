//! The single error model for the whole workspace.
//!
//! Every fallible function in db/clients/domain returns [`Result`]. The HTTP
//! mapping (RFC 9457 `problem+json`) lives in `ab-api::error`; this module is
//! transport-agnostic.

mod code;

pub use code::ErrorCode;
use serde::Serialize;

/// Workspace-wide result alias.
pub type Result<T, E = Error> = core::result::Result<T, E>;

/// A single field-level validation failure. `code` is a stable machine key the
/// frontend translates (e.g. `required`, `too-long`); `message` is English.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, utoipa::ToSchema)]
pub struct FieldError {
    pub field: String,
    pub code: String,
    pub message: String,
}

impl FieldError {
    /// `{field}`/`required` — the field is blank.
    #[must_use]
    pub fn required(field: &str) -> Self {
        Self {
            field: field.into(),
            code: "required".into(),
            message: format!("{field} must not be blank"),
        }
    }
}

/// The shared "blank string" rule (UX-106).
///
/// `value` trimmed, or 422 `{field}`/`required` when nothing is left —
/// `""` and `"   "` answer the same code. DTOs that route a name through
/// it carry no garde `min = 1`.
pub fn required_str<'a>(field: &str, value: &'a str) -> Result<&'a str> {
    let value = value.trim();
    if value.is_empty() {
        return Err(Error::required(field));
    }
    Ok(value)
}

/// A page size within `1..=max`, or 422 `limit`/`out-of-range` (UX-146:
/// the grading lists refuse a silent clamp, like the work queue does).
pub fn page_limit(limit: i64, max: i64) -> Result<i64> {
    if !(1..=max).contains(&limit) {
        return Err(Error::validation(vec![FieldError {
            field: "limit".into(),
            code: "out-of-range".into(),
            message: format!("limit must be between 1 and {max}"),
        }]));
    }
    Ok(limit)
}

/// The workspace error type.
///
/// - `App` carries a stable [`ErrorCode`] and is safe to show to clients.
/// - `Validation` renders as 422 with per-field codes.
/// - Infrastructure variants (`Db`, `Internal`, `Config`) render as opaque 500s;
///   details go to tracing only.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{code}: {message}")]
    App {
        code: ErrorCode,
        message: String,
        details: Option<serde_json::Value>,
    },

    #[error("validation failed")]
    Validation { field_errors: Vec<FieldError> },

    #[error("configuration error: {message}")]
    Config { message: String },

    #[error(transparent)]
    Db(#[from] sqlx::Error),

    #[error("{context}")]
    Internal {
        context: String,
        #[source]
        source: anyhow::Error,
    },
}

impl Error {
    pub fn app(code: ErrorCode, message: impl Into<String>) -> Self {
        Self::App {
            code,
            message: message.into(),
            details: None,
        }
    }

    /// An application error carrying machine-readable `details`
    /// (e.g. the expected/actual versions of an optimistic-lock conflict).
    pub fn app_with_details(
        code: ErrorCode,
        message: impl Into<String>,
        details: serde_json::Value,
    ) -> Self {
        Self::App {
            code,
            message: message.into(),
            details: Some(details),
        }
    }

    pub fn not_found(what: impl std::fmt::Display) -> Self {
        Self::app(ErrorCode::NotFound, format!("{what} not found"))
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::app(ErrorCode::Forbidden, message)
    }

    pub fn unauthenticated() -> Self {
        Self::app(ErrorCode::Unauthenticated, "authentication required")
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::app(ErrorCode::Conflict, message)
    }

    pub fn config(message: impl Into<String>) -> Self {
        Self::Config {
            message: message.into(),
        }
    }

    pub fn internal(context: impl Into<String>, source: impl Into<anyhow::Error>) -> Self {
        Self::Internal {
            context: context.into(),
            source: source.into(),
        }
    }

    pub const fn validation(field_errors: Vec<FieldError>) -> Self {
        Self::Validation { field_errors }
    }

    /// 422 `{field}`/`required` for a blank string.
    pub fn required(field: &str) -> Self {
        Self::validation(vec![FieldError::required(field)])
    }

    /// The stable wire code for this error.
    #[must_use]
    pub const fn code(&self) -> ErrorCode {
        match self {
            Self::App { code, .. } => *code,
            Self::Validation { .. } => ErrorCode::ValidationFailed,
            Self::Config { .. } | Self::Db(_) | Self::Internal { .. } => ErrorCode::Internal,
        }
    }

    /// Whether details of this error are safe to expose to API clients.
    #[must_use]
    pub const fn is_public(&self) -> bool {
        matches!(self, Self::App { .. } | Self::Validation { .. })
    }
}
