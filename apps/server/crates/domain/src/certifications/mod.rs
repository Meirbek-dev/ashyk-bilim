//! Certifications (legacy `services/courses/certifications.py`).
//!
//! A course may carry certification templates (opaque JSON for the
//! client's PDF designer); a certificate is issued to a learner once the
//! canonical course progress marks them eligible — automatically by the
//! progress projector, and again on demand when the learner opens their
//! certificates. Verification by code is public.

pub mod pdf;

use ab_core::id::{CertificationId, CourseId, UserId};
use ab_core::language::Language;
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, FieldError, Result};
use ab_db::certifications::{CertificateRow, CertificationRow};
use sqlx::{PgConnection, PgPool};

use crate::assessments::service::AssessmentsService;
use crate::catalog::courses::{Course, CoursesService};
use crate::identity::Actor;
use crate::progress::ProgressProjector;

fn config_text(config: &serde_json::Value, key: &str) -> Option<String> {
    config
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

const fn perm(action: Action, scope: Scope) -> Permission {
    Permission {
        resource: ResourceType::Certificate,
        action,
        scope: Some(scope),
    }
}

/// Unambiguous uppercase alphabet (no 0/O, 1/I) for verification codes.
const CODE_ALPHABET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/// `XXXX-XXXX-XXXX-XXXX` from 80 random bits.
#[must_use]
pub fn new_verify_code() -> String {
    let bytes = uuid::Uuid::new_v4();
    let bytes = bytes.as_bytes();
    let mut acc: u128 = 0;
    for b in &bytes[..10] {
        acc = (acc << 8) | u128::from(*b);
    }
    let mut out = String::with_capacity(19);
    for i in 0..16 {
        if i > 0 && i % 4 == 0 {
            out.push('-');
        }
        let shift = (15 - i) * 5;
        let idx = ((acc >> shift) & 0x1f) as usize;
        out.push(char::from(CODE_ALPHABET[idx]));
    }
    out
}

/// Canonical form of a code as typed or pasted: case-insensitive, dashes
/// and spaces optional (`ftsb…` and `FTSB-…` name the same certificate).
#[must_use]
pub fn normalize_verify_code(raw: &str) -> String {
    let compact: String = raw
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .map(|c| c.to_ascii_uppercase())
        .collect();
    if compact.len() != 16 {
        return compact;
    }
    let mut out = String::with_capacity(19);
    for (i, ch) in compact.chars().enumerate() {
        if i > 0 && i % 4 == 0 {
            out.push('-');
        }
        out.push(ch);
    }
    out
}

/// Issue every configured certificate of the course to the learner when
/// their course progress says so. Returns how many were newly issued.
pub async fn issue_for_completion(
    conn: &mut PgConnection,
    course_id: CourseId,
    user_id: UserId,
) -> Result<usize> {
    let eligible = ab_db::progress::get_course_progress(&mut *conn, course_id, user_id)
        .await?
        .is_some_and(|p| p.certificate_eligible);
    if !eligible {
        return Ok(0);
    }
    let mut issued = 0;
    for certification in
        ab_db::certifications::list_course_certifications(&mut *conn, course_id).await?
    {
        if ab_db::certifications::issue_certificate(
            &mut *conn,
            certification.id,
            user_id,
            &new_verify_code(),
        )
        .await?
        {
            issued += 1;
        }
    }
    Ok(issued)
}

/// A certificate with what it certifies.
#[derive(Debug, Clone)]
pub struct IssuedCertificate {
    pub certificate: CertificateRow,
    pub certification: CertificationRow,
    pub course: Course,
    /// The name signed on the certificate: `config.certificate_instructor`,
    /// else the course creator's display name (what the PDF prints).
    pub instructor_name: Option<String>,
}

/// The public verification view.
#[derive(Debug, Clone)]
pub struct VerifiedCertificate {
    pub issued: IssuedCertificate,
    /// The only thing a verifier learns about the holder.
    pub holder_display_name: String,
}

#[derive(Clone)]
pub struct CertificationsService {
    pool: PgPool,
    courses: CoursesService,
    assessments: AssessmentsService,
    projector: ProgressProjector,
}

impl CertificationsService {
    #[must_use]
    pub fn new(pool: PgPool, courses: CoursesService, assessments: AssessmentsService) -> Self {
        Self {
            projector: ProgressProjector::new(pool.clone()),
            pool,
            courses,
            assessments,
        }
    }

    /// Visible course (404) + a course-scoped certificate grant (platform,
    /// or authorship — the `:own` scope).
    async fn scoped_course(
        &self,
        actor: &Actor,
        course_id: CourseId,
        action: Action,
    ) -> Result<Course> {
        let course = self.courses.get(actor, course_id).await?;
        let allowed = actor.has(perm(action, Scope::Platform)) || course.is_author(actor.user_id);
        if !allowed {
            return Err(Error::forbidden(format!(
                "missing permission certificate:{}",
                action.as_str()
            )));
        }
        Ok(course)
    }

    async fn load(&self, id: CertificationId) -> Result<CertificationRow> {
        ab_db::certifications::get_certification(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("certification"))
    }

    async fn issued(
        &self,
        certificate: CertificateRow,
        certification: CertificationRow,
        course: Course,
    ) -> Result<IssuedCertificate> {
        let instructor_name = match config_text(&certification.config, "certificate_instructor") {
            Some(name) => Some(name),
            None => match course.creator_id {
                Some(creator) => ab_db::identity::list_user_summaries(&self.pool, &[creator])
                    .await?
                    .into_iter()
                    .next()
                    .map(|u| u.display_name),
                None => None,
            },
        };
        Ok(IssuedCertificate {
            certificate,
            certification,
            course,
            instructor_name,
        })
    }

    fn require_object(config: &serde_json::Value) -> Result<()> {
        if config.is_object() {
            Ok(())
        } else {
            Err(Error::validation(vec![FieldError {
                field: "config".into(),
                code: "invalid".into(),
                message: "config must be a JSON object".into(),
            }]))
        }
    }

    pub async fn create(
        &self,
        actor: &Actor,
        course_id: CourseId,
        config: &serde_json::Value,
    ) -> Result<CertificationRow> {
        self.scoped_course(actor, course_id, Action::Create).await?;
        Self::require_object(config)?;
        let id = ab_db::certifications::insert_certification(&self.pool, course_id, config).await?;
        self.load(id).await
    }

    pub async fn get(&self, actor: &Actor, id: CertificationId) -> Result<CertificationRow> {
        let row = self.load(id).await?;
        self.scoped_course(actor, row.course_id, Action::Read)
            .await?;
        Ok(row)
    }

    pub async fn list_for_course(
        &self,
        actor: &Actor,
        course_id: CourseId,
    ) -> Result<Vec<CertificationRow>> {
        self.scoped_course(actor, course_id, Action::Read).await?;
        ab_db::certifications::list_course_certifications(&self.pool, course_id).await
    }

    pub async fn update(
        &self,
        actor: &Actor,
        id: CertificationId,
        config: &serde_json::Value,
    ) -> Result<CertificationRow> {
        let row = self.load(id).await?;
        self.scoped_course(actor, row.course_id, Action::Update)
            .await?;
        Self::require_object(config)?;
        ab_db::certifications::update_certification_config(&self.pool, id, config).await?;
        self.load(id).await
    }

    pub async fn delete(&self, actor: &Actor, id: CertificationId) -> Result<()> {
        let row = self.load(id).await?;
        self.scoped_course(actor, row.course_id, Action::Delete)
            .await?;
        ab_db::certifications::delete_certification(&self.pool, id).await?;
        Ok(())
    }

    /// The caller's certificates for a course they can access; a completed
    /// course issues on the spot (idempotent), as the legacy did.
    pub async fn mine_for_course(
        &self,
        actor: &Actor,
        course_id: CourseId,
    ) -> Result<Vec<IssuedCertificate>> {
        let course = self.courses.get(actor, course_id).await?;
        if !self
            .assessments
            .user_has_course_access(&course, actor.user_id)
            .await?
        {
            return Err(Error::forbidden("no access to this course"));
        }
        self.projector
            .recalculate_course(course_id, actor.user_id)
            .await?;
        issue_for_completion(&mut *self.pool.acquire().await?, course_id, actor.user_id).await?;
        let rows = ab_db::certifications::list_user_certificates_for_course(
            &self.pool,
            course_id,
            actor.user_id,
        )
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for certificate in rows {
            let certification = self.load(certificate.certification_id).await?;
            out.push(
                self.issued(certificate, certification, course.clone())
                    .await?,
            );
        }
        Ok(out)
    }

    /// Every certificate the caller holds.
    pub async fn mine(&self, actor: &Actor) -> Result<Vec<IssuedCertificate>> {
        let rows = ab_db::certifications::list_user_certificates(&self.pool, actor.user_id).await?;
        let mut out = Vec::with_capacity(rows.len());
        for certificate in rows {
            let Some(certification) =
                ab_db::certifications::get_certification(&self.pool, certificate.certification_id)
                    .await?
            else {
                continue;
            };
            let Some(course) =
                ab_db::catalog::get_course(&self.pool, certification.course_id).await?
            else {
                continue;
            };
            out.push(self.issued(certificate, certification, course).await?);
        }
        Ok(out)
    }

    /// Public verification by code (no session).
    pub async fn verify(&self, verify_code: &str) -> Result<VerifiedCertificate> {
        let certificate = ab_db::certifications::get_certificate_by_code(
            &self.pool,
            &normalize_verify_code(verify_code),
        )
        .await?
        .ok_or_else(|| Error::not_found("certificate"))?;
        let certification = self.load(certificate.certification_id).await?;
        let course = ab_db::catalog::get_course(&self.pool, certification.course_id)
            .await?
            .ok_or_else(|| Error::not_found("course"))?;
        let holder = ab_db::identity::list_user_summaries(&self.pool, &[certificate.user_id])
            .await?
            .into_iter()
            .next();
        Ok(VerifiedCertificate {
            holder_display_name: holder.map(|h| h.display_name).unwrap_or_default(),
            issued: self.issued(certificate, certification, course).await?,
        })
    }

    /// The certificate as a PDF (public by code, like `verify`). The page
    /// language is `language` when given, else the holder's locale;
    /// `verify_url` turns the page language and the canonical code into the
    /// public verify link.
    pub async fn pdf(
        &self,
        verify_code: &str,
        language: Option<Language>,
        verify_url: impl FnOnce(Language, &str) -> String,
    ) -> Result<Vec<u8>> {
        let verified = self.verify(verify_code).await?;
        let holder =
            ab_db::identity::get_profile(&self.pool, verified.issued.certificate.user_id).await?;
        let language = language
            .or_else(|| {
                holder
                    .as_ref()
                    .and_then(|h| Language::from_locale(&h.locale))
            })
            .unwrap_or(Language::Ru);
        let config = &verified.issued.certification.config;
        let text = |key: &str| config_text(config, key);
        let teacher_name = verified.issued.instructor_name;
        let code = verified.issued.certificate.verify_code.clone();
        pdf::render(&pdf::CertificatePdf {
            language,
            holder_name: verified.holder_display_name,
            certificate_name: text("certification_name")
                .unwrap_or_else(|| verified.issued.course.name.clone()),
            certificate_type: text("certification_type").unwrap_or_default(),
            course_name: verified.issued.course.name,
            issued_at_unix: verified.issued.certificate.created_at,
            verify_url: verify_url(language, &code),
            verify_code: code,
            teacher_name,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verify_codes_are_grouped_and_unambiguous() {
        let code = new_verify_code();
        assert_eq!(code.len(), 19);
        for (i, ch) in code.chars().enumerate() {
            if i % 5 == 4 {
                assert_eq!(ch, '-');
            } else {
                assert!(CODE_ALPHABET.contains(&(ch as u8)), "{ch}");
            }
        }
        assert_ne!(new_verify_code(), new_verify_code());
    }

    #[test]
    fn codes_normalize_case_and_dashes() {
        assert_eq!(
            normalize_verify_code(" ftsb-2abc 9xyz-defg "),
            "FTSB-2ABC-9XYZ-DEFG"
        );
        assert_eq!(
            normalize_verify_code("ftsb2abc9xyzdefg"),
            "FTSB-2ABC-9XYZ-DEFG"
        );
        assert_eq!(normalize_verify_code("short"), "SHORT");
    }
}
