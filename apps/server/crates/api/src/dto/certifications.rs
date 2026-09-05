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
    #[garde(skip)]
    #[serde(default = "empty_object")]
    #[schema(value_type = Object)]
    pub config: serde_json::Value,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateCertificationRequest {
    #[garde(skip)]
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
}

impl From<domain::IssuedCertificate> for IssuedCertificate {
    fn from(i: domain::IssuedCertificate) -> Self {
        Self {
            certificate: i.certificate.into(),
            certification: i.certification.into(),
            course: i.course.into(),
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CertificateHolder {
    pub display_name: String,
    pub username: String,
}

/// The public verification view.
#[derive(Debug, Serialize, ToSchema)]
pub struct VerifiedCertificate {
    #[serde(flatten)]
    pub issued: IssuedCertificate,
    pub holder: CertificateHolder,
}

impl From<domain::VerifiedCertificate> for VerifiedCertificate {
    fn from(v: domain::VerifiedCertificate) -> Self {
        Self {
            issued: v.issued.into(),
            holder: CertificateHolder {
                display_name: v.holder_display_name,
                username: v.holder_username,
            },
        }
    }
}
