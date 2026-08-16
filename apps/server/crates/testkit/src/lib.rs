//! `ab-testkit` — the shared test harness (dev-dependency only).
//!
//! [`TestApp`] wraps the real router (full middleware stack) around a test
//! database pool — pair it with `#[sqlx::test]` for a fresh migrated DB per
//! test. Requests go through `tower::ServiceExt::oneshot`; no sockets.
//!
//! Growing with the phases: session minting + `as_actor` helpers land with
//! P1 identity; wiremock stub library (Zitadel/Judge0/Resend/LLM) lands with
//! each client slice; `fake` factories land with the first entities.
//!
//! Tests may use `unwrap`/`expect` freely — this crate is never in a
//! production dependency graph, and panics ARE test failures here.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::missing_panics_doc
)]

use ab_core::config::{
    Config, DatabaseConfig, Environment, RedisConfig, ServerConfig, TelemetryConfig,
};
use axum::Router;
use axum::body::Body;
use axum::http::{HeaderMap, Request, StatusCode, header};
use secrecy::SecretString;
use sqlx::PgPool;
use tower::ServiceExt;

/// A deterministic development config for tests. The database URL is unused —
/// the pool is injected directly.
#[must_use]
pub fn test_config() -> Config {
    Config {
        environment: Environment::Development,
        server: ServerConfig {
            host: "127.0.0.1".into(),
            port: 0,
            cors_origins: vec![],
        },
        database: DatabaseConfig {
            url: SecretString::from("postgres://injected-pool-unused"),
            max_connections: 5,
            min_connections: 0,
        },
        redis: RedisConfig { url: None },
        telemetry: TelemetryConfig {
            json_logs: false,
            otlp_endpoint: None,
        },
    }
}

pub struct TestApp {
    router: Router,
    pub pool: PgPool,
}

impl TestApp {
    /// Build the full application (real router, real middleware) over the
    /// given pool. Use with `#[sqlx::test]`.
    #[must_use]
    pub fn spawn(pool: PgPool) -> Self {
        let state = ab_api::AppState::new(pool.clone(), test_config());
        let router = ab_api::build_router(state).expect("test router must build");
        Self { router, pool }
    }

    pub async fn get(&self, path: &str) -> TestResponse {
        self.send(
            Request::builder()
                .uri(path)
                .body(Body::empty())
                .expect("request build"),
        )
        .await
    }

    pub async fn post_json(&self, path: &str, body: &serde_json::Value) -> TestResponse {
        self.send(
            Request::builder()
                .method("POST")
                .uri(path)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.to_string()))
                .expect("request build"),
        )
        .await
    }

    /// Escape hatch for custom requests (headers, methods, raw bodies).
    pub async fn send(&self, request: Request<Body>) -> TestResponse {
        let response = self
            .router
            .clone()
            .oneshot(request)
            .await
            .expect("infallible");
        let (parts, body) = response.into_parts();
        let bytes = axum::body::to_bytes(body, 8 * 1024 * 1024)
            .await
            .expect("read body");
        TestResponse {
            status: parts.status,
            headers: parts.headers,
            body: bytes.to_vec(),
        }
    }
}

pub struct TestResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    body: Vec<u8>,
}

impl TestResponse {
    /// Parse the body as JSON, panicking with the raw body on failure.
    #[must_use]
    pub fn json(&self) -> serde_json::Value {
        serde_json::from_slice(&self.body).unwrap_or_else(|err| {
            panic!(
                "response body is not JSON ({err}): {:?}",
                String::from_utf8_lossy(&self.body)
            )
        })
    }

    #[must_use]
    pub fn content_type(&self) -> &str {
        self.headers
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
    }
}
