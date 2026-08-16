//! Catalog schema integrity: the constraints that replace legacy
//! application-only enforcement must actually bite.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use sqlx::PgPool;

async fn seed_course(pool: &PgPool) -> (uuid::Uuid, uuid::Uuid, uuid::Uuid) {
    let course: uuid::Uuid =
        sqlx::query_scalar("INSERT INTO courses (name) VALUES ('Rust 101') RETURNING id")
            .fetch_one(pool)
            .await
            .unwrap();
    let chapter: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO chapters (course_id, name) VALUES ($1, 'Intro') RETURNING id",
    )
    .bind(course)
    .fetch_one(pool)
    .await
    .unwrap();
    let activity: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO activities (chapter_id, course_id, name, activity_type, activity_sub_type)
         VALUES ($1, $2, 'Lesson', 'dynamic', 'dynamic_page') RETURNING id",
    )
    .bind(chapter)
    .bind(course)
    .fetch_one(pool)
    .await
    .unwrap();
    (course, chapter, activity)
}

#[sqlx::test(migrations = "../../migrations")]
async fn platform_is_a_singleton(pool: PgPool) {
    sqlx::query("INSERT INTO platforms (name, email) VALUES ('Ashyq Bilim', 'a@b.c')")
        .execute(&pool)
        .await
        .unwrap();
    let second = sqlx::query("INSERT INTO platforms (name, email) VALUES ('Another', 'x@y.z')")
        .execute(&pool)
        .await;
    assert!(second.is_err(), "second platform row must be rejected");
}

#[sqlx::test(migrations = "../../migrations")]
async fn invalid_type_subtype_pairs_are_rejected(pool: PgPool) {
    let (course, chapter, _activity) = seed_course(&pool).await;
    let bad = sqlx::query(
        "INSERT INTO activities (chapter_id, course_id, name, activity_type, activity_sub_type)
         VALUES ($1, $2, 'Bad', 'video', 'document_pdf')",
    )
    .bind(chapter)
    .bind(course)
    .execute(&pool)
    .await;
    assert!(
        bad.is_err(),
        "video/document_pdf must violate the pair CHECK"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn cascades_flow_course_to_blocks(pool: PgPool) {
    let (course, _chapter, activity) = seed_course(&pool).await;
    sqlx::query(
        "INSERT INTO blocks (activity_id, block_type, content)
         VALUES ($1, 'image', '{\"file_key\": \"k\"}')",
    )
    .bind(activity)
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query("DELETE FROM courses WHERE id = $1")
        .bind(course)
        .execute(&pool)
        .await
        .unwrap();
    for table in ["chapters", "activities", "blocks"] {
        // SAFETY: table names come from the static list above, not input.
        let count: i64 =
            sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT count(*) FROM {table}")))
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 0, "{table} must cascade away with the course");
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn collection_membership_cannot_duplicate(pool: PgPool) {
    let (course, _c, _a) = seed_course(&pool).await;
    let collection: uuid::Uuid =
        sqlx::query_scalar("INSERT INTO collections (name) VALUES ('Track') RETURNING id")
            .fetch_one(&pool)
            .await
            .unwrap();
    let insert = "INSERT INTO collection_courses (collection_id, course_id) VALUES ($1, $2)";
    sqlx::query(insert)
        .bind(collection)
        .bind(course)
        .execute(&pool)
        .await
        .unwrap();
    let dup = sqlx::query(insert)
        .bind(collection)
        .bind(course)
        .execute(&pool)
        .await;
    assert!(
        dup.is_err(),
        "composite PK must reject duplicate membership"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn one_reaction_per_user_and_no_double_issuance(pool: PgPool) {
    let (course, _c, _a) = seed_course(&pool).await;
    let user: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email)
         VALUES ('z-r', 'reactor', 'r@example.com') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    let discussion: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO course_discussions (course_id, user_id, content)
         VALUES ($1, $2, 'hello') RETURNING id",
    )
    .bind(course)
    .bind(user)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO discussion_reactions (discussion_id, user_id, reaction) VALUES ($1, $2, 'like')")
        .bind(discussion)
        .bind(user)
        .execute(&pool)
        .await
        .unwrap();
    let double = sqlx::query("INSERT INTO discussion_reactions (discussion_id, user_id, reaction) VALUES ($1, $2, 'dislike')")
        .bind(discussion)
        .bind(user)
        .execute(&pool)
        .await;
    assert!(double.is_err(), "a user cannot both like and dislike");

    let certification: uuid::Uuid =
        sqlx::query_scalar("INSERT INTO certifications (course_id) VALUES ($1) RETURNING id")
            .bind(course)
            .fetch_one(&pool)
            .await
            .unwrap();
    let issue = "INSERT INTO certificate_users (certification_id, user_id, verify_code) VALUES ($1, $2, $3)";
    sqlx::query(issue)
        .bind(certification)
        .bind(user)
        .bind("code-1")
        .execute(&pool)
        .await
        .unwrap();
    let dup = sqlx::query(issue)
        .bind(certification)
        .bind(user)
        .bind("code-2")
        .execute(&pool)
        .await;
    assert!(
        dup.is_err(),
        "duplicate certificate issuance must be rejected"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn resource_authors_require_exactly_one_target(pool: PgPool) {
    let (course, _c, _a) = seed_course(&pool).await;
    let collection: uuid::Uuid =
        sqlx::query_scalar("INSERT INTO collections (name) VALUES ('T') RETURNING id")
            .fetch_one(&pool)
            .await
            .unwrap();
    let user: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email)
         VALUES ('z-a', 'author', 'a@example.com') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    // Both targets set → rejected.
    let both = sqlx::query(
        "INSERT INTO resource_authors (course_id, collection_id, user_id, authorship)
         VALUES ($1, $2, $3, 'creator')",
    )
    .bind(course)
    .bind(collection)
    .bind(user)
    .execute(&pool)
    .await;
    assert!(both.is_err());

    // Neither target → rejected.
    let neither =
        sqlx::query("INSERT INTO resource_authors (user_id, authorship) VALUES ($1, 'creator')")
            .bind(user)
            .execute(&pool)
            .await;
    assert!(neither.is_err());

    // Exactly one target, twice for the same user → second rejected
    // (UNIQUE NULLS NOT DISTINCT).
    let one =
        "INSERT INTO resource_authors (course_id, user_id, authorship) VALUES ($1, $2, 'creator')";
    sqlx::query(one)
        .bind(course)
        .bind(user)
        .execute(&pool)
        .await
        .unwrap();
    let dup = sqlx::query(one)
        .bind(course)
        .bind(user)
        .execute(&pool)
        .await;
    assert!(dup.is_err());
}

#[sqlx::test(migrations = "../../migrations")]
async fn full_text_search_matches_course_names(pool: PgPool) {
    sqlx::query("INSERT INTO courses (name, description) VALUES ('Введение в Rust', 'системное программирование')")
        .execute(&pool)
        .await
        .unwrap();
    let hits: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM courses WHERE search @@ plainto_tsquery('simple', 'rust')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(hits, 1);
}
