//! Unified inbox DTOs (legacy `db/work_queue.py`).

use ab_core::id::{ActivityId, CourseId, FileAttemptId, SubmissionId};
use ab_domain::progress::work_queue as domain;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

pub use ab_domain::progress::work_queue::{
    WorkKind, WorkMessageKey, WorkMessageParams, WorkPriority, WorkRole, WorkSort, WorkStatus,
};

#[derive(Debug, Deserialize, ToSchema, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
pub struct WorkQueueQuery {
    /// `learner` (default) or `teacher`.
    pub role: Option<WorkRole>,
    /// Items of this kind only.
    pub kind: Option<WorkKind>,
    /// Items of this course only.
    pub course_id: Option<CourseId>,
    /// Order; default `priority`.
    pub sort: Option<WorkSort>,
    /// 1..=100 (default 50).
    pub limit: Option<i64>,
    /// `next_cursor` of the previous page (opaque; same filters and order).
    pub cursor: Option<String>,
}

/// One thing to act on.
///
/// `id` is stable across calls; `kind` names the situation. `title`,
/// `description` and `primary_action` are English (the old web);
/// `message_key` + `message_params` are the translatable form.
#[derive(Debug, Serialize, ToSchema)]
pub struct WorkItem {
    pub id: String,
    pub role: WorkRole,
    pub kind: WorkKind,
    pub status: WorkStatus,
    pub priority: WorkPriority,
    pub title: String,
    pub description: String,
    /// Always present on this server (optional in the schema so earlier
    /// clients' fixtures stay valid).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub message_key: Option<WorkMessageKey>,
    /// Always present, like `message_key`.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub message_params: Option<WorkMessageParams>,
    /// Client route for the primary action.
    pub href: String,
    pub primary_action: &'static str,
    pub course_id: CourseId,
    pub course_title: String,
    pub activity_id: ActivityId,
    pub activity_title: String,
    /// Teacher items: the assessment submission under review (absent otherwise).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub submission_id: Option<SubmissionId>,
    /// Teacher items: the file-submission attempt under review (absent otherwise).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub attempt_id: Option<FileAttemptId>,
    /// Teacher items: the learner's display name, else username (absent otherwise).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub learner_name: Option<String>,
    pub due_at_unix: Option<i64>,
    pub created_at_unix: Option<i64>,
    pub allowed_actions: Vec<&'static str>,
}

/// One page; `total` counts the whole (filtered) queue before paging.
#[derive(Debug, Serialize, ToSchema)]
pub struct WorkQueue {
    pub items: Vec<WorkItem>,
    pub total: i64,
    pub next_cursor: Option<String>,
}

impl From<domain::WorkItem> for WorkItem {
    fn from(i: domain::WorkItem) -> Self {
        Self {
            id: i.id,
            role: i.role,
            kind: i.kind,
            status: i.status,
            priority: i.priority,
            title: i.title,
            description: i.description,
            message_key: Some(i.message_key),
            message_params: Some(i.message_params),
            href: i.href,
            primary_action: i.primary_action,
            course_id: i.course_id,
            course_title: i.course_title,
            activity_id: i.activity_id,
            activity_title: i.activity_title,
            submission_id: i.submission_id,
            attempt_id: i.attempt_id,
            learner_name: i.learner_name,
            due_at_unix: i.due_at,
            created_at_unix: i.created_at,
            allowed_actions: i.allowed_actions,
        }
    }
}

impl From<domain::WorkQueue> for WorkQueue {
    fn from(q: domain::WorkQueue) -> Self {
        Self {
            items: q.items.into_iter().map(Into::into).collect(),
            total: q.total,
            next_cursor: q.next_cursor,
        }
    }
}
