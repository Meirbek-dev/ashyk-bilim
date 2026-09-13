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
use crate::extract::{CurrentActor, Path, ValidJson};
use crate::state::AppState;

/// Add a certification template to a course (`certificate:create`).
#[utoipa::path(
    post, path = "/certifications", tag = "certifications",
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
    ValidJson(request): ValidJson<CreateCertificationRequest>,
) -> ApiResult<(StatusCode, Json<Certification>)> {
    let created = state
        .certifications
        .create(&actor, request.course_id, &request.config)
        .await?;
    Ok((StatusCode::CREATED, Json(created.into())))
}

/// One template (course-scoped `certificate:read`).
#[utoipa::path(
    get, path = "/certifications/{id}", tag = "certifications",
    params(("id" = CertificationId, Path, description = "Certification id")),
    responses((status = 200, description = "Certification", body = Certification)),
)]
pub async fn get_certification(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CertificationId>,
) -> ApiResult<Json<Certification>> {
    Ok(Json(state.certifications.get(&actor, id).await?.into()))
}

/// Replace the template document.
#[utoipa::path(
    patch, path = "/certifications/{id}", tag = "certifications",
    params(("id" = CertificationId, Path, description = "Certification id")),
    request_body = UpdateCertificationRequest,
    responses((status = 200, description = "Updated", body = Certification)),
)]
pub async fn update_certification(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CertificationId>,
    ValidJson(request): ValidJson<UpdateCertificationRequest>,
) -> ApiResult<Json<Certification>> {
    Ok(Json(
        state
            .certifications
            .update(&actor, id, &request.config)
            .await?
            .into(),
    ))
}

/// Remove the template and every certificate issued from it.
#[utoipa::path(
    delete, path = "/certifications/{id}", tag = "certifications",
    params(("id" = CertificationId, Path, description = "Certification id")),
    responses((status = 204, description = "Deleted")),
)]
pub async fn delete_certification(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CertificationId>,
) -> ApiResult<StatusCode> {
    state.certifications.delete(&actor, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// The course's templates (course-scoped `certificate:read`).
#[utoipa::path(
    get, path = "/courses/{id}/certifications", tag = "certifications",
    params(("id" = CourseId, Path, description = "Course id")),
    responses((status = 200, description = "Certifications", body = [Certification])),
)]
pub async fn list_course_certifications(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<Vec<Certification>>> {
    let rows = state.certifications.list_for_course(&actor, id).await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

/// The caller's certificates for a course; a completed course issues on
/// the spot.
#[utoipa::path(
    get, path = "/courses/{id}/certificates/me", tag = "certifications",
    params(("id" = CourseId, Path, description = "Course id")),
    responses((status = 200, description = "Certificates", body = [IssuedCertificate])),
)]
pub async fn my_course_certificates(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
) -> ApiResult<Json<Vec<IssuedCertificate>>> {
    let rows = state.certifications.mine_for_course(&actor, id).await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
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
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

/// Public verification by code — no session needed.
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

/// The certificate as an A4-landscape PDF — public by code, like verification.
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
    let bytes = state
        .certifications
        .pdf(&code, language, |language, code| {
            state.config.server.web_href(&format!(
                "{}/certificates/{code}/verify",
                language.web_prefix()
            ))
        })
        .await?;
    let mut response = (StatusCode::OK, bytes).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/pdf"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!(
            "attachment; filename=\"certificate-{}.pdf\"",
            code.trim()
        ))
        .unwrap_or_else(|_| HeaderValue::from_static("attachment")),
    );
    Ok(response)
}
