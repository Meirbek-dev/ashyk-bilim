//! Drill-through rows behind the KPI cards (legacy
//! `services/analytics/drillthrough.py`).

use std::collections::HashSet;

use ab_core::id::{CourseId, UserId};

use super::context::{AnalyticsContext, build_activity_events, progress_snapshots};
use super::filters::AnalyticsFilters;
use super::types::{DrillMetric, TeacherAssessmentDetailResponse};
use super::workload::backlog_drillthrough_rows;

/// Rows for `active_learners` / `completion_rate` / `backlog`; `pass_rate`
/// rows come from [`pass_rate_rows`] over the assessment detail.
#[must_use]
pub fn drill_rows(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
    metric: DrillMetric,
    course_id: Option<CourseId>,
) -> Vec<serde_json::Value> {
    if metric == DrillMetric::Backlog {
        return backlog_drillthrough_rows(ctx, filters);
    }
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let snapshots = progress_snapshots(ctx, allowed.as_ref());
    let (current_start, current_end) = filters.window_bounds(ctx.generated_at);
    let active: HashSet<(CourseId, UserId)> = if metric == DrillMetric::ActiveLearners {
        build_activity_events(ctx, allowed.as_ref())
            .into_iter()
            .filter(|e| e.ts >= current_start && e.ts <= current_end)
            .map(|e| (e.course_id, e.user_id))
            .collect()
    } else {
        HashSet::new()
    };
    let cohort_filter = (!filters.cohort_ids.is_empty()).then_some(filters.cohort_ids.as_slice());
    snapshots
        .values()
        .filter(|s| course_id.is_none_or(|id| s.course_id == id))
        .filter(|s| metric != DrillMetric::ActiveLearners || active.contains(&(s.course_id, s.user_id)))
        .map(|s| {
            let mut row = serde_json::json!({
                "user_id": s.user_id,
                "user_display_name": ctx.display_name(s.user_id),
                "course_id": s.course_id,
                "course_name": ctx.course_name(s.course_id),
                "progress_pct": s.progress_pct,
                "completed_steps": s.completed_steps,
                "total_steps": s.total_steps,
                "is_completed": s.is_completed,
                "last_activity_at_unix": s.last_activity_at,
                "cohorts": ctx.cohort_names_for_user(s.user_id, cohort_filter),
            });
            if metric == DrillMetric::ActiveLearners {
                row["active_in_window"] = serde_json::Value::Bool(true);
            }
            row
        })
        .collect()
}

#[must_use]
pub fn pass_rate_rows(detail: &TeacherAssessmentDetailResponse) -> Vec<serde_json::Value> {
    detail
        .learner_rows
        .iter()
        .map(|l| {
            serde_json::json!({
                "user_id": l.user_id,
                "user_display_name": l.user_display_name,
                "attempts": l.attempts,
                "best_score": l.best_score,
                "last_score": l.last_score,
                "submitted_at_unix": l.submitted_at_unix,
                "graded_at_unix": l.graded_at_unix,
                "status": l.status,
                "passed": l.best_score.is_some_and(|b| b >= detail.pass_threshold),
            })
        })
        .collect()
}
