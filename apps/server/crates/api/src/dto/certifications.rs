//! CertificateTemplate templates and issued certificates.

use ab_core::id::{CertificateId, CertificateTemplateId, CourseId, UserId};
use ab_domain::certifications as domain;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::dto::courses::Course;

#[derive(Debug, Serialize, ToSchema)]
pub struct CertificateTemplate {
    pub id: CertificateTemplateId,
    pub course_id: CourseId,
    #[schema(value_type = ab_domain::wire::CertificateTemplateConfig)]
    pub config: serde_json::Value,
    /// What the caller may do to this template now.
    pub allowed_actions: Vec<domain::CertificateTemplateAction>,
    /// Optimistic lock: `If-Match` on `PATCH` (stale → 412); the `ETag` of `GET`.
    pub version: i32,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl CertificateTemplate {
    pub fn new(
        r: ab_db::certifications::CertificateTemplateRow,
        allowed_actions: Vec<domain::CertificateTemplateAction>,
    ) -> Self {
        Self {
            allowed_actions,
            id: r.id,
            course_id: r.course_id,
            config: r.config,
            version: r.version,
            created_at_unix: r.created_at,
            updated_at_unix: r.updated_at,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateCertificateTemplateRequest {
    #[garde(skip)]
    pub course_id: CourseId,
    /// An object of at most 16 KiB serialized.
    #[garde(custom(crate::dto::analytics::json_object_16k))]
    #[serde(default = "empty_object")]
    #[schema(value_type = ab_domain::wire::CertificateTemplateConfig)]
    pub config: serde_json::Value,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateCertificateTemplateRequest {
    /// An object of at most 16 KiB serialized.
    #[garde(custom(crate::dto::analytics::json_object_16k))]
    #[schema(value_type = ab_domain::wire::CertificateTemplateConfig)]
    pub config: serde_json::Value,
}

fn empty_object() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}

#[derive(Debug, Serialize, ToSchema)]
pub struct Certificate {
    pub id: CertificateId,
    pub template_id: CertificateTemplateId,
    pub user_id: UserId,
    /// Public verification code; the client links `/certificates/{code}/verify`.
    pub verify_code: String,
    pub issued_at_unix: i64,
    /// The course name as issued (renaming the course leaves it).
    pub course_name: String,
    /// The template's `certification_name` as issued, else the course name.
    pub certificate_name: String,
    /// The course grade at issue (0-100), if anything was scored.
    pub score: Option<f64>,
    /// When a change of the holder's name last re-issued it.
    pub reissued_at_unix: Option<i64>,
}

impl From<ab_db::certifications::CertificateRow> for Certificate {
    fn from(r: ab_db::certifications::CertificateRow) -> Self {
        Self {
            id: r.id,
            template_id: r.template_id,
            user_id: r.user_id,
            verify_code: r.verify_code,
            issued_at_unix: r.created_at,
            course_name: r.course_name,
            certificate_name: r.certificate_name,
            score: r.score,
            reissued_at_unix: r.reissued_at,
        }
    }
}

/// A certificate with its template and course.
#[derive(Debug, Serialize, ToSchema)]
pub struct IssuedCertificate {
    pub certificate: Certificate,
    pub template: CertificateTemplate,
    pub course: Course,
    /// The name signed on the certificate as issued (`config.certificate_instructor`,
    /// else the course creator's display name) - what the PDF prints.
    pub instructor_name: Option<String>,
}

impl IssuedCertificate {
    pub fn for_actor(i: domain::IssuedCertificate, actor: &ab_domain::identity::Actor) -> Self {
        let actions = domain::CertificationsService::allowed_actions(actor, &i.course);
        Self {
            certificate: i.certificate.into(),
            template: CertificateTemplate::new(i.certification, actions),
            course: Course::for_actor(i.course, actor),
            instructor_name: i.instructor_name,
        }
    }
}

/// A certificate on the holder's public profile (`GET /users/{username}/certificates`).
#[derive(Debug, Serialize, ToSchema)]
pub struct ProfileCertificate {
    pub course_id: CourseId,
    pub course_name: String,
    /// The template's `certification_name`, else the course name.
    pub certificate_name: String,
    /// Opens `/certificates/{code}/verify`.
    pub verify_code: String,
    pub issued_at_unix: i64,
}

impl From<domain::ProfileCertificate> for ProfileCertificate {
    fn from(c: domain::ProfileCertificate) -> Self {
        Self {
            course_id: c.course_id,
            course_name: c.course_name,
            certificate_name: c.certificate_name,
            verify_code: c.verify_code,
            issued_at_unix: c.issued_at,
        }
    }
}

/// What a verifier learns about the holder: the name on the certificate (the
/// holder's current one: a name change re-issues).
#[derive(Debug, Serialize, ToSchema)]
pub struct CertificateHolder {
    pub display_name: String,
}

/// A certificate as the public sees it (no holder id).
#[derive(Debug, Serialize, ToSchema)]
pub struct PublicCertificate {
    pub id: CertificateId,
    pub template_id: CertificateTemplateId,
    pub verify_code: String,
    pub issued_at_unix: i64,
    /// The course name as issued (renaming the course leaves it).
    pub course_name: String,
    /// The template's `certification_name` as issued, else the course name.
    pub certificate_name: String,
    /// The course grade at issue (0-100), if anything was scored.
    pub score: Option<f64>,
    /// When a change of the holder's name last re-issued it.
    pub reissued_at_unix: Option<i64>,
}

/// The public verification view.
#[derive(Debug, Serialize, ToSchema)]
pub struct VerifiedCertificate {
    pub certificate: PublicCertificate,
    pub template: CertificateTemplate,
    pub course: Course,
    pub holder: CertificateHolder,
    /// The name signed on the certificate - what the PDF prints.
    pub instructor_name: Option<String>,
}

impl From<domain::VerifiedCertificate> for VerifiedCertificate {
    fn from(v: domain::VerifiedCertificate) -> Self {
        let c = v.issued.certificate;
        Self {
            certificate: PublicCertificate {
                id: c.id,
                template_id: c.template_id,
                verify_code: c.verify_code,
                issued_at_unix: c.created_at,
                course_name: c.course_name,
                certificate_name: c.certificate_name,
                score: c.score,
                reissued_at_unix: c.reissued_at,
            },
            // Public view: nobody acts on it.
            template: CertificateTemplate::new(v.issued.certification, Vec::new()),
            // Public view: no user ids at all (BUG-137) - `creator_id` is optional on the wire.
            course: Course {
                creator_id: None,
                contributor_ids: Vec::new(),
                ..Course::for_actor(v.issued.course, &ab_domain::identity::Actor::anonymous())
            },
            holder: CertificateHolder {
                display_name: c.holder_name,
            },
            instructor_name: v.issued.instructor_name,
        }
    }
}

/// Keyset page of the caller's certificates.
#[derive(Debug, Serialize, ToSchema)]
pub struct IssuedCertificatePage {
    pub items: Vec<IssuedCertificate>,
    pub next_cursor: Option<String>,
}
