//! Learner risk scoring (legacy `services/analytics/risk.py`, verbatim
//! factors, weights and thresholds).
//!
//! Score = inactivity (2/day, cap 40) + progress gap (0.3 × (100 − pct)) +
//! failures (8 each, cap 24) + missing required work (6 each, cap 24) +
//! open grading blocks (4 each, cap 12). ≥ 70 high, ≥ 40 medium. Rows
//! without a single reason code are not at risk and are dropped.

use std::collections::{BTreeMap, HashMap, HashSet};

use ab_core::Result;
use ab_core::assessments::AssessmentKind;
use ab_core::id::{AssessmentId, CourseId, UserId};
use sqlx::PgPool;

use super::context::{
    AnalyticsContext, SnapshotKey, build_activity_events, days_between, is_graded, is_reviewable,
    progress_snapshots, round1, score_of, utc_date,
};
use super::filters::AnalyticsFilters;
use super::scope::TeacherScope;
use super::types::{AtRiskLearnerRow, Confidence, RiskLevel, RiskTrend};

pub const HIGH_RISK_SCORE: f64 = 70.0;
pub const MEDIUM_RISK_SCORE: f64 = 40.0;

/// The five weighted factors, in legacy order.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RiskComponents {
    pub inactivity: f64,
    pub progress: f64,
    pub failures: f64,
    pub missing: f64,
    pub grading: f64,
}

impl RiskComponents {
    /// Legacy arithmetic, rounded to one decimal.
    #[must_use]
    pub fn compute(
        days_since_last_activity: Option<i64>,
        progress_pct: f64,
        failed_assessments: i64,
        missing_required: i64,
        open_grading_blocks: i64,
    ) -> Self {
        let as_f64 = |n: i64| f64::from(i32::try_from(n).unwrap_or(i32::MAX));
        Self {
            inactivity: (as_f64(days_since_last_activity.unwrap_or(0)) * 2.0).min(40.0),
            progress: round1((100.0 - progress_pct) * 0.3).max(0.0),
            failures: (as_f64(failed_assessments) * 8.0).min(24.0),
            missing: (as_f64(missing_required) * 6.0).min(24.0),
            grading: (as_f64(open_grading_blocks) * 4.0).min(12.0),
        }
    }

    #[must_use]
    pub fn score(&self) -> f64 {
        round1(self.inactivity + self.progress + self.failures + self.missing + self.grading)
    }

    #[must_use]
    pub fn as_map(&self) -> BTreeMap<&'static str, f64> {
        BTreeMap::from([
            ("inactivity", self.inactivity),
            ("progress", self.progress),
            ("failures", self.failures),
            ("missing", self.missing),
            ("grading", self.grading),
        ])
    }

    /// The largest positive component, if any.
    #[must_use]
    pub fn top_factor(&self) -> Option<&'static str> {
        [
            ("inactivity", self.inactivity),
            ("progress", self.progress),
            ("failures", self.failures),
            ("missing", self.missing),
            ("grading", self.grading),
        ]
        .into_iter()
        .filter(|(_, v)| *v > 0.0)
        .max_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(k, _)| k)
    }
}

#[must_use]
pub fn risk_level(score: f64) -> RiskLevel {
    if score >= HIGH_RISK_SCORE {
        RiskLevel::High
    } else if score >= MEDIUM_RISK_SCORE {
        RiskLevel::Medium
    } else {
        RiskLevel::Low
    }
}

#[must_use]
pub fn reason_codes(
    days_since_last_activity: Option<i64>,
    progress_pct: f64,
    failed: i64,
    missing: i64,
    grading_blocks: i64,
) -> Vec<&'static str> {
    let mut codes = Vec::new();
    if days_since_last_activity.unwrap_or(0) >= 7 {
        codes.push("inactive_7d");
    }
    if progress_pct < 50.0 {
        codes.push("low_progress");
    }
    if failed > 0 {
        codes.push("repeated_failures");
    }
    if missing > 0 {
        codes.push("missing_required_assessments");
    }
    if grading_blocks > 0 {
        codes.push("grading_block");
    }
    codes
}

/// Legacy recommendation ladder, as a stable code.
#[must_use]
pub fn recommended_action(codes: &[&str]) -> &'static str {
    if codes.contains(&"grading_block") {
        "review_submissions_first"
    } else if codes.contains(&"inactive_7d") {
        "contact_learner_this_week"
    } else if codes.contains(&"repeated_failures") {
        "offer_targeted_help"
    } else if codes.contains(&"missing_required_assessments") {
        "remind_missing_work"
    } else if codes.contains(&"low_progress") {
        "schedule_pace_meeting"
    } else {
        "send_personal_message"
    }
}

#[must_use]
pub fn why_now(codes: &[&str], top_factor: Option<&str>) -> &'static str {
    if codes.contains(&"grading_block") {
        "grading_block_blocks_progress"
    } else if codes.contains(&"inactive_7d") {
        "inactivity_past_7_days"
    } else if codes.contains(&"repeated_failures") {
        "recent_assessment_failures"
    } else if codes.contains(&"missing_required_assessments") {
        "missing_required_work"
    } else if top_factor == Some("progress") {
        "progress_behind_course_baseline"
    } else {
        "multiple_risk_signals"
    }
}

#[must_use]
pub fn confidence(score: f64, codes: &[&str], days_since_last_activity: Option<i64>) -> Confidence {
    if score >= HIGH_RISK_SCORE && codes.len() >= 2 {
        Confidence::High
    } else if days_since_last_activity.is_none() && codes.len() <= 1 {
        Confidence::Low
    } else {
        Confidence::Medium
    }
}

/// Legacy `_risk_trend`.
#[must_use]
pub fn risk_trend(
    current_level: RiskLevel,
    current_score: f64,
    previous: Option<(RiskLevel, f64)>,
) -> (RiskTrend, Option<f64>, Option<f64>) {
    let Some((previous_level, previous_score)) = previous else {
        let trend = if current_level.is_at_risk() {
            RiskTrend::NewlyAtRisk
        } else {
            RiskTrend::Stable
        };
        return (trend, None, None);
    };
    let delta = round1(current_score - previous_score);
    let trend = if current_level == RiskLevel::Low && previous_level.is_at_risk() {
        RiskTrend::Recovered
    } else if current_level > previous_level || delta >= 10.0 {
        RiskTrend::Worsening
    } else if current_level < previous_level || delta <= -10.0 {
        RiskTrend::Improving
    } else {
        RiskTrend::Stable
    };
    (trend, Some(previous_score), Some(delta))
}

/// Legacy `build_risk_rows`: every at-risk (course, learner) pair in the
/// context, sorted by score desc, course name, learner name.
#[must_use]
#[allow(
    clippy::too_many_lines,
    reason = "one legacy code path kept whole for line-by-line comparison"
)]
pub fn build_risk_rows(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
) -> Vec<AtRiskLearnerRow> {
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let snapshots = progress_snapshots(ctx, allowed.as_ref());
    let events = build_activity_events(ctx, allowed.as_ref());
    let mut last_activity: HashMap<SnapshotKey, i64> = HashMap::new();
    for e in &events {
        let entry = last_activity
            .entry((e.course_id, e.user_id))
            .or_insert(e.ts);
        *entry = (*entry).max(e.ts);
    }

    let mut failed: HashMap<SnapshotKey, i64> = HashMap::new();
    let mut grading_blocks: HashMap<SnapshotKey, i64> = HashMap::new();
    let mut exam_seen: HashMap<SnapshotKey, HashSet<AssessmentId>> = HashMap::new();
    let mut code_passed: HashMap<SnapshotKey, HashSet<AssessmentId>> = HashMap::new();
    for s in &ctx.submissions {
        if allowed
            .as_ref()
            .is_some_and(|set| !set.contains(&s.user_id))
        {
            continue;
        }
        let Some(assessment) = ctx.assessment(s.assessment_id) else {
            continue;
        };
        let key = (s.course_id, s.user_id);
        if is_reviewable(s) {
            *grading_blocks.entry(key).or_default() += 1;
        }
        let score = score_of(s);
        match assessment.kind {
            AssessmentKind::Exam => {
                exam_seen.entry(key).or_default().insert(assessment.id);
                if score.is_some_and(|v| v < assessment.passing_score) {
                    *failed.entry(key).or_default() += 1;
                }
            }
            AssessmentKind::CodeChallenge => {
                if score.is_some_and(|v| v >= assessment.passing_score) {
                    code_passed.entry(key).or_default().insert(assessment.id);
                } else if is_graded(s) {
                    *failed.entry(key).or_default() += 1;
                }
            }
            // Legacy never counted quiz outcomes towards risk.
            AssessmentKind::Quiz => {}
        }
    }

    let now = ctx.generated_at;
    let mut rows = Vec::new();
    for (key, snapshot) in &snapshots {
        let (course_id, user_id) = *key;
        let Some(course) = ctx.courses.get(&course_id) else {
            continue;
        };
        let days_since = last_activity
            .get(key)
            .map(|ts| days_between(*ts, now).max(0));

        let exams: HashSet<AssessmentId> = ctx
            .published_assessments(course_id, AssessmentKind::Exam)
            .map(|a| a.id)
            .collect();
        let codes: HashSet<AssessmentId> = ctx
            .published_assessments(course_id, AssessmentKind::CodeChallenge)
            .map(|a| a.id)
            .collect();
        let empty = HashSet::new();
        let missing_exams = exams
            .difference(exam_seen.get(key).unwrap_or(&empty))
            .count();
        let missing_codes = codes
            .difference(code_passed.get(key).unwrap_or(&empty))
            .count();
        let missing = i64::try_from(missing_exams + missing_codes).unwrap_or(i64::MAX);
        let failed_count = failed.get(key).copied().unwrap_or(0);
        let blocks = grading_blocks.get(key).copied().unwrap_or(0);

        let components = RiskComponents::compute(
            days_since,
            snapshot.progress_pct,
            failed_count,
            missing,
            blocks,
        );
        let score = components.score();
        let codes = reason_codes(
            days_since,
            snapshot.progress_pct,
            failed_count,
            missing,
            blocks,
        );
        if codes.is_empty() {
            continue;
        }
        let top = components.top_factor();
        rows.push(AtRiskLearnerRow {
            user_id,
            course_id,
            course_name: course.name.clone(),
            user_display_name: ctx.display_name(user_id),
            cohort_name: {
                let names = ctx.cohort_names_for_user(
                    user_id,
                    (!filters.cohort_ids.is_empty()).then_some(filters.cohort_ids.as_slice()),
                );
                (!names.is_empty()).then(|| names.join(", "))
            },
            progress_pct: round1(snapshot.progress_pct),
            days_since_last_activity: days_since,
            open_grading_blocks: blocks,
            failed_assessments: failed_count,
            missing_required_assessments: missing,
            risk_score: score,
            risk_level: risk_level(score),
            risk_components: components.as_map(),
            recommended_action: recommended_action(&codes),
            why_now: why_now(&codes, top),
            confidence_level: confidence(score, &codes, days_since),
            top_contributing_factor: top,
            reason_codes: codes,
            risk_trend: RiskTrend::Stable,
            previous_risk_score: None,
            risk_score_delta: None,
            intervention_count: 0,
            last_intervention_type: None,
            last_intervention_at_unix: None,
            last_intervention_outcome: None,
        });
    }
    rows.sort_by(|a, b| {
        b.risk_score
            .total_cmp(&a.risk_score)
            .then_with(|| a.course_name.cmp(&b.course_name))
            .then_with(|| a.user_display_name.cmp(&b.user_display_name))
    });
    rows
}

/// Legacy `enrich_risk_rows`: trend against the newest earlier snapshot and
/// the teacher's intervention history for each pair.
pub async fn enrich_risk_rows(
    pool: &PgPool,
    scope: &TeacherScope,
    mut rows: Vec<AtRiskLearnerRow>,
    generated_at: i64,
) -> Result<Vec<AtRiskLearnerRow>> {
    if rows.is_empty() {
        return Ok(rows);
    }
    let mut course_ids: Vec<CourseId> = rows.iter().map(|r| r.course_id).collect();
    course_ids.sort_unstable();
    course_ids.dedup();
    let before = utc_date(generated_at);
    let previous: HashMap<(CourseId, UserId), (RiskLevel, f64)> =
        ab_db::analytics::previous_risk_snapshots(pool, &course_ids, &before)
            .await?
            .into_iter()
            .filter_map(|s| {
                RiskLevel::parse(&s.risk_level)
                    .map(|level| ((s.course_id, s.user_id), (level, s.risk_score)))
            })
            .collect();
    let interventions = ab_db::analytics::list_interventions(
        pool,
        scope.teacher_user_id,
        &scope.course_ids,
        None,
        None,
        i64::MAX,
    )
    .await?;
    let mut by_pair: HashMap<(CourseId, UserId), Vec<&ab_db::analytics::InterventionRow>> =
        HashMap::new();
    for i in &interventions {
        by_pair.entry((i.course_id, i.user_id)).or_default().push(i);
    }
    for row in &mut rows {
        let key = (row.course_id, row.user_id);
        let (trend, previous_score, delta) =
            risk_trend(row.risk_level, row.risk_score, previous.get(&key).copied());
        row.risk_trend = trend;
        row.previous_risk_score = previous_score;
        row.risk_score_delta = delta;
        if let Some(list) = by_pair.get(&key) {
            row.intervention_count = i64::try_from(list.len()).unwrap_or(i64::MAX);
            if let Some(latest) = list.first() {
                row.last_intervention_type = Some(latest.intervention_type.clone());
                row.last_intervention_at_unix = Some(latest.created_at);
                row.last_intervention_outcome.clone_from(&latest.outcome);
            }
        }
    }
    Ok(rows)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::float_cmp)]
mod tests {
    use super::*;

    #[test]
    fn components_follow_legacy_weights_and_caps() {
        // 10 idle days → 20; 30% progress → 21; 2 failures → 16; 5 missing → 24 (cap); 4 blocks → 12 (cap).
        let c = RiskComponents::compute(Some(10), 30.0, 2, 5, 4);
        assert_eq!(c.inactivity, 20.0);
        assert_eq!(c.progress, 21.0);
        assert_eq!(c.failures, 16.0);
        assert_eq!(c.missing, 24.0);
        assert_eq!(c.grading, 12.0);
        assert_eq!(c.score(), 93.0);
        assert_eq!(risk_level(c.score()), RiskLevel::High);
        assert_eq!(c.top_factor(), Some("missing"));

        let idle = RiskComponents::compute(Some(40), 100.0, 0, 0, 0);
        assert_eq!(idle.inactivity, 40.0);
        assert_eq!(idle.score(), 40.0);
        assert_eq!(risk_level(idle.score()), RiskLevel::Medium);
        assert_eq!(
            RiskComponents::compute(None, 100.0, 0, 0, 0).top_factor(),
            None
        );
    }

    #[test]
    fn reasons_actions_and_confidence() {
        let codes = reason_codes(Some(7), 49.9, 1, 1, 1);
        assert_eq!(
            codes,
            [
                "inactive_7d",
                "low_progress",
                "repeated_failures",
                "missing_required_assessments",
                "grading_block"
            ]
        );
        assert_eq!(recommended_action(&codes), "review_submissions_first");
        assert_eq!(
            recommended_action(&["low_progress"]),
            "schedule_pace_meeting"
        );
        assert_eq!(
            why_now(&["low_progress"], Some("progress")),
            "progress_behind_course_baseline"
        );
        assert_eq!(
            why_now(&["low_progress"], Some("inactivity")),
            "multiple_risk_signals"
        );
        assert!(reason_codes(Some(6), 50.0, 0, 0, 0).is_empty());
        assert_eq!(confidence(75.0, &["a", "b"], Some(1)), Confidence::High);
        assert_eq!(confidence(20.0, &["a"], None), Confidence::Low);
        assert_eq!(confidence(20.0, &["a"], Some(3)), Confidence::Medium);
    }

    #[test]
    fn trend_transitions() {
        assert_eq!(
            risk_trend(RiskLevel::Medium, 45.0, None),
            (RiskTrend::NewlyAtRisk, None, None)
        );
        assert_eq!(
            risk_trend(RiskLevel::Low, 20.0, Some((RiskLevel::High, 80.0))),
            (RiskTrend::Recovered, Some(80.0), Some(-60.0))
        );
        assert_eq!(
            risk_trend(RiskLevel::Medium, 55.0, Some((RiskLevel::Medium, 45.0))).0,
            RiskTrend::Worsening
        );
        assert_eq!(
            risk_trend(RiskLevel::Medium, 45.0, Some((RiskLevel::High, 75.0))).0,
            RiskTrend::Improving
        );
        assert_eq!(
            risk_trend(RiskLevel::Medium, 46.0, Some((RiskLevel::Medium, 45.0))).0,
            RiskTrend::Stable
        );
    }
}
