//! Course material chunks for semantic search (docs/AI-FIRST.md 1).
//!
//! A *source* is what gets cut into chunks: a lesson, a media activity, a file assignment, the items of
//! one assessment, a course card. Its version folds every column the chunks depend on, so the sweep only
//! has to compare numbers. Vectors cross as pgvector text literals (`$n::text::vector`).

use ab_core::Result;
use ab_core::id::{ActivityId, ContentChunkId, CourseId};
use sqlx::{PgConnection, PgPool};

/// A source whose chunks are missing or older than the source.
#[derive(Debug, Clone)]
pub struct StaleSource {
    pub source_type: String,
    pub source_id: uuid::Uuid,
    pub course_id: CourseId,
    pub activity_id: Option<ActivityId>,
    pub version: i64,
}

/// Up to `limit` sources to (re)index: never indexed, changed since, cut for another embedding model, or
/// failed more than ten minutes ago. Archived courses are skipped.
pub async fn stale_sources(pool: &PgPool, model: &str, limit: i64) -> Result<Vec<StaleSource>> {
    let rows = sqlx::query_as!(
        StaleSource,
        r#"WITH sources AS (
               SELECT CASE a.activity_type
                          WHEN 'dynamic' THEN 'lesson'
                          WHEN 'file_submission' THEN 'assignment'
                          ELSE 'activity' END AS source_type,
                      a.id AS source_id, a.course_id, a.id AS activity_id,
                      a.version::bigint * 2000000 + COALESCE(fs.version, 0)::bigint * 2
                          + a.published::int AS version
               FROM activities a
               JOIN courses c ON c.id = a.course_id AND c.archived_at IS NULL
               LEFT JOIN file_submissions fs ON fs.activity_id = a.id
               WHERE a.activity_type IN ('dynamic', 'video', 'document', 'file_submission')
               UNION ALL
               SELECT 'item', s.id, a.course_id, a.id,
                      s.content_version::bigint * 2000000 + a.version::bigint * 2 + a.published::int
               FROM assessments s
               JOIN activities a ON a.id = s.activity_id
               JOIN courses c ON c.id = a.course_id AND c.archived_at IS NULL
               UNION ALL
               SELECT 'course', c.id, c.id, NULL::uuid,
                      c.version::bigint * 2000000
                          + COALESCE((SELECT sum(ch.version) + count(*) FROM chapters ch
                                      WHERE ch.course_id = c.id), 0)::bigint
               FROM courses c WHERE c.archived_at IS NULL
           )
           SELECT s.source_type AS "source_type!", s.source_id AS "source_id!",
                  s.course_id AS "course_id!: CourseId", s.activity_id AS "activity_id: ActivityId",
                  s.version AS "version!"
           FROM sources s
           LEFT JOIN content_index_state st
                  ON st.source_type = s.source_type AND st.source_id = s.source_id
           WHERE st.source_id IS NULL
              OR st.source_version <> s.version
              OR (st.chunk_count > 0 AND st.embedding_model IS DISTINCT FROM $1)
              OR (st.error IS NOT NULL AND st.indexed_at < now() - interval '10 minutes')
           ORDER BY st.indexed_at NULLS FIRST
           LIMIT $2"#,
        model,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// The text a lesson, media or assignment chunk is cut from.
#[derive(Debug, Clone)]
pub struct ActivitySourceRow {
    pub course_id: CourseId,
    pub name: String,
    pub activity_type: String,
    pub published: bool,
    pub chapter_name: String,
    pub content: serde_json::Value,
    pub details: serde_json::Value,
    pub instructions: Option<String>,
    pub rubric: Option<serde_json::Value>,
}

pub async fn activity_source(pool: &PgPool, id: ActivityId) -> Result<Option<ActivitySourceRow>> {
    let row = sqlx::query_as!(
        ActivitySourceRow,
        r#"SELECT a.course_id AS "course_id: CourseId", a.name, a.activity_type, a.published,
                  ch.name AS chapter_name, a.content, a.details,
                  fs.instructions AS "instructions?", fs.rubric AS "rubric?"
           FROM activities a
           JOIN chapters ch ON ch.id = a.chapter_id
           LEFT JOIN file_submissions fs ON fs.activity_id = a.id
           WHERE a.id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

#[derive(Debug, Clone)]
pub struct ItemSourceRow {
    pub item_id: uuid::Uuid,
    pub activity_id: ActivityId,
    pub activity_name: String,
    pub published: bool,
    pub title: String,
    pub kind: String,
    pub body: serde_json::Value,
    pub max_score: f64,
}

/// The items of one assessment, in order.
pub async fn item_sources(pool: &PgPool, assessment_id: uuid::Uuid) -> Result<Vec<ItemSourceRow>> {
    let rows = sqlx::query_as!(
        ItemSourceRow,
        r#"SELECT i.id AS item_id, a.id AS "activity_id: ActivityId", a.name AS activity_name,
                  a.published, i.title, i.kind, i.body, i.max_score
           FROM assessment_items i
           JOIN assessments s ON s.id = i.assessment_id
           JOIN activities a ON a.id = s.activity_id
           WHERE i.assessment_id = $1
           ORDER BY i.position, i.id"#,
        assessment_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct CourseSourceRow {
    pub name: String,
    pub description: String,
    pub about: String,
    pub learnings: serde_json::Value,
    pub public: bool,
    pub chapters: Vec<String>,
}

pub async fn course_source(pool: &PgPool, id: CourseId) -> Result<Option<CourseSourceRow>> {
    let row = sqlx::query_as!(
        CourseSourceRow,
        r#"SELECT c.name, c.description, c.about, c.learnings, c.public,
                  COALESCE((SELECT array_agg(ch.name ORDER BY ch.position, ch.id)
                            FROM chapters ch WHERE ch.course_id = c.id), '{}') AS "chapters!"
           FROM courses c WHERE c.id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// One chunk to store.
#[derive(Debug, Clone)]
pub struct NewChunk {
    pub audience: &'static str,
    pub published: bool,
    pub label: String,
    pub body: String,
    pub anchor: serde_json::Value,
    pub token_estimate: i32,
    /// pgvector literal, `None` when the embedder failed or the text has no features.
    pub embedding: Option<String>,
}

pub struct IndexedSource<'a> {
    pub source_type: &'a str,
    pub source_id: uuid::Uuid,
    pub course_id: CourseId,
    pub activity_id: Option<ActivityId>,
    pub version: i64,
    pub embedding_model: Option<&'a str>,
    pub error: Option<&'a str>,
}

/// Replaces the source's chunks and records the version they were cut at.
pub async fn replace_chunks(
    conn: &mut PgConnection,
    source: &IndexedSource<'_>,
    chunks: &[NewChunk],
) -> Result<()> {
    sqlx::query!(
        "DELETE FROM content_chunks WHERE source_type = $1 AND source_id = $2",
        source.source_type,
        source.source_id
    )
    .execute(&mut *conn)
    .await?;
    for (ordinal, chunk) in chunks.iter().enumerate() {
        let model = chunk.embedding.as_ref().and(source.embedding_model);
        sqlx::query!(
            r#"INSERT INTO content_chunks
                   (course_id, activity_id, source_type, source_id, ordinal, audience, published,
                    label, body, anchor, token_estimate, embedding, embedding_model)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text::vector, $13)"#,
            source.course_id.0,
            source.activity_id.map(|a| a.0),
            source.source_type,
            source.source_id,
            i32::try_from(ordinal).unwrap_or(i32::MAX),
            chunk.audience,
            chunk.published,
            chunk.label,
            chunk.body,
            chunk.anchor,
            chunk.token_estimate,
            chunk.embedding.as_deref(),
            model
        )
        .execute(&mut *conn)
        .await?;
    }
    sqlx::query!(
        r#"INSERT INTO content_index_state
               (source_type, source_id, course_id, activity_id, source_version, chunk_count,
                embedding_model, indexed_at, error)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
           ON CONFLICT (source_type, source_id) DO UPDATE
           SET course_id = EXCLUDED.course_id, activity_id = EXCLUDED.activity_id,
               source_version = EXCLUDED.source_version, chunk_count = EXCLUDED.chunk_count,
               embedding_model = EXCLUDED.embedding_model, indexed_at = now(),
               error = EXCLUDED.error"#,
        source.source_type,
        source.source_id,
        source.course_id.0,
        source.activity_id.map(|a| a.0),
        source.version,
        i32::try_from(chunks.len()).unwrap_or(i32::MAX),
        source.embedding_model,
        source.error
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Forget a course's index state: the next sweeps cut every source again.
pub async fn reset_course(pool: &PgPool, course_id: CourseId) -> Result<u64> {
    let done = sqlx::query!(
        "DELETE FROM content_index_state WHERE course_id = $1",
        course_id.0
    )
    .execute(pool)
    .await?;
    Ok(done.rows_affected())
}

#[derive(Debug, Clone)]
pub struct ChunkHit {
    pub id: ContentChunkId,
    pub source_type: String,
    pub source_id: uuid::Uuid,
    pub activity_id: Option<ActivityId>,
    pub label: String,
    pub body: String,
    pub anchor: serde_json::Value,
    pub score: f64,
}

/// Nearest chunks by cosine distance among vectors of `model`. `learner_only` keeps learner-audience,
/// published chunks.
pub async fn vector_candidates(
    pool: &PgPool,
    course_id: CourseId,
    learner_only: bool,
    query_vector: &str,
    model: &str,
    limit: i64,
) -> Result<Vec<ChunkHit>> {
    let mut tx = pool.begin().await?;
    // Filtered HNSW scans keep searching until `limit` rows pass the course filter.
    sqlx::query_scalar!("SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true)")
        .fetch_one(&mut *tx)
        .await?;
    let rows = sqlx::query_as!(
        ChunkHit,
        r#"SELECT id AS "id: ContentChunkId", source_type, source_id,
                  activity_id AS "activity_id: ActivityId", label, body, anchor,
                  (1 - (embedding <=> $3::text::vector))::float8 AS "score!"
           FROM content_chunks
           WHERE course_id = $1 AND embedding_model = $4
             AND (NOT $2 OR (audience = 'learner' AND published))
           ORDER BY embedding <=> $3::text::vector
           LIMIT $5"#,
        course_id.0,
        learner_only,
        query_vector,
        model,
        limit
    )
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(rows)
}

/// Lexical candidates for a `to_tsquery` expression over folded text (`a:* | b:*`).
pub async fn lexical_candidates(
    pool: &PgPool,
    course_id: CourseId,
    learner_only: bool,
    tsquery: &str,
    limit: i64,
) -> Result<Vec<ChunkHit>> {
    let rows = sqlx::query_as!(
        ChunkHit,
        r#"SELECT id AS "id: ContentChunkId", source_type, source_id,
                  activity_id AS "activity_id: ActivityId", label, body, anchor,
                  ts_rank_cd(lexeme, q)::float8 AS "score!"
           FROM content_chunks, to_tsquery('simple', search_fold($3)) q
           WHERE course_id = $1 AND lexeme @@ q
             AND (NOT $2 OR (audience = 'learner' AND published))
           ORDER BY ts_rank_cd(lexeme, q) DESC, id
           LIMIT $4"#,
        course_id.0,
        learner_only,
        tsquery,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct IndexStatusRow {
    pub chunks: i64,
    pub embedded_chunks: i64,
    pub sources: i64,
    pub failed_sources: i64,
    pub last_indexed_at: Option<i64>,
}

pub async fn index_status(
    pool: &PgPool,
    course_id: CourseId,
    model: &str,
) -> Result<IndexStatusRow> {
    let row = sqlx::query_as!(
        IndexStatusRow,
        r#"SELECT (SELECT count(*) FROM content_chunks WHERE course_id = $1) AS "chunks!",
                  (SELECT count(*) FROM content_chunks
                   WHERE course_id = $1 AND embedding_model = $2) AS "embedded_chunks!",
                  (SELECT count(*) FROM content_index_state WHERE course_id = $1) AS "sources!",
                  (SELECT count(*) FROM content_index_state
                   WHERE course_id = $1 AND error IS NOT NULL) AS "failed_sources!",
                  (SELECT extract(epoch FROM max(indexed_at))::bigint
                   FROM content_index_state WHERE course_id = $1) AS "last_indexed_at?""#,
        course_id.0,
        model
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}
