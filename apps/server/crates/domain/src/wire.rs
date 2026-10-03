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

/// Activity kind (`custom` exists only on migrated legacy rows).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ActivityType {
    Dynamic,
    Video,
    Document,
    Quiz,
    Exam,
    CodeChallenge,
    FileSubmission,
    Custom,
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

/// What an AI result was grounded on: `{citations: [...]}`, or `{}` (the
/// column default; Q&A questions).
#[derive(Serialize, ToSchema)]
pub struct AiEvidence {
    #[schema(nullable = false)]
    pub citations: Option<Vec<Citation>>,
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

// ── Stored JSON documents (S-01, L-2b) ──────────────────────────────────────
//
// Keys accumulated over time: a key may be absent, and some keys hold
// `null`. The export pass marks these schemas `x-stored-json` (see
// `ab-api/src/openapi.rs::STORED_JSON`), so their nullable keys stay
// optional.

/// `ai_runs.metadata`: what the run was started for, merged as it runs.
/// Every key is optional; which ones appear depends on `kind`.
#[derive(Serialize, ToSchema)]
pub struct RunMetadata {
    #[schema(nullable = false)]
    pub kind: Option<ab_core::ai::AiRunKind>,
    #[schema(nullable = false)]
    pub thread_id: Option<uuid::Uuid>,
    #[schema(nullable = false)]
    pub course_id: Option<uuid::Uuid>,
    pub activity_id: Option<uuid::Uuid>,
    pub assessment_id: Option<uuid::Uuid>,
    #[schema(nullable = false)]
    pub submission_id: Option<uuid::Uuid>,
    #[schema(nullable = false)]
    pub file_submission_id: Option<uuid::Uuid>,
    #[schema(nullable = false)]
    pub file_submission_attempt_id: Option<uuid::Uuid>,
    /// The run whose analysis a remediation was generated from.
    #[schema(nullable = false)]
    pub parent_run_id: Option<uuid::Uuid>,
    /// Requested answer language (`auto`, `ru`, `kk`, `en`).
    #[schema(nullable = false)]
    pub language: Option<String>,
    /// The learner's question (Q&A, study companion).
    #[schema(nullable = false)]
    pub question: Option<String>,
    #[schema(nullable = false)]
    pub mode: Option<ab_core::ai::StudyMode>,
    /// Remediation: the result blocks the learner's next attempt.
    #[schema(nullable = false)]
    pub gate_mode: Option<bool>,
    pub client_turn_id: Option<String>,
    /// 1 when a Q&A turn was replayed for the same `client_turn_id`.
    #[schema(nullable = false)]
    pub retry_count: Option<i32>,
    #[schema(nullable = false)]
    pub context_source_count: Option<i32>,
    #[schema(nullable = false)]
    pub item_count: Option<i32>,
    #[schema(nullable = false)]
    pub file_count: Option<i32>,
    #[schema(nullable = false)]
    pub time_to_first_text_ms: Option<i64>,
    /// Set when the run finished.
    #[schema(nullable = false)]
    pub citation_validation: Option<CitationValidation>,
}

/// The admin view's allow-listed part of [`RunMetadata`]
/// (`ai::runs::SAFE_CONTEXT_KEYS`).
#[derive(Serialize, ToSchema)]
pub struct RunContext {
    #[schema(nullable = false)]
    pub kind: Option<ab_core::ai::AiRunKind>,
    #[schema(nullable = false)]
    pub thread_id: Option<uuid::Uuid>,
    #[schema(nullable = false)]
    pub course_id: Option<uuid::Uuid>,
    pub activity_id: Option<uuid::Uuid>,
    #[schema(nullable = false)]
    pub submission_id: Option<uuid::Uuid>,
    #[schema(nullable = false)]
    pub file_submission_attempt_id: Option<uuid::Uuid>,
    #[schema(nullable = false)]
    pub language: Option<String>,
    #[schema(nullable = false)]
    pub mode: Option<ab_core::ai::StudyMode>,
    #[schema(nullable = false)]
    pub retry_count: Option<i32>,
    #[schema(nullable = false)]
    pub context_source_count: Option<i32>,
    #[schema(nullable = false)]
    pub time_to_first_text_ms: Option<i64>,
    #[schema(nullable = false)]
    pub citation_validation: Option<CitationValidation>,
}

/// How many of the model's citations named a supplied source; just
/// `{validation: "not_applicable"}` for runs without context sources.
#[derive(Serialize, ToSchema)]
pub struct CitationValidation {
    #[schema(nullable = false)]
    pub valid_count: Option<i32>,
    #[schema(nullable = false)]
    pub invalid_count: Option<i32>,
    #[schema(nullable = false)]
    pub source_count: Option<i32>,
    #[schema(nullable = false)]
    pub invalid_citation_ids: Option<Vec<String>>,
    #[schema(nullable = false, inline)]
    pub validation: Option<CitationValidationMode>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CitationValidationMode {
    NotApplicable,
}

/// Progress state an AI run event reports.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RunEventState {
    Queued,
    Running,
    CollectingContext,
    CheckingEvidence,
    Complete,
    Failed,
    Cancelled,
}

/// `ai_events.payload`.
///
/// `state` is always set; the rest by event type:
/// `collecting_context` -> `source_count`; `budget_checked` ->
/// `input_tokens`; `finished` -> model, tokens and citation counts;
/// `failed` / `cancelled` -> `error_code`.
#[derive(Serialize, ToSchema)]
pub struct RunEventPayload {
    pub state: RunEventState,
    #[schema(nullable = false)]
    pub source_count: Option<i32>,
    #[schema(nullable = false)]
    pub input_tokens: Option<i32>,
    #[schema(nullable = false)]
    pub output_tokens: Option<i32>,
    #[schema(nullable = false)]
    pub model_name: Option<String>,
    #[schema(nullable = false)]
    pub citations_valid: Option<i32>,
    #[schema(nullable = false)]
    pub citations_invalid: Option<i32>,
    #[schema(nullable = false)]
    pub error_code: Option<String>,
}

/// An AI artifact by kind: the agent's structured output.
#[derive(Serialize, ToSchema)]
#[serde(tag = "kind", content = "content", rename_all = "snake_case")]
pub enum RunArtifactBody {
    CourseAnalysis(crate::ai::schemas::CourseQualityReport),
    SubmissionAnalysis(crate::ai::schemas::SubmissionAnalysisReport),
    Remediation(crate::ai::schemas::RemediationBundle),
    StudyCompanion(crate::ai::schemas::StudyCompanionAnswer),
    LectureReview(crate::ai::schemas::LectureReviewReport),
    CourseQa(crate::ai::schemas::CourseQaAnswer),
}

/// `ai_qa_messages.metadata`: `{}` on questions; answers carry the model
/// and the question they reply to; `incomplete` marks a partial answer
/// saved when the stream was cut.
#[derive(Serialize, ToSchema)]
pub struct QaMessageMetadata {
    #[schema(nullable = false)]
    pub model_name: Option<String>,
    #[schema(nullable = false)]
    pub out_of_scope: Option<bool>,
    #[schema(nullable = false)]
    pub reply_to_message_id: Option<uuid::Uuid>,
    #[schema(nullable = false)]
    pub incomplete: Option<bool>,
}

/// `ai_eval_results.details` of the provider smoke eval.
#[derive(Serialize, ToSchema)]
pub struct EvalDetails {
    /// The provider is not configured.
    #[schema(nullable = false)]
    pub reason: Option<String>,
    /// The provider call failed.
    #[schema(nullable = false)]
    pub error: Option<String>,
    /// The structured reply needed a repair pass.
    #[schema(nullable = false)]
    pub repaired: Option<bool>,
    #[schema(nullable = false)]
    pub usage: Option<EvalUsage>,
}

#[derive(Serialize, ToSchema)]
pub struct EvalUsage {
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
}

/// The `AB__AI__*` section the server runs with, secrets replaced by
/// `"[redacted]"` (`AiConfig::redacted`; a test pins the keys).
// One flag per `AB__AI__*` switch, as the config section has them.
#[allow(clippy::struct_excessive_bools)]
#[derive(Serialize, ToSchema)]
pub struct AiEffectiveConfig {
    /// `enabled`, `disabled: ai_enabled=false` or `disabled: no provider key`.
    pub status: String,
    /// `"[redacted]"` when set.
    pub openai_api_key: Option<String>,
    pub openai_model: String,
    pub openai_base_url: String,
    /// `"[redacted]"` when set.
    pub openrouter_api_key: Option<String>,
    pub openrouter_model: String,
    pub openrouter_base_url: String,
    pub openai_timeout_secs: f64,
    pub openrouter_timeout_secs: f64,
    pub max_tokens_per_request: i32,
    pub max_output_tokens: i32,
    pub monthly_token_budget: i64,
    pub ai_enabled: bool,
    pub course_analysis_enabled: bool,
    pub submission_analysis_enabled: bool,
    pub remediation_enabled: bool,
    pub course_qa_enabled: bool,
    pub study_companion_enabled: bool,
    pub lecture_authoring_enabled: bool,
    pub ai_draft_mode_enabled: bool,
    pub semantic_memory_enabled: bool,
    pub analysis_requests_per_hour_per_user: i32,
    pub remediation_requests_per_hour_per_user: i32,
}

/// `certifications.config`: what the certificate editor stores. The server
/// reads `certification_name`, `certification_type` and
/// `certificate_instructor`; the rest is the web's.
#[derive(Serialize, ToSchema)]
pub struct CertificationConfig {
    #[schema(nullable = false)]
    pub certification_name: Option<String>,
    #[schema(nullable = false)]
    pub certification_description: Option<String>,
    #[schema(nullable = false)]
    pub certification_type: Option<CertificationType>,
    #[schema(nullable = false)]
    pub certificate_pattern: Option<CertificatePattern>,
    /// The name signed on the certificate; blank = the course's teachers.
    #[schema(nullable = false)]
    pub certificate_instructor: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CertificationType {
    Completion,
    Achievement,
    Assessment,
    Participation,
    Mastery,
    Professional,
    Continuing,
    Workshop,
    Specialization,
}

/// The certificate's background design.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CertificatePattern {
    Royal,
    Tech,
    Nature,
    Geometric,
    Vintage,
    Waves,
    Minimal,
    Professional,
    Academic,
    Modern,
}

/// `activities.settings`.
///
/// The server reads `required` (progress: `false` makes the activity
/// optional). Migrated legacy rows keep the legacy
/// assessment settings they had (exam / code-challenge keys such as
/// `time_limit`, `attempt_limit`, `kind`): kept as is, read by nobody.
#[derive(Serialize, ToSchema)]
pub struct ActivitySettings {
    /// Absent = required.
    #[schema(nullable = false)]
    pub required: Option<bool>,
    #[serde(flatten)]
    pub legacy: BTreeMap<String, JsonValue>,
}

/// `file_submissions.settings`: reserved, no keys are defined (`{}` on
/// every row); stored and returned as sent.
#[derive(Serialize, ToSchema)]
pub struct FileSubmissionSettings(pub BTreeMap<String, JsonValue>);

/// `teacher_interventions.payload`: what the at-risk table attaches to an
/// extension / remediation draft.
#[derive(Serialize, ToSchema)]
pub struct InterventionPayload {
    #[schema(nullable = false)]
    pub reason_codes: Option<Vec<String>>,
    #[schema(nullable = false)]
    pub remediation_draft: Option<String>,
    #[schema(nullable = false)]
    pub risk_score: Option<f64>,
}

/// `bulk_actions.params` of a deadline extension.
#[derive(Serialize, ToSchema)]
pub struct BulkActionParams {
    /// Unix seconds.
    pub new_due_at: i64,
    pub reason: String,
}

/// `assessment_audit_events.payload`.
///
/// The keys depend on `event`: `lifecycle-transition` (`from`, `to`, `scheduled_at`, `note`, `by`),
/// `auto-publish-skipped` (`by`, `readiness`), `access-changed` (`mode`,
/// `users`, `usergroups`), `override-created|updated|deleted` (`user_id`),
/// `duplicated-from` (`source`), `deadline-extension-requested` /
/// `deadline-extended` (`action_id`, `learners`, `new_due_at`),
/// `submission-submitted` (`submission_id`, `attempt`, `status`,
/// `auto_submit_reason`), `grade-saved` (`submission_id`, `learner_id`,
/// `status`, `raw_score`, `final_score`, `audit_note`), `grades-published`
/// (`published`, `already_published`).
#[derive(Serialize, ToSchema)]
pub struct AuditPayload {
    #[schema(nullable = false)]
    pub from: Option<String>,
    #[schema(nullable = false)]
    pub to: Option<String>,
    /// Unix seconds.
    pub scheduled_at: Option<i64>,
    pub note: Option<String>,
    /// `scheduler` for automatic transitions.
    #[schema(nullable = false)]
    pub by: Option<String>,
    /// Readiness codes that blocked an automatic publish.
    #[schema(nullable = false)]
    pub readiness: Option<Vec<String>>,
    #[schema(nullable = false)]
    pub mode: Option<String>,
    #[schema(nullable = false)]
    pub users: Option<i32>,
    #[schema(nullable = false)]
    pub usergroups: Option<i32>,
    #[schema(nullable = false)]
    pub user_id: Option<uuid::Uuid>,
    /// The assessment this one was duplicated from.
    #[schema(nullable = false)]
    pub source: Option<uuid::Uuid>,
    #[schema(nullable = false)]
    pub action_id: Option<uuid::Uuid>,
    #[schema(nullable = false)]
    pub learners: Option<i32>,
    /// Unix seconds.
    #[schema(nullable = false)]
    pub new_due_at: Option<i64>,
    #[schema(nullable = false)]
    pub submission_id: Option<uuid::Uuid>,
    #[schema(nullable = false)]
    pub learner_id: Option<uuid::Uuid>,
    #[schema(nullable = false)]
    pub attempt: Option<i32>,
    #[schema(nullable = false)]
    pub status: Option<String>,
    pub auto_submit_reason: Option<String>,
    pub raw_score: Option<f64>,
    pub final_score: Option<f64>,
    pub audit_note: Option<String>,
    #[schema(nullable = false)]
    pub published: Option<i32>,
    #[schema(nullable = false)]
    pub already_published: Option<i32>,
}

/// `blocks.content`: the uploaded file a content block shows. Legacy rows
/// carry `file_id` / `file_format` / `activity_uuid` instead of `upload_id`.
#[derive(Serialize, ToSchema)]
pub struct BlockContent {
    /// Storage key, served at `/content/<key>`.
    pub file_key: String,
    pub file_name: String,
    pub file_size: i64,
    /// MIME type.
    pub file_type: String,
    #[schema(nullable = false)]
    pub upload_id: Option<uuid::Uuid>,
    #[schema(nullable = false)]
    pub file_id: Option<String>,
    #[schema(nullable = false)]
    pub file_format: Option<String>,
    #[schema(nullable = false)]
    pub activity_uuid: Option<String>,
}

/// One drill-through row.
///
/// The shape depends on the response's `metric`: learner progress (`active_learners`, `completion_rate`), a submission
/// awaiting review (`backlog`), a learner's assessment result (`pass_rate`).
#[derive(Serialize, ToSchema)]
#[serde(untagged)]
pub enum DrillThroughRow {
    Progress(DrillProgressRow),
    Backlog(DrillBacklogRow),
    PassRate(DrillPassRateRow),
}

#[derive(Serialize, ToSchema)]
pub struct DrillProgressRow {
    pub user_id: uuid::Uuid,
    pub user_display_name: String,
    pub course_id: uuid::Uuid,
    pub course_name: String,
    pub progress_pct: f64,
    pub completed_steps: i32,
    pub total_steps: i32,
    pub is_completed: bool,
    pub last_activity_at_unix: Option<i64>,
    pub cohorts: Vec<String>,
    /// `true`, on `active_learners` rows only.
    #[schema(nullable = false)]
    pub active_in_window: Option<bool>,
}

#[derive(Serialize, ToSchema)]
pub struct DrillBacklogRow {
    pub submission_id: uuid::Uuid,
    pub assessment_id: uuid::Uuid,
    pub assessment_type: ab_core::assessments::AssessmentKind,
    pub assessment_title: String,
    pub course_id: uuid::Uuid,
    pub course_name: String,
    pub user_id: uuid::Uuid,
    pub user_display_name: String,
    pub status: String,
    pub submitted_at_unix: i64,
    pub age_hours: f64,
    pub sla_breached: bool,
}

#[derive(Serialize, ToSchema)]
pub struct DrillPassRateRow {
    pub user_id: uuid::Uuid,
    pub user_display_name: String,
    pub attempts: i32,
    pub best_score: Option<f64>,
    pub last_score: Option<f64>,
    pub submitted_at_unix: Option<i64>,
    pub graded_at_unix: Option<i64>,
    pub status: Option<String>,
    pub passed: bool,
}
