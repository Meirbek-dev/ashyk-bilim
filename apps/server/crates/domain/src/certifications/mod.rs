//! Certifications (legacy `services/courses/certifications.py`).
//!
//! A course may carry certification templates (opaque JSON for the
//! client's PDF designer); a certificate is issued to a learner once the
//! canonical course progress marks them eligible — automatically by the
//! progress projector, and again on demand when the learner opens their
//! certificates. Verification by code is public.

use ab_core::id::{CertificationId, CourseId, UserId};
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, FieldError, Result};
use ab_db::certifications::{CertificateRow, CertificationRow};
use sqlx::PgPool;

use crate::assessments::service::AssessmentsService;
use crate::catalog::courses::{Course, CoursesService};
use crate::identity::Actor;
use crate::progress::ProgressProjector;

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

/// Issue every configured certificate of the course to the learner when
/// their course progress says so. Returns how many were newly issued.
pub async fn issue_for_completion(
    pool: &PgPool,
    course_id: CourseId,
    user_id: UserId,
) -> Result<usize> {
    let eligible = ab_db::progress::get_course_progress(pool, course_id, user_id)
        .await?
        .is_some_and(|p| p.certificate_eligible);
    if !eligible {
        return Ok(0);
    }
    let mut issued = 0;
    for certification in ab_db::certifications::list_course_certifications(pool, course_id).await? {
        if ab_db::certifications::issue_certificate(
            pool,
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
}

/// The public verification view.
#[derive(Debug, Clone)]
pub struct VerifiedCertificate {
    pub issued: IssuedCertificate,
    pub holder_display_name: String,
    pub holder_username: String,
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
    /// or `own` for the course creator).
    async fn scoped_course(
        &self,
        actor: &Actor,
        course_id: CourseId,
        action: Action,
    ) -> Result<Course> {
        let course = self.courses.get(actor, course_id).await?;
        let allowed = actor.has(perm(action, Scope::Platform))
            || (course.creator_id == Some(actor.user_id) && actor.has(perm(action, Scope::Own)));
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
        issue_for_completion(&self.pool, course_id, actor.user_id).await?;
        let rows = ab_db::certifications::list_user_certificates_for_course(
            &self.pool,
            course_id,
            actor.user_id,
        )
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for certificate in rows {
            let certification = self.load(certificate.certification_id).await?;
            out.push(IssuedCertificate {
                certificate,
                certification,
                course: course.clone(),
            });
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
            out.push(IssuedCertificate {
                certificate,
                certification,
                course,
            });
        }
        Ok(out)
    }

    /// Public verification by code (no session).
    pub async fn verify(&self, verify_code: &str) -> Result<VerifiedCertificate> {
        let certificate =
            ab_db::certifications::get_certificate_by_code(&self.pool, verify_code.trim())
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
            holder_display_name: holder
                .as_ref()
                .map(|h| h.display_name.clone())
                .unwrap_or_default(),
            holder_username: holder.map(|h| h.username).unwrap_or_default(),
            issued: IssuedCertificate {
                certificate,
                certification,
                course,
            },
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
}
