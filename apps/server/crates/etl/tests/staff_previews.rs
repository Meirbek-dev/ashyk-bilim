//! BUG-328: legacy attempts by the course's staff migrate as previews.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_etl::loaders_submissions::mark_staff_previews;
use sqlx::PgPool;
use uuid::Uuid;

async fn user(pool: &PgPool, name: &str) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email) VALUES ($1, $1, $1 || '@x.test')
         RETURNING id",
    )
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn attempt(pool: &PgPool, assessment: Uuid, course: Uuid, user: Uuid, legacy: bool) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO submissions (assessment_id, course_id, user_id, status, attempt_number, legacy_uuid)
         VALUES ($1, $2, $3, 'pending', 1, CASE WHEN $4 THEN gen_random_uuid()::text END)
         RETURNING id",
    )
    .bind(assessment)
    .bind(course)
    .bind(user)
    .bind(legacy)
    .fetch_one(pool)
    .await
    .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn staff_legacy_attempts_become_previews(pool: PgPool) {
    let creator = user(&pool, "creator").await;
    let contributor = user(&pool, "contributor").await;
    let learner = user(&pool, "learner").await;
    let course: Uuid =
        sqlx::query_scalar("INSERT INTO courses (name, creator_id) VALUES ('c', $1) RETURNING id")
            .bind(creator)
            .fetch_one(&pool)
            .await
            .unwrap();
    sqlx::query(
        "INSERT INTO resource_authors (course_id, user_id, authorship) VALUES ($1, $2, 'contributor')",
    )
    .bind(course)
    .bind(contributor)
    .execute(&pool)
    .await
    .unwrap();
    let chapter: Uuid = sqlx::query_scalar(
        "INSERT INTO chapters (course_id, name, creator_id) VALUES ($1, 'ch', $2) RETURNING id",
    )
    .bind(course)
    .bind(creator)
    .fetch_one(&pool)
    .await
    .unwrap();
    let activity: Uuid = sqlx::query_scalar(
        "INSERT INTO activities (chapter_id, course_id, name, activity_type, activity_sub_type)
         VALUES ($1, $2, 'q', 'quiz', 'quiz_standard') RETURNING id",
    )
    .bind(chapter)
    .bind(course)
    .fetch_one(&pool)
    .await
    .unwrap();
    let assessment: Uuid = sqlx::query_scalar(
        "INSERT INTO assessments (activity_id, course_id, kind, title, lifecycle,
                                  grading_mode, grade_release_mode, completion_rule)
         VALUES ($1, $2, 'quiz', 'Q', 'published', 'auto', 'immediate', 'passed')
         RETURNING id",
    )
    .bind(activity)
    .bind(course)
    .fetch_one(&pool)
    .await
    .unwrap();

    let by_creator = attempt(&pool, assessment, course, creator, true).await;
    let by_contributor = attempt(&pool, assessment, course, contributor, true).await;
    let by_learner = attempt(&pool, assessment, course, learner, true).await;
    // A v2 attempt keeps the flag it was made with (a learner promoted later).
    let v2_by_contributor = attempt(&pool, assessment, course, contributor, false).await;

    let mut conn = pool.acquire().await.unwrap();
    assert_eq!(mark_staff_previews(&mut conn).await.unwrap(), 2);
    assert_eq!(
        mark_staff_previews(&mut conn).await.unwrap(),
        0,
        "idempotent"
    );

    for (id, preview) in [
        (by_creator, true),
        (by_contributor, true),
        (by_learner, false),
        (v2_by_contributor, false),
    ] {
        let flag: bool = sqlx::query_scalar("SELECT preview FROM submissions WHERE id = $1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(flag, preview, "{id}");
    }
    // The review summary («N работ требуют проверки») counts the learner
    // and the attempt made before the promotion, never the staff previews.
    let stats = ab_db::submissions::stats(&pool, ab_core::id::AssessmentId(assessment))
        .await
        .unwrap();
    assert_eq!((stats.total, stats.pending), (2, 2));
}
