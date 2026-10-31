//! The AI-first routes (docs/AI-FIRST.md).
//!
//! The course concept graph and mastery (2.3, 3.4), material search (1.6) and AI pre-grading
//! (4.3-4.5). Every write checks the caller and the resource it names before reading the body
//! (UX-311); the services repeat the checks.

use ab_core::id::{ActivityId, ConceptId, ConceptTagId, CourseId, GradeDraftId, UserId};
use ab_domain::ai::assist::{
    ApproveOutcome, ClassMastery, ConceptGraph, ConceptTagView, ConceptView, ConsistencyReport,
    GradeDraftView, GradingMetrics, GradingSettings, IndexStatus, LearnerMastery,
    LearnerMasteryDetail, PrerequisiteView, QueueReport, SearchHit,
};
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;

use crate::detach::detached;
use crate::dto::ai::RunStatus;
use crate::dto::ai_first::{
    ApproveDraftsRequest, ConceptReviewRequest, CreateConceptRequest, CreateConceptTagRequest,
    GradingSettingsRequest, MetricsQuery, PrerequisitesRequest, QueueDraftsRequest, SearchRequest,
    SuggestConceptsRequest, UpdateConceptRequest, UpdateConceptTagRequest,
};
use crate::error::{ApiResult, Problem};
use crate::extract::{CurrentActor, Path, Query, ValidJson};
use crate::state::AppState;

// ── Concept graph ───────────────────────────────────────────────────────────

/// Teachers see every suggestion; learners the approved graph.
#[utoipa::path(
    get, path = "/courses/{course_id}/concepts", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses(
        (status = 200, description = "The course concept graph", body = ConceptGraph),
        (status = 404, description = "Unknown or inaccessible course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn concept_graph(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
) -> ApiResult<Json<ConceptGraph>> {
    Ok(Json(state.ai.concept_graph(&actor, course_id).await?))
}

/// A teacher's own concept (approved at once).
#[utoipa::path(
    post, path = "/courses/{course_id}/concepts", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    request_body = CreateConceptRequest,
    responses(
        (status = 201, description = "The new concept", body = ConceptView),
        (status = 403, description = "Not a teacher of the course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_concept(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    body: axum::body::Bytes,
) -> ApiResult<(StatusCode, Json<ConceptView>)> {
    state.ai.require_concept_editor(&actor, course_id).await?;
    let request = ValidJson::<CreateConceptRequest>::parse(&body)?;
    let concept = state
        .ai
        .create_concept(&actor, course_id, &request.name, &request.description)
        .await?;
    Ok((StatusCode::CREATED, Json(concept)))
}

#[utoipa::path(
    patch, path = "/courses/{course_id}/concepts/{concept_id}", tag = "ai",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("concept_id" = ConceptId, Path, description = "Concept id"),
    ),
    request_body = UpdateConceptRequest,
    responses(
        (status = 200, description = "The concept", body = ConceptView),
        (status = 404, description = "Unknown or inaccessible concept", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_concept(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((course_id, concept_id)): Path<(CourseId, ConceptId)>,
    body: axum::body::Bytes,
) -> ApiResult<Json<ConceptView>> {
    state.ai.require_concept(&actor, concept_id).await?;
    require_concept_in(&state, course_id, concept_id).await?;
    let request = ValidJson::<UpdateConceptRequest>::parse(&body)?;
    let concept = state
        .ai
        .update_concept(
            &actor,
            concept_id,
            request.name.as_deref(),
            request.description.as_deref(),
            request.status.as_deref(),
        )
        .await?;
    Ok(Json(concept))
}

async fn concept_course(state: &AppState, id: ConceptId) -> ApiResult<CourseId> {
    Ok(ab_db::concepts::get_concept(&state.pool, id)
        .await?
        .ok_or_else(|| ab_core::Error::not_found("concept"))?
        .course_id)
}

/// The path's course must own the concept (a foreign pair answers 404, before any write).
async fn require_concept_in(state: &AppState, course_id: CourseId, id: ConceptId) -> ApiResult<()> {
    if concept_course(state, id).await? == course_id {
        Ok(())
    } else {
        Err(ab_core::Error::not_found("concept").into())
    }
}

#[utoipa::path(
    delete, path = "/courses/{course_id}/concepts/{concept_id}", tag = "ai",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("concept_id" = ConceptId, Path, description = "Concept id"),
    ),
    responses(
        (status = 204, description = "Deleted with its tags and prerequisites"),
        (status = 404, description = "Unknown or inaccessible concept", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_concept(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((course_id, concept_id)): Path<(CourseId, ConceptId)>,
) -> ApiResult<StatusCode> {
    state.ai.require_concept(&actor, concept_id).await?;
    require_concept_in(&state, course_id, concept_id).await?;
    state.ai.delete_concept(&actor, concept_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Replaces what the concept requires; 422 `concept-cycle` when that would close a loop.
#[utoipa::path(
    put, path = "/courses/{course_id}/concepts/{concept_id}/prerequisites", tag = "ai",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("concept_id" = ConceptId, Path, description = "Concept id"),
    ),
    request_body = PrerequisitesRequest,
    responses(
        (status = 200, description = "The concept's prerequisites", body = Vec<PrerequisiteView>),
        (status = 422, description = "Unknown concept or a cycle", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn set_prerequisites(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((course_id, concept_id)): Path<(CourseId, ConceptId)>,
    body: axum::body::Bytes,
) -> ApiResult<Json<Vec<PrerequisiteView>>> {
    state.ai.require_concept(&actor, concept_id).await?;
    require_concept_in(&state, course_id, concept_id).await?;
    let request = ValidJson::<PrerequisitesRequest>::parse(&body)?;
    Ok(Json(
        state
            .ai
            .set_prerequisites(&actor, concept_id, &request.requires)
            .await?,
    ))
}

#[utoipa::path(
    post, path = "/courses/{course_id}/concept-tags", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    request_body = CreateConceptTagRequest,
    responses(
        (status = 201, description = "The tag (approved)", body = ConceptTagView),
        (status = 422, description = "Concept, activity or question outside the course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn create_concept_tag(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    body: axum::body::Bytes,
) -> ApiResult<(StatusCode, Json<ConceptTagView>)> {
    state.ai.require_concept_editor(&actor, course_id).await?;
    let request = ValidJson::<CreateConceptTagRequest>::parse(&body)?;
    let tag = state
        .ai
        .create_concept_tag(
            &actor,
            course_id,
            request.concept_id,
            request.activity_id,
            request.item_id,
            request.weight,
        )
        .await?;
    Ok((StatusCode::CREATED, Json(tag)))
}

async fn require_tag_in(state: &AppState, course_id: CourseId, id: ConceptTagId) -> ApiResult<()> {
    match ab_db::concepts::get_tag(&state.pool, id).await? {
        Some((course, _)) if course == course_id => Ok(()),
        _ => Err(ab_core::Error::not_found("concept tag").into()),
    }
}

#[utoipa::path(
    patch, path = "/courses/{course_id}/concept-tags/{tag_id}", tag = "ai",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("tag_id" = ConceptTagId, Path, description = "Tag id"),
    ),
    request_body = UpdateConceptTagRequest,
    responses(
        (status = 200, description = "The tag", body = ConceptTagView),
        (status = 404, description = "Unknown or inaccessible tag", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn update_concept_tag(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((course_id, tag_id)): Path<(CourseId, ConceptTagId)>,
    body: axum::body::Bytes,
) -> ApiResult<Json<ConceptTagView>> {
    state.ai.require_concept_tag(&actor, tag_id).await?;
    require_tag_in(&state, course_id, tag_id).await?;
    let request = ValidJson::<UpdateConceptTagRequest>::parse(&body)?;
    Ok(Json(
        state
            .ai
            .update_concept_tag(&actor, tag_id, request.status.as_deref(), request.weight)
            .await?,
    ))
}

#[utoipa::path(
    delete, path = "/courses/{course_id}/concept-tags/{tag_id}", tag = "ai",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("tag_id" = ConceptTagId, Path, description = "Tag id"),
    ),
    responses(
        (status = 204, description = "Deleted"),
        (status = 404, description = "Unknown or inaccessible tag", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn delete_concept_tag(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((course_id, tag_id)): Path<(CourseId, ConceptTagId)>,
) -> ApiResult<StatusCode> {
    state.ai.require_concept_tag(&actor, tag_id).await?;
    require_tag_in(&state, course_id, tag_id).await?;
    state.ai.delete_concept_tag(&actor, tag_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Batch decision over suggested concepts and tags.
#[utoipa::path(
    post, path = "/courses/{course_id}/concepts/review", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    request_body = ConceptReviewRequest,
    responses((status = 200, description = "The graph after the decision", body = ConceptGraph)),
)]
pub async fn review_concepts(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    body: axum::body::Bytes,
) -> ApiResult<Json<ConceptGraph>> {
    state.ai.require_concept_editor(&actor, course_id).await?;
    let request = ValidJson::<ConceptReviewRequest>::parse(&body)?;
    Ok(Json(
        state
            .ai
            .review_concepts(
                &actor,
                course_id,
                &request.status,
                &request.concept_ids,
                &request.tag_ids,
            )
            .await?,
    ))
}

/// The concept mapper reads the course and suggests concepts and tags (queued run).
#[utoipa::path(
    post, path = "/courses/{course_id}/concepts/suggest", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    request_body = SuggestConceptsRequest,
    responses(
        (status = 202, description = "Queued run", body = RunStatus),
        (status = 503, description = "AI disabled or budget exhausted", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn suggest_concepts(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    body: axum::body::Bytes,
) -> ApiResult<(StatusCode, Json<RunStatus>)> {
    state.ai.require_course_updater(&actor, course_id).await?;
    let request = ValidJson::<SuggestConceptsRequest>::parse(&body)?;
    detached(async move {
        let run = state
            .ai
            .suggest_concepts(&actor, course_id, request.chapter_id)
            .await?;
        Ok((StatusCode::ACCEPTED, Json(run.into())))
    })
    .await
}

// ── Mastery ─────────────────────────────────────────────────────────────────

/// The caller's own concept estimates and what to revisit.
#[utoipa::path(
    get, path = "/courses/{course_id}/mastery/me", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses((status = 200, description = "The learner's mastery", body = LearnerMastery)),
)]
pub async fn my_mastery(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
) -> ApiResult<Json<LearnerMastery>> {
    Ok(Json(state.ai.my_mastery(&actor, course_id).await?))
}

/// The class map for the course's teachers.
#[utoipa::path(
    get, path = "/courses/{course_id}/mastery", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses(
        (status = 200, description = "Mastery across the class", body = ClassMastery),
        (status = 403, description = "Not a teacher of the course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn class_mastery(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
) -> ApiResult<Json<ClassMastery>> {
    Ok(Json(state.ai.class_mastery(&actor, course_id).await?))
}

#[utoipa::path(
    get, path = "/courses/{course_id}/mastery/learners/{user_id}", tag = "ai",
    params(
        ("course_id" = CourseId, Path, description = "Course id"),
        ("user_id" = UserId, Path, description = "Learner id"),
    ),
    responses(
        (status = 200, description = "One learner's mastery with its evidence", body = LearnerMasteryDetail),
        (status = 404, description = "Not a learner of the course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn learner_mastery(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path((course_id, user_id)): Path<(CourseId, UserId)>,
) -> ApiResult<Json<LearnerMasteryDetail>> {
    Ok(Json(
        state.ai.learner_mastery(&actor, course_id, user_id).await?,
    ))
}

// ── Material search ─────────────────────────────────────────────────────────

/// Hybrid (meaning + words) search over the course material the caller can open.
#[utoipa::path(
    post, path = "/ai/retrieval/{course_id}/search", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    request_body = SearchRequest,
    responses(
        (status = 200, description = "Passages, best first", body = Vec<SearchHit>),
        (status = 404, description = "Unknown or inaccessible course", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn search_course(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    body: axum::body::Bytes,
) -> ApiResult<Json<Vec<SearchHit>>> {
    state.ai.require_visible_course(&actor, course_id).await?;
    let request = ValidJson::<SearchRequest>::parse(&body)?;
    Ok(Json(
        state
            .ai
            .search_course(&actor, course_id, &request.query, request.limit)
            .await?,
    ))
}

#[utoipa::path(
    get, path = "/ai/retrieval/{course_id}/status", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses((status = 200, description = "The course's index", body = IndexStatus)),
)]
pub async fn index_status(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
) -> ApiResult<Json<IndexStatus>> {
    Ok(Json(state.ai.index_status(&actor, course_id).await?))
}

/// Forgets the course's index; the minute sweep rebuilds it.
#[utoipa::path(
    post, path = "/ai/retrieval/{course_id}/reindex", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses((status = 202, description = "Queued for indexing", body = IndexStatus)),
)]
pub async fn reindex_course(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
) -> ApiResult<(StatusCode, Json<IndexStatus>)> {
    state.ai.require_index_owner(&actor, course_id).await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(state.ai.reindex_course(&actor, course_id).await?),
    ))
}

// ── AI pre-grading ──────────────────────────────────────────────────────────

/// Queue drafts for the activity's works waiting for a grade (or the listed ones).
#[utoipa::path(
    post, path = "/ai/grading/activities/{activity_id}/drafts/queue", tag = "ai",
    params(("activity_id" = ActivityId, Path, description = "Activity id")),
    request_body = QueueDraftsRequest,
    responses(
        (status = 202, description = "Queued drafts", body = QueueReport),
        (status = 503, description = "AI disabled or budget exhausted", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn queue_grade_drafts(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(activity_id): Path<ActivityId>,
    body: axum::body::Bytes,
) -> ApiResult<(StatusCode, Json<QueueReport>)> {
    state.ai.require_draft_grader(&actor, activity_id).await?;
    let request = ValidJson::<QueueDraftsRequest>::parse(&body)?;
    detached(async move {
        let report = state
            .ai
            .queue_grade_drafts(&actor, activity_id, request.subject_ids.as_deref())
            .await?;
        Ok((StatusCode::ACCEPTED, Json(report)))
    })
    .await
}

/// The newest draft of each work of the activity.
#[utoipa::path(
    get, path = "/ai/grading/activities/{activity_id}/drafts", tag = "ai",
    params(("activity_id" = ActivityId, Path, description = "Activity id")),
    responses((status = 200, description = "Drafts", body = Vec<GradeDraftView>)),
)]
pub async fn activity_grade_drafts(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(activity_id): Path<ActivityId>,
) -> ApiResult<Json<Vec<GradeDraftView>>> {
    Ok(Json(
        state.ai.activity_grade_drafts(&actor, activity_id).await?,
    ))
}

/// The newest draft of one work (submission or file attempt), or null.
#[utoipa::path(
    get, path = "/ai/grading/drafts/subject/{subject_id}", tag = "ai",
    params(("subject_id" = uuid::Uuid, Path, description = "Submission or file attempt id")),
    responses((status = 200, description = "The draft or null", body = Option<GradeDraftView>)),
)]
pub async fn subject_grade_draft(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(subject_id): Path<uuid::Uuid>,
) -> ApiResult<Json<Option<GradeDraftView>>> {
    Ok(Json(
        state.ai.subject_grade_draft(&actor, subject_id).await?,
    ))
}

/// Batch approval of the activity's drafts through the ordinary grade save; one result per item.
#[utoipa::path(
    post, path = "/ai/grading/activities/{activity_id}/drafts/approve", tag = "ai",
    params(("activity_id" = ActivityId, Path, description = "Activity id")),
    request_body = ApproveDraftsRequest,
    responses((status = 200, description = "One outcome per draft", body = Vec<ApproveOutcome>)),
)]
pub async fn approve_grade_drafts(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(activity_id): Path<ActivityId>,
    body: axum::body::Bytes,
) -> ApiResult<Json<Vec<ApproveOutcome>>> {
    state.ai.require_draft_grader(&actor, activity_id).await?;
    let request = ValidJson::<ApproveDraftsRequest>::parse(&body)?;
    detached(async move {
        Ok(Json(
            state
                .ai
                .approve_grade_drafts(
                    &actor,
                    &state.grading,
                    &state.file_submissions,
                    activity_id,
                    request.action,
                    &request.items(),
                )
                .await?,
        ))
    })
    .await
}

#[utoipa::path(
    post, path = "/ai/grading/drafts/{draft_id}/discard", tag = "ai",
    params(("draft_id" = GradeDraftId, Path, description = "Draft id")),
    responses(
        (status = 200, description = "The discarded draft", body = GradeDraftView),
        (status = 409, description = "The draft is no longer live", body = Problem,
         content_type = "application/problem+json"),
    )
)]
pub async fn discard_grade_draft(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(draft_id): Path<GradeDraftId>,
) -> ApiResult<Json<GradeDraftView>> {
    Ok(Json(state.ai.discard_grade_draft(&actor, draft_id).await?))
}

/// Similar works graded apart, drafts the teacher disagreed with, the AI's drift.
#[utoipa::path(
    get, path = "/ai/grading/activities/{activity_id}/consistency", tag = "ai",
    params(("activity_id" = ActivityId, Path, description = "Activity id")),
    responses((status = 200, description = "The consistency report", body = ConsistencyReport)),
)]
pub async fn grading_consistency(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(activity_id): Path<ActivityId>,
) -> ApiResult<Json<ConsistencyReport>> {
    Ok(Json(
        state.ai.grading_consistency(&actor, activity_id).await?,
    ))
}

#[utoipa::path(
    get, path = "/ai/grading/{course_id}/metrics", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id"), MetricsQuery),
    responses((status = 200, description = "Draft and feedback-time metrics", body = GradingMetrics)),
)]
pub async fn grading_metrics(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    Query(query): Query<MetricsQuery>,
) -> ApiResult<Json<GradingMetrics>> {
    Ok(Json(
        state
            .ai
            .grading_metrics(&actor, course_id, query.days.unwrap_or(30))
            .await?,
    ))
}

#[utoipa::path(
    get, path = "/ai/grading/{course_id}/settings", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    responses((status = 200, description = "The course's AI grading settings", body = GradingSettings)),
)]
pub async fn grading_settings(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
) -> ApiResult<Json<GradingSettings>> {
    Ok(Json(state.ai.grading_settings(&actor, course_id).await?))
}

#[utoipa::path(
    put, path = "/ai/grading/{course_id}/settings", tag = "ai",
    params(("course_id" = CourseId, Path, description = "Course id")),
    request_body = GradingSettingsRequest,
    responses((status = 200, description = "The settings", body = GradingSettings)),
)]
pub async fn set_grading_settings(
    State(state): State<AppState>,
    CurrentActor(actor): CurrentActor,
    Path(course_id): Path<CourseId>,
    body: axum::body::Bytes,
) -> ApiResult<Json<GradingSettings>> {
    state.ai.require_grading_owner(&actor, course_id).await?;
    let request = ValidJson::<GradingSettingsRequest>::parse(&body)?;
    Ok(Json(
        state
            .ai
            .set_grading_settings(&actor, course_id, request.auto_grade_drafts)
            .await?,
    ))
}
