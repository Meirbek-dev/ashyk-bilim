//! Closed value sets the wire carries as plain strings (S-01, C-04).
//!
//! Schema-only: the handlers keep their string fields and validators; these
//! types only name the set in the contract (`#[schema(value_type = …)]`).
//! The tests below pin each set to the server's own list so they cannot drift.

use serde::Serialize;
use utoipa::ToSchema;

pub use ab_domain::wire::ActivityType;

/// Activity sub-kind; must pair with its [`ActivityType`].
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ActivitySubType {
    DynamicPage,
    VideoYoutube,
    VideoHosted,
    DocumentPdf,
    DocumentDoc,
    QuizStandard,
    ExamStandard,
    CodeGeneral,
    CodeCompetitive,
    FileSubmissionStandard,
    Custom,
}

/// Content block kind (`custom` exists only on migrated legacy rows and
/// cannot be created).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum BlockType {
    Image,
    Pdf,
    Video,
    Custom,
}

/// What an upload is for: decides bucket, size cap and allowed MIME types.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "kebab-case")]
pub enum UploadPurpose {
    Avatar,
    CourseThumbnail,
    BlockImage,
    BlockPdf,
    BlockVideo,
    PlatformLogo,
    PlatformThumbnail,
    FileSubmission,
    CollectionCover,
    /// An image in a discussion post (any course participant; the post's
    /// `upload_ids` claims it).
    DiscussionImage,
}

/// `GET /users` order.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum AdminUserSort {
    /// Newest account first (default).
    Newest,
    /// Display name A-Z.
    Name,
}

/// `?lang=` on CSV exports and certificate PDFs (a link cannot set
/// `Accept-Language`); `middleware::lang_query` turns it into that header.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum UiLanguage {
    Ru,
    Kk,
    En,
}

/// A locale on input: the short tag (stored) or the legacy region tag.
#[derive(Serialize, ToSchema)]
pub enum LocaleInput {
    #[serde(rename = "ru")]
    Ru,
    #[serde(rename = "kk")]
    Kk,
    #[serde(rename = "en")]
    En,
    #[serde(rename = "ru-RU")]
    RuRu,
    #[serde(rename = "kk-KZ")]
    KkKz,
    #[serde(rename = "en-US")]
    EnUs,
}

/// A stored UI locale.
#[derive(Serialize, ToSchema)]
pub enum Locale {
    #[serde(rename = "ru-RU")]
    RuRu,
    #[serde(rename = "kk-KZ")]
    KkKz,
    #[serde(rename = "en-US")]
    EnUs,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CourseLifecycleAction {
    Publish,
    Unpublish,
    Archive,
    Restore,
}

/// `GET /courses?sort=`: `updated` (default), `name`, `progress`.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CourseListSort {
    Updated,
    Name,
    Progress,
}

/// `GET /courses?preset=`; `archived` needs `mine=true`.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CourseListPreset {
    All,
    Drafts,
    Published,
    Recent,
    Attention,
    Archived,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum UserStatus {
    Active,
    Disabled,
}

/// `GET /collections?sort=`: `newest` (default), `name` (A-Z) or
/// `updated` (newest update first).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CollectionListSort {
    Newest,
    Name,
    Updated,
}

/// A contributor role one can grant (`ab_domain::catalog::contributors::ROLES`).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ContributorRole {
    Maintainer,
    Contributor,
    Reporter,
}

/// A roster entry's role: the granted roles plus the course `creator`.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RosterRole {
    Creator,
    Maintainer,
    Contributor,
    Reporter,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ContributorStatus {
    Pending,
    Active,
    Inactive,
}

/// Whose context an AI scope exposes.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ContextVisibility {
    Student,
    Teacher,
}

#[cfg(test)]
mod tests {
    use super::*;
    use utoipa::PartialSchema;

    fn values<T: PartialSchema>() -> Vec<String> {
        let schema = serde_json::to_value(T::schema()).unwrap_or_default();
        schema["enum"]
            .as_array()
            .map(|v| {
                v.iter()
                    .filter_map(|s| s.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn sorted<'a>(it: impl IntoIterator<Item = &'a str>) -> Vec<String> {
        let mut v: Vec<String> = it.into_iter().map(String::from).collect();
        v.sort();
        v
    }

    #[test]
    fn sets_match_the_server_lists() {
        use ab_domain::catalog::curriculum::TYPE_SUBTYPES;
        let mut types = values::<ActivityType>();
        types.sort();
        assert_eq!(types, sorted(TYPE_SUBTYPES.iter().map(|(t, _)| *t)));
        let mut subs = values::<ActivitySubType>();
        subs.sort();
        assert_eq!(
            subs,
            sorted(TYPE_SUBTYPES.iter().flat_map(|(_, s)| s.iter().copied()))
        );
        let mut kinds = values::<ab_domain::analytics::InterventionType>();
        kinds.sort();
        assert_eq!(
            kinds,
            sorted(ab_domain::analytics::INTERVENTION_TYPES.iter().copied())
        );
        let mut statuses = values::<ab_domain::analytics::InterventionStatus>();
        statuses.sort();
        assert_eq!(
            statuses,
            sorted(ab_domain::analytics::INTERVENTION_STATUSES.iter().copied())
        );
        let mut roles = values::<ContributorRole>();
        roles.sort();
        assert_eq!(
            roles,
            sorted(ab_domain::catalog::contributors::ROLES.iter().copied())
        );
        let mut roster = values::<RosterRole>();
        roster.sort();
        assert_eq!(
            roster,
            sorted(
                ab_domain::catalog::contributors::ROLES
                    .iter()
                    .copied()
                    .chain(["creator"])
            )
        );
        let mut statuses = values::<ContributorStatus>();
        statuses.sort();
        assert_eq!(
            statuses,
            sorted(ab_domain::catalog::contributors::STATUSES.iter().copied())
        );
        for purpose in values::<UploadPurpose>() {
            assert!(ab_domain::files::uploads::is_purpose(&purpose), "{purpose}");
        }
        for locale in values::<Locale>() {
            assert!(
                ab_core::language::Language::from_locale(&locale)
                    .is_some_and(|l| l.locale() == locale),
                "{locale}"
            );
        }
    }

    /// ENUMS (S-GAPS-2): the free strings that became enums keep their wire
    /// strings, and the schema lists exactly the serde values.
    fn pin<T: PartialSchema + serde::Serialize>(all: &[T], expected: &[&str]) {
        let wire: Vec<String> = all
            .iter()
            .map(|v| {
                serde_json::to_value(v)
                    .ok()
                    .and_then(|v| v.as_str().map(str::to_owned))
                    .unwrap_or_default()
            })
            .collect();
        assert_eq!(wire, expected);
        assert_eq!(values::<T>(), expected);
    }

    #[test]
    fn s_gaps_2_enums_keep_their_wire_strings() {
        use ab_domain::ai::{AiMode, AiScopeReason, FeatureReason};
        use ab_domain::analytics::types::DataGapReason;
        use ab_domain::progress::learner_state::{BlockedReason, DenialReason, NextActionReason};
        pin(
            &[
                NextActionReason::NotEnrolled,
                NextActionReason::ReturnedForRevision,
                NextActionReason::Overdue,
                NextActionReason::InProgress,
                NextActionReason::DueSoon,
                NextActionReason::NextRequired,
                NextActionReason::CertificateIssued,
                NextActionReason::CourseComplete,
                NextActionReason::WaitingForGrade,
                NextActionReason::Optional,
                NextActionReason::NoAvailableAction,
            ],
            &[
                "not_enrolled",
                "returned_for_revision",
                "overdue",
                "in_progress",
                "due_soon",
                "next_required",
                "certificate_issued",
                "course_complete",
                "waiting_for_grade",
                "optional",
                "no_available_action",
            ],
        );
        pin(&[BlockedReason::Restricted], &["restricted"]);
        pin(
            &[DenialReason::CourseArchived, DenialReason::StaffPreview],
            &["course_archived", "staff_preview"],
        );
        pin(
            &[
                AiMode::Ask,
                AiMode::Explain,
                AiMode::Practice,
                AiMode::Analyze,
            ],
            &["ask", "explain", "practice", "analyze"],
        );
        pin(
            &[
                AiScopeReason::CourseNotFound,
                AiScopeReason::AiDisabled,
                AiScopeReason::RestrictedActivity,
                AiScopeReason::NoEnabledModes,
            ],
            &[
                "course_not_found",
                "ai_disabled",
                "restricted_activity",
                "no_enabled_modes",
            ],
        );
        pin(&[FeatureReason::Disabled], &["disabled"]);
        pin(
            &[DataGapReason::FewerThan5Learners],
            &["fewer_than_5_learners"],
        );
    }

    #[test]
    fn s_gaps_2_work_enums_keep_their_wire_strings() {
        use ab_domain::progress::work_queue::{WorkKind, WorkStatus};
        pin(
            &[
                WorkKind::InProgress,
                WorkKind::Overdue,
                WorkKind::WaitingForGrade,
                WorkKind::ReturnedForRevision,
                WorkKind::FeedbackReleased,
                WorkKind::NeedsGrading,
                WorkKind::SlaBreach,
                WorkKind::AwaitingRelease,
            ],
            &[
                "in_progress",
                "overdue",
                "waiting_for_grade",
                "returned_for_revision",
                "feedback_released",
                "needs_grading",
                "sla_breach",
                "awaiting_release",
            ],
        );
        pin(
            &[
                WorkStatus::InProgress,
                WorkStatus::NeedsGrading,
                WorkStatus::Returned,
                WorkStatus::Published,
                WorkStatus::GradedHidden,
            ],
            &[
                "in_progress",
                "needs_grading",
                "returned",
                "published",
                "graded_hidden",
            ],
        );
    }
}
