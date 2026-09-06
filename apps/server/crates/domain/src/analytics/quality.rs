//! Data-quality block of the overview (legacy `services/analytics/quality.py`).

use ab_core::assessments::AssessmentKind;
use ab_db::analytics::TeacherMetricsRow;

use super::context::{AnalyticsContext, count_i64, progress_snapshots};
use super::filters::AnalyticsFilters;
use super::scope::TeacherScope;
use super::types::{AnalyticsDataQuality, Confidence, CourseDataGap, DataQualityIssue, Severity};

/// Legacy `build_data_quality`. `teacher_rollup` is the newest teacher
/// rollup when the filters allow rollup reads.
#[must_use]
pub fn build_data_quality(
    ctx: &AnalyticsContext,
    scope: &TeacherScope,
    filters: &AnalyticsFilters,
    teacher_rollup: Option<&TeacherMetricsRow>,
) -> AnalyticsDataQuality {
    let rollup = teacher_rollup.filter(|_| filters.supports_teacher_rollup_reads());
    let freshness_seconds = rollup.map_or(0, |r| (ctx.generated_at - r.generated_at).max(0));
    let snapshots = progress_snapshots(ctx, None);

    let mut missing_sources = Vec::new();
    if ctx.activity_progress.is_empty() {
        missing_sources.push("progress_events");
    }
    for (kind, label) in [
        (AssessmentKind::Quiz, "quiz_submissions"),
        (AssessmentKind::Exam, "exam_attempts"),
        (AssessmentKind::CodeChallenge, "code_submissions"),
    ] {
        let any = ctx.submissions.iter().any(|s| {
            ctx.assessment(s.assessment_id)
                .is_some_and(|a| a.kind == kind)
        });
        if !any {
            missing_sources.push(label);
        }
    }
    if ctx.events.is_empty() {
        missing_sources.push("event_log");
    }

    let mut gaps: Vec<CourseDataGap> = scope
        .course_ids
        .iter()
        .filter_map(|course_id| {
            let learners = snapshots
                .values()
                .filter(|s| s.course_id == *course_id)
                .count();
            (learners < 5).then(|| CourseDataGap {
                course_id: *course_id,
                course_name: ctx.course_name(*course_id),
                learner_count: count_i64(learners),
                reason: "fewer_than_5_learners",
            })
        })
        .collect();

    let mut issues = Vec::new();
    if !missing_sources.is_empty() {
        issues.push(DataQualityIssue {
            id: "missing-event-sources",
            severity: Severity::Warning,
            title: "some_event_sources_have_no_data",
            detail: missing_sources.join(", "),
            course_id: None,
            source: Some("events"),
        });
    }
    if !gaps.is_empty() {
        issues.push(DataQualityIssue {
            id: "thin-course-data",
            severity: Severity::Warning,
            title: "some_courses_have_too_little_data",
            detail: format!("{} courses have fewer than 5 learners.", gaps.len()),
            course_id: None,
            source: Some("enrollment"),
        });
    }
    if freshness_seconds > 86_400 {
        issues.push(DataQualityIssue {
            id: "stale-rollup",
            severity: Severity::Critical,
            title: "rollups_older_than_24_hours",
            detail:
                "Refresh the analytics rollups before using this view for operational decisions."
                    .to_owned(),
            course_id: None,
            source: Some("rollups"),
        });
    }

    let confidence = if freshness_seconds > 86_400 || missing_sources.len() >= 3 {
        Confidence::Low
    } else if missing_sources.is_empty() && gaps.is_empty() {
        Confidence::High
    } else {
        Confidence::Medium
    };
    gaps.truncate(20);

    AnalyticsDataQuality {
        mode: if rollup.is_some() { "rollup" } else { "live" },
        last_rollup_time_unix: rollup.map(|r| r.generated_at),
        freshness_seconds,
        confidence_level: confidence,
        missing_event_sources: missing_sources,
        courses_without_enough_data: gaps,
        excluded_preview_attempts: 0,
        excluded_teacher_attempts: 0,
        issues,
    }
}
