//! Teacher and admin analytics (legacy `routers/analytics.py`): dashboards,
//! at-risk learners, interventions, saved views, drill-through and CSV
//! exports. Scope: courses the caller created or co-authors under
//! `analytics:read:assigned`; every course under `analytics:read:platform`
//! / `:all` (exports use `analytics:export:*`).

use ab_core::assessments::AssessmentKind;
use ab_core::id::{AssessmentId, CourseId, SavedViewId};
use ab_domain::analytics::{AnalyticsFilters, NewIntervention};
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};

use crate::dto::analytics::{
    AdminAnalyticsResponse, AnalyticsQuery, AtRiskLearnersResponse, CreateInterventionRequest,
    DrillMetric, DrillThroughQuery, DrillThroughResponse, Intervention, InterventionList,
    InterventionListQuery, SaveViewRequest, SavedView, SavedViewList,
    TeacherAssessmentDetailResponse, TeacherAssessmentListResponse, TeacherCourseDetailResponse,
    TeacherCourseListResponse, TeacherOverviewResponse,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, ValidJson};
use crate::state::AppState;

fn filters(query: AnalyticsQuery) -> ApiResult<AnalyticsFilters> {
    Ok(AnalyticsFilters::parse(&query.into())?)
}

fn csv_response(body: String, filename: &str) -> ApiResult<Response> {
    let mut response = (StatusCode::OK, body).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/csv; charset=utf-8"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{filename}\""))
            .map_err(|e| ab_core::Error::internal("csv content-disposition header", e))?,
    );
    Ok(response)
}

// ── Dashboards ──────────────────────────────────────────────────────────

/// KPI cards, trends, alerts, workload, insights and forecasts for the
/// caller's courses.
#[utoipa::path(
    get, path = "/analytics/teacher/overview", tag = "analytics",
    params(AnalyticsQuery),
    responses(
        (status = 200, description = "Teacher overview", body = TeacherOverviewResponse),
        (status = 403, description = "No analytics grant", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn teacher_overview(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AnalyticsQuery>,
) -> ApiResult<Json<TeacherOverviewResponse>> {
    let filters = filters(query)?;
    Ok(Json(state.analytics.teacher_overview(&actor, &filters).await?))
}

/// Platform-wide overview (`analytics:read:platform` / `:all`).
#[utoipa::path(
    get, path = "/analytics/admin/overview", tag = "analytics",
    params(AnalyticsQuery),
    responses(
        (status = 200, description = "Admin overview", body = AdminAnalyticsResponse),
        (status = 403, description = "No platform analytics grant", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn admin_overview(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AnalyticsQuery>,
) -> ApiResult<Json<AdminAnalyticsResponse>> {
    let filters = filters(query)?;
    Ok(Json(state.analytics.admin_overview(&actor, &filters).await?))
}

#[utoipa::path(
    get, path = "/analytics/teacher/courses", tag = "analytics",
    params(AnalyticsQuery),
    responses((status = 200, description = "Course rows", body = TeacherCourseListResponse)),
)]
pub async fn course_list(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AnalyticsQuery>,
) -> ApiResult<Json<TeacherCourseListResponse>> {
    let filters = filters(query)?;
    Ok(Json(state.analytics.course_list(&actor, &filters).await?))
}

/// 404 for a course outside the caller's scope.
#[utoipa::path(
    get, path = "/analytics/teacher/courses/{id}", tag = "analytics",
    params(("id" = CourseId, Path, description = "Course id"), AnalyticsQuery),
    responses(
        (status = 200, description = "Course detail", body = TeacherCourseDetailResponse),
        (status = 404, description = "Not in scope", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn course_detail(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<CourseId>,
    Query(query): Query<AnalyticsQuery>,
) -> ApiResult<Json<TeacherCourseDetailResponse>> {
    let filters = filters(query)?;
    Ok(Json(
        state.analytics.course_detail(&actor, id, &filters).await?,
    ))
}

#[utoipa::path(
    get, path = "/analytics/teacher/assessments", tag = "analytics",
    params(AnalyticsQuery),
    responses((status = 200, description = "Assessment rows", body = TeacherAssessmentListResponse)),
)]
pub async fn assessment_list(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AnalyticsQuery>,
) -> ApiResult<Json<TeacherAssessmentListResponse>> {
    let filters = filters(query)?;
    Ok(Json(state.analytics.assessment_list(&actor, &filters).await?))
}

/// 404 when the assessment is unknown, of another kind, or outside the scope.
#[utoipa::path(
    get, path = "/analytics/teacher/assessments/{assessment_type}/{assessment_id}", tag = "analytics",
    params(
        ("assessment_type" = AssessmentKind, Path, description = "quiz, exam or code_challenge"),
        ("assessment_id" = AssessmentId, Path, description = "Assessment id"),
        AnalyticsQuery,
    ),
    responses(
        (status = 200, description = "Assessment detail", body = TeacherAssessmentDetailResponse),
        (status = 404, description = "Not in scope", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn assessment_detail(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((kind, id)): Path<(AssessmentKind, AssessmentId)>,
    Query(query): Query<AnalyticsQuery>,
) -> ApiResult<Json<TeacherAssessmentDetailResponse>> {
    let filters = filters(query)?;
    Ok(Json(
        state
            .analytics
            .assessment_detail(&actor, kind, id, &filters)
            .await?,
    ))
}

/// Learners at medium or high risk, worst first.
#[utoipa::path(
    get, path = "/analytics/teacher/learners/at-risk", tag = "analytics",
    params(AnalyticsQuery),
    responses((status = 200, description = "At-risk learners", body = AtRiskLearnersResponse)),
)]
pub async fn at_risk_learners(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AnalyticsQuery>,
) -> ApiResult<Json<AtRiskLearnersResponse>> {
    let filters = filters(query)?;
    Ok(Json(state.analytics.at_risk_learners(&actor, &filters).await?))
}

// ── Interventions ───────────────────────────────────────────────────────

/// The caller's interventions (newest first, up to 100).
#[utoipa::path(
    get, path = "/analytics/teacher/interventions", tag = "analytics",
    params(AnalyticsQuery, InterventionListQuery),
    responses((status = 200, description = "Interventions", body = InterventionList)),
)]
pub async fn list_interventions(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AnalyticsQuery>,
    Query(narrow): Query<InterventionListQuery>,
) -> ApiResult<Json<InterventionList>> {
    let filters = filters(query)?;
    Ok(Json(
        state
            .analytics
            .list_interventions(&actor, &filters, narrow.user_id, narrow.course_id)
            .await?,
    ))
}

/// Record an intervention; the learner's latest risk score is captured as
/// `risk_score_before`.
#[utoipa::path(
    post, path = "/analytics/teacher/interventions", tag = "analytics",
    params(AnalyticsQuery),
    request_body = CreateInterventionRequest,
    responses(
        (status = 201, description = "Created", body = Intervention),
        (status = 404, description = "Course not in scope", body = Problem,
         content_type = "application/problem+json"),
        (status = 422, description = "Validation", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_intervention(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AnalyticsQuery>,
    ValidJson(request): ValidJson<CreateInterventionRequest>,
) -> ApiResult<(StatusCode, Json<Intervention>)> {
    let filters = filters(query)?;
    let created = state
        .analytics
        .create_intervention(
            &actor,
            &filters,
            NewIntervention {
                user_id: request.user_id,
                course_id: request.course_id,
                intervention_type: request.intervention_type,
                status: request.status,
                outcome: request.outcome,
                notes: request.notes,
                payload: request.payload,
            },
        )
        .await?;
    Ok((StatusCode::CREATED, Json(created)))
}

// ── Saved views ─────────────────────────────────────────────────────────

#[utoipa::path(
    get, path = "/analytics/teacher/saved-views", tag = "analytics",
    params(AnalyticsQuery),
    responses((status = 200, description = "Saved views", body = SavedViewList)),
)]
pub async fn list_saved_views(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AnalyticsQuery>,
) -> ApiResult<Json<SavedViewList>> {
    let filters = filters(query)?;
    Ok(Json(state.analytics.list_saved_views(&actor, &filters).await?))
}

/// Create, or overwrite the view with the same name and type.
#[utoipa::path(
    post, path = "/analytics/teacher/saved-views", tag = "analytics",
    params(AnalyticsQuery),
    request_body = SaveViewRequest,
    responses(
        (status = 201, description = "Saved", body = SavedView),
        (status = 422, description = "Validation", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn save_view(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AnalyticsQuery>,
    ValidJson(request): ValidJson<SaveViewRequest>,
) -> ApiResult<(StatusCode, Json<SavedView>)> {
    let filters = filters(query)?;
    let saved = state
        .analytics
        .save_view(
            &actor,
            &filters,
            &request.name,
            &request.view_type,
            &request.query,
        )
        .await?;
    Ok((StatusCode::CREATED, Json(saved)))
}

/// 404 unless the view belongs to the caller.
#[utoipa::path(
    delete, path = "/analytics/teacher/saved-views/{view_id}", tag = "analytics",
    params(("view_id" = SavedViewId, Path, description = "Saved view id"), AnalyticsQuery),
    responses(
        (status = 204, description = "Deleted"),
        (status = 404, description = "Not found", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_view(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(view_id): Path<SavedViewId>,
    Query(query): Query<AnalyticsQuery>,
) -> ApiResult<StatusCode> {
    let filters = filters(query)?;
    state.analytics.delete_view(&actor, &filters, view_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Drill-through ───────────────────────────────────────────────────────

/// Rows behind a KPI card: `active_learners`, `completion_rate`,
/// `pass_rate` (needs `assessment_type` + `assessment_id`) or `backlog`.
#[utoipa::path(
    get, path = "/analytics/teacher/drill-through/{metric}", tag = "analytics",
    params(("metric" = DrillMetric, Path, description = "KPI"), AnalyticsQuery, DrillThroughQuery),
    responses(
        (status = 200, description = "Rows", body = DrillThroughResponse),
        (status = 422, description = "pass_rate without an assessment", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn drill_through(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(metric): Path<DrillMetric>,
    Query(query): Query<AnalyticsQuery>,
    Query(target): Query<DrillThroughQuery>,
) -> ApiResult<Json<DrillThroughResponse>> {
    let filters = filters(query)?;
    let assessment = target.assessment_type.zip(target.assessment_id);
    Ok(Json(
        state
            .analytics
            .drill_through(&actor, &filters, metric, target.course_id, assessment)
            .await?,
    ))
}

// ── CSV exports (analytics:export) ──────────────────────────────────────

#[utoipa::path(
    get, path = "/analytics/teacher/exports/at-risk.csv", tag = "analytics",
    params(AnalyticsQuery),
    responses((status = 200, description = "CSV", content_type = "text/csv", body = String)),
)]
pub async fn export_at_risk(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AnalyticsQuery>,
) -> ApiResult<Response> {
    let filters = filters(query)?;
    let csv = state.analytics.export_at_risk_csv(&actor, &filters).await?;
    csv_response(csv, "teacher-at-risk.csv")
}

#[utoipa::path(
    get, path = "/analytics/teacher/exports/grading-backlog.csv", tag = "analytics",
    params(AnalyticsQuery),
    responses((status = 200, description = "CSV", content_type = "text/csv", body = String)),
)]
pub async fn export_grading_backlog(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AnalyticsQuery>,
) -> ApiResult<Response> {
    let filters = filters(query)?;
    let csv = state
        .analytics
        .export_grading_backlog_csv(&actor, &filters)
        .await?;
    csv_response(csv, "teacher-grading-backlog.csv")
}

#[utoipa::path(
    get, path = "/analytics/teacher/exports/course-progress.csv", tag = "analytics",
    params(AnalyticsQuery),
    responses((status = 200, description = "CSV", content_type = "text/csv", body = String)),
)]
pub async fn export_course_progress(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AnalyticsQuery>,
) -> ApiResult<Response> {
    let filters = filters(query)?;
    let csv = state
        .analytics
        .export_course_progress_csv(&actor, &filters)
        .await?;
    csv_response(csv, "teacher-course-progress.csv")
}

#[utoipa::path(
    get, path = "/analytics/teacher/exports/assessment-outcomes.csv", tag = "analytics",
    params(AnalyticsQuery),
    responses((status = 200, description = "CSV", content_type = "text/csv", body = String)),
)]
pub async fn export_assessment_outcomes(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Query(query): Query<AnalyticsQuery>,
) -> ApiResult<Response> {
    let filters = filters(query)?;
    let csv = state
        .analytics
        .export_assessment_outcomes_csv(&actor, &filters)
        .await?;
    csv_response(csv, "teacher-assessment-outcomes.csv")
}
