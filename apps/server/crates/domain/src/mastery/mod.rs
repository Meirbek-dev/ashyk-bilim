//! Learner mastery per course concept (docs/AI-FIRST.md 3).
//!
//! Evidence is derived from graded work through the *approved* concept tags and replaced whole per source,
//! so re-grading, re-tagging or a rebuild is always the same computation: derive -> replace -> replay every
//! touched (learner, concept) pair with [`model::replay`]. The writers of the facts enqueue
//! [`INGEST_JOB`] in their own transaction; [`REBUILD_JOB`] re-derives a whole course.

pub mod model;

use std::collections::{BTreeSet, HashMap};

use ab_core::Result;
use ab_core::id::{ActivityId, ConceptId, CourseId};
use ab_db::concepts::{ActiveTag, NewEvidence};
use ab_db::queue::NewJob;
use serde_json::json;
use sqlx::{PgConnection, PgPool};

use crate::retrieval::Retrieval;
use model::{EvidenceKind, Observation};

pub const INGEST_JOB: &str = "mastery:ingest";
pub const REBUILD_JOB: &str = "mastery:rebuild";

/// The kinds of fact a mastery job names (`mastery_evidence.source_type`).
pub const SOURCE_ITEM: &str = "item";
pub const SOURCE_FILE_ATTEMPT: &str = "file_attempt";
pub const SOURCE_CODE_RUN: &str = "code_run";
pub const SOURCE_REMEDIATION: &str = "remediation";
pub const SOURCE_AI_QUESTION: &str = "ai_question";

/// Weight of a visible-tests run relative to its tag, and of an AI question.
const CODE_RUN_WEIGHT: f32 = 0.5;
const QUESTION_SCORE: f32 = 0.3;
const QUESTION_WEIGHT: f32 = 0.15;
const QUESTION_CONCEPTS: usize = 3;

/// Enqueue an ingest of one fact on the writer's connection (inside its transaction).
pub async fn owe_ingest(
    conn: &mut PgConnection,
    source_type: &str,
    source_id: uuid::Uuid,
) -> Result<()> {
    ab_db::queue::enqueue(
        &mut *conn,
        &NewJob::new(
            INGEST_JOB,
            json!({ "source_type": source_type, "source_id": source_id }),
        )
        .max_attempts(5)
        .dedupe(format!("mastery:{source_type}:{source_id}")),
    )
    .await?;
    Ok(())
}

/// Same, outside a transaction (facts written without one: code runs, AI questions).
pub async fn owe_ingest_now(pool: &PgPool, source_type: &str, source_id: uuid::Uuid) -> Result<()> {
    let mut conn = pool.acquire().await?;
    owe_ingest(&mut conn, source_type, source_id).await
}

/// A debounced full rebuild of a course (tags changed).
pub async fn owe_rebuild(pool: &PgPool, course_id: CourseId) -> Result<()> {
    ab_db::queue::enqueue(
        pool,
        &NewJob::new(REBUILD_JOB, json!({ "course_id": course_id }))
            .delayed(std::time::Duration::from_secs(30))
            .max_attempts(5)
            .dedupe(format!("mastery:rebuild:{course_id}")),
    )
    .await?;
    Ok(())
}

#[derive(Clone)]
pub struct MasteryService {
    pool: PgPool,
    retrieval: Retrieval,
}

/// The evidence one fact yields, before storage.
struct Derived {
    rows: Vec<NewEvidence>,
}

fn item_kind(kind: &str) -> EvidenceKind {
    match kind {
        "choice" | "matching" => EvidenceKind::Choice,
        "code" => EvidenceKind::Code,
        _ => EvidenceKind::Open,
    }
}

/// Tags for one item: its own tags when it has any, otherwise its activity's.
fn tags_for(tags: &[ActiveTag], item: Option<uuid::Uuid>) -> Vec<&ActiveTag> {
    if let Some(item) = item {
        let own: Vec<&ActiveTag> = tags.iter().filter(|t| t.item_id == Some(item)).collect();
        if !own.is_empty() {
            return own;
        }
    }
    tags.iter().filter(|t| t.item_id.is_none()).collect()
}

#[allow(
    clippy::cast_possible_truncation,
    reason = "scores are ratios in [0, 1]"
)]
fn ratio(score: f64, max: f64) -> f32 {
    if max <= 0.0 {
        0.0
    } else {
        (score / max).clamp(0.0, 1.0) as f32
    }
}

impl MasteryService {
    #[must_use]
    pub const fn new(pool: PgPool, retrieval: Retrieval) -> Self {
        Self { pool, retrieval }
    }

    #[allow(clippy::too_many_lines, reason = "one match over the kinds of fact")]
    async fn derive(&self, source_type: &str, id: uuid::Uuid) -> Result<Option<Derived>> {
        let rows = match source_type {
            SOURCE_ITEM => {
                let Some(fact) = ab_db::concepts::submission_fact(&self.pool, id).await? else {
                    return Ok(None);
                };
                if fact.preview || !fact.visible {
                    return Ok(Some(Derived { rows: Vec::new() }));
                }
                let tags =
                    ab_db::concepts::active_tags_for_activity(&self.pool, fact.activity_id).await?;
                let items = fact
                    .grading
                    .get("items")
                    .and_then(serde_json::Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let mut rows = Vec::new();
                for item in items {
                    let Some(item_id) = item
                        .get("item_id")
                        .and_then(serde_json::Value::as_str)
                        .and_then(|s| s.parse::<uuid::Uuid>().ok())
                    else {
                        continue;
                    };
                    let max = item
                        .get("max_score")
                        .and_then(serde_json::Value::as_f64)
                        .unwrap_or(0.0);
                    let score = item
                        .get("score")
                        .and_then(serde_json::Value::as_f64)
                        .unwrap_or(0.0);
                    let manual = item
                        .get("needs_manual_review")
                        .and_then(serde_json::Value::as_bool)
                        .unwrap_or(false);
                    if max <= 0.0 || manual {
                        continue;
                    }
                    let kind = fact
                        .item_kinds
                        .get(item_id.to_string())
                        .and_then(serde_json::Value::as_str)
                        .map_or(EvidenceKind::Open, item_kind);
                    for tag in tags_for(&tags, Some(item_id)) {
                        rows.push(NewEvidence {
                            course_id: fact.course_id,
                            user_id: fact.user_id,
                            concept_id: tag.concept_id,
                            part_id: Some(item_id),
                            score: ratio(score, max),
                            weight: tag.weight,
                            kind: kind.as_str(),
                            observed_at: fact.observed_at,
                        });
                    }
                }
                rows
            }
            SOURCE_FILE_ATTEMPT => {
                let Some(fact) = ab_db::concepts::file_attempt_fact(&self.pool, id).await? else {
                    return Ok(None);
                };
                let Some(score) = fact.final_score.filter(|_| fact.published && !fact.preview)
                else {
                    return Ok(Some(Derived { rows: Vec::new() }));
                };
                let tags =
                    ab_db::concepts::active_tags_for_activity(&self.pool, fact.activity_id).await?;
                tags_for(&tags, None)
                    .into_iter()
                    .map(|tag| NewEvidence {
                        course_id: fact.course_id,
                        user_id: fact.user_id,
                        concept_id: tag.concept_id,
                        part_id: None,
                        score: ratio(score, 100.0),
                        weight: tag.weight,
                        kind: EvidenceKind::Open.as_str(),
                        observed_at: fact.observed_at,
                    })
                    .collect()
            }
            SOURCE_CODE_RUN => {
                let Some(fact) = ab_db::concepts::code_run_fact(&self.pool, id).await? else {
                    return Ok(None);
                };
                if !fact.counts {
                    return Ok(Some(Derived { rows: Vec::new() }));
                }
                let tags =
                    ab_db::concepts::active_tags_for_activity(&self.pool, fact.activity_id).await?;
                tags_for(&tags, Some(fact.item_id))
                    .into_iter()
                    .map(|tag| NewEvidence {
                        course_id: fact.course_id,
                        user_id: fact.user_id,
                        concept_id: tag.concept_id,
                        part_id: Some(fact.item_id),
                        score: ratio(f64::from(fact.passed), f64::from(fact.total)),
                        weight: tag.weight * CODE_RUN_WEIGHT,
                        kind: EvidenceKind::Code.as_str(),
                        observed_at: fact.observed_at,
                    })
                    .collect()
            }
            SOURCE_REMEDIATION => {
                let Some(fact) = ab_db::concepts::remediation_fact(&self.pool, id).await? else {
                    return Ok(None);
                };
                let Some(score) = fact.score.filter(|_| fact.finished) else {
                    return Ok(Some(Derived { rows: Vec::new() }));
                };
                let tags =
                    ab_db::concepts::active_tags_for_activity(&self.pool, fact.activity_id).await?;
                tags_for(&tags, None)
                    .into_iter()
                    .map(|tag| NewEvidence {
                        course_id: fact.course_id,
                        user_id: fact.user_id,
                        concept_id: tag.concept_id,
                        part_id: None,
                        score: ratio(f64::from(score), 100.0),
                        weight: tag.weight,
                        kind: EvidenceKind::Open.as_str(),
                        observed_at: fact.observed_at,
                    })
                    .collect()
            }
            SOURCE_AI_QUESTION => {
                let Some(fact) = ab_db::concepts::question_fact(&self.pool, id).await? else {
                    return Ok(None);
                };
                let Some(user_id) = fact.user_id.filter(|_| fact.is_question && !fact.staff) else {
                    return Ok(Some(Derived { rows: Vec::new() }));
                };
                let hits = self
                    .retrieval
                    .search(fact.course_id, true, &fact.content, 5)
                    .await?;
                let activities: Vec<uuid::Uuid> = hits
                    .iter()
                    .filter_map(|h| h.activity_id.map(|a| a.0))
                    .collect::<BTreeSet<_>>()
                    .into_iter()
                    .collect();
                let tags =
                    ab_db::concepts::active_tags_for_activities(&self.pool, &activities).await?;
                // The concepts of the best-matching activities first.
                let mut seen: Vec<ConceptId> = Vec::new();
                for hit in &hits {
                    for tag in tags
                        .iter()
                        .filter(|t| Some(t.activity_id) == hit.activity_id && t.item_id.is_none())
                    {
                        if !seen.contains(&tag.concept_id) && seen.len() < QUESTION_CONCEPTS {
                            seen.push(tag.concept_id);
                        }
                    }
                }
                seen.into_iter()
                    .map(|concept_id| NewEvidence {
                        course_id: fact.course_id,
                        user_id,
                        concept_id,
                        part_id: None,
                        score: QUESTION_SCORE,
                        weight: QUESTION_WEIGHT,
                        kind: EvidenceKind::Signal.as_str(),
                        observed_at: fact.observed_at,
                    })
                    .collect()
            }
            _ => return Ok(None),
        };
        Ok(Some(Derived { rows }))
    }

    /// Re-derive one fact's evidence and replay the pairs it touches.
    pub async fn ingest(&self, source_type: &str, source_id: uuid::Uuid) -> Result<usize> {
        let derived = self
            .derive(source_type, source_id)
            .await?
            .unwrap_or(Derived { rows: Vec::new() });
        let mut tx = self.pool.begin().await?;
        let touched =
            ab_db::concepts::replace_evidence(&mut tx, source_type, source_id, &derived.rows)
                .await?;
        for (user_id, concept_id, course_id) in &touched {
            replay_pair(&mut tx, *user_id, *concept_id, *course_id).await?;
        }
        tx.commit().await?;
        Ok(derived.rows.len())
    }

    /// Re-derive a whole course from scratch.
    pub async fn rebuild(&self, course_id: CourseId) -> Result<usize> {
        {
            let mut tx = self.pool.begin().await?;
            ab_db::concepts::clear_course_mastery(&mut tx, course_id).await?;
            tx.commit().await?;
        }
        let mut total = 0;
        for (kind, id) in ab_db::concepts::course_fact_ids(&self.pool, course_id).await? {
            total += self.ingest(&kind, id).await?;
        }
        Ok(total)
    }
}

async fn replay_pair(
    conn: &mut PgConnection,
    user_id: ab_core::id::UserId,
    concept_id: ConceptId,
    course_id: CourseId,
) -> Result<()> {
    let evidence = ab_db::concepts::evidence_for(&mut *conn, user_id, concept_id).await?;
    let observations: Vec<Observation> = evidence
        .iter()
        .map(|e| Observation {
            score: f64::from(e.score),
            weight: f64::from(e.weight),
            kind: EvidenceKind::parse(&e.kind),
        })
        .collect();
    #[allow(clippy::cast_possible_truncation, reason = "a probability")]
    let p = model::replay(&observations) as f32;
    ab_db::concepts::upsert_mastery(
        &mut *conn,
        user_id,
        concept_id,
        course_id,
        p,
        i32::try_from(evidence.len()).unwrap_or(i32::MAX),
        evidence.last().map(|e| e.observed_at),
    )
    .await
}

/// Activities a learner should revisit for a weak concept, strongest tags first (for the learner view).
#[must_use]
pub fn activities_for(tags: &[ab_db::concepts::TagRow], concept: ConceptId) -> Vec<ActivityId> {
    let mut weighted: HashMap<ActivityId, f32> = HashMap::new();
    for tag in tags
        .iter()
        .filter(|t| t.concept_id == concept && t.status == "approved")
    {
        let w = weighted.entry(tag.activity_id).or_default();
        *w = w.max(tag.weight);
    }
    let mut out: Vec<(ActivityId, f32)> = weighted.into_iter().collect();
    out.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.0.cmp(&b.0.0)));
    out.into_iter().map(|(a, _)| a).collect()
}
