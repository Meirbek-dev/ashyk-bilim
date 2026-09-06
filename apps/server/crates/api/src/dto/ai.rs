//! AI DTOs: runs (status, events, artifacts, the AG-UI stream envelope),
//! course Q&A (the AG-UI `RunAgentInput` request, threads, messages), the
//! feature records of the other five agents, capabilities, and the admin /
//! usage views.
//!
//! The two AG-UI request bodies (`QaChatRequest`, `RunStreamRequest`) are
//! camelCase on the wire because they mirror the protocol
//! `@tanstack/ai-client` speaks — not this API's snake_case convention.

use ab_core::ai::{
    AiFeature, AiRunKind, AiRunStatus, AiThreadRole, CourseAnalysisStatus, FindingReviewAction,
    LectureReviewStatus, QaMessageRole, RemediationStatus, StudyMode,
};
use ab_core::id::{
    ActivityId, AiArtifactId, AiCourseAnalysisId, AiEvalResultId, AiEventId, AiEvidenceId,
    AiLectureReviewId, AiMessageId, AiRemediationSessionId, AiRunId, AiSubmissionAnalysisId,
    AiThreadId, CourseId, SubmissionId, UserId,
};
use ab_domain::ai as domain;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

fn default_language() -> String {
    "auto".into()
}

// ── Runs ────────────────────────────────────────────────────────────────────

/// One AI run as its owner sees it (legacy `AIRunStatusRead`).
#[derive(Debug, Serialize, ToSchema)]
pub struct RunStatus {
    pub id: AiRunId,
    pub thread_id: AiThreadId,
    pub kind: AiRunKind,
    pub status: AiRunStatus,
    pub model_name: Option<String>,
    pub error_code: Option<String>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub duration_ms: Option<i32>,
    #[schema(value_type = Object)]
    pub metadata: serde_json::Value,
    pub started_at_unix: i64,
    pub completed_at_unix: Option<i64>,
}

impl From<ab_db::ai::RunRow> for RunStatus {
    fn from(r: ab_db::ai::RunRow) -> Self {
        Self {
            id: r.id,
            thread_id: r.thread_id,
            kind: r.kind,
            status: r.status,
            model_name: r.model_name,
            error_code: r.error_code,
            input_tokens: r.input_tokens,
            output_tokens: r.output_tokens,
            duration_ms: r.duration_ms,
            metadata: r.metadata,
            started_at_unix: r.started_at,
            completed_at_unix: r.completed_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RunEvent {
    pub id: AiEventId,
    pub sequence: i32,
    pub event_type: String,
    #[schema(value_type = Object)]
    pub payload: serde_json::Value,
    pub created_at_unix: i64,
}

impl From<ab_db::ai::EventRow> for RunEvent {
    fn from(e: ab_db::ai::EventRow) -> Self {
        Self {
            id: e.id,
            sequence: e.sequence,
            event_type: e.event_type,
            payload: e.payload,
            created_at_unix: e.created_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RunArtifact {
    pub id: AiArtifactId,
    pub kind: String,
    #[schema(value_type = Object)]
    pub content: serde_json::Value,
    #[serde(rename = "final")]
    pub is_final: bool,
    pub created_at_unix: i64,
}

impl From<ab_db::ai::ArtifactRow> for RunArtifact {
    fn from(a: ab_db::ai::ArtifactRow) -> Self {
        Self {
            id: a.id,
            kind: a.kind,
            content: a.content,
            is_final: a.final_,
            created_at_unix: a.created_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RunEvidence {
    pub id: AiEvidenceId,
    pub artifact_id: Option<AiArtifactId>,
    pub citation_id: String,
    pub label: String,
    pub source_type: String,
    pub source_ref: Option<String>,
    pub excerpt: String,
    pub score: Option<f64>,
    pub created_at_unix: i64,
}

impl From<ab_db::ai::EvidenceRow> for RunEvidence {
    fn from(e: ab_db::ai::EvidenceRow) -> Self {
        Self {
            id: e.id,
            artifact_id: e.artifact_id,
            citation_id: e.citation_id,
            label: e.label,
            source_type: e.source_type,
            source_ref: e.source_ref,
            excerpt: e.excerpt,
            score: e.score,
            created_at_unix: e.created_at,
        }
    }
}

/// AG-UI `RunAgentInput` correlation ids echoed back in every `RUN_*` event.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RunStreamRequest {
    #[garde(length(min = 1, max = 200))]
    pub thread_id: String,
    #[garde(length(min = 1, max = 200))]
    pub run_id: String,
}

// ── Course Q&A ──────────────────────────────────────────────────────────────

/// One message of the AG-UI conversation the client sends back.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct QaWireMessage {
    #[garde(length(max = 200))]
    pub id: Option<String>,
    #[garde(length(min = 1, max = 32))]
    pub role: String,
    #[garde(length(max = 20_000))]
    pub content: Option<String>,
    /// `[{type: "text", content: "…"}, …]` — an alternative to `content`.
    #[garde(skip)]
    #[schema(value_type = Option<Vec<Object>>)]
    pub parts: Option<Vec<serde_json::Value>>,
}

/// What this API reads from AG-UI `forwardedProps`.
#[derive(Debug, Default, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct QaForwardedProps {
    /// Continue an existing thread of the caller in this course.
    #[garde(skip)]
    pub thread_id: Option<AiThreadId>,
    #[garde(length(max = 16))]
    pub language: Option<String>,
    /// Narrow the context to one activity of the course.
    #[garde(skip)]
    pub activity_id: Option<ActivityId>,
    /// Client turn id: a retry with the same id replays the stored answer.
    #[garde(length(min = 1, max = 200))]
    pub client_turn_id: Option<String>,
}

/// AG-UI `RunAgentInput` for `POST /ai/qa/{course}/chat`.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct QaChatRequest {
    #[garde(length(min = 1, max = 200))]
    pub thread_id: String,
    #[garde(length(min = 1, max = 200))]
    pub run_id: String,
    #[garde(dive)]
    #[serde(default)]
    pub messages: Vec<QaWireMessage>,
    #[garde(dive)]
    #[serde(default)]
    pub forwarded_props: QaForwardedProps,
}

impl QaChatRequest {
    /// Legacy `_latest_user_question`: the last user message's `content`,
    /// or the joined text parts.
    #[must_use]
    pub fn latest_user_question(&self) -> Option<String> {
        self.messages.iter().rev().find_map(|message| {
            if message.role != "user" {
                return None;
            }
            if let Some(content) = &message.content
                && !content.is_empty()
            {
                return Some(content.clone());
            }
            let text: String = message
                .parts
                .as_deref()
                .unwrap_or_default()
                .iter()
                .filter(|part| part.get("type").and_then(serde_json::Value::as_str) == Some("text"))
                .filter_map(|part| part.get("content").and_then(serde_json::Value::as_str))
                .collect();
            (!text.is_empty()).then_some(text)
        })
    }
}

#[derive(Debug, Deserialize, ToSchema, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
pub struct ThreadsQuery {
    /// 1..=50 (default 30).
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct QaThreadSummary {
    pub id: AiThreadId,
    pub title: Option<String>,
    pub last_message_preview: String,
    pub message_count: i64,
    pub updated_at_unix: i64,
}

impl From<ab_db::ai::ThreadSummaryRow> for QaThreadSummary {
    fn from(t: ab_db::ai::ThreadSummaryRow) -> Self {
        Self {
            id: t.id,
            title: t.title,
            last_message_preview: t.last_message.chars().take(140).collect(),
            message_count: t.message_count,
            updated_at_unix: t.updated_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct QaMessage {
    pub id: AiMessageId,
    pub thread_id: AiThreadId,
    pub course_id: CourseId,
    pub user_id: Option<UserId>,
    pub role: QaMessageRole,
    pub client_turn_id: Option<String>,
    pub content: String,
    pub confidence: Option<String>,
    #[schema(value_type = Object)]
    pub citations: serde_json::Value,
    #[schema(value_type = Object)]
    pub metadata: serde_json::Value,
    pub created_at_unix: i64,
}

impl From<ab_db::ai::QaMessageRow> for QaMessage {
    fn from(m: ab_db::ai::QaMessageRow) -> Self {
        Self {
            id: m.id,
            thread_id: m.thread_id,
            course_id: m.course_id,
            user_id: m.user_id,
            role: m.role,
            client_turn_id: m.client_turn_id,
            content: m.content,
            confidence: m.confidence,
            citations: m.citations,
            metadata: m.metadata,
            created_at_unix: m.created_at,
        }
    }
}

// ── Agent requests ──────────────────────────────────────────────────────────

/// `{language}` for the analysis-style agents (default `auto`).
#[derive(Debug, Default, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct LanguageRequest {
    #[garde(length(max = 16))]
    #[serde(default = "default_language")]
    pub language: String,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct FindingReviewRequest {
    #[garde(length(min = 1, max = 200))]
    pub finding_id: String,
    #[garde(skip)]
    pub action: FindingReviewAction,
    #[garde(length(max = 1000))]
    pub note: Option<String>,
}

#[derive(Debug, Default, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct LectureReviewRequest {
    #[garde(skip)]
    pub activity_id: Option<ActivityId>,
    #[garde(length(max = 16))]
    #[serde(default = "default_language")]
    pub language: String,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DismissSuggestionRequest {
    #[garde(length(min = 1, max = 200))]
    pub suggestion_id: String,
}

#[derive(Debug, Default, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RemediationRequest {
    #[garde(skip)]
    #[serde(default)]
    pub gate_mode: bool,
    #[garde(length(max = 16))]
    #[serde(default = "default_language")]
    pub language: String,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RemediationCompletionRequest {
    #[garde(range(min = 0, max = 100))]
    pub score: i32,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct StudyRequest {
    #[garde(length(min = 1, max = 4000))]
    pub question: String,
    #[garde(skip)]
    #[serde(default = "StudyRequest::default_mode")]
    pub mode: StudyMode,
    #[garde(length(max = 16))]
    #[serde(default = "default_language")]
    pub language: String,
}

impl StudyRequest {
    const fn default_mode() -> StudyMode {
        StudyMode::Explain
    }
}

// ── Feature records ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, ToSchema)]
pub struct SubmissionAnalysis {
    pub id: AiSubmissionAnalysisId,
    pub submission_id: SubmissionId,
    pub run_id: Option<AiRunId>,
    pub triggered_by: Option<UserId>,
    pub status: String,
    pub language: String,
    pub gap_count: i32,
    #[schema(value_type = Object)]
    pub analysis: serde_json::Value,
    #[schema(value_type = Object)]
    pub evidence: serde_json::Value,
    pub model_name: Option<String>,
    pub created_at_unix: i64,
}

impl From<ab_db::ai::SubmissionAnalysisRow> for SubmissionAnalysis {
    fn from(a: ab_db::ai::SubmissionAnalysisRow) -> Self {
        Self {
            id: a.id,
            submission_id: a.submission_id,
            run_id: a.run_id,
            triggered_by: a.triggered_by,
            status: a.status,
            language: a.language,
            gap_count: a.gap_count,
            analysis: a.analysis,
            evidence: a.evidence,
            model_name: a.model_name,
            created_at_unix: a.created_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CourseAnalysis {
    pub id: AiCourseAnalysisId,
    pub course_id: CourseId,
    pub run_id: Option<AiRunId>,
    pub triggered_by: Option<UserId>,
    pub status: CourseAnalysisStatus,
    pub language: String,
    pub public_score: i32,
    #[schema(value_type = Object)]
    pub report: serde_json::Value,
    #[schema(value_type = Object)]
    pub evidence: serde_json::Value,
    pub model_name: Option<String>,
    pub content_hash: Option<String>,
    /// The course content changed since this analysis (latest view only).
    pub stale: bool,
    pub previous_public_score: Option<i32>,
    pub created_at_unix: i64,
    pub published_at_unix: Option<i64>,
}

impl From<ab_db::ai::CourseAnalysisRow> for CourseAnalysis {
    fn from(a: ab_db::ai::CourseAnalysisRow) -> Self {
        Self {
            id: a.id,
            course_id: a.course_id,
            run_id: a.run_id,
            triggered_by: a.triggered_by,
            status: a.status,
            language: a.language,
            public_score: a.public_score,
            report: a.report,
            evidence: a.evidence,
            model_name: a.model_name,
            content_hash: a.content_hash,
            stale: false,
            previous_public_score: None,
            created_at_unix: a.created_at,
            published_at_unix: a.published_at,
        }
    }
}

impl From<domain::LatestCourseAnalysis> for CourseAnalysis {
    fn from(latest: domain::LatestCourseAnalysis) -> Self {
        let mut dto = Self::from(latest.analysis);
        dto.stale = latest.stale;
        dto.previous_public_score = latest.previous_public_score;
        dto
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct LectureReview {
    pub id: AiLectureReviewId,
    pub course_id: CourseId,
    pub activity_id: Option<ActivityId>,
    pub run_id: Option<AiRunId>,
    pub triggered_by: Option<UserId>,
    pub status: LectureReviewStatus,
    pub language: String,
    #[schema(value_type = Object)]
    pub suggestions: serde_json::Value,
    pub dismissed_suggestion_ids: Vec<String>,
    pub created_at_unix: i64,
    pub superseded_at_unix: Option<i64>,
}

impl From<ab_db::ai::LectureReviewRow> for LectureReview {
    fn from(r: ab_db::ai::LectureReviewRow) -> Self {
        Self {
            id: r.id,
            course_id: r.course_id,
            activity_id: r.activity_id,
            run_id: r.run_id,
            triggered_by: r.triggered_by,
            status: r.status,
            language: r.language,
            suggestions: r.suggestions,
            dismissed_suggestion_ids: r.dismissed_suggestion_ids,
            created_at_unix: r.created_at,
            superseded_at_unix: r.superseded_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RemediationSession {
    pub id: AiRemediationSessionId,
    pub submission_id: SubmissionId,
    pub activity_id: ActivityId,
    pub student_user_id: UserId,
    pub analysis_id: Option<AiSubmissionAnalysisId>,
    pub run_id: Option<AiRunId>,
    pub status: RemediationStatus,
    pub gate_mode: bool,
    pub language: String,
    #[schema(value_type = Object)]
    pub lecture: serde_json::Value,
    #[schema(value_type = Object)]
    pub test: serde_json::Value,
    pub score: Option<i32>,
    pub passed_at_unix: Option<i64>,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl From<ab_db::ai::RemediationSessionRow> for RemediationSession {
    fn from(s: ab_db::ai::RemediationSessionRow) -> Self {
        Self {
            id: s.id,
            submission_id: s.submission_id,
            activity_id: s.activity_id,
            student_user_id: s.student_user_id,
            analysis_id: s.analysis_id,
            run_id: s.run_id,
            status: s.status,
            gate_mode: s.gate_mode,
            language: s.language,
            lecture: s.lecture,
            test: s.test,
            score: s.score,
            passed_at_unix: s.passed_at,
            created_at_unix: s.created_at,
            updated_at_unix: s.updated_at,
        }
    }
}

// ── Capabilities ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, ToSchema, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
pub struct CapabilitiesQuery {
    /// Which client screen asks (default `course-page`).
    pub surface: Option<domain::Surface>,
    pub activity_id: Option<ActivityId>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FeatureCapability {
    pub key: AiFeature,
    pub enabled: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ContextSummary {
    pub course_label: String,
    pub activity_label: Option<String>,
    pub activity_id: Option<ActivityId>,
    pub source_count: usize,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ScopeCapabilities {
    pub available: bool,
    pub role: AiThreadRole,
    pub surface: domain::Surface,
    /// `student` or `teacher`.
    pub context_visibility: String,
    pub restricted: bool,
    pub reason: Option<String>,
    pub modes: Vec<String>,
    pub features: Vec<FeatureCapability>,
    pub context: Option<ContextSummary>,
}

impl From<domain::ScopeCapabilities> for ScopeCapabilities {
    fn from(c: domain::ScopeCapabilities) -> Self {
        Self {
            available: c.available,
            role: c.role,
            surface: c.surface,
            context_visibility: c.context_visibility.to_owned(),
            restricted: c.restricted,
            reason: c.reason.map(str::to_owned),
            modes: c.modes.into_iter().map(str::to_owned).collect(),
            features: c
                .features
                .into_iter()
                .map(|f| FeatureCapability {
                    key: f.feature,
                    enabled: f.enabled,
                    reason: f.reason.map(str::to_owned),
                })
                .collect(),
            context: c.context.map(|ctx| ContextSummary {
                course_label: ctx.course_label,
                activity_label: ctx.activity_label,
                activity_id: ctx.activity_id,
                source_count: ctx.source_count,
            }),
        }
    }
}

// ── Admin + usage ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, ToSchema)]
pub struct FeatureSetting {
    pub key: AiFeature,
    pub enabled: bool,
    /// Flags come from the environment; there is no runtime toggle.
    pub editable: bool,
    pub source: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminSettings {
    pub ai_enabled: bool,
    pub provider_ready: bool,
    pub model: String,
    pub monthly_token_budget: i64,
    pub max_tokens_per_request: u32,
    pub max_output_tokens: u32,
    pub draft_mode_enabled: bool,
    pub features: Vec<FeatureSetting>,
    /// The whole `AB__AI__*` section with secrets redacted.
    #[schema(value_type = Object)]
    pub effective: serde_json::Value,
}

impl From<domain::AdminSettings> for AdminSettings {
    fn from(s: domain::AdminSettings) -> Self {
        Self {
            ai_enabled: s.ai_enabled,
            provider_ready: s.provider_ready,
            model: s.model,
            monthly_token_budget: s.monthly_token_budget,
            max_tokens_per_request: s.max_tokens_per_request,
            max_output_tokens: s.max_output_tokens,
            draft_mode_enabled: s.draft_mode_enabled,
            features: s
                .features
                .into_iter()
                .map(|(key, enabled)| FeatureSetting {
                    key,
                    enabled,
                    editable: false,
                    source: "environment".into(),
                })
                .collect(),
            effective: s.effective,
        }
    }
}

#[derive(Debug, Deserialize, ToSchema, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
pub struct AdminRunsQuery {
    /// Look-back window, 1..=90 days (default 7).
    pub days: Option<i32>,
    pub status: Option<AiRunStatus>,
    /// Agent kind (legacy `feature`).
    pub kind: Option<AiRunKind>,
    /// Case-insensitive substring of `model_name` (`openai`, `openrouter`).
    pub provider: Option<String>,
    pub course_id: Option<CourseId>,
    /// Keyset cursor: the last `id` of the previous page.
    pub cursor: Option<AiRunId>,
    /// 1..=200 (default 50).
    pub limit: Option<i64>,
}

/// One run in the operations view (legacy `AIOperationRunRead`).
#[derive(Debug, Serialize, ToSchema)]
pub struct AdminRun {
    pub id: AiRunId,
    pub status: AiRunStatus,
    pub feature: AiRunKind,
    pub model_name: Option<String>,
    pub error_code: Option<String>,
    pub duration_ms: Option<i32>,
    pub time_to_first_text_ms: Option<i64>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cost_estimate: Option<f64>,
    pub retry_count: i64,
    pub started_at_unix: i64,
    pub completed_at_unix: Option<i64>,
    /// Queued or running for over ten minutes.
    pub stuck: bool,
    /// The allow-listed part of the run metadata.
    #[schema(value_type = Object)]
    pub context: serde_json::Value,
}

impl AdminRun {
    #[must_use]
    pub fn from_row(r: ab_db::ai::RunRow, now_unix: i64) -> Self {
        let stuck = !r.status.is_terminal()
            && now_unix.saturating_sub(r.started_at) > domain::runs::STUCK_AFTER_SECS;
        Self {
            id: r.id,
            status: r.status,
            feature: r.kind,
            model_name: r.model_name,
            error_code: r.error_code,
            duration_ms: r.duration_ms,
            time_to_first_text_ms: r
                .metadata
                .get("time_to_first_text_ms")
                .and_then(serde_json::Value::as_i64),
            input_tokens: r.input_tokens,
            output_tokens: r.output_tokens,
            cost_estimate: r.cost_estimate,
            retry_count: r
                .metadata
                .get("retry_count")
                .and_then(serde_json::Value::as_i64)
                .unwrap_or(0),
            started_at_unix: r.started_at,
            completed_at_unix: r.completed_at,
            stuck,
            context: domain::runs::safe_run_context(&r.metadata),
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminRunPage {
    pub items: Vec<AdminRun>,
    pub next_cursor: Option<AiRunId>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminRunDetail {
    pub run: AdminRun,
    pub events: Vec<RunEvent>,
    pub artifacts: Vec<RunArtifact>,
    pub evidence: Vec<RunEvidence>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RunAggregate {
    pub total: i64,
    pub queued: i64,
    pub running: i64,
    pub succeeded: i64,
    pub failed: i64,
    pub aborted: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct EvalSummary {
    pub total: i64,
    pub passed: i64,
    pub failed: i64,
    pub average_score: Option<f64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct EvalResult {
    pub id: AiEvalResultId,
    pub run_id: Option<AiRunId>,
    pub dataset: String,
    pub evaluator: String,
    pub score: Option<f64>,
    pub passed: Option<bool>,
    #[schema(value_type = Object)]
    pub details: serde_json::Value,
    pub created_at_unix: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct EvalDashboard {
    pub runs: RunAggregate,
    pub evals: EvalSummary,
    pub recent_evals: Vec<EvalResult>,
}

impl From<domain::EvalDashboard> for EvalDashboard {
    fn from(d: domain::EvalDashboard) -> Self {
        Self {
            runs: RunAggregate {
                total: d.runs.total,
                queued: d.runs.queued,
                running: d.runs.running,
                succeeded: d.runs.succeeded,
                failed: d.runs.failed,
                aborted: d.runs.aborted,
            },
            evals: EvalSummary {
                total: d.evals.total,
                passed: d.evals.passed,
                failed: d.evals.failed,
                average_score: d.evals.average_score,
            },
            recent_evals: d
                .recent
                .into_iter()
                .map(|e| EvalResult {
                    id: e.id,
                    run_id: e.run_id,
                    dataset: e.dataset,
                    evaluator: e.evaluator,
                    score: e.score,
                    passed: e.passed,
                    details: e.details,
                    created_at_unix: e.created_at,
                })
                .collect(),
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UserUsage {
    pub user_id: UserId,
    /// `YYYY-MM-01`.
    pub month: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub run_count: i32,
}

/// Platform usage against the monthly budget (legacy `AIUsageSummary`)
/// plus the month's heaviest users.
#[derive(Debug, Serialize, ToSchema)]
pub struct UsageSummary {
    pub total_runs: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub monthly_budget: i64,
    pub remaining_budget: i64,
    pub users: Vec<UserUsage>,
}

impl From<domain::UsageSummary> for UsageSummary {
    fn from(u: domain::UsageSummary) -> Self {
        Self {
            total_runs: u.total_runs,
            input_tokens: u.input_tokens,
            output_tokens: u.output_tokens,
            monthly_budget: u.monthly_budget,
            remaining_budget: u.remaining_budget,
            users: u
                .users
                .into_iter()
                .map(|l| UserUsage {
                    user_id: l.user_id,
                    month: l.month,
                    input_tokens: l.input_tokens,
                    output_tokens: l.output_tokens,
                    run_count: l.run_count,
                })
                .collect(),
        }
    }
}
