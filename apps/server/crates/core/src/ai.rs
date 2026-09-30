//! AI subsystem vocabulary shared by every layer.
//!
//! Text-backed enums mirroring the `CHECK` constraints in migrations 0030/0031
//! (ARCHITECTURE §8.3 — no native PG enums) plus the feature-flag keys of the
//! legacy `AIConfig`. Decoded with `query_as!` column overrides; bound as
//! `as_str()`.

use serde::{Deserialize, Serialize};

macro_rules! text_enum {
    ($(#[$doc:meta])* $name:ident { $($variant:ident => $s:literal),+ $(,)? }) => {
        $(#[$doc])*
        #[derive(
            Debug, Clone, Copy, PartialEq, Eq, Hash,
            Serialize, Deserialize, utoipa::ToSchema, sqlx::Type,
        )]
        #[serde(rename_all = "snake_case")]
        #[sqlx(type_name = "text", rename_all = "snake_case")]
        pub enum $name {
            $($variant),+
        }

        impl $name {
            pub const ALL: &'static [Self] = &[$(Self::$variant),+];

            #[must_use]
            pub const fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $s),+ }
            }

            #[must_use]
            pub fn parse(s: &str) -> Option<Self> {
                match s {
                    $($s => Some(Self::$variant),)+
                    _ => None,
                }
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(self.as_str())
            }
        }
    };
}

text_enum!(
    /// Run lifecycle (ARCHITECTURE §12): `queued → running → {succeeded,
    /// failed, aborted}`. The legacy names were finished/error.
    AiRunStatus {
        Queued => "queued",
        Running => "running",
        Succeeded => "succeeded",
        Failed => "failed",
        Aborted => "aborted",
    }
);

impl AiRunStatus {
    #[must_use]
    pub const fn is_terminal(self) -> bool {
        matches!(self, Self::Succeeded | Self::Failed | Self::Aborted)
    }
}

text_enum!(
    /// Which agent a run executes (legacy `run_metadata.kind`).
    AiRunKind {
        CourseAnalysis => "course_analysis",
        SubmissionAnalysis => "submission_analysis",
        Remediation => "remediation",
        StudyCompanion => "study_companion",
        LectureReview => "lecture_review",
        CourseQa => "course_qa",
    }
);

text_enum!(
    /// The caller's role in an AI thread (legacy `AIThreadRole`).
    AiThreadRole {
        Student => "student",
        Teacher => "teacher",
        Author => "author",
        Admin => "admin",
    }
);

impl AiThreadRole {
    /// Teachers, authors and admins see unpublished content in context.
    #[must_use]
    pub const fn sees_unpublished(self) -> bool {
        !matches!(self, Self::Student)
    }
}

text_enum!(
    /// Legacy `AIRetentionClass`.
    AiRetentionClass {
        Transient => "transient",
        GeneratedAi => "generated_ai",
        EducationalRecord => "educational_record",
        Audit => "audit",
    }
);

text_enum!(
    /// Legacy `AIApprovalStatus`.
    AiApprovalStatus {
        Pending => "pending",
        Approved => "approved",
        Denied => "denied",
        Expired => "expired",
    }
);

text_enum!(
    /// Per-feature switches of the legacy `AIConfig` (`*_enabled` keys).
    AiFeature {
        CourseAnalysis => "course_analysis_enabled",
        SubmissionAnalysis => "submission_analysis_enabled",
        Remediation => "remediation_enabled",
        CourseQa => "course_qa_enabled",
        StudyCompanion => "study_companion_enabled",
        LectureAuthoring => "lecture_authoring_enabled",
        SemanticMemory => "semantic_memory_enabled",
    }
);

text_enum!(
    /// Study companion modes (legacy `StudyMode`).
    StudyMode {
        Explain => "explain",
        Practice => "practice",
        Flashcards => "flashcards",
        Summarize => "summarize",
        Deepen => "deepen",
    }
);

text_enum!(
    /// Course analysis publication state.
    CourseAnalysisStatus {
        Draft => "draft",
        NeedsHumanReview => "needs_human_review",
        Published => "published",
    }
);

text_enum!(
    /// Lecture review lifecycle.
    LectureReviewStatus {
        Active => "active",
        Superseded => "superseded",
    }
);

text_enum!(
    /// Remediation session lifecycle (legacy string states).
    RemediationStatus {
        Assigned => "assigned",
        InProgress => "in_progress",
        Passed => "passed",
        Failed => "failed",
    }
);

text_enum!(
    /// Q&A message author.
    QaMessageRole {
        User => "user",
        Assistant => "assistant",
    }
);

text_enum!(
    /// Teacher review verdict on one course-analysis finding.
    FindingReviewAction {
        Accepted => "accepted",
        Dismissed => "dismissed",
        TaskCreated => "task_created",
    }
);

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_through_serde_and_text() {
        for status in AiRunStatus::ALL {
            let json = serde_json::to_string(status).unwrap();
            assert_eq!(json, format!("\"{}\"", status.as_str()));
            assert_eq!(AiRunStatus::parse(status.as_str()), Some(*status));
        }
        assert!(AiRunStatus::Succeeded.is_terminal());
        assert!(!AiRunStatus::Running.is_terminal());
        assert!(AiThreadRole::Teacher.sees_unpublished());
        assert!(!AiThreadRole::Student.sees_unpublished());
    }
}
