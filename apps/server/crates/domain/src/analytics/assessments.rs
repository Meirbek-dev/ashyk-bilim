//! Assessment outlier rows and the per-assessment detail (legacy
//! `services/analytics/assessments.py`).
//!
//! v2 has one submission model for every kind, so the legacy's four
//! near-identical row builders collapse into one parameterised by
//! [`AssessmentKind`]; the pass threshold is the assessment policy's
//! `passing_score` (the legacy hard-coded 60 for quizzes and code).

use std::collections::{BTreeMap, HashMap, HashSet};

use ab_core::assessments::{AssessmentKind, Lifecycle, SubmissionStatus};
use ab_core::id::{AssessmentId, UserId, UsergroupId};
use ab_db::analytics::{AssessmentInfoRow, SubmissionInfoRow};

use super::context::{
    AnalyticsContext, count, count_i64, graded_at, hours_between, is_graded, is_reviewable,
    mean, median_or_none, percentile, progress_snapshots, round1, round2, safe_pct,
    safe_pct_counts, score_of, submitted_at,
};
use super::filters::{AnalyticsFilters, SortOrder};
use super::types::{
    AssessmentAuditEventRow, AssessmentCohortRow, AssessmentDiagnosticsSnapshot,
    AssessmentItemAnalyticsRow, AssessmentLearnerRow, AssessmentOutlierRow, AssessmentSloSnapshot,
    AssessmentSupportAlertRow, AssessmentSupportDiagnostics, CommonFailureRow, HistogramBucket,
    ItemSignal, QuestionDifficultyRow, Severity, SloStatus, TeacherAssessmentDetailResponse,
    TeacherAssessmentDetailSummary,
};

pub const GRADING_SLA_HOURS: f64 = 72.0;

// ── Pure statistics (legacy helpers) ────────────────────────────────────────

#[must_use]
pub fn score_bucket(score: Option<f64>) -> &'static str {
    let Some(score) = score else {
        return "unknown";
    };
    let lower = ((score / 20.0).floor() * 20.0).min(80.0);
    if lower < 20.0 {
        "0-19"
    } else if lower < 40.0 {
        "20-39"
    } else if lower < 60.0 {
        "40-59"
    } else if lower < 80.0 {
        "60-79"
    } else {
        "80-100"
    }
}

#[must_use]
pub fn score_distribution(scores: &[f64]) -> Vec<HistogramBucket> {
    let mut counts: HashMap<&'static str, i64> = HashMap::new();
    for s in scores {
        *counts.entry(score_bucket(Some(*s))).or_default() += 1;
    }
    ["0-19", "20-39", "40-59", "60-79", "80-100", "unknown"]
        .into_iter()
        .filter_map(|label| {
            let n = counts.get(label).copied().unwrap_or(0);
            (n > 0).then_some(HistogramBucket { label, count: n })
        })
        .collect()
}

#[must_use]
pub fn attempt_distribution(attempts_by_user: &HashMap<UserId, i64>) -> Vec<HistogramBucket> {
    let mut counts: HashMap<&'static str, i64> = HashMap::new();
    for attempts in attempts_by_user.values() {
        let label = match attempts {
            1 => "1",
            2 => "2",
            3 => "3",
            4 => "4",
            _ => "5+",
        };
        *counts.entry(label).or_default() += 1;
    }
    ["1", "2", "3", "4", "5+"]
        .into_iter()
        .filter_map(|label| {
            let n = counts.get(label).copied().unwrap_or(0);
            (n > 0).then_some(HistogramBucket { label, count: n })
        })
        .collect()
}

/// Population variance, rounded to 2 (needs ≥ 2 scores).
#[must_use]
pub fn score_variance(scores: &[f64]) -> Option<f64> {
    if scores.len() < 2 {
        return None;
    }
    let avg = mean(scores)?;
    Some(round2(
        scores.iter().map(|s| (s - avg).powi(2)).sum::<f64>() / count(scores.len()),
    ))
}

/// Legacy `_reliability_score`: distance of the variance from an ideal 350.
#[must_use]
pub fn reliability_score(scores: &[f64]) -> Option<f64> {
    let variance = score_variance(scores)?;
    let ideal = 350.0;
    let distance = (variance - ideal).abs();
    Some(round1((100.0 - distance / ideal * 100.0).max(0.0)))
}

/// Upper-27% mean minus lower-27% mean, over 100 (needs ≥ 4 learners).
#[must_use]
pub fn discrimination_index(scores_by_user: &HashMap<UserId, f64>) -> Option<f64> {
    if scores_by_user.len() < 4 {
        return None;
    }
    let mut ordered: Vec<f64> = scores_by_user.values().copied().collect();
    ordered.sort_by(f64::total_cmp);
    let group = group_size(ordered.len());
    let weak = mean(&ordered[..group])?;
    let strong = mean(&ordered[ordered.len() - group..])?;
    Some(round2((strong - weak) / 100.0))
}

/// `max(1, round(n * 0.27))` with Python's half-even rounding.
fn group_size(n: usize) -> usize {
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let size = super::context::round_to(count(n) * 0.27, 0) as usize;
    size.max(1)
}

#[must_use]
pub fn suspicious_flag(
    pass_rate: Option<f64>,
    variance: Option<f64>,
    discrimination: Option<f64>,
) -> Option<&'static str> {
    if pass_rate.is_some_and(|p| p >= 95.0) {
        Some("too_easy")
    } else if pass_rate.is_some_and(|p| p <= 20.0) {
        Some("too_hard")
    } else if discrimination.is_some_and(|d| d < 0.15) {
        Some("low_discrimination")
    } else if variance.is_some_and(|v| v < 25.0) {
        Some("low_variance")
    } else {
        None
    }
}

fn user_allowed(user_id: UserId, allowed: Option<&HashSet<UserId>>) -> bool {
    allowed.is_none_or(|set| set.contains(&user_id))
}

fn in_bucket_window(ts: i64, window: Option<(i64, i64)>) -> bool {
    window.is_none_or(|(start, end)| ts >= start && ts < end)
}

/// Assessments that can have data: everything past draft.
fn is_reportable(a: &AssessmentInfoRow) -> bool {
    matches!(a.lifecycle, Lifecycle::Published | Lifecycle::Archived)
}

// ── Per-assessment statistics ───────────────────────────────────────────────

/// Everything computed from one assessment's submissions.
#[derive(Debug, Clone, Default)]
pub struct AssessmentStats {
    pub eligible: usize,
    pub submitted_users: HashSet<UserId>,
    pub scores: Vec<f64>,
    pub scores_by_user: HashMap<UserId, f64>,
    pub attempts_by_user: HashMap<UserId, i64>,
    pub latencies: Vec<f64>,
    pub pass_rate: Option<f64>,
}

impl AssessmentStats {
    #[must_use]
    pub fn compute(
        assessment: &AssessmentInfoRow,
        submissions: &[&SubmissionInfoRow],
        eligible: usize,
    ) -> Self {
        let mut stats = Self {
            eligible,
            ..Self::default()
        };
        for s in submissions {
            stats.submitted_users.insert(s.user_id);
            *stats.attempts_by_user.entry(s.user_id).or_default() += 1;
            if let Some(score) = score_of(s) {
                stats.scores.push(score);
                // Best score per learner drives discrimination.
                let entry = stats.scores_by_user.entry(s.user_id).or_insert(score);
                *entry = entry.max(score);
            }
            if is_graded(s) {
                if let Some(latency) = hours_between(Some(submitted_at(s)), graded_at(s)) {
                    stats.latencies.push(latency);
                }
            }
        }
        let passed = stats
            .scores
            .iter()
            .filter(|s| **s >= assessment.passing_score)
            .count();
        stats.pass_rate = safe_pct_counts(passed, stats.scores.len());
        stats
    }

    #[must_use]
    pub fn submission_rate(&self) -> Option<f64> {
        safe_pct_counts(self.submitted_users.len(), self.eligible)
    }

    #[must_use]
    pub fn avg_attempts(&self) -> Option<f64> {
        if self.attempts_by_user.is_empty() {
            return None;
        }
        let total: i64 = self.attempts_by_user.values().sum();
        Some(round2(
            f64::from(i32::try_from(total).unwrap_or(i32::MAX)) / count(self.attempts_by_user.len()),
        ))
    }

    #[must_use]
    pub fn difficulty_score(&self) -> Option<f64> {
        self.pass_rate.map(|p| round2(100.0 - p))
    }

    #[must_use]
    pub fn latency_p50(&self) -> Option<f64> {
        percentile(&self.latencies, 0.5)
    }

    #[must_use]
    pub fn latency_p90(&self) -> Option<f64> {
        percentile(&self.latencies, 0.9)
    }

    #[must_use]
    pub fn summary(&self) -> TeacherAssessmentDetailSummary {
        TeacherAssessmentDetailSummary {
            eligible_learners: count_i64(self.eligible),
            submitted_learners: count_i64(self.submitted_users.len()),
            submission_rate: self.submission_rate(),
            pass_rate: self.pass_rate,
            median_score: median_or_none(&self.scores),
            avg_attempts: self.avg_attempts(),
            grading_latency_hours_p50: self.latency_p50(),
            grading_latency_hours_p90: self.latency_p90(),
        }
    }
}

/// Legacy per-kind outlier reason codes (+ the manual-assessment latency rule
/// for every kind, since any kind can need hand grading in v2).
#[must_use]
pub fn outlier_reason_codes(kind: AssessmentKind, stats: &AssessmentStats, threshold: f64) -> Vec<&'static str> {
    let mut codes = Vec::new();
    let submission_rate = stats.submission_rate();
    match kind {
        AssessmentKind::Exam => {
            if submission_rate.is_some_and(|r| r < 60.0) {
                codes.push("low_completion_rate");
            }
            if stats.pass_rate.is_some_and(|p| p < threshold) {
                codes.push("below_threshold");
            }
        }
        AssessmentKind::Quiz => {
            if submission_rate.is_some_and(|r| r < 60.0) {
                codes.push("low_completion_rate");
            }
            if stats.pass_rate.is_some_and(|p| p < 60.0) {
                codes.push("low_accuracy");
            }
        }
        AssessmentKind::CodeChallenge => {
            if submission_rate.is_some_and(|r| r < 60.0) {
                codes.push("low_submission_rate");
            }
            if stats.pass_rate.is_some_and(|p| p < 60.0) {
                codes.push("low_success_rate");
            }
        }
    }
    if stats.latency_p90().is_some_and(|p90| p90 > GRADING_SLA_HOURS) {
        codes.push("grading_latency");
    }
    codes
}

/// Submissions of one assessment visible under the cohort / bucket filters.
fn visible_submissions<'a>(
    ctx: &'a AnalyticsContext,
    assessment_id: AssessmentId,
    allowed: Option<&HashSet<UserId>>,
    bucket_window: Option<(i64, i64)>,
) -> Vec<&'a SubmissionInfoRow> {
    ctx.submissions
        .iter()
        .filter(|s| s.assessment_id == assessment_id)
        .filter(|s| user_allowed(s.user_id, allowed))
        .filter(|s| in_bucket_window(submitted_at(s), bucket_window))
        .collect()
}

fn eligible_by_course(
    ctx: &AnalyticsContext,
    allowed: Option<&HashSet<UserId>>,
) -> HashMap<ab_core::id::CourseId, HashSet<UserId>> {
    let mut eligible: HashMap<_, HashSet<UserId>> = HashMap::new();
    for (course_id, user_id) in progress_snapshots(ctx, allowed).keys() {
        eligible.entry(*course_id).or_default().insert(*user_id);
    }
    eligible
}

/// Statistics of one assessment under the filters (used by the rollup).
#[must_use]
pub fn assessment_stats(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
    assessment: &AssessmentInfoRow,
) -> AssessmentStats {
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let eligible = eligible_by_course(ctx, allowed.as_ref());
    let submissions =
        visible_submissions(ctx, assessment.id, allowed.as_ref(), filters.selected_bucket_window());
    AssessmentStats::compute(
        assessment,
        &submissions,
        eligible.get(&assessment.course_id).map_or(0, HashSet::len),
    )
}

/// Legacy `build_assessment_rows`.
#[must_use]
pub fn build_assessment_rows(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
) -> Vec<AssessmentOutlierRow> {
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let eligible = eligible_by_course(ctx, allowed.as_ref());
    let bucket_window = filters.selected_bucket_window();
    let mut rows: Vec<AssessmentOutlierRow> = ctx
        .assessments
        .iter()
        .filter(|a| is_reportable(a))
        .map(|a| {
            let submissions = visible_submissions(ctx, a.id, allowed.as_ref(), bucket_window);
            let stats = AssessmentStats::compute(
                a,
                &submissions,
                eligible.get(&a.course_id).map_or(0, HashSet::len),
            );
            let variance = score_variance(&stats.scores);
            let discrimination = discrimination_index(&stats.scores_by_user);
            AssessmentOutlierRow {
                assessment_type: a.kind,
                assessment_id: a.id,
                activity_id: Some(a.activity_id),
                course_id: a.course_id,
                course_name: ctx.course_name(a.course_id),
                title: a.title.clone(),
                submission_rate: stats.submission_rate(),
                completion_rate: stats.submission_rate(),
                pass_rate: stats.pass_rate,
                median_score: median_or_none(&stats.scores),
                avg_attempts: stats.avg_attempts(),
                grading_latency_hours_p50: stats.latency_p50(),
                grading_latency_hours_p90: stats.latency_p90(),
                difficulty_score: stats.difficulty_score(),
                score_variance: variance,
                reliability_score: reliability_score(&stats.scores),
                discrimination_index: discrimination,
                suspicious_flag: suspicious_flag(stats.pass_rate, variance, discrimination),
                outlier_reason_codes: outlier_reason_codes(a.kind, &stats, a.passing_score),
            }
        })
        .collect();
    sort_assessment_rows(&mut rows, filters.sort_by.as_deref(), filters.sort_order);
    rows
}

fn opt_key(v: Option<f64>) -> f64 {
    v.unwrap_or(-1.0)
}

pub fn sort_assessment_rows(rows: &mut [AssessmentOutlierRow], sort_by: Option<&str>, order: SortOrder) {
    let cmp = |a: &AssessmentOutlierRow, b: &AssessmentOutlierRow| match sort_by {
        Some("title") => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
        Some("submission") => opt_key(a.submission_rate).total_cmp(&opt_key(b.submission_rate)),
        Some("pass") => opt_key(a.pass_rate).total_cmp(&opt_key(b.pass_rate)),
        Some("difficulty") => opt_key(a.difficulty_score).total_cmp(&opt_key(b.difficulty_score)),
        Some("latency") => opt_key(a.grading_latency_hours_p90)
            .total_cmp(&opt_key(b.grading_latency_hours_p90)),
        Some("signals") => a.outlier_reason_codes.len().cmp(&b.outlier_reason_codes.len()),
        _ => a
            .outlier_reason_codes
            .len()
            .cmp(&b.outlier_reason_codes.len())
            .then_with(|| {
                a.difficulty_score
                    .unwrap_or(0.0)
                    .total_cmp(&b.difficulty_score.unwrap_or(0.0))
            })
            .then_with(|| {
                b.submission_rate
                    .unwrap_or(0.0)
                    .total_cmp(&a.submission_rate.unwrap_or(0.0))
            }),
    };
    // Stable sort keeps the deterministic id order for ties.
    rows.sort_by(|a, b| match order {
        SortOrder::Asc => cmp(a, b),
        SortOrder::Desc => cmp(b, a),
    });
}

// ── Detail ──────────────────────────────────────────────────────────────────

fn status_str(status: SubmissionStatus) -> String {
    status.as_str().to_owned()
}

/// Legacy `_build_submission_diagnostics` (drafts are not loaded into the
/// context, so `draft_attempts` is always 0 here).
#[must_use]
pub fn build_diagnostics(
    submissions: &[&SubmissionInfoRow],
    manual_grading_required: bool,
    now: i64,
    note: Option<&'static str>,
) -> AssessmentDiagnosticsSnapshot {
    let count_status = |st: SubmissionStatus| count_i64(submissions.iter().filter(|s| s.status == st).count());
    AssessmentDiagnosticsSnapshot {
        manual_grading_required,
        total_attempt_records: count_i64(submissions.len()),
        draft_attempts: 0,
        awaiting_grading: count_status(SubmissionStatus::Pending),
        graded_not_released: count_status(SubmissionStatus::Graded),
        returned_for_resubmission: count_status(SubmissionStatus::Returned),
        released: count_status(SubmissionStatus::Published),
        late_submissions: count_i64(submissions.iter().filter(|s| s.is_late).count()),
        stale_backlog: count_i64(
            submissions
                .iter()
                .filter(|s| {
                    is_reviewable(s)
                        && hours_between(Some(submitted_at(s)), Some(now)).unwrap_or(0.0)
                            > GRADING_SLA_HOURS
                })
                .count(),
        ),
        suspicious_attempts: count_i64(submissions.iter().filter(|s| s.violation_count > 0).count()),
        missing_scores: count_i64(submissions.iter().filter(|s| score_of(s).is_none()).count()),
        note,
    }
}

/// Legacy `_build_slo_snapshot`.
#[must_use]
pub fn build_slo(diagnostics: &AssessmentDiagnosticsSnapshot, latencies: &[f64]) -> AssessmentSloSnapshot {
    if !diagnostics.manual_grading_required && diagnostics.awaiting_grading == 0 {
        return AssessmentSloSnapshot {
            status: SloStatus::NotApplicable,
            target_hours: None,
            observed_p50_hours: None,
            observed_p90_hours: None,
            backlog_count: 0,
            overdue_backlog_count: 0,
            note: "no_teacher_grading_dependency",
        };
    }
    let p50 = percentile(latencies, 0.5);
    let p90 = percentile(latencies, 0.9);
    let overdue = diagnostics.stale_backlog;
    let status = if overdue > 0 || p90.is_some_and(|p| p > GRADING_SLA_HOURS) {
        SloStatus::Breached
    } else if diagnostics.awaiting_grading > 0 || p50.is_some_and(|p| p > 48.0) {
        SloStatus::Warning
    } else {
        SloStatus::Healthy
    };
    AssessmentSloSnapshot {
        status,
        target_hours: Some(GRADING_SLA_HOURS),
        observed_p50_hours: p50,
        observed_p90_hours: p90,
        backlog_count: diagnostics.awaiting_grading,
        overdue_backlog_count: overdue,
        note: match status {
            SloStatus::Breached => "grading_queue_past_72h_target",
            SloStatus::Warning => "grading_queue_approaching_72h_target",
            SloStatus::Healthy | SloStatus::NotApplicable => "grading_queue_within_target",
        },
    }
}

/// Legacy `_build_workflow_item_rows`.
#[must_use]
pub fn build_workflow_items(d: &AssessmentDiagnosticsSnapshot) -> Vec<AssessmentItemAnalyticsRow> {
    let total = d.total_attempt_records;
    let definitions: [(&str, &str, i64, ItemSignal, &str); 5] = [
        (
            "awaiting_grading",
            "awaiting_teacher_grading",
            d.awaiting_grading,
            if d.stale_backlog > 0 { ItemSignal::Critical } else { ItemSignal::Watch },
            "manual_review_pending",
        ),
        (
            "returned_for_resubmission",
            "returned_for_resubmission",
            d.returned_for_resubmission,
            ItemSignal::Watch,
            "resubmission_pending_after_feedback",
        ),
        (
            "late_submissions",
            "late_submissions",
            d.late_submissions,
            ItemSignal::Watch,
            "late_work_may_need_deadline_or_policy_review",
        ),
        (
            "suspicious_attempts",
            "suspicious_attempts",
            d.suspicious_attempts,
            ItemSignal::Critical,
            "integrity_signals_recorded",
        ),
        (
            "missing_scores",
            "missing_scores",
            d.missing_scores,
            ItemSignal::Critical,
            "submission_without_score",
        ),
    ];
    definitions
        .into_iter()
        .filter(|(_, _, impacted, _, _)| *impacted > 0)
        .map(|(key, label, impacted, signal, note)| AssessmentItemAnalyticsRow {
            item_key: key.to_owned(),
            item_label: label.to_owned(),
            item_type: "workflow",
            population_count: total,
            impacted_count: impacted,
            impact_rate: safe_pct(
                f64::from(i32::try_from(impacted).unwrap_or(i32::MAX)),
                f64::from(i32::try_from(total).unwrap_or(i32::MAX)),
            ),
            signal,
            note: note.to_owned(),
        })
        .collect()
}

/// Per-item accuracy from the stored grading breakdowns (the legacy
/// `quiz_question_stats` source was never populated).
#[derive(Debug, Default, Clone)]
struct ItemTally {
    label: String,
    attempts: i64,
    correct: i64,
    strong: i64,
    strong_miss: i64,
    weak: i64,
    weak_correct: i64,
}

fn item_correct(item: &crate::grading::breakdown::GradedItem) -> Option<bool> {
    item.correct
        .or_else(|| (item.max_score > 0.0).then(|| item.score >= item.max_score))
}

fn question_tallies(submissions: &[&SubmissionInfoRow]) -> BTreeMap<String, ItemTally> {
    let mut scored: Vec<(f64, &SubmissionInfoRow)> = submissions
        .iter()
        .filter_map(|s| score_of(s).map(|score| (score, *s)))
        .collect();
    scored.sort_by(|a, b| a.0.total_cmp(&b.0).then_with(|| a.1.id.cmp(&b.1.id)));
    let (weak, strong): (HashSet<_>, HashSet<_>) = if scored.len() >= 4 {
        let group = group_size(scored.len());
        (
            scored[..group].iter().map(|(_, s)| s.id).collect(),
            scored[scored.len() - group..].iter().map(|(_, s)| s.id).collect(),
        )
    } else {
        (HashSet::new(), HashSet::new())
    };
    let mut tallies: BTreeMap<String, ItemTally> = BTreeMap::new();
    for s in submissions {
        let breakdown = crate::grading::breakdown::GradingBreakdown::from_value(&s.grading);
        for item in &breakdown.items {
            let Some(correct) = item_correct(item) else {
                continue;
            };
            let tally = tallies.entry(item.item_id.to_string()).or_default();
            if tally.label.is_empty() && !item.item_text.trim().is_empty() {
                tally.label = item.item_text.trim().to_owned();
            }
            tally.attempts += 1;
            if correct {
                tally.correct += 1;
            }
            if strong.contains(&s.id) {
                tally.strong += 1;
                if !correct {
                    tally.strong_miss += 1;
                }
            }
            if weak.contains(&s.id) {
                tally.weak += 1;
                if correct {
                    tally.weak_correct += 1;
                }
            }
        }
    }
    tallies
}

fn as_f64(n: i64) -> f64 {
    f64::from(i32::try_from(n).unwrap_or(i32::MAX))
}

#[must_use]
pub fn build_question_breakdown(submissions: &[&SubmissionInfoRow]) -> Vec<QuestionDifficultyRow> {
    let mut rows: Vec<QuestionDifficultyRow> = question_tallies(submissions)
        .into_iter()
        .map(|(id, t)| {
            let strong_acc = safe_pct(as_f64(t.strong - t.strong_miss), as_f64(t.strong));
            let weak_acc = safe_pct(as_f64(t.weak_correct), as_f64(t.weak));
            let strong_miss_pct = safe_pct(as_f64(t.strong_miss), as_f64(t.strong));
            QuestionDifficultyRow {
                question_label: if t.label.is_empty() { format!("Question {id}") } else { t.label },
                question_id: id,
                accuracy_pct: safe_pct(as_f64(t.correct), as_f64(t.attempts)),
                avg_time_seconds: None,
                discrimination_index: match (strong_acc, weak_acc) {
                    (Some(s), Some(w)) => Some(round2((s - w) / 100.0)),
                    _ => None,
                },
                strong_miss_pct: (strong_acc.is_some() && weak_acc.is_some())
                    .then(|| strong_miss_pct.unwrap_or(0.0)),
                weak_correct_pct: (strong_acc.is_some()).then_some(weak_acc).flatten(),
                distractor_issue_count: i64::from(
                    t.strong > 0 && strong_miss_pct.unwrap_or(0.0) > 35.0,
                ),
            }
        })
        .collect();
    rows.sort_by(|a, b| {
        a.accuracy_pct
            .unwrap_or(100.0)
            .total_cmp(&b.accuracy_pct.unwrap_or(100.0))
    });
    rows
}

/// Legacy `_build_cohort_analytics`.
#[must_use]
pub fn build_cohort_analytics(
    ctx: &AnalyticsContext,
    eligible_users: &HashSet<UserId>,
    learner_rows: &[AssessmentLearnerRow],
    threshold: f64,
    cohort_filter: Option<&[UsergroupId]>,
    released: &[SubmissionStatus],
) -> Vec<AssessmentCohortRow> {
    if ctx.usergroup_names.is_empty() {
        return Vec::new();
    }
    #[derive(Default)]
    struct Acc {
        eligible: i64,
        submitted: i64,
        released: i64,
        awaiting: i64,
        returned: i64,
        passers: i64,
        scored: i64,
        attempt_total: i64,
        attempt_learners: i64,
        scores: Vec<f64>,
    }
    let by_user: HashMap<UserId, &AssessmentLearnerRow> =
        learner_rows.iter().map(|r| (r.user_id, r)).collect();
    let mut acc: BTreeMap<UsergroupId, Acc> = BTreeMap::new();
    for user_id in eligible_users {
        let Some(groups) = ctx.cohorts_by_user.get(user_id) else {
            continue;
        };
        let groups: Vec<UsergroupId> = groups
            .iter()
            .copied()
            .filter(|g| cohort_filter.is_none_or(|f| f.contains(g)))
            .collect();
        if groups.is_empty() {
            continue;
        }
        let row = by_user.get(user_id).copied();
        let status = row.and_then(|r| r.status.as_deref());
        let submitted = row.is_some_and(|r| r.submitted_at_unix.is_some() || status.is_some());
        let is_released = status.is_some_and(|s| released.iter().any(|r| r.as_str() == s));
        let is_returned = status == Some("returned");
        let is_awaiting = status == Some("pending");
        let best = row.and_then(|r| r.best_score);
        let passed = best.is_some_and(|b| b >= threshold);
        for g in groups {
            let a = acc.entry(g).or_default();
            a.eligible += 1;
            if submitted {
                a.submitted += 1;
            }
            if is_released {
                a.released += 1;
            }
            if is_awaiting {
                a.awaiting += 1;
            }
            if is_returned {
                a.returned += 1;
            }
            if let Some(r) = row {
                a.attempt_total += r.attempts;
                a.attempt_learners += 1;
            }
            if let Some(b) = best {
                a.scores.push(b);
                a.scored += 1;
            }
            if passed {
                a.passers += 1;
            }
        }
    }
    let mut rows: Vec<AssessmentCohortRow> = acc
        .into_iter()
        .map(|(cohort_id, a)| AssessmentCohortRow {
            cohort_id,
            cohort_name: ctx
                .usergroup_names
                .get(&cohort_id)
                .cloned()
                .unwrap_or_else(|| format!("Cohort {cohort_id}")),
            eligible_learners: a.eligible,
            submitted_learners: a.submitted,
            submission_rate: safe_pct(as_f64(a.submitted), as_f64(a.eligible)),
            pass_rate: safe_pct(as_f64(a.passers), as_f64(a.scored)),
            awaiting_grading: a.awaiting,
            returned_for_resubmission: a.returned,
            released_learners: a.released,
            avg_attempts: (a.attempt_learners > 0)
                .then(|| round2(as_f64(a.attempt_total) / as_f64(a.attempt_learners))),
            median_score: median_or_none(&a.scores),
        })
        .collect();
    rows.sort_by(|a, b| {
        opt_key(b.submission_rate)
            .total_cmp(&opt_key(a.submission_rate))
            .then_with(|| b.cohort_name.to_lowercase().cmp(&a.cohort_name.to_lowercase()))
    });
    rows
}

/// Legacy `_build_support_diagnostics` (minus the migration block).
#[must_use]
pub fn build_support(
    ctx: &AnalyticsContext,
    eligible_users: &HashSet<UserId>,
    learner_rows: &[AssessmentLearnerRow],
    audit_count: usize,
    diagnostics: &AssessmentDiagnosticsSnapshot,
    slo: &AssessmentSloSnapshot,
    cohort_filter: Option<&[UsergroupId]>,
) -> AssessmentSupportDiagnostics {
    let mut scoped_cohorts: HashSet<UsergroupId> = HashSet::new();
    for user_id in eligible_users {
        if let Some(groups) = ctx.cohorts_by_user.get(user_id) {
            scoped_cohorts.extend(
                groups
                    .iter()
                    .copied()
                    .filter(|g| cohort_filter.is_none_or(|f| f.contains(g))),
            );
        }
    }
    let mut alerts = Vec::new();
    match slo.status {
        SloStatus::Breached => alerts.push(AssessmentSupportAlertRow {
            code: "grading_slo_breached",
            severity: Severity::Critical,
            summary: "grading_latency_past_service_target",
        }),
        SloStatus::Warning => alerts.push(AssessmentSupportAlertRow {
            code: "grading_slo_warning",
            severity: Severity::Warning,
            summary: "grading_latency_approaching_service_target",
        }),
        SloStatus::Healthy | SloStatus::NotApplicable => {}
    }
    if diagnostics.suspicious_attempts > 0 {
        alerts.push(AssessmentSupportAlertRow {
            code: "suspicious_attempts",
            severity: Severity::Warning,
            summary: "integrity_signals_in_scope",
        });
    }
    if diagnostics.missing_scores > 0 {
        alerts.push(AssessmentSupportAlertRow {
            code: "missing_scores",
            severity: Severity::Critical,
            summary: "attempts_without_score_in_scope",
        });
    }
    AssessmentSupportDiagnostics {
        scoped_eligible_learners: count_i64(eligible_users.len()),
        scoped_visible_learners: count_i64(learner_rows.len()),
        scoped_cohort_count: count_i64(scoped_cohorts.len()),
        cohort_filter_applied: cohort_filter.is_some_and(|f| !f.is_empty()),
        audit_event_count: count_i64(audit_count),
        note: if alerts.is_empty() {
            "support_diagnostics_within_operational_range"
        } else {
            "support_follow_up_recommended"
        },
        alerts,
    }
}

/// Audit rows from the grading ledger and bulk actions, newest first, top 20
/// (legacy `_load_audit_history`).
#[must_use]
pub fn build_audit_history(
    ctx: &AnalyticsContext,
    entries: &[ab_db::analytics::GradingEntryAuditRow],
    actions: &[ab_db::analytics::BulkActionAuditRow],
    allowed: Option<&HashSet<UserId>>,
) -> Vec<AssessmentAuditEventRow> {
    let mut events: Vec<(i64, AssessmentAuditEventRow)> = Vec::new();
    for e in entries.iter().filter(|e| user_allowed(e.user_id, allowed)) {
        let published = e.published_at.is_some();
        let occurred = e.published_at.unwrap_or(e.created_at);
        events.push((
            occurred,
            AssessmentAuditEventRow {
                id: format!("grading-entry-{}", e.id),
                source: "grading_entry",
                action: if published { "publish_grade" } else { "save_grade" }.to_owned(),
                actor_user_id: e.graded_by,
                actor_display_name: e.graded_by.map(|u| ctx.display_name(u)),
                occurred_at_unix: occurred,
                status: Some(if published { "published" } else { "draft_saved" }.to_owned()),
                summary: format!("{} {:.1}%", if published { "published" } else { "saved" }, e.final_score),
                affected_count: Some(1),
                submission_id: Some(e.submission_id),
                grading_entry_id: Some(e.id),
                bulk_action_id: None,
            },
        ));
    }
    for a in actions {
        let visible = allowed.is_none_or(|set| {
            a.target_user_ids.is_empty() || a.target_user_ids.iter().any(|u| set.contains(u))
        });
        if !visible {
            continue;
        }
        let occurred = a.completed_at.unwrap_or(a.created_at);
        events.push((
            occurred,
            AssessmentAuditEventRow {
                id: format!("bulk-action-{}", a.id),
                source: "bulk_action",
                action: a.action_type.clone(),
                actor_user_id: a.performed_by,
                actor_display_name: a.performed_by.map(|u| ctx.display_name(u)),
                occurred_at_unix: occurred,
                status: Some(a.status.clone()),
                summary: format!("{} for {} learners", a.action_type, a.affected_count),
                affected_count: Some(i64::from(a.affected_count)),
                submission_id: None,
                grading_entry_id: None,
                bulk_action_id: Some(a.id),
            },
        ));
    }
    events.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.id.cmp(&a.1.id)));
    events.into_iter().take(20).map(|(_, e)| e).collect()
}

/// Everything the detail endpoint needs beyond the context.
pub struct DetailInputs<'a> {
    pub assessment: &'a AssessmentInfoRow,
    pub entries: &'a [ab_db::analytics::GradingEntryAuditRow],
    pub actions: &'a [ab_db::analytics::BulkActionAuditRow],
}

/// Legacy `get_teacher_assessment_detail`, one code path for every kind.
#[must_use]
pub fn build_detail(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
    inputs: DetailInputs<'_>,
) -> TeacherAssessmentDetailResponse {
    let a = inputs.assessment;
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let eligible_map = eligible_by_course(ctx, allowed.as_ref());
    let empty = HashSet::new();
    let eligible_users = eligible_map.get(&a.course_id).unwrap_or(&empty);
    let records = visible_submissions(ctx, a.id, allowed.as_ref(), None);
    let stats = AssessmentStats::compute(a, &records, eligible_users.len());

    let mut by_user: BTreeMap<UserId, Vec<&SubmissionInfoRow>> = BTreeMap::new();
    for s in &records {
        by_user.entry(s.user_id).or_default().push(s);
    }
    let mut learner_rows: Vec<AssessmentLearnerRow> = by_user
        .iter()
        .map(|(user_id, attempts)| {
            let best = attempts.iter().filter_map(|s| score_of(s)).fold(None, |acc: Option<f64>, v| {
                Some(acc.map_or(v, |a| a.max(v)))
            });
            let last = attempts
                .iter()
                .max_by_key(|s| (submitted_at(s), s.id))
                .copied();
            AssessmentLearnerRow {
                user_id: *user_id,
                user_display_name: ctx.display_name(*user_id),
                attempts: count_i64(attempts.len()),
                best_score: best.map(round2),
                last_score: last.and_then(score_of).map(round2),
                submitted_at_unix: last.map(submitted_at),
                graded_at_unix: last.and_then(graded_at),
                status: last.map(|s| status_str(s.status)),
            }
        })
        .collect();
    learner_rows.sort_by(|x, y| x.user_display_name.cmp(&y.user_display_name));

    let question_breakdown = build_question_breakdown(&records);
    let mut common_failures: Vec<CommonFailureRow> = match a.kind {
        AssessmentKind::Quiz => question_breakdown
            .iter()
            .filter(|q| q.accuracy_pct.is_some_and(|acc| acc < 80.0))
            .take(5)
            .map(|q| CommonFailureRow {
                key: q.question_id.clone(),
                label: q.question_label.clone(),
                count: (100 - q.accuracy_pct.unwrap_or(0.0).trunc().clamp(0.0, 100.0) as i64).max(0),
            })
            .collect(),
        AssessmentKind::Exam | AssessmentKind::CodeChallenge => Vec::new(),
    };
    if a.kind != AssessmentKind::Quiz {
        let late = records.iter().filter(|s| s.is_late).count();
        let ungraded = records.iter().filter(|s| is_reviewable(s)).count();
        if late > 0 {
            common_failures.push(CommonFailureRow {
                key: "late".to_owned(),
                label: "late_submissions".to_owned(),
                count: count_i64(late),
            });
        }
        if ungraded > 0 {
            common_failures.push(CommonFailureRow {
                key: "ungraded".to_owned(),
                label: "awaiting_grading".to_owned(),
                count: count_i64(ungraded),
            });
        }
    }

    let manual_required = a.grading_mode != ab_core::assessments::GradingMode::Auto
        || records.iter().any(|s| {
            crate::grading::breakdown::GradingBreakdown::from_value(&s.grading).needs_manual_review
        });
    let diagnostics = build_diagnostics(
        &records,
        manual_required,
        ctx.generated_at,
        Some("canonical_submissions_and_grading_ledger"),
    );
    let audit_history = build_audit_history(ctx, inputs.entries, inputs.actions, allowed.as_ref());
    let slo = build_slo(&diagnostics, &stats.latencies);
    let cohort_filter = (!filters.cohort_ids.is_empty()).then_some(filters.cohort_ids.as_slice());
    let released: &[SubmissionStatus] = match a.kind {
        AssessmentKind::Quiz => &[SubmissionStatus::Graded, SubmissionStatus::Published],
        AssessmentKind::Exam | AssessmentKind::CodeChallenge => &[SubmissionStatus::Published],
    };
    let cohort_analytics = build_cohort_analytics(
        ctx,
        eligible_users,
        &learner_rows,
        a.passing_score,
        cohort_filter,
        released,
    );
    let mut item_analytics = build_workflow_items(&diagnostics);
    for q in &question_breakdown {
        let population = count_i64(
            records
                .iter()
                .filter(|s| {
                    crate::grading::breakdown::GradingBreakdown::from_value(&s.grading)
                        .items
                        .iter()
                        .any(|i| i.item_id.to_string() == q.question_id)
                })
                .count(),
        );
        let impacted = q.accuracy_pct.map_or(0, |acc| {
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let missed = (as_f64(population) * (100.0 - acc) / 100.0).round() as i64;
            missed.clamp(0, population)
        });
        let signal = match q.accuracy_pct {
            Some(acc) if acc < 50.0 => ItemSignal::Critical,
            Some(acc) if acc < 75.0 => ItemSignal::Watch,
            _ => ItemSignal::Healthy,
        };
        item_analytics.push(AssessmentItemAnalyticsRow {
            item_key: q.question_id.clone(),
            item_label: q.question_label.clone(),
            item_type: if a.kind == AssessmentKind::CodeChallenge { "test" } else { "question" },
            population_count: population,
            impacted_count: impacted,
            impact_rate: safe_pct(as_f64(impacted), as_f64(population)),
            signal,
            note: q
                .accuracy_pct
                .map_or_else(|| "accuracy_unavailable".to_owned(), |acc| format!("accuracy {acc:.1}%")),
        });
    }
    item_analytics.sort_by(|x, y| {
        opt_key(y.impact_rate)
            .total_cmp(&opt_key(x.impact_rate))
            .then_with(|| y.impacted_count.cmp(&x.impacted_count))
    });
    let support = build_support(
        ctx,
        eligible_users,
        &learner_rows,
        audit_history.len(),
        &diagnostics,
        &slo,
        cohort_filter,
    );

    TeacherAssessmentDetailResponse {
        generated_at_unix: ctx.generated_at,
        assessment_type: a.kind,
        assessment_id: a.id,
        activity_id: a.activity_id,
        course_id: a.course_id,
        title: a.title.clone(),
        pass_threshold: a.passing_score,
        pass_threshold_bucket_label: score_bucket(Some(a.passing_score)),
        summary: stats.summary(),
        score_distribution: score_distribution(&stats.scores),
        attempt_distribution: attempt_distribution(&stats.attempts_by_user),
        question_breakdown,
        common_failures,
        learner_rows,
        diagnostics,
        audit_history,
        slo,
        support,
        cohort_analytics,
        item_analytics,
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::float_cmp)]
mod tests {
    use super::*;

    #[test]
    fn buckets_and_distributions() {
        assert_eq!(score_bucket(None), "unknown");
        assert_eq!(score_bucket(Some(0.0)), "0-19");
        assert_eq!(score_bucket(Some(59.9)), "40-59");
        assert_eq!(score_bucket(Some(60.0)), "60-79");
        assert_eq!(score_bucket(Some(100.0)), "80-100");
        let dist = score_distribution(&[10.0, 15.0, 85.0]);
        assert_eq!(dist.len(), 2);
        assert_eq!((dist[0].label, dist[0].count), ("0-19", 2));
        let attempts: HashMap<UserId, i64> =
            [(UserId::new(), 1), (UserId::new(), 7), (UserId::new(), 1)].into_iter().collect();
        let a = attempt_distribution(&attempts);
        assert_eq!((a[0].label, a[0].count), ("1", 2));
        assert_eq!((a[1].label, a[1].count), ("5+", 1));
    }

    #[test]
    fn variance_reliability_discrimination() {
        assert_eq!(score_variance(&[50.0]), None);
        assert_eq!(score_variance(&[40.0, 60.0]), Some(100.0));
        // |100 - 350| / 350 = 71.4% away → 28.6
        assert_eq!(reliability_score(&[40.0, 60.0]), Some(28.6));
        let scores: HashMap<UserId, f64> = (0..10)
            .map(|i| (UserId::new(), f64::from(i) * 10.0))
            .collect();
        // 27% of 10 → 3: strong mean 80, weak mean 10 → 0.7
        assert_eq!(discrimination_index(&scores), Some(0.7));
        assert_eq!(suspicious_flag(Some(96.0), None, None), Some("too_easy"));
        assert_eq!(suspicious_flag(Some(50.0), Some(10.0), Some(0.5)), Some("low_variance"));
        assert_eq!(suspicious_flag(Some(50.0), Some(300.0), Some(0.5)), None);
        assert_eq!(group_size(4), 1);
        assert_eq!(group_size(10), 3);
    }

    #[test]
    fn slo_states() {
        let mut d = AssessmentDiagnosticsSnapshot {
            manual_grading_required: true,
            awaiting_grading: 0,
            ..AssessmentDiagnosticsSnapshot::default()
        };
        assert_eq!(build_slo(&d, &[10.0]).status, SloStatus::Healthy);
        d.awaiting_grading = 2;
        assert_eq!(build_slo(&d, &[10.0]).status, SloStatus::Warning);
        d.stale_backlog = 1;
        assert_eq!(build_slo(&d, &[10.0]).status, SloStatus::Breached);
        d.manual_grading_required = false;
        d.awaiting_grading = 0;
        assert_eq!(build_slo(&d, &[]).status, SloStatus::NotApplicable);
    }
}
