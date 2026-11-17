//! A certificate states what was issued (REWRITE 5.7,
//! `20261102000200_certificates_freeze_issued`):
//!
//! - issuing stores the holder's name, the course and certificate names, the
//!   signing instructor and the course grade on the row;
//! - renaming the course or editing the template afterwards leaves them;
//! - a change of the holder's display name re-issues: the new name, stamped
//!   `reissued_at`; erasing the person blanks it the same way;
//! - nothing else on an issued row can be rewritten.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_core::id::{CertificateTemplateId, UserId};
use ab_db::certifications::{get_certificate_by_code, issue_certificate};
use sqlx::PgPool;
use uuid::Uuid;

async fn user(pool: &PgPool, name: &str) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email, display_name)
         VALUES ($1, $1, $1 || '@example.com', $2) RETURNING id",
    )
    .bind(format!("z-{}", name.to_lowercase().replace(' ', "-")))
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

#[ab_testdb::test]
async fn a_certificate_keeps_what_it_was_issued_with(pool: PgPool) {
    let teacher = user(&pool, "Aigerim Teacher").await;
    let learner = user(&pool, "Dana Learner").await;
    let course: Uuid = sqlx::query_scalar(
        "INSERT INTO courses (name, creator_id) VALUES ('Algebra', $1) RETURNING id",
    )
    .bind(teacher)
    .fetch_one(&pool)
    .await
    .unwrap();
    let certification: Uuid = sqlx::query_scalar(
        r#"INSERT INTO certificate_templates (course_id, config)
           VALUES ($1, '{"certification_name": "  Algebra I  ", "certificate_instructor": 7}')
           RETURNING id"#,
    )
    .bind(course)
    .fetch_one(&pool)
    .await
    .unwrap();
    // The grade is course_progress_v's weighted average: 80 weighing 1, 90 weighing 3 (the plain one is 85).
    sqlx::query(
        "WITH ch AS (INSERT INTO chapters (course_id, name) VALUES ($1, 'Intro') RETURNING id),
              a AS (INSERT INTO activities (chapter_id, course_id, name, kind, sub_kind,
                                            position, published)
                    SELECT ch.id, $1, 'Quiz ' || n, 'dynamic', 'dynamic_page', n, true
                    FROM ch, generate_series(1, 2) n RETURNING id, position),
              s AS (INSERT INTO assessments (activity_id, course_id, grading_mode, grade_release_mode,
                                             completion_rule, weight)
                    SELECT a.id, $1, 'auto', 'immediate', 'submitted', CASE a.position WHEN 1 THEN 1 ELSE 3 END
                    FROM a RETURNING activity_id)
         INSERT INTO activity_progress (course_id, activity_id, user_id, status, score)
         SELECT $1, a.id, $2, 'released', CASE a.position WHEN 1 THEN 80 ELSE 90 END FROM a",
    )
    .bind(course)
    .bind(learner)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO enrolments (course_id, user_id) VALUES ($1, $2)")
        .bind(course)
        .bind(learner)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        issue_certificate(
            &pool,
            CertificateTemplateId(certification),
            UserId(learner),
            "AAAA-BBBB-CCCC-DDDD",
            None
        )
        .await
        .unwrap()
    );

    let issued = get_certificate_by_code(&pool, "AAAA-BBBB-CCCC-DDDD")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(issued.holder_name, "Dana Learner");
    assert_eq!(issued.course_name, "Algebra");
    assert_eq!(issued.certificate_name, "Algebra I");
    // A non-string `certificate_instructor` is ignored, as the server reads it: the creator signs.
    assert_eq!(issued.instructor_name.as_deref(), Some("Aigerim Teacher"));
    assert_eq!(issued.score, Some(87.5));
    assert_eq!(issued.reissued_at, None);

    // The course moves on; the certificate does not.
    sqlx::query("UPDATE courses SET name = 'Algebra (2027)' WHERE id = $1")
        .bind(course)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        r#"UPDATE certificate_templates SET config = '{"certification_name": "Other"}' WHERE id = $1"#,
    )
    .bind(certification)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE activity_progress SET score = 40 WHERE user_id = $1")
        .bind(learner)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE users SET display_name = 'Aigerim T.' WHERE id = $1")
        .bind(teacher)
        .execute(&pool)
        .await
        .unwrap();
    let kept = get_certificate_by_code(&pool, "AAAA-BBBB-CCCC-DDDD")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        (
            kept.course_name.as_str(),
            kept.certificate_name.as_str(),
            kept.instructor_name.as_deref(),
            kept.score
        ),
        ("Algebra", "Algebra I", Some("Aigerim Teacher"), Some(87.5))
    );

    // The holder's name follows the person: a rename re-issues.
    sqlx::query("UPDATE users SET display_name = 'Dana Married-Name' WHERE id = $1")
        .bind(learner)
        .execute(&pool)
        .await
        .unwrap();
    let reissued = get_certificate_by_code(&pool, "AAAA-BBBB-CCCC-DDDD")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(reissued.holder_name, "Dana Married-Name");
    assert!(reissued.reissued_at.is_some());
    assert_eq!(
        reissued.created_at, issued.created_at,
        "the issue date stays"
    );

    // Anything else on an issued row is refused.
    for change in [
        "UPDATE certificates SET course_name = 'Forged'",
        "UPDATE certificates SET score = 100",
        "UPDATE certificates SET created_at = now() - interval '1 year'",
        "UPDATE certificates SET verify_code = 'ZZZZ-ZZZZ-ZZZZ-ZZZZ'",
    ] {
        let refused = sqlx::query(change).execute(&pool).await.unwrap_err();
        assert!(
            refused.to_string().contains("state what was issued"),
            "{change}: {refused}"
        );
    }

    // Erasure blanks the name through the same re-issue.
    let mut tx = pool.begin().await.unwrap();
    ab_db::identity::anonymise_user(&mut tx, UserId(learner), "deleted-x")
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let erased = get_certificate_by_code(&pool, "AAAA-BBBB-CCCC-DDDD")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(erased.holder_name, "");
}

/// The code that renames a person re-issues their certificates itself, so the trigger
/// `users_reissue_certificates` (kept for the previous release) can go in a contract: with the trigger off, a
/// profile rename and an erasure still re-issue, and a profile write that keeps the name does not.
#[ab_testdb::test]
async fn renaming_writers_reissue_without_the_trigger(pool: PgPool) {
    let teacher = user(&pool, "Aigerim Teacher").await;
    let learner = user(&pool, "Dana Learner").await;
    let course: Uuid = sqlx::query_scalar(
        "INSERT INTO courses (name, creator_id) VALUES ('Algebra', $1) RETURNING id",
    )
    .bind(teacher)
    .fetch_one(&pool)
    .await
    .unwrap();
    let certification: Uuid = sqlx::query_scalar(
        "INSERT INTO certificate_templates (course_id) VALUES ($1) RETURNING id",
    )
    .bind(course)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
        issue_certificate(
            &pool,
            CertificateTemplateId(certification),
            UserId(learner),
            "EEEE-FFFF-GGGG-HHHH",
            None
        )
        .await
        .unwrap()
    );
    sqlx::query("ALTER TABLE users DISABLE TRIGGER users_reissue_certificates")
        .execute(&pool)
        .await
        .unwrap();
    let read = || get_certificate_by_code(&pool, "EEEE-FFFF-GGGG-HHHH");

    // Same name, other fields: nothing to re-issue.
    ab_db::identity::update_profile(
        &pool,
        UserId(learner),
        Some("Dana Learner"),
        Some("bio"),
        None,
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(read().await.unwrap().unwrap().reissued_at, None);

    ab_db::identity::update_profile(
        &pool,
        UserId(learner),
        Some("Dana Married-Name"),
        None,
        None,
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap()
    .unwrap();
    let renamed = read().await.unwrap().unwrap();
    assert_eq!(renamed.holder_name, "Dana Married-Name");
    assert!(renamed.reissued_at.is_some());

    let mut tx = pool.begin().await.unwrap();
    ab_db::identity::anonymise_user(&mut tx, UserId(learner), "deleted-y")
        .await
        .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(read().await.unwrap().unwrap().holder_name, "");
}
