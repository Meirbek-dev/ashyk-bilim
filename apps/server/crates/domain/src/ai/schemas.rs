//! Structured agent outputs (legacy `services/ai/schemas.py`), as the model
//! must produce them and as artifacts store them.
//!
//! Each type carries a hand-written JSON schema for the provider's
//! `response_format`. Parsing is lenient where the legacy pydantic models
//! had defaults; enum-like fields fall back to their default on an unknown
//! value so a slightly off reply still yields an artifact.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use ab_core::ai::StudyMode;

/// `low` / `medium` / `high`, tolerant of anything else (→ `medium`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema, Default)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Low,
    #[default]
    Medium,
    High,
}

impl Level {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
        }
    }
}

const fn default_citation_confidence() -> f64 {
    0.75
}

fn default_language() -> String {
    "auto".into()
}

const fn default_pass_threshold() -> i32 {
    70
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Citation {
    pub citation_id: String,
    pub label: String,
    pub source_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_uuid: Option<String>,
    #[serde(default)]
    pub excerpt: String,
    #[serde(default = "default_citation_confidence")]
    pub confidence: f64,
}

impl Citation {
    /// Clamp confidence into `[0, 1]` (the legacy validator rejected outside).
    pub const fn normalize(&mut self) {
        if !self.confidence.is_finite() {
            self.confidence = default_citation_confidence();
        }
        self.confidence = self.confidence.clamp(0.0, 1.0);
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct KnowledgeGap {
    pub concept: String,
    #[serde(default)]
    pub severity: Level,
    #[serde(default)]
    pub evidence: String,
    #[serde(default)]
    pub remediation_goal: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Recommendation {
    pub title: String,
    #[serde(default)]
    pub rationale: String,
    #[serde(default)]
    pub priority: Level,
    #[serde(default)]
    pub action: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct CourseQualityReport {
    pub public_score: i32,
    pub summary: String,
    #[serde(default)]
    pub strengths: Vec<String>,
    #[serde(default)]
    pub risks: Vec<String>,
    #[serde(default)]
    pub recommendations: Vec<Recommendation>,
    #[serde(default)]
    pub citations: Vec<Citation>,
    #[serde(default)]
    pub confidence: Level,
    #[serde(default = "default_language")]
    pub language: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct SubmissionAnalysisReport {
    pub summary: String,
    #[serde(default)]
    pub knowledge_gaps: Vec<KnowledgeGap>,
    #[serde(default)]
    pub next_action: String,
    #[serde(default)]
    pub citations: Vec<Citation>,
    #[serde(default)]
    pub confidence: Level,
    #[serde(default = "default_language")]
    pub language: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct RemediationQuestion {
    pub prompt: String,
    #[serde(default)]
    pub choices: Vec<String>,
    #[serde(default)]
    pub answer: String,
    #[serde(default)]
    pub explanation: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct RemediationBundle {
    pub title: String,
    #[serde(default)]
    pub learning_objectives: Vec<String>,
    pub micro_lecture_markdown: String,
    #[serde(default)]
    pub practice_questions: Vec<RemediationQuestion>,
    #[serde(default = "default_pass_threshold")]
    pub pass_threshold: i32,
    #[serde(default)]
    pub citations: Vec<Citation>,
    #[serde(default = "default_language")]
    pub language: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct StudyCompanionAnswer {
    pub mode: StudyMode,
    pub answer_markdown: String,
    #[serde(default)]
    pub practice_items: Vec<RemediationQuestion>,
    #[serde(default)]
    #[schema(value_type = Vec<Object>)]
    pub flashcards: Vec<serde_json::Value>,
    #[serde(default)]
    pub follow_up_suggestions: Vec<String>,
    #[serde(default)]
    pub citations: Vec<Citation>,
    #[serde(default)]
    pub confidence: Level,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct LectureSuggestion {
    pub suggestion_id: String,
    #[serde(default)]
    pub location: String,
    pub title: String,
    #[serde(default)]
    pub rationale: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replacement_markdown: Option<String>,
    #[serde(default)]
    pub priority: Level,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct LectureReviewReport {
    pub summary: String,
    #[serde(default)]
    pub suggestions: Vec<LectureSuggestion>,
    #[serde(default)]
    pub citations: Vec<Citation>,
    #[serde(default = "default_language")]
    pub language: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct CourseQaAnswer {
    pub answer_markdown: String,
    #[serde(default)]
    pub citations: Vec<Citation>,
    #[serde(default)]
    pub confidence: Level,
    #[serde(default)]
    pub out_of_scope: bool,
    #[serde(default)]
    pub follow_up_suggestions: Vec<String>,
}

// ── JSON schemas for `response_format` ──────────────────────────────────────

fn level_schema() -> serde_json::Value {
    serde_json::json!({ "type": "string", "enum": ["low", "medium", "high"] })
}

fn string_list() -> serde_json::Value {
    serde_json::json!({ "type": "array", "items": { "type": "string" } })
}

fn citation_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "citation_id": { "type": "string" },
            "label": { "type": "string" },
            "source_type": { "type": "string" },
            "source_uuid": { "type": ["string", "null"] },
            "excerpt": { "type": "string" },
            "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        },
        "required": ["citation_id", "label", "source_type", "excerpt"]
    })
}

fn citations_schema() -> serde_json::Value {
    serde_json::json!({ "type": "array", "items": citation_schema() })
}

fn question_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "prompt": { "type": "string" },
            "choices": string_list(),
            "answer": { "type": "string" },
            "explanation": { "type": "string" }
        },
        "required": ["prompt", "answer", "explanation"]
    })
}

impl CourseQualityReport {
    pub const SCHEMA_NAME: &'static str = "course_quality_report";

    #[must_use]
    pub fn json_schema() -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "public_score": { "type": "integer", "minimum": 0, "maximum": 100 },
                "summary": { "type": "string" },
                "strengths": string_list(),
                "risks": string_list(),
                "recommendations": { "type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string" },
                        "rationale": { "type": "string" },
                        "priority": level_schema(),
                        "action": { "type": "string" }
                    },
                    "required": ["title", "rationale", "priority", "action"]
                } },
                "citations": citations_schema(),
                "confidence": level_schema(),
                "language": { "type": "string" }
            },
            "required": ["public_score", "summary", "strengths", "risks", "recommendations",
                         "citations", "confidence", "language"]
        })
    }
}

impl SubmissionAnalysisReport {
    pub const SCHEMA_NAME: &'static str = "submission_analysis_report";

    #[must_use]
    pub fn json_schema() -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "summary": { "type": "string" },
                "knowledge_gaps": { "type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "concept": { "type": "string" },
                        "severity": level_schema(),
                        "evidence": { "type": "string" },
                        "remediation_goal": { "type": "string" }
                    },
                    "required": ["concept", "severity", "evidence", "remediation_goal"]
                } },
                "next_action": { "type": "string" },
                "citations": citations_schema(),
                "confidence": level_schema(),
                "language": { "type": "string" }
            },
            "required": ["summary", "knowledge_gaps", "next_action", "citations", "confidence", "language"]
        })
    }
}

impl RemediationBundle {
    pub const SCHEMA_NAME: &'static str = "remediation_bundle";

    #[must_use]
    pub fn json_schema() -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "title": { "type": "string" },
                "learning_objectives": string_list(),
                "micro_lecture_markdown": { "type": "string" },
                "practice_questions": { "type": "array", "items": question_schema() },
                "pass_threshold": { "type": "integer", "minimum": 0, "maximum": 100 },
                "citations": citations_schema(),
                "language": { "type": "string" }
            },
            "required": ["title", "learning_objectives", "micro_lecture_markdown",
                         "practice_questions", "pass_threshold", "citations", "language"]
        })
    }
}

impl StudyCompanionAnswer {
    pub const SCHEMA_NAME: &'static str = "study_companion_answer";

    #[must_use]
    pub fn json_schema() -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "mode": { "type": "string",
                          "enum": ["explain", "practice", "flashcards", "summarize", "deepen"] },
                "answer_markdown": { "type": "string" },
                "practice_items": { "type": "array", "items": question_schema() },
                "flashcards": { "type": "array", "items": { "type": "object" } },
                "follow_up_suggestions": string_list(),
                "citations": citations_schema(),
                "confidence": level_schema()
            },
            "required": ["mode", "answer_markdown", "practice_items", "flashcards",
                         "follow_up_suggestions", "citations", "confidence"]
        })
    }
}

impl LectureReviewReport {
    pub const SCHEMA_NAME: &'static str = "lecture_review_report";

    #[must_use]
    pub fn json_schema() -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "summary": { "type": "string" },
                "suggestions": { "type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "suggestion_id": { "type": "string" },
                        "location": { "type": "string" },
                        "title": { "type": "string" },
                        "rationale": { "type": "string" },
                        "replacement_markdown": { "type": ["string", "null"] },
                        "priority": level_schema()
                    },
                    "required": ["suggestion_id", "location", "title", "rationale", "priority"]
                } },
                "citations": citations_schema(),
                "language": { "type": "string" }
            },
            "required": ["summary", "suggestions", "citations", "language"]
        })
    }
}

impl CourseQaAnswer {
    pub const SCHEMA_NAME: &'static str = "course_qa_answer";

    /// `answer_markdown` is declared first on purpose: the streamed JSON
    /// carries it before the citations, so the answer can be forwarded as
    /// it grows (legacy relied on pydantic-ai partial validation for this).
    #[must_use]
    pub fn json_schema() -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "answer_markdown": { "type": "string" },
                "citations": citations_schema(),
                "confidence": level_schema(),
                "out_of_scope": { "type": "boolean" },
                "follow_up_suggestions": string_list()
            },
            "required": ["answer_markdown", "citations", "confidence", "out_of_scope",
                         "follow_up_suggestions"]
        })
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn lenient_parsing_fills_legacy_defaults() {
        let answer: CourseQaAnswer =
            serde_json::from_value(serde_json::json!({ "answer_markdown": "hi" })).unwrap();
        assert_eq!(answer.confidence, Level::Medium);
        assert!(!answer.out_of_scope);
        assert!(answer.citations.is_empty());

        let mut citation: Citation = serde_json::from_value(serde_json::json!({
            "citation_id": "c1", "label": "L", "source_type": "course", "excerpt": "x",
            "confidence": 4.2
        }))
        .unwrap();
        citation.normalize();
        assert!((citation.confidence - 1.0).abs() < f64::EPSILON);

        let report: SubmissionAnalysisReport =
            serde_json::from_value(serde_json::json!({ "summary": "s", "knowledge_gaps": [
                { "concept": "loops", "severity": "high" }
            ] }))
            .unwrap();
        assert_eq!(report.language, "auto");
        assert_eq!(report.knowledge_gaps[0].severity, Level::High);
    }

    #[test]
    fn schemas_are_objects_with_required_lists() {
        for schema in [
            CourseQualityReport::json_schema(),
            SubmissionAnalysisReport::json_schema(),
            RemediationBundle::json_schema(),
            StudyCompanionAnswer::json_schema(),
            LectureReviewReport::json_schema(),
            CourseQaAnswer::json_schema(),
        ] {
            assert_eq!(schema["type"], "object");
            assert!(schema["required"].as_array().unwrap().len() >= 4);
        }
    }
}
