//! Course material search for people (docs/AI-FIRST.md 1.6): learners search what they can open,
//! teachers everything; teachers also see and reset the index.

use ab_core::Result;
use ab_core::ai::AiFeature;
use ab_core::id::{ActivityId, ContentChunkId, CourseId};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::ai::AiService;
use crate::ai::policy::can_update_course;
use crate::identity::Actor;

pub const MAX_SEARCH_LIMIT: usize = 20;
const EXCERPT_CHARS: usize = 400;
/// Passages put in front of a question's context.
const RETRIEVED: usize = 6;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SearchHit {
    pub chunk_id: ContentChunkId,
    /// `activity`, `item` or `course`.
    pub source_type: String,
    pub source_id: uuid::Uuid,
    pub activity_id: Option<ActivityId>,
    /// Where it is: activity and heading path.
    pub label: String,
    pub excerpt: String,
    /// The place inside the source for a deep link.
    pub anchor: SearchAnchor,
    pub score: f64,
}

/// Where a passage sits in its source: the heading path and block range of a lesson, or the question.
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct SearchAnchor {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub heading_path: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub block_start: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub block_end: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub item_id: Option<uuid::Uuid>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct IndexStatus {
    pub chunks: i64,
    pub embedded_chunks: i64,
    pub sources: i64,
    pub failed_sources: i64,
    pub last_indexed_at: Option<i64>,
    /// The embedder in use (`hash-ngram-v1` without a provider).
    pub model: String,
}

impl AiService {
    pub async fn search_course(
        &self,
        actor: &Actor,
        course_id: CourseId,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchHit>> {
        self.require_feature(AiFeature::SemanticSearch).await?;
        let course = self.visible_course(actor, course_id).await?;
        let learner_only = !can_update_course(actor, &course);
        let hits = self
            .retrieval
            .search(
                course_id,
                learner_only,
                query,
                limit.clamp(1, MAX_SEARCH_LIMIT),
            )
            .await?;
        Ok(hits
            .into_iter()
            .map(|h| SearchHit {
                chunk_id: h.chunk_id,
                source_type: h.source_type,
                source_id: h.source_id,
                activity_id: h.activity_id,
                label: h.label,
                excerpt: h.body.chars().take(EXCERPT_CHARS).collect(),
                // Anchors are written by the chunker; an unknown shape only loses the deep link.
                anchor: serde_json::from_value(h.anchor).unwrap_or_default(),
                score: h.score,
            })
            .collect())
    }

    async fn index_owner(&self, actor: &Actor, course_id: CourseId) -> Result<()> {
        let course = self.visible_course(actor, course_id).await?;
        crate::ai::policy::require_course_update(actor, &course)
    }

    /// UX-311: the reindex gate on its own.
    pub async fn require_index_owner(&self, actor: &Actor, course_id: CourseId) -> Result<()> {
        self.index_owner(actor, course_id).await
    }

    pub async fn index_status(&self, actor: &Actor, course_id: CourseId) -> Result<IndexStatus> {
        self.index_owner(actor, course_id).await?;
        let row = self.retrieval.status(course_id).await?;
        Ok(IndexStatus {
            chunks: row.chunks,
            embedded_chunks: row.embedded_chunks,
            sources: row.sources,
            failed_sources: row.failed_sources,
            last_indexed_at: row.last_indexed_at,
            model: self.retrieval.model().to_owned(),
        })
    }

    /// docs/AI-FIRST.md 1.6: put the passages that answer `question` in front of a course outline, so
    /// they survive the fitting (the outline only shows the start of each lesson). Without hits, with
    /// search switched off or failing, the bundle stays as it was.
    pub(crate) async fn with_retrieved(
        &self,
        mut bundle: crate::ai::context::ContextBundle,
        course_id: CourseId,
        learner_only: bool,
        question: &str,
    ) -> crate::ai::context::ContextBundle {
        if self
            .require_feature(AiFeature::SemanticSearch)
            .await
            .is_err()
        {
            return bundle;
        }
        let hits = match self
            .retrieval
            .search(course_id, learner_only, question, RETRIEVED)
            .await
        {
            Ok(hits) => hits,
            Err(err) => {
                tracing::warn!(%course_id, %err, "retrieval failed; the outline alone goes to the model");
                return bundle;
            }
        };
        let found: Vec<crate::ai::context::ContextSource> = hits
            .into_iter()
            .filter_map(|h| {
                let activity_id = h.activity_id?;
                Some(crate::ai::context::ContextSource {
                    citation_id: format!("chunk:{}", h.chunk_id),
                    label: h.label,
                    source_type: "activity".into(),
                    source_ref: Some(activity_id.to_string()),
                    excerpt: h.body,
                    metadata: serde_json::json!({
                        "course_id": course_id,
                        "activity_id": activity_id,
                        "anchor": h.anchor,
                        "retrieved": true,
                    }),
                })
            })
            .collect();
        if !found.is_empty() {
            // After the course summary, before the outline.
            let at = bundle.sources.len().min(1);
            bundle.sources.splice(at..at, found);
        }
        bundle
    }

    /// Forgets the course's index state; the next sweeps rebuild it.
    pub async fn reindex_course(&self, actor: &Actor, course_id: CourseId) -> Result<IndexStatus> {
        self.index_owner(actor, course_id).await?;
        self.retrieval.reset_course(course_id).await?;
        self.index_status(actor, course_id).await
    }
}
