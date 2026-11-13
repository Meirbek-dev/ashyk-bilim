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
/// A code item's limits within what a run can spend: every test of a run
/// shares the runner's 25 s budget (`AB__RUNNER__MAX_WAIT_SECS`), and the
/// runner host sizes its memory for 2 GB programs.
pub const MAX_CODE_TIME_SECONDS: i32 = 15;
pub const MAX_CODE_MEMORY_MB: i32 = 2048;
/// Pictures on one prompt (DOT allows several in the question cell).
pub const MAX_PROMPT_MEDIA: usize = 5;

/// How a prompt is written. Imported spreadsheet text is `plain`: shown as
/// typed (line breaks kept, nothing interpreted), because `List<String>`,
/// `*` or four-space indents would change meaning as Markdown.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum TextFormat {
    #[default]
    Markdown,
    Plain,
}

impl TextFormat {
    #[allow(
        clippy::trivially_copy_pass_by_ref,
        reason = "serde skip_serializing_if"
    )]
    fn is_markdown(&self) -> bool {
        *self == Self::Markdown
    }
}

/// A picture in an item body: an `assessment-image` upload, served to
/// whoever may read the item by `GET /assessment-media/{upload_id}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct MediaRef {
    pub upload_id: uuid::Uuid,
    pub width: u32,
    pub height: u32,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    #[schema(max_length = 500)]
    pub alt: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct ChoiceOption {
    pub id: String,
    #[serde(default)]
    #[schema(max_length = 20_000)]
    pub text: String,
    #[serde(default)]
    pub is_correct: bool,
    /// A picture shown with (or instead of) the text; absent: none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub media: Option<MediaRef>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ChoiceVariant {
    SingleChoice,
    MultipleChoice,
    TrueFalse,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct ChoiceBody {
    #[serde(default)]
    #[schema(max_length = 20_000)]
    pub prompt: String,
    #[serde(default)]
    #[schema(max_items = 200)]
    pub options: Vec<ChoiceOption>,
    #[serde(default)]
    pub multiple: bool,
    #[serde(default)]
    pub variant: Option<ChoiceVariant>,
    #[serde(default)]
    #[schema(max_length = 20_000)]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "TextFormat::is_markdown")]
    pub prompt_format: TextFormat,
    /// Pictures under the prompt, in order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schema(max_items = 5)]
    pub media: Vec<MediaRef>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct OpenTextBody {
    #[serde(default)]
    #[schema(max_length = 20_000)]
    pub prompt: String,
    #[serde(default)]
    pub min_words: Option<i32>,
    #[serde(default)]
    #[schema(max_length = 20_000)]
    pub rubric: Option<String>,
    #[serde(default, skip_serializing_if = "TextFormat::is_markdown")]
    pub prompt_format: TextFormat,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schema(max_items = 5)]
    pub media: Vec<MediaRef>,
    /// A short answer graded automatically against `accepted_answers`
    /// (DOT type 3) instead of by a teacher; the learner gets one line.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub short_answer: bool,
    /// Short answer: any of these (trimmed, inner whitespace collapsed,
    /// numbers compared as numbers) scores full points. Never sent to learners.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schema(max_items = 200)]
    pub accepted_answers: Vec<String>,
    /// Short answer: letter case matters (DOT compares case-sensitively).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub case_sensitive: bool,
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
    #[schema(max_length = 20_000)]
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
    #[schema(max_length = 20_000)]
    pub prompt: String,
    #[serde(default)]
    #[schema(max_items = 200)]
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
    #[schema(max_length = 20_000)]
    pub input: String,
    #[serde(default)]
    #[schema(max_length = 20_000)]
    pub expected_output: String,
    #[serde(default = "CodeTestCase::default_visible")]
    pub is_visible: bool,
    #[serde(default = "CodeTestCase::default_weight")]
    pub weight: i32,
    #[serde(default)]
    #[schema(max_length = 20_000)]
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
    #[schema(max_length = 20_000)]
    pub prompt: String,
    #[serde(default)]
    #[schema(max_length = 20_000)]
    pub input_spec: String,
    #[serde(default)]
    #[schema(max_length = 20_000)]
    pub output_spec: String,
    #[serde(default)]
    pub constraints: Vec<String>,
    /// Language ids (`GET /code/runner`).
    #[serde(default)]
    pub languages: Vec<i32>,
    /// Keyed by language id as a string (legacy shape).
    #[serde(default)]
    pub starter_code: BTreeMap<String, String>,
    #[serde(default)]
    pub reference_solutions: BTreeMap<String, String>,
    #[serde(default)]
    #[schema(max_items = 200)]
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
    #[schema(max_length = 20_000)]
    pub left: String,
    /// The right-hand value this left one goes with; `null`: it goes with
    /// none (the learner must leave it unplaced, DOT `k-0`). Several left
    /// values may share one right value.
    #[schema(max_length = 20_000)]
    pub right: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct MatchingBody {
    #[serde(default)]
    #[schema(max_length = 20_000)]
    pub prompt: String,
    /// Required on the wire so a client's untagged union can tell this
    /// author shape from [`MatchingLearnerBody`] (`left`/`right`, no pairs).
    #[serde(default)]
    #[schema(required)]
    #[schema(max_items = 200)]
    pub pairs: Vec<MatchingPair>,
    #[serde(default)]
    #[schema(max_length = 20_000)]
    pub explanation: Option<String>,
    /// Right-hand values no left one goes with (shown among the others).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schema(max_items = 200)]
    pub distractors: Vec<String>,
    #[serde(default, skip_serializing_if = "TextFormat::is_markdown")]
    pub prompt_format: TextFormat,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schema(max_items = 5)]
    pub media: Vec<MediaRef>,
}

impl MatchingBody {
    /// The right column: each paired value once (first-use order), then
    /// the distractors.
    #[must_use]
    pub fn right_values(&self) -> Vec<&str> {
        let mut out: Vec<&str> = Vec::new();
        for value in self
            .pairs
            .iter()
            .filter_map(|p| p.right.as_deref())
            .chain(self.distractors.iter().map(String::as_str))
        {
            if !out.contains(&value) {
                out.push(value);
            }
        }
        out
    }
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
    #[serde(default, skip_serializing_if = "TextFormat::is_markdown")]
    pub prompt_format: TextFormat,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub media: Vec<MediaRef>,
}

/// Internally tagged on `kind` - the wire and storage shape.
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
            Self::OpenText(body) => {
                body.rubric = None;
                body.accepted_answers.clear();
                body.case_sensitive = false;
            }
            Self::Code(body) => {
                body.reference_solutions.clear();
                body.tests.retain(|test| test.is_visible);
            }
            Self::Matching(body) => {
                let option = |text: &str| MatchingOption {
                    id: text.to_owned(),
                    text: text.to_owned(),
                };
                let paired: Vec<&str> = body.right_values();
                let mut right: Vec<MatchingOption> = paired.iter().map(|t| option(t)).collect();
                shuffle(&mut right, seed);
                // The pairing order would hand over the answer (half the seeds of a two-pair
                // item land on it): shift it by one, still the same order for the same seed.
                if right.len() > 1 && right.iter().zip(&paired).all(|(o, p)| o.text == *p) {
                    right.rotate_left(1);
                }
                *self = Self::MatchingLearner(MatchingLearnerBody {
                    prompt: std::mem::take(&mut body.prompt),
                    left: body.pairs.iter().map(|p| option(&p.left)).collect(),
                    right,
                    prompt_format: body.prompt_format,
                    media: std::mem::take(&mut body.media),
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

    /// Parse the storage form (unknown `schema_version`s parse as v1 - the
    /// only version so far; a future bump adds an upgrade step here).
    pub fn from_stored(value: &serde_json::Value) -> Result<Self, serde_json::Error> {
        serde_json::from_value(value.clone())
    }

    /// OPEN-B-2: the body with its wording blanked - what grading and the
    /// learner's answers depend on. Two bodies with equal keys differ only in
    /// wording (prompt, option and field labels, explanation, rubric, code
    /// statement and test descriptions), which an answered assessment takes.
    /// Answer keys, option ids, matching pairs, tests, languages, starter
    /// code and limits are the key.
    #[must_use]
    pub fn answer_key(&self) -> serde_json::Value {
        let mut key = self.clone();
        match &mut key {
            Self::Choice(b) => {
                b.prompt.clear();
                b.explanation = None;
                b.media.clear();
                b.options.iter_mut().for_each(|o| {
                    o.text.clear();
                    o.media = None;
                });
            }
            Self::OpenText(b) => {
                b.prompt.clear();
                b.rubric = None;
                b.media.clear();
            }
            Self::Form(b) => {
                b.prompt.clear();
                b.fields.iter_mut().for_each(|f| f.label.clear());
            }
            Self::Code(b) => {
                b.prompt.clear();
                b.input_spec.clear();
                b.output_spec.clear();
                b.constraints.clear();
                b.tests.iter_mut().for_each(|t| t.description = None);
            }
            Self::Matching(b) => {
                b.prompt.clear();
                b.explanation = None;
                b.media.clear();
            }
            Self::MatchingLearner(b) => {
                b.prompt.clear();
                b.media.clear();
            }
        }
        key.to_stored()
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

/// [`ReadinessIssue::severity`] values (schema only).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ReadinessSeverity {
    Blocker,
    Warning,
    Advice,
}

/// [`ReadinessIssue::area`] values (schema only).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ReadinessArea {
    Details,
    Questions,
    Policy,
    Audience,
    Publish,
}

/// [`ReadinessIssue::code`] values (schema only; `readiness_codes_pinned`
/// keeps the list in step with the rules).
#[derive(Serialize, ToSchema)]
pub enum ReadinessIssueCode {
    #[serde(rename = "assessment.title_missing")]
    AssessmentTitleMissing,
    #[serde(rename = "assessment.empty")]
    AssessmentEmpty,
    #[serde(rename = "schedule.after_due_at")]
    ScheduleAfterDueAt,
    #[serde(rename = "policy.due_at_past")]
    PolicyDueAtPast,
    #[serde(rename = "policy.cutoff_before_due")]
    PolicyCutoffBeforeDue,
    #[serde(rename = "policy.penalty_without_late")]
    PolicyPenaltyWithoutLate,
    #[serde(rename = "policy.draw_exceeds_items")]
    PolicyDrawExceedsItems,
    #[serde(rename = "policy.draw_group_short")]
    PolicyDrawGroupShort,
    #[serde(rename = "item.kind_forbidden")]
    ItemKindForbidden,
    #[serde(rename = "item.title_missing")]
    ItemTitleMissing,
    #[serde(rename = "item.max_score_invalid")]
    ItemMaxScoreInvalid,
    #[serde(rename = "choice.correct_missing")]
    ChoiceCorrectMissing,
    #[serde(rename = "choice.option_duplicate")]
    ChoiceOptionDuplicate,
    #[serde(rename = "choice.option_id_duplicate")]
    ChoiceOptionIdDuplicate,
    #[serde(rename = "choice.option_text_missing")]
    ChoiceOptionTextMissing,
    #[serde(rename = "choice.options_missing")]
    ChoiceOptionsMissing,
    #[serde(rename = "choice.prompt_missing")]
    ChoicePromptMissing,
    #[serde(rename = "choice.too_many_correct")]
    ChoiceTooManyCorrect,
    #[serde(rename = "code.languages_missing")]
    CodeLanguagesMissing,
    #[serde(rename = "code.prompt_missing")]
    CodePromptMissing,
    #[serde(rename = "code.test_io_missing")]
    CodeTestIoMissing,
    #[serde(rename = "code.test_weight_invalid")]
    CodeTestWeightInvalid,
    #[serde(rename = "code.tests_missing")]
    CodeTestsMissing,
    #[serde(rename = "form.field_id_duplicate")]
    FormFieldIdDuplicate,
    #[serde(rename = "form.field_label_missing")]
    FormFieldLabelMissing,
    #[serde(rename = "form.fields_missing")]
    FormFieldsMissing,
    #[serde(rename = "form.prompt_missing")]
    FormPromptMissing,
    #[serde(rename = "matching.left_duplicate")]
    MatchingLeftDuplicate,
    #[serde(rename = "matching.pair_value_missing")]
    MatchingPairValueMissing,
    #[serde(rename = "matching.pairs_missing")]
    MatchingPairsMissing,
    #[serde(rename = "matching.prompt_missing")]
    MatchingPromptMissing,
    #[serde(rename = "matching.right_duplicate")]
    MatchingRightDuplicate,
    #[serde(rename = "open_text.accepted_missing")]
    OpenTextAcceptedMissing,
    #[serde(rename = "open_text.min_words_invalid")]
    OpenTextMinWordsInvalid,
    #[serde(rename = "open_text.prompt_missing")]
    OpenTextPromptMissing,
}

/// One thing blocking (or advising against) publication.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct ReadinessIssue {
    /// Stable machine key, e.g. `choice.options_missing`.
    #[schema(value_type = ReadinessIssueCode)]
    pub code: String,
    pub message: String,
    /// Every current rule is a blocker.
    #[schema(value_type = ReadinessSeverity)]
    pub severity: &'static str,
    #[schema(value_type = ReadinessArea)]
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

/// Case-insensitive duplicate detector (ids).
fn has_duplicates<'a>(values: impl Iterator<Item = &'a str>) -> bool {
    let mut seen = HashSet::new();
    for value in values {
        if !seen.insert(value.trim().to_lowercase()) {
            return true;
        }
    }
    false
}

/// Duplicate texts: exact after trimming. Case matters - `person.age` and
/// `Person.age` are different answers in a Java question. Blank values
/// (picture-only options) are left to the blank rules.
fn has_text_duplicates<'a>(values: impl Iterator<Item = &'a str>) -> bool {
    let mut seen = HashSet::new();
    values
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .any(|v| !seen.insert(v))
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
                blank(&self.prompt) && self.media.is_empty(),
                "choice.prompt_missing",
                "prompt is empty",
            ),
            (
                self.options.len() < 2,
                "choice.options_missing",
                "at least two options are required",
            ),
            (
                self.options
                    .iter()
                    .any(|o| blank(&o.text) && o.media.is_none()),
                "choice.option_text_missing",
                "every option needs text or a picture",
            ),
            (
                has_text_duplicates(self.options.iter().map(|o| o.text.as_str())),
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
                blank(&self.prompt) && self.media.is_empty(),
                "open_text.prompt_missing",
                "prompt is empty",
            ),
            (
                self.min_words.is_some_and(|n| n < 0),
                "open_text.min_words_invalid",
                "minimum words cannot be negative",
            ),
            (
                self.short_answer && self.accepted_answers.iter().all(|a| blank(a)),
                "open_text.accepted_missing",
                "a short answer needs at least one accepted answer",
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
                blank(&self.prompt) && self.media.is_empty(),
                "matching.prompt_missing",
                "prompt is empty",
            ),
            (
                !self.pairs.iter().any(|p| p.right.is_some()),
                "matching.pairs_missing",
                "add at least one pair",
            ),
            (
                self.pairs
                    .iter()
                    .any(|p| blank(&p.left) || p.right.as_deref().is_some_and(blank))
                    || self.distractors.iter().any(|d| blank(d)),
                "matching.pair_value_missing",
                "every pair needs both sides",
            ),
            (
                has_text_duplicates(self.pairs.iter().map(|p| p.left.as_str())),
                "matching.left_duplicate",
                "left-hand values must be distinct",
            ),
            (
                {
                    // Several left values may share a right one; a wrong answer may
                    // repeat neither a paired value nor another wrong answer.
                    let mut paired: Vec<&str> = self
                        .pairs
                        .iter()
                        .filter_map(|p| p.right.as_deref())
                        .collect();
                    paired.sort_unstable();
                    paired.dedup();
                    has_text_duplicates(
                        paired
                            .into_iter()
                            .chain(self.distractors.iter().map(String::as_str)),
                    )
                },
                "matching.right_duplicate",
                "a wrong answer repeats a right-hand value",
            ),
        ])
    }
}

impl ItemBody {
    /// Structural rules refused at write time, not just at publish: the
    /// grader matches choice answers by option id (BUG-199), so an item
    /// whose options share an id can never grade right - 422
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
        // UX-143: size caps - a list of options/fields/pairs is bounded like
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
        let (media, option_media) = self.media();
        if media.len() > MAX_PROMPT_MEDIA {
            return fail(
                "body.media",
                "limit-exceeded",
                "a prompt holds at most 5 pictures",
            );
        }
        if media
            .iter()
            .chain(option_media.iter().copied())
            .any(|m| m.alt.chars().count() > 500 || m.width == 0 || m.height == 0)
        {
            return fail(
                "body.media",
                "invalid",
                "a picture needs its size and at most 500 characters of description",
            );
        }
        if entries > MAX_BODY_ENTRIES {
            return fail(
                "body",
                "limit-exceeded",
                "an item holds at most 200 options, fields, pairs or tests",
            );
        }
        if let Self::Code(body) = self {
            if body
                .time_limit_seconds
                .is_some_and(|t| !(1..=MAX_CODE_TIME_SECONDS).contains(&t))
            {
                return fail(
                    "body.time_limit_seconds",
                    "out-of-range",
                    "the time limit is 1 to 15 seconds",
                );
            }
            if body
                .memory_limit_mb
                .is_some_and(|mb| !(1..=MAX_CODE_MEMORY_MB).contains(&mb))
            {
                return fail(
                    "body.memory_limit_mb",
                    "out-of-range",
                    "the memory limit is 1 to 2048 MB",
                );
            }
        }
        Ok(())
    }

    /// The prompt pictures and the option pictures of a body.
    fn media(&self) -> (&[MediaRef], Vec<&MediaRef>) {
        match self {
            Self::Choice(b) => (
                &b.media,
                b.options.iter().filter_map(|o| o.media.as_ref()).collect(),
            ),
            Self::OpenText(b) => (&b.media, Vec::new()),
            Self::Matching(b) => (&b.media, Vec::new()),
            Self::MatchingLearner(b) => (&b.media, Vec::new()),
            Self::Form(_) | Self::Code(_) => (&[], Vec::new()),
        }
    }

    /// Every upload an item body names (prompt and option pictures).
    #[must_use]
    pub fn upload_ids(&self) -> Vec<uuid::Uuid> {
        let (media, option_media) = self.media();
        let mut ids: Vec<uuid::Uuid> = media
            .iter()
            .chain(option_media)
            .map(|m| m.upload_id)
            .collect();
        ids.sort_unstable();
        ids.dedup();
        ids
    }

    /// Every free-text field with its wire path, and the size of the
    /// bounded list (options / fields / pairs / tests).
    #[allow(clippy::too_many_lines, reason = "one match over the item kinds")]
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
                texts.extend(
                    b.accepted_answers
                        .iter()
                        .enumerate()
                        .map(|(i, a)| (format!("body.accepted_answers[{i}]"), a.as_str())),
                );
                b.accepted_answers.len()
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
                    texts.extend(
                        p.right
                            .as_deref()
                            .map(|r| (format!("body.pairs[{i}].right"), r)),
                    );
                }
                texts.extend(
                    b.distractors
                        .iter()
                        .enumerate()
                        .map(|(i, d)| (format!("body.distractors[{i}]"), d.as_str())),
                );
                texts.extend(
                    b.explanation
                        .as_deref()
                        .map(|e| ("body.explanation".into(), e)),
                );
                b.pairs.len() + b.distractors.len()
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

    /// Every readiness code a rule emits (`"area.rule"` literals in the
    /// rule sources) is in the schema enum, and nothing else.
    #[test]
    fn readiness_codes_pinned() {
        let pattern = regex::Regex::new(
            r#""((?:assessment|schedule|policy|item|choice|open_text|form|code|matching)\.[a-z_]+)""#,
        )
        .unwrap();
        let sources = [include_str!("items.rs"), include_str!("service.rs")];
        let mut emitted: Vec<String> = sources
            .iter()
            .flat_map(|src| {
                let rules = src.split("#[cfg(test)]").next().unwrap_or_default();
                pattern
                    .captures_iter(rules)
                    .map(|c| c[1].to_owned())
                    .collect::<Vec<_>>()
            })
            .collect();
        emitted.sort();
        emitted.dedup();
        let schema =
            serde_json::to_value(<ReadinessIssueCode as utoipa::PartialSchema>::schema()).unwrap();
        let mut declared: Vec<String> = schema["enum"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_owned())
            .collect();
        declared.sort();
        assert_eq!(emitted, declared);
    }
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
                    ..Default::default()
                },
                ChoiceOption {
                    id: "b".into(),
                    text: "5".into(),
                    is_correct: false,
                    ..Default::default()
                },
            ],
            multiple: false,
            variant: Some(ChoiceVariant::SingleChoice),
            explanation: None,
            ..Default::default()
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
                    ..Default::default()
                },
                ChoiceOption {
                    id: "b".into(),
                    text: " X ".into(),
                    is_correct: true,
                    ..Default::default()
                },
            ],
            multiple: false,
            variant: None,
            explanation: None,
            ..Default::default()
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
        // Limits the sandbox refuses are refused at write time.
        let ItemBody::Code(mut slow) = code_titled else {
            panic!("code")
        };
        assert!(ItemBody::Code(slow.clone()).validate().is_ok());
        slow.time_limit_seconds = Some(9999);
        let refused = ItemBody::Code(slow.clone()).validate().unwrap_err();
        assert!(matches!(
            refused,
            ab_core::Error::Validation { field_errors }
                if field_errors[0].field == "body.time_limit_seconds"
        ));
        slow.time_limit_seconds = Some(15);
        slow.memory_limit_mb = Some(99_999);
        assert!(ItemBody::Code(slow).validate().is_err());
    }

    #[test]
    fn learner_matching_body_never_shows_the_pairing_order() {
        let pairs = || {
            ["a", "b"]
                .iter()
                .map(|n| MatchingPair {
                    left: (*n).to_owned(),
                    right: Some(format!("r{n}")),
                })
                .collect::<Vec<_>>()
        };
        for seed in 0..64 {
            let mut body = ItemBody::Matching(MatchingBody {
                prompt: String::new(),
                pairs: pairs(),
                explanation: None,
                ..Default::default()
            });
            body.redact_for_learner(seed, false);
            let ItemBody::MatchingLearner(learner) = body else {
                panic!("learner shape")
            };
            let rights: Vec<&str> = learner.right.iter().map(|o| o.id.as_str()).collect();
            assert_eq!(rights, ["rb", "ra"], "seed {seed}");
        }
    }

    #[test]
    fn learner_matching_body_hides_the_pairing_and_shuffles_stably() {
        let pairs: Vec<MatchingPair> = ["1", "2", "3", "4", "5", "6"]
            .iter()
            .map(|n| MatchingPair {
                left: (*n).to_owned(),
                right: Some(format!("r{n}")),
            })
            .collect();
        let body = ItemBody::Matching(MatchingBody {
            prompt: "match".into(),
            pairs,
            explanation: Some("key".into()),
            ..Default::default()
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

    /// OPEN-B-2: wording moves leave the key; a correct mark, an option or
    /// a pair does not.
    #[test]
    fn answer_key_ignores_wording_only() {
        let choice = |prompt: &str, text: &str, correct: bool| {
            ItemBody::Choice(ChoiceBody {
                prompt: prompt.into(),
                options: vec![ChoiceOption {
                    id: "a".into(),
                    text: text.into(),
                    is_correct: correct,
                    ..Default::default()
                }],
                multiple: false,
                variant: None,
                explanation: None,
                ..Default::default()
            })
        };
        let base = choice("Captial?", "Pariss", true).answer_key();
        assert_eq!(choice("Capital?", "Paris", true).answer_key(), base);
        assert_ne!(choice("Captial?", "Pariss", false).answer_key(), base);
        let matching = |right: &str| {
            ItemBody::Matching(MatchingBody {
                prompt: "p".into(),
                pairs: vec![MatchingPair {
                    left: "l".into(),
                    right: Some(right.into()),
                }],
                explanation: None,
                ..Default::default()
            })
            .answer_key()
        };
        assert_ne!(matching("a"), matching("b"));
        let code = |prompt: &str, expected: &str| {
            let ItemBody::Code(mut body) = ItemBody::default_code() else {
                panic!("code")
            };
            body.prompt = prompt.into();
            body.tests.push(CodeTestCase {
                id: "t".into(),
                input: "1".into(),
                expected_output: expected.into(),
                is_visible: true,
                weight: 1,
                description: Some(prompt.into()),
                match_mode: MatchMode::Exact,
            });
            ItemBody::Code(body).answer_key()
        };
        assert_eq!(code("Sum", "2"), code("Sum two numbers", "2"));
        assert_ne!(code("Sum", "2"), code("Sum", "3"));
    }

    #[test]
    fn tags_normalize_like_legacy() {
        let tags = normalize_tags(&[" Rust ".into(), "rust".into(), String::new(), "Go".into()]);
        assert_eq!(tags, ["Rust", "Go"]);
    }
}
