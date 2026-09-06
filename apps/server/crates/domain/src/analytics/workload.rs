//! Teacher grading workload (legacy `services/analytics/workload.py`).
//!
//! The legacy fed this from `manual_assessment_submissions`, which was
//! always empty. v2 uses the real thing: `pending` submissions are the
//! backlog (any kind — every kind can need hand grading), and feedback
//! latency is measured on graded submissions of assessments whose
//! `grading_mode` is not `auto`.

use std::collections::{BTreeMap, HashSet};

use ab_core::assessments::GradingMode;
use ab_core::id::{AssessmentId, CourseId, UserId};

use super::context::{
    AnalyticsContext, graded_at, hours_between, is_graded, is_reviewable, median_or_none, round2,
    submitted_at,
};
use super::filters::AnalyticsFilters;
use super::types::{GradingBacklogItem, TeacherWorkloadSummary, WorkloadAgingBuckets};

pub use super::assessments::GRADING_SLA_HOURS;

#[derive(Default)]
struct BacklogAcc {
    awaiting: i64,
    oldest_submitted_at: Option<i64>,
    max_age_hours: Option<f64>,
    sla_breaches: i64,
}

/// Legacy `build_teacher_workload`.
#[must_use]
pub fn build_teacher_workload(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
) -> TeacherWorkloadSummary {
    build_workload_for_courses(ctx, filters, None)
}

/// The workload over a subset of the context's courses (`None` = all) — the
/// admin overview compares teachers this way instead of reloading a context
/// per teacher as the legacy did.
#[must_use]
#[allow(
    clippy::too_many_lines,
    reason = "one legacy code path kept whole for line-by-line comparison"
)]
#[allow(
    clippy::suboptimal_flops,
    reason = "legacy arithmetic order kept so rounding matches"
)]
pub fn build_workload_for_courses(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
    course_filter: Option<&HashSet<CourseId>>,
) -> TeacherWorkloadSummary {
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let now = ctx.generated_at;
    let (current_start, current_end) = filters.window_bounds(now);

    let mut backlog: BTreeMap<AssessmentId, BacklogAcc> = BTreeMap::new();
    let mut latencies = Vec::new();
    let mut backlog_total = 0;
    let mut sla_breaches = 0;
    let mut aging = WorkloadAgingBuckets::default();
    let mut submitted_in_window = 0.0;
    let mut graded_in_window = 0.0;

    for s in &ctx.submissions {
        if allowed
            .as_ref()
            .is_some_and(|set: &HashSet<UserId>| !set.contains(&s.user_id))
            || course_filter.is_some_and(|set| !set.contains(&s.course_id))
        {
            continue;
        }
        let Some(assessment) = ctx.assessment(s.assessment_id) else {
            continue;
        };
        let manual = assessment.grading_mode != GradingMode::Auto;
        let submitted = submitted_at(s);
        let graded = graded_at(s);
        if manual {
            if submitted >= current_start && submitted <= current_end {
                submitted_in_window += 1.0;
            }
            if graded.is_some_and(|g| g >= current_start && g <= current_end) {
                graded_in_window += 1.0;
            }
            if is_graded(s) {
                if let Some(latency) = hours_between(Some(submitted), graded) {
                    latencies.push(latency);
                }
                continue;
            }
        }
        if !is_reviewable(s) {
            continue;
        }
        backlog_total += 1;
        let age_hours = (now >= submitted).then(|| {
            #[allow(clippy::cast_precision_loss)]
            round2((now - submitted) as f64 / 3600.0)
        });
        let breach = age_hours.is_some_and(|h| h > GRADING_SLA_HOURS);
        if breach {
            sla_breaches += 1;
        }
        match age_hours {
            None => aging.h0_24 += 1,
            Some(h) if h <= 24.0 => aging.h0_24 += 1,
            Some(h) if h <= 72.0 => aging.d1_3 += 1,
            Some(h) if h <= 168.0 => aging.d3_7 += 1,
            Some(_) => aging.d7_plus += 1,
        }
        let item = backlog.entry(assessment.id).or_default();
        item.awaiting += 1;
        if breach {
            item.sla_breaches += 1;
        }
        item.oldest_submitted_at = Some(
            item.oldest_submitted_at
                .map_or(submitted, |o| o.min(submitted)),
        );
        if let Some(h) = age_hours {
            item.max_age_hours = Some(item.max_age_hours.map_or(h, |m| m.max(h)));
        }
    }

    #[allow(clippy::cast_precision_loss)]
    let days = filters.window_days().max(1) as f64;
    let daily_inflow = submitted_in_window / days;
    let daily_grading = graded_in_window / days;
    #[allow(clippy::cast_possible_truncation)]
    let forecast = (f64::from(i32::try_from(backlog_total).unwrap_or(i32::MAX))
        + (daily_inflow - daily_grading) * 7.0)
        .round()
        .max(0.0) as i64;

    let mut rows: Vec<GradingBacklogItem> = backlog
        .into_iter()
        .filter_map(|(id, acc)| {
            let a = ctx.assessment(id)?;
            Some(GradingBacklogItem {
                course_id: a.course_id,
                course_name: ctx.course_name(a.course_id),
                assessment_id: a.id,
                assessment_type: a.kind,
                title: a.title.clone(),
                awaiting_review: acc.awaiting,
                oldest_submitted_at_unix: acc.oldest_submitted_at,
                age_hours: acc.max_age_hours.map(round2),
                sla_breaches: acc.sla_breaches,
            })
        })
        .collect();
    rows.sort_by(|a, b| {
        b.sla_breaches
            .cmp(&a.sla_breaches)
            .then_with(|| {
                b.age_hours
                    .unwrap_or(0.0)
                    .total_cmp(&a.age_hours.unwrap_or(0.0))
            })
            .then_with(|| b.awaiting_review.cmp(&a.awaiting_review))
    });
    rows.truncate(25);

    TeacherWorkloadSummary {
        backlog_total,
        sla_breaches,
        median_feedback_latency_hours: median_or_none(&latencies),
        aging_buckets: aging,
        forecast_backlog_7d: forecast,
        backlog_by_assessment: rows,
    }
}

/// Legacy `backlog_items_for_drillthrough`: one row per pending submission,
/// oldest first.
#[must_use]
pub fn backlog_drillthrough_rows(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
) -> Vec<serde_json::Value> {
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let now = ctx.generated_at;
    let mut rows: Vec<(f64, serde_json::Value)> = ctx
        .submissions
        .iter()
        .filter(|s| is_reviewable(s))
        .filter(|s| allowed.as_ref().is_none_or(|set| set.contains(&s.user_id)))
        .filter_map(|s| {
            let a = ctx.assessment(s.assessment_id)?;
            let submitted = submitted_at(s);
            #[allow(clippy::cast_precision_loss)]
            let age_hours = round2((now - submitted).max(0) as f64 / 3600.0);
            Some((
                age_hours,
                serde_json::json!({
                    "submission_id": s.id,
                    "assessment_id": a.id,
                    "assessment_type": a.kind,
                    "assessment_title": a.title,
                    "course_id": a.course_id,
                    "course_name": ctx.course_name(a.course_id),
                    "user_id": s.user_id,
                    "user_display_name": ctx.display_name(s.user_id),
                    "status": s.status.as_str(),
                    "submitted_at_unix": submitted,
                    "age_hours": age_hours,
                    "sla_breached": age_hours > GRADING_SLA_HOURS,
                }),
            ))
        })
        .collect();
    rows.sort_by(|a, b| b.0.total_cmp(&a.0));
    rows.into_iter().map(|(_, v)| v).collect()
}
