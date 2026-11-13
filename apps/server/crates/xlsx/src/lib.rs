//! The DOT test spreadsheet format (`docs/XLSX-TEST-IMPORT.md` section 4):
//! read an `.xlsx` into a [`DotTest`] with located [`Issue`]s, and write a
//! [`DotTest`] back. Pure: no database, no storage, no Ashyq model - the
//! domain maps [`DotTest`] to item bodies and back.
//!
//! Every limit and message code of the spec's sections 4 and 10 lives here,
//! except the two that depend on Ashyq policy (`attempts_capped`,
//! `manual_grading`), which the domain adds.

mod read;
mod template;
mod write;

pub use read::parse;
pub use template::{template, template_test};
pub use write::{Skipped, WriteError, write, write_template};

use serde::Serialize;

/// Read-time knobs.
#[derive(Debug, Clone, Copy)]
pub struct ParseOptions {
    /// DOT mode: the two characters `\n` in a cell become a line break
    /// (spec 4.4 item 4). `false` keeps them.
    pub unescape_newlines: bool,
    /// Question rows allowed (`MAX_BANK_ITEMS`); more is `too_many_questions`.
    pub max_questions: usize,
}

impl Default for ParseOptions {
    fn default() -> Self {
        Self {
            unescape_newlines: true,
            max_questions: 1000,
        }
    }
}

/// What [`parse`] found.
///
/// `test` is `None` when the file could not be read
/// at all (an `error` issue says why); otherwise it holds every question
/// that parsed, and `issues` lists the rest. The import may be committed
/// only when no issue has [`Severity::Error`].
#[derive(Debug, Clone)]
pub struct Parsed {
    pub test: Option<DotTest>,
    /// Name of the sheet that was read (the active one).
    pub sheet: String,
    /// At most 100 issues, errors first, then warnings, then infos, each
    /// group in row/column order.
    pub issues: Vec<Issue>,
    /// Issues dropped past the 100 cap.
    pub truncated: usize,
}

impl Parsed {
    #[must_use]
    pub fn has_errors(&self) -> bool {
        self.test.is_none() || self.issues.iter().any(|i| i.severity == Severity::Error)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DotTest {
    /// A1, trimmed.
    pub title: String,
    /// C1: 0 = unlimited.
    pub attempts: u32,
    /// D1, minutes: 0 = no limit.
    pub time_minutes: u32,
    /// E1: questions drawn per attempt; 0 = all.
    pub limit: u32,
    /// F1 = 1.
    pub leveling: bool,
    pub questions: Vec<DotQuestion>,
    /// Every distinct picture (by SHA-256), referenced by index.
    pub images: Vec<Image>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DotQuestion {
    /// 1-based sheet row (for messages and `source_row`).
    pub row: u32,
    /// Column A after normalisation (may be empty when `images` is not).
    pub text: String,
    /// Indexes into [`DotTest::images`], in anchor order (at most 5).
    pub images: Vec<usize>,
    /// D (E for matching): 0 when leveling is off or the cell is blank.
    /// Otherwise one of 1, 2, 3, 101, 102, 201, 202.
    pub level: u32,
    pub kind: DotKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DotKind {
    /// Type 1. `correct` is a 0-based index into `options`.
    Single {
        options: Vec<DotOption>,
        correct: usize,
    },
    /// Type 2. `correct`: 0-based, ascending, distinct, non-empty.
    Multiple {
        options: Vec<DotOption>,
        correct: Vec<usize>,
    },
    /// Type 3: the expected text (C, normalised like an option).
    Short { answer: String },
    /// Type 4. `pairs[k]` is the right item (0-based index into `right`)
    /// of left item `k`, `None` for `k-0` (belongs to no right item).
    /// Several left items may share a right item; right items no left
    /// names are distractors.
    Matching {
        left: Vec<DotOption>,
        right: Vec<DotOption>,
        pairs: Vec<Option<usize>>,
    },
    /// Type 5: free answer; C is ignored.
    Essay,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DotOption {
    /// Normalised text; empty when the option is only a picture.
    pub text: String,
    /// Index into [`DotTest::images`].
    pub image: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Image {
    pub sha256: [u8; 32],
    pub bytes: Vec<u8>,
    /// `image/png`, `image/jpeg`, `image/gif` or `image/webp` (by signature).
    pub mime: &'static str,
    pub width: u32,
    pub height: u32,
}

impl Image {
    /// File extension for `mime`.
    #[must_use]
    pub fn extension(&self) -> &'static str {
        match self.mime {
            "image/jpeg" => "jpg",
            "image/gif" => "gif",
            "image/webp" => "webp",
            _ => "png",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Error,
    Warning,
    Info,
}

/// One located message. `code` is a stable key from spec section 10
/// (`correct_out_of_range`, …); the client renders the text from `code` and
/// `params`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Issue {
    pub severity: Severity,
    pub code: &'static str,
    /// `F12`; `None` for file-level issues.
    pub cell: Option<String>,
    pub row: Option<u32>,
    pub params: serde_json::Map<String, serde_json::Value>,
}
