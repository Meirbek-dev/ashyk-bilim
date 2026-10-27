//! Teacher grading workload (legacy `services/analytics/workload.py`).
//!
//! The legacy fed this from `manual_assessment_submissions`, which was
//! always empty. v2 uses the real thing: `pending` submissions are the
//! backlog (any kind - every kind can need hand grading), and feedback
//! latency is measured on graded submissions of assessments whose
//! `grading_mode` is not `auto`. Handed-in file-task attempts are graded by
//! hand too and count the same way (the inbox lists both, OPEN-teach-1).

use std::collections::{BTreeMap, HashSet};

use ab_core::assessments::GradingMode;
use ab_core::id::{ActivityId, AssessmentId, CourseId, UserId};

use super::context::{
    AnalyticsContext, file_graded_at, file_is_graded, file_is_reviewable, file_submitted_at,
    graded_at, hours_between, is_graded, is_reviewable, median_or_none, round2, submitted_at,
};
use super::filters::AnalyticsFilters;
use super::types::{GradingBacklogItem, TeacherWorkloadSummary, WorkloadAgingBuckets};

pub use super::assessments::GRADING_SLA_HOURS;

/// What a backlog row groups: a test's submissions or a file task's attempts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum BacklogKey {
    Assessment(AssessmentId),
    FileTask(ActivityId),
}

/// One handed-in work as the workload sees it.
struct Work {
    key: BacklogKey,
    manual: bool,
    graded: bool,
    reviewable: bool,
    submitted: i64,
    graded_at: Option<i64>,
}

/// Every graded-by-hand work in scope: test submissions and file attempts.
fn works<'a>(
    ctx: &'a AnalyticsContext,
    keep: impl Fn(CourseId, UserId) -> bool + Copy + 'a,
) -> impl Iterator<Item = Work> + 'a {
    let tests = ctx
        .submissions
        .iter()
        .filter(move |s| keep(s.course_id, s.user_id))
        .filter_map(|s| {
            let assessment = ctx.assessment(s.assessment_id)?;
            Some(Work {
                key: BacklogKey::Assessment(assessment.id),
                manual: assessment.grading_mode != GradingMode::Auto,
                graded: is_graded(s),
                reviewable: is_reviewable(s),
                submitted: submitted_at(s),
                graded_at: graded_at(s),
            })
        });
    let files = ctx
        .file_attempts
        .iter()
        .filter(move |a| keep(a.course_id, a.user_id))
        .map(|a| Work {
            key: BacklogKey::FileTask(a.activity_id),
            manual: true,
            graded: file_is_graded(a),
            reviewable: file_is_reviewable(a),
            submitted: file_submitted_at(a),
            graded_at: file_graded_at(a),
        });
    tests.chain(files)
}

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

/// The workload over a subset of the context's courses (`None` = all) - the
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

    let mut backlog: BTreeMap<BacklogKey, BacklogAcc> = BTreeMap::new();
    let mut latencies = Vec::new();
    let mut backlog_total = 0;
    let mut sla_breaches = 0;
    let mut aging = WorkloadAgingBuckets::default();
    let mut submitted_in_window = 0.0;
    let mut graded_in_window = 0.0;

    let keep = |course: CourseId, user: UserId| {
        allowed
            .as_ref()
            .is_none_or(|set: &HashSet<UserId>| set.contains(&user))
            && course_filter.is_none_or(|set| set.contains(&course))
    };
    for work in works(ctx, &keep) {
        let submitted = work.submitted;
        let graded = work.graded_at;
        if work.manual {
            if submitted >= current_start && submitted <= current_end {
                submitted_in_window += 1.0;
            }
            if graded.is_some_and(|g| g >= current_start && g <= current_end) {
                graded_in_window += 1.0;
            }
            if work.graded {
                if let Some(latency) = hours_between(Some(submitted), graded) {
                    latencies.push(latency);
                }
                continue;
            }
        }
        if !work.reviewable {
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
        let item = backlog.entry(work.key).or_default();
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
        .filter_map(|(key, acc)| {
            let (course_id, activity_id, assessment, title) = match key {
                BacklogKey::Assessment(id) => {
                    let a = ctx.assessment(id)?;
                    (a.course_id, a.activity_id, Some(a), a.title.clone())
                }
                BacklogKey::FileTask(id) => {
                    let activity = ctx.activities.get(&id)?;
                    (activity.course_id, id, None, activity.name.clone())
                }
            };
            Some(GradingBacklogItem {
                course_id,
                course_name: ctx.course_name(course_id),
                activity_id,
                assessment_id: assessment.map(|a| a.id),
                assessment_type: assessment.map(|a| a.kind),
                title,
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
                    "activity_id": a.activity_id,
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
    rows.extend(
        ctx.file_attempts
            .iter()
            .filter(|a| file_is_reviewable(a))
            .filter(|a| allowed.as_ref().is_none_or(|set| set.contains(&a.user_id)))
            .map(|a| {
                let submitted = file_submitted_at(a);
                #[allow(clippy::cast_precision_loss)]
                let age_hours = round2((now - submitted).max(0) as f64 / 3600.0);
                (
                    age_hours,
                    serde_json::json!({
                        "attempt_id": a.id,
                        "activity_id": a.activity_id,
                        "assessment_id": null,
                        "assessment_type": null,
                        "assessment_title": ctx.activity_name(a.activity_id),
                        "course_id": a.course_id,
                        "course_name": ctx.course_name(a.course_id),
                        "user_id": a.user_id,
                        "user_display_name": ctx.display_name(a.user_id),
                        "status": a.status.as_str(),
                        "submitted_at_unix": submitted,
                        "age_hours": age_hours,
                        "sla_breached": age_hours > GRADING_SLA_HOURS,
                    }),
                )
            }),
    );
    rows.sort_by(|a, b| b.0.total_cmp(&a.0));
    rows.into_iter().map(|(_, v)| v).collect()
}

#[cfg(test)]
mod tests {
    use ab_core::assessments::{
        AssessmentKind, FileAttemptStatus, GradingMode, Lifecycle, SubmissionStatus,
    };
    use ab_core::id::{
        ActivityId, AssessmentId, ChapterId, CourseId, FileAttemptId, SubmissionId, UserId,
    };
    use ab_db::analytics::{
        ActivityInfoRow, AssessmentInfoRow, FileAttemptInfoRow, SubmissionInfoRow,
    };

    use super::{AnalyticsContext, backlog_drillthrough_rows, build_teacher_workload};
    use crate::analytics::filters::AnalyticsFilters;

    const NOW: i64 = 1_800_000_000;
    const HOUR: i64 = 3600;

    /// A course with a hand-graded test (one pending submission, 2 h old) and
    /// a file task (one attempt handed in 100 h ago, one graded).
    fn context() -> (AnalyticsContext, ActivityId) {
        let course = CourseId::new();
        let chapter = ChapterId::new();
        let test_activity = ActivityId::new();
        let file_activity = ActivityId::new();
        let assessment = AssessmentId::new();
        let mut ctx = AnalyticsContext {
            generated_at: NOW,
            ..AnalyticsContext::default()
        };
        for (id, name, kind) in [
            (test_activity, "Тест", "assessment"),
            (file_activity, "Эссе", "file_submission"),
        ] {
            ctx.activities.insert(
                id,
                ActivityInfoRow {
                    id,
                    course_id: course,
                    chapter_id: chapter,
                    name: name.into(),
                    activity_type: kind.into(),
                    position: 0,
                    published: true,
                    updated_at: 0,
                },
            );
        }
        ctx.assessments.push(AssessmentInfoRow {
            id: assessment,
            activity_id: test_activity,
            course_id: course,
            kind: AssessmentKind::Exam,
            title: "Тест".into(),
            lifecycle: Lifecycle::Published,
            grading_mode: GradingMode::Manual,
            passing_score: 60.0,
            due_at: None,
        });
        ctx.submissions.push(SubmissionInfoRow {
            id: SubmissionId::new(),
            assessment_id: assessment,
            course_id: course,
            user_id: UserId::new(),
            status: SubmissionStatus::Pending,
            attempt_number: 1,
            final_score: None,
            is_late: false,
            violation_count: 0,
            duration_seconds: None,
            started_at: None,
            submitted_at: Some(NOW - 2 * HOUR),
            graded_at: None,
            created_at: NOW - 2 * HOUR,
            updated_at: NOW - 2 * HOUR,
            grading: serde_json::json!({}),
        });
        for (status, submitted, graded) in [
            (FileAttemptStatus::Submitted, NOW - 100 * HOUR, None),
            (
                FileAttemptStatus::Published,
                NOW - 10 * HOUR,
                Some(NOW - 6 * HOUR),
            ),
        ] {
            ctx.file_attempts.push(FileAttemptInfoRow {
                id: FileAttemptId::new(),
                activity_id: file_activity,
                course_id: course,
                user_id: UserId::new(),
                status,
                submitted_at: Some(submitted),
                graded_at: graded,
                updated_at: submitted,
            });
        }
        (ctx, file_activity)
    }

    #[test]
    fn a_handed_in_file_task_waits_in_the_backlog_like_a_test() {
        let (ctx, file_activity) = context();
        let workload = build_teacher_workload(&ctx, &AnalyticsFilters::default());
        assert_eq!(workload.backlog_total, 2);
        assert_eq!(workload.sla_breaches, 1);
        assert_eq!(workload.aging_buckets.h0_24, 1);
        assert_eq!(workload.aging_buckets.d3_7, 1);
        // The graded file attempt is a feedback latency of 4 h.
        assert_eq!(workload.median_feedback_latency_hours, Some(4.0));
        let file_row = &workload.backlog_by_assessment[0];
        assert_eq!(file_row.activity_id, file_activity);
        assert_eq!(file_row.title, "Эссе");
        assert_eq!(file_row.assessment_id, None);
        assert_eq!(file_row.sla_breaches, 1);
        let test_row = &workload.backlog_by_assessment[1];
        assert!(test_row.assessment_id.is_some());
        assert_eq!(ctx.awaiting_review(None, None), 2);
        let drill = backlog_drillthrough_rows(&ctx, &AnalyticsFilters::default());
        assert_eq!(drill.len(), 2);
        assert_eq!(drill[0]["activity_id"], serde_json::json!(file_activity));
    }
}
