//! The previous release keeps working on the renamed schema (REWRITE 5.8 item 9) until the contract drops its
//! names (pending-contracts.tsv): it reads, inserts and updates through them, as raw SQL with the old names.
//!
//! - a renamed table is a view under its old name (`certifications`, `certificate_users` with its
//!   `certification_id`, `course_discussions`), its upserts included.
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
