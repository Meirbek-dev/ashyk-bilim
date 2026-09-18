//! Auto-grading math, ported from `quiz_grader.py` / `code_grader.py`.
//!
//! Every item's points are its share of `max_score` (100) by `max_score`
//! weight, an even split when no weights are defined. Choice items score
//! partial credit with a hardcoded half-weight penalty per wrong pick and
//! optional negative marking on a full miss; matching scores the fraction
//! of exact pairs; open text and forms always go to manual review.

use ab_core::assessments::ItemKind;
use serde::Serialize;

use crate::assessments::items::ItemBody;
use crate::assessments::service::Item;
use crate::grading::answers::{Answers, ItemAnswer};
use crate::grading::breakdown::{GradedItem, GradingBreakdown, round2};

/// Knobs the grader reads from the policy.
#[derive(Debug, Clone, Copy)]
pub struct GraderPolicy {
    pub partial_credit: bool,
    pub negative_marking_percent: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AutoGrade {
    /// 0..100 (never negative — the legacy could go below zero).
    pub auto_score: f64,
    pub breakdown: GradingBreakdown,
}

/// Counts are small; the cast is exact far beyond any assessment size.
#[allow(clippy::cast_precision_loss)]
const fn count(n: usize) -> f64 {
    n as f64
}

/// One auto-graded item: points, correctness and the verdict as a code
/// (+ placeholders) the client localizes, with the English text kept in
/// `feedback` for compatibility.
struct Verdict {
    score: f64,
    correct: Option<bool>,
    code: &'static str,
    params: Option<serde_json::Value>,
    feedback: String,
}

impl Verdict {
    fn new(score: f64, correct: bool, code: &'static str, feedback: &str) -> Self {
        Self {
            score,
            correct: Some(correct),
            code,
            params: None,
            feedback: feedback.to_owned(),
        }
    }

    /// `{correct, total}` verdicts (`partially-correct`, `pairs-matched`, …).
    fn ratio(
        score: f64,
        correct: bool,
        code: &'static str,
        (hits, total): (usize, usize),
        feedback: String,
    ) -> Self {
        Self {
            score,
            correct: Some(correct),
            code,
            params: Some(serde_json::json!({ "correct": hits, "total": total })),
            feedback,
        }
    }
}

/// Points per item as its `max_score` share of 100, or an even split.
fn item_points(items: &[Item]) -> Vec<f64> {
    let total: f64 = items.iter().map(|i| i.max_score).sum();
    if total > 0.0 {
        items.iter().map(|i| i.max_score / total * 100.0).collect()
    } else {
        let each = 100.0 / count(items.len().max(1));
        items.iter().map(|_| each).collect()
    }
}

fn grade_choice(
    body: &crate::assessments::items::ChoiceBody,
    selected: &[String],
    points: f64,
    policy: GraderPolicy,
) -> Verdict {
    let correct_ids: Vec<&str> = body
        .options
        .iter()
        .filter(|o| o.is_correct)
        .map(|o| o.id.as_str())
        .collect();
    let chosen: Vec<&str> = selected.iter().map(String::as_str).collect();
    if chosen.is_empty() {
        return Verdict::new(0.0, false, "no-answer", "No answer provided");
    }
    if correct_ids.is_empty() {
        return Verdict::new(
            points,
            true,
            "no-correct-answer",
            "No correct answer defined",
        );
    }
    let hits = chosen.iter().filter(|c| correct_ids.contains(c)).count();
    let misses = chosen.len() - hits;
    if misses == 0 && hits == correct_ids.len() {
        return Verdict::new(round2(points), true, "correct", "Correct");
    }
    if hits > 0 {
        if !policy.partial_credit {
            return Verdict::new(
                0.0,
                false,
                "partially-correct-no-credit",
                "Partially correct (no partial credit)",
            );
        }
        let partial = count(hits) / count(correct_ids.len()) * points;
        let penalty = count(misses) / count(body.options.len().max(1)) * points * 0.5;
        return Verdict::ratio(
            round2((partial - penalty).max(0.0)),
            false,
            "partially-correct",
            (hits, correct_ids.len()),
            format!("Partially correct ({hits}/{})", correct_ids.len()),
        );
    }
    let deduction = policy.negative_marking_percent / 100.0 * points;
    Verdict::new(
        round2(-deduction.min(points)),
        false,
        "incorrect",
        "Incorrect",
    )
}

/// Answers name the columns' option ids, which are the pair texts (the
/// learner body shuffles the right column; ids stay the texts).
fn grade_matching(
    body: &crate::assessments::items::MatchingBody,
    matches: &[crate::grading::answers::MatchingAnswer],
    points: f64,
) -> Verdict {
    if matches.is_empty() {
        return Verdict::new(0.0, false, "no-answer", "No answer provided");
    }
    let expected = body.pairs.len().max(1);
    let correct = body
        .pairs
        .iter()
        .filter(|p| {
            matches
                .iter()
                .any(|m| m.left == p.left.trim() && m.right == p.right.trim())
        })
        .count();
    let all = correct == body.pairs.len();
    let score = round2(count(correct) / count(expected) * points);
    if all {
        Verdict::new(score, true, "correct", "Correct")
    } else {
        Verdict::ratio(
            score,
            false,
            "pairs-matched",
            (correct, body.pairs.len()),
            format!("{correct}/{} pairs matched", body.pairs.len()),
        )
    }
}

fn correct_answer(body: &ItemBody) -> serde_json::Value {
    match body {
        ItemBody::Choice(b) => serde_json::json!(
            b.options
                .iter()
                .filter(|o| o.is_correct)
                .map(|o| o.id.as_str())
                .collect::<Vec<_>>()
        ),
        ItemBody::Matching(b) => serde_json::to_value(&b.pairs).unwrap_or_default(),
        ItemBody::OpenText(_)
        | ItemBody::Form(_)
        | ItemBody::Code(_)
        | ItemBody::MatchingLearner(_) => serde_json::Value::Null,
    }
}

/// Grade quiz/exam answers. Code items never appear here (kind rules keep
/// them in code challenges).
#[must_use]
pub fn grade_quiz(items: &[Item], answers: &Answers, policy: GraderPolicy) -> AutoGrade {
    let points = item_points(items);
    let mut graded = Vec::with_capacity(items.len());
    let mut earned = 0.0;
    let mut possible = 0.0;
    let mut manual = false;
    for (item, pts) in items.iter().zip(points) {
        let answer = answers.get(&item.id);
        let user_answer = serde_json::to_value(answer).unwrap_or_default();
        let verdict = match (&item.body, answer) {
            (ItemBody::Choice(body), Some(ItemAnswer::Choice { selected })) => {
                Some(grade_choice(body, selected, pts, policy))
            }
            (ItemBody::Choice(body), _) => Some(grade_choice(body, &[], pts, policy)),
            (ItemBody::Matching(body), Some(ItemAnswer::Matching { matches })) => {
                Some(grade_matching(body, matches, pts))
            }
            (ItemBody::Matching(body), _) => Some(grade_matching(body, &[], pts)),
            // Open text, forms (and a stray code item) need a human.
            _ => None,
        };
        let needs_manual_review = verdict.is_none();
        manual |= needs_manual_review;
        let score = verdict.as_ref().map_or(0.0, |v| v.score);
        let max_score = round2(pts);
        earned += score;
        possible += max_score;
        graded.push(GradedItem {
            item_id: item.id,
            item_text: item.title.clone(),
            score,
            max_score,
            correct: verdict.as_ref().and_then(|v| v.correct),
            feedback: verdict
                .as_ref()
                .map(|v| v.feedback.clone())
                .unwrap_or_default(),
            feedback_code: verdict.as_ref().map(|v| v.code.to_owned()),
            feedback_params: verdict.and_then(|v| v.params),
            needs_manual_review,
            user_answer,
            correct_answer: correct_answer(&item.body),
        });
    }
    // BUG-169: one normalisation over the rounded breakdown (same formula as
    // the teacher path) — summing per-item round2 gave 100.02 / 99.99 for
    // 6 / 3 equal items, so `passing_score: 100` failed a perfect attempt.
    let auto_score = if possible > 0.0 {
        round2((earned / possible * 100.0).max(0.0))
    } else {
        0.0
    };
    AutoGrade {
        auto_score,
        breakdown: GradingBreakdown {
            items: graded,
            needs_manual_review: manual,
            auto_graded: true,
            feedback: String::new(),
        },
    }
}

/// A finished final run's per-test outcome (from `code_run_cases`).
#[derive(Debug, Clone)]
pub struct CaseOutcome {
    pub test_id: String,
    pub weight: f64,
    pub passed: bool,
}

/// Code challenge score from the final run: weighted share of passed
/// tests, or all-or-nothing when the item says so.
#[must_use]
pub fn grade_code(item: &Item, cases: &[CaseOutcome], answer: Option<&ItemAnswer>) -> AutoGrade {
    let all_or_nothing = matches!(
        &item.body,
        ItemBody::Code(b) if b.scoring_strategy
            == crate::assessments::items::ScoringStrategy::AllOrNothing
    );
    let total_weight: f64 = {
        let sum: f64 = cases.iter().map(|c| c.weight).sum();
        if sum > 0.0 { sum } else { count(cases.len()) }
    };
    let earned: f64 = cases.iter().filter(|c| c.passed).map(|c| c.weight).sum();
    let raw = if total_weight > 0.0 {
        earned / total_weight * 100.0
    } else {
        0.0
    };
    let auto_score = if all_or_nothing {
        if raw >= 100.0 { 100.0 } else { 0.0 }
    } else {
        round2(raw)
    };
    let passed = cases.iter().filter(|c| c.passed).count();
    AutoGrade {
        auto_score,
        breakdown: GradingBreakdown {
            items: vec![GradedItem {
                item_id: item.id,
                item_text: item.title.clone(),
                score: auto_score,
                max_score: 100.0,
                correct: Some(!cases.is_empty() && passed == cases.len()),
                feedback: format!("{passed}/{} tests passed", cases.len()),
                feedback_code: Some("tests-passed".into()),
                feedback_params: Some(
                    serde_json::json!({ "correct": passed, "total": cases.len() }),
                ),
                needs_manual_review: false,
                user_answer: serde_json::to_value(answer).unwrap_or_default(),
                correct_answer: serde_json::Value::Null,
            }],
            needs_manual_review: false,
            auto_graded: true,
            feedback: String::new(),
        },
    }
}

/// Which grader an assessment kind uses.
#[must_use]
pub const fn is_code_item(kind: ItemKind) -> bool {
    matches!(kind, ItemKind::Code)
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
    use crate::assessments::items::{ChoiceBody, ChoiceOption, MatchingBody, MatchingPair};
    use ab_core::id::AssessmentItemId;

    fn item(body: ItemBody, max_score: f64) -> Item {
        Item {
            id: AssessmentItemId::new(),
            position: 1,
            kind: body.kind(),
            title: "q".into(),
            body,
            max_score,
            section_label: None,
            difficulty: None,
            tags: Vec::new(),
            outcome_ids: Vec::new(),
            estimated_minutes: None,
        }
    }

    fn choice(correct: &[&str], wrong: &[&str], multiple: bool) -> ItemBody {
        let mut options: Vec<ChoiceOption> = correct
            .iter()
            .map(|id| ChoiceOption {
                id: (*id).into(),
                text: (*id).into(),
                is_correct: true,
            })
            .collect();
        options.extend(wrong.iter().map(|id| ChoiceOption {
            id: (*id).into(),
            text: (*id).into(),
            is_correct: false,
        }));
        ItemBody::Choice(ChoiceBody {
            prompt: "?".into(),
            options,
            multiple,
            variant: None,
            explanation: None,
        })
    }

    const POLICY: GraderPolicy = GraderPolicy {
        partial_credit: true,
        negative_marking_percent: 0.0,
    };

    #[test]
    fn weights_partial_credit_and_matching_follow_legacy() {
        let q1 = item(choice(&["a", "b"], &["c", "d"], true), 3.0);
        let q2 = item(
            ItemBody::Matching(MatchingBody {
                prompt: "m".into(),
                pairs: vec![
                    MatchingPair {
                        left: "1".into(),
                        right: "one".into(),
                    },
                    MatchingPair {
                        left: "2".into(),
                        right: "two".into(),
                    },
                ],
                explanation: None,
            }),
            1.0,
        );
        let mut answers = Answers::new();
        // One hit, one miss out of {a,b} among 4 options → 75-point item:
        // partial 37.5 − penalty (1/4 × 75 × 0.5 = 9.375) = 28.125 → 28.12.
        answers.insert(
            q1.id,
            ItemAnswer::Choice {
                selected: vec!["a".into(), "c".into()],
            },
        );
        // One of two pairs → 12.5 of 25.
        answers.insert(
            q2.id,
            ItemAnswer::Matching {
                matches: vec![crate::grading::answers::MatchingAnswer {
                    left: "1".into(),
                    right: "one".into(),
                }],
            },
        );
        let grade = grade_quiz(&[q1, q2], &answers, POLICY);
        assert_eq!(grade.breakdown.items[0].max_score, 75.0);
        assert_eq!(grade.breakdown.items[0].score, 28.12);
        assert_eq!(grade.breakdown.items[1].score, 12.5);
        assert_eq!(grade.auto_score, 40.62);
        assert!(!grade.breakdown.needs_manual_review);
        // The verdict travels as a code + params next to the English text.
        assert_eq!(
            grade.breakdown.items[0].feedback_code.as_deref(),
            Some("partially-correct")
        );
        assert_eq!(
            grade.breakdown.items[0].feedback_params,
            Some(serde_json::json!({ "correct": 1, "total": 2 }))
        );
        assert_eq!(grade.breakdown.items[0].feedback, "Partially correct (1/2)");
        assert_eq!(
            grade.breakdown.items[1].feedback_code.as_deref(),
            Some("pairs-matched")
        );
        assert_eq!(
            grade.breakdown.items[1].feedback_params,
            Some(serde_json::json!({ "correct": 1, "total": 2 }))
        );
    }

    #[test]
    fn perfect_attempts_score_exactly_100_regardless_of_item_count() {
        for n in [3, 6, 7] {
            let items: Vec<Item> = (0..n)
                .map(|_| item(choice(&["a"], &["b"], false), 1.0))
                .collect();
            let mut answers = Answers::new();
            for q in &items {
                answers.insert(
                    q.id,
                    ItemAnswer::Choice {
                        selected: vec!["a".into()],
                    },
                );
            }
            let grade = grade_quiz(&items, &answers, POLICY);
            assert_eq!(grade.auto_score, 100.0, "{n} items");
        }
    }

    #[test]
    fn negative_marking_floors_the_total_at_zero() {
        let q = item(choice(&["a"], &["b"], false), 0.0);
        let mut answers = Answers::new();
        answers.insert(
            q.id,
            ItemAnswer::Choice {
                selected: vec!["b".into()],
            },
        );
        let grade = grade_quiz(
            &[q],
            &answers,
            GraderPolicy {
                partial_credit: true,
                negative_marking_percent: 50.0,
            },
        );
        assert_eq!(grade.breakdown.items[0].score, -50.0);
        assert_eq!(grade.auto_score, 0.0);
    }

    #[test]
    fn open_text_forces_manual_review() {
        let q = item(
            ItemBody::OpenText(crate::assessments::items::OpenTextBody {
                prompt: "essay".into(),
                min_words: None,
                rubric: None,
            }),
            10.0,
        );
        let grade = grade_quiz(&[q], &Answers::new(), POLICY);
        assert!(grade.breakdown.needs_manual_review);
        assert_eq!(grade.breakdown.items[0].correct, None);
        assert_eq!(grade.breakdown.items[0].feedback_code, None);
        assert_eq!(grade.auto_score, 0.0);
    }

    #[test]
    fn code_scoring_weighted_and_all_or_nothing() {
        let mut code = crate::assessments::items::CodeBody {
            prompt: "p".into(),
            input_spec: String::new(),
            output_spec: String::new(),
            constraints: Vec::new(),
            languages: vec![71],
            starter_code: std::collections::BTreeMap::new(),
            reference_solutions: std::collections::BTreeMap::new(),
            tests: Vec::new(),
            time_limit_seconds: None,
            memory_limit_mb: None,
            max_output_kb: None,
            scoring_strategy: crate::assessments::items::ScoringStrategy::PartialCredit,
        };
        let cases = vec![
            CaseOutcome {
                test_id: "t1".into(),
                weight: 1.0,
                passed: true,
            },
            CaseOutcome {
                test_id: "t2".into(),
                weight: 3.0,
                passed: false,
            },
        ];
        let weighted = grade_code(&item(ItemBody::Code(code.clone()), 100.0), &cases, None);
        assert_eq!(weighted.auto_score, 25.0);
        code.scoring_strategy = crate::assessments::items::ScoringStrategy::AllOrNothing;
        let strict = grade_code(&item(ItemBody::Code(code), 100.0), &cases, None);
        assert_eq!(strict.auto_score, 0.0);
    }
}
