use ab_core::id::UserId;
use serde::Serialize;
use utoipa::ToSchema;

/// The current session, as the frontend sees it (client-side permission
/// gating mirrors the legacy `Session` contract).
#[derive(Debug, Serialize, ToSchema)]
pub struct SessionInfo {
    pub user_id: UserId,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
}
