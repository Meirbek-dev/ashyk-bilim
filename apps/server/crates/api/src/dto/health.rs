use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct Health {
    /// Always `"ok"` when the endpoint answers.
    pub status: &'static str,
    /// Server crate version.
    pub version: &'static str,
}

impl Health {
    #[must_use]
    pub const fn ok() -> Self {
        Self {
            status: "ok",
            version: env!("CARGO_PKG_VERSION"),
        }
    }
}
