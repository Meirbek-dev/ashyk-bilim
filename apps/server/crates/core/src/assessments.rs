//! Assessment vocabulary shared by every layer.
//!
//! Text-backed enums mirroring the `CHECK` constraints in migration 0010
//! (ARCHITECTURE §8.3 — no native PG enums). Decoded with `query_as!` column
//! overrides; bound as `as_str()`.

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
    /// What the assessment is; decides the backing activity type and which
    /// item kinds are allowed.
    AssessmentKind {
        Quiz => "quiz",
        Exam => "exam",
        CodeChallenge => "code_challenge",
    }
);

impl AssessmentKind {
    /// The activity `(type, subtype)` pair that hosts this assessment.
    #[must_use]
    pub const fn activity_type(self) -> (&'static str, &'static str) {
        match self {
            Self::Quiz => ("quiz", "quiz_standard"),
            Self::Exam => ("exam", "exam_standard"),
            Self::CodeChallenge => ("code_challenge", "code_general"),
        }
    }

    /// Item kinds an assessment of this kind may contain.
    #[must_use]
    pub const fn allowed_item_kinds(self) -> &'static [ItemKind] {
        match self {
            Self::Quiz | Self::Exam => &[
                ItemKind::Choice,
                ItemKind::Matching,
                ItemKind::OpenText,
                ItemKind::Form,
            ],
            Self::CodeChallenge => &[ItemKind::Code],
        }
    }
}

text_enum!(
    Lifecycle {
        Draft => "draft",
        Scheduled => "scheduled",
        Published => "published",
        Archived => "archived",
    }
);

impl Lifecycle {
    /// Legacy transition table (`_shared.py` `_LIFECYCLE_TRANSITIONS`).
    #[must_use]
    pub const fn can_transition_to(self, to: Self) -> bool {
        matches!(
            (self, to),
            (
                Self::Draft,
                Self::Scheduled | Self::Published | Self::Archived
            ) | (
                Self::Scheduled,
                Self::Draft | Self::Published | Self::Archived
            ) | (Self::Published, Self::Draft | Self::Archived)
                | (Self::Archived, Self::Draft)
        )
    }
}

text_enum!(
    ItemKind {
        Choice => "choice",
        OpenText => "open_text",
        Form => "form",
        Code => "code",
        Matching => "matching",
    }
);

text_enum!(
    GradingType {
        Numeric => "numeric",
        Percentage => "percentage",
    }
);

text_enum!(
    GradingMode {
        Auto => "auto",
        Manual => "manual",
        AutoThenManual => "auto_then_manual",
    }
);

text_enum!(
    GradeReleaseMode {
        Immediate => "immediate",
        Batch => "batch",
    }
);

text_enum!(
    CompletionRule {
        Viewed => "viewed",
        Submitted => "submitted",
        Graded => "graded",
        Passed => "passed",
        TeacherVerified => "teacher_verified",
    }
);

text_enum!(
    ReviewVisibility {
        None => "none",
        ScoreOnly => "score_only",
        Full => "full",
    }
);

text_enum!(
    LatePolicyKind {
        None => "none",
        Penalty => "penalty",
        Cutoff => "cutoff",
    }
);

text_enum!(
    AccessMode {
        AllCourseLearners => "all_course_learners",
        Restricted => "restricted",
    }
);

text_enum!(
    Difficulty {
        Easy => "easy",
        Medium => "medium",
        Hard => "hard",
    }
);

// ── Submissions & grading (migration 0011) ──────────────────────────────────

text_enum!(
    SubmissionStatus {
        Draft => "draft",
        Pending => "pending",
        Graded => "graded",
        Published => "published",
        Returned => "returned",
    }
);

text_enum!(
    AutoSubmitReason {
        TimeExpired => "time_expired",
        IntegrityViolation => "integrity_violation",
    }
);

text_enum!(
    BulkActionType {
        ExtendDeadline => "extend_deadline",
        ReleaseGrades => "release_grades",
        ReturnAll => "return_all",
        OverrideScore => "override_score",
        BatchGrade => "batch_grade",
    }
);

text_enum!(
    BulkActionStatus {
        Pending => "pending",
        Running => "running",
        Completed => "completed",
        Failed => "failed",
    }
);

text_enum!(
    CodeRunPurpose {
        Custom => "custom",
        Visible => "visible",
        Final => "final",
        ReferenceCheck => "reference_check",
    }
);

text_enum!(
    CodeRunStatus {
        Queued => "queued",
        Running => "running",
        Accepted => "accepted",
        WrongAnswer => "wrong_answer",
        CompileError => "compile_error",
        RuntimeError => "runtime_error",
        TimeLimit => "time_limit",
        InternalError => "internal_error",
        Degraded => "degraded",
    }
);

text_enum!(
    AnnotationType {
        Text => "text",
        Highlight => "highlight",
        Audio => "audio",
    }
);

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_as_wire_strings() {
        for kind in AssessmentKind::ALL {
            assert_eq!(AssessmentKind::parse(kind.as_str()), Some(*kind));
            let json = serde_json::to_string(kind).unwrap();
            assert_eq!(json, format!("\"{}\"", kind.as_str()));
        }
        assert_eq!(Lifecycle::parse("bogus"), None);
    }

    #[test]
    fn transition_table_matches_legacy() {
        assert!(Lifecycle::Draft.can_transition_to(Lifecycle::Published));
        assert!(Lifecycle::Published.can_transition_to(Lifecycle::Draft));
        assert!(Lifecycle::Archived.can_transition_to(Lifecycle::Draft));
        assert!(!Lifecycle::Archived.can_transition_to(Lifecycle::Published));
        assert!(!Lifecycle::Published.can_transition_to(Lifecycle::Scheduled));
        assert!(!Lifecycle::Draft.can_transition_to(Lifecycle::Draft));
    }
}
