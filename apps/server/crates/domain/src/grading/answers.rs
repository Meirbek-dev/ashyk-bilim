//! Learner answers: one canonical shape `{"<item_id>": ItemAnswer}` for
//! every assessment kind (the legacy stored code challenges as a list).
//!
//! Validation ports `pipeline/validate.py`: unknown items and kind
//! mismatches are rejected together, missing items are filled with empty
//! typed answers, open text is capped, and every string is trimmed (the
//! legacy did that globally at parse time — it is load-bearing for the
//! blank-source short-circuit).

use std::collections::BTreeMap;

use ab_core::assessments::ItemKind;
use ab_core::id::AssessmentItemId;
use ab_core::{Error, FieldError, Result};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Legacy `OPEN_TEXT_MAX_CHARS`.
pub const OPEN_TEXT_MAX_CHARS: usize = 50_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct MatchingAnswer {
    pub left: String,
    pub right: String,
}

/// Internally tagged on `kind`, mirroring the item body kinds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ItemAnswer {
    Choice {
        #[serde(default)]
        selected: Vec<String>,
    },
    OpenText {
        #[serde(default)]
        text: String,
    },
    Form {
        #[serde(default)]
        values: BTreeMap<String, String>,
    },
    Code {
        /// Judge0 language id.
        language: i32,
        #[serde(default)]
        source: String,
    },
    Matching {
        #[serde(default)]
        matches: Vec<MatchingAnswer>,
    },
}

impl ItemAnswer {
    #[must_use]
    pub const fn kind(&self) -> ItemKind {
        match self {
            Self::Choice { .. } => ItemKind::Choice,
            Self::OpenText { .. } => ItemKind::OpenText,
            Self::Form { .. } => ItemKind::Form,
            Self::Code { .. } => ItemKind::Code,
            Self::Matching { .. } => ItemKind::Matching,
        }
    }

    /// The empty answer the legacy auto-filled for unanswered items.
    #[must_use]
    pub const fn empty(kind: ItemKind) -> Self {
        match kind {
            ItemKind::Choice => Self::Choice {
                selected: Vec::new(),
            },
            ItemKind::OpenText => Self::OpenText {
                text: String::new(),
            },
            ItemKind::Form => Self::Form {
                values: BTreeMap::new(),
            },
            ItemKind::Code => Self::Code {
                language: 0,
                source: String::new(),
            },
            ItemKind::Matching => Self::Matching {
                matches: Vec::new(),
            },
        }
    }

    /// Legacy global `str_strip_whitespace`.
    fn trimmed(self) -> Self {
        match self {
            Self::Choice { selected } => Self::Choice {
                selected: selected.into_iter().map(|s| s.trim().to_owned()).collect(),
            },
            Self::OpenText { text } => Self::OpenText {
                text: text.trim().to_owned(),
            },
            Self::Form { values } => Self::Form {
                values: values
                    .into_iter()
                    .map(|(k, v)| (k.trim().to_owned(), v.trim().to_owned()))
                    .collect(),
            },
            Self::Code { language, source } => Self::Code {
                language,
                source: source.trim().to_owned(),
            },
            Self::Matching { matches } => Self::Matching {
                matches: matches
                    .into_iter()
                    .map(|m| MatchingAnswer {
                        left: m.left.trim().to_owned(),
                        right: m.right.trim().to_owned(),
                    })
                    .collect(),
            },
        }
    }

    /// Nothing was entered.
    #[must_use]
    pub fn is_blank(&self) -> bool {
        match self {
            Self::Choice { selected } => selected.is_empty(),
            Self::OpenText { text } => text.is_empty(),
            Self::Form { values } => values.values().all(String::is_empty),
            Self::Code { source, .. } => source.is_empty(),
            Self::Matching { matches } => matches.is_empty(),
        }
    }
}

pub type Answers = BTreeMap<AssessmentItemId, ItemAnswer>;

/// Parse the stored / submitted map.
pub fn parse_answers(value: &serde_json::Value) -> Result<Answers> {
    if value.is_null() || value.as_object().is_some_and(serde_json::Map::is_empty) {
        return Ok(Answers::new());
    }
    serde_json::from_value(value.clone()).map_err(|err| {
        Error::validation(vec![FieldError {
            field: "answers".into(),
            code: "invalid".into(),
            message: err.to_string(),
        }])
    })
}

#[must_use]
pub fn answers_to_value(answers: &Answers) -> serde_json::Value {
    serde_json::to_value(answers).unwrap_or_default()
}

/// One item's kind, for validation.
pub struct ItemShape {
    pub id: AssessmentItemId,
    pub kind: ItemKind,
}

/// Merge a patch over the current answers and validate against the items.
///
/// Unknown ids and kind mismatches are collected and refused together;
/// missing items are auto-filled; open text is capped; strings trimmed.
pub fn canonicalize(current: &Answers, patch: Answers, items: &[ItemShape]) -> Result<Answers> {
    let mut errors = Vec::new();
    let mut merged = current.clone();
    for (item_id, answer) in patch {
        match items.iter().find(|i| i.id == item_id) {
            None => errors.push(FieldError {
                field: item_id.to_string(),
                code: "unknown-item".into(),
                message: "not an item of this assessment".into(),
            }),
            Some(item) if item.kind != answer.kind() => errors.push(FieldError {
                field: item_id.to_string(),
                code: "kind-mismatch".into(),
                message: format!("expected a {} answer, got {}", item.kind, answer.kind()),
            }),
            Some(_) => {
                merged.insert(item_id, answer.trimmed());
            }
        }
    }
    for item in items {
        merged
            .entry(item.id)
            .or_insert_with(|| ItemAnswer::empty(item.kind));
    }
    for (item_id, answer) in &merged {
        if let ItemAnswer::OpenText { text } = answer
            && text.chars().count() > OPEN_TEXT_MAX_CHARS
        {
            errors.push(FieldError {
                field: item_id.to_string(),
                code: "too-long".into(),
                message: format!("open text is capped at {OPEN_TEXT_MAX_CHARS} characters"),
            });
        }
    }
    // Answers for items that no longer exist are dropped silently (the
    // legacy kept them; they were unreachable anyway).
    merged.retain(|id, _| items.iter().any(|i| i.id == *id));
    if errors.is_empty() {
        Ok(merged)
    } else {
        Err(Error::validation(errors))
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    fn shapes() -> (AssessmentItemId, AssessmentItemId, Vec<ItemShape>) {
        let a = AssessmentItemId::new();
        let b = AssessmentItemId::new();
        (
            a,
            b,
            vec![
                ItemShape {
                    id: a,
                    kind: ItemKind::Choice,
                },
                ItemShape {
                    id: b,
                    kind: ItemKind::OpenText,
                },
            ],
        )
    }

    #[test]
    fn merges_fills_and_trims() {
        let (a, b, items) = shapes();
        let mut patch = Answers::new();
        patch.insert(
            a,
            ItemAnswer::Choice {
                selected: vec![" x ".into()],
            },
        );
        let merged = canonicalize(&Answers::new(), patch, &items).unwrap();
        assert_eq!(
            merged[&a],
            ItemAnswer::Choice {
                selected: vec!["x".into()]
            }
        );
        assert_eq!(
            merged[&b],
            ItemAnswer::OpenText {
                text: String::new()
            }
        );
        // Round trip through the stored shape.
        let value = answers_to_value(&merged);
        assert_eq!(parse_answers(&value).unwrap(), merged);
    }

    #[test]
    fn unknown_and_mismatched_are_reported_together() {
        let (a, _, items) = shapes();
        let mut patch = Answers::new();
        patch.insert(
            a,
            ItemAnswer::OpenText {
                text: "wrong kind".into(),
            },
        );
        patch.insert(
            AssessmentItemId::new(),
            ItemAnswer::Choice {
                selected: Vec::new(),
            },
        );
        let err = canonicalize(&Answers::new(), patch, &items).unwrap_err();
        let ab_core::Error::Validation { field_errors } = err else {
            panic!("expected validation error");
        };
        let codes: Vec<_> = field_errors.iter().map(|e| e.code.as_str()).collect();
        assert!(codes.contains(&"kind-mismatch") && codes.contains(&"unknown-item"));
    }

    #[test]
    fn open_text_is_capped() {
        let (_, b, items) = shapes();
        let mut patch = Answers::new();
        patch.insert(
            b,
            ItemAnswer::OpenText {
                text: "x".repeat(OPEN_TEXT_MAX_CHARS + 1),
            },
        );
        assert!(canonicalize(&Answers::new(), patch, &items).is_err());
    }
}
