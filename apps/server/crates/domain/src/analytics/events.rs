//! The analytics event log: capture points other slices call.
//!
//! The legacy declared `analytics_event` and never wrote to it; v2 records
//! submission transitions, activity completions, discussion posts and
//! logins. An event is written in the transaction of the action it reports
//! (REWRITE 5.7): both commit or neither does, so the log never claims what
//! did not happen nor misses what did. Every payload carries
//! `schema_version` ([`SCHEMA_VERSION`]).

use ab_core::assessments::SubmissionStatus;
use ab_core::id::{ActivityId, AssessmentId, CourseId, SubmissionId, UserId};
use serde::{Deserialize, Serialize};
use sqlx::PgConnection;
use utoipa::ToSchema;

/// The payload's shape: bump it when a key changes meaning or goes away, so rollups and exports can
/// tell old rows from new ones.
pub const SCHEMA_VERSION: u32 = 1;

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

/// Append one event on the action's connection (its transaction).
pub async fn record(
    conn: &mut PgConnection,
    event_type: AnalyticsEventType,
    draft: EventDraft,
) -> ab_core::Result<()> {
    let mut payload = match draft.payload {
        serde_json::Value::Object(map) => map,
        _ => serde_json::Map::new(),
    };
    payload.insert("schema_version".into(), SCHEMA_VERSION.into());
    let payload = serde_json::Value::Object(payload);
    ab_db::analytics::insert_event(
        conn,
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
    .await
}

/// Capture points, one per write path.
pub mod hooks {
    use super::{AnalyticsEventType, EventDraft, record};
    use ab_core::assessments::SubmissionStatus;
    use ab_core::id::{ActivityId, AssessmentId, CourseId, DiscussionId, SubmissionId, UserId};
    use sqlx::PgConnection;

    /// A learner submitted (explicitly or by auto-submit). Recorded as
    /// `submission.submitted` whatever the auto-grader made of it.
    pub async fn submission_submitted(
        conn: &mut PgConnection,
        submission_id: SubmissionId,
        assessment_id: AssessmentId,
        course_id: CourseId,
        user_id: UserId,
        status: SubmissionStatus,
    ) -> ab_core::Result<()> {
        record(
            conn,
            AnalyticsEventType::SubmissionSubmitted,
            EventDraft {
                course_id: Some(course_id),
                activity_id: None,
                assessment_id: Some(assessment_id),
                submission_id: Some(submission_id),
                user_id: Some(user_id),
                actor_id: None,
                payload: serde_json::json!({ "status": status.as_str() }),
            },
        )
        .await
    }

    /// A submission reached `status` (submit, grade save, publish, return).
    /// `actor` is the teacher for grading transitions, `None` for the learner
    /// or the auto-grader.
    pub async fn submission_status(
        conn: &mut PgConnection,
        submission_id: SubmissionId,
        assessment_id: AssessmentId,
        course_id: CourseId,
        user_id: UserId,
        status: SubmissionStatus,
        actor: Option<UserId>,
    ) -> ab_core::Result<()> {
        let Some(event_type) = AnalyticsEventType::for_submission_status(status) else {
            return Ok(());
        };
        record(
            conn,
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
        .await
    }

    /// An activity flipped to completed for a learner (explicit lesson
    /// completion or a projected assessment completion).
    pub async fn activity_completed(
        conn: &mut PgConnection,
        course_id: CourseId,
        activity_id: ActivityId,
        user_id: UserId,
    ) -> ab_core::Result<()> {
        record(
            conn,
            AnalyticsEventType::ActivityCompleted,
            EventDraft {
                course_id: Some(course_id),
                activity_id: Some(activity_id),
                user_id: Some(user_id),
                ..EventDraft::default()
            },
        )
        .await
    }

    pub async fn discussion_posted(
        conn: &mut PgConnection,
        course_id: CourseId,
        user_id: UserId,
        discussion_id: DiscussionId,
        is_reply: bool,
    ) -> ab_core::Result<()> {
        record(
            conn,
            AnalyticsEventType::DiscussionPosted,
            EventDraft {
                course_id: Some(course_id),
                user_id: Some(user_id),
                payload: serde_json::json!({ "discussion_id": discussion_id, "is_reply": is_reply }),
                ..EventDraft::default()
            },
        )
        .await
    }

    pub async fn login(
        conn: &mut PgConnection,
        user_id: UserId,
        method: &str,
    ) -> ab_core::Result<()> {
        record(
            conn,
            AnalyticsEventType::Login,
            EventDraft {
                user_id: Some(user_id),
                payload: serde_json::json!({ "method": method }),
                ..EventDraft::default()
            },
        )
        .await
    }
}
