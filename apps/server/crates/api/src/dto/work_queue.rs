//! Unified inbox DTOs (legacy `db/work_queue.py`).

use ab_core::id::{ActivityId, CourseId};
use ab_domain::progress::work_queue as domain;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

pub use ab_domain::progress::work_queue::{WorkPriority, WorkRole};

#[derive(Debug, Deserialize, ToSchema, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
pub struct WorkQueueQuery {
    /// `learner` (default) or `teacher`.
    pub role: Option<WorkRole>,
    /// 1..=100 (default 50).
    pub limit: Option<i64>,
    /// `next_cursor` of the previous page (opaque).
    pub cursor: Option<String>,
}

/// One thing to act on.
///
/// `id` is stable across calls; `kind` names the situation (`in_progress`, `overdue`, `waiting_for_grade`,
/// `returned_for_revision`, `feedback_released`, `needs_grading`,
/// `sla_breach`, `awaiting_release`).
#[derive(Debug, Serialize, ToSchema)]
pub struct WorkItem {
    pub id: String,
    pub role: WorkRole,
    pub kind: &'static str,
    pub status: &'static str,
    pub priority: WorkPriority,
    pub title: String,
    pub description: String,
    /// Client route for the primary action.
    pub href: String,
    pub primary_action: &'static str,
    pub course_id: CourseId,
    pub course_title: String,
    pub activity_id: ActivityId,
    pub activity_title: String,
    pub due_at_unix: Option<i64>,
    pub created_at_unix: Option<i64>,
    pub allowed_actions: Vec<&'static str>,
}

/// One page; `total` counts the whole queue before paging.
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
            href: i.href,
            primary_action: i.primary_action,
            course_id: i.course_id,
            course_title: i.course_title,
            activity_id: i.activity_id,
            activity_title: i.activity_title,
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
