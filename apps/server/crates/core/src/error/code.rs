//! The closed error-code registry.
//!
//! Every user-visible failure mode has exactly one entry here. The wire code is
//! the kebab-case string; the frontend's i18n catalogs key off it. Adding a code:
//! add one row to the macro invocation — the snapshot test below makes the
//! addition visible in the diff, and a sync script propagates codes to the web
//! app's message catalogs (phase P9).

use serde::{Deserialize, Serialize};

macro_rules! error_codes {
    ($( $variant:ident => ($code:literal, $status:literal, $title:literal) ),+ $(,)?) => {
        /// Stable, closed set of machine-readable error codes.
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, utoipa::ToSchema)]
        #[serde(rename_all = "kebab-case")]
        pub enum ErrorCode {
            $($variant),+
        }

        impl ErrorCode {
            /// The wire representation (matches serde's kebab-case rename).
            #[must_use]
            pub const fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $code),+ }
            }

            /// Canonical HTTP status for this code.
            #[must_use]
            pub const fn status(self) -> u16 {
                match self { $(Self::$variant => $status),+ }
            }

            /// Human-readable English title (RFC 9457 `title`).
            #[must_use]
            pub const fn title(self) -> &'static str {
                match self { $(Self::$variant => $title),+ }
            }

            /// Every registered code — used by the registry snapshot test and
            /// the i18n sync script.
            pub const ALL: &'static [Self] = &[$(Self::$variant),+];
        }
    };
}

error_codes! {
    // Generic
    Internal => ("internal", 500, "Internal server error"),
    NotFound => ("not-found", 404, "Not found"),
    Forbidden => ("forbidden", 403, "Forbidden"),
    Unauthenticated => ("unauthenticated", 401, "Authentication required"),
    Conflict => ("conflict", 409, "Conflict"),
    ValidationFailed => ("validation-failed", 422, "Validation failed"),
    RateLimited => ("rate-limited", 429, "Too many requests"),
    PayloadTooLarge => ("payload-too-large", 413, "Payload too large"),
    ServiceUnavailable => ("service-unavailable", 503, "Service temporarily unavailable"),
    // Auth
    InvalidCredentials => ("invalid-credentials", 401, "Invalid credentials"),
    MfaRequired => ("mfa-required", 401, "Multi-factor authentication required"),
    SessionExpired => ("session-expired", 401, "Session expired"),
    CsrfRejected => ("csrf-rejected", 403, "Cross-site request rejected"),
    AccountDisabled => ("account-disabled", 403, "Account is disabled"),
    GoogleOauthExpired => ("google-oauth-expired", 400, "Google sign-in expired or invalid"),
    InvalidTotpCode => ("invalid-totp-code", 400, "Invalid one-time code"),
    // Code execution
    CodeRunnerDegraded => ("code-runner-degraded", 503, "Code runner temporarily unavailable"),
    CompileError => ("compile-error", 422, "Source code does not compile"),
    LanguageNotAllowed => ("language-not-allowed", 422, "Programming language not allowed"),
}

impl std::fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::ErrorCode;
    use std::collections::BTreeMap;

    /// The full registry, snapshotted: every addition/removal shows up in review.
    #[test]
    fn registry_snapshot() {
        let registry: BTreeMap<&str, (u16, &str)> = ErrorCode::ALL
            .iter()
            .map(|c| (c.as_str(), (c.status(), c.title())))
            .collect();
        insta::assert_json_snapshot!(registry);
    }

    #[test]
    fn codes_are_unique_and_kebab_case() {
        let mut seen = std::collections::HashSet::new();
        for code in ErrorCode::ALL {
            assert!(seen.insert(code.as_str()), "duplicate code {code}");
            assert!(
                code.as_str()
                    .chars()
                    .all(|ch| ch.is_ascii_lowercase() || ch == '-'),
                "code {code} is not kebab-case"
            );
        }
    }

    #[test]
    fn serde_matches_as_str() {
        for code in ErrorCode::ALL {
            let json = serde_json::to_value(code).unwrap();
            assert_eq!(json, serde_json::Value::String(code.as_str().to_owned()));
        }
    }
}
