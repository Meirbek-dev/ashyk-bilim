//! Certification templates per course and the certificates issued from
//! them (compile-checked). Timestamps as epoch seconds.

use ab_core::Result;
use ab_core::id::{CertificateId, CertificationId, CourseId, UserId};
use sqlx::PgPool;

#[derive(Debug, Clone)]
pub struct CertificationRow {
    pub id: CertificationId,
    pub course_id: CourseId,
    /// Opaque template payload (the client's PDF designer document).
    pub config: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn insert_certification(
    pool: &PgPool,
    course_id: CourseId,
    config: &serde_json::Value,
) -> Result<CertificationId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO certifications (course_id, config) VALUES ($1, $2)
           RETURNING id AS "id: CertificationId""#,
        course_id.0,
        config
    )
    .fetch_one(pool)
    .await?;
    Ok(id)
}

pub async fn get_certification(
    pool: &PgPool,
    id: CertificationId,
) -> Result<Option<CertificationRow>> {
    let row = sqlx::query_as!(
        CertificationRow,
        r#"SELECT id AS "id: CertificationId", course_id AS "course_id: CourseId", config,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM certifications WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_course_certifications(
    pool: &PgPool,
    course_id: CourseId,
) -> Result<Vec<CertificationRow>> {
    let rows = sqlx::query_as!(
        CertificationRow,
        r#"SELECT id AS "id: CertificationId", course_id AS "course_id: CourseId", config,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM certifications WHERE course_id = $1 ORDER BY id"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn update_certification_config(
    pool: &PgPool,
    id: CertificationId,
    config: &serde_json::Value,
) -> Result<bool> {
    let updated = sqlx::query!(
        "UPDATE certifications SET config = $2 WHERE id = $1",
        id.0,
        config
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Removes the template and every certificate issued from it.
pub async fn delete_certification(pool: &PgPool, id: CertificationId) -> Result<bool> {
    let deleted = sqlx::query!("DELETE FROM certifications WHERE id = $1", id.0)
        .execute(pool)
        .await?;
    Ok(deleted.rows_affected() == 1)
}

// ── Issued certificates ─────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CertificateRow {
    pub id: CertificateId,
    pub certification_id: CertificationId,
    pub course_id: CourseId,
    pub user_id: UserId,
    /// Public verification code (`/certificates/{code}`).
    pub verify_code: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Issue once per (certification, user); `false` when it already existed.
pub async fn issue_certificate(
    pool: &PgPool,
    certification_id: CertificationId,
    user_id: UserId,
    verify_code: &str,
) -> Result<bool> {
    let inserted = sqlx::query!(
        r#"INSERT INTO certificate_users (certification_id, user_id, verify_code)
           VALUES ($1, $2, $3)
           ON CONFLICT (certification_id, user_id) DO NOTHING"#,
        certification_id.0,
        user_id.0,
        verify_code
    )
    .execute(pool)
    .await?;
    Ok(inserted.rows_affected() == 1)
}

pub async fn list_user_certificates_for_course(
    pool: &PgPool,
    course_id: CourseId,
    user_id: UserId,
) -> Result<Vec<CertificateRow>> {
    let rows = sqlx::query_as!(
        CertificateRow,
        r#"SELECT cu.id AS "id: CertificateId",
                  cu.certification_id AS "certification_id: CertificationId",
                  c.course_id AS "course_id: CourseId", cu.user_id AS "user_id: UserId",
                  cu.verify_code,
                  (extract(epoch FROM cu.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM cu.updated_at))::bigint AS "updated_at!"
           FROM certificate_users cu JOIN certifications c ON c.id = cu.certification_id
           WHERE c.course_id = $1 AND cu.user_id = $2
           ORDER BY cu.id"#,
        course_id.0,
        user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn list_user_certificates(pool: &PgPool, user_id: UserId) -> Result<Vec<CertificateRow>> {
    let rows = sqlx::query_as!(
        CertificateRow,
        r#"SELECT cu.id AS "id: CertificateId",
                  cu.certification_id AS "certification_id: CertificationId",
                  c.course_id AS "course_id: CourseId", cu.user_id AS "user_id: UserId",
                  cu.verify_code,
                  (extract(epoch FROM cu.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM cu.updated_at))::bigint AS "updated_at!"
           FROM certificate_users cu JOIN certifications c ON c.id = cu.certification_id
           WHERE cu.user_id = $1
           ORDER BY cu.id DESC"#,
        user_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_certificate_by_code(
    pool: &PgPool,
    verify_code: &str,
) -> Result<Option<CertificateRow>> {
    let row = sqlx::query_as!(
        CertificateRow,
        r#"SELECT cu.id AS "id: CertificateId",
                  cu.certification_id AS "certification_id: CertificationId",
                  c.course_id AS "course_id: CourseId", cu.user_id AS "user_id: UserId",
                  cu.verify_code,
                  (extract(epoch FROM cu.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM cu.updated_at))::bigint AS "updated_at!"
           FROM certificate_users cu JOIN certifications c ON c.id = cu.certification_id
           WHERE cu.verify_code = $1"#,
        verify_code
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Whether the learner holds a certificate for the course (any template).
pub async fn user_certificate_for_course(
    pool: &PgPool,
    course_id: CourseId,
    user_id: UserId,
) -> Result<Option<CertificateRow>> {
    Ok(list_user_certificates_for_course(pool, course_id, user_id)
        .await?
        .into_iter()
        .next())
}
