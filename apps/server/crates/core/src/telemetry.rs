//! Tracing initialization: JSON logs (production) or pretty logs (dev) on
//! stdout, filtered by `RUST_LOG` (default `info`). No span export: the
//! container log is the only sink (REWRITE 4.6).

use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

use crate::config::TelemetryConfig;

/// Colour only on a terminal: a redirected log (dev stack, CI) stays plain
/// text, and `NO_COLOR` (non-empty, no-color.org) turns it off everywhere.
fn ansi() -> bool {
    use std::io::IsTerminal as _;
    std::io::stdout().is_terminal() && std::env::var_os("NO_COLOR").is_none_or(|v| v.is_empty())
}

/// Initialize the global subscriber. Idempotent for tests (subsequent calls
/// are no-ops).
pub fn init(config: &TelemetryConfig) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let registry = tracing_subscriber::registry().with(filter);
    if config.json_logs {
        let _ = registry
            .with(
                tracing_subscriber::fmt::layer()
                    .json()
                    .with_current_span(true),
            )
            .try_init();
    } else {
        let _ = registry
            .with(tracing_subscriber::fmt::layer().pretty().with_ansi(ansi()))
            .try_init();
    }
}
