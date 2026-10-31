//! The concept graph a teacher curates (docs/AI-FIRST.md 2.3) and what the mastery model says about
//! it (3.4). Every change to the approved graph re-derives the course's mastery (`mastery:rebuild`).

use std::collections::{HashMap, HashSet};

use ab_core::ai::AiFeature;
use ab_core::id::{ActivityId, AiRunId, ConceptId, ConceptTagId, CourseId, UserId};
use ab_core::{Error, ErrorCode, FieldError, Result};
use ab_db::concepts::{ConceptRow, NewConcept, NewTag, TagRow};
use serde::Serialize;
use utoipa::ToSchema;

use crate::ai::AiService;
use crate::ai::agents::concept_mapper::slugify;
use crate::ai::policy::can_update_course;
use crate::catalog::courses::Course;
use crate::identity::Actor;
use crate::mastery::model::{MasteryLevel, level};

const STATUSES: [&str; 3] = ["suggested", "approved", "rejected"];

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ConceptView {
    pub id: ConceptId,
    pub slug: String,
    pub name: String,
    pub description: String,
    /// `suggested`, `approved` or `rejected`.
    pub status: String,
    /// `ai` or `teacher`.
    pub origin: String,
    pub position: i32,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PrerequisiteView {
    pub concept_id: ConceptId,
    pub requires_id: ConceptId,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ConceptTagView {
    pub id: ConceptTagId,
    pub concept_id: ConceptId,
    pub activity_id: ActivityId,
    /// A question of the activity; `None` tags the whole activity.
    pub item_id: Option<uuid::Uuid>,
    pub weight: f32,
    pub status: String,
    pub origin: String,
    pub rationale: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ConceptGraph {
    pub concepts: Vec<ConceptView>,
    pub prerequisites: Vec<PrerequisiteView>,
    pub tags: Vec<ConceptTagView>,
    /// The newest concept-mapping run of the course (teachers only).
    pub latest_run_id: Option<AiRunId>,
    /// The caller may curate the graph.
    pub can_edit: bool,
}

fn concept_view(c: ConceptRow) -> ConceptView {
    ConceptView {
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        status: c.status,
        origin: c.origin,
        position: c.position,
    }
}

fn tag_view(t: TagRow) -> ConceptTagView {
    ConceptTagView {
        id: t.id,
        concept_id: t.concept_id,
        activity_id: t.activity_id,
        item_id: t.item_id,
        weight: t.weight,
        status: t.status,
        origin: t.origin,
        rationale: t.rationale,
    }
}

fn invalid(field: &str, code: &str, message: impl Into<String>) -> Error {
    Error::validation(vec![FieldError {
        field: field.into(),
        code: code.into(),
        message: message.into(),
    }])
}

fn check_status(status: &str) -> Result<()> {
    if STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(invalid(
            "status",
            "enum",
            "status is suggested, approved or rejected",
        ))
    }
}

fn check_weight(weight: f32) -> Result<()> {
    if weight > 0.0 && weight <= 1.0 {
        Ok(())
    } else {
        Err(invalid("weight", "range", "weight must be within (0, 1]"))
    }
}

/// Whether `concept -> requires` edges (with `concept`'s set replaced by `requires`) contain a cycle.
#[must_use]
pub fn creates_cycle(
    edges: &[(ConceptId, ConceptId)],
    concept: ConceptId,
    requires: &[ConceptId],
) -> bool {
    let mut graph: HashMap<ConceptId, Vec<ConceptId>> = HashMap::new();
    for (from, to) in edges.iter().filter(|(from, _)| *from != concept) {
        graph.entry(*from).or_default().push(*to);
    }
    graph.insert(concept, requires.to_vec());
    // From each new requirement, can we walk back to `concept`?
    let mut stack: Vec<ConceptId> = requires.to_vec();
    let mut seen = HashSet::new();
    while let Some(next) = stack.pop() {
        if next == concept {
            return true;
        }
        if seen.insert(next) {
            stack.extend(graph.get(&next).into_iter().flatten().copied());
        }
    }
    false
}

/// One concept of a mastery view.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ConceptMastery {
    pub concept_id: ConceptId,
    pub name: String,
    pub level: MasteryLevel,
    /// Probability the concept is known, 0..1.
    pub p_known: f32,
    pub evidence_count: i32,
    pub last_observed_at: Option<i64>,
    /// No evidence for a long time: the estimate may be out of date.
    pub stale: bool,
    /// Activities to revisit (weak concepts only), strongest tag first.
    pub review: Vec<ActivityRef>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ActivityRef {
    pub id: ActivityId,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct LearnerMastery {
    pub user_id: UserId,
    pub concepts: Vec<ConceptMastery>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct LearnerRef {
    pub user_id: UserId,
    pub name: String,
}

/// One concept across the class.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ClassConcept {
    pub concept_id: ConceptId,
    pub name: String,
    /// Mean `p_known` over learners with evidence; `None` without any.
    pub mean_p: Option<f32>,
    pub not_started: i64,
    pub struggling: i64,
    pub learning: i64,
    pub mastered: i64,
    /// The learners struggling with it (lowest first, at most 20).
    pub struggling_learners: Vec<LearnerRef>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ClassMastery {
    pub learners: i64,
    pub concepts: Vec<ClassConcept>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct EvidenceView {
    pub concept_id: ConceptId,
    /// `item`, `file_attempt`, `code_run`, `remediation` or `ai_question`.
    pub source_type: String,
    pub source_id: uuid::Uuid,
    pub part_id: Option<uuid::Uuid>,
    pub score: f32,
    pub weight: f32,
    pub observed_at: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct LearnerMasteryDetail {
    pub learner: LearnerRef,
    pub concepts: Vec<ConceptMastery>,
    pub evidence: Vec<EvidenceView>,
}

const WEAK_REVIEW: usize = 3;
/// [`crate::mastery::model::PRIOR`] as stored (`real`).
const PRIOR_F32: f32 = 0.15;

impl AiService {
    /// A course the caller may curate (`require_course_update`, not archived).
    async fn concept_editor(&self, actor: &Actor, course_id: CourseId) -> Result<Course> {
        let course = self.visible_course(actor, course_id).await?;
        crate::ai::policy::require_course_update(actor, &course)?;
        course.ensure_not_archived()?;
        Ok(course)
    }

    async fn editable_concept(&self, actor: &Actor, id: ConceptId) -> Result<ConceptRow> {
        let concept = ab_db::concepts::get_concept(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("concept"))?;
        self.concept_editor(actor, concept.course_id)
            .await
            .map_err(|e| hide_forbidden(e, "concept"))?;
        Ok(concept)
    }

    async fn editable_tag(&self, actor: &Actor, id: ConceptTagId) -> Result<(CourseId, TagRow)> {
        let (course_id, tag) = ab_db::concepts::get_tag(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("concept tag"))?;
        self.concept_editor(actor, course_id)
            .await
            .map_err(|e| hide_forbidden(e, "concept tag"))?;
        Ok((course_id, tag))
    }

    /// UX-311: the write gate of the course-level concept routes on its own.
    pub async fn require_concept_editor(&self, actor: &Actor, course_id: CourseId) -> Result<()> {
        self.concept_editor(actor, course_id).await.map(drop)
    }

    /// The write gate of a concept route.
    pub async fn require_concept(&self, actor: &Actor, id: ConceptId) -> Result<()> {
        self.editable_concept(actor, id).await.map(drop)
    }

    /// The write gate of a tag route.
    pub async fn require_concept_tag(&self, actor: &Actor, id: ConceptTagId) -> Result<()> {
        self.editable_tag(actor, id).await.map(drop)
    }

    /// The graph: everything for a teacher; approved concepts, prerequisites and tags for a learner.
    pub async fn concept_graph(&self, actor: &Actor, course_id: CourseId) -> Result<ConceptGraph> {
        let course = self.visible_course(actor, course_id).await?;
        let editor = can_update_course(actor, &course);
        let keep = |status: &str| editor || status == "approved";
        let concepts: Vec<ConceptView> = ab_db::concepts::list_concepts(&self.pool, course_id)
            .await?
            .into_iter()
            .filter(|c| keep(&c.status))
            .map(concept_view)
            .collect();
        let known: HashSet<ConceptId> = concepts.iter().map(|c| c.id).collect();
        let prerequisites = ab_db::concepts::list_prerequisites(&self.pool, course_id)
            .await?
            .into_iter()
            .filter(|p| {
                keep(&p.status) && known.contains(&p.concept_id) && known.contains(&p.requires_id)
            })
            .map(|p| PrerequisiteView {
                concept_id: p.concept_id,
                requires_id: p.requires_id,
                status: p.status,
            })
            .collect();
        let tags = ab_db::concepts::list_tags(&self.pool, course_id)
            .await?
            .into_iter()
            .filter(|t| keep(&t.status) && known.contains(&t.concept_id))
            .map(tag_view)
            .collect();
        let latest_run_id = if editor {
            ab_db::concepts::latest_course_run(&self.pool, course_id, "concept_mapping").await?
        } else {
            None
        };
        Ok(ConceptGraph {
            concepts,
            prerequisites,
            tags,
            latest_run_id,
            can_edit: editor && course.archived_at.is_none(),
        })
    }

    /// A teacher's own concept, approved at once.
    pub async fn create_concept(
        &self,
        actor: &Actor,
        course_id: CourseId,
        name: &str,
        description: &str,
    ) -> Result<ConceptView> {
        self.concept_editor(actor, course_id).await?;
        let name = name.trim();
        if name.is_empty() {
            return Err(invalid("name", "required", "name is required"));
        }
        let base = slugify(name);
        let base = if base.is_empty() {
            "concept".to_owned()
        } else {
            base
        };
        let existing: HashSet<String> = ab_db::concepts::list_concepts(&self.pool, course_id)
            .await?
            .into_iter()
            .map(|c| c.slug)
            .collect();
        let slug = std::iter::once(base.clone())
            .chain((2..1000).map(|n| format!("{}-{n}", base.chars().take(70).collect::<String>())))
            .find(|s| !existing.contains(s))
            .unwrap_or(base);
        let mut tx = self.pool.begin().await?;
        let position = ab_db::concepts::next_concept_position(&mut tx, course_id).await?;
        let (id, _) = ab_db::concepts::insert_concept(
            &mut tx,
            &NewConcept {
                course_id,
                slug: &slug,
                name,
                description: description.trim(),
                status: "approved",
                origin: "teacher",
                position,
                run_id: None,
                decided_by: Some(actor.user_id),
            },
        )
        .await?;
        tx.commit().await?;
        let concept = ab_db::concepts::get_concept(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("concept"))?;
        Ok(concept_view(concept))
    }

    pub async fn update_concept(
        &self,
        actor: &Actor,
        id: ConceptId,
        name: Option<&str>,
        description: Option<&str>,
        status: Option<&str>,
    ) -> Result<ConceptView> {
        let concept = self.editable_concept(actor, id).await?;
        if let Some(status) = status {
            check_status(status)?;
        }
        let name = name.map(str::trim);
        if name.is_some_and(str::is_empty) {
            return Err(invalid("name", "required", "name is required"));
        }
        ab_db::concepts::update_concept(
            &self.pool,
            id,
            name,
            description.map(str::trim),
            status,
            actor.user_id,
        )
        .await?;
        if status.is_some_and(|s| s != concept.status) {
            crate::mastery::owe_rebuild(&self.pool, concept.course_id).await?;
        }
        let fresh = ab_db::concepts::get_concept(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("concept"))?;
        Ok(concept_view(fresh))
    }

    pub async fn delete_concept(&self, actor: &Actor, id: ConceptId) -> Result<()> {
        let concept = self.editable_concept(actor, id).await?;
        ab_db::concepts::delete_concept(&self.pool, id).await?;
        crate::mastery::owe_rebuild(&self.pool, concept.course_id).await
    }

    /// Replaces what `id` requires (teacher edges, approved); 422 `concept-cycle` on a cycle.
    pub async fn set_prerequisites(
        &self,
        actor: &Actor,
        id: ConceptId,
        requires: &[ConceptId],
    ) -> Result<Vec<PrerequisiteView>> {
        let concept = self.editable_concept(actor, id).await?;
        let course_concepts: HashSet<ConceptId> =
            ab_db::concepts::list_concepts(&self.pool, concept.course_id)
                .await?
                .into_iter()
                .map(|c| c.id)
                .collect();
        let mut wanted: Vec<ConceptId> = Vec::new();
        for r in requires {
            if *r == id {
                return Err(Error::app(
                    ErrorCode::ConceptCycle,
                    "a concept cannot require itself",
                ));
            }
            if !course_concepts.contains(r) {
                return Err(invalid(
                    "requires",
                    "unknown",
                    format!("concept {r} is not part of this course"),
                ));
            }
            if !wanted.contains(r) {
                wanted.push(*r);
            }
        }
        let edges: Vec<(ConceptId, ConceptId)> =
            ab_db::concepts::list_prerequisites(&self.pool, concept.course_id)
                .await?
                .into_iter()
                .filter(|p| p.status != "rejected")
                .map(|p| (p.concept_id, p.requires_id))
                .collect();
        if creates_cycle(&edges, id, &wanted) {
            return Err(Error::app(
                ErrorCode::ConceptCycle,
                "these prerequisites would form a cycle",
            ));
        }
        let ids: Vec<uuid::Uuid> = wanted.iter().map(|c| c.0).collect();
        let mut tx = self.pool.begin().await?;
        ab_db::concepts::replace_prerequisites(&mut tx, concept.course_id, id, &ids).await?;
        tx.commit().await?;
        Ok(
            ab_db::concepts::list_prerequisites(&self.pool, concept.course_id)
                .await?
                .into_iter()
                .filter(|p| p.concept_id == id)
                .map(|p| PrerequisiteView {
                    concept_id: p.concept_id,
                    requires_id: p.requires_id,
                    status: p.status,
                })
                .collect(),
        )
    }

    /// A teacher's tag (approved), or a re-decision of an existing one with the same target.
    pub async fn create_concept_tag(
        &self,
        actor: &Actor,
        course_id: CourseId,
        concept_id: ConceptId,
        activity_id: ActivityId,
        item_id: Option<uuid::Uuid>,
        weight: f32,
    ) -> Result<ConceptTagView> {
        self.concept_editor(actor, course_id).await?;
        check_weight(weight)?;
        let concept = ab_db::concepts::get_concept(&self.pool, concept_id)
            .await?
            .filter(|c| c.course_id == course_id)
            .ok_or_else(|| {
                invalid(
                    "concept_id",
                    "unknown",
                    "concept is not part of this course",
                )
            })?;
        let activity = ab_db::catalog::get_activity(&self.pool, activity_id)
            .await?
            .filter(|a| a.course_id == course_id)
            .ok_or_else(|| {
                invalid(
                    "activity_id",
                    "unknown",
                    "activity is not part of this course",
                )
            })?;
        if let Some(item) = item_id {
            let assessment = ab_db::concepts::assessment_of(&self.pool, activity.id).await?;
            let items = match assessment {
                Some(a) => ab_db::retrieval::item_sources(&self.pool, a).await?,
                None => Vec::new(),
            };
            if !items.iter().any(|i| i.item_id == item) {
                return Err(invalid(
                    "item_id",
                    "unknown",
                    "question is not part of this activity",
                ));
            }
        }
        let mut tx = self.pool.begin().await?;
        let id = ab_db::concepts::upsert_tag(
            &mut tx,
            &NewTag {
                course_id,
                concept_id: concept.id,
                activity_id,
                item_id,
                weight,
                status: "approved",
                origin: "teacher",
                rationale: "",
                run_id: None,
                decided_by: Some(actor.user_id),
            },
        )
        .await?
        .ok_or_else(|| Error::conflict("the tag could not be stored"))?;
        tx.commit().await?;
        crate::mastery::owe_rebuild(&self.pool, course_id).await?;
        let (_, tag) = ab_db::concepts::get_tag(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("concept tag"))?;
        Ok(tag_view(tag))
    }

    pub async fn update_concept_tag(
        &self,
        actor: &Actor,
        id: ConceptTagId,
        status: Option<&str>,
        weight: Option<f32>,
    ) -> Result<ConceptTagView> {
        let (course_id, _) = self.editable_tag(actor, id).await?;
        if let Some(status) = status {
            check_status(status)?;
        }
        if let Some(weight) = weight {
            check_weight(weight)?;
        }
        ab_db::concepts::update_tag(&self.pool, id, status, weight, actor.user_id).await?;
        crate::mastery::owe_rebuild(&self.pool, course_id).await?;
        let (_, tag) = ab_db::concepts::get_tag(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("concept tag"))?;
        Ok(tag_view(tag))
    }

    pub async fn delete_concept_tag(&self, actor: &Actor, id: ConceptTagId) -> Result<()> {
        let (course_id, _) = self.editable_tag(actor, id).await?;
        ab_db::concepts::delete_tag(&self.pool, id).await?;
        crate::mastery::owe_rebuild(&self.pool, course_id).await
    }

    /// Batch decision over suggestions: concepts and tags to approve or reject.
    pub async fn review_concepts(
        &self,
        actor: &Actor,
        course_id: CourseId,
        status: &str,
        concept_ids: &[ConceptId],
        tag_ids: &[ConceptTagId],
    ) -> Result<ConceptGraph> {
        self.concept_editor(actor, course_id).await?;
        if !matches!(status, "approved" | "rejected") {
            return Err(invalid("status", "enum", "status is approved or rejected"));
        }
        let concepts: Vec<uuid::Uuid> = concept_ids.iter().map(|c| c.0).collect();
        let tags: Vec<uuid::Uuid> = tag_ids.iter().map(|t| t.0).collect();
        let mut tx = self.pool.begin().await?;
        ab_db::concepts::set_concepts_status(&mut tx, course_id, &concepts, status, actor.user_id)
            .await?;
        ab_db::concepts::set_tags_status(&mut tx, course_id, &tags, status, actor.user_id).await?;
        tx.commit().await?;
        crate::mastery::owe_rebuild(&self.pool, course_id).await?;
        self.concept_graph(actor, course_id).await
    }

    // ── Mastery views ────────────────────────────────────────────────────────

    async fn mastery_rows(
        &self,
        course_id: CourseId,
        user_id: UserId,
        concepts: &[ConceptRow],
        tags: &[TagRow],
        names: &HashMap<ActivityId, String>,
    ) -> Result<Vec<ConceptMastery>> {
        let rows: HashMap<ConceptId, ab_db::concepts::MasteryRow> =
            ab_db::concepts::learner_mastery(&self.pool, course_id, user_id)
                .await?
                .into_iter()
                .map(|r| (r.concept_id, r))
                .collect();
        let now = jiff::Timestamp::now().as_second();
        Ok(concepts
            .iter()
            .map(|c| {
                let row = rows.get(&c.id);
                let p = row.map_or(PRIOR_F32, |r| r.p_known);
                let count = row.map_or(0, |r| r.evidence_count);
                let last = row.and_then(|r| r.last_observed_at);
                let lvl = level(f64::from(p), count);
                let review = if matches!(lvl, MasteryLevel::Struggling | MasteryLevel::Learning) {
                    crate::mastery::activities_for(tags, c.id)
                        .into_iter()
                        .filter_map(|id| {
                            names.get(&id).map(|name| ActivityRef {
                                id,
                                name: name.clone(),
                            })
                        })
                        .take(WEAK_REVIEW)
                        .collect()
                } else {
                    Vec::new()
                };
                ConceptMastery {
                    concept_id: c.id,
                    name: c.name.clone(),
                    level: lvl,
                    p_known: p,
                    evidence_count: count,
                    last_observed_at: last,
                    stale: last
                        .is_some_and(|t| now - t > crate::mastery::model::STALE_DAYS * 86_400),
                    review,
                }
            })
            .collect())
    }

    async fn approved_graph(
        &self,
        course_id: CourseId,
        learner_view: bool,
    ) -> Result<(Vec<ConceptRow>, Vec<TagRow>, HashMap<ActivityId, String>)> {
        let concepts: Vec<ConceptRow> = ab_db::concepts::list_concepts(&self.pool, course_id)
            .await?
            .into_iter()
            .filter(|c| c.status == "approved")
            .collect();
        let tags = ab_db::concepts::list_tags(&self.pool, course_id).await?;
        let names = ab_db::catalog::list_activities(&self.pool, course_id)
            .await?
            .into_iter()
            .filter(|a| !learner_view || a.published)
            .map(|a| (a.id, a.name))
            .collect();
        Ok((concepts, tags, names))
    }

    /// The learner's own estimates (any visible course).
    pub async fn my_mastery(&self, actor: &Actor, course_id: CourseId) -> Result<LearnerMastery> {
        self.require_feature(AiFeature::ConceptGraph).await?;
        self.visible_course(actor, course_id).await?;
        let (concepts, tags, names) = self.approved_graph(course_id, true).await?;
        Ok(LearnerMastery {
            user_id: actor.user_id,
            concepts: self
                .mastery_rows(course_id, actor.user_id, &concepts, &tags, &names)
                .await?,
        })
    }

    /// The class map: per concept, the level distribution and who struggles.
    pub async fn class_mastery(&self, actor: &Actor, course_id: CourseId) -> Result<ClassMastery> {
        self.require_feature(AiFeature::ConceptGraph).await?;
        let course = self.visible_course(actor, course_id).await?;
        crate::ai::policy::require_course_update(actor, &course)?;
        let (concepts, _, _) = self.approved_graph(course_id, false).await?;
        let learners = ab_db::concepts::mastery_learners(&self.pool, course_id).await?;
        let names: HashMap<UserId, String> = learners
            .iter()
            .map(|l| {
                (
                    l.user_id,
                    if l.name.trim().is_empty() {
                        l.username.clone()
                    } else {
                        l.name.clone()
                    },
                )
            })
            .collect();
        let rows = ab_db::concepts::course_mastery(&self.pool, course_id).await?;
        let total = i64::try_from(learners.len()).unwrap_or(i64::MAX);
        let out = concepts
            .iter()
            .map(|c| {
                let mine: Vec<&ab_db::concepts::MasteryRow> = rows
                    .iter()
                    .filter(|r| r.concept_id == c.id && names.contains_key(&r.user_id))
                    .collect();
                let (mut struggling, mut learning, mut mastered) = (0, 0, 0);
                let mut weak: Vec<(f32, UserId)> = Vec::new();
                for r in &mine {
                    match level(f64::from(r.p_known), r.evidence_count) {
                        MasteryLevel::Struggling => {
                            struggling += 1;
                            weak.push((r.p_known, r.user_id));
                        }
                        MasteryLevel::Learning => learning += 1,
                        MasteryLevel::Mastered => mastered += 1,
                        MasteryLevel::NotStarted => {}
                    }
                }
                weak.sort_by(|a, b| a.0.total_cmp(&b.0));
                let started = struggling + learning + mastered;
                #[allow(clippy::cast_precision_loss, reason = "learner counts are small")]
                let mean_p = (!mine.is_empty())
                    .then(|| mine.iter().map(|r| r.p_known).sum::<f32>() / mine.len() as f32);
                ClassConcept {
                    concept_id: c.id,
                    name: c.name.clone(),
                    mean_p,
                    not_started: (total - started).max(0),
                    struggling,
                    learning,
                    mastered,
                    struggling_learners: weak
                        .into_iter()
                        .take(20)
                        .map(|(_, user_id)| LearnerRef {
                            user_id,
                            name: names.get(&user_id).cloned().unwrap_or_default(),
                        })
                        .collect(),
                }
            })
            .collect();
        Ok(ClassMastery {
            learners: total,
            concepts: out,
        })
    }

    /// One learner, for the teacher: estimates and the evidence behind them.
    pub async fn learner_mastery(
        &self,
        actor: &Actor,
        course_id: CourseId,
        user_id: UserId,
    ) -> Result<LearnerMasteryDetail> {
        self.require_feature(AiFeature::ConceptGraph).await?;
        let course = self.visible_course(actor, course_id).await?;
        crate::ai::policy::require_course_update(actor, &course)?;
        let learner = ab_db::concepts::mastery_learners(&self.pool, course_id)
            .await?
            .into_iter()
            .find(|l| l.user_id == user_id)
            .ok_or_else(|| Error::not_found("learner"))?;
        let (concepts, tags, names) = self.approved_graph(course_id, false).await?;
        let evidence = ab_db::concepts::learner_evidence(&self.pool, course_id, user_id)
            .await?
            .into_iter()
            .map(|e| EvidenceView {
                concept_id: e.concept_id,
                source_type: e.source_type,
                source_id: e.source_id,
                part_id: e.part_id,
                score: e.score,
                weight: e.weight,
                observed_at: e.observed_at,
            })
            .collect();
        Ok(LearnerMasteryDetail {
            learner: LearnerRef {
                user_id,
                name: if learner.name.trim().is_empty() {
                    learner.username
                } else {
                    learner.name
                },
            },
            concepts: self
                .mastery_rows(course_id, user_id, &concepts, &tags, &names)
                .await?,
            evidence,
        })
    }
}

/// A missing or foreign resource answers 404 either way (its id must not leak that it exists).
pub(crate) fn hide_forbidden(err: Error, what: &str) -> Error {
    if matches!(err.code(), ErrorCode::NotFound | ErrorCode::Forbidden) {
        Error::not_found(what)
    } else {
        err
    }
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

    fn id(n: u128) -> ConceptId {
        ConceptId(uuid::Uuid::from_u128(n))
    }

    #[test]
    fn cycles_are_found_through_the_replaced_edge_set() {
        // 2 requires 1, 3 requires 2.
        let edges = vec![(id(2), id(1)), (id(3), id(2))];
        assert!(creates_cycle(&edges, id(1), &[id(3)]));
        assert!(!creates_cycle(&edges, id(3), &[id(1)]));
        // Replacing 2's own edges removes the old path.
        assert!(!creates_cycle(&edges, id(2), &[]));
        assert!(creates_cycle(&edges, id(1), &[id(2)]));
    }
}
