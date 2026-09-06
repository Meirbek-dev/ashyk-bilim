//! Forecasts (legacy `services/analytics/forecasting.py`).

use std::collections::HashSet;

use ab_core::id::UserId;

use super::context::{
    AnalyticsContext, build_activity_events, count, count_i64, progress_snapshots, round1,
    safe_pct_counts,
};
use super::filters::{AnalyticsFilters, DAY_SECS};
use super::types::{
    AssessmentOutlierRow, AtRiskLearnerRow, Confidence, ForecastItem, Severity, TeacherCourseRow,
    TeacherWorkloadSummary,
};

/// Legacy `build_forecasts`, top 12 by severity then expected value.
#[must_use]
#[allow(
    clippy::too_many_lines,
    reason = "one legacy code path kept whole for line-by-line comparison"
)]
pub fn build_forecasts(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
    _risk_rows: &[AtRiskLearnerRow],
    course_rows: &[TeacherCourseRow],
    assessment_rows: &[AssessmentOutlierRow],
    workload: &TeacherWorkloadSummary,
) -> Vec<ForecastItem> {
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let snapshots = progress_snapshots(ctx, allowed.as_ref());
    let events = build_activity_events(ctx, allowed.as_ref());
    let now = ctx.generated_at;
    let (current_start, current_end) = filters.window_bounds(now);
    let elapsed_days = ((current_end - current_start) / DAY_SECS).max(1);
    let mut forecasts = Vec::new();

    for course in course_rows.iter().take(12) {
        let course_snapshots: Vec<_> = snapshots
            .values()
            .filter(|s| s.course_id == course.course_id)
            .collect();
        let active_recent: HashSet<UserId> = events
            .iter()
            .filter(|e| e.course_id == course.course_id && e.ts >= now - 7 * DAY_SECS)
            .map(|e| e.user_id)
            .collect();
        let unlikely = course_snapshots
            .iter()
            .filter(|s| {
                !s.is_completed && s.progress_pct < 70.0 && !active_recent.contains(&s.user_id)
            })
            .count();
        if unlikely > 0 {
            forecasts.push(ForecastItem {
                id: format!("completion-target-miss-{}", course.course_id),
                kind: "completion_target_miss",
                severity: if unlikely >= 10 {
                    Severity::Critical
                } else {
                    Severity::Warning
                },
                title: format!(
                    "{}: learners likely to miss the completion target",
                    course.course_name
                ),
                prediction: format!("{unlikely} learners are inactive or below 70% progress."),
                confidence_level: if course_snapshots.len() >= 10 {
                    Confidence::Medium
                } else {
                    Confidence::Low
                },
                course_id: Some(course.course_id),
                course_name: Some(course.course_name.clone()),
                assessment_type: None,
                assessment_id: None,
                learner_count: Some(count_i64(unlikely)),
                expected_value: safe_pct_counts(
                    course_snapshots.len() - unlikely,
                    course_snapshots.len(),
                ),
                target_value: Some(70.0),
                deadline_at_unix: None,
            });
        }

        let completed_now = course_snapshots.iter().filter(|s| s.is_completed).count();
        let completion_events = events
            .iter()
            .filter(|e| e.course_id == course.course_id && e.ts >= current_start)
            .count();
        #[allow(clippy::cast_precision_loss)]
        let velocity = count(completed_now) / elapsed_days as f64;
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let expected_completed =
            (completed_now + (velocity * 14.0).round() as usize).min(course_snapshots.len());
        let expected = safe_pct_counts(expected_completed, course_snapshots.len());
        if let Some(expected) = expected.filter(|_| course_snapshots.len() >= 5) {
            let target = course.completion_rate.max(60.0);
            forecasts.push(ForecastItem {
                id: format!("course-completion-deadline-{}", course.course_id),
                kind: "course_completion_deadline",
                severity: if expected < target {
                    Severity::Warning
                } else {
                    Severity::Info
                },
                title: format!("{}: 14-day completion forecast", course.course_name),
                prediction: format!(
                    "Expected completion rate is {expected}% if the current pace holds."
                ),
                confidence_level: if completion_events >= 5 {
                    Confidence::Medium
                } else {
                    Confidence::Low
                },
                course_id: Some(course.course_id),
                course_name: Some(course.course_name.clone()),
                assessment_type: None,
                assessment_id: None,
                learner_count: None,
                expected_value: Some(expected),
                target_value: Some(target),
                deadline_at_unix: Some(now + 14 * DAY_SECS),
            });
        }
    }

    forecasts.push(ForecastItem {
        id: "grading-backlog-7d".to_owned(),
        kind: "grading_backlog_7d",
        severity: if workload.forecast_backlog_7d >= 25 {
            Severity::Critical
        } else if workload.forecast_backlog_7d > workload.backlog_total {
            Severity::Warning
        } else {
            Severity::Info
        },
        title: "expected_grading_backlog_in_7_days".to_owned(),
        prediction: format!(
            "The queue is projected to reach {} submissions.",
            workload.forecast_backlog_7d
        ),
        confidence_level: Confidence::Medium,
        course_id: None,
        course_name: None,
        assessment_type: None,
        assessment_id: None,
        learner_count: Some(workload.forecast_backlog_7d),
        expected_value: Some(f64::from(
            i32::try_from(workload.forecast_backlog_7d).unwrap_or(i32::MAX),
        )),
        target_value: Some(f64::from(
            i32::try_from(workload.backlog_total).unwrap_or(i32::MAX),
        )),
        deadline_at_unix: Some(now + 7 * DAY_SECS),
    });

    for a in assessment_rows {
        let Some(pass_rate) = a.pass_rate.filter(|p| *p < 75.0) else {
            continue;
        };
        forecasts.push(ForecastItem {
            id: format!(
                "assessment-failure-risk-{}-{}",
                a.assessment_type, a.assessment_id
            ),
            kind: "assessment_failure_risk",
            severity: if pass_rate < 50.0 {
                Severity::Critical
            } else {
                Severity::Warning
            },
            title: format!("{}: elevated failure risk", a.title),
            prediction: format!(
                "Expected failure rate is {}% before the next deadline.",
                round1(100.0 - pass_rate)
            ),
            confidence_level: if a.submission_rate.is_some_and(|r| r >= 50.0) {
                Confidence::High
            } else {
                Confidence::Medium
            },
            course_id: Some(a.course_id),
            course_name: Some(a.course_name.clone()),
            assessment_type: Some(a.assessment_type),
            assessment_id: Some(a.assessment_id),
            learner_count: None,
            expected_value: Some(round1(100.0 - pass_rate)),
            target_value: Some(25.0),
            deadline_at_unix: None,
        });
    }

    forecasts.sort_by(|a, b| {
        b.severity.cmp(&a.severity).then_with(|| {
            b.expected_value
                .unwrap_or(0.0)
                .total_cmp(&a.expected_value.unwrap_or(0.0))
        })
    });
    forecasts.truncate(12);
    forecasts
}
