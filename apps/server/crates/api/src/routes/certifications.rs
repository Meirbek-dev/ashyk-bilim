//! Certification templates (course authors) and issued certificates
//! (learners), plus public verification by code.

use ab_core::id::{CertificationId, CourseId};
use ab_core::language::Language;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};

use crate::dto::certifications::{
    Certification, CreateCertificationRequest, IssuedCertificate, UpdateCertificationRequest,
    VerifiedCertificate,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{
    CurrentActor, Path, Query, ValidJson, idempotent, require_if_match, require_if_match_gated,
    with_etag,
};
use crate::state::AppState;
use ab_db::versions::Versioned;

/// Add a certification template to a course (`certificate:create`).
/// Honours `Idempotency-Key`.
#[utoipa::path(
    post, path = "/certifications", tag = "certifications",
    params(("Idempotency-Key" = Option<String>, Header, description = "Retry-safe replay key")),
    request_body = CreateCertificationRequest,
    responses(
        (status = 201, description = "Created", body = Certification),
        (status = 403, description = "No certificate authoring on this course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_certification(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    state.certifications.require_some_create(&actor).await?;
    let request = ValidJson::<CreateCertificationRequest>::parse(&body)?;
    idempotent(
        state.pool.clone(),
        actor.user_id,
        "certification",
        &headers,
        &body,
        move || async move {
            let created = state
                .certifications
                .create(&actor, request.course_id, &request.config)
                .await?;
            let actions = state
                .certifications
                .allowed_actions_for(&actor, created.course_id)
                .await?;
            Ok((StatusCode::CREATED, Certification::new(created, actions)))
        },
    )
    .await
}

/// One template (course-scoped `certificate:read`).
#[utoipa::path(
    get, path = "/certifications/{certification_id}", tag = "certifications",
    params(("certification_id" = CertificationId, Path, description = "Certification id")),
    responses((status = 200, description = "Certification", body = Certification,
               headers(("ETag" = String, description = "Quoted `version`")))),
)]
pub async fn get_certification(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CertificationId>,
) -> ApiResult<Response> {
    let row = state.certifications.get(&actor, id).await?;
    let actions = state
        .certifications
        .allowed_actions_for(&actor, row.course_id)
        .await?;
    let body = Certification::new(row, actions);
    Ok(with_etag(StatusCode::OK, body.version, body))
}

/// Replace the template document.
#[utoipa::path(
    patch, path = "/certifications/{certification_id}", tag = "certifications",
    params(
        ("certification_id" = CertificationId, Path, description = "Certification id"),
        ("If-Match" = Option<i32>, Header, description = "Current `version`; stale → 412"),
    ),
    request_body = UpdateCertificationRequest,
    responses(
        (status = 200, description = "Updated", body = Certification,
         headers(("ETag" = String, description = "Quoted new version"))),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
    ),
)]
pub async fn update_certification(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CertificationId>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    // UX-311: permission before the body.
    state.certifications.require_updatable(&actor, id).await?;
    let request = ValidJson::<UpdateCertificationRequest>::parse(&body)?;
    require_if_match(&state.pool, Versioned::Certification(id), &headers).await?;
    let row = state
        .certifications
        .update(&actor, id, &request.config)
        .await?;
    let actions = state
        .certifications
        .allowed_actions_for(&actor, row.course_id)
        .await?;
    let body = Certification::new(row, actions);
    Ok(with_etag(StatusCode::OK, body.version, body))
}

/// A sample PDF of the template (course certificate readers).
///
/// Before anything is issued: the caller as holder, today's date, code `PREVIEW`.
/// Language: `?lang=`, else `Accept-Language`, else the caller's locale.
#[utoipa::path(
    get, path = "/certifications/{certification_id}/preview.pdf", tag = "certifications",
    params(
        ("certification_id" = CertificationId, Path, description = "Certification id"),
        ("Accept-Language" = Option<String>, Header, description = "ru, kk or en (default: the caller's locale)"),
        ("lang" = Option<crate::dto::enums::UiLanguage>, Query, description = "Overrides `Accept-Language` (for links)"),
    ),
    responses(
        (status = 200, description = "PDF", content_type = "application/pdf", body = String),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn certification_preview_pdf(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CertificationId>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let language = Language::from_accept_language(
        headers
            .get(header::ACCEPT_LANGUAGE)
            .and_then(|v| v.to_str().ok()),
    );
    let bytes = state
        .certifications
        .preview_pdf(&actor, id, language, |language, code| {
            state
                .config
                .server
                .web_href(&ab_core::links::WebLink::CertificateVerify(code).path(Some(language)))
        })
        .await?;
    let mut response = (StatusCode::OK, bytes).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/pdf"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("inline; filename=\"certificate-preview.pdf\""),
    );
    Ok(response)
}

/// Remove the template and every certificate issued from it.
#[utoipa::path(
    delete, path = "/certifications/{certification_id}", tag = "certifications",
    params(("certification_id" = CertificationId, Path, description = "Certification id"),
        ("If-Match" = Option<i32>, Header, description = "Row `version`; stale -> 412"),
    ),
    responses(
        (status = 204, description = "Deleted"),
        (status = 412, description = "Stale `If-Match`", body = Problem,
         content_type = "application/problem+json"),
    ),
)]
pub async fn delete_certification(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CertificationId>,
    headers: HeaderMap,
) -> ApiResult<StatusCode> {
    require_if_match_gated(&state.pool, Versioned::Certification(id), &headers, async {
        state.certifications.get(&actor, id).await.map(|_| ())
    })
    .await?;
    state.certifications.delete(&actor, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// The course's templates (course-scoped `certificate:read`).
#[utoipa::path(
    get, path = "/courses/{course_id}/certifications", tag = "certifications",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses((status = 200, description = "Certifications", body = [Certification])),
)]
pub async fn list_course_certifications(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<Vec<Certification>>> {
    let rows = state.certifications.list_for_course(&actor, id).await?;
    let actions = state.certifications.allowed_actions_for(&actor, id).await?;
    Ok(Json(
        rows.into_iter()
            .map(|row| Certification::new(row, actions.clone()))
            .collect(),
    ))
}

/// The caller's certificates for a course; a completed course issues on
/// the spot.
#[utoipa::path(
    get, path = "/courses/{course_id}/certificates/me", tag = "certifications",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses((status = 200, description = "Certificates", body = [IssuedCertificate])),
)]
pub async fn my_course_certificates(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<Vec<IssuedCertificate>>> {
    let rows = state.certifications.mine_for_course(&actor, id).await?;
    Ok(Json(
        rows.into_iter()
            .map(|i| IssuedCertificate::for_actor(i, &actor))
            .collect(),
    ))
}

/// Every certificate the caller holds.
#[utoipa::path(
    get, path = "/me/certificates", tag = "certifications",
    responses((status = 200, description = "Certificates", body = [IssuedCertificate])),
)]
pub async fn my_certificates(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
) -> ApiResult<Json<Vec<IssuedCertificate>>> {
    let rows = state.certifications.mine(&actor).await?;
    Ok(Json(
        rows.into_iter()
            .map(|i| IssuedCertificate::for_actor(i, &actor))
            .collect(),
    ))
}

/// The caller's certificates as keyset pages (S-05; `GET /me/certificates`
/// stays the full list).
#[utoipa::path(
    get, path = "/me/certificates/page", tag = "certifications",
    params(crate::dto::KeysetQuery),
    responses((status = 200, description = "Page of certificates", body = crate::dto::certifications::IssuedCertificatePage)),
)]
pub async fn my_certificates_page(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<crate::dto::KeysetQuery>,
) -> ApiResult<Json<crate::dto::certifications::IssuedCertificatePage>> {
    let all = state
        .certifications
        .mine(&actor)
        .await?
        .into_iter()
        .map(|i| IssuedCertificate::for_actor(i, &actor))
        .collect();
    let (items, next_cursor) = query.page(all, |c| c.certificate.id.to_string())?;
    Ok(Json(crate::dto::certifications::IssuedCertificatePage {
        items,
        next_cursor,
    }))
}

/// Public verification by code - no session needed.
#[utoipa::path(
    get, path = "/certificates/{code}", tag = "certifications",
    params(("code" = String, Path, description = "Verification code (case-insensitive, dashes optional)")),
    responses(
        (status = 200, description = "Verified certificate", body = VerifiedCertificate),
        (status = 404, description = "Unknown code", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn verify_certificate(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> ApiResult<Json<VerifiedCertificate>> {
    Ok(Json(state.certifications.verify(&code).await?.into()))
}

/// The certificate as an A4-landscape PDF - public by code, like verification.
///
/// Holder, course, certificate name/type, issue date, teacher, the
/// verification code and the verify link (`AB__SERVER__WEB_URL` +
/// `/{locale}/certificates/{code}/verify`). The page language follows
/// `Accept-Language` (`ru`, `kk`, `en`), else the holder's locale.
#[utoipa::path(
    get, path = "/certificates/{code}/pdf", tag = "certifications",
    params(
        ("code" = String, Path, description = "Verification code"),
        ("Accept-Language" = Option<String>, Header, description = "ru, kk or en (default: the holder's locale)"),
        ("lang" = Option<crate::dto::enums::UiLanguage>, Query, description = "Overrides `Accept-Language` (for links)"),
    ),
    responses(
        (status = 200, description = "PDF", content_type = "application/pdf", body = String),
        (status = 404, description = "Unknown code", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn certificate_pdf(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let language = Language::from_accept_language(
        headers
            .get(header::ACCEPT_LANGUAGE)
            .and_then(|v| v.to_str().ok()),
    );
    let (code, bytes) = state
        .certifications
        .pdf(&code, language, |language, code| {
            state
                .config
                .server
                .web_href(&ab_core::links::WebLink::CertificateVerify(code).path(Some(language)))
        })
        .await?;
    let mut response = (StatusCode::OK, bytes).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/pdf"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"certificate-{code}.pdf\""))
            .unwrap_or_else(|_| HeaderValue::from_static("attachment")),
    );
    Ok(response)
}
