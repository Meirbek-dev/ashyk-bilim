//! Penalty math and ordering, ported from `pipeline/penalize.py` and
//! `progress.py`:
//!
//! 1. an integrity violation zeroes everything;
//! 2. the attempt cap: max score for attempt n is `100 − pct × (n − 1)`;
//! 3. the late penalty on the capped score (percent per day up to a cap,
//!    or 100% past a cutoff), unless waived.
//!
//! Unlike the legacy, a late penalty is computed even when the work needs
//! manual review, so the teacher's grade can apply it (the legacy stored 0
//! and never penalised essays).

use crate::assessments::service::LatePolicy;
use crate::grading::breakdown::round2;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PenaltyOutcome {
    pub late_penalty_pct: f64,
    /// Score after cap and late penalty.
    pub final_score: f64,
    pub violation_zeroed: bool,
}

/// Cap on the maximum score for a later attempt.
#[must_use]
pub fn attempt_cap(score: f64, attempt_penalty_percent: f64, attempt_number: i32) -> f64 {
    if attempt_penalty_percent <= 0.0 || attempt_number <= 1 {
        return score;
    }
    let cap = attempt_penalty_percent
        .mul_add(-f64::from(attempt_number - 1), 100.0)
        .max(0.0);
    score.min(cap)
}

/// Percent deducted for lateness (0 when on time, no due date, or late
/// work disallowed — that case is refused before grading).
#[must_use]
pub fn late_penalty_pct(
    policy: LatePolicy,
    due_at: Option<i64>,
    submitted_at: i64,
    allow_late: bool,
) -> f64 {
    let Some(due) = due_at else { return 0.0 };
    if submitted_at <= due || !allow_late {
        return 0.0;
    }
    match policy {
        LatePolicy::None => 0.0,
        LatePolicy::Penalty {
            percent_per_day,
            max_days,
        } => {
            let seconds_late = (submitted_at - due).max(0);
            // Ceiling division: any part of a day counts as a day.
            let days_late = ((seconds_late + 86_399) / 86_400)
                .max(1)
                .min(i64::from(max_days));
            let days = i32::try_from(days_late).unwrap_or(max_days);
            (f64::from(days) * percent_per_day).min(100.0)
        }
        LatePolicy::Cutoff { cutoff_at } => {
            if submitted_at > cutoff_at {
                100.0
            } else {
                0.0
            }
        }
    }
}

pub struct PenaltyInput {
    pub auto_score: f64,
    pub needs_manual_review: bool,
    pub violation_exceeded: bool,
    pub attempt_number: i32,
    pub attempt_penalty_percent: f64,
    pub late_pct: f64,
    pub waive_late_penalty: bool,
}

#[must_use]
pub fn apply(input: &PenaltyInput) -> PenaltyOutcome {
    if input.violation_exceeded {
        return PenaltyOutcome {
            late_penalty_pct: 0.0,
            final_score: 0.0,
            violation_zeroed: true,
        };
    }
    let late = if input.waive_late_penalty {
        0.0
    } else {
        input.late_pct.clamp(0.0, 100.0)
    };
    if input.needs_manual_review {
        // No auto score yet; the teacher's grade applies `late` later.
        return PenaltyOutcome {
            late_penalty_pct: late,
            final_score: 0.0,
            violation_zeroed: false,
        };
    }
    let capped = attempt_cap(
        input.auto_score,
        input.attempt_penalty_percent,
        input.attempt_number,
    );
    PenaltyOutcome {
        late_penalty_pct: late,
        final_score: apply_late(capped, late),
        violation_zeroed: false,
    }
}

/// `round(score × (1 − pct/100), 2)` — shared with the teacher path.
#[must_use]
pub fn apply_late(score: f64, late_penalty_pct: f64) -> f64 {
    round2(score * (1.0 - late_penalty_pct.clamp(0.0, 100.0) / 100.0))
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

    #[test]
    fn late_penalty_math_matches_legacy() {
        let policy = LatePolicy::Penalty {
            percent_per_day: 10.0,
            max_days: 3,
        };
        assert_eq!(late_penalty_pct(policy, Some(1000), 1000, true), 0.0);
        // 1 second late still counts as a full day.
        assert_eq!(late_penalty_pct(policy, Some(1000), 1001, true), 10.0);
        // 2.5 days → 3 days; capped by max_days = 3 → 30.
        assert_eq!(late_penalty_pct(policy, Some(0), 216_000, true), 30.0);
        assert_eq!(late_penalty_pct(policy, Some(0), 10_000_000, true), 30.0);
        assert_eq!(
            late_penalty_pct(LatePolicy::Cutoff { cutoff_at: 500 }, Some(0), 600, true),
            100.0
        );
        assert_eq!(late_penalty_pct(policy, None, 999, true), 0.0);
    }

    #[test]
    fn ordering_violation_then_manual_then_cap_then_late() {
        let base = PenaltyInput {
            auto_score: 90.0,
            needs_manual_review: false,
            violation_exceeded: false,
            attempt_number: 3,
            attempt_penalty_percent: 10.0,
            late_pct: 10.0,
            waive_late_penalty: false,
        };
        // Cap for attempt 3 = 80 → late 10% → 72.
        assert_eq!(apply(&base).final_score, 72.0);
        assert!(
            apply(&PenaltyInput {
                violation_exceeded: true,
                ..base
            })
            .violation_zeroed
        );
        let manual = apply(&PenaltyInput {
            needs_manual_review: true,
            ..base
        });
        assert_eq!(manual.final_score, 0.0);
        assert_eq!(manual.late_penalty_pct, 10.0, "kept for the teacher path");
        assert_eq!(
            apply(&PenaltyInput {
                waive_late_penalty: true,
                ..base
            })
            .final_score,
            80.0
        );
    }
}
