//! The previous release keeps working on the renamed schema (REWRITE 5.8 item 9) until the contract drops its
//! names (pending-contracts.tsv): it reads, inserts and updates through them, as raw SQL with the old names.
//!
//! - a renamed table is a view under its old name (`certifications`, `certificate_users` with its
//!   `certification_id`, `course_discussions`), its upserts included.
//! - a renamed column's old name is a column the `<table>_aliases` trigger keeps equal, and the old upsert keys
//!   have a twin index.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use sqlx::PgPool;
use uuid::Uuid;

async fn scalar<T>(pool: &PgPool, sql: &'static str, binds: &[Uuid]) -> T
where
    T: for<'r> sqlx::Decode<'r, sqlx::Postgres> + sqlx::Type<sqlx::Postgres> + Send + Unpin,
{
    let mut q = sqlx::query_scalar::<_, T>(sql);
    for b in binds {
        q = q.bind(*b);
    }
    q.fetch_one(pool)
        .await
        .unwrap_or_else(|e| panic!("{sql}: {e}"))
}

async fn run(pool: &PgPool, sql: &'static str, binds: &[Uuid]) -> u64 {
    let mut q = sqlx::query(sql);
    for b in binds {
        q = q.bind(*b);
    }
    q.execute(pool)
        .await
        .unwrap_or_else(|e| panic!("{sql}: {e}"))
        .rows_affected()
}

async fn user_and_course(pool: &PgPool) -> (Uuid, Uuid) {
    let user: Uuid = scalar(
        pool,
        "INSERT INTO users (zitadel_user_id, username, email, display_name)
         VALUES ('z-old', 'old', 'old@example.com', 'Old Name') RETURNING id",
        &[],
    )
    .await;
    let course: Uuid = scalar(
        pool,
        "INSERT INTO courses (name, creator_id) VALUES ('c', $1) RETURNING id",
        &[user],
    )
    .await;
    (user, course)
}

#[ab_testdb::test]
async fn renamed_tables_answer_to_their_old_names(pool: PgPool) {
    let (user, course) = user_and_course(&pool).await;

    // Templates: the upsert on the partial key goes through the view.
    let upsert = "INSERT INTO certifications (course_id, config) VALUES ($1, '{\"a\": 1}')
                  ON CONFLICT (course_id) WHERE disabled_at IS NULL DO UPDATE SET config = EXCLUDED.config
                  RETURNING id";
    let template: Uuid = scalar(&pool, upsert, &[course]).await;
    assert_eq!(scalar::<Uuid>(&pool, upsert, &[course]).await, template);
    run(
        &pool,
        "UPDATE certifications SET config = '{\"b\": 2}' WHERE id = $1",
        &[template],
    )
    .await;
    let config: serde_json::Value = scalar(
        &pool,
        "SELECT config FROM certificate_templates WHERE id = $1",
        &[template],
    )
    .await;
    assert_eq!(config, serde_json::json!({ "b": 2 }));

    // Issued certificates: the old column name, its key in ON CONFLICT, the re-issue.
    let issue = "INSERT INTO certificate_users
                     (certification_id, user_id, verify_code, course_id, holder_name, course_name, certificate_name)
                 VALUES ($1, $2, 'OLD-CODE', $3, 'Old Name', 'c', 'c')
                 ON CONFLICT (certification_id, user_id) DO NOTHING";
    assert_eq!(run(&pool, issue, &[template, user, course]).await, 1);
    assert_eq!(run(&pool, issue, &[template, user, course]).await, 0);
    run(
        &pool,
        "UPDATE certificate_users SET holder_name = 'New Name', reissued_at = now() WHERE user_id = $1",
        &[user],
    )
    .await;
    let (template_id, holder): (Uuid, String) =
        sqlx::query_as("SELECT template_id, holder_name FROM certificates WHERE user_id = $1")
            .bind(user)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((template_id, holder.as_str()), (template, "New Name"));
    let old: Uuid = scalar(
        &pool,
        "SELECT certification_id FROM certificate_users WHERE verify_code = 'OLD-CODE'",
        &[],
    )
    .await;
    assert_eq!(old, template);
    // The frozen guard still bites through the view.
    let forged = sqlx::query("UPDATE certificate_users SET course_name = 'Forged'")
        .execute(&pool)
        .await;
    assert!(forged.is_err());

    // Discussion posts: insert, reply (the counter trigger), edit, read back.
    let post: Uuid = scalar(
        &pool,
        "INSERT INTO course_discussions (course_id, user_id, content) VALUES ($1, $2, 'p') RETURNING id",
        &[course, user],
    )
    .await;
    run(
        &pool,
        "INSERT INTO course_discussions (course_id, user_id, parent_id, kind, content)
         VALUES ($1, $2, $3, 'reply', 'r')",
        &[course, user, post],
    )
    .await;
    run(
        &pool,
        "UPDATE course_discussions SET content = 'edited' WHERE id = $1",
        &[post],
    )
    .await;
    let (content, replies): (String, i32) =
        sqlx::query_as("SELECT content, replies_count FROM discussion_posts WHERE id = $1")
            .bind(post)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((content.as_str(), replies), ("edited", 1));
    let locked: Uuid = scalar(
        &pool,
        "SELECT id FROM course_discussions WHERE id = $1 FOR UPDATE",
        &[post],
    )
    .await;
    assert_eq!(locked, post);
    assert_eq!(
        run(
            &pool,
            "DELETE FROM course_discussions WHERE parent_id = $1",
            &[post]
        )
        .await,
        1
    );
}

/// Part 2: a renamed column's old name is a compatibility column. The previous release writes it (the new one
/// follows), the server writes the new one (the old one follows), and its upserts find their key.
#[ab_testdb::test]
async fn renamed_columns_answer_to_their_old_names(pool: PgPool) {
    let (user, course) = user_and_course(&pool).await;
    let chapter: Uuid = scalar(
        &pool,
        "INSERT INTO chapters (course_id, name, creator_id) VALUES ($1, 'ch', $2) RETURNING id",
        &[course, user],
    )
    .await;
    assert_eq!(
        scalar::<Uuid>(
            &pool,
            "SELECT created_by FROM chapters WHERE id = $1",
            &[chapter]
        )
        .await,
        user
    );

    // The previous release's activity insert and update.
    let old_activity: Uuid = scalar(
        &pool,
        "INSERT INTO activities (chapter_id, course_id, name, activity_type, activity_sub_type, creator_id)
         VALUES ($1, $2, 'q', 'quiz', 'quiz_standard', $3) RETURNING id",
        &[chapter, course, user],
    )
    .await;
    let (kind, sub_kind, created_by): (String, String, Option<Uuid>) =
        sqlx::query_as("SELECT kind, sub_kind, created_by FROM activities WHERE id = $1")
            .bind(old_activity)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        (kind.as_str(), sub_kind.as_str(), created_by),
        ("quiz", "quiz_standard", Some(user))
    );
    run(
        &pool,
        "UPDATE activities SET creator_id = NULL WHERE id = $1",
        &[old_activity],
    )
    .await;
    let created_by: Option<Uuid> = scalar(
        &pool,
        "SELECT created_by FROM activities WHERE id = $1",
        &[old_activity],
    )
    .await;
    assert_eq!(created_by, None);

    // The server's names fill the old ones the previous release reads.
    let activity: Uuid = scalar(
        &pool,
        "INSERT INTO activities (chapter_id, course_id, name, kind, sub_kind, created_by, position)
         VALUES ($1, $2, 'q2', 'quiz', 'quiz_standard', $3, 100) RETURNING id",
        &[chapter, course, user],
    )
    .await;
    let (activity_type, creator_id): (String, Option<Uuid>) =
        sqlx::query_as("SELECT activity_type, creator_id FROM activities WHERE id = $1")
            .bind(activity)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((activity_type.as_str(), creator_id), ("quiz", Some(user)));

    // An assessment's lifecycle both ways.
    let assessment: Uuid = scalar(
        &pool,
        "INSERT INTO assessments (activity_id, course_id, lifecycle, creator_id,
                                  grading_mode, grade_release_mode, completion_rule)
         VALUES ($1, $2, 'draft', $3, 'auto', 'immediate', 'passed') RETURNING id",
        &[activity, course, user],
    )
    .await;
    run(
        &pool,
        "UPDATE assessments SET lifecycle = 'published', published_at = now() WHERE id = $1",
        &[assessment],
    )
    .await;
    let status: String = scalar(
        &pool,
        "SELECT status FROM assessments WHERE id = $1",
        &[assessment],
    )
    .await;
    assert_eq!(status, "published");
    run(
        &pool,
        "UPDATE assessments SET status = 'draft', published_at = NULL WHERE id = $1",
        &[assessment],
    )
    .await;
    let lifecycle: String = scalar(
        &pool,
        "SELECT lifecycle FROM assessments WHERE id = $1",
        &[assessment],
    )
    .await;
    assert_eq!(lifecycle, "draft");
    // The guard sees the previous release's change of the kind.
    let retyped = sqlx::query("UPDATE activities SET activity_type = 'video', activity_sub_type = 'video_youtube' WHERE id = $1")
        .bind(activity)
        .execute(&pool)
        .await;
    assert!(retyped.is_err());

    // An event under its old names.
    run(
        &pool,
        "INSERT INTO analytics_events (event_type, actor_id, course_id) VALUES ('login', $1, $2)",
        &[user, course],
    )
    .await;
    let performed_by: Option<Uuid> = scalar(
        &pool,
        "SELECT performed_by FROM analytics_events WHERE event = 'login'",
        &[],
    )
    .await;
    assert_eq!(performed_by, Some(user));

    // The previous release's upserts infer their keys from the old names.
    let rollup = "INSERT INTO daily_teacher_metrics (metric_date, teacher_user_id, managed_course_count)
                  VALUES (current_date, $1, 1)
                  ON CONFLICT (metric_date, teacher_user_id) DO UPDATE SET managed_course_count = 2";
    run(&pool, rollup, &[user]).await;
    run(&pool, rollup, &[user]).await;
    let managed: i32 = scalar(
        &pool,
        "SELECT managed_course_count FROM daily_teacher_metrics WHERE teacher_id = $1",
        &[user],
    )
    .await;
    assert_eq!(managed, 2);
    let save = "INSERT INTO analytics_saved_views (teacher_user_id, name, view_type, query)
                VALUES ($1, 'mine', 'overview', '{}')
                ON CONFLICT (teacher_user_id, view_type, name) DO UPDATE SET query = '{\"a\": 1}'
                RETURNING id";
    let view: Uuid = scalar(&pool, save, &[user]).await;
    assert_eq!(scalar::<Uuid>(&pool, save, &[user]).await, view);
    let (owner, kind): (Uuid, String) =
        sqlx::query_as("SELECT user_id, kind FROM analytics_saved_views WHERE id = $1")
            .bind(view)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((owner, kind.as_str()), (user, "overview"));
}
