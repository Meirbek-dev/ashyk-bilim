use ab_core::id::UserId;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Password login. No `Debug` derive — the password must never format.
#[derive(Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct LoginRequest {
    /// Username or email.
    #[garde(length(min = 1, max = 320))]
    pub login: String,
    #[garde(length(min = 1, max = 200))]
    pub password: String,
}

/// The current session, as the frontend sees it (client-side permission
/// gating mirrors the legacy `Session` contract).
#[derive(Debug, Serialize, ToSchema)]
pub struct SessionInfo {
    pub user_id: UserId,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
}

/// One of the caller's live sessions. `handle` is a non-bearer identifier
/// (raw session ids never leave the server).
#[derive(Debug, Serialize, ToSchema)]
pub struct SessionSummary {
    pub handle: String,
    pub current: bool,
    pub created_at_unix: i64,
    pub last_seen_unix: i64,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
}

impl From<ab_domain::identity::auth::SessionSummary> for SessionSummary {
    fn from(s: ab_domain::identity::auth::SessionSummary) -> Self {
        Self {
            handle: s.handle,
            current: s.current,
            created_at_unix: s.created_at_unix,
            last_seen_unix: s.last_seen_unix,
            ip: s.ip,
            user_agent: s.user_agent,
        }
    }
}
