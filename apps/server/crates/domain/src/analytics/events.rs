//! The analytics event log: capture points other slices call, best-effort.
//!
//! The legacy declared `analytics_event` and never wrote to it; v2 records
//! submission transitions, activity completions, discussion posts and
//! logins. A failed insert is logged and never fails the caller.

use ab_core::assessments::SubmissionStatus;
use ab_core::id::{ActivityId, AssessmentId, CourseId, DiscussionId, SubmissionId, UserId};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
pub enum AnalyticsEventType {
    #[serde(rename = "submission.submitted")]
    SubmissionSubmitted,
    #[serde(rename = "submission.graded")]
    SubmissionGraded,
    #[serde(rename = "submission.published")]
    SubmissionPublished,
    #[serde(rename = "submission.returned")]
    SubmissionReturned,
    #[serde(rename = "activity.completed")]
    ActivityCompleted,
    #[serde(rename = "discussion.posted")]
    DiscussionPosted,
    #[serde(rename = "login")]
    Login,
}

impl AnalyticsEventType {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SubmissionSubmitted => "submission.submitted",
            Self::SubmissionGraded => "submission.graded",
            Self::SubmissionPublished => "submission.published",
            Self::SubmissionReturned => "submission.returned",
            Self::ActivityCompleted => "activity.completed",
            Self::DiscussionPosted => "discussion.posted",
            Self::Login => "login",
        }
    }

    /// The event a submission status transition produces, if any.
    #[must_use]
    pub const fn for_submission_status(status: SubmissionStatus) -> Option<Self> {
        match status {
            SubmissionStatus::Pending => Some(Self::SubmissionSubmitted),
            SubmissionStatus::Graded => Some(Self::SubmissionGraded),
            SubmissionStatus::Published => Some(Self::SubmissionPublished),
            SubmissionStatus::Returned => Some(Self::SubmissionReturned),
            SubmissionStatus::Draft => None,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct EventDraft {
    pub course_id: Option<CourseId>,
    pub activity_id: Option<ActivityId>,
    pub assessment_id: Option<AssessmentId>,
    pub submission_id: Option<SubmissionId>,
    pub user_id: Option<UserId>,
    pub actor_id: Option<UserId>,
    pub payload: serde_json::Value,
}

/// Append one event; failures are logged, never returned.
pub async fn record(pool: &PgPool, event_type: AnalyticsEventType, draft: EventDraft) {
    let payload = if draft.payload.is_null() {
        serde_json::Value::Object(serde_json::Map::new())
    } else {
        draft.payload
    };
    let result = ab_db::analytics::insert_event(
        pool,
        ab_db::analytics::NewEvent {
            event_type: event_type.as_str(),
            course_id: draft.course_id,
            activity_id: draft.activity_id,
            assessment_id: draft.assessment_id,
            submission_id: draft.submission_id,
            user_id: draft.user_id,
            actor_id: draft.actor_id,
            payload: &payload,
        },
    )
    .await;
    if let Err(err) = result {
        tracing::warn!(error = %err, event = event_type.as_str(), "analytics event not recorded");
    }
}

/// Capture points, one per write path.
pub mod hooks {
    use super::{AnalyticsEventType, EventDraft, record};
    use ab_core::assessments::SubmissionStatus;
    use ab_core::id::{ActivityId, AssessmentId, CourseId, DiscussionId, SubmissionId, UserId};
    use sqlx::PgPool;

    /// A submission reached `status` (submit, grade save, publish, return).
    /// `actor` is the teacher for grading transitions, `None` for the learner
    /// or the auto-grader.
    pub async fn submission_status(
        pool: &PgPool,
        submission_id: SubmissionId,
        assessment_id: AssessmentId,
        course_id: CourseId,
        user_id: UserId,
        status: SubmissionStatus,
        actor: Option<UserId>,
    ) {
        let Some(event_type) = AnalyticsEventType::for_submission_status(status) else {
            return;
        };
        record(
            pool,
            event_type,
            EventDraft {
                course_id: Some(course_id),
                activity_id: None,
                assessment_id: Some(assessment_id),
                submission_id: Some(submission_id),
                user_id: Some(user_id),
                actor_id: actor,
                payload: serde_json::json!({ "status": status.as_str() }),
            },
        )
        .await;
    }

    /// An activity flipped to completed for a learner (explicit lesson
    /// completion or a projected assessment completion).
    pub async fn activity_completed(
        pool: &PgPool,
        course_id: CourseId,
        activity_id: ActivityId,
        user_id: UserId,
    ) {
        record(
            pool,
            AnalyticsEventType::ActivityCompleted,
            EventDraft {
                course_id: Some(course_id),
                activity_id: Some(activity_id),
                user_id: Some(user_id),
                ..EventDraft::default()
            },
        )
        .await;
    }

    pub async fn discussion_posted(
        pool: &PgPool,
        course_id: CourseId,
        user_id: UserId,
        discussion_id: super::DiscussionId,
        is_reply: bool,
    ) {
        record(
            pool,
            AnalyticsEventType::DiscussionPosted,
            EventDraft {
                course_id: Some(course_id),
                user_id: Some(user_id),
                payload: serde_json::json!({ "discussion_id": discussion_id, "is_reply": is_reply }),
                ..EventDraft::default()
            },
        )
        .await;
    }

    pub async fn login(pool: &PgPool, user_id: UserId, method: &str) {
        record(
            pool,
            AnalyticsEventType::Login,
            EventDraft {
                user_id: Some(user_id),
                payload: serde_json::json!({ "method": method }),
                ..EventDraft::default()
            },
        )
        .await;
    }
}

// Keep the id import used by the hooks' signature documentation.
#[allow(dead_code)]
const _: Option<DiscussionId> = None;
