//! REWRITE 5.8 item 10, *points as the record*: the data fix of `20261116075663_points_record` on rows the release
//! before wrote (percentages, share-of-100 breakdowns), and its triggers on what that release still writes.
//!
//! The database is migrated to the release before, seeded the way it wrote, then migrated on.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::float_cmp
)]

use sqlx::postgres::PgPoolOptions;
use sqlx::{AssertSqlSafe, Executor, PgPool};
use uuid::Uuid;

/// The last migration of the release before.
const BEFORE: i64 = 20_261_116_075_662;
const SWITCH: i64 = 20_261_116_075_663;

const Q1: &str = "019bb10c-2f09-78b1-8191-000000000001";
const Q2: &str = "019bb10c-2f09-78b1-8191-000000000002";

/// A database of its own beside the test's, migrated to `BEFORE` (the test's database holds every migration).
async fn database_before(test: &PgPool, name: &str) -> PgPool {
    for sql in [
        format!("DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)"),
        format!("CREATE DATABASE \"{name}\""),
    ] {
        test.execute(AssertSqlSafe(sql)).await.unwrap();
    }
    let options = (*test.connect_options()).clone().database(name);
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect_with(options)
        .await
        .unwrap();
    ab_db::MIGRATOR.run_to(BEFORE, &pool).await.unwrap();
    pool
}

async fn scalar_uuid(pool: &PgPool, sql: &str, binds: &[Uuid]) -> Uuid {
    let mut query = sqlx::query_scalar::<_, Uuid>(AssertSqlSafe(sql.to_owned()));
    for b in binds {
        query = query.bind(*b);
    }
    query.fetch_one(pool).await.unwrap()
}

struct Seed {
    /// Passing 33.34: 33.34 % of 3 points is 1.00 point, 33.33 % - passed goes to false.
    fails: Uuid,
    /// Passing 33.33: 33.32 % is 1.00 point, 33.33 % - passed goes to true (an explicit override).
    passes: Uuid,
    /// 73.5 % of 3 is 2.21 points, 73.67 %: still passed.
    shifts: Uuid,
    /// A raw adjusted before the override flag existed: 90 % with items worth 50 %.
    adjusted: Uuid,
}

/// Two quizzes of the same two items (1 and 2 points) and four graded hand-ins, written as the release before did.
#[allow(
    clippy::too_many_lines,
    reason = "one seed, in the order the rows depend on each other"
)]
async fn seed(pool: &PgPool) -> Seed {
    let teacher = scalar_uuid(
        pool,
        "INSERT INTO users (zitadel_user_id, username, email) VALUES ('z-t', 't', 't@example.com') RETURNING id",
        &[],
    )
    .await;
    let course = scalar_uuid(
        pool,
        "WITH c AS (INSERT INTO courses (name) VALUES ('c') RETURNING id),
              s AS (INSERT INTO course_staff (course_id, user_id, authorship) SELECT id, $1, 'creator' FROM c)
         SELECT id FROM c",
        &[teacher],
    )
    .await;
    let chapter = scalar_uuid(
        pool,
        "INSERT INTO chapters (course_id, name, created_by) VALUES ($1, 'ch', $2) RETURNING id",
        &[course, teacher],
    )
    .await;
    let items = serde_json::json!({ "items": [
        { "id": Q1, "kind": "choice", "title": "q1", "max_score": 1, "position": 1, "body": {} },
        { "id": Q2, "kind": "open_text", "title": "q2", "max_score": 2, "position": 2, "body": {} },
    ] });
    let mut quizzes = vec![];
    for (position, passing) in [(1, 33.34_f64), (2, 33.33)] {
        let activity = scalar_uuid(
            pool,
            &format!(
                "INSERT INTO activities (chapter_id, course_id, name, kind, sub_kind, position)
                 VALUES ($1, $2, 'q', 'quiz', 'quiz_standard', {position}) RETURNING id"
            ),
            &[chapter, course],
        )
        .await;
        let assessment: Uuid = sqlx::query_scalar(
            "INSERT INTO assessments (activity_id, course_id, status, published_at, grading_mode,
                                      grade_release_mode, completion_rule, passing_score)
             VALUES ($1, $2, 'published', now(), 'manual', 'immediate', 'passed', $3::numeric) RETURNING id",
        )
        .bind(activity)
        .bind(course)
        .bind(passing)
        .fetch_one(pool)
        .await
        .unwrap();
        let version = ab_db::assessment_versions::ensure(
            pool,
            ab_core::id::AssessmentId(assessment),
            &items,
            &serde_json::json!({}),
        )
        .await
        .unwrap();
        quizzes.push((activity, assessment, version.0));
    }
    // A share-of-100 breakdown: q1 is 33.33 of 100, q2 66.67.
    let breakdown = |q1: f64, q2: f64, flag: Option<f64>| {
        let mut b = serde_json::json!({ "items": [
            { "item_id": Q1, "score": q1, "max_score": 33.33 },
            { "item_id": Q2, "score": q2, "max_score": 66.67 },
        ], "needs_manual_review": false, "auto_graded": false, "feedback": "" });
        if let Some(flag) = flag {
            b["score_override"] = flag.into();
        }
        b
    };
    let mut ids = vec![];
    for (n, (quiz, percent, effective)) in [
        (0, 33.34, breakdown(33.33, 0.01, None)),
        (1, 33.32, breakdown(33.33, 0.0, Some(33.32))),
        (0, 73.5, breakdown(33.33, 40.17, None)),
        (0, 90.0, breakdown(33.33, 16.67, None)),
    ]
    .into_iter()
    .enumerate()
    {
        let (activity, assessment, version) = quizzes[quiz];
        let learner: Uuid = sqlx::query_scalar(
            "INSERT INTO users (zitadel_user_id, username, email)
             VALUES ('z-l' || $1, 'l' || $1, 'l' || $1 || '@example.com') RETURNING id",
        )
        .bind(i32::try_from(n).unwrap())
        .fetch_one(pool)
        .await
        .unwrap();
        let mut tx = pool.begin().await.unwrap();
        let submission: Uuid = sqlx::query_scalar(
            "INSERT INTO submissions (assessment_id, course_id, user_id, status, attempt_number, submitted_at,
                                      items_snapshot, policy_snapshot, assessment_version_id, auto_score,
                                      final_score, auto_breakdown)
             VALUES ($1, $2, $3, 'released', 1, now(), '{}', '{}', $4, $5::numeric, $5::numeric, $6)
             RETURNING id",
        )
        .bind(assessment)
        .bind(course)
        .bind(learner)
        .bind(version)
        .bind(percent)
        .bind(&effective)
        .fetch_one(&mut *tx)
        .await
        .unwrap();
        // The release before wrote the entry's points from its percentages (5.8 item 7).
        sqlx::query(
            "INSERT INTO grading_entries (submission_id, graded_by, raw_score, final_score, raw_breakdown,
                                          effective_breakdown, revision, max_points, raw_points, final_points,
                                          published_at)
             VALUES ($1, $2, $3::numeric, $3::numeric, $4, $4, 1, 3, points_of_percent($3::numeric, 3),
                     points_of_percent($3::numeric, 3), now())",
        )
        .bind(submission)
        .bind(teacher)
        .bind(percent)
        .bind(&effective)
        .execute(&mut *tx)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO activity_progress (course_id, activity_id, user_id, status, score, passed,
                                            best_submission_id, latest_submission_id, attempt_count)
             SELECT $1, $2, $3, 'released', $4::numeric, $4::numeric >= a.passing_score, $5, $5, 1
             FROM assessments a WHERE a.id = $6",
        )
        .bind(course)
        .bind(activity)
        .bind(learner)
        .bind(percent)
        .bind(submission)
        .bind(assessment)
        .execute(&mut *tx)
        .await
        .unwrap();
        tx.commit().await.unwrap();
        ids.push(submission);
    }
    Seed {
        fails: ids[0],
        passes: ids[1],
        shifts: ids[2],
        adjusted: ids[3],
    }
}

/// Rows the fix must not write: notifications, XP, certificates, completions.
async fn untouched(pool: &PgPool) -> Vec<i64> {
    let mut counts = vec![];
    for table in [
        "notifications",
        "xp_transactions",
        "certificates",
        "completions",
        "gamification_completions",
    ] {
        counts.push(
            sqlx::query_scalar::<_, i64>(AssertSqlSafe(format!("SELECT count(*) FROM {table}")))
                .fetch_one(pool)
                .await
                .unwrap(),
        );
    }
    counts
}

async fn submission(pool: &PgPool, id: Uuid) -> (f64, f64, f64, f64, serde_json::Value) {
    sqlx::query_as(
        "SELECT max_points::float8, final_points::float8, final_score::float8, auto_points::float8, auto_breakdown
         FROM submissions WHERE id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn entry(pool: &PgPool, id: Uuid) -> (f64, f64, f64, serde_json::Value) {
    sqlx::query_as(
        "SELECT raw_points::float8, raw_score::float8, final_score::float8, effective_breakdown
         FROM grading_entries WHERE submission_id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn progress(pool: &PgPool, submission: Uuid) -> (f64, bool) {
    sqlx::query_as(
        "SELECT score::float8, passed FROM activity_progress WHERE best_submission_id = $1",
    )
    .bind(submission)
    .fetch_one(pool)
    .await
    .unwrap()
}

#[ab_testdb::test]
async fn old_grades_become_points_of_their_version(test: PgPool) {
    let name = format!("_ab_test_points_record_{}", std::process::id());
    let pool = database_before(&test, &name).await;
    let seed = seed(&pool).await;
    let before = untouched(&pool).await;
    ab_db::MIGRATOR.run_to(SWITCH, &pool).await.unwrap();

    // 33.34 % of 3 points: 1.00 point, 33.33 % - below the 33.34 to pass.
    let (max, points, percent, auto, breakdown) = submission(&pool, seed.fails).await;
    assert_eq!((max, points, percent, auto), (3.0, 1.0, 33.33, 1.0));
    assert_eq!(
        breakdown["items"],
        serde_json::json!([
            { "item_id": Q1, "score": 1.00, "max_score": 1 },
            { "item_id": Q2, "score": 0.00, "max_score": 2 },
        ]),
        "a share of 100 became the item's points"
    );
    assert_eq!(
        progress(&pool, seed.fails).await,
        (33.33, false),
        "passed went to false"
    );
    let (raw_points, raw, final_score, _) = entry(&pool, seed.fails).await;
    assert_eq!((raw_points, raw, final_score), (1.0, 33.33, 33.33));

    // 33.32 % is 1.00 point too, 33.33 %: passes a 33.33 bar now; the override became points.
    assert_eq!(submission(&pool, seed.passes).await.2, 33.33);
    assert_eq!(
        progress(&pool, seed.passes).await,
        (33.33, true),
        "passed went to true"
    );
    assert_eq!(entry(&pool, seed.passes).await.3["score_override"], 1.0);

    // 73.5 % of 3 = 2.205: 2.21 points, 73.67 %.
    let shifted = submission(&pool, seed.shifts).await;
    assert_eq!((shifted.1, shifted.2), (2.21, 73.67));
    assert_eq!(progress(&pool, seed.shifts).await, (73.67, true));
    assert!(
        entry(&pool, seed.shifts)
            .await
            .3
            .get("score_override")
            .is_none(),
        "a raw equal to its items is no override"
    );

    // BUG-329: a raw the items do not explain was a teacher's adjustment - it carries the flag now.
    let (raw_points, raw, _, effective) = entry(&pool, seed.adjusted).await;
    assert_eq!((raw_points, raw), (2.7, 90.0));
    assert_eq!(effective["score_override"], 2.7);

    assert_eq!(
        untouched(&pool).await,
        before,
        "no notification, XP, certificate or completion"
    );

    // The release before still writes percentages: the triggers keep its rows in points.
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("UPDATE submissions SET final_score = 50, status = 'released' WHERE id = $1")
        .bind(seed.shifts)
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO grading_entries (submission_id, raw_score, final_score, raw_breakdown,
                                      effective_breakdown, revision)
         VALUES ($1, 50, 50, '{}', $2, 2)",
    )
    .bind(seed.shifts)
    .bind(serde_json::json!({ "items": [
        { "item_id": Q1, "score": 0, "max_score": 33.33 },
        { "item_id": Q2, "score": 50, "max_score": 66.67 },
    ], "score_override": 50 }))
    .execute(&mut *tx)
    .await
    .unwrap();
    tx.commit().await.unwrap();
    let (_, points, percent, _, _) = submission(&pool, seed.shifts).await;
    assert_eq!((points, percent), (1.5, 50.0));
    let written: (f64, f64, f64, serde_json::Value) = sqlx::query_as(
        "SELECT max_points::float8, raw_points::float8, final_points::float8, effective_breakdown
         FROM grading_entries WHERE submission_id = $1 AND revision = 2",
    )
    .bind(seed.shifts)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!((written.0, written.1, written.2), (3.0, 1.5, 1.5));
    assert_eq!(written.3["score_override"], 1.5);
    assert_eq!(
        written.3["items"][1]["score"], 1.5,
        "66.67 of a share is the 2 points of q2"
    );
    assert_eq!(written.3["items"][1]["max_score"], 2);

    pool.close().await;
    test.execute(AssertSqlSafe(format!(
        "DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)"
    )))
    .await
    .unwrap();
}
