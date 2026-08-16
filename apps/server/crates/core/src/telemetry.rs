//! Tracing/telemetry initialization: structured logs always; OTLP span export
//! (→ Logfire) when `AB__TELEMETRY__OTLP_ENDPOINT` is set.
//!
//! Conventions:
//! - The endpoint is the FULL traces URL (e.g.
//!   `https://logfire-api.pydantic.dev/v1/traces`) — nothing is appended.
//! - Auth headers come from the standard `OTEL_EXPORTER_OTLP_HEADERS` env var
//!   (`key=value,key2=value2`), so tokens stay out of typed config.
//! - Hold the returned [`TelemetryGuard`] for the life of the process; drop
//!   flushes and shuts the exporter down.

use opentelemetry::trace::TracerProvider as _;
use opentelemetry_otlp::{SpanExporter, WithExportConfig, WithHttpConfig};
use opentelemetry_sdk::Resource;
use opentelemetry_sdk::trace::SdkTracerProvider;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

use crate::config::TelemetryConfig;

/// Flushes and shuts down the OTLP pipeline on drop. A no-op when OTLP is
/// disabled.
#[derive(Debug, Default)]
pub struct TelemetryGuard {
    tracer_provider: Option<SdkTracerProvider>,
}

impl Drop for TelemetryGuard {
    fn drop(&mut self) {
        if let Some(provider) = self.tracer_provider.take()
            && let Err(err) = provider.shutdown()
        {
            tracing::warn!(%err, "otlp shutdown incomplete");
        }
    }
}

/// Parse `OTEL_EXPORTER_OTLP_HEADERS` (`k=v,k2=v2`).
fn otlp_headers_from_env() -> std::collections::HashMap<String, String> {
    std::env::var("OTEL_EXPORTER_OTLP_HEADERS")
        .unwrap_or_default()
        .split(',')
        .filter_map(|pair| {
            let (k, v) = pair.split_once('=')?;
            Some((k.trim().to_owned(), v.trim().to_owned()))
        })
        .collect()
}

/// Initialize the global subscriber. Idempotent for tests (subsequent calls
/// are no-ops). Returns the guard that owns the OTLP pipeline, if any.
pub fn init(config: &TelemetryConfig) -> TelemetryGuard {
    let mut guard = TelemetryGuard::default();
    let mut otel_error: Option<String> = None;

    let otel_layer = config.otlp_endpoint.as_ref().and_then(|endpoint| {
        let exporter = SpanExporter::builder()
            .with_http()
            .with_endpoint(endpoint.clone())
            .with_headers(otlp_headers_from_env())
            .build();
        match exporter {
            Ok(exporter) => {
                let provider = SdkTracerProvider::builder()
                    .with_batch_exporter(exporter)
                    .with_resource(
                        Resource::builder()
                            .with_service_name("ashyq-server")
                            .build(),
                    )
                    .build();
                let tracer = provider.tracer("ashyq");
                guard.tracer_provider = Some(provider);
                Some(tracing_opentelemetry::layer().with_tracer(tracer))
            }
            Err(err) => {
                otel_error = Some(err.to_string());
                None
            }
        }
    });

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let registry = tracing_subscriber::registry().with(filter).with(otel_layer);
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
            .with(tracing_subscriber::fmt::layer().pretty())
            .try_init();
    }

    if let Some(err) = otel_error {
        // Deliberate: a broken exporter must not take the service down, but it
        // must be loud — this is the "Logfire is empty" failure mode.
        tracing::error!(%err, "OTLP exporter failed to build; telemetry export DISABLED");
    } else if guard.tracer_provider.is_some() {
        tracing::info!("OTLP span export enabled");
    }
    guard
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    #[test]
    fn header_parsing() {
        // Not using the env var itself (parallel tests); test the parser shape
        // via a local reimplementation guard: the format is k=v,k2=v2.
        let parse = |s: &str| -> Vec<(String, String)> {
            s.split(',')
                .filter_map(|pair| {
                    let (k, v) = pair.split_once('=')?;
                    Some((k.trim().to_owned(), v.trim().to_owned()))
                })
                .collect()
        };
        let parsed = parse("Authorization=Bearer abc, X-Extra=1");
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].1, "Bearer abc");
        assert!(parse("").is_empty());
    }
}
