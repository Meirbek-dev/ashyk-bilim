//! Closed value sets the wire carries as plain strings (S-01, C-04).
//!
//! Schema-only: the handlers keep their string fields and validators; these
//! types only name the set in the contract (`#[schema(value_type = …)]`).
//! The tests below pin each set to the server's own list so they cannot drift.

use serde::Serialize;
use utoipa::ToSchema;

/// Activity kind (`custom` exists only on migrated legacy rows).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ActivityType {
    Dynamic,
    Video,
    Document,
    Quiz,
    Exam,
    CodeChallenge,
    FileSubmission,
    Custom,
}

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
}
