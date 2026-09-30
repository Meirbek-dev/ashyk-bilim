//! Work that must outlive the client connection.

use ab_core::Error;

use crate::error::ApiError;

/// Runs `fut` on its own task and awaits it.
///
/// Hyper drops the handler future when the client disconnects, which must
/// not abort a sequence past its first durable step (BUG-213/214: a Zitadel
/// user without a `users` row, a disabled account whose sessions were never
/// revoked, a committed grant change never propagated). A drop leaves the
/// task running; a panic is a 500 after the fact.
pub async fn detached<T: Send + 'static>(
    fut: impl Future<Output = Result<T, ApiError>> + Send + 'static,
) -> Result<T, ApiError> {
    tokio::spawn(fut)
        .await
        .unwrap_or_else(|join| Err(ApiError(Error::internal("detached action", join))))
}
