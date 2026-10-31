//! Bayesian Knowledge Tracing with partial credit (docs/AI-FIRST.md 3.2). Pure functions.

use serde::Serialize;

/// Prior probability that a concept is known before any evidence.
pub const PRIOR: f64 = 0.15;
/// Probability of learning the concept between two observations.
pub const TRANSIT: f64 = 0.12;
/// `p` at or above this (with [`MIN_MASTERED_EVIDENCE`] observations) counts as mastered.
pub const MASTERED: f64 = 0.75;
/// Below this a learner is struggling.
pub const STRUGGLING: f64 = 0.4;
pub const MIN_MASTERED_EVIDENCE: i32 = 2;
/// Evidence older than this marks the concept stale.
pub const STALE_DAYS: i64 = 45;

/// The guess/slip class of an observation (`mastery_evidence.kind`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EvidenceKind {
    /// Choice and matching: a quarter of guesses land.
    Choice,
    /// Open text, forms, files, remediation tests.
    Open,
    /// Code against tests.
    Code,
    /// A weak signal (an AI question): open-answer parameters, low weight.
    Signal,
}

impl EvidenceKind {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Choice => "choice",
            Self::Open => "open",
            Self::Code => "code",
            Self::Signal => "signal",
        }
    }

    #[must_use]
    pub fn parse(s: &str) -> Self {
        match s {
            "choice" => Self::Choice,
            "code" => Self::Code,
            "signal" => Self::Signal,
            _ => Self::Open,
        }
    }

    /// `(guess, slip)`.
    #[must_use]
    pub const fn params(self) -> (f64, f64) {
        match self {
            Self::Choice => (0.25, 0.10),
            Self::Open | Self::Signal => (0.05, 0.10),
            Self::Code => (0.05, 0.15),
        }
    }
}

/// One observation: a score in [0, 1] with a weight in (0, 1].
#[derive(Debug, Clone, Copy)]
pub struct Observation {
    pub score: f64,
    pub weight: f64,
    pub kind: EvidenceKind,
}

/// One BKT step from `p`.
#[must_use]
pub fn update(p: f64, obs: Observation) -> f64 {
    let p = p.clamp(0.0, 1.0);
    let s = obs.score.clamp(0.0, 1.0);
    let w = obs.weight.clamp(0.0, 1.0);
    let (guess, slip) = obs.kind.params();
    let correct = p * (1.0 - slip) / (1.0 - p).mul_add(guess, p * (1.0 - slip)).max(f64::EPSILON);
    let wrong = p * slip / (1.0 - p).mul_add(1.0 - guess, p * slip).max(f64::EPSILON);
    let posterior = (1.0 - s).mul_add(wrong, s * correct);
    let next = (1.0 - posterior).mul_add(TRANSIT, posterior);
    w.mul_add(next - p, p).clamp(0.0, 1.0)
}

/// Replays observations in time order from the prior.
#[must_use]
pub fn replay(observations: &[Observation]) -> f64 {
    observations.iter().fold(PRIOR, |p, obs| update(p, *obs))
}

/// What the learner and the teacher see.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum MasteryLevel {
    NotStarted,
    Struggling,
    Learning,
    Mastered,
}

#[must_use]
pub fn level(p: f64, evidence: i32) -> MasteryLevel {
    if evidence <= 0 {
        MasteryLevel::NotStarted
    } else if p >= MASTERED && evidence >= MIN_MASTERED_EVIDENCE {
        MasteryLevel::Mastered
    } else if p < STRUGGLING {
        MasteryLevel::Struggling
    } else {
        MasteryLevel::Learning
    }
}

#[cfg(test)]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::float_cmp,
    clippy::panic
)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn obs(score: f64, kind: EvidenceKind) -> Observation {
        Observation {
            score,
            weight: 1.0,
            kind,
        }
    }

    fn kind() -> impl Strategy<Value = EvidenceKind> {
        prop_oneof![
            Just(EvidenceKind::Choice),
            Just(EvidenceKind::Open),
            Just(EvidenceKind::Code),
            Just(EvidenceKind::Signal)
        ]
    }

    proptest! {
        #[test]
        fn stays_within_bounds(p in 0.0f64..=1.0, s in 0.0f64..=1.0, w in 0.0f64..=1.0, k in kind()) {
            let next = update(p, Observation { score: s, weight: w, kind: k });
            prop_assert!((0.0..=1.0).contains(&next));
        }

        #[test]
        fn higher_scores_never_lower_the_estimate(p in 0.01f64..0.99, a in 0.0f64..=1.0, b in 0.0f64..=1.0, k in kind()) {
            let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
            prop_assert!(update(p, obs(hi, k)) + 1e-12 >= update(p, obs(lo, k)));
        }

        #[test]
        fn a_correct_answer_never_lowers_and_a_wrong_one_never_raises_much(p in 0.01f64..0.99, k in kind()) {
            prop_assert!(update(p, obs(1.0, k)) >= p - 1e-12);
            // A wrong answer can only rise by the learning step itself.
            prop_assert!(update(p, obs(0.0, k)) <= p + TRANSIT + 1e-12);
        }

        #[test]
        fn zero_weight_changes_nothing(p in 0.0f64..=1.0, s in 0.0f64..=1.0, k in kind()) {
            let next = update(p, Observation { score: s, weight: 0.0, kind: k });
            prop_assert!((next - p).abs() < 1e-12);
        }
    }

    #[test]
    fn replay_is_deterministic_and_learns() {
        let good = vec![obs(1.0, EvidenceKind::Open); 3];
        let p = replay(&good);
        assert_eq!(p, replay(&good));
        assert!(p > MASTERED);
        assert_eq!(level(p, 3), MasteryLevel::Mastered);
        let bad = vec![obs(0.0, EvidenceKind::Choice); 3];
        assert_eq!(level(replay(&bad), 3), MasteryLevel::Struggling);
        assert_eq!(level(0.9, 1), MasteryLevel::Learning);
        assert_eq!(level(0.9, 0), MasteryLevel::NotStarted);
    }

    #[test]
    fn guessable_items_count_less_than_open_answers() {
        assert!(
            update(PRIOR, obs(1.0, EvidenceKind::Open))
                > update(PRIOR, obs(1.0, EvidenceKind::Choice))
        );
    }
}
