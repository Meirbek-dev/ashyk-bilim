//! The insight feed (legacy `services/analytics/insights.py`).

use std::collections::BTreeMap;

use ab_core::id::CourseId;

use super::context::count_i64;
use super::types::{
    AssessmentOutlierRow, AtRiskLearnerRow, ContentBottleneckRow, InsightFeedItem, RiskTrend,
    Severity, TeacherCourseRow, TeacherWorkloadSummary,
};

const fn as_i64(v: f64) -> i64 {
    #[allow(clippy::cast_possible_truncation)]
    let n = v.trunc() as i64;
    n
}

/// Legacy `build_insight_feed`, top `limit` by priority then severity.
#[must_use]
#[allow(
    clippy::too_many_lines,
    reason = "one legacy code path kept whole for line-by-line comparison"
)]
pub fn build_insight_feed(
    risk_rows: &[AtRiskLearnerRow],
    course_rows: &[TeacherCourseRow],
    assessment_rows: &[AssessmentOutlierRow],
    bottlenecks: &[ContentBottleneckRow],
    workload: &TeacherWorkloadSummary,
    limit: usize,
) -> Vec<InsightFeedItem> {
    let mut items = Vec::new();

    let mut newly: BTreeMap<CourseId, Vec<&AtRiskLearnerRow>> = BTreeMap::new();
    for row in risk_rows {
        if row.risk_trend == RiskTrend::NewlyAtRisk && row.risk_level.is_at_risk() {
            newly.entry(row.course_id).or_default().push(row);
        }
    }
    for (course_id, learners) in newly {
        let n = learners.len();
        items.push(InsightFeedItem {
            id: format!("risk-new-{course_id}"),
            category: "risk",
            severity: if n >= 10 {
                Severity::Critical
            } else {
                Severity::Warning
            },
            priority: 95 + count_i64(n.min(20)),
            title: format!("{n} new at-risk learners in {}.", learners[0].course_name),
            body: "risk_rose_against_each_learner_baseline_review_watchlist".to_owned(),
            course_id: Some(course_id),
            activity_id: None,
            assessment_type: None,
            assessment_id: None,
            learner_count: Some(count_i64(n)),
            href: Some("/dash/analytics/learners/at-risk".to_owned()),
        });
    }

    for a in assessment_rows {
        let Some(pass_rate) = a.pass_rate.filter(|p| *p < 65.0) else {
            continue;
        };
        items.push(InsightFeedItem {
            id: format!("assessment-{}-{}", a.assessment_type, a.assessment_id),
            category: "assessment",
            severity: if pass_rate < 45.0 {
                Severity::Critical
            } else {
                Severity::Warning
            },
            priority: 80 + as_i64(65.0 - pass_rate),
            title: format!("Pass rate for {} is {pass_rate}%.", a.title),
            body: if a.discrimination_index.is_some() {
                "quality_diagnostics_flag_this_assessment"
            } else {
                "low_pass_rate_flags_this_assessment"
            }
            .to_owned(),
            course_id: Some(a.course_id),
            activity_id: a.activity_id,
            assessment_type: Some(a.assessment_type),
            assessment_id: Some(a.assessment_id),
            learner_count: None,
            href: Some(format!(
                "/dash/analytics/assessments/{}/{}",
                a.assessment_type, a.assessment_id
            )),
        });
    }

    for b in bottlenecks.iter().take(4) {
        items.push(InsightFeedItem {
            id: format!("content-{}-{}", b.signal, b.activity_id),
            category: "content",
            severity: b.severity,
            priority: 70
                + if b.severity == Severity::Critical {
                    20
                } else {
                    10
                }
                + b.exit_count.min(10),
            title: format!("{} is a content bottleneck.", b.activity_name),
            body: b.note.to_owned(),
            course_id: Some(b.course_id),
            activity_id: Some(b.activity_id),
            assessment_type: None,
            assessment_id: None,
            learner_count: Some(b.started_learners),
            href: Some(format!(
                "/dash/analytics/courses?course_ids={}",
                b.course_id
            )),
        });
    }

    if workload.backlog_total > 0 {
        items.push(InsightFeedItem {
            id: "workload-backlog".to_owned(),
            category: "workload",
            severity: if workload.sla_breaches > 0 {
                Severity::Critical
            } else {
                Severity::Warning
            },
            priority: 85 + workload.sla_breaches.min(25),
            title: format!(
                "{} submissions are awaiting review.",
                workload.backlog_total
            ),
            body: format!(
                "{} breached the 72-hour grading target; the 7-day forecast is {}.",
                workload.sla_breaches, workload.forecast_backlog_7d
            ),
            course_id: None,
            activity_id: None,
            assessment_type: None,
            assessment_id: None,
            learner_count: None,
            href: Some("/dash/analytics?drill=backlog".to_owned()),
        });
    }

    for row in course_rows
        .iter()
        .filter(|r| r.historical_completion_delta_pct.is_some_and(|d| d >= 10.0))
        .take(3)
    {
        let delta = row.historical_completion_delta_pct.unwrap_or(0.0);
        items.push(InsightFeedItem {
            id: format!("completion-improved-{}", row.course_id),
            category: "completion",
            severity: Severity::Info,
            priority: 45 + as_i64(delta),
            title: format!(
                "Completion for {} improved by {delta} points.",
                row.course_name
            ),
            body: "cohort_outperforms_historical_course_baseline".to_owned(),
            course_id: Some(row.course_id),
            activity_id: None,
            assessment_type: None,
            assessment_id: None,
            learner_count: None,
            href: Some(format!("/dash/analytics/courses/{}", row.course_id)),
        });
    }

    items.sort_by(|a, b| {
        b.priority
            .cmp(&a.priority)
            .then_with(|| b.severity.cmp(&a.severity))
    });
    items.truncate(limit);
    items
}
