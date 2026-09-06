//! Typed UUIDv7 identifiers.
//!
//! Domain signatures never take a bare `Uuid` — `fn enroll(user: UserId, course:
//! CourseId)` cannot have its arguments swapped, `fn enroll(a: Uuid, b: Uuid)`
//! can. New entity ids are added here, one line each.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

macro_rules! typed_id {
    ($(#[$doc:meta])* $name:ident) => {
        $(#[$doc])*
        #[derive(
            Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord,
            Serialize, Deserialize, sqlx::Type, utoipa::ToSchema,
        )]
        #[serde(transparent)]
        #[sqlx(transparent)]
        pub struct $name(pub Uuid);

        impl $name {
            /// Mint a new time-ordered (UUIDv7) id.
            #[must_use]
            pub fn new() -> Self {
                Self(Uuid::now_v7())
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                self.0.fmt(f)
            }
        }

        impl std::str::FromStr for $name {
            type Err = uuid::Error;
            fn from_str(s: &str) -> Result<Self, Self::Err> {
                Ok(Self(Uuid::parse_str(s)?))
            }
        }

        impl From<$name> for Uuid {
            fn from(id: $name) -> Uuid {
                id.0
            }
        }
    };
}

typed_id!(
    /// A request correlation id (also sent as the `x-request-id` header).
    RequestId
);
typed_id!(UserId);
typed_id!(SessionId);
typed_id!(CourseId);
typed_id!(ChapterId);
typed_id!(ActivityId);
typed_id!(BlockId);
typed_id!(CollectionId);
typed_id!(CourseUpdateId);
typed_id!(UsergroupId);
typed_id!(AssessmentId);
typed_id!(AssessmentItemId);
typed_id!(SubmissionId);
typed_id!(GradingEntryId);
typed_id!(ItemFeedbackId);
typed_id!(BulkActionId);
typed_id!(CodeRunId);
typed_id!(FileSubmissionId);
typed_id!(FileAttemptId);
typed_id!(FileAttemptFileId);
typed_id!(TrailId);
typed_id!(TrailRunId);
typed_id!(TrailStepId);
typed_id!(ActivityProgressId);
typed_id!(CourseProgressId);
typed_id!(DiscussionId);
typed_id!(CertificationId);
typed_id!(CertificateId);
typed_id!(GamificationProfileId);
typed_id!(XpTransactionId);
typed_id!(JobId);
typed_id!(AnalyticsEventId);
typed_id!(InterventionId);
typed_id!(SavedViewId);
typed_id!(RiskSnapshotId);
typed_id!(AiThreadId);
typed_id!(AiRunId);
typed_id!(AiEventId);
typed_id!(AiArtifactId);
typed_id!(AiEvidenceId);
typed_id!(AiApprovalId);
typed_id!(AiEvalResultId);
typed_id!(AiMessageId);
typed_id!(AiSubmissionAnalysisId);
typed_id!(AiCourseAnalysisId);
typed_id!(AiLectureReviewId);
typed_id!(AiRemediationSessionId);
typed_id!(AiStudentMemoryId);

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn v7_ids_are_time_ordered() {
        let a = UserId::new();
        let b = UserId::new();
        assert!(a <= b, "uuidv7 must sort by creation time");
    }

    #[test]
    fn serde_is_transparent() {
        let id = CourseId::new();
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, format!("\"{id}\""));
        let back: CourseId = serde_json::from_str(&json).unwrap();
        assert_eq!(back, id);
    }
}
