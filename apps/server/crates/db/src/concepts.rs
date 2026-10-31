//! Course concept graph and learner mastery (docs/AI-FIRST.md 2-3).

use ab_core::Result;
use ab_core::id::{ActivityId, AiRunId, ConceptId, ConceptTagId, CourseId, UserId};
use sqlx::{PgConnection, PgPool};

// ── Concepts ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ConceptRow {
    pub id: ConceptId,
    pub course_id: CourseId,
    pub slug: String,
    pub name: String,
    pub description: String,
    pub status: String,
    pub origin: String,
    pub position: i32,
    pub run_id: Option<AiRunId>,
    pub decided_at: Option<i64>,
    pub created_at: i64,
}

pub async fn list_concepts(pool: &PgPool, course_id: CourseId) -> Result<Vec<ConceptRow>> {
    let rows = sqlx::query_as!(
        ConceptRow,
        r#"SELECT id AS "id: ConceptId", course_id AS "course_id: CourseId", slug, name, description,
                  status, origin, position, run_id AS "run_id: AiRunId",
                  extract(epoch FROM decided_at)::bigint AS decided_at,
                  extract(epoch FROM created_at)::bigint AS "created_at!"
           FROM course_concepts WHERE course_id = $1
           ORDER BY position, name, id"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_concept(pool: &PgPool, id: ConceptId) -> Result<Option<ConceptRow>> {
    let row = sqlx::query_as!(
        ConceptRow,
        r#"SELECT id AS "id: ConceptId", course_id AS "course_id: CourseId", slug, name, description,
                  status, origin, position, run_id AS "run_id: AiRunId",
                  extract(epoch FROM decided_at)::bigint AS decided_at,
                  extract(epoch FROM created_at)::bigint AS "created_at!"
           FROM course_concepts WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub struct NewConcept<'a> {
    pub course_id: CourseId,
    pub slug: &'a str,
    pub name: &'a str,
    pub description: &'a str,
    pub status: &'a str,
    pub origin: &'a str,
    pub position: i32,
    pub run_id: Option<AiRunId>,
    pub decided_by: Option<UserId>,
}

/// Inserts unless the slug exists; returns the id of the concept with that slug either way.
pub async fn insert_concept(
    conn: &mut PgConnection,
    c: &NewConcept<'_>,
) -> Result<(ConceptId, bool)> {
    let inserted = sqlx::query_scalar!(
        r#"INSERT INTO course_concepts
               (course_id, slug, name, description, status, origin, position, run_id,
                decided_by, decided_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9::uuid IS NULL THEN NULL ELSE now() END)
           ON CONFLICT (course_id, slug) DO NOTHING
           RETURNING id"#,
        c.course_id.0,
        c.slug,
        c.name,
        c.description,
        c.status,
        c.origin,
        c.position,
        c.run_id.map(|r| r.0),
        c.decided_by.map(|u| u.0)
    )
    .fetch_optional(&mut *conn)
    .await?;
    if let Some(id) = inserted {
        return Ok((ConceptId(id), true));
    }
    let id = sqlx::query_scalar!(
        "SELECT id FROM course_concepts WHERE course_id = $1 AND slug = $2",
        c.course_id.0,
        c.slug
    )
    .fetch_one(&mut *conn)
    .await?;
    Ok((ConceptId(id), false))
}

/// Teacher edits; a status change records the decision.
pub async fn update_concept(
    pool: &PgPool,
    id: ConceptId,
    name: Option<&str>,
    description: Option<&str>,
    status: Option<&str>,
    decided_by: UserId,
) -> Result<bool> {
    let done = sqlx::query!(
        r#"UPDATE course_concepts
           SET name = COALESCE($2, name), description = COALESCE($3, description),
               status = COALESCE($4, status),
               decided_by = CASE WHEN $4::text IS NULL THEN decided_by ELSE $5 END,
               decided_at = CASE WHEN $4::text IS NULL THEN decided_at ELSE now() END
           WHERE id = $1"#,
        id.0,
        name,
        description,
        status,
        decided_by.0
    )
    .execute(pool)
    .await?;
    Ok(done.rows_affected() == 1)
}

pub async fn set_concepts_status(
    conn: &mut PgConnection,
    course_id: CourseId,
    ids: &[uuid::Uuid],
    status: &str,
    decided_by: UserId,
) -> Result<u64> {
    let done = sqlx::query!(
        r#"UPDATE course_concepts SET status = $3, decided_by = $4, decided_at = now()
           WHERE course_id = $1 AND id = ANY($2) AND status <> $3"#,
        course_id.0,
        ids,
        status,
        decided_by.0
    )
    .execute(&mut *conn)
    .await?;
    Ok(done.rows_affected())
}

pub async fn delete_concept(pool: &PgPool, id: ConceptId) -> Result<bool> {
    let done = sqlx::query!("DELETE FROM course_concepts WHERE id = $1", id.0)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() == 1)
}

pub async fn next_concept_position(conn: &mut PgConnection, course_id: CourseId) -> Result<i32> {
    let n = sqlx::query_scalar!(
        r#"SELECT COALESCE(max(position) + 1, 0) AS "n!" FROM course_concepts WHERE course_id = $1"#,
        course_id.0
    )
    .fetch_one(&mut *conn)
    .await?;
    Ok(n)
}

// ── Prerequisites ───────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct PrerequisiteRow {
    pub concept_id: ConceptId,
    pub requires_id: ConceptId,
    pub status: String,
    pub origin: String,
}

pub async fn list_prerequisites(
    pool: &PgPool,
    course_id: CourseId,
) -> Result<Vec<PrerequisiteRow>> {
    let rows = sqlx::query_as!(
        PrerequisiteRow,
        r#"SELECT concept_id AS "concept_id: ConceptId", requires_id AS "requires_id: ConceptId",
                  status, origin
           FROM concept_prerequisites WHERE course_id = $1
           ORDER BY concept_id, requires_id"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn insert_prerequisite(
    conn: &mut PgConnection,
    course_id: CourseId,
    concept_id: ConceptId,
    requires_id: ConceptId,
    status: &str,
    origin: &str,
) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO concept_prerequisites (concept_id, requires_id, course_id, status, origin)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING"#,
        concept_id.0,
        requires_id.0,
        course_id.0,
        status,
        origin
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// The teacher's list for one concept: exactly these, approved.
pub async fn replace_prerequisites(
    conn: &mut PgConnection,
    course_id: CourseId,
    concept_id: ConceptId,
    requires: &[uuid::Uuid],
) -> Result<()> {
    sqlx::query!(
        "DELETE FROM concept_prerequisites WHERE concept_id = $1",
        concept_id.0
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        r#"INSERT INTO concept_prerequisites (concept_id, requires_id, course_id, status, origin)
           SELECT $1, r, $2, 'approved', 'teacher' FROM unnest($3::uuid[]) r"#,
        concept_id.0,
        course_id.0,
        requires
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

// ── Tags ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct TagRow {
    pub id: ConceptTagId,
    pub concept_id: ConceptId,
    pub activity_id: ActivityId,
    pub item_id: Option<uuid::Uuid>,
    pub weight: f32,
    pub status: String,
    pub origin: String,
    pub rationale: String,
}

pub async fn list_tags(pool: &PgPool, course_id: CourseId) -> Result<Vec<TagRow>> {
    let rows = sqlx::query_as!(
        TagRow,
        r#"SELECT id AS "id: ConceptTagId", concept_id AS "concept_id: ConceptId",
                  activity_id AS "activity_id: ActivityId", item_id, weight, status, origin, rationale
           FROM concept_tags WHERE course_id = $1
           ORDER BY activity_id, item_id NULLS FIRST, concept_id"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_tag(pool: &PgPool, id: ConceptTagId) -> Result<Option<(CourseId, TagRow)>> {
    let row = sqlx::query!(
        r#"SELECT course_id AS "course_id: CourseId", id AS "id: ConceptTagId",
                  concept_id AS "concept_id: ConceptId", activity_id AS "activity_id: ActivityId",
                  item_id, weight, status, origin, rationale
           FROM concept_tags WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| {
        (
            r.course_id,
            TagRow {
                id: r.id,
                concept_id: r.concept_id,
                activity_id: r.activity_id,
                item_id: r.item_id,
                weight: r.weight,
                status: r.status,
                origin: r.origin,
                rationale: r.rationale,
            },
        )
    }))
}

pub struct NewTag<'a> {
    pub course_id: CourseId,
    pub concept_id: ConceptId,
    pub activity_id: ActivityId,
    pub item_id: Option<uuid::Uuid>,
    pub weight: f32,
    pub status: &'a str,
    pub origin: &'a str,
    pub rationale: &'a str,
    pub run_id: Option<AiRunId>,
    pub decided_by: Option<UserId>,
}

/// AI suggestions never override a stored tag (a teacher decision is sticky); a teacher's tag
/// replaces whatever was there.
pub async fn upsert_tag(conn: &mut PgConnection, t: &NewTag<'_>) -> Result<Option<ConceptTagId>> {
    let id = if t.origin == "teacher" {
        sqlx::query_scalar!(
            r#"INSERT INTO concept_tags
                   (course_id, concept_id, activity_id, item_id, weight, status, origin, rationale,
                    run_id, decided_by, decided_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
               ON CONFLICT (concept_id, activity_id, item_id) DO UPDATE
               SET weight = EXCLUDED.weight, status = EXCLUDED.status, origin = EXCLUDED.origin,
                   rationale = EXCLUDED.rationale, decided_by = EXCLUDED.decided_by,
                   decided_at = now()
               RETURNING id"#,
            t.course_id.0,
            t.concept_id.0,
            t.activity_id.0,
            t.item_id,
            t.weight,
            t.status,
            t.origin,
            t.rationale,
            t.run_id.map(|r| r.0),
            t.decided_by.map(|u| u.0)
        )
        .fetch_optional(&mut *conn)
        .await?
    } else {
        sqlx::query_scalar!(
            r#"INSERT INTO concept_tags
                   (course_id, concept_id, activity_id, item_id, weight, status, origin, rationale, run_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (concept_id, activity_id, item_id) DO NOTHING
               RETURNING id"#,
            t.course_id.0,
            t.concept_id.0,
            t.activity_id.0,
            t.item_id,
            t.weight,
            t.status,
            t.origin,
            t.rationale,
            t.run_id.map(|r| r.0)
        )
        .fetch_optional(&mut *conn)
        .await?
    };
    Ok(id.map(ConceptTagId))
}

pub async fn update_tag(
    pool: &PgPool,
    id: ConceptTagId,
    status: Option<&str>,
    weight: Option<f32>,
    decided_by: UserId,
) -> Result<bool> {
    let done = sqlx::query!(
        r#"UPDATE concept_tags
           SET status = COALESCE($2, status), weight = COALESCE($3, weight),
               decided_by = $4, decided_at = now()
           WHERE id = $1"#,
        id.0,
        status,
        weight,
        decided_by.0
    )
    .execute(pool)
    .await?;
    Ok(done.rows_affected() == 1)
}

pub async fn set_tags_status(
    conn: &mut PgConnection,
    course_id: CourseId,
    ids: &[uuid::Uuid],
    status: &str,
    decided_by: UserId,
) -> Result<u64> {
    let done = sqlx::query!(
        r#"UPDATE concept_tags SET status = $3, decided_by = $4, decided_at = now()
           WHERE course_id = $1 AND id = ANY($2) AND status <> $3"#,
        course_id.0,
        ids,
        status,
        decided_by.0
    )
    .execute(&mut *conn)
    .await?;
    Ok(done.rows_affected())
}

pub async fn delete_tag(pool: &PgPool, id: ConceptTagId) -> Result<bool> {
    let done = sqlx::query!("DELETE FROM concept_tags WHERE id = $1", id.0)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() == 1)
}

/// An approved tag on an approved concept: what evidence maps through.
#[derive(Debug, Clone)]
pub struct ActiveTag {
    pub concept_id: ConceptId,
    pub activity_id: ActivityId,
    pub item_id: Option<uuid::Uuid>,
    pub weight: f32,
}

pub async fn active_tags_for_activity(
    pool: &PgPool,
    activity_id: ActivityId,
) -> Result<Vec<ActiveTag>> {
    let rows = sqlx::query_as!(
        ActiveTag,
        r#"SELECT t.concept_id AS "concept_id: ConceptId", t.activity_id AS "activity_id: ActivityId",
                  t.item_id, t.weight
           FROM concept_tags t JOIN course_concepts c ON c.id = t.concept_id
           WHERE t.activity_id = $1 AND t.status = 'approved' AND c.status = 'approved'"#,
        activity_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn active_tags_for_activities(
    pool: &PgPool,
    activity_ids: &[uuid::Uuid],
) -> Result<Vec<ActiveTag>> {
    let rows = sqlx::query_as!(
        ActiveTag,
        r#"SELECT t.concept_id AS "concept_id: ConceptId", t.activity_id AS "activity_id: ActivityId",
                  t.item_id, t.weight
           FROM concept_tags t JOIN course_concepts c ON c.id = t.concept_id
           WHERE t.activity_id = ANY($1) AND t.status = 'approved' AND c.status = 'approved'"#,
        activity_ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Evidence and mastery ────────────────────────────────────────────────────

pub struct NewEvidence {
    pub course_id: CourseId,
    pub user_id: UserId,
    pub concept_id: ConceptId,
    pub part_id: Option<uuid::Uuid>,
    pub score: f32,
    pub weight: f32,
    pub kind: &'static str,
    pub observed_at: i64,
}

/// Replaces a source's evidence; returns the concepts touched before and after (for the replay).
pub async fn replace_evidence(
    conn: &mut PgConnection,
    source_type: &str,
    source_id: uuid::Uuid,
    rows: &[NewEvidence],
) -> Result<Vec<(UserId, ConceptId, CourseId)>> {
    let mut touched: Vec<(UserId, ConceptId, CourseId)> = sqlx::query!(
        r#"DELETE FROM mastery_evidence WHERE source_type = $1 AND source_id = $2
           RETURNING user_id AS "user_id: UserId", concept_id AS "concept_id: ConceptId",
                     course_id AS "course_id: CourseId""#,
        source_type,
        source_id
    )
    .fetch_all(&mut *conn)
    .await?
    .into_iter()
    .map(|r| (r.user_id, r.concept_id, r.course_id))
    .collect();
    for e in rows {
        sqlx::query!(
            r#"INSERT INTO mastery_evidence
                   (course_id, user_id, concept_id, source_type, source_id, part_id, score, weight,
                    kind, observed_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10::bigint))
               ON CONFLICT (source_type, source_id, concept_id, part_id, user_id) DO UPDATE
               SET score = EXCLUDED.score, weight = EXCLUDED.weight, kind = EXCLUDED.kind,
                   observed_at = EXCLUDED.observed_at"#,
            e.course_id.0,
            e.user_id.0,
            e.concept_id.0,
            source_type,
            source_id,
            e.part_id,
            e.score,
            e.weight,
            e.kind,
            e.observed_at
        )
        .execute(&mut *conn)
        .await?;
        touched.push((e.user_id, e.concept_id, e.course_id));
    }
    touched.sort_by_key(|(u, c, _)| (u.0, c.0));
    touched.dedup_by_key(|(u, c, _)| (u.0, c.0));
    Ok(touched)
}

#[derive(Debug, Clone)]
pub struct EvidenceRow {
    pub score: f32,
    pub weight: f32,
    pub kind: String,
    pub observed_at: i64,
    pub source_type: String,
    pub source_id: uuid::Uuid,
    pub part_id: Option<uuid::Uuid>,
}

pub async fn evidence_for(
    conn: &mut PgConnection,
    user_id: UserId,
    concept_id: ConceptId,
) -> Result<Vec<EvidenceRow>> {
    let rows = sqlx::query_as!(
        EvidenceRow,
        r#"SELECT score, weight, kind, extract(epoch FROM observed_at)::bigint AS "observed_at!",
                  source_type, source_id, part_id
           FROM mastery_evidence WHERE user_id = $1 AND concept_id = $2
           ORDER BY observed_at, id"#,
        user_id.0,
        concept_id.0
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows)
}

pub async fn upsert_mastery(
    conn: &mut PgConnection,
    user_id: UserId,
    concept_id: ConceptId,
    course_id: CourseId,
    p_known: f32,
    evidence_count: i32,
    last_observed_at: Option<i64>,
) -> Result<()> {
    if evidence_count == 0 {
        sqlx::query!(
            "DELETE FROM concept_mastery WHERE user_id = $1 AND concept_id = $2",
            user_id.0,
            concept_id.0
        )
        .execute(&mut *conn)
        .await?;
        return Ok(());
    }
    sqlx::query!(
        r#"INSERT INTO concept_mastery
               (user_id, concept_id, course_id, p_known, evidence_count, last_observed_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, to_timestamp($6::bigint), now())
           ON CONFLICT (user_id, concept_id) DO UPDATE
           SET p_known = EXCLUDED.p_known, evidence_count = EXCLUDED.evidence_count,
               last_observed_at = EXCLUDED.last_observed_at, updated_at = now()"#,
        user_id.0,
        concept_id.0,
        course_id.0,
        p_known,
        evidence_count,
        last_observed_at
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct MasteryRow {
    pub user_id: UserId,
    pub concept_id: ConceptId,
    pub p_known: f32,
    pub evidence_count: i32,
    pub last_observed_at: Option<i64>,
}

pub async fn learner_mastery(
    pool: &PgPool,
    course_id: CourseId,
    user_id: UserId,
) -> Result<Vec<MasteryRow>> {
    let rows = sqlx::query_as!(
        MasteryRow,
        r#"SELECT user_id AS "user_id: UserId", concept_id AS "concept_id: ConceptId", p_known,
                  evidence_count, extract(epoch FROM last_observed_at)::bigint AS last_observed_at
           FROM concept_mastery WHERE course_id = $1 AND user_id = $2"#,
        course_id.0,
        user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn course_mastery(pool: &PgPool, course_id: CourseId) -> Result<Vec<MasteryRow>> {
    let rows = sqlx::query_as!(
        MasteryRow,
        r#"SELECT m.user_id AS "user_id: UserId", m.concept_id AS "concept_id: ConceptId", m.p_known,
                  m.evidence_count, extract(epoch FROM m.last_observed_at)::bigint AS last_observed_at
           FROM concept_mastery m
           JOIN course_concepts c ON c.id = m.concept_id AND c.status = 'approved'
           WHERE m.course_id = $1"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct LearnerEvidenceRow {
    pub concept_id: ConceptId,
    pub source_type: String,
    pub source_id: uuid::Uuid,
    pub part_id: Option<uuid::Uuid>,
    pub score: f32,
    pub weight: f32,
    pub observed_at: i64,
}

pub async fn learner_evidence(
    pool: &PgPool,
    course_id: CourseId,
    user_id: UserId,
) -> Result<Vec<LearnerEvidenceRow>> {
    let rows = sqlx::query_as!(
        LearnerEvidenceRow,
        r#"SELECT concept_id AS "concept_id: ConceptId", source_type, source_id, part_id, score, weight,
                  extract(epoch FROM observed_at)::bigint AS "observed_at!"
           FROM mastery_evidence WHERE course_id = $1 AND user_id = $2
           ORDER BY observed_at DESC, id DESC
           LIMIT 500"#,
        course_id.0,
        user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Active learners of a course with their display names (the class view).
#[derive(Debug, Clone)]
pub struct LearnerNameRow {
    pub user_id: UserId,
    pub name: String,
    pub username: String,
}

pub async fn mastery_learners(pool: &PgPool, course_id: CourseId) -> Result<Vec<LearnerNameRow>> {
    let rows = sqlx::query_as!(
        LearnerNameRow,
        r#"SELECT DISTINCT u.id AS "user_id: UserId",
                  COALESCE(NULLIF(trim(u.display_name), ''), u.username) AS "name!", u.username
           FROM concept_mastery m JOIN users u ON u.id = m.user_id
           WHERE m.course_id = $1
           ORDER BY 2, 3"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Facts that become evidence ──────────────────────────────────────────────

/// An assessment attempt as mastery reads it. `visible`: the learner can see the result (published, or
/// graded with a published grade entry); evidence only comes from visible, non-preview attempts.
#[derive(Debug, Clone)]
pub struct SubmissionFact {
    pub user_id: UserId,
    pub course_id: CourseId,
    pub activity_id: ActivityId,
    pub preview: bool,
    pub visible: bool,
    pub grading: serde_json::Value,
    pub item_kinds: serde_json::Value,
    pub observed_at: i64,
}

pub async fn submission_fact(pool: &PgPool, id: uuid::Uuid) -> Result<Option<SubmissionFact>> {
    let row = sqlx::query_as!(
        SubmissionFact,
        r#"SELECT s.user_id AS "user_id: UserId", s.course_id AS "course_id: CourseId",
                  a.activity_id AS "activity_id: ActivityId", s.preview,
                  (s.status = 'published' OR (s.status = 'graded' AND EXISTS (
                       SELECT 1 FROM grading_entries g
                       WHERE g.submission_id = s.id AND g.published_at IS NOT NULL))) AS "visible!",
                  s.grading,
                  COALESCE((SELECT jsonb_object_agg(i.id::text, i.kind) FROM assessment_items i
                            WHERE i.assessment_id = s.assessment_id), '{}'::jsonb) AS "item_kinds!",
                  extract(epoch FROM COALESCE(s.graded_at, s.submitted_at, s.started_at))::bigint
                      AS "observed_at!"
           FROM submissions s JOIN assessments a ON a.id = s.assessment_id
           WHERE s.id = $1"#,
        id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

#[derive(Debug, Clone)]
pub struct FileAttemptFact {
    pub user_id: UserId,
    pub course_id: CourseId,
    pub activity_id: ActivityId,
    pub preview: bool,
    pub published: bool,
    pub final_score: Option<f64>,
    pub observed_at: i64,
}

pub async fn file_attempt_fact(pool: &PgPool, id: uuid::Uuid) -> Result<Option<FileAttemptFact>> {
    let row = sqlx::query_as!(
        FileAttemptFact,
        r#"SELECT t.user_id AS "user_id: UserId", f.course_id AS "course_id: CourseId",
                  f.activity_id AS "activity_id: ActivityId", t.preview,
                  (t.status = 'published') AS "published!", t.final_score,
                  extract(epoch FROM COALESCE(t.graded_at, t.submitted_at, t.started_at))::bigint
                      AS "observed_at!"
           FROM file_submission_attempts t JOIN file_submissions f ON f.id = t.file_submission_id
           WHERE t.id = $1"#,
        id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

#[derive(Debug, Clone)]
pub struct CodeRunFact {
    pub user_id: UserId,
    pub course_id: CourseId,
    pub activity_id: ActivityId,
    pub item_id: uuid::Uuid,
    pub counts: bool,
    pub passed: i32,
    pub total: i32,
    pub observed_at: i64,
}

/// A run on the visible tests by a learner (not staff); `counts` is false otherwise.
pub async fn code_run_fact(pool: &PgPool, id: uuid::Uuid) -> Result<Option<CodeRunFact>> {
    let row = sqlx::query_as!(
        CodeRunFact,
        r#"SELECT r.user_id AS "user_id: UserId", a.course_id AS "course_id: CourseId",
                  a.activity_id AS "activity_id: ActivityId", r.item_id,
                  (r.purpose = 'visible' AND r.total > 0
                   AND r.status IN ('accepted', 'wrong_answer', 'compile_error', 'runtime_error', 'time_limit')
                   AND NOT is_course_staff(a.course_id, r.user_id)) AS "counts!",
                  r.passed, r.total,
                  extract(epoch FROM COALESCE(r.finished_at, r.created_at))::bigint AS "observed_at!"
           FROM code_runs r JOIN assessments a ON a.id = r.assessment_id
           WHERE r.id = $1"#,
        id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

#[derive(Debug, Clone)]
pub struct RemediationFact {
    pub user_id: UserId,
    pub course_id: CourseId,
    pub activity_id: ActivityId,
    pub finished: bool,
    pub score: Option<i32>,
    pub observed_at: i64,
}

pub async fn remediation_fact(pool: &PgPool, id: uuid::Uuid) -> Result<Option<RemediationFact>> {
    let row = sqlx::query_as!(
        RemediationFact,
        r#"SELECT r.student_user_id AS "user_id: UserId", a.course_id AS "course_id: CourseId",
                  r.activity_id AS "activity_id: ActivityId",
                  (r.status IN ('passed', 'failed')) AS "finished!", r.score,
                  extract(epoch FROM COALESCE(r.passed_at, r.updated_at))::bigint AS "observed_at!"
           FROM ai_remediation_sessions r JOIN activities a ON a.id = r.activity_id
           WHERE r.id = $1"#,
        id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

#[derive(Debug, Clone)]
pub struct QuestionFact {
    pub user_id: Option<UserId>,
    pub course_id: CourseId,
    pub is_question: bool,
    pub staff: bool,
    pub content: String,
    pub observed_at: i64,
}

pub async fn question_fact(pool: &PgPool, id: uuid::Uuid) -> Result<Option<QuestionFact>> {
    let row = sqlx::query_as!(
        QuestionFact,
        r#"SELECT m.user_id AS "user_id: UserId", m.course_id AS "course_id: CourseId",
                  (m.role = 'user') AS "is_question!",
                  COALESCE(is_course_staff(m.course_id, m.user_id), false) AS "staff!",
                  m.content, extract(epoch FROM m.created_at)::bigint AS "observed_at!"
           FROM ai_qa_messages m WHERE m.id = $1"#,
        id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Every fact of a course that can carry evidence, for a full rebuild: `(source_type, id)`.
pub async fn course_fact_ids(
    pool: &PgPool,
    course_id: CourseId,
) -> Result<Vec<(String, uuid::Uuid)>> {
    let rows = sqlx::query!(
        r#"SELECT 'item' AS "kind!", s.id AS "id!" FROM submissions s
           WHERE s.course_id = $1 AND NOT s.preview AND s.status IN ('graded', 'published')
           UNION ALL
           SELECT 'file_attempt', t.id FROM file_submission_attempts t
           JOIN file_submissions f ON f.id = t.file_submission_id
           WHERE f.course_id = $1 AND NOT t.preview AND t.status = 'published'
           UNION ALL
           SELECT 'code_run', r.id FROM code_runs r JOIN assessments a ON a.id = r.assessment_id
           WHERE a.course_id = $1 AND r.purpose = 'visible'
           UNION ALL
           SELECT 'remediation', r.id FROM ai_remediation_sessions r
           JOIN activities a ON a.id = r.activity_id
           WHERE a.course_id = $1 AND r.status IN ('passed', 'failed')
           UNION ALL
           SELECT 'ai_question', m.id FROM ai_qa_messages m
           WHERE m.course_id = $1 AND m.role = 'user' AND m.user_id IS NOT NULL"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| (r.kind, r.id)).collect())
}

/// Drop every evidence and mastery row of a course (the rebuild starts clean).
pub async fn clear_course_mastery(conn: &mut PgConnection, course_id: CourseId) -> Result<()> {
    sqlx::query!(
        "DELETE FROM mastery_evidence WHERE course_id = $1",
        course_id.0
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        "DELETE FROM concept_mastery WHERE course_id = $1",
        course_id.0
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn list_concepts_conn(
    conn: &mut PgConnection,
    course_id: CourseId,
) -> Result<Vec<ConceptRow>> {
    let rows = sqlx::query_as!(
        ConceptRow,
        r#"SELECT id AS "id: ConceptId", course_id AS "course_id: CourseId", slug, name, description,
                  status, origin, position, run_id AS "run_id: AiRunId",
                  extract(epoch FROM decided_at)::bigint AS decided_at,
                  extract(epoch FROM created_at)::bigint AS "created_at!"
           FROM course_concepts WHERE course_id = $1
           ORDER BY position, name, id"#,
        course_id.0
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows)
}

/// The assessment behind an activity, if any.
pub async fn assessment_of(pool: &PgPool, activity_id: ActivityId) -> Result<Option<uuid::Uuid>> {
    let id = sqlx::query_scalar!(
        "SELECT id FROM assessments WHERE activity_id = $1",
        activity_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(id)
}

/// The newest run of `kind` on a course.
pub async fn latest_course_run(
    pool: &PgPool,
    course_id: CourseId,
    kind: &str,
) -> Result<Option<AiRunId>> {
    let id = sqlx::query_scalar!(
        r#"SELECT r.id FROM ai_runs r JOIN ai_threads t ON t.id = r.thread_id
           WHERE t.course_id = $1 AND r.kind = $2
           ORDER BY r.started_at DESC, r.id DESC LIMIT 1"#,
        course_id.0,
        kind
    )
    .fetch_optional(pool)
    .await?;
    Ok(id.map(AiRunId))
}
