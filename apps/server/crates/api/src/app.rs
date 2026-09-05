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
        (name = "users", description = "User profiles and preferences"),
        (name = "rbac", description = "Roles and permission administration"),
        (name = "uploads", description = "Direct-to-storage upload pipeline"),
        (name = "courses", description = "Course catalog"),
        (name = "collections", description = "Curated course collections"),
        (name = "platform", description = "Platform settings singleton"),
        (name = "search", description = "Platform search"),
        (name = "usergroups", description = "Cohorts: member sets linkable to courses"),
        (name = "assessments", description = "Quizzes, exams, code challenges: authoring and lifecycle"),
        (name = "submissions", description = "Learner attempts: start, draft, submit"),
    )
)]
struct ApiDoc;

/// Every documented route, mounted relative to [`API_PREFIX`]. One builder
/// per context — a single chain grows the stack frame past clippy's limit.
fn api_router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .merge(identity_routes())
        .merge(catalog_routes())
        .merge(assessment_routes())
        .merge(submission_routes())
}

fn identity_routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(routes::health::live))
        .routes(routes!(routes::health::ready))
        .routes(routes!(routes::auth::login))
        .routes(routes!(routes::auth::logout))
        .routes(routes!(routes::auth::current_session))
        .routes(routes!(routes::auth::list_sessions))
        .routes(routes!(routes::auth::revoke_session))
        .routes(routes!(routes::auth::google_start))
        .routes(routes!(routes::auth::google_callback))
        .routes(routes!(routes::auth::totp_enroll))
        .routes(routes!(routes::auth::totp_verify))
        .routes(routes!(routes::auth::totp_remove))
        .routes(routes!(routes::users::my_profile))
        .routes(routes!(routes::users::update_my_profile))
        .routes(routes!(routes::users::list_users))
        .routes(routes!(routes::users::set_user_status))
        .routes(routes!(routes::rbac::list_roles))
        .routes(routes!(routes::rbac::assign_role))
        .routes(routes!(routes::rbac::unassign_role))
        .routes(routes!(routes::rbac::create_role))
        .routes(routes!(routes::rbac::update_role))
        .routes(routes!(routes::rbac::delete_role))
        .routes(routes!(routes::rbac::set_role_permissions))
        .routes(routes!(routes::uploads::create_upload))
        .routes(routes!(routes::uploads::finalize_upload))
        .routes(routes!(routes::uploads::download_upload))
        .routes(routes!(routes::usergroups::create_usergroup))
        .routes(routes!(routes::usergroups::list_usergroups))
        .routes(routes!(routes::usergroups::get_usergroup))
        .routes(routes!(routes::usergroups::update_usergroup))
        .routes(routes!(routes::usergroups::delete_usergroup))
        .routes(routes!(routes::usergroups::list_usergroup_members))
        .routes(routes!(routes::usergroups::add_usergroup_members))
        .routes(routes!(routes::usergroups::remove_usergroup_members))
        .routes(routes!(routes::usergroups::list_usergroup_courses))
        .routes(routes!(routes::usergroups::add_usergroup_courses))
        .routes(routes!(routes::usergroups::remove_usergroup_courses))
        .routes(routes!(routes::usergroups::usergroups_for_course))
}

fn catalog_routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(routes::courses::create_course))
        .routes(routes!(routes::courses::list_courses))
        .routes(routes!(routes::courses::get_course))
        .routes(routes!(routes::courses::update_course))
        .routes(routes!(routes::courses::course_lifecycle))
        .routes(routes!(routes::courses::delete_course))
        .routes(routes!(routes::curriculum::get_curriculum))
        .routes(routes!(routes::curriculum::create_chapter))
        .routes(routes!(routes::curriculum::update_chapter))
        .routes(routes!(routes::curriculum::delete_chapter))
        .routes(routes!(routes::curriculum::move_chapter))
        .routes(routes!(routes::curriculum::create_activity))
        .routes(routes!(routes::curriculum::get_activity))
        .routes(routes!(routes::curriculum::update_activity))
        .routes(routes!(routes::curriculum::delete_activity))
        .routes(routes!(routes::curriculum::move_activity))
        .routes(routes!(routes::curriculum::create_block))
        .routes(routes!(routes::curriculum::list_blocks))
        .routes(routes!(routes::curriculum::get_block))
        .routes(routes!(routes::curriculum::delete_block))
        .routes(routes!(routes::courses::list_course_updates))
        .routes(routes!(routes::courses::create_course_update))
        .routes(routes!(routes::courses::edit_course_update))
        .routes(routes!(routes::courses::delete_course_update))
        .routes(routes!(routes::collections::create_collection))
        .routes(routes!(routes::collections::list_collections))
        .routes(routes!(routes::collections::get_collection))
        .routes(routes!(routes::collections::update_collection))
        .routes(routes!(routes::collections::delete_collection))
        .routes(routes!(routes::platform::get_platform))
        .routes(routes!(routes::platform::update_platform))
        .routes(routes!(routes::search::search))
}

fn assessment_routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(routes::assessments::create_assessment))
        .routes(routes!(routes::assessments::get_assessment))
        .routes(routes!(routes::assessments::get_activity_assessment))
        .routes(routes!(routes::assessments::list_course_assessments))
        .routes(routes!(routes::assessments::update_assessment))
        .routes(routes!(routes::assessments::set_policy))
        .routes(routes!(routes::assessments::lifecycle))
        .routes(routes!(routes::assessments::duplicate_assessment))
        .routes(routes!(routes::assessments::readiness))
        .routes(routes!(routes::assessments::audit_trail))
        .routes(routes!(routes::assessments::create_item))
        .routes(routes!(routes::assessments::update_item))
        .routes(routes!(routes::assessments::delete_item))
        .routes(routes!(routes::assessments::reorder_items))
        .routes(routes!(routes::assessments::get_access))
        .routes(routes!(routes::assessments::set_access))
        .routes(routes!(routes::assessments::list_overrides))
        .routes(routes!(routes::assessments::create_override))
        .routes(routes!(routes::assessments::update_override))
        .routes(routes!(routes::assessments::delete_override))
        .routes(routes!(routes::assessments::attempt_state))
}

fn submission_routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(routes::submissions::start_submission))
        .routes(routes!(routes::submissions::current_draft))
        .routes(routes!(routes::submissions::my_submissions))
        .routes(routes!(routes::submissions::get_submission))
        .routes(routes!(routes::submissions::save_draft))
        .routes(routes!(routes::submissions::report_violation))
        .routes(routes!(routes::submissions::submit_submission))
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
