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
    pub version: i32,
    pub created_at: i64,
    pub updated_at: i64,
    /// Retired (turned off after it issued certificates): no new issues; the issued ones stay valid.
    pub disabled_at: Option<i64>,
}

/// Turning the course's certificate on.
///
/// The course's most recently retired certification comes back with `config` (its issued certificates were
/// never taken back), else a new one. A course has at most one live certification
/// (`certifications_one_live_per_course`): turning it on again (a double click, a second tab) takes the new
/// `config` on that one instead of adding a duplicate that would issue a second certificate.
pub async fn insert_certification(
    pool: &PgPool,
    course_id: CourseId,
    config: &serde_json::Value,
) -> Result<CertificationId> {
    let mut tx = pool.begin().await?;
    let revived = sqlx::query_scalar!(
        r#"UPDATE certifications SET disabled_at = NULL, config = $2
           WHERE id = (SELECT id FROM certifications
                       WHERE course_id = $1 AND disabled_at IS NOT NULL
                         AND NOT EXISTS (SELECT 1 FROM certifications
                                         WHERE course_id = $1 AND disabled_at IS NULL)
                       ORDER BY id DESC LIMIT 1
                       FOR UPDATE)
           RETURNING id AS "id: CertificationId""#,
        course_id.0,
        config
    )
    .fetch_optional(&mut *tx)
    .await?;
    let id = match revived {
        Some(id) => id,
        None => {
            sqlx::query_scalar!(
                r#"INSERT INTO certifications (course_id, config) VALUES ($1, $2)
                   ON CONFLICT (course_id) WHERE disabled_at IS NULL DO UPDATE SET config = EXCLUDED.config
                   RETURNING id AS "id: CertificationId""#,
                course_id.0,
                config
            )
            .fetch_one(&mut *tx)
            .await?
        }
    };
    tx.commit().await?;
    Ok(id)
}

pub async fn get_certification(
    pool: &PgPool,
    id: CertificationId,
) -> Result<Option<CertificationRow>> {
    let row = sqlx::query_as!(
        CertificationRow,
        r#"SELECT id AS "id: CertificationId", course_id AS "course_id: CourseId", config, version,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!",
                  (extract(epoch FROM disabled_at))::bigint AS disabled_at
           FROM certifications WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Of `course_ids`, the courses with a live (not retired) certification:
/// finishing them issues a certificate.
pub async fn courses_offering_certificates(
    pool: &PgPool,
    course_ids: &[CourseId],
) -> Result<Vec<CourseId>> {
    let ids: Vec<uuid::Uuid> = course_ids.iter().map(|c| c.0).collect();
    let rows = sqlx::query_scalar!(
        r#"SELECT DISTINCT course_id AS "course_id!: CourseId" FROM certifications
           WHERE course_id = ANY($1) AND disabled_at IS NULL"#,
        &ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// The course's live certifications (retired ones issue nothing and are not shown as the course's).
pub async fn list_course_certifications<'e>(
    db: impl sqlx::PgExecutor<'e>,
    course_id: CourseId,
) -> Result<Vec<CertificationRow>> {
    let rows = sqlx::query_as!(
        CertificationRow,
        r#"SELECT id AS "id: CertificationId", course_id AS "course_id: CourseId", config, version,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!",
                  (extract(epoch FROM disabled_at))::bigint AS disabled_at
           FROM certifications WHERE course_id = $1 AND disabled_at IS NULL ORDER BY id"#,
        course_id.0
    )
    .fetch_all(db)
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

/// Turns the certification off.
///
/// One that issued no certificate is deleted; one that did is retired (`disabled_at`), so the issued
/// certificates stay valid. The row lock waits for an issue in flight (its insert holds a key-share lock on
/// this row), so a certificate issued meanwhile is never cascaded away.
pub async fn delete_certification(pool: &PgPool, id: CertificationId) -> Result<bool> {
    let mut tx = pool.begin().await?;
    let Some(issued) = sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM certificate_users WHERE certification_id = c.id) AS "issued!"
           FROM certifications c WHERE c.id = $1 AND c.disabled_at IS NULL FOR UPDATE"#,
        id.0
    )
    .fetch_optional(&mut *tx)
    .await?
    else {
        return Ok(false);
    };
    if issued {
        sqlx::query!(
            "UPDATE certifications SET disabled_at = now() WHERE id = $1",
            id.0
        )
        .execute(&mut *tx)
        .await?;
    } else {
        sqlx::query!("DELETE FROM certifications WHERE id = $1", id.0)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(true)
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
    /// What the certificate states, stored when it was issued (the
    /// `certificate_users_issue` trigger): renaming the course or editing
    /// the template leaves it. Only `holder_name` follows the person (a
    /// display-name change re-issues: `reissued_at`).
    pub holder_name: String,
    pub course_name: String,
    /// The template's `certification_name`, else the course name.
    pub certificate_name: String,
    /// The template's `certificate_instructor`, else the course creator.
    pub instructor_name: Option<String>,
    /// The course grade at issue (weighted average, else plain), if scored.
    pub score: Option<f64>,
    pub reissued_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Issue once per (certification, user), dated `issued_at` (unix seconds;
/// now when `None`); `false` when it already existed.
pub async fn issue_certificate<'e>(
    db: impl sqlx::PgExecutor<'e>,
    certification_id: CertificationId,
    user_id: UserId,
    verify_code: &str,
    issued_at: Option<i64>,
) -> Result<bool> {
    let inserted = sqlx::query!(
        r#"INSERT INTO certificate_users (certification_id, user_id, verify_code, created_at, updated_at)
           VALUES ($1, $2, $3, COALESCE(to_timestamp($4::bigint), now()), COALESCE(to_timestamp($4::bigint), now()))
           ON CONFLICT (certification_id, user_id) DO NOTHING"#,
        certification_id.0,
        user_id.0,
        verify_code,
        issued_at
    )
    .execute(db)
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
                  cu.verify_code, cu.holder_name, cu.course_name, cu.certificate_name,
                  cu.instructor_name, cu.score,
                  (extract(epoch FROM cu.reissued_at))::bigint AS reissued_at,
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
                  cu.verify_code, cu.holder_name, cu.course_name, cu.certificate_name,
                  cu.instructor_name, cu.score,
                  (extract(epoch FROM cu.reissued_at))::bigint AS reissued_at,
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
                  cu.verify_code, cu.holder_name, cu.course_name, cu.certificate_name,
                  cu.instructor_name, cu.score,
                  (extract(epoch FROM cu.reissued_at))::bigint AS reissued_at,
                  (extract(epoch FROM cu.created_at))::bigint AS "created_at!",
                  (extract(epoch FROM cu.updated_at))::bigint AS "updated_at!"
           FROM certificate_users cu JOIN certifications c ON c.id = cu.certification_id
           -- Dash-insensitive: ETL-migrated legacy codes keep their own
           -- `XX-XXXXXXXX-XXXX-XXXXXX` layout (the table is small; a seq
           -- scan is fine until it is not - then an expression index).
           WHERE upper(regexp_replace(cu.verify_code, '[^A-Za-z0-9]', '', 'g'))
               = upper(regexp_replace($1, '[^A-Za-z0-9]', '', 'g'))"#,
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
