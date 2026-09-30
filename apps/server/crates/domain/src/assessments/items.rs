//! Item bodies and their readiness rules.
//!
//! The body is the one genuinely polymorphic payload in this domain, stored
//! as `{schema_version, kind, ...}` jsonb (ARCHITECTURE §8.4). Readiness
//! issue codes are the legacy dotted keys verbatim
//! (`choice.options_missing`, …): stable machine keys the frontend
//! translates.

// SAFETY-style justification: `ItemBody::MatchingLearner` deliberately
// shares the `matching` tag with `ItemBody::Matching` (write-only learner
// shape, see the enum docs); serde's derived deserializer therefore has an
// unreachable match arm. `skip_deserializing` would fix that but drops the
// variant from the utoipa schema, which the web contract needs.
#![allow(unreachable_patterns)]

use std::collections::{BTreeMap, HashSet};

use ab_core::assessments::ItemKind;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

pub const ITEM_BODY_SCHEMA_VERSION: u32 = 1;
/// UX-143 / BUG-209: item body size caps, refused at write time.
///
/// Every free-text field (prompt, option text, explanation, rubric, labels,
/// pairs, code specs / starters / tests) is bounded by `MAX_TEXT_CHARS`.
pub const MAX_TEXT_CHARS: usize = 20_000;
pub const MAX_BODY_ENTRIES: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ChoiceOption {
    pub id: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub is_correct: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ChoiceVariant {
    SingleChoice,
    MultipleChoice,
    TrueFalse,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ChoiceBody {
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub options: Vec<ChoiceOption>,
    #[serde(default)]
    pub multiple: bool,
    #[serde(default)]
    pub variant: Option<ChoiceVariant>,
    #[serde(default)]
    pub explanation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct OpenTextBody {
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub min_words: Option<i32>,
    #[serde(default)]
    pub rubric: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum FormFieldType {
    Text,
    Textarea,
    Number,
    Date,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct FormField {
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default = "FormField::default_type")]
    pub field_type: FormFieldType,
    #[serde(default)]
    pub required: bool,
}

impl FormField {
    const fn default_type() -> FormFieldType {
        FormFieldType::Text
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct FormBody {
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub fields: Vec<FormField>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum MatchMode {
    Exact,
    Trimmed,
    IgnoreWhitespace,
    NumericTolerance,
    CustomChecker,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ScoringStrategy {
    PartialCredit,
    AllOrNothing,
    BestSubmission,
    LatestSubmission,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CodeTestCase {
    pub id: String,
    #[serde(default)]
    pub input: String,
    #[serde(default)]
    pub expected_output: String,
    #[serde(default = "CodeTestCase::default_visible")]
    pub is_visible: bool,
    #[serde(default = "CodeTestCase::default_weight")]
    pub weight: i32,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "CodeTestCase::default_match_mode")]
    pub match_mode: MatchMode,
}

impl CodeTestCase {
    const fn default_visible() -> bool {
        true
    }
    const fn default_weight() -> i32 {
        1
    }
    const fn default_match_mode() -> MatchMode {
        MatchMode::Exact
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CodeBody {
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub input_spec: String,
    #[serde(default)]
    pub output_spec: String,
    #[serde(default)]
    pub constraints: Vec<String>,
    /// Judge0 language ids.
    #[serde(default)]
    pub languages: Vec<i32>,
    /// Keyed by language id as a string (legacy shape).
    #[serde(default)]
    pub starter_code: BTreeMap<String, String>,
    #[serde(default)]
    pub reference_solutions: BTreeMap<String, String>,
    #[serde(default)]
    pub tests: Vec<CodeTestCase>,
    #[serde(default)]
    pub time_limit_seconds: Option<i32>,
    #[serde(default)]
    pub memory_limit_mb: Option<i32>,
    #[serde(default)]
    pub max_output_kb: Option<i32>,
    #[serde(default = "CodeBody::default_strategy")]
    pub scoring_strategy: ScoringStrategy,
}

impl CodeBody {
    const fn default_strategy() -> ScoringStrategy {
        ScoringStrategy::PartialCredit
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MatchingPair {
    pub left: String,
    pub right: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MatchingBody {
    #[serde(default)]
    pub prompt: String,
    /// Required on the wire so a client's untagged union can tell this
    /// author shape from [`MatchingLearnerBody`] (`left`/`right`, no pairs).
    #[serde(default)]
    #[schema(required)]
    pub pairs: Vec<MatchingPair>,
    #[serde(default)]
    pub explanation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MatchingOption {
    /// What the answer carries: the option text (unique per column, since
    /// the readiness rules forbid duplicates).
    pub id: String,
    pub text: String,
}

/// The learner read of a matching item: the two columns with the right
/// one shuffled (stable per viewer and item), never the pairing. Authors
/// keep [`MatchingBody::pairs`].
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MatchingLearnerBody {
    #[serde(default)]
    pub prompt: String,
    pub left: Vec<MatchingOption>,
    pub right: Vec<MatchingOption>,
}

/// Internally tagged on `kind` — the wire and storage shape.
///
/// `MatchingLearner` shares the `matching` tag but is only ever written
/// (the learner read); an incoming `matching` body always parses as the
/// author [`MatchingBody`].
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ItemBody {
    Choice(ChoiceBody),
    OpenText(OpenTextBody),
    Form(FormBody),
    Code(CodeBody),
    Matching(MatchingBody),
    #[serde(rename = "matching")]
    MatchingLearner(MatchingLearnerBody),
}

/// splitmix64: a deterministic shuffle seed needs no crate.
const fn next_random(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// Fisher-Yates with a fixed seed: the same seed gives the same order.
pub(crate) fn shuffle<T>(items: &mut [T], seed: u64) {
    let mut state = seed;
    for i in (1..items.len()).rev() {
        let j = usize::try_from(next_random(&mut state) % (i as u64 + 1)).unwrap_or(0);
        items.swap(i, j);
    }
}

impl ItemBody {
    /// Strip everything a learner must not see while attempting: the answer
    /// key on choices, rubrics and explanations, reference solutions and
    /// hidden tests; a matching item becomes its two columns with the right
    /// one shuffled by `seed`, and choice options are shuffled by `seed` when
    /// `shuffle_options` (policy `randomize_options`). Authors read the full
    /// body; learners read this.
    pub fn redact_for_learner(&mut self, seed: u64, shuffle_options: bool) {
        match self {
            Self::Choice(body) => {
                for option in &mut body.options {
                    option.is_correct = false;
                }
                body.explanation = None;
                if shuffle_options {
                    shuffle(&mut body.options, seed);
                }
            }
            Self::OpenText(body) => body.rubric = None,
            Self::Code(body) => {
                body.reference_solutions.clear();
                body.tests.retain(|test| test.is_visible);
            }
            Self::Matching(body) => {
                let option = |text: &str| MatchingOption {
                    id: text.to_owned(),
                    text: text.to_owned(),
                };
                let mut right: Vec<MatchingOption> =
                    body.pairs.iter().map(|p| option(&p.right)).collect();
                shuffle(&mut right, seed);
                *self = Self::MatchingLearner(MatchingLearnerBody {
                    prompt: std::mem::take(&mut body.prompt),
                    left: body.pairs.iter().map(|p| option(&p.left)).collect(),
                    right,
                });
            }
            Self::Form(_) | Self::MatchingLearner(_) => {}
        }
    }

    #[must_use]
    pub const fn kind(&self) -> ItemKind {
        match self {
            Self::Choice(_) => ItemKind::Choice,
            Self::OpenText(_) => ItemKind::OpenText,
            Self::Form(_) => ItemKind::Form,
            Self::Code(_) => ItemKind::Code,
            Self::Matching(_) | Self::MatchingLearner(_) => ItemKind::Matching,
        }
    }

    /// Storage form: the body plus `schema_version`.
    #[must_use]
    pub fn to_stored(&self) -> serde_json::Value {
        let mut value = serde_json::to_value(self).unwrap_or_default();
        if let Some(object) = value.as_object_mut() {
            object.insert(
                "schema_version".into(),
                serde_json::Value::from(ITEM_BODY_SCHEMA_VERSION),
            );
        }
        value
    }

    /// Parse the storage form (unknown `schema_version`s parse as v1 — the
    /// only version so far; a future bump adds an upgrade step here).
    pub fn from_stored(value: &serde_json::Value) -> Result<Self, serde_json::Error> {
        serde_json::from_value(value.clone())
    }

    /// The legacy default body for a fresh code challenge.
    #[must_use]
    pub const fn default_code() -> Self {
        Self::Code(CodeBody {
            prompt: String::new(),
            input_spec: String::new(),
            output_spec: String::new(),
            constraints: Vec::new(),
            languages: Vec::new(),
            starter_code: BTreeMap::new(),
            reference_solutions: BTreeMap::new(),
            tests: Vec::new(),
            time_limit_seconds: Some(5),
            memory_limit_mb: Some(256),
            max_output_kb: None,
            scoring_strategy: ScoringStrategy::PartialCredit,
        })
    }
}

/// One thing blocking (or advising against) publication.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct ReadinessIssue {
    /// Stable machine key, e.g. `choice.options_missing`.
    pub code: String,
    pub message: String,
    /// `blocker` | `warning` | `advice` — every current rule is a blocker.
    pub severity: &'static str,
    /// `details` | `questions` | `policy` | `audience` | `publish`.
    pub area: &'static str,
    pub item_id: Option<ab_core::id::AssessmentItemId>,
}

impl ReadinessIssue {
    fn blocker(code: &str, message: impl Into<String>, area: &'static str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            severity: "blocker",
            area,
            item_id: None,
        }
    }
}

fn blank(s: &str) -> bool {
    s.trim().is_empty()
}

/// Case-insensitive duplicate detector.
fn has_duplicates<'a>(values: impl Iterator<Item = &'a str>) -> bool {
    let mut seen = HashSet::new();
    for value in values {
        if !seen.insert(value.trim().to_lowercase()) {
            return true;
        }
    }
    false
}

/// Collects `(condition, code, message)` rules into blocker issues.
fn rules(checks: &[(bool, &str, &str)]) -> Vec<ReadinessIssue> {
    checks
        .iter()
        .filter(|(failed, _, _)| *failed)
        .map(|(_, code, message)| ReadinessIssue::blocker(code, *message, "questions"))
        .collect()
}

impl ChoiceBody {
    fn readiness(&self) -> Vec<ReadinessIssue> {
        let correct = self.options.iter().filter(|o| o.is_correct).count();
        rules(&[
            (
                blank(&self.prompt),
                "choice.prompt_missing",
                "prompt is empty",
            ),
            (
                self.options.len() < 2,
                "choice.options_missing",
                "at least two options are required",
            ),
            (
                self.options.iter().any(|o| blank(&o.text)),
                "choice.option_text_missing",
                "every option needs text",
            ),
            (
                has_duplicates(self.options.iter().map(|o| o.text.as_str())),
                "choice.option_duplicate",
                "options must be distinct",
            ),
            (
                has_duplicates(self.options.iter().map(|o| o.id.as_str())),
                "choice.option_id_duplicate",
                "option ids must be unique",
            ),
            (
                correct == 0,
                "choice.correct_missing",
                "mark at least one correct option",
            ),
            (
                !self.multiple && correct > 1,
                "choice.too_many_correct",
                "single-answer question has several correct options",
            ),
        ])
    }
}

impl OpenTextBody {
    fn readiness(&self) -> Vec<ReadinessIssue> {
        rules(&[
            (
                blank(&self.prompt),
                "open_text.prompt_missing",
                "prompt is empty",
            ),
            (
                self.min_words.is_some_and(|n| n < 0),
                "open_text.min_words_invalid",
                "minimum words cannot be negative",
            ),
        ])
    }
}

impl FormBody {
    fn readiness(&self) -> Vec<ReadinessIssue> {
        rules(&[
            (
                blank(&self.prompt),
                "form.prompt_missing",
                "prompt is empty",
            ),
            (
                self.fields.is_empty(),
                "form.fields_missing",
                "add at least one field",
            ),
            (
                self.fields.iter().any(|f| blank(&f.label)),
                "form.field_label_missing",
                "every field needs a label",
            ),
            (
                has_duplicates(self.fields.iter().map(|f| f.id.as_str())),
                "form.field_id_duplicate",
                "field ids must be unique",
            ),
        ])
    }
}

impl CodeBody {
    /// Legacy accepts the item title as the prompt fallback.
    fn readiness(&self, title: &str) -> Vec<ReadinessIssue> {
        rules(&[
            (
                blank(&self.prompt) && blank(title),
                "code.prompt_missing",
                "prompt is empty",
            ),
            (
                self.languages.is_empty(),
                "code.languages_missing",
                "allow at least one language",
            ),
            (
                self.tests.is_empty(),
                "code.tests_missing",
                "add at least one test",
            ),
            (
                self.tests.iter().any(|t| blank(&t.expected_output)),
                "code.test_io_missing",
                "every test needs an expected output",
            ),
            (
                self.tests.iter().any(|t| t.weight <= 0),
                "code.test_weight_invalid",
                "test weights must be positive",
            ),
        ])
    }
}

impl MatchingBody {
    fn readiness(&self) -> Vec<ReadinessIssue> {
        rules(&[
            (
                blank(&self.prompt),
                "matching.prompt_missing",
                "prompt is empty",
            ),
            (
                self.pairs.is_empty(),
                "matching.pairs_missing",
                "add at least one pair",
            ),
            (
                self.pairs.iter().any(|p| blank(&p.left) || blank(&p.right)),
                "matching.pair_value_missing",
                "every pair needs both sides",
            ),
            (
                has_duplicates(self.pairs.iter().map(|p| p.left.as_str())),
                "matching.left_duplicate",
                "left-hand values must be distinct",
            ),
            (
                has_duplicates(self.pairs.iter().map(|p| p.right.as_str())),
                "matching.right_duplicate",
                "right-hand values must be distinct",
            ),
        ])
    }
}

impl ItemBody {
    /// Structural rules refused at write time, not just at publish: the
    /// grader matches choice answers by option id (BUG-199), so an item
    /// whose options share an id can never grade right — 422
    /// `choice.option_id_duplicate` on `body.options`.
    pub fn validate(&self) -> ab_core::Result<()> {
        let fail = |field: &str, code: &str, message: &str| {
            Err(ab_core::Error::validation(vec![ab_core::FieldError {
                field: field.into(),
                code: code.into(),
                message: message.into(),
            }]))
        };
        if let Self::Choice(body) = self
            && has_duplicates(body.options.iter().map(|o| o.id.as_str()))
        {
            return fail(
                "body.options",
                "choice.option_id_duplicate",
                "option ids must be unique",
            );
        }
        // UX-143: size caps — a list of options/fields/pairs is bounded like
        // the item count; BUG-209: every free-text field like a description
        // (1.9 MB option texts sailed through on the prompt cap alone).
        let (texts, entries) = self.sized_fields();
        if let Some((field, _)) = texts
            .iter()
            .find(|(_, text)| text.chars().count() > MAX_TEXT_CHARS)
        {
            return fail(
                field,
                "too-long",
                "a text field holds at most 20000 characters",
            );
        }
        if entries > MAX_BODY_ENTRIES {
            return fail(
                "body",
                "limit-exceeded",
                "an item holds at most 200 options, fields, pairs or tests",
            );
        }
        Ok(())
    }

    /// Every free-text field with its wire path, and the size of the
    /// bounded list (options / fields / pairs / tests).
    fn sized_fields(&self) -> (Vec<(String, &str)>, usize) {
        let mut texts: Vec<(String, &str)> = Vec::new();
        let entries = match self {
            Self::Choice(b) => {
                texts.push(("body.prompt".into(), &b.prompt));
                texts.extend(
                    b.options
                        .iter()
                        .enumerate()
                        .map(|(i, o)| (format!("body.options[{i}].text"), o.text.as_str())),
                );
                texts.extend(
                    b.explanation
                        .as_deref()
                        .map(|e| ("body.explanation".into(), e)),
                );
                b.options.len()
            }
            Self::OpenText(b) => {
                texts.push(("body.prompt".into(), &b.prompt));
                texts.extend(b.rubric.as_deref().map(|r| ("body.rubric".into(), r)));
                0
            }
            Self::Form(b) => {
                texts.push(("body.prompt".into(), &b.prompt));
                texts.extend(
                    b.fields
                        .iter()
                        .enumerate()
                        .map(|(i, f)| (format!("body.fields[{i}].label"), f.label.as_str())),
                );
                b.fields.len()
            }
            Self::Code(b) => {
                texts.push(("body.prompt".into(), &b.prompt));
                texts.push(("body.input_spec".into(), &b.input_spec));
                texts.push(("body.output_spec".into(), &b.output_spec));
                texts.extend(
                    b.constraints
                        .iter()
                        .enumerate()
                        .map(|(i, c)| (format!("body.constraints[{i}]"), c.as_str())),
                );
                texts.extend(
                    b.starter_code
                        .iter()
                        .map(|(k, v)| (format!("body.starter_code.{k}"), v.as_str())),
                );
                texts.extend(
                    b.reference_solutions
                        .iter()
                        .map(|(k, v)| (format!("body.reference_solutions.{k}"), v.as_str())),
                );
                for (i, t) in b.tests.iter().enumerate() {
                    texts.push((format!("body.tests[{i}].input"), &t.input));
                    texts.push((
                        format!("body.tests[{i}].expected_output"),
                        &t.expected_output,
                    ));
                    texts.extend(
                        t.description
                            .as_deref()
                            .map(|d| (format!("body.tests[{i}].description"), d)),
                    );
                }
                b.tests.len()
            }
            Self::Matching(b) => {
                texts.push(("body.prompt".into(), &b.prompt));
                for (i, p) in b.pairs.iter().enumerate() {
                    texts.push((format!("body.pairs[{i}].left"), &p.left));
                    texts.push((format!("body.pairs[{i}].right"), &p.right));
                }
                texts.extend(
                    b.explanation
                        .as_deref()
                        .map(|e| ("body.explanation".into(), e)),
                );
                b.pairs.len()
            }
            Self::MatchingLearner(b) => {
                texts.push(("body.prompt".into(), &b.prompt));
                b.left.len().max(b.right.len())
            }
        };
        (texts, entries)
    }

    /// Per-kind readiness rules (legacy `_item_readiness_issues`). The
    /// caller adds the kind-agnostic ones (title, max score) and stamps
    /// `item_id`.
    #[must_use]
    pub fn readiness_issues(&self, title: &str) -> Vec<ReadinessIssue> {
        match self {
            Self::Choice(body) => body.readiness(),
            Self::OpenText(body) => body.readiness(),
            Self::Form(body) => body.readiness(),
            Self::Code(body) => body.readiness(title),
            Self::Matching(body) => body.readiness(),
            Self::MatchingLearner(_) => Vec::new(),
        }
    }
}

/// Legacy metadata normalization: trimmed, case-insensitively de-duplicated,
/// order preserved.
#[must_use]
pub fn normalize_tags(raw: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    raw.iter()
        .map(|t| t.trim())
        .filter(|t| !t.is_empty())
        .filter(|t| seen.insert(t.to_lowercase()))
        .map(str::to_owned)
        .collect()
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn stored_form_round_trips_with_schema_version() {
        let body = ItemBody::Choice(ChoiceBody {
            prompt: "2+2?".into(),
            options: vec![
                ChoiceOption {
                    id: "a".into(),
                    text: "4".into(),
                    is_correct: true,
                },
                ChoiceOption {
                    id: "b".into(),
                    text: "5".into(),
                    is_correct: false,
                },
            ],
            multiple: false,
            variant: Some(ChoiceVariant::SingleChoice),
            explanation: None,
        });
        let stored = body.to_stored();
        assert_eq!(stored["schema_version"], 1);
        assert_eq!(stored["kind"], "choice");
        let back = ItemBody::from_stored(&stored).unwrap();
        assert_eq!(back.kind(), ItemKind::Choice);
        assert!(back.readiness_issues("").is_empty());
    }

    #[test]
    fn legacy_sample_code_body_parses_with_defaults() {
        // Minimal legacy-shaped payload: defaults fill the rest.
        let raw = serde_json::json!({
            "kind": "code", "prompt": "sum", "languages": [71],
            "tests": [{"id": "t1", "input": "1 2", "expected_output": "3"}]
        });
        let body = ItemBody::from_stored(&raw).unwrap();
        let ItemBody::Code(code) = &body else {
            panic!("code")
        };
        assert_eq!(code.tests[0].weight, 1);
        assert!(code.tests[0].is_visible);
        assert_eq!(code.scoring_strategy, ScoringStrategy::PartialCredit);
        assert!(body.readiness_issues("").is_empty());
    }

    #[test]
    fn readiness_flags_legacy_rule_set() {
        let bad = ItemBody::Choice(ChoiceBody {
            prompt: String::new(),
            options: vec![
                ChoiceOption {
                    id: "a".into(),
                    text: "X".into(),
                    is_correct: true,
                },
                ChoiceOption {
                    id: "b".into(),
                    text: " x ".into(),
                    is_correct: true,
                },
            ],
            multiple: false,
            variant: None,
            explanation: None,
        });
        let codes: Vec<_> = bad
            .readiness_issues("")
            .into_iter()
            .map(|i| i.code)
            .collect();
        assert_eq!(
            codes,
            [
                "choice.prompt_missing",
                "choice.option_duplicate",
                "choice.too_many_correct"
            ]
        );
        // BUG-199: shared option ids are refused at write time and flagged
        // by readiness (the grader matches by id).
        let ItemBody::Choice(mut dup) = bad else {
            panic!("choice")
        };
        dup.options[1].id = "a".into();
        let dup = ItemBody::Choice(dup);
        assert!(matches!(
            dup.validate().unwrap_err(),
            ab_core::Error::Validation { field_errors }
                if field_errors[0].code == "choice.option_id_duplicate"
        ));
        assert!(
            dup.readiness_issues("")
                .iter()
                .any(|i| i.code == "choice.option_id_duplicate")
        );

        let code_titled = ItemBody::Code(CodeBody {
            prompt: String::new(),
            input_spec: String::new(),
            output_spec: String::new(),
            constraints: Vec::new(),
            languages: vec![1],
            starter_code: BTreeMap::new(),
            reference_solutions: BTreeMap::new(),
            tests: vec![CodeTestCase {
                id: "t".into(),
                input: String::new(),
                expected_output: "1".into(),
                is_visible: true,
                weight: 1,
                description: None,
                match_mode: MatchMode::Exact,
            }],
            time_limit_seconds: None,
            memory_limit_mb: None,
            max_output_kb: None,
            scoring_strategy: ScoringStrategy::PartialCredit,
        });
        assert!(
            code_titled
                .readiness_issues("Title stands in for prompt")
                .is_empty()
        );
        assert_eq!(
            code_titled.readiness_issues("")[0].code,
            "code.prompt_missing"
        );
    }

    #[test]
    fn learner_matching_body_hides_the_pairing_and_shuffles_stably() {
        let pairs: Vec<MatchingPair> = ["1", "2", "3", "4", "5", "6"]
            .iter()
            .map(|n| MatchingPair {
                left: (*n).to_owned(),
                right: format!("r{n}"),
            })
            .collect();
        let body = ItemBody::Matching(MatchingBody {
            prompt: "match".into(),
            pairs,
            explanation: Some("key".into()),
        });
        let mut first = body.clone();
        first.redact_for_learner(7, false);
        let mut again = body.clone();
        again.redact_for_learner(7, false);
        let mut other = body;
        other.redact_for_learner(8, false);
        let ItemBody::MatchingLearner(learner) = &first else {
            panic!("learner shape")
        };
        assert_eq!(first.kind(), ItemKind::Matching);
        let wire = serde_json::to_value(&first).unwrap();
        assert_eq!(wire["kind"], "matching");
        assert!(wire.get("pairs").is_none() && wire.get("explanation").is_none());
        assert_eq!(
            learner
                .left
                .iter()
                .map(|o| o.id.as_str())
                .collect::<Vec<_>>(),
            ["1", "2", "3", "4", "5", "6"]
        );
        let mut rights: Vec<&str> = learner.right.iter().map(|o| o.id.as_str()).collect();
        assert_ne!(
            rights,
            ["r1", "r2", "r3", "r4", "r5", "r6"],
            "right column is shuffled"
        );
        rights.sort_unstable();
        assert_eq!(rights, ["r1", "r2", "r3", "r4", "r5", "r6"]);
        assert_eq!(
            serde_json::to_value(&again).unwrap(),
            wire,
            "same seed, same order"
        );
        assert_ne!(serde_json::to_value(&other).unwrap(), wire);
    }

    #[test]
    fn tags_normalize_like_legacy() {
        let tags = normalize_tags(&[" Rust ".into(), "rust".into(), String::new(), "Go".into()]);
        assert_eq!(tags, ["Rust", "Go"]);
    }
}
