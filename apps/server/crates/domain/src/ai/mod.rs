//! AI subsystem (ARCHITECTURE §12; legacy `services/ai/*`, `routers/ai/*`).
//!
//! [`AiService`] owns the durable run model (threads, runs, journaled events
//! mirrored to Redis, artifacts, evidence, the token ledger) and the six
//! agents ported from the legacy: course Q&A (streaming), study companion,
//! submission analyst, course analyst, lecture author, remediation
//! generator. Every entry point takes an [`Actor`]; the worker's
//! [`AiService::execute_queued`] re-derives scope from the run it was told
//! to execute. Model access goes through `ab_clients::llm::LlmClient` only.

pub mod agents;
pub mod budget;
pub mod capabilities;
pub mod context;
pub mod partial;
pub mod policy;
pub mod prompts;
pub mod redact;
pub mod runs;
pub mod schemas;
pub(crate) mod subject;

use std::sync::Arc;

use ab_clients::llm::LlmClient;
use ab_clients::storage::StorageClient;
use ab_core::ai::AiFeature;
use ab_core::config::AiConfig;
use ab_core::id::UserId;
use ab_core::{Error, ErrorCode, Result};
use sqlx::PgPool;

pub use ab_db::ai::{
    ArtifactRow, CourseAnalysisRow, EvalResultRow, EventRow, EvidenceRow, LectureReviewRow,
    QaMessageRow, RemediationSessionRow, RunAggregate, RunRow, SubmissionAnalysisRow, ThreadRow,
    ThreadSummaryRow,
};
pub use agents::course_analyst::LatestCourseAnalysis;
pub use agents::course_qa::{QaReplay, QaRequest, QaSession, QaStream, QaTurn};
pub use budget::TokenBudget;
pub use capabilities::{ContextSummary, FeatureCapability, ScopeCapabilities, Surface};
pub use runs::{
    AdminSettings, EXECUTE_RUN_JOB, EvalDashboard, EvalReport, RunDetail, RunListQuery,
    UsageSummary,
};

use crate::catalog::courses::CoursesService;
use crate::events::AiEvents;
use crate::identity::Actor;
use crate::identity::rate_limit::RateLimiter;

#[derive(Clone)]
pub struct AiService {
    pub(crate) pool: PgPool,
    pub(crate) config: Arc<AiConfig>,
    llm: Option<Arc<LlmClient>>,
    pub(crate) events: Option<AiEvents>,
    pub(crate) budget: TokenBudget,
    pub(crate) courses: CoursesService,
    /// Reads submitted text files back for the file-attempt context;
    /// `None` (no storage configured) leaves files described by name only.
    pub(crate) storage: Option<Arc<StorageClient>>,
}

impl AiService {
    /// `llm` is `None` when no provider key is configured (draft mode or
    /// 503 `ai-disabled`); `events` is `None` in a worker without Redis;
    /// `limiter` is `None` where hourly limits were already applied.
    #[must_use]
    pub fn new(
        pool: PgPool,
        config: AiConfig,
        llm: Option<Arc<LlmClient>>,
        events: Option<AiEvents>,
        limiter: Option<RateLimiter>,
    ) -> Self {
        let config = Arc::new(config);
        Self {
            budget: TokenBudget::new(Arc::clone(&config), limiter),
            courses: CoursesService::new(pool.clone()),
            pool,
            config,
            llm,
            events,
            storage: None,
        }
    }

    /// Object storage for reading submitted files into the AI context.
    #[must_use]
    pub fn with_storage(mut self, storage: Arc<StorageClient>) -> Self {
        self.storage = Some(storage);
        self
    }

    #[must_use]
    pub fn config(&self) -> &AiConfig {
        &self.config
    }

    /// The model client, when the master switch is on and a provider is
    /// configured. `None` means draft mode (or `ai-disabled`).
    pub(crate) fn provider(&self) -> Option<&Arc<LlmClient>> {
        if !self.config.provider_enabled() {
            return None;
        }
        self.llm.as_ref().filter(|llm| llm.is_enabled())
    }

    /// Legacy `_require_enabled`: master switch, then the feature flag.
    /// Both answer 503 `ai-disabled` (the legacy used 403).
    pub(crate) fn require_feature(&self, feature: AiFeature) -> Result<()> {
        if !self.config.ai_enabled {
            return Err(Error::app(
                ErrorCode::AiDisabled,
                "AI features are disabled",
            ));
        }
        if !self.config.feature_enabled(feature) {
            return Err(Error::app_with_details(
                ErrorCode::AiDisabled,
                format!("AI feature is disabled: {}", feature.as_str()),
                serde_json::json!({ "feature": feature.as_str() }),
            ));
        }
        Ok(())
    }

    /// Whether `feature` is usable right now (capabilities view).
    #[must_use]
    pub fn feature_available(&self, feature: AiFeature) -> bool {
        self.config.ai_enabled && self.config.feature_enabled(feature)
    }

    /// The user's UI locale, for prompt selection.
    pub(crate) async fn user_locale(&self, user_id: UserId) -> Result<Option<String>> {
        Ok(ab_db::identity::get_profile(&self.pool, user_id)
            .await?
            .map(|p| p.locale))
    }

    /// Every actor-facing method starts here when it touches a course.
    pub(crate) async fn visible_course(
        &self,
        actor: &Actor,
        course_id: ab_core::id::CourseId,
    ) -> Result<crate::catalog::courses::Course> {
        self.courses.get(actor, course_id).await
    }

    // UX-311: each write route's access gate on its own - the handlers
    // check it before they read the body, and the entry points still do.

    /// A course the caller can see (Q&A, study companion).
    pub async fn require_visible_course(
        &self,
        actor: &Actor,
        course_id: ab_core::id::CourseId,
    ) -> Result<()> {
        self.visible_course(actor, course_id).await.map(drop)
    }

    /// A course the caller may update (course analysis, lecture authoring).
    pub async fn require_course_updater(
        &self,
        actor: &Actor,
        course_id: ab_core::id::CourseId,
    ) -> Result<()> {
        let course = self.visible_course(actor, course_id).await?;
        policy::require_course_update(actor, &course)
    }

    /// A submission or file attempt the caller may analyse or remediate.
    pub async fn require_subject(&self, actor: &Actor, id: ab_core::id::AiSubjectId) -> Result<()> {
        self.accessible_subject(actor, id).await.map(drop)
    }

    /// A course analysis whose course the caller may update.
    pub async fn require_writable_analysis(
        &self,
        actor: &Actor,
        id: ab_core::id::AiCourseAnalysisId,
    ) -> Result<()> {
        self.writable_analysis(actor, id).await.map(drop)
    }

    /// A lecture review whose course the caller may update.
    pub async fn require_writable_review(
        &self,
        actor: &Actor,
        id: ab_core::id::AiLectureReviewId,
    ) -> Result<()> {
        let review = ab_db::ai::get_lecture_review(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("lecture review"))?;
        self.require_course_updater(actor, review.course_id).await
    }

    /// A remediation session the caller is the learner of.
    pub async fn require_remediation_learner(
        &self,
        actor: &Actor,
        id: ab_core::id::AiRemediationSessionId,
    ) -> Result<()> {
        let session = self.accessible_remediation(actor, id).await?;
        if session.student_user_id != actor.user_id {
            return Err(Error::forbidden(
                "only the learner of this session can complete it",
            ));
        }
        Ok(())
    }
}
