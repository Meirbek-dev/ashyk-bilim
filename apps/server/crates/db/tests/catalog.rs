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

#[ab_testdb::test]
async fn platform_is_a_singleton(pool: PgPool) {
    // Migration 0008 seeds the row; any further insert must be rejected.
    let seeded: i64 = sqlx::query_scalar("SELECT count(*) FROM platforms")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(seeded, 1, "migrations must seed exactly one platform row");
    let second = sqlx::query("INSERT INTO platforms (name, email) VALUES ('Another', 'x@y.z')")
        .execute(&pool)
        .await;
    assert!(second.is_err(), "second platform row must be rejected");
}

#[ab_testdb::test]
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

#[ab_testdb::test]
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

#[ab_testdb::test]
async fn collection_membership_cannot_duplicate(pool: PgPool) {
    let (course, _c, _a) = seed_course(&pool).await;
    let collection: uuid::Uuid =
        sqlx::query_scalar("INSERT INTO collections (name) VALUES ('Track') RETURNING id")
            .fetch_one(&pool)
            .await
            .unwrap();
    let insert =
        "INSERT INTO collection_courses (collection_id, course_id, position) VALUES ($1, $2, 1)";
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

#[ab_testdb::test]
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

#[ab_testdb::test]
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

#[ab_testdb::test]
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

/// One code challenge as the ETL left it: the statement on the activity, an empty item prompt.
async fn seed_code_challenge(pool: &PgPool, description: &str, prompt: &str) -> uuid::Uuid {
    let (course, chapter, _) = seed_course(pool).await;
    let activity: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO activities (chapter_id, course_id, name, activity_type, activity_sub_type, content, position)
         VALUES ($1, $2, 'Hello', 'code_challenge', 'code_general', jsonb_build_object('description', $3::text), 2)
         RETURNING id",
    )
    .bind(chapter)
    .bind(course)
    .bind(description)
    .fetch_one(pool)
    .await
    .unwrap();
    let assessment: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO assessments (activity_id, course_id, kind, title, grading_mode, grade_release_mode, completion_rule)
         VALUES ($1, $2, 'code_challenge', 'Hello', 'auto', 'immediate', 'submitted') RETURNING id",
    )
    .bind(activity)
    .bind(course)
    .fetch_one(pool)
    .await
    .unwrap();
    sqlx::query_scalar(
        "INSERT INTO assessment_items (assessment_id, kind, body)
         VALUES ($1, 'code', jsonb_build_object('kind', 'code', 'prompt', $2::text)) RETURNING id",
    )
    .bind(assessment)
    .bind(prompt)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn prompt_of(pool: &PgPool, item: uuid::Uuid) -> String {
    sqlx::query_scalar("SELECT body ->> 'prompt' FROM assessment_items WHERE id = $1")
        .bind(item)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[ab_testdb::test]
async fn legacy_code_statement_moves_into_an_empty_prompt_only(pool: PgPool) {
    let legacy = seed_code_challenge(&pool, "Print \"Hello\".", "").await;
    let written = seed_code_challenge(&pool, "Old text", "The teacher's statement").await;
    let bare = seed_code_challenge(&pool, "  ", "").await;
    // The migration already ran on the empty schema; run it again over these rows (it must also be idempotent).
    for _ in 0..2 {
        sqlx::raw_sql(include_str!(
            "../../../migrations/20261018000000_code_prompt_from_activity.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
    }
    assert_eq!(prompt_of(&pool, legacy).await, "Print \"Hello\".");
    assert_eq!(prompt_of(&pool, written).await, "The teacher's statement");
    assert_eq!(prompt_of(&pool, bare).await, "");
}

/// Apply the real migration chain to a populated previous schema, preserving a teacher's newer text.
#[sqlx::test(migrations = false)]
async fn populated_previous_schema_upgrades_without_replacing_authored_prompts(pool: PgPool) {
    let mut previous = sqlx::migrate!("../../migrations");
    previous.migrations = std::borrow::Cow::Owned(
        previous
            .iter()
            .filter(|migration| migration.version < 20_261_018_000_000)
            .cloned()
            .collect(),
    );
    previous.run(&pool).await.unwrap();
    let imported = seed_code_challenge(&pool, "Imported statement", "").await;
    let authored = seed_code_challenge(&pool, "Old statement", "Teacher's current statement").await;
    let empty = seed_code_challenge(&pool, "  ", "").await;
    let current = sqlx::migrate!("../../migrations");
    current.run(&pool).await.unwrap();
    assert_eq!(prompt_of(&pool, imported).await, "Imported statement");
    assert_eq!(
        prompt_of(&pool, authored).await,
        "Teacher's current statement"
    );
    assert_eq!(prompt_of(&pool, empty).await, "");
    current.run(&pool).await.unwrap();
    assert_eq!(
        prompt_of(&pool, authored).await,
        "Teacher's current statement"
    );
}

async fn seed_user(pool: &PgPool, name: &str) -> uuid::Uuid {
    sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email) VALUES ($1, $1, $1 || '@example.com') RETURNING id",
    )
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn seed_code_runs(pool: &PgPool, item: uuid::Uuid, user: uuid::Uuid, runs: i32) {
    sqlx::query(
        "INSERT INTO code_runs (assessment_id, item_id, user_id, purpose, status, language_id, source_sha256)
         SELECT i.assessment_id, i.id, $2, 'custom', 'accepted', 71, md5(g::text)
           FROM assessment_items i CROSS JOIN generate_series(1, $3) g WHERE i.id = $1",
    )
    .bind(item)
    .bind(user)
    .bind(runs)
    .execute(pool)
    .await
    .unwrap();
}

/// A code run is learner work only when someone outside the course staff made it: the creator's runs, however many
/// (one staff account held 41k in production), never stop a delete; one learner run does.
#[ab_testdb::test]
async fn only_a_learners_code_run_is_learner_work(pool: PgPool) {
    let item = seed_code_challenge(&pool, "Print", "").await;
    let (activity, course): (uuid::Uuid, uuid::Uuid) = sqlx::query_as(
        "SELECT s.activity_id, s.course_id FROM assessment_items i JOIN assessments s ON s.id = i.assessment_id
          WHERE i.id = $1",
    )
    .bind(item)
    .fetch_one(&pool)
    .await
    .unwrap();
    let teacher = seed_user(&pool, "teacher").await;
    let learner = seed_user(&pool, "learner").await;
    sqlx::query("UPDATE courses SET creator_id = $2 WHERE id = $1")
        .bind(course)
        .bind(teacher)
        .execute(&pool)
        .await
        .unwrap();
    seed_code_runs(&pool, item, teacher, 200).await;
    let with_work = |pool: PgPool| async move {
        ab_db::catalog::activities_with_learner_work(&pool, &[activity])
            .await
            .unwrap()
            .into_iter()
            .map(uuid::Uuid::from)
            .collect::<Vec<_>>()
    };
    assert_eq!(with_work(pool.clone()).await, Vec::<uuid::Uuid>::new());
    seed_code_runs(&pool, item, learner, 1).await;
    assert_eq!(with_work(pool.clone()).await, vec![activity]);
}
