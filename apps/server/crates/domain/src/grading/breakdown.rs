//! The grading breakdown stored on submissions and grading entries
//! (legacy `GradingBreakdown`).

use ab_core::id::AssessmentItemId;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct GradedItem {
    pub item_id: AssessmentItemId,
    #[serde(default)]
    pub item_text: String,
    pub score: f64,
    pub max_score: f64,
    /// `None` = not auto-gradeable.
    #[serde(default)]
    pub correct: Option<bool>,
    /// English text (compatibility); the auto-grader also sets a code.
    #[serde(default)]
    pub feedback: String,
    /// Auto-grader verdict for the client to localize (`no-answer`,
    /// `correct`, `partially-correct`, …); `None` for teacher prose.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feedback_code: Option<String>,
    /// Placeholders for `feedback_code` (`{correct, total}`, …).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feedback_params: Option<serde_json::Value>,
    #[serde(default)]
    pub needs_manual_review: bool,
    #[serde(default)]
    pub user_answer: serde_json::Value,
    #[serde(default)]
    pub correct_answer: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct GradingBreakdown {
    #[serde(default)]
    pub items: Vec<GradedItem>,
    #[serde(default)]
    pub needs_manual_review: bool,
    #[serde(default)]
    pub auto_graded: bool,
    /// Teacher's overall comment.
    #[serde(default)]
    pub feedback: String,
}

impl GradingBreakdown {
    #[must_use]
    pub fn to_value(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or_default()
    }

    /// Tolerant of the empty `{}` default and of legacy-shaped blobs.
    #[must_use]
    pub fn from_value(value: &serde_json::Value) -> Self {
        serde_json::from_value(value.clone()).unwrap_or_default()
    }
}

/// Python's `round(x, 2)`: half-to-even, to the cent.
///
/// Rust's `f64::round` is half-away-from-zero, and scores must match the
/// legacy. `-0.0` comes out as `0` (the `+ 0.0`), so a grade never echoes a
/// minus sign.
#[must_use]
pub fn round2(x: f64) -> f64 {
    let scaled = x * 100.0;
    let floor = scaled.floor();
    let diff = scaled - floor;
    let rounded = if (diff - 0.5).abs() < 1e-9 {
        // Exactly halfway: round to the even neighbour.
        if floor.rem_euclid(2.0) == 0.0 {
            floor
        } else {
            floor + 1.0
        }
    } else {
        scaled.round()
    };
    rounded / 100.0 + 0.0
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::float_cmp)]
mod tests {
    use super::*;

    #[test]
    fn round2_is_half_even_like_python() {
        assert_eq!(round2(0.125), 0.12);
        assert_eq!(round2(0.135), 0.14);
        assert_eq!(round2(2.5), 2.5);
        assert_eq!(round2(66.666_66), 66.67);
        assert_eq!(round2(-0.125), -0.12);
        assert!(round2(-0.0).is_sign_positive());
    }

    #[test]
    fn breakdown_round_trips_and_tolerates_empty() {
        assert_eq!(
            GradingBreakdown::from_value(&serde_json::json!({})),
            GradingBreakdown::default()
        );
        let b = GradingBreakdown {
            items: vec![GradedItem {
                item_id: AssessmentItemId::new(),
                item_text: "q".into(),
                score: 1.5,
                max_score: 2.0,
                correct: Some(false),
                feedback: String::new(),
                feedback_code: None,
                feedback_params: None,
                needs_manual_review: false,
                user_answer: serde_json::json!(["a"]),
                correct_answer: serde_json::json!(["b"]),
            }],
            needs_manual_review: false,
            auto_graded: true,
            feedback: String::new(),
        };
        assert_eq!(GradingBreakdown::from_value(&b.to_value()), b);
    }
}
