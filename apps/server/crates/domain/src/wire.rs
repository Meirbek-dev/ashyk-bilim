//! Schema-only contract types (S-01, C-03).
//!
//! JSON the server stores or relays as `serde_json::Value`. They describe what the handlers and
//! the web actually write; the fields keep their `Value` type, so nothing
//! changes on the wire. Referenced with `#[schema(value_type = …)]`.

use std::collections::BTreeMap;

use serde::Serialize;
use utoipa::ToSchema;

use crate::ai::schemas::{Citation, RemediationQuestion};
use crate::assessments::items::MatchingPair;

/// The rich-text editor document (Tiptap / ProseMirror JSON). The node tree
/// is the editor's business: nodes stay open objects. The one free-form
/// schema in the contract.
#[derive(Serialize, ToSchema)]
pub struct EditorDocument {
    #[schema(inline)]
    pub r#type: EditorDocumentType,
    #[schema(value_type = Vec<Object>)]
    pub content: Vec<serde_json::Value>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum EditorDocumentType {
    Doc,
}

/// A string or a number: a message placeholder value, a saved query value.
#[derive(Serialize, ToSchema)]
#[serde(untagged)]
pub enum Scalar {
    Text(String),
    Number(f64),
}

/// Placeholders for a stable message `code`, by name.
#[derive(Serialize, ToSchema)]
pub struct MessageParams(pub BTreeMap<String, Scalar>);

/// A saved analytics filter state: query-string parameters by name.
#[derive(Serialize, ToSchema)]
pub struct SavedQuery(pub BTreeMap<String, Scalar>);

/// The answer key shown after grading: correct option ids (choice) or the
/// expected pairs (matching); `null` for kinds without a key.
#[derive(Serialize, ToSchema)]
#[serde(untagged)]
pub enum CorrectAnswer {
    OptionIds(Vec<String>),
    Pairs(Vec<MatchingPair>),
}

/// What an AI result was grounded on.
#[derive(Serialize, ToSchema)]
pub struct AiEvidence {
    pub citations: Vec<Citation>,
}

/// A remediation session's practice test.
#[derive(Serialize, ToSchema)]
pub struct RemediationTest {
    pub questions: Vec<RemediationQuestion>,
}

/// File-backed media activity content (video / document); every key is
/// optional because the stored object grew over time.
#[derive(Serialize, ToSchema)]
pub struct MediaContent {
    /// YouTube URL (`video_youtube`).
    #[schema(nullable = false)]
    pub uri: Option<String>,
    /// Storage key of the uploaded file.
    #[schema(nullable = false)]
    pub filename: Option<String>,
    #[schema(nullable = false)]
    pub upload_id: Option<uuid::Uuid>,
    /// Original file name, for display.
    #[schema(nullable = false)]
    pub file_name: Option<String>,
}

/// `activities.content`: the editor document (dynamic pages) or the media
/// reference (video / document); `{}` for kinds that keep their content
/// elsewhere (assessments, file submissions).
#[derive(Serialize, ToSchema)]
#[serde(untagged)]
pub enum ActivityContent {
    Editor(EditorDocument),
    Media(MediaContent),
}

/// `activities.details`: player settings of video activities (camelCase as
/// the web writes them); `{}` for other kinds.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDetails {
    /// Seconds.
    #[schema(nullable = false)]
    pub start_time: Option<f64>,
    /// Seconds; absent = play to the end.
    #[schema(nullable = false)]
    pub end_time: Option<f64>,
    #[schema(nullable = false)]
    pub autoplay: Option<bool>,
    #[schema(nullable = false)]
    pub muted: Option<bool>,
}

/// Any JSON value. Only where the value is opaque by protocol (AG-UI
/// `state`, `forwardedProps`, tool parameter schemas, message metadata) -
/// never for data the server or the web interprets.
#[derive(Serialize, ToSchema)]
pub struct JsonValue(pub serde_json::Value);

/// A file-submission rubric (`config.rubric`): criteria the grader scores.
#[derive(Serialize, ToSchema)]
pub struct FileRubric {
    /// Absent on an activity without a rubric (`{}`).
    #[schema(nullable = false)]
    pub criteria: Option<Vec<RubricCriterion>>,
}

#[derive(Serialize, ToSchema)]
pub struct RubricCriterion {
    pub criterion_id: String,
    pub label: String,
    pub max_score: f64,
    #[schema(nullable = false)]
    pub levels: Option<Vec<RubricLevel>>,
}

#[derive(Serialize, ToSchema)]
pub struct RubricLevel {
    pub label: String,
    pub score: f64,
    #[schema(nullable = false)]
    pub description: Option<String>,
}

/// A grader's per-criterion scores (`rubric_scores`), at most 4 KiB.
#[derive(Serialize, ToSchema)]
pub struct RubricScores {
    /// Absent when the activity has no rubric (`{}`).
    #[schema(nullable = false)]
    pub criteria: Option<Vec<RubricScore>>,
}

#[derive(Serialize, ToSchema)]
pub struct RubricScore {
    pub criterion_id: String,
    pub label: String,
    pub score: f64,
    pub max_score: f64,
}

/// AG-UI `Tool` the client offers (accepted and ignored).
#[derive(Serialize, ToSchema)]
pub struct AgUiTool {
    pub name: String,
    pub description: String,
    /// JSON Schema of the tool's arguments.
    pub parameters: JsonValue,
}

/// AG-UI `Context` entry (accepted and ignored).
#[derive(Serialize, ToSchema)]
pub struct AgUiContext {
    pub description: String,
    pub value: String,
}

/// One part of an AG-UI message: `{type: "text", content: "…"}`; only text
/// parts are read.
#[derive(Serialize, ToSchema)]
pub struct AgUiMessagePart {
    pub r#type: String,
    #[schema(nullable = false)]
    pub content: Option<String>,
}

/// One anti-cheat event of a draft (newest kept).
#[derive(Serialize, ToSchema)]
pub struct ViolationEvent {
    /// Client-reported kind (`tab_switch`, `copy_paste`, …).
    pub kind: String,
    pub detail: Option<String>,
    /// Unix seconds.
    pub at: i64,
}
