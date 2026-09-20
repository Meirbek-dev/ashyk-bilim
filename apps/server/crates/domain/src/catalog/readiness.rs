//! Course publish readiness (legacy `get_course_readiness`), computed on the
//! server so the web only localizes codes.
//!
//! Blockers (`ready == false`):
//! - `no-live-activity` — no published activity at all.
//! - `assessment-not-ready` — a published quiz/exam activity whose assessment
//!   is missing, not `published`, or fails its own readiness rules.
//! - `code-challenge-unconfigured` — a published code-challenge activity with
//!   no assessment behind it (the same lifecycle/readiness rules as above
//!   apply once one exists, reported as `assessment-not-ready`).
//! - `file-submission-unpublished` — a published file-submission activity
//!   whose config is missing or not `published`.
//! - `file-submission-not-ready` — a published config with empty
//!   instructions (legacy rows; BUG-219 refuses the edit today).
//!
//! Warnings (informational):
//! - `activity-unpublished` — a draft activity learners cannot see yet.
//! - `thumbnail-missing`, `certificate-not-configured`.

use ab_core::assessments::{FileSubmissionLifecycle, Lifecycle};
use ab_core::id::{ActivityId, CourseId};
use ab_core::{Error, ErrorCode, Result};

use crate::assessments::AssessmentsService;
use crate::catalog::courses::{Course, CoursesService};
use crate::identity::Actor;

#[derive(Debug, Clone)]
pub struct ReadinessItem {
    /// Stable code the web localizes (see the module doc for the list).
    pub code: &'static str,
    /// Set when the item points at one activity.
    pub activity_id: Option<ActivityId>,
    /// That activity's name, for the link label.
    pub title: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CourseReadiness {
    pub ready: bool,
    pub blockers: Vec<ReadinessItem>,
    pub warnings: Vec<ReadinessItem>,
}

fn item(code: &'static str, activity: Option<&ab_db::catalog::ActivityRow>) -> ReadinessItem {
    ReadinessItem {
        code,
        activity_id: activity.map(|a| a.id),
        title: activity.map(|a| a.name.clone()),
    }
}

/// Write access required (404 invisible, 403 visible-but-not-author).
pub async fn course_readiness(
    assessments: &AssessmentsService,
    actor: &Actor,
    course_id: CourseId,
) -> Result<CourseReadiness> {
    let pool = &assessments.pool;
    let course = assessments.courses.get(actor, course_id).await?;
    CoursesService::require_write(actor, &course)?;

    let activities = ab_db::catalog::list_activities(pool, course_id).await?;
    let mut blockers = Vec::new();
    let mut warnings = Vec::new();

    if !activities.iter().any(|a| a.published) {
        blockers.push(item("no-live-activity", None));
    }
    for activity in &activities {
        if !activity.published {
            warnings.push(item("activity-unpublished", Some(activity)));
            continue;
        }
        match activity.activity_type.as_str() {
            "quiz" | "exam" | "code_challenge" => {
                let assessment =
                    ab_db::assessments::get_assessment_by_activity(pool, activity.id).await?;
                match assessment {
                    None if activity.activity_type == "code_challenge" => {
                        blockers.push(item("code-challenge-unconfigured", Some(activity)));
                    }
                    None => blockers.push(item("assessment-not-ready", Some(activity))),
                    Some(assessment) => {
                        let ok = assessment.lifecycle == Lifecycle::Published
                            && assessments.readiness_of(assessment.id).await?.ok;
                        if !ok {
                            blockers.push(item("assessment-not-ready", Some(activity)));
                        }
                    }
                }
            }
            "file_submission" => {
                let config =
                    ab_db::file_submissions::get_file_submission_by_activity(pool, activity.id)
                        .await?;
                match config {
                    Some(c) if c.lifecycle == FileSubmissionLifecycle::Published => {
                        if c.instructions.trim().is_empty() {
                            blockers.push(item("file-submission-not-ready", Some(activity)));
                        }
                    }
                    _ => blockers.push(item("file-submission-unpublished", Some(activity))),
                }
            }
            _ => {}
        }
    }
    if course.thumbnail_key.is_none() {
        warnings.push(item("thumbnail-missing", None));
    }
    if ab_db::certifications::list_course_certifications(pool, course_id)
        .await?
        .is_empty()
    {
        warnings.push(item("certificate-not-configured", None));
    }
    Ok(CourseReadiness {
        ready: blockers.is_empty(),
        blockers,
        warnings,
    })
}

/// Course lifecycle (legacy `update_course_lifecycle`): publishing re-runs
/// readiness and refuses with 422 `course-not-ready` (+ `details.blockers`)
/// while any blocker remains; unpublishing is never gated.
pub async fn set_course_public(
    assessments: &AssessmentsService,
    actor: &Actor,
    course_id: CourseId,
    public: bool,
) -> Result<Course> {
    if public {
        let readiness = course_readiness(assessments, actor, course_id).await?;
        if !readiness.ready {
            let blockers: Vec<serde_json::Value> = readiness
                .blockers
                .iter()
                .map(|b| {
                    serde_json::json!({
                        "code": b.code, "activity_id": b.activity_id, "title": b.title,
                    })
                })
                .collect();
            return Err(Error::app_with_details(
                ErrorCode::CourseNotReady,
                "resolve all course readiness blockers before publishing",
                serde_json::json!({ "blockers": blockers }),
            ));
        }
    }
    assessments
        .courses
        .set_public(actor, course_id, public)
        .await
}
