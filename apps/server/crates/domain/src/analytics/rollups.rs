//! Daily rollups + risk snapshots (legacy `services/analytics/rollups.py`
//! `refresh_teacher_analytics_rollups`, which nothing ever scheduled).
//!
//! One pass over the platform-wide context writes, for one `YYYY-MM-DD`
//! date: per-learner course progress, risk snapshots, course metrics,
//! per-activity engagement, assessment metrics, and teacher metrics (one row
//! per course author plus the platform aggregate). The day's rows are
//! replaced inside a single transaction, so re-running a date is idempotent.

use std::collections::{BTreeMap, HashMap, HashSet};

use ab_core::Result;
use ab_core::id::{ActivityId, CourseId, UserId};
use ab_db::analytics::{
    AssessmentMetricsWrite, CourseMetricsWrite, EngagementWrite, RiskSnapshotWrite, RollupCounts,
    TeacherMetricsWrite, UserCourseProgressWrite,
};
use sqlx::PgPool;

use super::assessments::{assessment_stats, build_assessment_rows};
use super::context::{
    ActivityEvent, AnalyticsContext, ProgressSnapshot, SnapshotKey, build_activity_events, count,
    days_between, mean, progress_completed, progress_snapshots, round1, round2, safe_pct_counts,
};
use super::courses::{CourseRowInputs, build_course_rows};
use super::filters::AnalyticsFilters;
use super::risk::build_risk_rows;
use super::types::{AtRiskLearnerRow, TeacherCourseRow};

/// What one rollup run wrote.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RollupReport {
    pub date: [u8; 10],
    pub counts: RollupCounts,
}

impl RollupReport {
    #[must_use]
    pub fn date_str(&self) -> String {
        String::from_utf8_lossy(&self.date).into_owned()
    }
}

fn i32_of(n: usize) -> i32 {
    i32::try_from(n).unwrap_or(i32::MAX)
}

/// Legacy `_merge_teacher_metrics` arithmetic for one teacher (or the
/// platform when `teacher` is `None`).
#[must_use]
pub fn teacher_metrics(
    teacher: Option<UserId>,
    course_ids: &HashSet<CourseId>,
    ctx: &AnalyticsContext,
    events: &[ActivityEvent],
    snapshots: &BTreeMap<SnapshotKey, ProgressSnapshot>,
    risk_rows: &[AtRiskLearnerRow],
    course_rows: &[TeacherCourseRow],
    filters: &AnalyticsFilters,
) -> TeacherMetricsWrite {
    let now = ctx.generated_at;
    let (current_start, _) = filters.window_bounds(now);
    let (previous_start, previous_end) = filters.previous_window_bounds(now);
    let mine: Vec<&ActivityEvent> = events.iter().filter(|e| course_ids.contains(&e.course_id)).collect();
    let within = |max_days: i64| -> usize {
        mine.iter()
            .filter(|e| days_between(e.ts, now) <= max_days)
            .map(|e| e.user_id)
            .collect::<HashSet<_>>()
            .len()
    };
    let current: HashSet<UserId> = mine
        .iter()
        .filter(|e| e.ts >= current_start)
        .map(|e| e.user_id)
        .collect();
    let previous: HashSet<UserId> = mine
        .iter()
        .filter(|e| e.ts >= previous_start && e.ts < previous_end)
        .map(|e| e.user_id)
        .collect();
    let my_snapshots: Vec<&ProgressSnapshot> = snapshots
        .values()
        .filter(|s| course_ids.contains(&s.course_id))
        .collect();
    let my_courses: Vec<&TeacherCourseRow> = course_rows
        .iter()
        .filter(|r| course_ids.contains(&r.course_id))
        .collect();
    let progress: Vec<f64> = my_snapshots.iter().map(|s| s.progress_pct).collect();
    TeacherMetricsWrite {
        teacher_user_id: teacher,
        managed_course_count: i32_of(course_ids.len()),
        active_learners_7d: i32_of(within(7)),
        active_learners_28d: i32_of(current.len()),
        active_learners_90d: i32_of(within(90)),
        returning_learners_28d: i32_of(current.intersection(&previous).count()),
        completion_rate: safe_pct_counts(
            my_snapshots.iter().filter(|s| s.is_completed).count(),
            my_snapshots.len(),
        ),
        avg_progress_pct: Some(round2(progress.iter().sum::<f64>() / count(progress.len().max(1)))),
        at_risk_learners: i32_of(
            risk_rows
                .iter()
                .filter(|r| course_ids.contains(&r.course_id) && r.risk_level.is_at_risk())
                .count(),
        ),
        ungraded_submissions: i32::try_from(my_courses.iter().map(|r| r.ungraded_submissions).sum::<i64>())
            .unwrap_or(i32::MAX),
        courses_with_negative_engagement: i32_of(
            my_courses
                .iter()
                .filter(|r| r.engagement_delta_pct.is_some_and(|d| d < 0.0))
                .count(),
        ),
        // The legacy column was named `_28d` but counted every certificate;
        // v2 honours the name.
        certificates_issued_28d: i32_of(
            ctx.certificates
                .iter()
                .filter(|c| course_ids.contains(&c.course_id) && c.created_at >= current_start)
                .count(),
        ),
    }
}

/// Per-activity started/completed learners with the drop-off from the
/// previous step, in curriculum order (legacy engagement loop).
#[must_use]
pub fn engagement_rows(
    ctx: &AnalyticsContext,
    course_id: CourseId,
    events: &[ActivityEvent],
) -> Vec<EngagementWrite> {
    let mut started: HashMap<ActivityId, HashSet<UserId>> = HashMap::new();
    for e in events.iter().filter(|e| e.course_id == course_id) {
        if let Some(activity_id) = e.activity_id {
            started.entry(activity_id).or_default().insert(e.user_id);
        }
    }
    let mut completed: HashMap<ActivityId, HashSet<UserId>> = HashMap::new();
    for p in ctx.activity_progress.iter().filter(|p| p.course_id == course_id) {
        if progress_completed(p) {
            completed.entry(p.activity_id).or_default().insert(p.user_id);
        }
    }
    let mut previous: Option<usize> = None;
    ctx.ordered_activities(course_id)
        .into_iter()
        .enumerate()
        .map(|(index, activity)| {
            let started_n = started.get(&activity.id).map_or(0, HashSet::len);
            let completed_n = completed.get(&activity.id).map_or(0, HashSet::len);
            let dropoff = previous
                .filter(|p| *p != 0)
                .map(|p| round2((count(p) - count(completed_n)) / count(p) * 100.0));
            previous = Some(completed_n);
            EngagementWrite {
                course_id,
                chapter_id: Some(activity.chapter_id),
                activity_id: activity.id,
                step_order: Some(i32_of(index + 1)),
                started_learners: i32_of(started_n),
                completed_learners: i32_of(completed_n),
                dropoff_from_previous_pct: dropoff,
            }
        })
        .collect()
}

/// Compute and store every rollup for `date` (`YYYY-MM-DD`).
pub async fn run_rollup(pool: &PgPool, date: &str) -> Result<RollupCounts> {
    let course_ids = ab_db::analytics::all_course_ids(pool).await?;
    let filters = AnalyticsFilters::default();
    let now = super::context::now_unix();
    let (previous_start, _) = filters.previous_window_bounds(now);
    let ctx = AnalyticsContext::load(pool, &course_ids, Some(previous_start)).await?;
    let generated_at = ctx.generated_at;

    let course_rows = build_course_rows(&ctx, &filters, &course_ids, &CourseRowInputs::default());
    let assessment_rows = build_assessment_rows(&ctx, &filters);
    let risk_rows = build_risk_rows(&ctx, &filters);
    let snapshots = progress_snapshots(&ctx, None);
    let events = build_activity_events(&ctx, None);
    let authors = ab_db::analytics::list_course_authors(pool, &course_ids).await?;

    let mut tx = pool.begin().await?;
    ab_db::analytics::delete_rollups_for_date(&mut tx, date).await?;

    for s in snapshots.values() {
        ab_db::analytics::insert_user_course_progress(
            &mut tx,
            date,
            generated_at,
            &UserCourseProgressWrite {
                user_id: s.user_id,
                course_id: s.course_id,
                trail_run_id: s.trail_run_id,
                progress_pct: s.progress_pct,
                completed_steps: i32::try_from(s.completed_steps).unwrap_or(i32::MAX),
                total_steps: i32::try_from(s.total_steps).unwrap_or(i32::MAX),
                last_activity_at: s.last_activity_at,
                is_completed: s.is_completed,
                has_certificate: s.has_certificate,
            },
        )
        .await?;
    }

    for r in &risk_rows {
        ab_db::analytics::insert_risk_snapshot(
            &mut tx,
            date,
            generated_at,
            &RiskSnapshotWrite {
                user_id: r.user_id,
                course_id: r.course_id,
                teacher_user_id: ctx.courses.get(&r.course_id).and_then(|c| c.creator_id),
                progress_pct: r.progress_pct,
                days_since_last_activity: r
                    .days_since_last_activity
                    .map(|d| i32::try_from(d).unwrap_or(i32::MAX)),
                failed_assessments: i32::try_from(r.failed_assessments).unwrap_or(i32::MAX),
                missing_required_assessments: i32::try_from(r.missing_required_assessments)
                    .unwrap_or(i32::MAX),
                open_grading_blocks: i32::try_from(r.open_grading_blocks).unwrap_or(i32::MAX),
                risk_score: r.risk_score,
                risk_level: r.risk_level.as_str().to_owned(),
                reason_codes: r.reason_codes.iter().map(|c| (*c).to_owned()).collect(),
                recommended_action: Some(r.recommended_action.to_owned()),
            },
        )
        .await?;
    }

    for row in &course_rows {
        let course_snapshots: Vec<&ProgressSnapshot> = snapshots
            .values()
            .filter(|s| s.course_id == row.course_id)
            .collect();
        let progress: Vec<f64> = course_snapshots.iter().map(|s| s.progress_pct).collect();
        let active_28d = events
            .iter()
            .filter(|e| e.course_id == row.course_id)
            .map(|e| e.user_id)
            .collect::<HashSet<_>>()
            .len();
        ab_db::analytics::insert_course_metrics(
            &mut tx,
            date,
            generated_at,
            &CourseMetricsWrite {
                course_id: row.course_id,
                teacher_user_id: ctx.courses.get(&row.course_id).and_then(|c| c.creator_id),
                enrolled_learners: i32_of(course_snapshots.len()),
                active_learners_7d: i32::try_from(row.active_learners_7d).unwrap_or(i32::MAX),
                active_learners_28d: i32_of(active_28d),
                completion_rate: Some(row.completion_rate),
                avg_progress_pct: Some(round2(progress.iter().sum::<f64>() / count(progress.len().max(1)))),
                at_risk_learners: i32::try_from(row.at_risk_learners).unwrap_or(i32::MAX),
                ungraded_submissions: i32::try_from(row.ungraded_submissions).unwrap_or(i32::MAX),
                certificates_issued: i32_of(
                    ctx.certificates
                        .iter()
                        .filter(|c| c.course_id == row.course_id)
                        .count(),
                ),
                content_health_score: Some(row.content_health_score),
                engagement_delta_pct: row.engagement_delta_pct,
                last_content_update_at: row.last_content_update_at_unix,
            },
        )
        .await?;
    }

    let mut courses_by_author: BTreeMap<UserId, HashSet<CourseId>> = BTreeMap::new();
    for a in authors {
        courses_by_author.entry(a.user_id).or_default().insert(a.course_id);
    }
    for (teacher, ids) in &courses_by_author {
        let write = teacher_metrics(
            Some(*teacher),
            ids,
            &ctx,
            &events,
            &snapshots,
            &risk_rows,
            &course_rows,
            &filters,
        );
        ab_db::analytics::insert_teacher_metrics(&mut tx, date, generated_at, &write).await?;
    }
    let all: HashSet<CourseId> = course_ids.iter().copied().collect();
    let platform = teacher_metrics(
        None,
        &all,
        &ctx,
        &events,
        &snapshots,
        &risk_rows,
        &course_rows,
        &filters,
    );
    ab_db::analytics::insert_teacher_metrics(&mut tx, date, generated_at, &platform).await?;

    for course_id in &course_ids {
        for w in engagement_rows(&ctx, *course_id, &events) {
            ab_db::analytics::insert_engagement(&mut tx, date, generated_at, &w).await?;
        }
    }

    for row in &assessment_rows {
        let Some(assessment) = ctx.assessment(row.assessment_id) else {
            continue;
        };
        let stats = assessment_stats(&ctx, &filters, assessment);
        ab_db::analytics::insert_assessment_metrics(
            &mut tx,
            date,
            generated_at,
            &AssessmentMetricsWrite {
                assessment_id: assessment.id,
                course_id: assessment.course_id,
                activity_id: Some(assessment.activity_id),
                assessment_kind: assessment.kind,
                eligible_learners: i32_of(stats.eligible),
                submitted_learners: i32_of(stats.submitted_users.len()),
                submission_rate: stats.submission_rate(),
                completion_rate: row.completion_rate,
                pass_rate: stats.pass_rate,
                median_score: super::context::median_or_none(&stats.scores),
                avg_score: mean(&stats.scores).map(round1),
                avg_attempts: stats.avg_attempts(),
                grading_latency_hours_p50: stats.latency_p50(),
                grading_latency_hours_p90: stats.latency_p90(),
                difficulty_score: row.difficulty_score,
            },
        )
        .await?;
    }

    tx.commit().await?;
    let counts = ab_db::analytics::rollup_counts(pool, date).await?;
    tracing::info!(
        date,
        courses = course_rows.len(),
        assessments = assessment_rows.len(),
        risk_rows = risk_rows.len(),
        progress_rows = snapshots.len(),
        "analytics rollups refreshed"
    );
    Ok(counts)
}
