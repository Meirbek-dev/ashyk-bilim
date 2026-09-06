//! The teacher overview and the admin overview (legacy
//! `services/analytics/overview.py` + `admin.py`).
//!
//! Summary values are always computed live; the daily rollups supply the
//! previous-period baselines (at-risk count, ungraded, negative engagement)
//! and the freshness / mode block. The legacy served stale rollup numbers
//! as the current value whenever a rollup existed.

use std::collections::{BTreeMap, HashMap, HashSet};

use ab_core::id::{CourseId, UserId, UsergroupId};
use ab_db::analytics::{CourseMetricsRow, InterventionRow, TeacherMetricsRow};

use super::anomalies::build_anomalies;
use super::assessments::build_assessment_rows;
use super::bottlenecks::build_content_bottlenecks;
use super::context::{
    ActivityEvent, AnalyticsContext, EventSource, build_activity_events, build_series, count,
    count_i64, graded_at, is_graded, is_reviewable, mean, progress_snapshots, round1, safe_pct,
    safe_pct_counts,
};
use super::courses::{CourseRowInputs, at_risk_count, build_course_rows};
use super::filters::{AnalyticsFilters, DAY_SECS};
use super::forecasting::build_forecasts;
use super::insights::build_insight_feed;
use super::quality::build_data_quality;
use super::scope::TeacherScope;
use super::types::{
    AdminAnalyticsResponse, AdminCohortRow, AdminCourseRow, AdminProgramRow, AdminTeacherRow,
    AlertItem, AtRiskLearnerRow, Direction, FilterOption, InterventionSummary, MetricCard,
    RiskDistributionCounts, RiskLevel, Severity, TeacherOverviewResponse, TeacherOverviewScope,
    TeacherOverviewSummary, TeacherOverviewTrends, TeacherWorkloadSummary, TimeSeriesPoint,
};
use super::workload::{GRADING_SLA_HOURS, build_teacher_workload, build_workload_for_courses};

/// Legacy `_metric`.
#[must_use]
pub fn metric(
    label: &'static str,
    value: f64,
    previous: Option<f64>,
    unit: Option<&'static str>,
    is_higher_better: bool,
    benchmark: Option<f64>,
    benchmark_label: Option<&'static str>,
) -> MetricCard {
    let delta_value = previous.map(|p| round1(value - p));
    let delta_pct = previous
        .filter(|p| *p != 0.0)
        .map(|p| round1((value - p) / p * 100.0));
    MetricCard {
        value: round1(value),
        delta_value,
        delta_pct,
        direction: match delta_value {
            Some(d) if d > 0.0 => Direction::Up,
            Some(d) if d < 0.0 => Direction::Down,
            _ => Direction::Flat,
        },
        label,
        unit,
        is_higher_better,
        benchmark: benchmark.map(round1),
        benchmark_label,
    }
}

/// Legacy `summarize_interventions`.
#[must_use]
pub fn summarize_interventions(rows: &[InterventionRow]) -> InterventionSummary {
    let deltas: Vec<f64> = rows
        .iter()
        .filter_map(|r| Some(r.risk_score_after? - r.risk_score_before?))
        .collect();
    InterventionSummary {
        total: count_i64(rows.len()),
        open: count_i64(
            rows.iter()
                .filter(|r| r.status == "planned" || r.status == "completed")
                .count(),
        ),
        resolved: count_i64(rows.iter().filter(|r| r.status == "resolved").count()),
        recovered_learners: count_i64(
            rows.iter()
                .filter(|r| r.intervention_type == "learner_recovered")
                .count(),
        ),
        avg_risk_delta_after_intervention: mean(&deltas).map(round1),
    }
}

/// Legacy `_build_grading_slo_alerts`.
#[must_use]
pub fn grading_slo_alerts(workload: &TeacherWorkloadSummary) -> Vec<AlertItem> {
    let breached: Vec<_> = workload
        .backlog_by_assessment
        .iter()
        .filter(|r| r.sla_breaches > 0)
        .take(3)
        .collect();
    if !breached.is_empty() {
        return breached
            .into_iter()
            .map(|row| AlertItem {
                id: format!("grading-slo-{}", row.assessment_id),
                kind: "grading_slo",
                severity: if row.sla_breaches >= 3 {
                    Severity::Critical
                } else {
                    Severity::Warning
                },
                title: format!("{} is outside the grading target", row.title),
                body: format!(
                    "{} submissions in {} exceeded the {}-hour grading target; {} remain queued{}.",
                    row.sla_breaches,
                    row.course_name,
                    GRADING_SLA_HOURS,
                    row.awaiting_review,
                    row.age_hours
                        .map(|h| format!("; the oldest was submitted {h:.1}h ago"))
                        .unwrap_or_default()
                ),
                href: Some(format!(
                    "/dash/analytics/assessments/{}/{}",
                    row.assessment_type, row.assessment_id
                )),
                course_id: Some(row.course_id),
                activity_id: None,
                assessment_id: Some(row.assessment_id),
                learner_count: Some(row.awaiting_review),
            })
            .collect();
    }
    let Some(leading) = workload.backlog_by_assessment.first() else {
        return Vec::new();
    };
    let Some(age) = leading.age_hours.filter(|h| *h >= 48.0) else {
        return Vec::new();
    };
    vec![AlertItem {
        id: format!("grading-slo-watch-{}", leading.assessment_id),
        kind: "grading_slo",
        severity: Severity::Warning,
        title: format!("{} is approaching the grading target", leading.title),
        body: format!(
            "{} submissions are waiting in {}; the oldest has been open for {age:.1}h against a {}h target.",
            leading.awaiting_review, leading.course_name, GRADING_SLA_HOURS
        ),
        href: Some(format!(
            "/dash/analytics/assessments/{}/{}",
            leading.assessment_type, leading.assessment_id
        )),
        course_id: Some(leading.course_id),
        activity_id: None,
        assessment_id: Some(leading.assessment_id),
        learner_count: Some(leading.awaiting_review),
    }]
}

/// Sorted filter options for the scoped courses and the visible cohorts.
#[must_use]
pub fn course_options(ctx: &AnalyticsContext, course_ids: &[CourseId]) -> Vec<FilterOption> {
    let mut options: Vec<FilterOption> = ctx
        .courses
        .values()
        .filter(|c| course_ids.contains(&c.id))
        .map(|c| FilterOption {
            label: c.name.clone(),
            value: c.id.to_string(),
        })
        .collect();
    options.sort_by_key(|o| o.label.to_lowercase());
    options
}

#[must_use]
pub fn cohort_options(ctx: &AnalyticsContext) -> Vec<FilterOption> {
    let mut options: Vec<FilterOption> = ctx
        .usergroup_names
        .iter()
        .map(|(id, name)| FilterOption {
            label: name.clone(),
            value: id.to_string(),
        })
        .collect();
    options.sort_by_key(|o| o.label.to_lowercase());
    options
}

pub fn series(points: Vec<(i64, f64)>) -> Vec<TimeSeriesPoint> {
    points
        .into_iter()
        .map(|(bucket_start_unix, value)| TimeSeriesPoint {
            bucket_start_unix,
            value,
        })
        .collect()
}

/// Database-backed baselines the overview needs.
#[derive(Debug, Clone, Default)]
pub struct OverviewInputs {
    pub risk_rows: Vec<AtRiskLearnerRow>,
    pub interventions: Vec<InterventionRow>,
    pub teacher_rollup: Option<TeacherMetricsRow>,
    pub previous_teacher_metrics: Option<TeacherMetricsRow>,
    pub previous_course_metrics: Vec<CourseMetricsRow>,
    pub previous_at_risk: Option<i64>,
    pub course_inputs: CourseRowInputs,
}

/// Legacy `get_teacher_overview`.
#[must_use]
#[allow(clippy::too_many_lines)]
pub fn build_teacher_overview(
    ctx: &AnalyticsContext,
    scope: &TeacherScope,
    filters: &AnalyticsFilters,
    inputs: OverviewInputs,
) -> TeacherOverviewResponse {
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let events = build_activity_events(ctx, allowed.as_ref());
    let snapshots = progress_snapshots(ctx, allowed.as_ref());
    let now = ctx.generated_at;
    let (current_start, current_end) = filters.window_bounds(now);
    let (previous_start, previous_end) = filters.previous_window_bounds(now);
    let window = filters.window_secs();

    let users_in = |from: i64, to: i64| -> HashSet<UserId> {
        events
            .iter()
            .filter(|e| e.ts >= from && e.ts < to)
            .map(|e| e.user_id)
            .collect()
    };
    let current_active = users_in(current_start, i64::MAX);
    let previous_active = users_in(previous_start, previous_end);
    let returning = current_active.intersection(&previous_active).count();
    let before_previous = users_in(previous_start - window, previous_start);
    let previous_returning = previous_active.intersection(&before_previous).count();

    let enrolled = snapshots.len();
    let completion_rate = safe_pct_counts(
        snapshots.values().filter(|s| s.is_completed).count(),
        enrolled,
    )
    .unwrap_or(0.0);
    let previous_completions = snapshots
        .values()
        .filter(|s| s.is_completed && s.last_activity_at.is_some_and(|ts| ts < current_start))
        .count();
    let previous_completion_rate = safe_pct_counts(previous_completions, enrolled).unwrap_or(0.0);
    let risk_rows = inputs.risk_rows;
    let at_risk = at_risk_count(&risk_rows);
    let ungraded = ctx
        .submissions
        .iter()
        .filter(|s| is_reviewable(s))
        .filter(|s| allowed.as_ref().is_none_or(|set| set.contains(&s.user_id)))
        .count();

    let course_rows = build_course_rows(ctx, filters, &scope.course_ids, &inputs.course_inputs);
    let assessment_rows = build_assessment_rows(ctx, filters);
    let workload = build_teacher_workload(ctx, filters);
    let bottlenecks = build_content_bottlenecks(ctx, filters, None, 12);
    let data_quality = build_data_quality(ctx, scope, filters, inputs.teacher_rollup.as_ref());
    let forecasts = build_forecasts(
        ctx,
        filters,
        &risk_rows,
        &course_rows,
        &assessment_rows,
        &workload,
    );
    let anomalies = build_anomalies(ctx, filters, &course_rows, &assessment_rows);
    let negative_engagement = course_rows
        .iter()
        .filter(|r| r.engagement_delta_pct.is_some_and(|d| d < 0.0))
        .count();
    let previous_negative_engagement = if filters.supports_teacher_rollup_reads() {
        inputs
            .previous_teacher_metrics
            .as_ref()
            .map(|m| f64::from(m.courses_with_negative_engagement))
    } else {
        (!inputs.previous_course_metrics.is_empty()).then(|| {
            count(
                inputs
                    .previous_course_metrics
                    .iter()
                    .filter(|m| m.engagement_delta_pct.is_some_and(|d| d < 0.0))
                    .count(),
            )
        })
    };
    let previous_ungraded = inputs.previous_teacher_metrics.as_ref().map_or_else(
        || {
            (!inputs.previous_course_metrics.is_empty()).then(|| {
                f64::from(
                    inputs
                        .previous_course_metrics
                        .iter()
                        .map(|m| m.ungraded_submissions)
                        .sum::<i32>(),
                )
            })
        },
        |m| Some(f64::from(m.ungraded_submissions)),
    );

    let completion_events: Vec<ActivityEvent> = snapshots
        .values()
        .filter(|s| s.is_completed)
        .filter_map(|s| {
            Some(ActivityEvent {
                user_id: s.user_id,
                course_id: s.course_id,
                ts: s.last_activity_at?,
                source: EventSource::Completion,
                assessment_id: None,
                activity_id: None,
            })
        })
        .collect();
    let submission_events: Vec<ActivityEvent> = events
        .iter()
        .copied()
        .filter(|e| e.source.is_submission())
        .collect();
    let grading_events: Vec<ActivityEvent> = ctx
        .submissions
        .iter()
        .filter(|s| is_graded(s))
        .filter(|s| allowed.as_ref().is_none_or(|set| set.contains(&s.user_id)))
        .filter_map(|s| {
            Some(ActivityEvent {
                user_id: s.user_id,
                course_id: s.course_id,
                ts: graded_at(s)?,
                source: EventSource::Graded,
                assessment_id: Some(s.assessment_id),
                activity_id: None,
            })
        })
        .collect();
    let trends = TeacherOverviewTrends {
        active_learners: series(build_series(
            &events,
            filters,
            current_start,
            current_end,
            true,
        )),
        completions: series(build_series(
            &completion_events,
            filters,
            current_start,
            current_end,
            false,
        )),
        submissions: series(build_series(
            &submission_events,
            filters,
            current_start,
            current_end,
            false,
        )),
        grading_completed: series(build_series(
            &grading_events,
            filters,
            current_start,
            current_end,
            false,
        )),
    };

    let mut alerts: Vec<AlertItem> = course_rows
        .iter()
        .filter_map(|r| r.top_alert.clone())
        .collect();
    alerts.extend(grading_slo_alerts(&workload));
    if at_risk > 0 {
        alerts.push(AlertItem {
            id: "risk-overview".to_owned(),
            kind: "risk_spike",
            severity: if at_risk >= 15 {
                Severity::Critical
            } else {
                Severity::Warning
            },
            title: "learner_risk_needs_intervention".to_owned(),
            body: format!("{at_risk} learners in scope are at medium or high risk."),
            href: None,
            course_id: None,
            activity_id: None,
            assessment_id: None,
            learner_count: Some(at_risk),
        });
    }
    alerts.sort_by_key(|a| std::cmp::Reverse(a.severity));
    alerts.truncate(8);

    let level_count =
        |level: RiskLevel| count_i64(risk_rows.iter().filter(|r| r.risk_level == level).count());
    let mut completion_values: Vec<f64> = course_rows.iter().map(|r| r.completion_rate).collect();
    completion_values.sort_by(f64::total_cmp);
    let median_completion = (!completion_values.is_empty())
        .then(|| round1(completion_values[completion_values.len() / 2]));

    let insights = build_insight_feed(
        &risk_rows,
        &course_rows,
        &assessment_rows,
        &bottlenecks,
        &workload,
        10,
    );
    TeacherOverviewResponse {
        generated_at_unix: now,
        freshness_seconds: data_quality.freshness_seconds,
        window: filters.window,
        compare: filters.compare,
        scope: TeacherOverviewScope {
            teacher_user_id: scope.teacher_user_id,
            course_ids: scope.course_ids.clone(),
            cohort_ids: scope.cohort_ids.clone(),
        },
        summary: TeacherOverviewSummary {
            active_learners: metric(
                "active_learners",
                count(current_active.len()),
                Some(count(previous_active.len())),
                None,
                true,
                None,
                None,
            ),
            returning_learners: metric(
                "returning_learners",
                count(returning),
                Some(count(previous_returning)),
                None,
                true,
                None,
                None,
            ),
            completion_rate: metric(
                "completion_rate",
                completion_rate,
                Some(previous_completion_rate),
                Some("%"),
                true,
                median_completion,
                Some("median_across_courses"),
            ),
            at_risk_learners: metric(
                "at_risk_learners",
                f64::from(i32::try_from(at_risk).unwrap_or(i32::MAX)),
                inputs
                    .previous_at_risk
                    .map(|n| f64::from(i32::try_from(n).unwrap_or(i32::MAX))),
                None,
                false,
                (enrolled > 0).then(|| {
                    safe_pct(
                        f64::from(i32::try_from(at_risk).unwrap_or(i32::MAX)),
                        count(enrolled),
                    )
                    .unwrap_or(0.0)
                }),
                Some("pct_of_enrolled"),
            ),
            ungraded_submissions: metric(
                "ungraded_submissions",
                count(ungraded),
                previous_ungraded,
                None,
                false,
                None,
                None,
            ),
            negative_engagement_courses: metric(
                "negative_engagement_courses",
                count(negative_engagement),
                previous_negative_engagement,
                None,
                false,
                (!course_rows.is_empty()).then(|| {
                    safe_pct_counts(negative_engagement, course_rows.len()).unwrap_or(0.0)
                }),
                Some("pct_of_courses"),
            ),
        },
        trends,
        alerts,
        insights,
        data_quality,
        forecasts,
        anomalies,
        risk_distribution: RiskDistributionCounts {
            high: level_count(RiskLevel::High),
            medium: level_count(RiskLevel::Medium),
            low: level_count(RiskLevel::Low),
        },
        intervention_summary: summarize_interventions(&inputs.interventions),
        workload,
        content_bottlenecks: bottlenecks,
        at_risk_preview: risk_rows.iter().take(8).cloned().collect(),
        course_preview: course_rows.iter().take(8).cloned().collect(),
        assessment_preview: assessment_rows.iter().take(8).cloned().collect(),
        course_total: count_i64(course_rows.len()),
        assessment_total: count_i64(assessment_rows.len()),
        at_risk_total: count_i64(risk_rows.len()),
        course_options: course_options(ctx, &scope.course_ids),
        cohort_options: cohort_options(ctx),
    }
}

/// Legacy `get_admin_analytics` (platform scope only).
#[must_use]
#[allow(
    clippy::too_many_lines,
    reason = "one legacy code path kept whole for line-by-line comparison"
)]
pub fn build_admin_overview(
    ctx: &AnalyticsContext,
    scope: &TeacherScope,
    filters: &AnalyticsFilters,
    risk_rows: &[AtRiskLearnerRow],
) -> AdminAnalyticsResponse {
    let course_rows =
        build_course_rows(ctx, filters, &scope.course_ids, &CourseRowInputs::default());
    let snapshots = progress_snapshots(ctx, None);
    let events = build_activity_events(ctx, None);
    let now = ctx.generated_at;
    let (current_start, _) = filters.window_bounds(now);

    let mut teacher_courses: BTreeMap<UserId, HashSet<CourseId>> = BTreeMap::new();
    for c in ctx.courses.values() {
        if let Some(creator) = c.creator_id {
            teacher_courses.entry(creator).or_default().insert(c.id);
        }
    }
    let mut workload_rows: Vec<AdminTeacherRow> = teacher_courses
        .iter()
        .map(|(teacher_id, course_ids)| {
            let workload = build_workload_for_courses(ctx, filters, Some(course_ids));
            AdminTeacherRow {
                teacher_user_id: *teacher_id,
                teacher_display_name: ctx.display_name(*teacher_id),
                managed_course_count: count_i64(course_ids.len()),
                workload_backlog: workload.backlog_total,
                sla_breaches: workload.sla_breaches,
                median_feedback_latency_hours: workload.median_feedback_latency_hours,
                at_risk_learners: count_i64(
                    risk_rows
                        .iter()
                        .filter(|r| course_ids.contains(&r.course_id) && r.risk_level.is_at_risk())
                        .count(),
                ),
            }
        })
        .collect();
    workload_rows.sort_by(|a, b| {
        (b.sla_breaches, b.workload_backlog, b.at_risk_learners).cmp(&(
            a.sla_breaches,
            a.workload_backlog,
            a.at_risk_learners,
        ))
    });

    let mut course_health: Vec<AdminCourseRow> = course_rows
        .iter()
        .map(|r| {
            let activity_count = ctx
                .activities
                .values()
                .filter(|a| a.course_id == r.course_id)
                .count()
                .max(1);
            AdminCourseRow {
                course_id: r.course_id,
                course_name: r.course_name.clone(),
                health_score: r.content_health_score,
                completion_rate: r.completion_rate,
                active_learners_7d: r.active_learners_7d,
                at_risk_learners: r.at_risk_learners,
                content_roi_score: Some(super::context::round2(
                    (r.completion_rate + r.content_health_score) / count(activity_count),
                )),
            }
        })
        .collect();
    course_health.sort_by(|a, b| a.health_score.total_cmp(&b.health_score));
    let mut content_roi = course_health.clone();
    content_roi.sort_by(|a, b| {
        b.content_roi_score
            .unwrap_or(-1.0)
            .total_cmp(&a.content_roi_score.unwrap_or(-1.0))
    });

    let active_users: HashSet<UserId> = events
        .iter()
        .filter(|e| e.ts >= current_start)
        .map(|e| e.user_id)
        .collect();
    let mut members: BTreeMap<UsergroupId, HashSet<UserId>> = BTreeMap::new();
    for (user, groups) in &ctx.cohorts_by_user {
        for g in groups {
            members.entry(*g).or_default().insert(*user);
        }
    }
    let mut cohort_rows: Vec<AdminCohortRow> = members
        .iter()
        .map(|(cohort_id, users)| {
            let retained = users.iter().filter(|u| active_users.contains(u)).count();
            let progress: Vec<f64> = snapshots
                .values()
                .filter(|s| users.contains(&s.user_id))
                .map(|s| s.progress_pct)
                .collect();
            AdminCohortRow {
                cohort_id: *cohort_id,
                cohort_name: ctx
                    .usergroup_names
                    .get(cohort_id)
                    .cloned()
                    .unwrap_or_else(|| format!("Cohort {cohort_id}")),
                learners: count_i64(users.len()),
                retained_learners: count_i64(retained),
                retention_rate: safe_pct_counts(retained, users.len()),
                avg_progress_pct: mean(&progress).map(round1),
            }
        })
        .collect();
    cohort_rows.sort_by(|a, b| {
        a.retention_rate
            .unwrap_or(0.0)
            .total_cmp(&b.retention_rate.unwrap_or(0.0))
    });

    let mut by_creator: BTreeMap<Option<UserId>, Vec<&AdminCourseRow>> = BTreeMap::new();
    for row in &course_health {
        let creator = ctx.courses.get(&row.course_id).and_then(|c| c.creator_id);
        by_creator.entry(creator).or_default().push(row);
    }
    let mut program_rows: Vec<AdminProgramRow> = by_creator
        .into_iter()
        .map(|(creator, rows)| {
            let course_ids: HashSet<CourseId> = rows.iter().map(|r| r.course_id).collect();
            let learners: HashSet<UserId> = snapshots
                .values()
                .filter(|s| course_ids.contains(&s.course_id))
                .map(|s| s.user_id)
                .collect();
            let completions: Vec<f64> = rows.iter().map(|r| r.completion_rate).collect();
            let health: Vec<f64> = rows.iter().map(|r| r.health_score).collect();
            AdminProgramRow {
                program_id: creator,
                program_name: creator.map_or_else(
                    || "unassigned_courses".to_owned(),
                    |c| format!("courses_by:{}", ctx.display_name(c)),
                ),
                course_count: count_i64(rows.len()),
                learner_count: count_i64(learners.len()),
                completion_rate: mean(&completions).map(round1),
                health_score: mean(&health).map(round1),
            }
        })
        .collect();
    program_rows.sort_by(|a, b| {
        b.health_score
            .unwrap_or(0.0)
            .total_cmp(&a.health_score.unwrap_or(0.0))
    });

    workload_rows.truncate(25);
    course_health.truncate(25);
    cohort_rows.truncate(25);
    program_rows.truncate(25);
    content_roi.truncate(25);
    AdminAnalyticsResponse {
        generated_at_unix: now,
        teacher_workload_comparison: workload_rows,
        course_health_ranking: course_health,
        cohort_retention: cohort_rows,
        department_program_performance: program_rows,
        content_roi,
    }
}

/// Distinct active learners of a course in the trailing `days`.
#[must_use]
pub fn active_in_days(events: &[ActivityEvent], course_id: CourseId, now: i64, days: i64) -> usize {
    events
        .iter()
        .filter(|e| e.course_id == course_id && e.ts >= now - days * DAY_SECS)
        .map(|e| e.user_id)
        .collect::<HashSet<_>>()
        .len()
}

/// Helper for tests and the rollup: course → its learners' snapshots count.
#[must_use]
pub fn enrolled_by_course(ctx: &AnalyticsContext) -> HashMap<CourseId, usize> {
    let mut out: HashMap<CourseId, usize> = HashMap::new();
    for (course_id, _) in progress_snapshots(ctx, None).keys() {
        *out.entry(*course_id).or_default() += 1;
    }
    out
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::float_cmp)]
mod tests {
    use super::*;

    #[test]
    fn metric_cards_follow_legacy_delta_rules() {
        let card = metric("x", 12.0, Some(10.0), None, true, None, None);
        assert_eq!(card.delta_value, Some(2.0));
        assert_eq!(card.delta_pct, Some(20.0));
        assert_eq!(card.direction, Direction::Up);
        // previous 0 → no percentage, not infinity
        let fresh = metric("x", 5.0, Some(0.0), None, true, None, None);
        assert_eq!(fresh.delta_pct, None);
        assert_eq!(fresh.delta_value, Some(5.0));
        let none = metric("x", 5.0, None, None, true, Some(3.25), None);
        assert_eq!(none.direction, Direction::Flat);
        assert_eq!(none.benchmark, Some(3.2));
    }
}
