//! The auto-publish job against real Postgres: due schedules go live
//! (assessment + activity + audit), future ones wait.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_jobs::JobHandler;
use ab_jobs::handlers::assessments::AssessmentPublisher;
use sqlx::PgPool;

/// Course → chapter → quiz activity + scheduled assessment; returns the
/// assessment id.
async fn scheduled_assessment(pool: &PgPool, title: &str, offset: &str) -> uuid::Uuid {
    let user: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email)
         VALUES ($1, $1, $1 || '@example.com') RETURNING id",
    )
    .bind(format!("z-{title}"))
    .fetch_one(pool)
    .await
    .unwrap();
    let course: uuid::Uuid =
        sqlx::query_scalar("INSERT INTO courses (name, creator_id) VALUES ($1, $2) RETURNING id")
            .bind(title)
            .bind(user)
            .fetch_one(pool)
            .await
            .unwrap();
    let chapter: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO chapters (course_id, name, creator_id) VALUES ($1, 'c', $2) RETURNING id",
    )
    .bind(course)
    .bind(user)
    .fetch_one(pool)
    .await
    .unwrap();
    let activity: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO activities (chapter_id, course_id, name, activity_type, activity_sub_type, creator_id)
         VALUES ($1, $2, $3, 'quiz', 'quiz_standard', $4) RETURNING id",
    )
    .bind(chapter)
    .bind(course)
    .bind(title)
    .bind(user)
    .fetch_one(pool)
    .await
    .unwrap();
    sqlx::query_scalar(
        "INSERT INTO assessments (activity_id, course_id, kind, title, lifecycle, scheduled_at,
                                  grading_mode, grade_release_mode, completion_rule)
         VALUES ($1, $2, 'quiz', $3, 'scheduled', now() + $4::interval,
                 'auto', 'immediate', 'passed') RETURNING id",
    )
    .bind(activity)
    .bind(course)
    .bind(title)
    .bind(offset)
    .fetch_one(pool)
    .await
    .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn due_schedules_publish_and_future_ones_wait(pool: PgPool) {
    let due = scheduled_assessment(&pool, "due", "-1 minute").await;
    let later = scheduled_assessment(&pool, "later", "1 hour").await;

    AssessmentPublisher::new(pool.clone())
        .handle(serde_json::json!({}))
        .await
        .unwrap();

    let (lifecycle, published_at_set, scheduled_at_set, activity_live): (String, bool, bool, bool) =
        sqlx::query_as(
            "SELECT a.lifecycle, a.published_at IS NOT NULL, a.scheduled_at IS NOT NULL, act.published
             FROM assessments a JOIN activities act ON act.id = a.activity_id
             WHERE a.id = $1",
        )
        .bind(due)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(lifecycle, "published");
    assert!(published_at_set);
    assert!(!scheduled_at_set);
    assert!(
        activity_live,
        "the activity must go live with the assessment"
    );

    let events: i64 =
        sqlx::query_scalar("SELECT count(*) FROM assessment_audit_events WHERE assessment_id = $1")
            .bind(due)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(events, 1);

    let (later_lifecycle, later_live): (String, bool) = sqlx::query_as(
        "SELECT a.lifecycle, act.published FROM assessments a
         JOIN activities act ON act.id = a.activity_id WHERE a.id = $1",
    )
    .bind(later)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(later_lifecycle, "scheduled");
    assert!(!later_live);

    // Idempotent: a second sweep finds nothing.
    let again = ab_domain::assessments::AssessmentsService::publish_due(&pool)
        .await
        .unwrap();
    assert_eq!(again, 0);
}
