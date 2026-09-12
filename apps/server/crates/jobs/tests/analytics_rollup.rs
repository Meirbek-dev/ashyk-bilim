//! `analytics:rollup` retention against real Postgres: rows past the
//! windows go, rows inside them stay (DECISIONS "Analytics retention (b)").
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_jobs::JobHandler;
use ab_jobs::handlers::analytics::AnalyticsRollup;
use sqlx::PgPool;

async fn count(pool: &PgPool, sql: &'static str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn rollup_prunes_rows_past_the_retention_windows(pool: PgPool) {
    // Events: 401 days is out, 399 days stays.
    sqlx::query(
        "INSERT INTO analytics_events (event_type, occurred_at)
         VALUES ('login', now() - interval '401 days'), ('login', now() - interval '399 days')",
    )
    .execute(&pool)
    .await
    .unwrap();
    // Platform-wide teacher rollup rows (teacher_user_id NULL needs no user).
    sqlx::query(
        "INSERT INTO daily_teacher_metrics (metric_date)
         VALUES (current_date - interval '2 years 1 day'), (current_date - interval '1 year')",
    )
    .execute(&pool)
    .await
    .unwrap();
    let user: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email)
         VALUES ('z-r', 'retained', 'r@example.com') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let course: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO courses (name, creator_id) VALUES ('Retention', $1) RETURNING id",
    )
    .bind(user)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO learner_risk_snapshots (snapshot_date, user_id, course_id, risk_level)
         VALUES (current_date - interval '3 years', $1, $2, 'low'),
                (current_date - interval '1 day', $1, $2, 'low')",
    )
    .bind(user)
    .bind(course)
    .execute(&pool)
    .await
    .unwrap();

    AnalyticsRollup::new(pool.clone())
        .handle(serde_json::json!({}))
        .await
        .unwrap();

    assert_eq!(
        count(&pool, "SELECT count(*) FROM analytics_events").await,
        1
    );
    assert_eq!(
        count(
            &pool,
            "SELECT count(*) FROM analytics_events WHERE occurred_at < now() - interval '400 days'"
        )
        .await,
        0
    );
    // The rollup itself writes today's platform row next to the retained one.
    assert_eq!(
        count(
            &pool,
            "SELECT count(*) FROM daily_teacher_metrics
             WHERE metric_date < current_date - interval '2 years'"
        )
        .await,
        0
    );
    assert!(count(&pool, "SELECT count(*) FROM daily_teacher_metrics").await >= 1);
    assert_eq!(
        count(
            &pool,
            "SELECT count(*) FROM learner_risk_snapshots
             WHERE snapshot_date < current_date - interval '2 years'"
        )
        .await,
        0
    );
    assert!(count(&pool, "SELECT count(*) FROM learner_risk_snapshots").await >= 1);
}
