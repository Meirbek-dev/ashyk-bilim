//! Tests from spreadsheets (DOT `.xlsx`): upload, preview, create, export
//! (docs/XLSX-TEST-IMPORT.md).

use ab_core::Error;
use ab_core::id::{AssessmentId, CourseId};
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Redirect, Response};
use uuid::Uuid;

use crate::dto::assessment_imports::{
    AssessmentImport, CommitImportRequest, CreateImportRequest, ReparseImportRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, Path, ValidJson, idempotent};
use crate::state::AppState;

const XLSX: &str = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/// Read an uploaded spreadsheet (an `assessment-import` upload) and show
/// what it would become. Nothing is created until `commit`.
///
/// Requires authoring on the course. A file the reader rejects as a whole
/// still answers 201 with status `invalid` and the issues.
#[utoipa::path(
    post, path = "/courses/{course_id}/assessment-imports", tag = "assessments",
    params(("course_id" = CourseId, Path, description = "Course id")),
    request_body = CreateImportRequest,
    responses(
        (status = 201, description = "Read: preview and issues", body = AssessmentImport),
        (status = 403, description = "No authoring access", body = Problem,
         content_type = "application/problem+json"),
        (status = 409, description = "Upload not finalized or already used", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_import(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    body: axum::body::Bytes,
) -> ApiResult<(StatusCode, Json<AssessmentImport>)> {
    // UX-311: permission before the body.
    state.imports.require_course(&actor, course_id).await?;
    let request = ValidJson::<CreateImportRequest>::parse(&body)?;
    let import = state
        .imports
        .create(
            &actor,
            course_id,
            request.upload_id,
            &request.file_name,
            request.unescape_newlines,
        )
        .await?;
    Ok((StatusCode::CREATED, Json(import)))
}

/// The preview of an import (its creator or the course's authors).
#[utoipa::path(
    get, path = "/assessment-imports/{import_id}", tag = "assessments",
    params(("import_id" = Uuid, Path, description = "Import id")),
    responses(
        (status = 200, description = "Import", body = AssessmentImport),
        (status = 404, description = "Unknown, expired or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_import(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<AssessmentImport>> {
    Ok(Json(state.imports.get(&actor, id).await?))
}

/// Read the file again with the other `\n` mode.
#[utoipa::path(
    patch, path = "/assessment-imports/{import_id}", tag = "assessments",
    params(("import_id" = Uuid, Path, description = "Import id")),
    request_body = ReparseImportRequest,
    responses(
        (status = 200, description = "Read again", body = AssessmentImport),
        (status = 409, description = "Already committed", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn reparse_import(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<Uuid>,
    body: axum::body::Bytes,
) -> ApiResult<Json<AssessmentImport>> {
    state.imports.require_import(&actor, id).await?;
    let request = ValidJson::<ReparseImportRequest>::parse(&body)?;
    Ok(Json(
        state
            .imports
            .reparse(&actor, id, request.unescape_newlines)
            .await?,
    ))
}

/// Drop an uncommitted import with its file and pictures.
#[utoipa::path(
    delete, path = "/assessment-imports/{import_id}", tag = "assessments",
    params(("import_id" = Uuid, Path, description = "Import id")),
    responses(
        (status = 204, description = "Discarded"),
        (status = 404, description = "Unknown or inaccessible", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn discard_import(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    state.imports.discard(&actor, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Create the questions: a new draft test, or replace / extend a draft
/// one. Repeating it answers with the test already made.
#[utoipa::path(
    post, path = "/assessment-imports/{import_id}/commit", tag = "assessments",
    params(
        ("import_id" = Uuid, Path, description = "Import id"),
        ("Idempotency-Key" = Option<String>, Header, description = "Retry-safe replay key"),
    ),
    request_body = CommitImportRequest,
    responses(
        (status = 200, description = "Committed (`result` names the test)", body = AssessmentImport),
        (status = 409, description = "The file has errors, or the test is not an editable draft",
         body = Problem, content_type = "application/problem+json"),
        (status = 410, description = "The import expired", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn commit_import(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> ApiResult<Response> {
    state.imports.require_import(&actor, id).await?;
    let request = ValidJson::<CommitImportRequest>::parse(&body)?;
    idempotent(
        state.pool.clone(),
        actor.user_id,
        "assessment-import",
        &headers,
        &body,
        move || async move {
            let (target, options) = request.into_parts();
            let import = state.imports.commit(&actor, id, target, options).await?;
            Ok((StatusCode::OK, import))
        },
    )
    .await
}

/// A picture of an import's preview: a redirect to a short-lived URL.
#[utoipa::path(
    get, path = "/assessment-imports/{import_id}/media/{upload_id}", tag = "assessments",
    params(
        ("import_id" = Uuid, Path, description = "Import id"),
        ("upload_id" = Uuid, Path, description = "Picture upload id"),
    ),
    responses(
        (status = 303, description = "Redirect to the picture"),
        (status = 404, description = "Not a picture of this import", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn import_media(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((id, upload_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Response> {
    let url = state
        .imports
        .import_media_url(&actor, id, upload_id)
        .await?;
    Ok(cached_redirect(&url))
}

/// A picture of a test's question, for anyone who may read the question
/// (a learner: only the questions of their attempt).
#[utoipa::path(
    get, path = "/assessments/{assessment_id}/media/{upload_id}", tag = "assessments",
    params(
        ("assessment_id" = AssessmentId, Path, description = "Assessment id"),
        ("upload_id" = Uuid, Path, description = "Picture upload id"),
    ),
    responses(
        (status = 303, description = "Redirect to the picture"),
        (status = 404, description = "Not a picture of a question you can read", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn assessment_media(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((id, upload_id)): Path<(AssessmentId, Uuid)>,
) -> ApiResult<Response> {
    let url = state
        .imports
        .assessment_media_url(&actor, id, upload_id)
        .await?;
    Ok(cached_redirect(&url))
}

/// The presigned URL lives 5 minutes: the browser may reuse the redirect
/// for 4 of them.
fn cached_redirect(url: &str) -> Response {
    let mut response = Redirect::to(url).into_response();
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=240"),
    );
    response
}

/// The test as a DOT spreadsheet: questions, pictures, row-1 settings and
/// a «Пропущено» sheet listing what the format cannot hold. Authors only.
#[utoipa::path(
    get, path = "/assessments/{assessment_id}/export", tag = "assessments",
    params(("assessment_id" = AssessmentId, Path, description = "Assessment id")),
    responses(
        (status = 200, description = "The workbook", content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body = Vec<u8>),
        (status = 404, description = "Unknown or not yours to author", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "No question fits the format", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn export_assessment(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Response> {
    let (file_name, bytes) = state.imports.export(&actor, id).await?;
    let mut response = (StatusCode::OK, bytes).into_response();
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(XLSX));
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&content_disposition(&file_name))
            .map_err(|e| Error::internal("export content-disposition header", e))?,
    );
    Ok(response)
}

/// `attachment` with an ASCII fallback name and the real (often Cyrillic)
/// one in RFC 5987 form.
fn content_disposition(file_name: &str) -> String {
    use std::fmt::Write as _;
    let ascii: String = file_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let mut encoded = String::new();
    for byte in file_name.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_') {
            encoded.push(char::from(byte));
        } else {
            let _ = write!(encoded, "%{byte:02X}");
        }
    }
    format!("attachment; filename=\"{ascii}\"; filename*=UTF-8''{encoded}")
}

#[cfg(test)]
mod tests {
    use super::content_disposition;

    #[test]
    fn cyrillic_names_survive_the_header() {
        assert_eq!(
            content_disposition("Тест 1.xlsx"),
            "attachment; filename=\"_____1.xlsx\"; filename*=UTF-8''%D0%A2%D0%B5%D1%81%D1%82%201.xlsx"
        );
    }
}
