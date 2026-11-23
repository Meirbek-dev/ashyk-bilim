//! The lexical side of course material search (docs/AI-FIRST.md 1.6), `ab_db::retrieval::lexical_candidates`:
//! - a misspelt word (one letter wrong, missing or extra, also at the start where no prefix helps)
//!   still finds its passage through pg_trgm, and an unrelated word finds nothing;
//! - an exact match ranks above a passage that only resembles the query;
//! - the predicate's expressions match the lexeme and trigram GIN indexes (a BitmapOr of both), so a
//!   course too large for its `(course_id, audience)` rows to be cheap is still served by an index.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::id::CourseId;
use sqlx::PgPool;

async fn course(pool: &PgPool) -> CourseId {
    let id: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO courses (name, description, public) VALUES ('Алгоритмы', 'Курс', true) RETURNING id",
    )
    .fetch_one(pool)
    .await
    .unwrap();
    CourseId(id)
}

async fn chunk(pool: &PgPool, course: CourseId, ordinal: i32, label: &str, body: &str) {
    sqlx::query(
        "INSERT INTO content_chunks (course_id, source_type, source_id, ordinal, audience, label, body,
                                     token_estimate)
         VALUES ($1, 'course', $1, $2, 'learner', $3, $4, 1)",
    )
    .bind(course.0)
    .bind(ordinal)
    .bind(label)
    .bind(body)
    .execute(pool)
    .await
    .unwrap();
}

async fn labels(pool: &PgPool, course: CourseId, tsquery: &str, typo: &str) -> Vec<String> {
    ab_db::retrieval::lexical_candidates(pool, course, true, tsquery, typo, 40)
        .await
        .unwrap()
        .into_iter()
        .map(|h| h.label)
        .collect()
}

#[ab_testdb::test]
async fn misspelt_words_still_find_their_passage(pool: PgPool) {
    let c = course(&pool).await;
    chunk(
        &pool,
        c,
        0,
        "Рекурсия",
        "Рекурсия - это когда функция вызывает саму себя. Базовый случай останавливает её.",
    )
    .await;
    chunk(
        &pool,
        c,
        1,
        "Сортировка",
        "Сортировка массива пузырьком и вставками.",
    )
    .await;
    chunk(
        &pool,
        c,
        2,
        "Стек",
        "Стек вызовов хранит адреса возврата; рекурсия его наполняет.",
    )
    .await;

    // A wrong first letter: the prefix `рикурс:*` matches nothing, the trigrams do.
    assert_eq!(
        labels(&pool, c, "рикурс:*", "рикурсия").await[0],
        "Рекурсия"
    );
    // A missing letter and a Kazakh-keyboard spelling of a Russian word.
    assert_eq!(
        labels(&pool, c, "сртиров:*", "сртировка").await,
        ["Сортировка"]
    );
    assert_eq!(labels(&pool, c, "массів:*", "массів").await, ["Сортировка"]);
    // Nothing alike: nothing found.
    assert!(labels(&pool, c, "алгори:*", "алгоритм").await.is_empty());
    // The exact word leads; a passage that only mentions it follows.
    let exact = labels(&pool, c, "рекурс:*", "рекурсия").await;
    assert_eq!(exact[0], "Рекурсия");
    assert!(exact.contains(&"Стек".to_owned()), "{exact:?}");
}

#[ab_testdb::test]
async fn typo_predicate_matches_the_gin_indexes(pool: PgPool) {
    let c = course(&pool).await;
    sqlx::query(
        "INSERT INTO content_chunks (course_id, source_type, source_id, ordinal, audience, label, body,
                                     token_estimate)
         SELECT $1, 'course', $1, g, 'learner', 'Раздел ' || g,
                'Текст ' || md5(g::text) || ' ' || md5((g * 7)::text), 1
         FROM generate_series(0, 2999) g",
    )
    .bind(c.0)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("ANALYZE content_chunks")
        .execute(&pool)
        .await
        .unwrap();
    // Inside one course of this size the planner rightly reads the course's rows; without the
    // course filter the same predicate must be answerable by the two GIN indexes alone.
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("SET LOCAL enable_seqscan = off")
        .execute(&mut *tx)
        .await
        .unwrap();
    let plan: Vec<String> = sqlx::query_scalar(
        "EXPLAIN SELECT ch.id FROM content_chunks ch
          WHERE ch.lexeme @@ to_tsquery('simple', search_fold('рикурс:*'))
             OR search_fold(ch.label || ' ' || ch.body)
                %> ANY (string_to_array(search_fold('рикурсия'), ' '))",
    )
    .fetch_all(&mut *tx)
    .await
    .unwrap();
    let plan = plan.join("\n");
    assert!(plan.contains("BitmapOr"), "{plan}");
    assert!(plan.contains("content_chunks_trgm_idx"), "{plan}");
    assert!(plan.contains("content_chunks_lexeme_idx"), "{plan}");
}
