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

use ab_core::id::{CertificationId, UserId};
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
        r#"INSERT INTO certifications (course_id, config)
           VALUES ($1, '{"certification_name": "  Algebra I  ", "certificate_instructor": 7}')
           RETURNING id"#,
    )
    .bind(course)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO course_progress (course_id, user_id, grade_average, weighted_grade_average)
         VALUES ($1, $2, 80, 86.5)",
    )
    .bind(course)
    .bind(learner)
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        issue_certificate(
            &pool,
            CertificationId(certification),
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
    assert_eq!(issued.score, Some(86.5));
    assert_eq!(issued.reissued_at, None);

    // The course moves on; the certificate does not.
    sqlx::query("UPDATE courses SET name = 'Algebra (2027)' WHERE id = $1")
        .bind(course)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        r#"UPDATE certifications SET config = '{"certification_name": "Other"}' WHERE id = $1"#,
    )
    .bind(certification)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE course_progress SET weighted_grade_average = 40 WHERE user_id = $1")
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
        ("Algebra", "Algebra I", Some("Aigerim Teacher"), Some(86.5))
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
        "UPDATE certificate_users SET course_name = 'Forged'",
        "UPDATE certificate_users SET score = 100",
        "UPDATE certificate_users SET created_at = now() - interval '1 year'",
        "UPDATE certificate_users SET verify_code = 'ZZZZ-ZZZZ-ZZZZ-ZZZZ'",
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
