//! Content bottlenecks (legacy `services/analytics/bottlenecks.py`).
//!
//! Time spent comes from the progress projection (`started_at` →
//! `completed_at`, capped at 6h) instead of the legacy trail-step payload
//! sniffing, which the client never wrote.

use std::collections::{HashMap, HashSet};

use ab_core::assessments::ActivityProgressState;
use ab_core::id::{ActivityId, CourseId, UserId};

use super::assessments::build_assessment_rows;
use super::context::{
    AnalyticsContext, count, count_i64, days_between, mean, progress_completed, round1,
    safe_pct_counts,
};
use super::filters::AnalyticsFilters;
use super::types::{AssessmentOutlierRow, ContentBottleneckRow, Severity};

const MAX_TIME_SECS: f64 = 6.0 * 3600.0;

/// Legacy `build_content_bottlenecks`.
#[must_use]
pub fn build_content_bottlenecks(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
    course_id: Option<CourseId>,
    limit: usize,
) -> Vec<ContentBottleneckRow> {
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let target: HashSet<CourseId> = course_id.map_or_else(
        || ctx.courses.keys().copied().collect(),
        |id| HashSet::from([id]),
    );
    let mut started: HashMap<ActivityId, HashSet<UserId>> = HashMap::new();
    let mut completed: HashMap<ActivityId, HashSet<UserId>> = HashMap::new();
    let mut times: HashMap<ActivityId, Vec<f64>> = HashMap::new();
    for p in &ctx.activity_progress {
        if !target.contains(&p.course_id)
            || allowed.as_ref().is_some_and(|set| !set.contains(&p.user_id))
        {
            continue;
        }
        if p.state != ActivityProgressState::NotStarted {
            started.entry(p.activity_id).or_default().insert(p.user_id);
        }
        if progress_completed(p) {
            completed.entry(p.activity_id).or_default().insert(p.user_id);
        }
        if let (Some(s), Some(c)) = (p.started_at, p.completed_at) {
            if c >= s {
                #[allow(clippy::cast_precision_loss)]
                times
                    .entry(p.activity_id)
                    .or_default()
                    .push(((c - s) as f64).min(MAX_TIME_SECS));
            }
        }
    }

    let assessment_rows: Vec<AssessmentOutlierRow> = build_assessment_rows(ctx, filters)
        .into_iter()
        .filter(|r| target.contains(&r.course_id))
        .collect();
    let mut assessments_by_activity: HashMap<ActivityId, Vec<&AssessmentOutlierRow>> = HashMap::new();
    for r in &assessment_rows {
        if let Some(activity_id) = r.activity_id {
            assessments_by_activity.entry(activity_id).or_default().push(r);
        }
    }

    let mut rows = Vec::new();
    for (activity_id, activity) in &ctx.activities {
        if !target.contains(&activity.course_id) {
            continue;
        }
        let Some(course) = ctx.courses.get(&activity.course_id) else {
            continue;
        };
        let started_n = started.get(activity_id).map_or(0, HashSet::len);
        let completed_n = completed.get(activity_id).map_or(0, HashSet::len);
        let completion_rate = (started_n > 0)
            .then(|| safe_pct_counts(completed_n, started_n))
            .flatten();
        let avg_time = times.get(activity_id).and_then(|t| mean(t)).map(round1);
        let exit_count = started_n.saturating_sub(completed_n);
        let exit_rate = (started_n > 0)
            .then(|| safe_pct_counts(exit_count, started_n))
            .flatten();
        let base = |signal: &'static str, severity: Severity, note: &'static str| ContentBottleneckRow {
            course_id: course.id,
            course_name: course.name.clone(),
            activity_id: *activity_id,
            activity_name: activity.name.clone(),
            activity_type: activity.activity_type.clone(),
            signal,
            severity,
            completion_rate,
            started_learners: count_i64(started_n),
            completed_learners: count_i64(completed_n),
            avg_time_seconds: avg_time,
            exit_count: count_i64(exit_count),
            failed_assessments: 0,
            stale_days: None,
            note,
        };

        if started_n >= 3
            && completion_rate.is_some_and(|c| c < 60.0)
            && avg_time.is_some_and(|t| t >= 900.0)
        {
            rows.push(base(
                "high_time_low_completion",
                if completion_rate.unwrap_or(100.0) < 40.0 {
                    Severity::Critical
                } else {
                    Severity::Warning
                },
                "high_time_spent_low_completion",
            ));
        }
        if started_n >= 3 && exit_rate.is_some_and(|r| r >= 35.0) {
            rows.push(base(
                "exit_after_open",
                if exit_rate.unwrap_or(0.0) >= 60.0 {
                    Severity::Critical
                } else {
                    Severity::Warning
                },
                "learners_open_and_leave_without_completing",
            ));
        }
        let weak: Vec<&&AssessmentOutlierRow> = assessments_by_activity
            .get(activity_id)
            .map(|v| v.iter().filter(|r| r.pass_rate.is_some_and(|p| p < 60.0)).collect())
            .unwrap_or_default();
        if !weak.is_empty() {
            let failed: i64 = weak
                .iter()
                .map(|r| {
                    let share = (100.0 - r.pass_rate.unwrap_or(0.0)) / 100.0 * count(started_n.max(1));
                    #[allow(clippy::cast_possible_truncation)]
                    let n = share.round() as i64;
                    n.max(1)
                })
                .sum();
            let min_pass = weak
                .iter()
                .map(|r| r.pass_rate.unwrap_or(100.0))
                .fold(100.0_f64, f64::min);
            let mut row = base(
                "repeated_assessment_failures",
                if min_pass < 40.0 {
                    Severity::Critical
                } else {
                    Severity::Warning
                },
                "assessment_results_drop_around_this_activity",
            );
            row.failed_assessments = failed;
            rows.push(row);
        }
        let stale_days = ctx
            .course_last_content_update(activity.course_id)
            .map(|ts| days_between(ts, ctx.generated_at));
        let weak_any = assessments_by_activity
            .get(activity_id)
            .is_some_and(|v| v.iter().any(|r| r.pass_rate.unwrap_or(100.0) < 65.0));
        if let Some(days) = stale_days {
            if days >= 45 && (completion_rate.is_some_and(|c| c < 65.0) || weak_any) {
                let mut row = base(
                    "stale_low_performance",
                    if days >= 90 {
                        Severity::Critical
                    } else {
                        Severity::Warning
                    },
                    "stale_content_correlates_with_low_performance",
                );
                row.stale_days = Some(days);
                rows.push(row);
            }
        }
    }
    rows.sort_by(|a, b| {
        b.severity
            .cmp(&a.severity)
            .then_with(|| (b.exit_count + b.failed_assessments).cmp(&(a.exit_count + a.failed_assessments)))
            .then_with(|| {
                b.avg_time_seconds
                    .unwrap_or(0.0)
                    .total_cmp(&a.avg_time_seconds.unwrap_or(0.0))
            })
    });
    rows.truncate(limit);
    rows
}
