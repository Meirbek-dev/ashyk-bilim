//! Router assembly + middleware stack + OpenAPI document.

use std::time::Duration;

use ab_core::config::Config;
use ab_core::{Error, Result};
use axum::http::{HeaderName, HeaderValue, Method, StatusCode, header};
use axum::routing::get;
use axum::{Json, Router};
use tower::ServiceBuilder;
use tower_http::catch_panic::CatchPanicLayer;
use tower_http::compression::CompressionLayer;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use utoipa_scalar::{Scalar, Servable};

use crate::routes;
use crate::state::AppState;

pub const API_PREFIX: &str = "/api/v2";
const REQUEST_ID_HEADER: &str = "x-request-id";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Ashyq Bilim API",
        version = env!("CARGO_PKG_VERSION"),
        description = "University LMS / MOOC platform API (v2, Rust rewrite).",
    ),
    tags(
        (name = "health", description = "Liveness and readiness probes"),
        (name = "auth", description = "Sessions and authentication (BFF cookie)"),
    )
)]
struct ApiDoc;

/// Every documented route, mounted relative to [`API_PREFIX`].
fn api_router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(routes::health::live))
        .routes(routes!(routes::health::ready))
        .routes(routes!(routes::auth::current_session))
}

/// Outer router carrying the document metadata — the nest target must own the
/// `OpenApi` or utoipa-axum's default info wins.
fn assemble() -> (Router<AppState>, utoipa::openapi::OpenApi) {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .nest(API_PREFIX, api_router())
        .split_for_parts()
}

/// The OpenAPI document alone — used by `ashyq openapi` and the contract
/// snapshot test. Needs no state, config, or database.
#[must_use]
pub fn openapi_doc() -> utoipa::openapi::OpenApi {
    assemble().1
}

/// Build the full application router with the middleware stack applied.
pub fn build_router(state: AppState) -> Result<Router> {
    let (router, api) = assemble();

    let cors = cors_layer(&state.config)?;
    let serve_docs = !state.config.environment.is_production();

    let openapi_json = api.clone();
    let mut router = router.route(
        "/api/v2/openapi.json",
        get(move || {
            let doc = openapi_json.clone();
            async move { Json(doc) }
        }),
    );
    if serve_docs {
        router = router.merge(Scalar::with_url("/api/v2/docs", api));
    }

    let request_id = HeaderName::from_static(REQUEST_ID_HEADER);
    let router = router
        // Unknown routes answer in the same problem+json envelope as
        // everything else — no bare axum 404s on the wire.
        .fallback(async || {
            crate::error::ApiError(Error::app(ab_core::ErrorCode::NotFound, "no such route"))
        })
        .layer(axum::middleware::from_fn(crate::middleware::csrf_guard))
        .layer(
            ServiceBuilder::new()
                .layer(SetRequestIdLayer::new(request_id.clone(), MakeRequestUuid))
                .layer(PropagateRequestIdLayer::new(request_id))
                .layer(TraceLayer::new_for_http())
                .layer(TimeoutLayer::with_status_code(
                    StatusCode::REQUEST_TIMEOUT,
                    REQUEST_TIMEOUT,
                ))
                .layer(CompressionLayer::new())
                .layer(CatchPanicLayer::new())
                .layer(cors),
        )
        .with_state(state);
    Ok(router)
}

/// Strict-allowlist CORS with credentials (BFF cookies). An empty allowlist
/// (dev default, same-origin only) yields a no-op layer; production rejects
/// that at config validation.
fn cors_layer(config: &Config) -> Result<CorsLayer> {
    if config.server.cors_origins.is_empty() {
        return Ok(CorsLayer::new());
    }
    let origins = config
        .server
        .cors_origins
        .iter()
        .map(|origin| {
            origin
                .parse::<HeaderValue>()
                .map_err(|_| Error::config(format!("invalid CORS origin: {origin}")))
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_credentials(true)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::ACCEPT,
            HeaderName::from_static(REQUEST_ID_HEADER),
            HeaderName::from_static("last-event-id"),
            HeaderName::from_static("idempotency-key"),
        ]))
}
