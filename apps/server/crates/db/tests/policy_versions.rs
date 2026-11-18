//! REWRITE 5.8 item 10, *policy in versions*: every save of an assessment is a version holding its items and
//! its policy (`assessments.current_version_id` names the one in force), a policy-only save stales no draft,
//! and the hand-in versions written before keep their policy apart from `assessment_overrides`.
//!
//! The rebuild runs on rows the release before wrote: the database is migrated to it, seeded, migrated on. The
//! switch's triggers keep that release's writes in step; a database of its own stays at the switch for them.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::too_many_lines
)]

use ab_core::id::{AssessmentId, SubmissionId};
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;
use sqlx::{AssertSqlSafe, Executor, PgPool};
use uuid::Uuid;

/// The last migration before the switch.
const BEFORE: i64 = 20_261_116_075_665;
/// The switch release's last migration (its two index files after it).
const SWITCH: i64 = 20_261_116_075_668;

const Q1: &str = "019bb10c-2f09-78b1-8191-0000000000a1";
const DUE: i64 = 2_000_000_000;
const LATER: i64 = DUE + 86_400;

/// A database of its own beside the test's, migrated to `to`.
async fn database_at(test: &PgPool, name: &str, to: i64) -> PgPool {
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
    ab_db::MIGRATOR.run_to(to, &pool).await.unwrap();
    pool
}

async fn uuid_of(pool: &PgPool, sql: &str, binds: &[Uuid]) -> Uuid {
    let mut query = sqlx::query_scalar::<_, Uuid>(AssertSqlSafe(sql.to_owned()));
    for b in binds {
        query = query.bind(*b);
    }
    query.fetch_one(pool).await.unwrap()
}

async fn user(pool: &PgPool, name: &str) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email)
         VALUES ('z-' || $1, $1, $1 || '@example.com') RETURNING id",
    )
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

struct Course {
    teacher: Uuid,
    id: Uuid,
    chapter: Uuid,
}

async fn course(pool: &PgPool) -> Course {
    let teacher = user(pool, "t").await;
    let course = uuid_of(
        pool,
        "WITH c AS (INSERT INTO courses (name) VALUES ('c') RETURNING id),
              s AS (INSERT INTO course_staff (course_id, user_id, authorship) SELECT id, $1, 'creator' FROM c)
         SELECT id FROM c",
        &[teacher],
    )
    .await;
    let chapter = uuid_of(
        pool,
        "INSERT INTO chapters (course_id, name, created_by) VALUES ($1, 'ch', $2) RETURNING id",
        &[course, teacher],
    )
    .await;
    Course {
        teacher,
        id: course,
        chapter,
    }
}

async fn activity(pool: &PgPool, c: &Course, position: i32) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO activities (chapter_id, course_id, name, kind, sub_kind, position)
         VALUES ($1, $2, 'q', 'quiz', 'quiz_standard', $3) RETURNING id",
    )
    .bind(c.chapter)
    .bind(c.id)
    .bind(position)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// The effective nine fields the release before versioned a hand-in with (`snapshots`).
fn snapshot(max_attempts: &Value, due_at: &Value, passing_score: f64) -> Value {
    json!({
        "max_attempts": max_attempts, "time_limit_seconds": null, "due_at": due_at, "allow_late": true,
        "passing_score": passing_score, "grading_mode": "auto", "grade_release_mode": "immediate",
        "completion_rule": "passed", "attempt_penalty_percent": 0,
    })
}

fn items() -> Value {
    json!({ "items": [{
        "id": Q1, "kind": "open_text", "title": "q1", "max_score": 1, "position": 1,
        "body": { "kind": "open_text" },
    }] })
}

async fn old_version(pool: &PgPool, assessment: Uuid, number: i32, policy: &Value) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO assessment_versions (assessment_id, number, items, policy)
         VALUES ($1, $2, $3, $4) RETURNING id",
    )
    .bind(assessment)
    .bind(number)
    .bind(items())
    .bind(policy)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn handed_in(
    pool: &PgPool,
    c: &Course,
    assessment: Uuid,
    learner: Uuid,
    version: Uuid,
    preview: bool,
) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO submissions (assessment_id, course_id, user_id, status, attempt_number, submitted_at,
                                  items_snapshot, policy_snapshot, assessment_version_id, max_points, preview)
         SELECT $1, $2, $3, 'submitted', 1, now(), v.items, v.policy, v.id, 1, $5
           FROM assessment_versions v WHERE v.id = $4
         RETURNING id",
    )
    .bind(assessment)
    .bind(c.id)
    .bind(learner)
    .bind(version)
    .bind(preview)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn draft(pool: &PgPool, c: &Course, assessment: Uuid, learner: Uuid) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO submissions (assessment_id, course_id, user_id, attempt_number, content_version)
         SELECT $1, $2, $3, 1, a.content_version FROM assessments a WHERE a.id = $1 RETURNING id",
    )
    .bind(assessment)
    .bind(c.id)
    .bind(learner)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn versions(pool: &PgPool, assessment: Uuid) -> Vec<(Uuid, i32, Value)> {
    sqlx::query_as("SELECT id, number, policy FROM assessment_versions WHERE assessment_id = $1 ORDER BY number")
        .bind(assessment)
        .fetch_all(pool)
        .await
        .unwrap()
}

async fn current(pool: &PgPool, assessment: Uuid) -> Option<Uuid> {
    sqlx::query_scalar("SELECT current_version_id FROM assessments WHERE id = $1")
        .bind(assessment)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn version_of(pool: &PgPool, submission: Uuid) -> Uuid {
    sqlx::query_scalar("SELECT assessment_version_id FROM submissions WHERE id = $1")
        .bind(submission)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn stale(pool: &PgPool, submission: Uuid) -> bool {
    ab_db::submissions::get_submission(pool, SubmissionId(submission))
        .await
        .unwrap()
        .unwrap()
        .items_stale
}

/// A cap or a due date an override explains, and a preview's open cap, are not the assessment's: those
/// versions become the plain one and merge into it. A value nothing explains stays as the policy then.
#[ab_testdb::test]
async fn old_versions_take_the_policy_apart_from_overrides(test: PgPool) {
    let name = format!("_ab_test_policy_rebuild_{}", std::process::id());
    let pool = database_at(&test, &name, BEFORE).await;
    let c = course(&pool).await;
    let quiz = activity(&pool, &c, 1).await;
    let assessment: Uuid = sqlx::query_scalar(
        "INSERT INTO assessments (activity_id, course_id, status, published_at, grading_mode, grade_release_mode,
                                  completion_rule, passing_score, max_attempts, due_at)
         VALUES ($1, $2, 'published', now(), 'auto', 'immediate', 'passed', 50, 2, to_timestamp($3)) RETURNING id",
    )
    .bind(quiz)
    .bind(c.id)
    .bind(DUE)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO assessment_items (id, assessment_id, kind, title, max_score, position, body)
         VALUES ($1::uuid, $2, 'open_text', 'q1', 1, 1, '{\"kind\": \"open_text\"}')",
    )
    .bind(Q1)
    .bind(assessment)
    .execute(&pool)
    .await
    .unwrap();
    let mut learners = vec![];
    for n in 1..=5 {
        learners.push(user(&pool, &format!("l{n}")).await);
    }
    for (learner, cap, due) in [
        (learners[1], Some(5), None),
        (learners[2], None, Some(LATER)),
    ] {
        sqlx::query(
            "INSERT INTO assessment_overrides (assessment_id, user_id, max_attempts_override, due_at_override)
             VALUES ($1, $2, $3, to_timestamp($4))",
        )
        .bind(assessment)
        .bind(learner)
        .bind(cap)
        .bind(due)
        .execute(&pool)
        .await
        .unwrap();
    }
    let plain = old_version(
        &pool,
        assessment,
        1,
        &snapshot(&json!(2), &json!(DUE), 50.0),
    )
    .await;
    let capped = old_version(
        &pool,
        assessment,
        2,
        &snapshot(&json!(5), &json!(DUE), 50.0),
    )
    .await;
    let extended = old_version(
        &pool,
        assessment,
        3,
        &snapshot(&json!(2), &json!(LATER), 50.0),
    )
    .await;
    let previewed = old_version(
        &pool,
        assessment,
        4,
        &snapshot(&Value::Null, &json!(DUE), 50.0),
    )
    .await;
    let easier = old_version(
        &pool,
        assessment,
        5,
        &snapshot(&json!(2), &json!(DUE), 40.0),
    )
    .await;
    let plain_in = handed_in(&pool, &c, assessment, learners[0], plain, false).await;
    let capped_in = handed_in(&pool, &c, assessment, learners[1], capped, false).await;
    let extended_in = handed_in(&pool, &c, assessment, learners[2], extended, false).await;
    let preview_in = handed_in(&pool, &c, assessment, c.teacher, previewed, true).await;
    let easier_in = handed_in(&pool, &c, assessment, learners[3], easier, false).await;
    let open = draft(&pool, &c, assessment, learners[4]).await;
    // An assessment nobody handed in: it has no version until the switch saves one.
    let other_quiz = activity(&pool, &c, 2).await;
    let unversioned: Uuid = sqlx::query_scalar(
        "INSERT INTO assessments (activity_id, course_id, grading_mode, grade_release_mode, completion_rule)
         VALUES ($1, $2, 'manual', 'batch', 'graded') RETURNING id",
    )
    .bind(other_quiz)
    .bind(c.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let other_draft = draft(&pool, &c, unversioned, learners[0]).await;

    ab_db::MIGRATOR.run_to(SWITCH, &pool).await.unwrap();

    let kept = versions(&pool, assessment).await;
    assert_eq!(
        kept.iter().map(|v| v.0).collect::<Vec<_>>(),
        vec![plain, easier],
        "the explained ones merged into the plain one"
    );
    let keys = sqlx::query_scalar::<_, Vec<String>>("SELECT assessment_policy_keys()")
        .fetch_one(&pool)
        .await
        .unwrap();
    for (_, _, policy) in &kept {
        for key in &keys {
            assert!(policy.get(key).is_some(), "{key} in {policy}");
        }
    }
    assert_eq!(kept[0].2["max_attempts"], json!(2));
    assert_eq!(kept[0].2["due_at"], json!(DUE));
    assert_eq!(kept[0].2["passing_score"], json!(50.0));
    assert_eq!(
        kept[1].2["passing_score"],
        json!(40.0),
        "unexplained: the policy then"
    );
    assert_eq!(kept[1].2["max_attempts"], json!(2));
    for s in [plain_in, capped_in, extended_in, preview_in] {
        assert_eq!(version_of(&pool, s).await, plain);
    }
    assert_eq!(version_of(&pool, easier_in).await, easier);
    assert_eq!(
        current(&pool, assessment).await,
        Some(plain),
        "the plain version holds today's items and policy: it is the current one"
    );
    assert!(
        !stale(&pool, open).await,
        "the open draft is on the current version"
    );

    let saved = versions(&pool, unversioned).await;
    assert_eq!(
        saved.len(),
        1,
        "a version saved for the assessment without one"
    );
    assert_eq!(current(&pool, unversioned).await, Some(saved[0].0));
    assert_eq!(saved[0].2["grading_mode"], json!("manual"));
    assert_eq!(saved[0].2["completion_rule"], json!("graded"));
    assert!(!stale(&pool, other_draft).await);

    pool.close().await;
    test.execute(AssertSqlSafe(format!(
        "DROP DATABASE \"{name}\" WITH (FORCE)"
    )))
    .await
    .unwrap();
}

/// The release before writes the policy columns, items and drafts as it did; the switch's triggers turn
/// each into versions and base versions, and a save of this release lands in the columns it reads.
#[ab_testdb::test]
async fn writes_of_the_release_before_go_through_the_switch(test: PgPool) {
    let name = format!("_ab_test_policy_switch_{}", std::process::id());
    let pool = database_at(&test, &name, SWITCH).await;
    let c = course(&pool).await;
    let quiz = activity(&pool, &c, 1).await;
    let learner = user(&pool, "l").await;
    let other = user(&pool, "m").await;
    // `insert_assessment` of the release before: the policy in the columns.
    let assessment: Uuid = sqlx::query_scalar(
        "INSERT INTO assessments (activity_id, course_id, grading_mode, grade_release_mode, completion_rule,
                                  passing_score, max_attempts)
         VALUES ($1, $2, 'auto', 'immediate', 'passed', 70, 3) RETURNING id",
    )
    .bind(quiz)
    .bind(c.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let first = versions(&pool, assessment).await;
    assert_eq!(first.len(), 1, "the insert saved a version at commit");
    assert_eq!(first[0].2["passing_score"], json!(70.0));
    assert_eq!(first[0].2["max_attempts"], json!(3));
    assert_eq!(current(&pool, assessment).await, Some(first[0].0));

    // Its item insert and content bump.
    let mut tx = pool.begin().await.unwrap();
    sqlx::query(
        "INSERT INTO assessment_items (id, assessment_id, kind, title, max_score, position, body)
         VALUES ($1::uuid, $2, 'open_text', 'q1', 1, 1, '{\"kind\": \"open_text\"}')",
    )
    .bind(Q1)
    .bind(assessment)
    .execute(&mut *tx)
    .await
    .unwrap();
    sqlx::query("UPDATE assessments SET content_version = content_version + 1 WHERE id = $1")
        .bind(assessment)
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let with_item = current(&pool, assessment).await.unwrap();
    assert_ne!(with_item, first[0].0, "new items, a new version");
    let fresh = draft(&pool, &c, assessment, learner).await;
    let base: Option<Uuid> =
        sqlx::query_scalar("SELECT base_version_id FROM submissions WHERE id = $1")
            .bind(fresh)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        base,
        Some(with_item),
        "its draft insert named the current version"
    );

    // Its policy update: a new current version, the same items, the draft stays fresh.
    sqlx::query("UPDATE assessments SET passing_score = 80, policy_version = policy_version + 1 WHERE id = $1")
        .bind(assessment)
        .execute(&pool)
        .await
        .unwrap();
    let stricter = current(&pool, assessment).await.unwrap();
    assert_ne!(stricter, with_item);
    let policy: Value = sqlx::query_scalar("SELECT policy FROM assessment_versions WHERE id = $1")
        .bind(stricter)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(policy["passing_score"], json!(80.0));
    assert!(
        !stale(&pool, fresh).await,
        "a policy change stales no draft"
    );

    // Its wording edit (`bump_wording_version`): the drafts on the version it replaces move with it.
    sqlx::query("UPDATE assessment_items SET title = 'q1 fixed' WHERE id = $1::uuid")
        .bind(Q1)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "WITH bumped AS (UPDATE assessments SET content_version = content_version + 1
                         WHERE id = $1 RETURNING content_version)
         UPDATE submissions s SET content_version = b.content_version FROM bumped b
          WHERE s.assessment_id = $1 AND s.status = 'draft' AND s.content_version = b.content_version - 1",
    )
    .bind(assessment)
    .execute(&pool)
    .await
    .unwrap();
    let reworded = current(&pool, assessment).await.unwrap();
    assert_ne!(reworded, stricter);
    assert!(!stale(&pool, fresh).await, "a wording fix keeps the draft");

    // A content change it makes without moving drafts stales them.
    let behind = draft(&pool, &c, assessment, other).await;
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("UPDATE assessment_items SET max_score = 2 WHERE id = $1::uuid")
        .bind(Q1)
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query("UPDATE assessments SET content_version = content_version + 1 WHERE id = $1")
        .bind(assessment)
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    assert!(stale(&pool, behind).await);
    assert!(stale(&pool, fresh).await);

    // A save of this release: the release before reads it from the columns.
    let mut conn = pool.acquire().await.unwrap();
    ab_db::assessment_versions::save(
        &mut conn,
        AssessmentId(assessment),
        Some(&json!({ "passing_score": 90 })),
        false,
    )
    .await
    .unwrap();
    drop(conn);
    let columns: (f64, Option<i32>) =
        sqlx::query_as("SELECT passing_score::float8, max_attempts FROM assessments WHERE id = $1")
            .bind(assessment)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(columns, (90.0, Some(3)));

    pool.close().await;
    test.execute(AssertSqlSafe(format!(
        "DROP DATABASE \"{name}\" WITH (FORCE)"
    )))
    .await
    .unwrap();
}

/// A draft assessment and a published one: each save is a version, an unchanged save reuses the current one.
#[ab_testdb::test]
async fn every_save_writes_a_version(pool: PgPool) {
    let c = course(&pool).await;
    let quiz = activity(&pool, &c, 1).await;
    let mut tx = pool.begin().await.unwrap();
    let assessment: Uuid = sqlx::query_scalar(
        "INSERT INTO assessments (activity_id, course_id, created_by) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(quiz)
    .bind(c.id)
    .bind(c.teacher)
    .fetch_one(&mut *tx)
    .await
    .unwrap();
    let id = AssessmentId(assessment);
    let first =
        ab_db::assessment_versions::save(&mut tx, id, Some(&json!({ "passing_score": 55 })), false)
            .await
            .unwrap();
    tx.commit().await.unwrap();
    let mut conn = pool.acquire().await.unwrap();
    let again = ab_db::assessment_versions::save(&mut conn, id, None, false)
        .await
        .unwrap();
    assert_eq!(again, first, "nothing changed: the same version");
    let draft_save = ab_db::assessment_versions::save(
        &mut conn,
        id,
        Some(&json!({ "passing_score": 65 })),
        false,
    )
    .await
    .unwrap();
    assert_ne!(draft_save, first, "a draft's save is a version");
    sqlx::query("UPDATE assessments SET status = 'published', published_at = now() WHERE id = $1")
        .bind(assessment)
        .execute(&mut *conn)
        .await
        .unwrap();
    let published_save =
        ab_db::assessment_versions::save(&mut conn, id, Some(&json!({ "max_attempts": 4 })), false)
            .await
            .unwrap();
    drop(conn);
    let all = versions(&pool, assessment).await;
    assert_eq!(
        all.iter().map(|v| (v.0, v.1)).collect::<Vec<_>>(),
        vec![(first.0, 1), (draft_save.0, 2), (published_save.0, 3)]
    );
    assert_eq!(current(&pool, assessment).await, Some(published_save.0));
    let view: (f64, Option<i32>, String) = sqlx::query_as(
        "SELECT passing_score::float8, max_attempts, grading_mode FROM assessment_policy_v WHERE assessment_id = $1",
    )
    .bind(assessment)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        view,
        (65.0, Some(4), "auto".to_owned()),
        "the patch over the policy before"
    );

    // The checks the columns had hold on the document.
    let mut conn = pool.acquire().await.unwrap();
    for bad in [
        json!({ "passing_score": 100.01 }),
        json!({ "max_attempts": 0 }),
        json!({ "grading_mode": "lottery" }),
        json!({ "late_policy_kind": "penalty" }),
        json!({ "allow_late": null }),
    ] {
        let refused = ab_db::assessment_versions::save(&mut conn, id, Some(&bad), false).await;
        assert!(refused.is_err(), "{bad} was saved");
    }
    let rounded = ab_db::assessment_versions::save(
        &mut conn,
        id,
        Some(&json!({ "passing_score": 33.333 })),
        false,
    )
    .await
    .unwrap();
    let policy: Value = sqlx::query_scalar("SELECT policy FROM assessment_versions WHERE id = $1")
        .bind(rounded.0)
        .fetch_one(&mut *conn)
        .await
        .unwrap();
    assert_eq!(
        policy["passing_score"],
        json!(33.33),
        "two decimals, as the column kept"
    );
}

/// The items hash decides staleness: a policy save keeps drafts, new items stale them, a cosmetic save (a
/// reorder, a wording fix) moves the drafts that were on the current items.
#[ab_testdb::test]
async fn only_new_items_stale_a_draft(pool: PgPool) {
    let c = course(&pool).await;
    let quiz = activity(&pool, &c, 1).await;
    let learner = user(&pool, "l").await;
    let other = user(&pool, "m").await;
    let mut tx = pool.begin().await.unwrap();
    let assessment: Uuid = sqlx::query_scalar(
        "INSERT INTO assessments (activity_id, course_id, status, published_at)
         VALUES ($1, $2, 'published', now()) RETURNING id",
    )
    .bind(quiz)
    .bind(c.id)
    .fetch_one(&mut *tx)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO assessment_items (assessment_id, kind, title, max_score, position, body)
         VALUES ($1, 'open_text', 'q1', 1, 1, '{\"kind\": \"open_text\"}'),
                ($1, 'open_text', 'q2', 1, 2, '{\"kind\": \"open_text\"}')",
    )
    .bind(assessment)
    .execute(&mut *tx)
    .await
    .unwrap();
    let id = AssessmentId(assessment);
    ab_db::assessment_versions::save(&mut tx, id, None, false)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let first = ab_db::submissions::insert_draft(
        &pool,
        id,
        ab_core::id::CourseId(c.id),
        ab_core::id::UserId(learner),
        1,
        1,
        false,
    )
    .await
    .unwrap()
    .unwrap();
    assert!(!stale(&pool, first.0).await);

    let mut conn = pool.acquire().await.unwrap();
    ab_db::assessment_versions::save(
        &mut conn,
        id,
        Some(&json!({ "time_limit_seconds": 600 })),
        false,
    )
    .await
    .unwrap();
    assert!(!stale(&pool, first.0).await, "a policy-only save");

    let second = ab_db::submissions::insert_draft(
        &pool,
        id,
        ab_core::id::CourseId(c.id),
        ab_core::id::UserId(other),
        1,
        1,
        false,
    )
    .await
    .unwrap()
    .unwrap();
    sqlx::query("UPDATE assessment_items SET position = 3 - position WHERE assessment_id = $1")
        .bind(assessment)
        .execute(&mut *conn)
        .await
        .unwrap();
    ab_db::assessment_versions::save(&mut conn, id, None, true)
        .await
        .unwrap();
    assert!(!stale(&pool, first.0).await, "a reorder moves the drafts");
    assert!(!stale(&pool, second.0).await);

    sqlx::query(
        "UPDATE assessment_items SET max_score = 2 WHERE assessment_id = $1 AND title = 'q1'",
    )
    .bind(assessment)
    .execute(&mut *conn)
    .await
    .unwrap();
    ab_db::assessment_versions::save(&mut conn, id, None, false)
        .await
        .unwrap();
    assert!(stale(&pool, first.0).await, "new points: the items changed");
    assert!(stale(&pool, second.0).await);

    sqlx::query(
        "UPDATE assessment_items SET title = 'q1 fixed' WHERE assessment_id = $1 AND title = 'q1'",
    )
    .bind(assessment)
    .execute(&mut *conn)
    .await
    .unwrap();
    ab_db::assessment_versions::save(&mut conn, id, None, true)
        .await
        .unwrap();
    assert!(
        stale(&pool, first.0).await,
        "a cosmetic save moves only the drafts that were current"
    );
}

/// Readers join the current version: an assessment a writer left without a save gets the presets' base at commit.
#[ab_testdb::test]
async fn an_assessment_always_has_a_version(pool: PgPool) {
    let c = course(&pool).await;
    let quiz = activity(&pool, &c, 1).await;
    let assessment: Uuid = sqlx::query_scalar(
        "INSERT INTO assessments (activity_id, course_id) VALUES ($1, $2) RETURNING id",
    )
    .bind(quiz)
    .bind(c.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let saved = versions(&pool, assessment).await;
    assert_eq!(saved.len(), 1);
    assert_eq!(current(&pool, assessment).await, Some(saved[0].0));
    let default: Value = sqlx::query_scalar("SELECT assessment_policy_default()")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(saved[0].2, default);
}
