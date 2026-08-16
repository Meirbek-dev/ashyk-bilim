//! `ab-testkit` — the shared test harness (dev-dependency only).
//!
//! [`TestApp`] wraps the real router (full middleware stack) around a test
//! database pool, the test Redis, and a wiremock Zitadel — pair it with
//! `#[sqlx::test]` for a fresh migrated DB per test. Requests go through
//! `tower::ServiceExt::oneshot`; no sockets.
//!
//! Tests may use `unwrap`/`expect`/`panic` freely — this crate is never in a
//! production dependency graph, and panics ARE test failures here.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::missing_panics_doc
)]

use std::sync::Arc;

use ab_clients::zitadel::{ZitadelClient, ZitadelConfig};
use ab_core::config::{
    Config, DatabaseConfig, Environment, RedisConfig, ServerConfig, TelemetryConfig,
};
use ab_core::id::UserId;
use ab_domain::identity::IdentityService;
use axum::Router;
use axum::body::Body;
use axum::http::{HeaderMap, Request, StatusCode, header};
use secrecy::SecretString;
use sqlx::PgPool;
use tower::ServiceExt;
use wiremock::MockServer;

/// Redis for tests: CI sets `TEST_REDIS_URL` (service on 6379); locally the
/// podman container maps 6380 (see AGENTS.md).
#[must_use]
pub fn test_redis_url() -> String {
    std::env::var("TEST_REDIS_URL").unwrap_or_else(|_| "redis://localhost:6380".into())
}

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
        zitadel: None,
        google: None,
        storage: None,
        telemetry: TelemetryConfig {
            json_logs: false,
            otlp_endpoint: None,
        },
    }
}

pub struct TestApp {
    router: Router,
    pub pool: PgPool,
    pub sessions: ab_domain::identity::SessionStore,
    /// Wiremock standing in for Zitadel — mount fixtures per test.
    pub zitadel: MockServer,
    /// Wiremock standing in for Google's OAuth endpoints.
    pub google: MockServer,
}

/// The Google OAuth client id used by the test app (id_token `aud` must match).
pub const TEST_GOOGLE_CLIENT_ID: &str = "test-google-client";

impl TestApp {
    /// Build the full application (real router, real middleware) over the
    /// given pool + test Redis + fresh Zitadel/Google mocks. Use with
    /// `#[sqlx::test]`.
    pub async fn spawn(pool: PgPool) -> Self {
        let zitadel = MockServer::start().await;
        let google = MockServer::start().await;
        let sessions = ab_domain::identity::SessionStore::connect(&test_redis_url())
            .await
            .expect("test redis reachable (see AGENTS.md local dev stack)");
        let zitadel_client = Arc::new(
            ZitadelClient::new(ZitadelConfig {
                base_url: zitadel.uri(),
                pat: SecretString::from("test-pat"),
            })
            .expect("test zitadel client"),
        );
        let google_client = Arc::new(
            ab_clients::google::GoogleClient::new(ab_clients::google::GoogleConfig {
                client_id: TEST_GOOGLE_CLIENT_ID.into(),
                client_secret: SecretString::from("test-google-secret"),
                redirect_uri: "http://localhost/api/v2/auth/google/callback".into(),
                token_endpoint: Some(format!("{}/token", google.uri())),
                userinfo_endpoint: Some(format!("{}/userinfo", google.uri())),
                authorization_endpoint: Some(format!("{}/authorize", google.uri())),
            })
            .expect("test google client"),
        );
        let identity = IdentityService::new(pool.clone(), sessions.clone(), zitadel_client.clone());
        let google_auth = ab_domain::identity::GoogleAuthService::new(
            pool.clone(),
            sessions.clone(),
            zitadel_client,
            google_client,
        );
        let storage = Arc::new(
            ab_clients::storage::StorageClient::new(&ab_clients::storage::StorageConfig {
                endpoint: std::env::var("TEST_S3_ENDPOINT")
                    .unwrap_or_else(|_| "http://localhost:9002".into()),
                access_key: "ashyq-dev".into(),
                secret_key: SecretString::from("ashyq-dev-secret"),
                public_bucket: "ab-public".into(),
                private_bucket: "ab-private".into(),
            })
            .expect("test storage client"),
        );
        let state = ab_api::AppState::new(
            pool.clone(),
            test_config(),
            identity,
            Some(google_auth),
            storage,
        );
        let router = ab_api::build_router(state).expect("test router must build");
        Self {
            router,
            pool,
            sessions,
            zitadel,
            google,
        }
    }

    /// Insert a user row (Zitadel-linked) with the given system roles.
    pub async fn create_user(&self, username: &str, email: &str, roles: &[&str]) -> UserId {
        let id: uuid::Uuid = sqlx::query_scalar(
            "INSERT INTO users (zitadel_user_id, username, email, display_name)
             VALUES ($1, $2, $3, $2) RETURNING id",
        )
        .bind(format!("z-{username}"))
        .bind(username)
        .bind(email)
        .fetch_one(&self.pool)
        .await
        .expect("insert user");
        for role in roles {
            sqlx::query(
                "INSERT INTO user_roles (user_id, role_id)
                 SELECT $1, id FROM roles WHERE slug = $2",
            )
            .bind(id)
            .bind(role)
            .execute(&self.pool)
            .await
            .expect("assign role");
        }
        UserId(id)
    }

    /// Mint a live session with the given grants; returns the `Cookie` header
    /// value for authenticated requests.
    pub async fn mint_session(&self, permissions: &[&str]) -> MintedSession {
        let user_id = UserId::new();
        self.mint_session_for(user_id, permissions).await
    }

    pub async fn mint_session_for(&self, user_id: UserId, permissions: &[&str]) -> MintedSession {
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

    pub async fn post_as(
        &self,
        session: &MintedSession,
        path: &str,
        body: &serde_json::Value,
    ) -> TestResponse {
        self.send(
            Request::builder()
                .method("POST")
                .uri(path)
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &session.cookie)
                .body(Body::from(body.to_string()))
                .expect("request build"),
        )
        .await
    }

    pub async fn delete_as(&self, session: &MintedSession, path: &str) -> TestResponse {
        self.send(
            Request::builder()
                .method("DELETE")
                .uri(path)
                .header(header::COOKIE, &session.cookie)
                .body(Body::empty())
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
    pub user_id: UserId,
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

    /// The `ab_session=<value>` pair from `Set-Cookie`, as a `Cookie` header
    /// value — for continuing an authenticated flow after login.
    #[must_use]
    pub fn session_cookie(&self) -> Option<String> {
        self.headers
            .get_all(header::SET_COOKIE)
            .iter()
            .find_map(|v| {
                let raw = v.to_str().ok()?;
                let pair = raw.split(';').next()?.trim();
                pair.starts_with(ab_api::extract::SESSION_COOKIE)
                    .then(|| pair.to_owned())
            })
    }
}
