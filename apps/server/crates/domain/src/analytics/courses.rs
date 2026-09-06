//! Course health rows, the course list and the course detail (legacy
//! `services/analytics/courses.py`).

use std::collections::{HashMap, HashSet};

use ab_core::id::{ActivityId, ChapterId, CourseId, UserId};

use super::assessments::build_assessment_rows;
use super::bottlenecks::build_content_bottlenecks;
use super::context::{
    AnalyticsContext, ProgressSnapshot, SnapshotKey, build_activity_events, build_series, count,
    count_i64, days_between, is_reviewable, mean, progress_completed, progress_snapshots, round1,
    safe_pct_counts,
};
use super::filters::{AnalyticsFilters, DAY_SECS, SortOrder, Window};
use super::risk::build_risk_rows;
use super::types::{
    ActivityDropoffRow, AlertItem, AssessmentOutlierRow, AtRiskLearnerRow, ContentHealthRow,
    FunnelStep, Funnels, RiskLevel, Severity, TeacherCourseDetailSummary, TeacherCourseRow,
    TimeSeriesPoint,
};

/// Everything the course rows need beyond the context.
#[derive(Debug, Clone, Default)]
pub struct CourseRowInputs {
    /// Course → completion rate from the newest rollup before the window
    /// (legacy `_previous_completion_by_course`).
    pub previous_completion: HashMap<CourseId, f64>,
}

fn snapshots_for(
    snapshots: &std::collections::BTreeMap<SnapshotKey, ProgressSnapshot>,
    course_id: CourseId,
) -> Vec<&ProgressSnapshot> {
    snapshots
        .range((course_id, UserId(uuid::Uuid::nil()))..=(course_id, UserId(uuid::Uuid::max())))
        .map(|(_, s)| s)
        .collect()
}

fn completion_rate(snapshots: &[&ProgressSnapshot]) -> f64 {
    safe_pct_counts(
        snapshots.iter().filter(|s| s.is_completed).count(),
        snapshots.len(),
    )
    .unwrap_or(0.0)
}

fn avg_progress(snapshots: &[&ProgressSnapshot]) -> f64 {
    mean(&snapshots.iter().map(|s| s.progress_pct).collect::<Vec<_>>()).map_or(0.0, round1)
}

/// Legacy course-level `top_alert` ladder.
#[must_use]
pub fn course_top_alert(
    course_id: CourseId,
    ungraded: i64,
    engagement_delta_pct: Option<f64>,
    days_since_update: Option<i64>,
) -> Option<AlertItem> {
    if ungraded >= 10 {
        return Some(AlertItem {
            id: format!("grading-backlog-{course_id}"),
            kind: "grading_backlog",
            severity: if ungraded < 25 {
                Severity::Warning
            } else {
                Severity::Critical
            },
            title: "grading_queue_needs_attention".to_owned(),
            body: format!("{ungraded} submissions are still awaiting review."),
            href: None,
            course_id: Some(course_id),
            activity_id: None,
            assessment_id: None,
            learner_count: None,
        });
    }
    if let Some(delta) = engagement_delta_pct.filter(|d| *d < -15.0) {
        return Some(AlertItem {
            id: format!("engagement-drop-{course_id}"),
            kind: "engagement_drop",
            severity: Severity::Warning,
            title: "engagement_dropped".to_owned(),
            body: format!(
                "Active learners fell by {}% compared with the previous period.",
                delta.abs()
            ),
            href: None,
            course_id: Some(course_id),
            activity_id: None,
            assessment_id: None,
            learner_count: None,
        });
    }
    if let Some(days) = days_since_update.filter(|d| *d > 21) {
        return Some(AlertItem {
            id: format!("stale-content-{course_id}"),
            kind: "content_stale",
            severity: if days <= 35 {
                Severity::Info
            } else {
                Severity::Warning
            },
            title: "content_may_be_stale".to_owned(),
            body: format!("This course has not been updated for {days} days."),
            href: None,
            course_id: Some(course_id),
            activity_id: None,
            assessment_id: None,
            learner_count: None,
        });
    }
    None
}

/// Legacy `content_health_score`: 55% freshness (3.5 points per day since
/// the last update, unknown = 90 days) + 45% average progress.
#[must_use]
pub fn content_health_score(days_since_update: Option<i64>, avg_progress_pct: f64) -> f64 {
    let days = f64::from(i32::try_from(days_since_update.unwrap_or(90)).unwrap_or(i32::MAX));
    let freshness = round1(100.0 - days * 3.5).max(0.0);
    round1(freshness.mul_add(0.55, avg_progress_pct * 0.45))
}

/// Submission-count weighted difficulty (legacy `assessment_difficulty_score`).
#[must_use]
pub fn weighted_difficulty(rows: &[&AssessmentOutlierRow]) -> Option<f64> {
    let mut weighted = 0.0;
    let mut total = 0.0;
    for r in rows {
        let Some(difficulty) = r.difficulty_score else {
            continue;
        };
        #[allow(clippy::cast_possible_truncation)]
        let weight = ((r.submission_rate.unwrap_or(0.0) * 10.0) as i64).max(1);
        let weight = f64::from(i32::try_from(weight).unwrap_or(i32::MAX));
        weighted = difficulty.mul_add(weight, weighted);
        total += weight;
    }
    (total > 0.0).then(|| round1(weighted / total))
}

/// Legacy `build_course_rows` for the courses in `course_ids`.
#[must_use]
pub fn build_course_rows(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
    course_ids: &[CourseId],
    inputs: &CourseRowInputs,
) -> Vec<TeacherCourseRow> {
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let events = build_activity_events(ctx, allowed.as_ref());
    let snapshots = progress_snapshots(ctx, allowed.as_ref());
    let all_snapshots = progress_snapshots(ctx, None);
    let risk_rows = build_risk_rows(ctx, filters);
    let assessments = build_assessment_rows(ctx, filters);
    let now = ctx.generated_at;
    let (current_start, _) = filters.window_bounds(now);
    let (previous_start, previous_end) = filters.previous_window_bounds(now);

    let mut rows = Vec::new();
    for course_id in course_ids {
        let Some(course) = ctx.courses.get(course_id) else {
            continue;
        };
        let current_active: HashSet<UserId> = events
            .iter()
            .filter(|e| e.course_id == *course_id && e.ts >= current_start)
            .map(|e| e.user_id)
            .collect();
        let previous_active: HashSet<UserId> = events
            .iter()
            .filter(|e| e.course_id == *course_id && e.ts >= previous_start && e.ts < previous_end)
            .map(|e| e.user_id)
            .collect();
        let course_snapshots = snapshots_for(&snapshots, *course_id);
        let all_course_snapshots = snapshots_for(&all_snapshots, *course_id);
        let completion = completion_rate(&course_snapshots);
        let all_completion = completion_rate(&all_course_snapshots);
        let avg = avg_progress(&course_snapshots);
        let at_risk = count_i64(
            risk_rows
                .iter()
                .filter(|r| r.course_id == *course_id && r.risk_level.is_at_risk())
                .count(),
        );
        let ungraded = count_i64(
            ctx.submissions
                .iter()
                .filter(|s| s.course_id == *course_id && is_reviewable(s))
                .filter(|s| allowed.as_ref().is_none_or(|set| set.contains(&s.user_id)))
                .count(),
        );
        let last_update = ctx.course_last_content_update(*course_id);
        let days_since_update = last_update.map(|ts| days_between(ts, now));
        let engagement_delta = (!previous_active.is_empty()).then(|| {
            round1(
                (count(current_active.len()) - count(previous_active.len()))
                    / count(previous_active.len())
                    * 100.0,
            )
        });
        let course_assessments: Vec<&AssessmentOutlierRow> = assessments
            .iter()
            .filter(|a| a.course_id == *course_id)
            .collect();
        let active_7d = if filters.window == Window::D7 {
            current_active.len()
        } else {
            events
                .iter()
                .filter(|e| e.course_id == *course_id && e.ts >= now - 7 * DAY_SECS)
                .map(|e| e.user_id)
                .collect::<HashSet<_>>()
                .len()
        };
        rows.push(TeacherCourseRow {
            course_id: *course_id,
            course_name: course.name.clone(),
            active_learners_7d: count_i64(active_7d),
            completion_rate: completion,
            engagement_delta_pct: engagement_delta,
            at_risk_learners: at_risk,
            ungraded_submissions: ungraded,
            content_health_score: content_health_score(days_since_update, avg),
            assessment_difficulty_score: weighted_difficulty(&course_assessments),
            teacher_completion_delta_pct: None,
            platform_completion_delta_pct: None,
            historical_completion_delta_pct: inputs
                .previous_completion
                .get(course_id)
                .map(|prev| round1(completion - prev)),
            cohort_completion_delta_pct: (!filters.cohort_ids.is_empty())
                .then(|| round1(completion - all_completion)),
            last_content_update_at_unix: last_update,
            top_alert: course_top_alert(*course_id, ungraded, engagement_delta, days_since_update),
        });
    }
    if !rows.is_empty() {
        let mut values: Vec<f64> = rows.iter().map(|r| r.completion_rate).collect();
        values.sort_by(f64::total_cmp);
        let average = round1(values.iter().sum::<f64>() / count(values.len()));
        let median = values[values.len() / 2];
        for row in &mut rows {
            row.teacher_completion_delta_pct = Some(round1(row.completion_rate - average));
            row.platform_completion_delta_pct = Some(round1(row.completion_rate - median));
        }
    }
    sort_course_rows(&mut rows, filters.sort_by.as_deref(), filters.sort_order);
    rows
}

pub fn sort_course_rows(rows: &mut [TeacherCourseRow], sort_by: Option<&str>, order: SortOrder) {
    let cmp = |a: &TeacherCourseRow, b: &TeacherCourseRow| match sort_by {
        Some("name") => a
            .course_name
            .to_lowercase()
            .cmp(&b.course_name.to_lowercase()),
        Some("active") => a.active_learners_7d.cmp(&b.active_learners_7d),
        Some("completion") => a.completion_rate.total_cmp(&b.completion_rate),
        Some("risk") => a.at_risk_learners.cmp(&b.at_risk_learners),
        Some("health") => a.content_health_score.total_cmp(&b.content_health_score),
        Some("engagement") => a
            .engagement_delta_pct
            .unwrap_or(-10_000.0)
            .total_cmp(&b.engagement_delta_pct.unwrap_or(-10_000.0)),
        Some("difficulty") => a
            .assessment_difficulty_score
            .unwrap_or(-1.0)
            .total_cmp(&b.assessment_difficulty_score.unwrap_or(-1.0)),
        Some("signals") => a.top_alert.is_some().cmp(&b.top_alert.is_some()),
        _ => a
            .top_alert
            .is_some()
            .cmp(&b.top_alert.is_some())
            .then_with(|| a.at_risk_learners.cmp(&b.at_risk_learners))
            .then_with(|| b.content_health_score.total_cmp(&a.content_health_score)),
    };
    rows.sort_by(|a, b| match order {
        SortOrder::Asc => cmp(a, b),
        SortOrder::Desc => cmp(b, a),
    });
}

/// The pure part of the course detail (legacy `get_teacher_course_detail`).
pub struct CourseDetailParts {
    pub summary: TeacherCourseDetailSummary,
    pub funnels: Funnels,
    pub engagement_trend: Vec<TimeSeriesPoint>,
    pub activity_dropoff: Vec<ActivityDropoffRow>,
    pub assessment_outliers: Vec<AssessmentOutlierRow>,
    pub content_health: Vec<ContentHealthRow>,
    pub content_bottlenecks: Vec<ContentBottleneckRowVec>,
}

pub type ContentBottleneckRowVec = super::types::ContentBottleneckRow;

#[must_use]
#[allow(
    clippy::too_many_lines,
    reason = "one legacy code path kept whole for line-by-line comparison"
)]
pub fn build_course_detail(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
    course_id: CourseId,
    risk_rows: &[AtRiskLearnerRow],
) -> CourseDetailParts {
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let snapshots = progress_snapshots(ctx, allowed.as_ref());
    let course_snapshots = snapshots_for(&snapshots, course_id);
    let events: Vec<_> = build_activity_events(ctx, allowed.as_ref())
        .into_iter()
        .filter(|e| e.course_id == course_id)
        .collect();
    let now = ctx.generated_at;
    let (current_start, current_end) = filters.window_bounds(now);
    let engagement_trend = build_series(&events, filters, current_start, current_end, true)
        .into_iter()
        .map(|(bucket_start_unix, value)| TimeSeriesPoint {
            bucket_start_unix,
            value,
        })
        .collect();

    let enrolled = course_snapshots.len();
    let completed = course_snapshots.iter().filter(|s| s.is_completed).count();
    let completion = completion_rate(&course_snapshots);
    let avg = avg_progress(&course_snapshots);
    let active_7d = events
        .iter()
        .filter(|e| e.ts >= now - 7 * DAY_SECS)
        .map(|e| e.user_id)
        .collect::<HashSet<_>>()
        .len();
    let certificates = ctx
        .certificates
        .iter()
        .filter(|c| c.course_id == course_id)
        .count();
    let ungraded = ctx
        .submissions
        .iter()
        .filter(|s| s.course_id == course_id && is_reviewable(s))
        .filter(|s| allowed.as_ref().is_none_or(|set| set.contains(&s.user_id)))
        .count();

    // Completions per activity / chapter under the cohort filter.
    let mut completion_by_activity: HashMap<ActivityId, HashSet<UserId>> = HashMap::new();
    let mut chapter_counts: HashMap<ChapterId, HashSet<UserId>> = HashMap::new();
    for p in &ctx.activity_progress {
        if p.course_id != course_id
            || allowed
                .as_ref()
                .is_some_and(|set| !set.contains(&p.user_id))
            || !progress_completed(p)
        {
            continue;
        }
        completion_by_activity
            .entry(p.activity_id)
            .or_default()
            .insert(p.user_id);
        if let Some(activity) = ctx.activities.get(&p.activity_id) {
            chapter_counts
                .entry(activity.chapter_id)
                .or_default()
                .insert(p.user_id);
        }
    }

    let mut activity_dropoff = Vec::new();
    let mut previous: Option<usize> = None;
    for activity in ctx.ordered_activities(course_id) {
        let current = completion_by_activity
            .get(&activity.id)
            .map_or(0, HashSet::len);
        let Some(prev) = previous else {
            previous = Some(current);
            continue;
        };
        let dropoff_pct = if prev == 0 {
            0.0
        } else {
            round1((count(prev) - count(current)) / count(prev) * 100.0)
        };
        activity_dropoff.push(ActivityDropoffRow {
            chapter_id: activity.chapter_id,
            activity_id: activity.id,
            activity_name: activity.name.clone(),
            activity_type: activity.activity_type.clone(),
            previous_step_completions: count_i64(prev),
            current_step_completions: count_i64(current),
            dropoff_pct,
        });
        previous = Some(current);
    }

    let course_completion = vec![
        FunnelStep {
            label: "enrolled".to_owned(),
            count: count_i64(enrolled),
            pct_of_previous: None,
        },
        FunnelStep {
            label: "active_7d".to_owned(),
            count: count_i64(active_7d),
            pct_of_previous: safe_pct_counts(active_7d, enrolled),
        },
        FunnelStep {
            label: "completed".to_owned(),
            count: count_i64(completed),
            pct_of_previous: safe_pct_counts(
                completed,
                if active_7d > 0 { active_7d } else { enrolled },
            ),
        },
    ];
    let mut chapter_dropoff = Vec::new();
    let mut previous_chapter: Option<usize> = None;
    let mut chapters: Vec<_> = ctx
        .chapters
        .iter()
        .filter(|c| c.course_id == course_id)
        .collect();
    chapters.sort_by_key(|c| (c.position, c.id));
    for chapter in chapters {
        let n = chapter_counts.get(&chapter.id).map_or(0, HashSet::len);
        chapter_dropoff.push(FunnelStep {
            label: chapter.name.clone(),
            count: count_i64(n),
            pct_of_previous: previous_chapter
                .filter(|p| *p > 0)
                .and_then(|p| safe_pct_counts(n, p)),
        });
        previous_chapter = Some(n);
    }

    let last_update = ctx.course_last_content_update(course_id);
    let days_since_update = last_update.map(|ts| days_between(ts, now));
    let content_health = vec![
        ContentHealthRow {
            course_id,
            signal: "content_freshness",
            severity: match days_since_update {
                Some(d) if d > 45 => Severity::Critical,
                Some(d) if d > 21 => Severity::Warning,
                _ => Severity::Info,
            },
            value: days_since_update.map(|d| f64::from(i32::try_from(d).unwrap_or(i32::MAX))),
            note: "days_since_course_or_activity_update",
        },
        ContentHealthRow {
            course_id,
            signal: "average_progress",
            severity: if avg < 55.0 {
                Severity::Warning
            } else {
                Severity::Info
            },
            value: Some(avg),
            note: "average_progress_of_scoped_learners",
        },
        ContentHealthRow {
            course_id,
            signal: "grading_backlog",
            severity: if ungraded > 25 {
                Severity::Critical
            } else if ungraded > 0 {
                Severity::Warning
            } else {
                Severity::Info
            },
            value: Some(count(ungraded)),
            note: "ungraded_submissions_delaying_feedback",
        },
    ];

    let mut assessment_outliers: Vec<AssessmentOutlierRow> = build_assessment_rows(ctx, filters)
        .into_iter()
        .filter(|r| r.course_id == course_id)
        .collect();
    assessment_outliers.truncate(12);

    CourseDetailParts {
        summary: TeacherCourseDetailSummary {
            enrolled_learners: count_i64(enrolled),
            active_learners_7d: count_i64(active_7d),
            completion_rate: completion,
            avg_progress_pct: avg,
            at_risk_learners: count_i64(
                risk_rows
                    .iter()
                    .filter(|r| r.course_id == course_id && r.risk_level.is_at_risk())
                    .count(),
            ),
            ungraded_submissions: count_i64(ungraded),
            certificates_issued: count_i64(certificates),
        },
        funnels: Funnels {
            course_completion,
            chapter_dropoff,
        },
        engagement_trend,
        activity_dropoff,
        assessment_outliers,
        content_health,
        content_bottlenecks: build_content_bottlenecks(ctx, filters, Some(course_id), 12),
    }
}

/// Count of medium/high rows (shared by several summaries).
#[must_use]
pub fn at_risk_count(rows: &[AtRiskLearnerRow]) -> i64 {
    count_i64(
        rows.iter()
            .filter(|r| r.risk_level != RiskLevel::Low)
            .count(),
    )
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::float_cmp)]
mod tests {
    use super::*;

    #[test]
    fn health_score_matches_legacy_formula() {
        // Fresh content (0 days) + 50% progress → 55 + 22.5 = 77.5
        assert_eq!(content_health_score(Some(0), 50.0), 77.5);
        // Unknown update date counts as 90 days → freshness 0 → 0.45 × 40 = 18
        assert_eq!(content_health_score(None, 40.0), 18.0);
        // 10 days → 65 → 35.75 + 27 = 62.75 → 62.8 (half-even on .75)
        assert_eq!(content_health_score(Some(10), 60.0), 62.8);
    }

    #[test]
    fn alert_ladder_prefers_backlog_then_engagement_then_staleness() {
        let id = CourseId::new();
        assert_eq!(
            course_top_alert(id, 30, Some(-50.0), Some(60))
                .unwrap()
                .kind,
            "grading_backlog"
        );
        assert_eq!(
            course_top_alert(id, 30, None, None).unwrap().severity,
            Severity::Critical
        );
        assert_eq!(
            course_top_alert(id, 0, Some(-16.0), Some(60)).unwrap().kind,
            "engagement_drop"
        );
        let stale = course_top_alert(id, 0, Some(-5.0), Some(30)).unwrap();
        assert_eq!(
            (stale.kind, stale.severity),
            ("content_stale", Severity::Info)
        );
        assert!(course_top_alert(id, 0, None, Some(21)).is_none());
    }
}
