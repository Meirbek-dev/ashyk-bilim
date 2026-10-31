//! The AI-first foundation's jobs (docs/AI-FIRST.md).
//!
//! `retrieval:sweep` keeps the material index in step with the courses (scheduled each minute),
//! `mastery:ingest` / `mastery:rebuild` derive mastery evidence from one fact or a whole course,
//! `ai:grade-draft` queues an auto draft for a handed-in work.

use ab_core::Result;
use ab_core::id::CourseId;
use ab_domain::ai::AiService;
use ab_domain::mastery::MasteryService;
use ab_domain::retrieval::Retrieval;
use futures::FutureExt;
use futures::future::BoxFuture;

use crate::JobHandler;

pub const SWEEP_KIND: &str = ab_domain::retrieval::SWEEP_JOB;
pub const INGEST_KIND: &str = ab_domain::mastery::INGEST_JOB;
pub const REBUILD_KIND: &str = ab_domain::mastery::REBUILD_JOB;
pub const AUTO_DRAFT_KIND: &str = ab_domain::ai::assist::AUTO_DRAFT_JOB;

fn field<T: serde::de::DeserializeOwned>(payload: &serde_json::Value, key: &str) -> Result<T> {
    serde_json::from_value(payload[key].clone())
        .map_err(|e| ab_core::Error::internal(format!("job payload {key}"), e))
}

pub struct RetrievalSweep {
    retrieval: Retrieval,
}

impl RetrievalSweep {
    #[must_use]
    pub const fn new(retrieval: Retrieval) -> Self {
        Self { retrieval }
    }
}

impl JobHandler for RetrievalSweep {
    fn kind(&self) -> &'static str {
        SWEEP_KIND
    }

    fn handle(&self, _payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let retrieval = self.retrieval.clone();
        async move {
            let report = retrieval.sweep().await?;
            if report.sources > 0 {
                tracing::info!(
                    sources = report.sources,
                    chunks = report.chunks,
                    failed = report.failed,
                    "material index swept"
                );
            }
            Ok(())
        }
        .boxed()
    }
}

pub struct MasteryIngest {
    mastery: MasteryService,
}

impl MasteryIngest {
    #[must_use]
    pub const fn new(mastery: MasteryService) -> Self {
        Self { mastery }
    }
}

impl JobHandler for MasteryIngest {
    fn kind(&self) -> &'static str {
        INGEST_KIND
    }

    fn handle(&self, payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let mastery = self.mastery.clone();
        async move {
            let source_type: String = field(&payload, "source_type")?;
            let source_id: uuid::Uuid = field(&payload, "source_id")?;
            mastery.ingest(&source_type, source_id).await.map(drop)
        }
        .boxed()
    }
}

pub struct MasteryRebuild {
    mastery: MasteryService,
}

impl MasteryRebuild {
    #[must_use]
    pub const fn new(mastery: MasteryService) -> Self {
        Self { mastery }
    }
}

impl JobHandler for MasteryRebuild {
    fn kind(&self) -> &'static str {
        REBUILD_KIND
    }

    fn handle(&self, payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let mastery = self.mastery.clone();
        async move {
            let course_id: CourseId = field(&payload, "course_id")?;
            mastery.rebuild(course_id).await.map(drop)
        }
        .boxed()
    }
}

pub struct AutoGradeDraft {
    ai: AiService,
}

impl AutoGradeDraft {
    #[must_use]
    pub const fn new(ai: AiService) -> Self {
        Self { ai }
    }
}

impl JobHandler for AutoGradeDraft {
    fn kind(&self) -> &'static str {
        AUTO_DRAFT_KIND
    }

    fn handle(&self, payload: serde_json::Value) -> BoxFuture<'static, Result<()>> {
        let ai = self.ai.clone();
        async move {
            let subject_id: uuid::Uuid = field(&payload, "subject_id")?;
            ai.auto_grade_draft(subject_id).await
        }
        .boxed()
    }
}
