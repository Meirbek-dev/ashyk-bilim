//! Anomaly detection (legacy `services/analytics/anomalies.py`).

use std::collections::{HashMap, HashSet};

use ab_core::assessments::AssessmentKind;
use ab_core::id::{AssessmentId, CourseId, UserId};

use super::context::{
    AnalyticsContext, build_activity_events, count, mean, percentile, round1, score_of,
    submitted_at,
};
use super::filters::AnalyticsFilters;
use super::types::{AnomalyItem, AssessmentOutlierRow, Severity, TeacherCourseRow};

/// Legacy `build_anomalies`, top 12 by severity then observed value.
#[must_use]
pub fn build_anomalies(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
    course_rows: &[TeacherCourseRow],
    assessment_rows: &[AssessmentOutlierRow],
) -> Vec<AnomalyItem> {
    let events = build_activity_events(ctx, None);
    let now = ctx.generated_at;
    let (current_start, current_end) = filters.window_bounds(now);
    let (previous_start, previous_end) = filters.previous_window_bounds(now);
    let mut anomalies = Vec::new();

    for row in course_rows {
        let current: HashSet<UserId> = events
            .iter()
            .filter(|e| e.course_id == row.course_id && e.ts >= current_start && e.ts <= current_end)
            .map(|e| e.user_id)
            .collect();
        let previous: HashSet<UserId> = events
            .iter()
            .filter(|e| e.course_id == row.course_id && e.ts >= previous_start && e.ts < previous_end)
            .map(|e| e.user_id)
            .collect();
        if !previous.is_empty() && count(current.len()) <= (count(previous.len()) * 0.55).max(1.0) {
            anomalies.push(AnomalyItem {
                id: format!("engagement-drop-{}", row.course_id),
                kind: "engagement_drop",
                severity: if count(current.len()) <= count(previous.len()) * 0.35 {
                    Severity::Critical
                } else {
                    Severity::Warning
                },
                title: format!("{}: sharp engagement drop", row.course_name),
                detail: "active_learners_fell_sharply_vs_previous_period",
                observed_value: Some(count(current.len())),
                baseline_value: Some(count(previous.len())),
                course_id: Some(row.course_id),
                course_name: Some(row.course_name.clone()),
                assessment_type: None,
                assessment_id: None,
                activity_id: None,
            });
        }
    }

    let mut current_submissions: HashMap<CourseId, f64> = HashMap::new();
    let mut previous_submissions: HashMap<CourseId, f64> = HashMap::new();
    for e in events.iter().filter(|e| e.source.is_submission()) {
        if e.ts >= current_start && e.ts <= current_end {
            *current_submissions.entry(e.course_id).or_default() += 1.0;
        } else if e.ts >= previous_start && e.ts < previous_end {
            *previous_submissions.entry(e.course_id).or_default() += 1.0;
        }
    }
    let names: HashMap<CourseId, &str> = course_rows
        .iter()
        .map(|r| (r.course_id, r.course_name.as_str()))
        .collect();
    let mut spikes: Vec<_> = current_submissions.into_iter().collect();
    spikes.sort_by_key(|(id, _)| *id);
    for (course_id, current) in spikes {
        let previous = previous_submissions.get(&course_id).copied().unwrap_or(0.0);
        if current >= 10.0 && current >= (previous * 2.5).max(8.0) {
            let name = names.get(&course_id).copied().unwrap_or("Course");
            anomalies.push(AnomalyItem {
                id: format!("submission-spike-{course_id}"),
                kind: "submission_spike",
                severity: Severity::Warning,
                title: format!("{name}: unusual submission spike"),
                detail: "submission_volume_far_above_previous_period",
                observed_value: Some(current),
                baseline_value: Some(previous),
                course_id: Some(course_id),
                course_name: names.get(&course_id).map(|n| (*n).to_owned()),
                assessment_type: None,
                assessment_id: None,
                activity_id: None,
            });
        }
    }

    // Suspiciously fast quiz attempts.
    let mut durations: HashMap<AssessmentId, Vec<f64>> = HashMap::new();
    for s in &ctx.submissions {
        let Some(a) = ctx.assessment(s.assessment_id) else {
            continue;
        };
        if a.kind != AssessmentKind::Quiz {
            continue;
        }
        let duration = s.duration_seconds.map(f64::from).or_else(|| {
            s.started_at.zip(s.submitted_at).map(|(start, end)| {
                #[allow(clippy::cast_precision_loss)]
                let d = (end - start) as f64;
                d
            })
        });
        if let Some(d) = duration.filter(|d| *d > 0.0) {
            durations.entry(a.id).or_default().push(d);
        }
    }
    let mut fast: Vec<_> = durations.into_iter().collect();
    fast.sort_by_key(|(id, _)| *id);
    for (assessment_id, values) in fast {
        if values.len() < 5 {
            continue;
        }
        let cutoff = percentile(&values, 0.1).unwrap_or(0.0).max(20.0);
        let fast_count = values.iter().filter(|d| **d <= cutoff).count();
        if count(fast_count) >= (count(values.len()) * 0.25).max(3.0) {
            let Some(a) = ctx.assessment(assessment_id) else {
                continue;
            };
            anomalies.push(AnomalyItem {
                id: format!("fast-quiz-{}", a.id),
                kind: "fast_quiz_completion",
                severity: Severity::Warning,
                title: format!("{}: suspiciously fast completions", a.title),
                detail: "many_attempts_finished_near_minimum_observed_time",
                observed_value: Some(count(fast_count)),
                baseline_value: Some(count(values.len())),
                course_id: Some(a.course_id),
                course_name: Some(ctx.course_name(a.course_id)),
                assessment_type: Some(a.kind),
                assessment_id: Some(a.id),
                activity_id: Some(a.activity_id),
            });
        }
    }

    // Score distribution shift after the last content update.
    for row in assessment_rows {
        let Some(last_update) = ctx.course_last_content_update(row.course_id) else {
            continue;
        };
        if row.median_score.is_none() {
            continue;
        }
        let (mut before, mut after) = (Vec::new(), Vec::new());
        for s in ctx.submissions.iter().filter(|s| s.assessment_id == row.assessment_id) {
            let Some(score) = score_of(s) else {
                continue;
            };
            if submitted_at(s) < last_update {
                before.push(score);
            } else {
                after.push(score);
            }
        }
        if before.len() >= 3 && after.len() >= 3 {
            let (Some(before_avg), Some(after_avg)) = (mean(&before), mean(&after)) else {
                continue;
            };
            if (after_avg - before_avg).abs() >= 20.0 {
                anomalies.push(AnomalyItem {
                    id: format!("score-shift-{}-{}", row.assessment_type, row.assessment_id),
                    kind: "score_distribution_shift",
                    severity: Severity::Warning,
                    title: format!("{}: score distribution shifted after content update", row.title),
                    detail: "average_score_changed_after_last_content_update",
                    observed_value: Some(round1(after_avg)),
                    baseline_value: Some(round1(before_avg)),
                    course_id: Some(row.course_id),
                    course_name: Some(row.course_name.clone()),
                    assessment_type: Some(row.assessment_type),
                    assessment_id: Some(row.assessment_id),
                    activity_id: row.activity_id,
                });
            }
        }
    }

    anomalies.sort_by(|a, b| {
        b.severity
            .cmp(&a.severity)
            .then_with(|| b.observed_value.unwrap_or(0.0).total_cmp(&a.observed_value.unwrap_or(0.0)))
    });
    anomalies.truncate(12);
    anomalies
}
