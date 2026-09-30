//! Certification templates and issued certificates.

use ab_core::id::{CertificateId, CertificationId, CourseId, UserId};
use ab_domain::certifications as domain;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::dto::courses::Course;

#[derive(Debug, Serialize, ToSchema)]
pub struct Certification {
    pub id: CertificationId,
    pub course_id: CourseId,
    /// The client's PDF designer document (opaque to the server).
    #[schema(value_type = Object)]
    pub config: serde_json::Value,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl From<ab_db::certifications::CertificationRow> for Certification {
    fn from(r: ab_db::certifications::CertificationRow) -> Self {
        Self {
            id: r.id,
            course_id: r.course_id,
            config: r.config,
            created_at_unix: r.created_at,
            updated_at_unix: r.updated_at,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateCertificationRequest {
    #[garde(skip)]
    pub course_id: CourseId,
    /// The designer document: an object of at most 16 KiB serialized.
    #[garde(custom(crate::dto::analytics::json_object_16k))]
    #[serde(default = "empty_object")]
    #[schema(value_type = Object)]
    pub config: serde_json::Value,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateCertificationRequest {
    /// The designer document: an object of at most 16 KiB serialized.
    #[garde(custom(crate::dto::analytics::json_object_16k))]
    #[schema(value_type = Object)]
    pub config: serde_json::Value,
}

fn empty_object() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}

#[derive(Debug, Serialize, ToSchema)]
pub struct Certificate {
    pub id: CertificateId,
    pub certification_id: CertificationId,
    pub user_id: UserId,
    /// Public verification code; the client links `/certificates/{code}/verify`.
    pub verify_code: String,
    pub issued_at_unix: i64,
}

impl From<ab_db::certifications::CertificateRow> for Certificate {
    fn from(r: ab_db::certifications::CertificateRow) -> Self {
        Self {
            id: r.id,
            certification_id: r.certification_id,
            user_id: r.user_id,
            verify_code: r.verify_code,
            issued_at_unix: r.created_at,
        }
    }
}

/// A certificate with its template and course.
#[derive(Debug, Serialize, ToSchema)]
pub struct IssuedCertificate {
    pub certificate: Certificate,
    pub certification: Certification,
    pub course: Course,
    /// The name signed on the certificate (`config.certificate_instructor`,
    /// else the course creator's display name) — what the PDF prints.
    pub instructor_name: Option<String>,
}

impl From<domain::IssuedCertificate> for IssuedCertificate {
    fn from(i: domain::IssuedCertificate) -> Self {
        Self {
            certificate: i.certificate.into(),
            certification: i.certification.into(),
            course: i.course.into(),
            instructor_name: i.instructor_name,
        }
    }
}

/// What a verifier learns about the holder: the name on the certificate.
#[derive(Debug, Serialize, ToSchema)]
pub struct CertificateHolder {
    pub display_name: String,
}

/// A certificate as the public sees it (no holder id).
#[derive(Debug, Serialize, ToSchema)]
pub struct PublicCertificate {
    pub id: CertificateId,
    pub certification_id: CertificationId,
    pub verify_code: String,
    pub issued_at_unix: i64,
}

/// The public verification view.
#[derive(Debug, Serialize, ToSchema)]
pub struct VerifiedCertificate {
    pub certificate: PublicCertificate,
    pub certification: Certification,
    pub course: Course,
    pub holder: CertificateHolder,
    /// The name signed on the certificate — what the PDF prints.
    pub instructor_name: Option<String>,
}

impl From<domain::VerifiedCertificate> for VerifiedCertificate {
    fn from(v: domain::VerifiedCertificate) -> Self {
        let c = v.issued.certificate;
        Self {
            certificate: PublicCertificate {
                id: c.id,
                certification_id: c.certification_id,
                verify_code: c.verify_code,
                issued_at_unix: c.created_at,
            },
            certification: v.issued.certification.into(),
            // Public view: no user ids at all (BUG-137) — `creator_id` is optional on the wire.
            course: Course {
                creator_id: None,
                contributor_ids: Vec::new(),
                ..v.issued.course.into()
            },
            holder: CertificateHolder {
                display_name: v.holder_display_name,
            },
            instructor_name: v.issued.instructor_name,
        }
    }
}
