//! Capabilities of the AI surface in one course scope.
//!
//! What the AI surface offers a caller in one course scope (legacy
//! `routers/ai/capabilities.py`): role, enabled modes, per-feature flags
//! and a context summary, so the client can render the right entry points
//! without probing each feature.

use ab_core::Result;
use ab_core::ai::{AiFeature, AiThreadRole};
use ab_core::id::{ActivityId, CourseId};

use super::AiService;
use super::context;
use super::policy;
use crate::identity::Actor;

/// Which client screen is asking (legacy `AISurface`).
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "kebab-case")]
pub enum Surface {
    StudentActivity,
    TeacherStudio,
    TeacherReview,
    CoursePage,
    Admin,
}

/// Activities where learners get no AI help (legacy: exams, code
/// challenges, custom activities).
const RESTRICTED_ACTIVITY_TYPES: &[&str] = &["exam", "code_challenge", "custom"];

#[derive(Debug, Clone)]
pub struct FeatureCapability {
    pub feature: AiFeature,
    pub enabled: bool,
    /// `disabled` when off (legacy carried a free-text reason).
    pub reason: Option<&'static str>,
}

#[derive(Debug, Clone)]
pub struct ContextSummary {
    pub course_label: String,
    pub activity_label: Option<String>,
    pub activity_id: Option<ActivityId>,
    pub source_count: usize,
}

#[derive(Debug, Clone)]
pub struct ScopeCapabilities {
    pub available: bool,
    pub role: AiThreadRole,
    pub surface: Surface,
    /// `student` or `teacher` (legacy `AIContextVisibility`).
    pub context_visibility: &'static str,
    pub restricted: bool,
    pub reason: Option<&'static str>,
    pub modes: Vec<&'static str>,
    pub features: Vec<FeatureCapability>,
    pub context: Option<ContextSummary>,
}

impl ScopeCapabilities {
    const fn unavailable(surface: Surface, reason: &'static str) -> Self {
        Self {
            available: false,
            role: AiThreadRole::Student,
            surface,
            context_visibility: "student",
            restricted: false,
            reason: Some(reason),
            modes: Vec::new(),
            features: Vec::new(),
            context: None,
        }
    }
}

impl AiService {
    fn feature_capability(&self, feature: AiFeature) -> FeatureCapability {
        let enabled = self.feature_available(feature);
        FeatureCapability {
            feature,
            enabled,
            reason: (!enabled).then_some("disabled"),
        }
    }

    /// `GET /ai/capabilities/scope/{course}`. An unknown or invisible
    /// course answers `available=false, reason=course_not_found` rather
    /// than 404 (the client renders nothing either way).
    pub async fn scope_capabilities(
        &self,
        actor: &Actor,
        course_id: CourseId,
        surface: Surface,
        activity_id: Option<ActivityId>,
    ) -> Result<ScopeCapabilities> {
        let course = match self.visible_course(actor, course_id).await {
            Ok(course) => course,
            Err(err) if err.code() == ab_core::ErrorCode::NotFound => {
                return Ok(ScopeCapabilities::unavailable(surface, "course_not_found"));
            }
            Err(err) => return Err(err),
        };
        let role = policy::derive_course_role(actor, &course);
        let context_visibility = if role.sees_unpublished() {
            "teacher"
        } else {
            "student"
        };
        let activity = match activity_id {
            Some(id) => ab_db::catalog::get_activity(&self.pool, id)
                .await?
                .filter(|a| a.course_id == course_id),
            None => None,
        };
        let restricted = role == AiThreadRole::Student
            && activity
                .as_ref()
                .is_some_and(|a| RESTRICTED_ACTIVITY_TYPES.contains(&a.activity_type.as_str()));
        let bundle = context::course_bundle(
            &self.pool,
            course_id,
            role.sees_unpublished(),
            activity.as_ref().map(|a| a.id),
        )
        .await?;
        let context = ContextSummary {
            course_label: course.name.clone(),
            activity_label: activity.as_ref().map(|a| a.name.clone()),
            activity_id: activity.as_ref().map(|a| a.id),
            source_count: bundle.sources.len(),
        };

        let features = [
            AiFeature::CourseQa,
            AiFeature::StudyCompanion,
            AiFeature::CourseAnalysis,
            AiFeature::SubmissionAnalysis,
            AiFeature::Remediation,
            AiFeature::LectureAuthoring,
        ]
        .into_iter()
        .map(|f| self.feature_capability(f))
        .collect();

        let ai_enabled = self.config.ai_enabled;
        let mut modes: Vec<&'static str> = Vec::new();
        if ai_enabled && !restricted {
            if self.feature_available(AiFeature::CourseQa) {
                modes.push("ask");
            }
            if role == AiThreadRole::Student && self.feature_available(AiFeature::StudyCompanion) {
                modes.extend(["explain", "practice"]);
            }
        }
        if ai_enabled && role != AiThreadRole::Student {
            if surface == Surface::CoursePage && self.feature_available(AiFeature::CourseAnalysis) {
                modes.push("analyze");
            }
            if self.feature_available(AiFeature::CourseQa) && !modes.contains(&"ask") {
                modes.push("ask");
            }
        }

        let reason = if !ai_enabled {
            Some("ai_disabled")
        } else if restricted {
            Some("restricted_activity")
        } else if modes.is_empty() {
            Some("no_enabled_modes")
        } else {
            None
        };

        Ok(ScopeCapabilities {
            available: ai_enabled && !modes.is_empty() && !restricted,
            role,
            surface,
            context_visibility,
            restricted,
            reason,
            modes,
            features,
            context: Some(context),
        })
    }
}
