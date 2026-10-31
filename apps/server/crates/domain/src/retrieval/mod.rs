//! Semantic search over course material (docs/AI-FIRST.md 1).
//!
//! [`Retrieval::sweep`] (the worker's `retrieval:sweep`, every minute) re-cuts every source whose version
//! moved; [`Retrieval::search`] fuses the vector and lexical candidates with Reciprocal Rank Fusion.
//! Access is the caller's business: the AI service checks the course and passes `learner_only`.

pub mod chunker;

use std::collections::HashMap;
use std::sync::Arc;

use ab_clients::embed::{Embedder, to_pg_vector};
use ab_core::id::{ActivityId, ContentChunkId, CourseId};
use ab_core::{Error, Result};
use ab_db::retrieval::{ChunkHit, IndexedSource, NewChunk, StaleSource};
use serde_json::json;
use sqlx::PgPool;

use chunker::{Piece, item_prompt, lesson_pieces, text_pieces};

/// The worker job kind and how many sources one tick re-cuts.
pub const SWEEP_JOB: &str = "retrieval:sweep";
pub const SWEEP_BATCH: i64 = 50;
/// Candidates per side before fusion, the RRF constant and the per-source cap of the fused list.
const CANDIDATES: i64 = 40;
const RRF_K: f64 = 60.0;
const PER_SOURCE: usize = 3;

#[derive(Clone)]
pub struct Retrieval {
    pool: PgPool,
    embedder: Arc<Embedder>,
}

/// One search result.
#[derive(Debug, Clone)]
pub struct Hit {
    pub chunk_id: ContentChunkId,
    pub source_type: String,
    pub source_id: uuid::Uuid,
    pub activity_id: Option<ActivityId>,
    pub label: String,
    pub body: String,
    pub anchor: serde_json::Value,
    pub score: f64,
}

/// What a sweep did.
#[derive(Debug, Default, Clone, Copy)]
pub struct SweepReport {
    pub sources: usize,
    pub chunks: usize,
    pub failed: usize,
}

impl Retrieval {
    #[must_use]
    pub const fn new(pool: PgPool, embedder: Arc<Embedder>) -> Self {
        Self { pool, embedder }
    }

    #[must_use]
    pub fn model(&self) -> &str {
        self.embedder.model()
    }

    /// The embedder (answer embeddings of the consistency report share it).
    #[must_use]
    pub fn embedder(&self) -> &Embedder {
        &self.embedder
    }

    /// Re-cut up to [`SWEEP_BATCH`] stale sources, each in its own transaction.
    pub async fn sweep(&self) -> Result<SweepReport> {
        let stale = ab_db::retrieval::stale_sources(&self.pool, self.model(), SWEEP_BATCH).await?;
        let mut report = SweepReport::default();
        for source in stale {
            match self.index_source(&source).await {
                Ok((chunks, failed)) => {
                    report.sources += 1;
                    report.chunks += chunks;
                    report.failed += usize::from(failed);
                }
                Err(err) => {
                    report.failed += 1;
                    tracing::warn!(source_id = %source.source_id, %err, "retrieval: source not indexed");
                }
            }
        }
        Ok(report)
    }

    #[allow(clippy::too_many_lines, reason = "one match over the kinds of source")]
    async fn pieces(&self, source: &StaleSource) -> Result<(Vec<Piece>, &'static str, bool)> {
        let activity =
            |id: Option<ActivityId>| id.ok_or_else(|| Error::conflict("source without activity"));
        Ok(match source.source_type.as_str() {
            "lesson" | "activity" | "assignment" => {
                let id = activity(source.activity_id)?;
                let Some(row) = ab_db::retrieval::activity_source(&self.pool, id).await? else {
                    return Ok((Vec::new(), "learner", false));
                };
                let title = format!("{} › {}", row.chapter_name, row.name);
                let mut pieces = match source.source_type.as_str() {
                    "lesson" => lesson_pieces(&title, &row.content),
                    "assignment" => {
                        let mut text = row.instructions.clone().unwrap_or_default();
                        if let Some(criteria) = row
                            .rubric
                            .as_ref()
                            .and_then(|r| r.get("criteria"))
                            .and_then(serde_json::Value::as_array)
                        {
                            for c in criteria {
                                if let Some(label) =
                                    c.get("label").and_then(serde_json::Value::as_str)
                                {
                                    text.push_str("\n\n");
                                    text.push_str(label);
                                }
                            }
                        }
                        text_pieces(&title, &text, &json!({}))
                    }
                    _ => Vec::new(),
                };
                if pieces.is_empty() {
                    // Media and empty lessons are still findable by their name and description.
                    let description = row
                        .details
                        .get("description")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or_default();
                    let file = row
                        .content
                        .get("file_name")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or_default();
                    let text = [row.name.as_str(), description, file]
                        .iter()
                        .filter(|t| !t.trim().is_empty())
                        .copied()
                        .collect::<Vec<_>>()
                        .join("\n");
                    pieces = text_pieces(&title, &text, &json!({}));
                }
                (pieces, "learner", row.published)
            }
            "item" => {
                let items = ab_db::retrieval::item_sources(&self.pool, source.source_id).await?;
                let published = items.first().is_some_and(|i| i.published);
                let pieces = items
                    .iter()
                    .filter_map(|item| {
                        let text = item_prompt(&item.kind, &item.title, &item.body);
                        (!text.trim().is_empty()).then(|| Piece {
                            label: format!("{} › {}", item.activity_name, item.title)
                                .chars()
                                .take(500)
                                .collect(),
                            body: text.chars().take(4000).collect(),
                            anchor: json!({ "item_id": item.item_id }),
                        })
                    })
                    .collect();
                (pieces, "staff", published)
            }
            "course" => {
                let Some(row) =
                    ab_db::retrieval::course_source(&self.pool, source.course_id).await?
                else {
                    return Ok((Vec::new(), "learner", false));
                };
                let learnings = row
                    .learnings
                    .as_array()
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(|v| {
                                v.as_str().map(str::to_owned).or_else(|| {
                                    v.get("text")
                                        .and_then(serde_json::Value::as_str)
                                        .map(str::to_owned)
                                })
                            })
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
                    .unwrap_or_default();
                let text = [
                    row.description.as_str(),
                    row.about.as_str(),
                    learnings.as_str(),
                    &row.chapters.join("\n"),
                ]
                .iter()
                .filter(|t| !t.trim().is_empty())
                .copied()
                .collect::<Vec<_>>()
                .join("\n\n");
                (text_pieces(&row.name, &text, &json!({})), "learner", true)
            }
            other => return Err(Error::conflict(format!("unknown source type {other}"))),
        })
    }

    /// Cut, embed and store one source. Returns the chunk count and whether the embedder failed (the
    /// chunks are stored without vectors then; lexical search still finds them, the next sweep retries).
    pub async fn index_source(&self, source: &StaleSource) -> Result<(usize, bool)> {
        let (pieces, audience, published) = self.pieces(source).await?;
        let pieces: Vec<Piece> = pieces
            .into_iter()
            .filter(|p| !p.body.trim().is_empty())
            .map(|mut p| {
                p.body = p.body.chars().take(4000).collect();
                if p.label.trim().is_empty() {
                    p.label = "—".into();
                }
                p
            })
            .collect();
        let texts: Vec<String> = pieces
            .iter()
            .map(|p| format!("{}\n{}", p.label, p.body))
            .collect();
        let (vectors, error) = if texts.is_empty() {
            (Vec::new(), None)
        } else {
            match self.embedder.embed(&texts).await {
                Ok(v) => (v, None),
                Err(err) => (Vec::new(), Some(err.to_string())),
            }
        };
        let chunks: Vec<NewChunk> = pieces
            .into_iter()
            .enumerate()
            .map(|(i, p)| NewChunk {
                audience,
                published,
                token_estimate: i32::try_from(p.body.chars().count() / 4).unwrap_or(i32::MAX),
                embedding: vectors
                    .get(i)
                    .filter(|v| v.iter().any(|x| *x != 0.0))
                    .map(|v| to_pg_vector(v)),
                label: p.label,
                body: p.body,
                anchor: p.anchor,
            })
            .collect();
        let mut tx = self.pool.begin().await?;
        ab_db::retrieval::replace_chunks(
            &mut tx,
            &IndexedSource {
                source_type: &source.source_type,
                source_id: source.source_id,
                course_id: source.course_id,
                activity_id: source.activity_id,
                version: source.version,
                embedding_model: (!chunks.is_empty() && error.is_none()).then(|| self.model()),
                error: error.as_deref(),
            },
            &chunks,
        )
        .await?;
        tx.commit().await?;
        Ok((chunks.len(), error.is_some()))
    }

    /// Hybrid search inside one course. A failing embedder degrades to lexical search.
    pub async fn search(
        &self,
        course_id: CourseId,
        learner_only: bool,
        query: &str,
        limit: usize,
    ) -> Result<Vec<Hit>> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let mut lists = Vec::new();
        match self.embedder.embed(&[query.to_owned()]).await {
            Ok(vectors) => {
                if let Some(v) = vectors.first().filter(|v| v.iter().any(|x| *x != 0.0)) {
                    lists.push(
                        ab_db::retrieval::vector_candidates(
                            &self.pool,
                            course_id,
                            learner_only,
                            &to_pg_vector(v),
                            self.model(),
                            CANDIDATES,
                        )
                        .await?,
                    );
                }
            }
            Err(err) => tracing::warn!(%err, "retrieval: query not embedded; lexical only"),
        }
        if let Some(tsquery) = fts_query(query) {
            lists.push(
                ab_db::retrieval::lexical_candidates(
                    &self.pool,
                    course_id,
                    learner_only,
                    &tsquery,
                    CANDIDATES,
                )
                .await?,
            );
        }
        Ok(fuse(lists, limit))
    }

    /// Forget the course's index; the sweep re-cuts it within minutes.
    pub async fn reset_course(&self, course_id: CourseId) -> Result<u64> {
        ab_db::retrieval::reset_course(&self.pool, course_id).await
    }

    pub async fn status(&self, course_id: CourseId) -> Result<ab_db::retrieval::IndexStatusRow> {
        ab_db::retrieval::index_status(&self.pool, course_id, self.model()).await
    }
}

/// An OR of word prefixes for `to_tsquery('simple', search_fold(...))`: words of three or more letters,
/// cut to a stem-like prefix so Russian and Kazakh endings still meet. `None` without usable words.
#[must_use]
pub fn fts_query(query: &str) -> Option<String> {
    let mut terms: Vec<String> = Vec::new();
    for word in query
        .split(|c: char| !c.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|w| w.chars().count() >= 3)
    {
        let n = word.chars().count();
        let keep = if n > 6 { n - 2 } else { n.clamp(3, 5) };
        let prefix: String = word.chars().take(keep).collect();
        if !terms.contains(&prefix) {
            terms.push(prefix);
        }
        if terms.len() == 12 {
            break;
        }
    }
    (!terms.is_empty()).then(|| {
        terms
            .iter()
            .map(|t| format!("{t}:*"))
            .collect::<Vec<_>>()
            .join(" | ")
    })
}

/// Reciprocal Rank Fusion of ranked candidate lists, at most [`PER_SOURCE`] chunks per source.
#[must_use]
pub fn fuse(lists: Vec<Vec<ChunkHit>>, limit: usize) -> Vec<Hit> {
    let mut scores: HashMap<ContentChunkId, (f64, ChunkHit)> = HashMap::new();
    for list in lists {
        for (rank, hit) in list.into_iter().enumerate() {
            #[allow(clippy::cast_precision_loss, reason = "ranks are below 100")]
            let add = 1.0 / (RRF_K + rank as f64 + 1.0);
            scores
                .entry(hit.id)
                .and_modify(|(s, _)| *s += add)
                .or_insert((add, hit));
        }
    }
    let mut ranked: Vec<(f64, ChunkHit)> = scores.into_values().collect();
    ranked.sort_by(|a, b| b.0.total_cmp(&a.0).then_with(|| a.1.id.0.cmp(&b.1.id.0)));
    let mut per_source: HashMap<uuid::Uuid, usize> = HashMap::new();
    ranked
        .into_iter()
        .filter(|(_, hit)| {
            let n = per_source.entry(hit.source_id).or_default();
            *n += 1;
            *n <= PER_SOURCE
        })
        .take(limit)
        .map(|(score, h)| Hit {
            chunk_id: h.id,
            source_type: h.source_type,
            source_id: h.source_id,
            activity_id: h.activity_id,
            label: h.label,
            body: h.body,
            anchor: h.anchor,
            score,
        })
        .collect()
}

#[cfg(test)]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::float_cmp,
    clippy::panic
)]
mod tests {
    use super::*;

    fn hit(id: u128, source: u128) -> ChunkHit {
        ChunkHit {
            id: ContentChunkId(uuid::Uuid::from_u128(id)),
            source_type: "lesson".into(),
            source_id: uuid::Uuid::from_u128(source),
            activity_id: None,
            label: format!("L{id}"),
            body: String::new(),
            anchor: json!({}),
            score: 0.0,
        }
    }

    #[test]
    fn fusion_rewards_agreement_between_lists() {
        let fused = fuse(
            vec![vec![hit(1, 1), hit(2, 2)], vec![hit(2, 2), hit(3, 3)]],
            10,
        );
        assert_eq!(fused[0].chunk_id.0, uuid::Uuid::from_u128(2));
        assert_eq!(fused.len(), 3);
    }

    #[test]
    fn fusion_caps_chunks_per_source_and_limit() {
        let list: Vec<ChunkHit> = (1..=6).map(|i| hit(i, 9)).collect();
        assert_eq!(fuse(vec![list], 10).len(), PER_SOURCE);
        let list: Vec<ChunkHit> = (1..=6).map(|i| hit(i, i)).collect();
        assert_eq!(fuse(vec![list], 2).len(), 2);
    }

    #[test]
    fn fts_query_ors_prefixes() {
        assert_eq!(
            fts_query("Что такое рекурсия?").as_deref(),
            Some("что:* | такое:* | рекурс:*")
        );
        assert_eq!(fts_query("a b"), None);
        // Only letters and digits reach the tsquery: punctuation cannot inject operators.
        assert_eq!(
            fts_query("O'Reilly; DROP & !x").as_deref(),
            Some("reill:* | drop:*")
        );
    }
}
