//! Code execution: learner runs on visible tests / custom input, run
//! lookup, the author's reference check, the language list.

use ab_core::id::{AssessmentId, AssessmentItemId, CodeRunId};
use ab_core::{Error, ErrorCode, FieldError};
use ab_domain::code::RunInput;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};

use crate::dto::code::{CodeRun, LanguageInfo, ReferenceCheckResponse, RunRequest};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, ValidJson};
use crate::state::AppState;

const IDEMPOTENCY_KEY: &str = "idempotency-key";
const MAX_IDEMPOTENCY_KEY_LEN: usize = 128;

fn idempotency_key(headers: &HeaderMap) -> ApiResult<Option<String>> {
    let Some(raw) = headers.get(IDEMPOTENCY_KEY) else {
        return Ok(None);
    };
    let key = raw.to_str().map(str::trim).unwrap_or_default();
    if key.is_empty() || key.len() > MAX_IDEMPOTENCY_KEY_LEN || !key.is_ascii() {
        return Err(Error::validation(vec![FieldError {
            field: "Idempotency-Key".into(),
            code: "invalid".into(),
            message: format!(
                "Idempotency-Key must be 1..={MAX_IDEMPOTENCY_KEY_LEN} ASCII characters"
            ),
        }])
        .into());
    }
    Ok(Some(key.to_owned()))
}

/// Run code against an item's visible tests (or one custom input).
///
/// Does not affect any grade — hidden tests only run at submit. Needs
/// submit access to the assessment (authors may preview and see hidden
/// data). With an `Idempotency-Key`, a retry with the same source, input
/// and language replays the finished run (200); a different payload under
/// the same key is 409. Limited to 20 runs per minute per user.
#[utoipa::path(
    post, path = "/assessment-items/{id}/runs", tag = "code",
    params(
        ("id" = AssessmentItemId, Path, description = "Code item id"),
        ("Idempotency-Key" = Option<String>, Header, description = "Client retry token (optional)"),
    ),
    request_body = RunRequest,
    responses(
        (status = 201, description = "Executed", body = CodeRun),
        (status = 200, description = "Replayed earlier run", body = CodeRun),
        (status = 409, description = "Idempotency-Key reused for a different run", body = Problem,
         content_type = "application/problem+json"),
        (status = 413, description = "Source or input too large", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Blank source, wrong item kind, or language not allowed",
         body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "Too many runs", body = Problem,
         content_type = "application/problem+json"),
        (status = 503, description = "Code runner unavailable (run recorded as degraded)",
         body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn run_item(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentItemId>,
    headers: HeaderMap,
    ValidJson(request): ValidJson<RunRequest>,
) -> ApiResult<(StatusCode, Json<CodeRun>)> {
    let key = idempotency_key(&headers)?;
    let run = state
        .code_runs
        .run_item(
            &actor,
            id,
            RunInput {
                language_id: request.language_id,
                source: &request.source,
                custom_input: request.custom_input.as_deref(),
                idempotency_key: key.as_deref(),
            },
        )
        .await?;
    if run.is_retryable() {
        return Err(Error::app_with_details(
            ErrorCode::CodeRunnerDegraded,
            run.error_message
                .unwrap_or_else(|| "code runner unavailable".into()),
            serde_json::json!({ "run_id": run.id, "is_retryable": true }),
        )
        .into());
    }
    let status = if run.replayed {
        StatusCode::OK
    } else {
        StatusCode::CREATED
    };
    Ok((status, Json(run.into())))
}

/// A run by id: its owner (hidden tests masked) or an assessment author.
#[utoipa::path(
    get, path = "/code-runs/{id}", tag = "code",
    params(("id" = CodeRunId, Path, description = "Code run id")),
    responses(
        (status = 200, description = "Run", body = CodeRun),
        (status = 404, description = "Unknown or not yours", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn get_run(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CodeRunId>,
) -> ApiResult<Json<CodeRun>> {
    Ok(Json(state.code_runs.get_run(&actor, id).await?.into()))
}

/// Run every reference solution against the full test set (authors only).
///
/// One entry per language the item allows; `missing_solution` when no
/// reference is stored for it.
#[utoipa::path(
    post, path = "/assessments/{id}/reference-check", tag = "code",
    params(("id" = AssessmentId, Path, description = "Assessment id")),
    responses(
        (status = 200, description = "Per-language verdicts", body = ReferenceCheckResponse),
        (status = 403, description = "No authoring access", body = Problem,
         content_type = "application/problem+json"),
        (status = 404, description = "No code item", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn reference_check(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<AssessmentId>,
) -> ApiResult<Json<ReferenceCheckResponse>> {
    let results = state.code_runs.reference_check(&actor, id).await?;
    Ok(Json(ReferenceCheckResponse { results }))
}

/// Languages the platform allows for code items (from Judge0, cached).
#[utoipa::path(
    get, path = "/code/languages", tag = "code",
    responses(
        (status = 200, description = "Languages", body = [LanguageInfo]),
        (status = 503, description = "Code runner unavailable", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn languages(
    State(state): State<AppState>,
    CurrentActor(_actor): CurrentActor,
) -> ApiResult<Json<Vec<LanguageInfo>>> {
    Ok(Json(state.code_runs.languages().await?))
}
