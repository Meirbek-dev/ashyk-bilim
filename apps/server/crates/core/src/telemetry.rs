//! Tracing/telemetry initialization.
//!
//! Scaffold state: structured logging (pretty in dev, JSON in prod) with
//! `RUST_LOG`-style env filtering. OTLP export to Logfire is completed in
//! slice 0.2's follow-up once the opentelemetry crate set is resolved against
//! a live registry (see EXECUTION-PLAN.md).

use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::EnvFilter;

use crate::config::TelemetryConfig;

/// Initialize the global subscriber. Idempotent: repeated calls are no-ops
/// (needed for tests that spawn the app multiple times).
pub fn init(config: &TelemetryConfig) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let registry = tracing_subscriber::registry().with(filter);
    if config.json_logs {
        let _ = registry
            .with(tracing_subscriber::fmt::layer().json().with_current_span(true))
            .try_init();
    } else {
        let _ = registry.with(tracing_subscriber::fmt::layer().pretty()).try_init();
    }
    if config.otlp_endpoint.is_some() {
        tracing::warn!("otlp_endpoint configured but OTLP export is not wired yet (slice 0.2)");
    }
}
