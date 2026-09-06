//! Analytics (legacy `services/analytics/*`, `routers/analytics.py`).
//!
//! Teacher and admin dashboards computed live over an in-memory context of
//! the scoped courses; daily rollups and risk snapshots written by the
//! `analytics:rollup` job supply period-over-period baselines; teacher
//! interventions and saved dashboard views are plain CRUD scoped to the
//! teacher. Permission model: `analytics:read|export:{assigned,platform,all}`.
#![allow(
    clippy::implicit_hasher,
    reason = "the std hasher everywhere: these helpers only ever receive sets built in this module"
)]

pub mod anomalies;
pub mod assessments;
pub mod bottlenecks;
pub mod context;
pub mod courses;
pub mod drillthrough;
pub mod events;
pub mod exports;
pub mod filters;
pub mod forecasting;
pub mod insights;
pub mod overview;
pub mod quality;
pub mod risk;
pub mod rollups;
pub mod scope;
pub mod types;
pub mod workload;

use ab_core::assessments::AssessmentKind;
use ab_core::id::{AssessmentId, CourseId, SavedViewId, UserId};
use ab_core::permission::Action;
use ab_core::{Error, FieldError, Result};
use sqlx::PgPool;

pub use context::AnalyticsContext;
pub use filters::{AnalyticsFilters, RawFilters};
pub use scope::TeacherScope;
use types::{
    AdminAnalyticsResponse, AtRiskLearnersResponse, DrillMetric, DrillThroughResponse,
    Intervention, InterventionList, SavedView, SavedViewList, TeacherAssessmentDetailResponse,
    TeacherAssessmentListResponse, TeacherCourseDetailResponse, TeacherCourseListResponse,
    TeacherOverviewResponse,
};

use crate::identity::Actor;

pub const INTERVENTION_TYPES: &[&str] = &[
    "message_sent",
    "submission_graded",
    "extension_granted",
    "meeting_scheduled",
    "learner_recovered",
];
pub const INTERVENTION_STATUSES: &[&str] = &["planned", "completed", "resolved"];
const INTERVENTION_LIST_LIMIT: i64 = 100;
/// "Latest" cut-off for rollup lookups.
const FAR_FUTURE: &str = "9999-12-31";

/// A new intervention as the API receives it.
#[derive(Debug, Clone)]
pub struct NewIntervention {
    pub user_id: UserId,
    pub course_id: CourseId,
    pub intervention_type: String,
    pub status: String,
    pub outcome: Option<String>,
    pub notes: Option<String>,
    pub payload: serde_json::Value,
}

fn page<T: Clone>(rows: &[T], filters: &AnalyticsFilters) -> Vec<T> {
    rows.iter()
        .skip(filters.offset())
        .take(filters.page_size)
        .cloned()
        .collect()
}

fn page_i64(n: usize) -> i64 {
    i64::try_from(n).unwrap_or(i64::MAX)
}

#[derive(Clone)]
pub struct AnalyticsService {
    pool: PgPool,
}

impl AnalyticsService {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn resolve_scope(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
        action: Action,
    ) -> Result<TeacherScope> {
        scope::resolve(&self.pool, actor, filters, action).await
    }

    async fn read_scope(&self, actor: &Actor, filters: &AnalyticsFilters) -> Result<TeacherScope> {
        self.resolve_scope(actor, filters, Action::Read).await
    }

    /// Context bounded to the comparison window (2× the window back).
    async fn windowed_context(
        &self,
        course_ids: &[CourseId],
        filters: &AnalyticsFilters,
    ) -> Result<AnalyticsContext> {
        let now = context::now_unix();
        let (previous_start, _) = filters.previous_window_bounds(now);
        AnalyticsContext::load(&self.pool, course_ids, Some(previous_start)).await
    }

    async fn enriched_risk_rows(
        &self,
        ctx: &AnalyticsContext,
        scope: &TeacherScope,
        filters: &AnalyticsFilters,
    ) -> Result<Vec<types::AtRiskLearnerRow>> {
        risk::enrich_risk_rows(
            &self.pool,
            scope,
            risk::build_risk_rows(ctx, filters),
            ctx.generated_at,
        )
        .await
    }

    /// The rollup row a teacher dashboard compares against: the platform
    /// aggregate for an unfiltered platform view, else the teacher's own.
    const fn rollup_teacher(scope: &TeacherScope, filters: &AnalyticsFilters) -> Option<UserId> {
        if scope.has_platform_scope && filters.teacher_user_id.is_none() {
            None
        } else {
            Some(scope.teacher_user_id)
        }
    }

    async fn course_inputs(
        &self,
        scope: &TeacherScope,
        current_start: i64,
    ) -> Result<courses::CourseRowInputs> {
        let rows = ab_db::analytics::course_metrics_before(
            &self.pool,
            &scope.course_ids,
            &context::utc_date(current_start),
        )
        .await?;
        Ok(courses::CourseRowInputs {
            previous_completion: rows
                .into_iter()
                .filter_map(|r| r.completion_rate.map(|c| (r.course_id, c)))
                .collect(),
        })
    }

    // ── Dashboards ──────────────────────────────────────────────────────

    pub async fn teacher_overview(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
    ) -> Result<TeacherOverviewResponse> {
        let scope = self.read_scope(actor, filters).await?;
        let ctx = self.windowed_context(&scope.course_ids, filters).await?;
        let now = ctx.generated_at;
        let (current_start, _) = filters.window_bounds(now);
        let (_, previous_end) = filters.previous_window_bounds(now);
        let previous_date = context::utc_date(previous_end);
        let rollup_teacher = Self::rollup_teacher(&scope, filters);
        let supports = filters.supports_teacher_rollup_reads();

        let risk_rows = self.enriched_risk_rows(&ctx, &scope, filters).await?;
        let interventions = ab_db::analytics::list_interventions(
            &self.pool,
            scope.teacher_user_id,
            &scope.course_ids,
            None,
            None,
            i64::MAX,
        )
        .await?;
        let teacher_rollup = if supports {
            ab_db::analytics::latest_teacher_metrics_before(&self.pool, rollup_teacher, FAR_FUTURE)
                .await?
        } else {
            None
        };
        let previous_teacher_metrics = if supports {
            ab_db::analytics::latest_teacher_metrics_before(
                &self.pool,
                rollup_teacher,
                &previous_date,
            )
            .await?
        } else {
            None
        };
        let previous_course_metrics =
            ab_db::analytics::course_metrics_before(&self.pool, &scope.course_ids, &previous_date)
                .await?;
        let previous_at_risk =
            ab_db::analytics::previous_at_risk_count(&self.pool, &scope.course_ids, &previous_date)
                .await?;
        let course_inputs = self.course_inputs(&scope, current_start).await?;

        Ok(overview::build_teacher_overview(
            &ctx,
            &scope,
            filters,
            overview::OverviewInputs {
                risk_rows,
                interventions,
                teacher_rollup,
                previous_teacher_metrics,
                previous_course_metrics,
                previous_at_risk,
                course_inputs,
            },
        ))
    }

    /// Platform scope required (`analytics:read:platform` / `:all`).
    pub async fn admin_overview(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
    ) -> Result<AdminAnalyticsResponse> {
        let scope = self.read_scope(actor, filters).await?;
        if !scope.has_platform_scope {
            return Err(Error::forbidden(
                "platform analytics scope required (analytics:read:platform)",
            ));
        }
        let ctx = self.windowed_context(&scope.course_ids, filters).await?;
        let risk_rows = risk::build_risk_rows(&ctx, filters);
        Ok(overview::build_admin_overview(
            &ctx, &scope, filters, &risk_rows,
        ))
    }

    pub async fn course_list(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
    ) -> Result<TeacherCourseListResponse> {
        let scope = self.read_scope(actor, filters).await?;
        let ctx = self.windowed_context(&scope.course_ids, filters).await?;
        let (current_start, _) = filters.window_bounds(ctx.generated_at);
        let inputs = self.course_inputs(&scope, current_start).await?;
        let rows = courses::build_course_rows(&ctx, filters, &scope.course_ids, &inputs);
        Ok(TeacherCourseListResponse {
            generated_at_unix: ctx.generated_at,
            total: page_i64(rows.len()),
            page: page_i64(filters.page),
            page_size: page_i64(filters.page_size),
            items: page(&rows, filters),
            course_options: overview::course_options(&ctx, &scope.course_ids),
            cohort_options: overview::cohort_options(&ctx),
        })
    }

    /// 404 outside the scope.
    pub async fn course_detail(
        &self,
        actor: &Actor,
        course_id: CourseId,
        filters: &AnalyticsFilters,
    ) -> Result<TeacherCourseDetailResponse> {
        let scope = self.read_scope(actor, filters).await?;
        scope.ensure_course(course_id)?;
        let ctx = AnalyticsContext::load(&self.pool, &[course_id], None).await?;
        let course = ctx
            .courses
            .get(&course_id)
            .ok_or_else(|| Error::not_found("course"))?;
        let risk_rows: Vec<_> = self
            .enriched_risk_rows(&ctx, &scope, filters)
            .await?
            .into_iter()
            .filter(|r| r.course_id == course_id)
            .collect();
        let parts = courses::build_course_detail(&ctx, filters, course_id, &risk_rows);
        Ok(TeacherCourseDetailResponse {
            generated_at_unix: ctx.generated_at,
            course: types::CourseRef {
                id: course.id,
                name: course.name.clone(),
            },
            summary: parts.summary,
            funnels: parts.funnels,
            engagement_trend: parts.engagement_trend,
            activity_dropoff: parts.activity_dropoff,
            at_risk_learners: risk_rows.into_iter().take(20).collect(),
            assessment_outliers: parts.assessment_outliers,
            content_health: parts.content_health,
            content_bottlenecks: parts.content_bottlenecks,
        })
    }

    pub async fn assessment_list(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
    ) -> Result<TeacherAssessmentListResponse> {
        let scope = self.read_scope(actor, filters).await?;
        let ctx = self.windowed_context(&scope.course_ids, filters).await?;
        let rows = assessments::build_assessment_rows(&ctx, filters);
        Ok(TeacherAssessmentListResponse {
            generated_at_unix: ctx.generated_at,
            total: page_i64(rows.len()),
            page: page_i64(filters.page),
            page_size: page_i64(filters.page_size),
            items: page(&rows, filters),
            course_options: overview::course_options(&ctx, &scope.course_ids),
            cohort_options: overview::cohort_options(&ctx),
        })
    }

    /// Resolve an assessment of the given kind inside the scope (404 when
    /// unknown, of another kind, or outside the scope).
    async fn scoped_assessment(
        &self,
        scope: &TeacherScope,
        kind: AssessmentKind,
        id: AssessmentId,
    ) -> Result<ab_db::assessments::AssessmentRow> {
        let assessment = ab_db::assessments::get_assessment(&self.pool, id)
            .await?
            .filter(|a| a.kind == kind && scope.contains(a.course_id))
            .ok_or_else(|| Error::not_found("assessment"))?;
        Ok(assessment)
    }

    pub async fn assessment_detail(
        &self,
        actor: &Actor,
        kind: AssessmentKind,
        id: AssessmentId,
        filters: &AnalyticsFilters,
    ) -> Result<TeacherAssessmentDetailResponse> {
        let scope = self.read_scope(actor, filters).await?;
        let assessment = self.scoped_assessment(&scope, kind, id).await?;
        let ctx = AnalyticsContext::load(&self.pool, &[assessment.course_id], None).await?;
        let info = ctx
            .assessment(id)
            .ok_or_else(|| Error::not_found("assessment"))?;
        let entries = ab_db::analytics::list_grading_entries_for_assessment(&self.pool, id).await?;
        let actions = ab_db::analytics::list_bulk_actions_for_assessment(&self.pool, id).await?;
        Ok(assessments::build_detail(
            &ctx,
            filters,
            assessments::DetailInputs {
                assessment: info,
                entries: &entries,
                actions: &actions,
            },
        ))
    }

    pub async fn at_risk_learners(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
    ) -> Result<AtRiskLearnersResponse> {
        let scope = self.read_scope(actor, filters).await?;
        let ctx = AnalyticsContext::load(&self.pool, &scope.course_ids, None).await?;
        let rows = self.enriched_risk_rows(&ctx, &scope, filters).await?;
        Ok(AtRiskLearnersResponse {
            generated_at_unix: ctx.generated_at,
            total: page_i64(rows.len()),
            page: page_i64(filters.page),
            page_size: page_i64(filters.page_size),
            items: page(&rows, filters),
            course_options: overview::course_options(&ctx, &scope.course_ids),
            cohort_options: overview::cohort_options(&ctx),
        })
    }

    // ── Interventions ───────────────────────────────────────────────────

    pub async fn list_interventions(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
        user_id: Option<UserId>,
        course_id: Option<CourseId>,
    ) -> Result<InterventionList> {
        let scope = self.read_scope(actor, filters).await?;
        if let Some(course_id) = course_id {
            scope.ensure_course(course_id)?;
        }
        let rows = ab_db::analytics::list_interventions(
            &self.pool,
            scope.teacher_user_id,
            &scope.course_ids,
            user_id,
            course_id,
            INTERVENTION_LIST_LIMIT,
        )
        .await?;
        Ok(InterventionList {
            generated_at_unix: context::now_unix(),
            total: page_i64(rows.len()),
            items: rows.into_iter().map(Into::into).collect(),
        })
    }

    /// Records the learner's latest snapshot score as `risk_score_before`
    /// (and `_after` when created already resolved), as the legacy did.
    pub async fn create_intervention(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
        input: NewIntervention,
    ) -> Result<Intervention> {
        let scope = self.read_scope(actor, filters).await?;
        scope.ensure_course(input.course_id)?;
        let mut errors = Vec::new();
        if !INTERVENTION_TYPES.contains(&input.intervention_type.as_str()) {
            errors.push(FieldError {
                field: "intervention_type".into(),
                code: "invalid".into(),
                message: format!("expected one of {}", INTERVENTION_TYPES.join(", ")),
            });
        }
        if !INTERVENTION_STATUSES.contains(&input.status.as_str()) {
            errors.push(FieldError {
                field: "status".into(),
                code: "invalid".into(),
                message: format!("expected one of {}", INTERVENTION_STATUSES.join(", ")),
            });
        }
        if !input.payload.is_object() {
            errors.push(FieldError {
                field: "payload".into(),
                code: "invalid".into(),
                message: "expected a JSON object".into(),
            });
        }
        if !errors.is_empty() {
            return Err(Error::validation(errors));
        }
        let current_risk =
            ab_db::analytics::latest_risk_score(&self.pool, input.user_id, input.course_id).await?;
        let resolved = input.status == "resolved";
        let row = ab_db::analytics::insert_intervention(
            &self.pool,
            ab_db::analytics::NewIntervention {
                teacher_user_id: scope.teacher_user_id,
                user_id: input.user_id,
                course_id: input.course_id,
                intervention_type: &input.intervention_type,
                status: &input.status,
                outcome: input.outcome.as_deref(),
                notes: input.notes.as_deref(),
                risk_score_before: current_risk,
                risk_score_after: if resolved { current_risk } else { None },
                payload: &input.payload,
                resolved,
            },
        )
        .await?;
        Ok(row.into())
    }

    // ── Saved views ─────────────────────────────────────────────────────

    pub async fn list_saved_views(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
    ) -> Result<SavedViewList> {
        let scope = self.read_scope(actor, filters).await?;
        let rows = ab_db::analytics::list_saved_views(&self.pool, scope.teacher_user_id).await?;
        Ok(SavedViewList {
            generated_at_unix: context::now_unix(),
            total: page_i64(rows.len()),
            items: rows.into_iter().map(Into::into).collect(),
        })
    }

    /// Insert or update the teacher's view of that type and name.
    pub async fn save_view(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
        name: &str,
        view_type: &str,
        query: &serde_json::Value,
    ) -> Result<SavedView> {
        let scope = self.read_scope(actor, filters).await?;
        if !query.is_object() {
            return Err(Error::validation(vec![FieldError {
                field: "query".into(),
                code: "invalid".into(),
                message: "expected a JSON object".into(),
            }]));
        }
        let row = ab_db::analytics::upsert_saved_view(
            &self.pool,
            scope.teacher_user_id,
            name.trim(),
            view_type.trim(),
            query,
        )
        .await?;
        Ok(row.into())
    }

    /// 404 when the view is not the teacher's own.
    pub async fn delete_view(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
        id: SavedViewId,
    ) -> Result<()> {
        let scope = self.read_scope(actor, filters).await?;
        if ab_db::analytics::delete_saved_view(&self.pool, scope.teacher_user_id, id).await? {
            Ok(())
        } else {
            Err(Error::not_found("saved view"))
        }
    }

    // ── Drill-through ───────────────────────────────────────────────────

    pub async fn drill_through(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
        metric: DrillMetric,
        course_id: Option<CourseId>,
        assessment: Option<(AssessmentKind, AssessmentId)>,
    ) -> Result<DrillThroughResponse> {
        let scope = self.read_scope(actor, filters).await?;
        if let Some(course_id) = course_id {
            scope.ensure_course(course_id)?;
        }
        let rows = if metric == DrillMetric::PassRate {
            let Some((kind, id)) = assessment else {
                return Err(Error::validation(vec![FieldError {
                    field: "assessment_id".into(),
                    code: "required".into(),
                    message: "assessment_type and assessment_id are required for pass_rate".into(),
                }]));
            };
            let detail = self.assessment_detail(actor, kind, id, filters).await?;
            drillthrough::pass_rate_rows(&detail)
        } else {
            let course_ids: Vec<CourseId> =
                course_id.map_or_else(|| scope.course_ids.clone(), |id| vec![id]);
            let ctx = self.windowed_context(&course_ids, filters).await?;
            drillthrough::drill_rows(&ctx, filters, metric, course_id)
        };
        Ok(DrillThroughResponse {
            generated_at_unix: context::now_unix(),
            metric,
            total: page_i64(rows.len()),
            items: rows
                .into_iter()
                .skip(filters.offset())
                .take(filters.page_size)
                .collect(),
        })
    }

    // ── CSV exports (analytics:export) ──────────────────────────────────

    async fn export_context(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
    ) -> Result<AnalyticsContext> {
        let scope = self.resolve_scope(actor, filters, Action::Export).await?;
        AnalyticsContext::load(&self.pool, &scope.course_ids, None).await
    }

    pub async fn export_at_risk_csv(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
    ) -> Result<String> {
        let ctx = self.export_context(actor, filters).await?;
        Ok(exports::at_risk_csv(&ctx, filters))
    }

    pub async fn export_grading_backlog_csv(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
    ) -> Result<String> {
        let ctx = self.export_context(actor, filters).await?;
        Ok(exports::grading_backlog_csv(&ctx, filters))
    }

    pub async fn export_course_progress_csv(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
    ) -> Result<String> {
        let ctx = self.export_context(actor, filters).await?;
        Ok(exports::course_progress_csv(&ctx, filters))
    }

    pub async fn export_assessment_outcomes_csv(
        &self,
        actor: &Actor,
        filters: &AnalyticsFilters,
    ) -> Result<String> {
        let ctx = self.export_context(actor, filters).await?;
        Ok(exports::assessment_outcomes_csv(&ctx, filters))
    }

    // ── Rollups ─────────────────────────────────────────────────────────

    /// Rebuild the rollups for one `YYYY-MM-DD` (default: today, UTC).
    pub async fn run_rollup(&self, date: Option<&str>) -> Result<ab_db::analytics::RollupCounts> {
        let today = context::utc_date(context::now_unix());
        let date = date.unwrap_or(&today);
        if context::utc_date_start(date).is_none() {
            return Err(Error::validation(vec![FieldError {
                field: "date".into(),
                code: "invalid".into(),
                message: format!("expected YYYY-MM-DD, got {date}"),
            }]));
        }
        rollups::run_rollup(&self.pool, date).await
    }

    /// Rebuild every day in `[from, to]` inclusive (`YYYY-MM-DD`).
    pub async fn run_rollup_range(
        &self,
        from: &str,
        to: &str,
    ) -> Result<Vec<(String, ab_db::analytics::RollupCounts)>> {
        let (Some(start), Some(end)) = (context::utc_date_start(from), context::utc_date_start(to))
        else {
            return Err(Error::validation(vec![FieldError {
                field: "from".into(),
                code: "invalid".into(),
                message: "expected YYYY-MM-DD dates".into(),
            }]));
        };
        if end < start {
            return Err(Error::validation(vec![FieldError {
                field: "to".into(),
                code: "invalid".into(),
                message: "`to` must not precede `from`".into(),
            }]));
        }
        let mut out = Vec::new();
        let mut cursor = start;
        while cursor <= end {
            let date = context::utc_date(cursor);
            let counts = rollups::run_rollup(&self.pool, &date).await?;
            out.push((date, counts));
            cursor += filters::DAY_SECS;
        }
        Ok(out)
    }
}
