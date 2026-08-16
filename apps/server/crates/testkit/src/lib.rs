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

/// Redis for tests: CI sets `TEST_REDIS_URL` (service on 6379); locally the
/// podman container maps 6380 (see AGENTS.md).
#[must_use]
pub fn test_redis_url() -> String {
    std::env::var("TEST_REDIS_URL").unwrap_or_else(|_| "redis://localhost:6380".into())
}

pub struct TestApp {
    router: Router,
    pub pool: PgPool,
    pub sessions: ab_domain::identity::SessionStore,
}

impl TestApp {
    /// Build the full application (real router, real middleware) over the
    /// given pool + the test Redis. Use with `#[sqlx::test]`.
    pub async fn spawn(pool: PgPool) -> Self {
        let sessions = ab_domain::identity::SessionStore::connect(&test_redis_url())
            .await
            .expect("test redis reachable (see AGENTS.md local dev stack)");
        let state = ab_api::AppState::new(pool.clone(), test_config(), sessions.clone());
        let router = ab_api::build_router(state).expect("test router must build");
        Self {
            router,
            pool,
            sessions,
        }
    }

    /// Mint a live session with the given grants; returns the `Cookie` header
    /// value for authenticated requests.
    pub async fn mint_session(&self, permissions: &[&str]) -> MintedSession {
        let user_id = ab_core::id::UserId::new();
        self.mint_session_for(user_id, permissions).await
    }

    pub async fn mint_session_for(
        &self,
        user_id: ab_core::id::UserId,
        permissions: &[&str],
    ) -> MintedSession {
        let session_id = self
            .sessions
            .create(ab_domain::identity::NewSession {
                user_id,
                zitadel_user_id: format!("z-{user_id}"),
                zitadel_session_id: "zs-test".into(),
                zitadel_session_token: "ztok-test".into(),
                roles: vec!["test".into()],
                permissions: permissions.iter().map(ToString::to_string).collect(),
                rbac_version: 1,
                ip: None,
                user_agent: Some("testkit".into()),
            })
            .await
            .expect("mint session");
        MintedSession {
            user_id,
            cookie: format!("{}={session_id}", ab_api::extract::SESSION_COOKIE),
        }
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

    pub async fn get_as(&self, session: &MintedSession, path: &str) -> TestResponse {
        self.send(
            Request::builder()
                .uri(path)
                .header(header::COOKIE, &session.cookie)
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

pub struct MintedSession {
    pub user_id: ab_core::id::UserId,
    /// Ready-to-use `Cookie` header value.
    pub cookie: String,
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
