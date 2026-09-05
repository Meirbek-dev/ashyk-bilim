//! The unified inbox (legacy `services/work_queue.py`).
//!
//! Everything a learner should act on, and every submission a teacher should
//! grade or release, ranked and paged behind an opaque cursor. Items are
//! assembled from the canonical `activity_progress` projection — never from
//! submissions directly — so the queue agrees with the learner course state
//! by construction. The whole queue is materialised per call (as the legacy
//! did): it is bounded by one user's open work.

use ab_core::assessments::ActivityProgressState;
use ab_core::id::{ActivityId, CourseId};
use ab_core::{Error, FieldError, Result};
use ab_db::work_queue::{LearnerWorkRow, TeacherWorkRow};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use utoipa::ToSchema;

use crate::identity::Actor;

pub const DEFAULT_PAGE: i64 = 50;
pub const MAX_PAGE: i64 = 100;
/// Ungraded work older than this is an SLA breach (legacy: 3 days).
const SLA_BREACH_SECS: i64 = 3 * 86_400;

/// Which inbox to assemble.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum WorkRole {
    Learner,
    Teacher,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum WorkPriority {
    Critical,
    High,
    Normal,
    Low,
}

impl WorkPriority {
    /// Sort rank: critical first.
    #[must_use]
    pub const fn rank(self) -> u8 {
        match self {
            Self::Critical => 0,
            Self::High => 1,
            Self::Normal => 2,
            Self::Low => 3,
        }
    }
}

/// One actionable thing. `id` is stable across calls
/// (`<role>-<kind>-<progress_id>`) so clients can diff pages.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkItem {
    pub id: String,
    pub role: WorkRole,
    pub kind: &'static str,
    pub status: &'static str,
    pub priority: WorkPriority,
    pub title: String,
    pub description: String,
    pub href: String,
    pub primary_action: &'static str,
    pub course_id: CourseId,
    pub course_title: String,
    pub activity_id: ActivityId,
    pub activity_title: String,
    pub due_at: Option<i64>,
    pub created_at: Option<i64>,
    pub allowed_actions: Vec<&'static str>,
}

/// One page. `total` counts the whole queue before paging (legacy).
#[derive(Debug, Clone)]
pub struct WorkQueue {
    pub items: Vec<WorkItem>,
    pub total: i64,
    pub next_cursor: Option<String>,
}

/// `(priority rank, due_at or created_at — missing sorts last, id)`.
type SortKey = (u8, i64, String);

#[derive(Clone)]
pub struct WorkQueueService {
    pool: PgPool,
}

impl WorkQueueService {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// The caller's queue for `role`. No grant is required: the learner
    /// queue is the caller's own progress, the teacher queue is scoped to
    /// courses the caller created or actively co-authors (empty otherwise).
    pub async fn list(
        &self,
        actor: &Actor,
        role: WorkRole,
        limit: i64,
        cursor: Option<&str>,
    ) -> Result<WorkQueue> {
        if actor.is_anonymous() {
            return Err(Error::unauthenticated());
        }
        if !(1..=MAX_PAGE).contains(&limit) {
            return Err(Error::validation(vec![FieldError {
                field: "limit".into(),
                code: "out-of-range".into(),
                message: format!("limit must be between 1 and {MAX_PAGE}"),
            }]));
        }
        let after = cursor.map(decode_cursor).transpose()?;
        let now = now_unix();
        let items = match role {
            WorkRole::Learner => ab_db::work_queue::list_learner_work(&self.pool, actor.user_id)
                .await?
                .iter()
                .map(|row| learner_item(row, now))
                .collect(),
            WorkRole::Teacher => {
                let grading =
                    ab_db::work_queue::list_teacher_grading_work(&self.pool, actor.user_id).await?;
                let release =
                    ab_db::work_queue::list_teacher_release_work(&self.pool, actor.user_id).await?;
                grading
                    .iter()
                    .map(|row| teacher_grading_item(row, now))
                    .chain(release.iter().filter_map(teacher_release_item))
                    .collect()
            }
        };
        Ok(page(items, after.as_ref(), limit))
    }
}

fn now_unix() -> i64 {
    jiff::Timestamp::now().as_second()
}

// ── Item assembly (legacy `_learner_item`, `_teacher_work`) ─────────────────

fn learner_href(course_id: CourseId, activity_id: ActivityId) -> String {
    format!("/course/{course_id}/activity/{activity_id}")
}

/// What differs between the learner kinds (legacy `_learner_item` branches).
struct LearnerSpec {
    id_kind: &'static str,
    kind: &'static str,
    status: &'static str,
    priority: WorkPriority,
    title: String,
    description: String,
    primary_action: &'static str,
    created_at: Option<i64>,
    allowed_actions: Vec<&'static str>,
}

fn learner_spec(row: &LearnerWorkRow, now: i64) -> LearnerSpec {
    let activity = &row.activity_title;
    let course = &row.course_title;
    match row.state {
        ActivityProgressState::Returned => LearnerSpec {
            id_kind: "returned",
            kind: "returned_for_revision",
            status: "returned",
            priority: WorkPriority::Critical,
            title: format!("Revise {activity}"),
            description: format!("{course}: feedback requires a new submission."),
            primary_action: "Revise work",
            created_at: Some(row.updated_at),
            allowed_actions: vec!["revise", "view_feedback"],
        },
        ActivityProgressState::Submitted | ActivityProgressState::NeedsGrading => LearnerSpec {
            id_kind: "waiting",
            kind: "waiting_for_grade",
            status: "needs_grading",
            priority: WorkPriority::Low,
            title: format!("Waiting for feedback on {activity}"),
            description: format!("{course}: your work was received."),
            primary_action: "View receipt",
            created_at: row.submitted_at.or(Some(row.updated_at)),
            allowed_actions: vec!["view_receipt"],
        },
        ActivityProgressState::Passed | ActivityProgressState::Failed => LearnerSpec {
            id_kind: "feedback",
            kind: "feedback_released",
            status: "published",
            priority: if row.state == ActivityProgressState::Failed {
                WorkPriority::High
            } else {
                WorkPriority::Normal
            },
            title: format!("Review feedback for {activity}"),
            description: format!("{course}: a grading decision is available."),
            primary_action: "View feedback",
            created_at: row.graded_at.or(Some(row.updated_at)),
            allowed_actions: vec!["view_feedback"],
        },
        // `not_started`, `graded` and `completed` never reach the queue (see
        // `list_learner_work`); `in_progress` is the open-work default.
        ActivityProgressState::NotStarted
        | ActivityProgressState::InProgress
        | ActivityProgressState::Graded
        | ActivityProgressState::Completed => {
            let overdue = row.due_at.is_some_and(|due| due < now);
            LearnerSpec {
                id_kind: "progress",
                kind: if overdue { "overdue" } else { "in_progress" },
                status: "in_progress",
                priority: if overdue {
                    WorkPriority::Critical
                } else {
                    WorkPriority::High
                },
                title: format!("Continue {activity}"),
                description: format!("{course}: finish your in-progress work."),
                primary_action: "Continue",
                created_at: row.started_at.or(Some(row.updated_at)),
                allowed_actions: vec!["continue"],
            }
        }
    }
}

fn learner_item(row: &LearnerWorkRow, now: i64) -> WorkItem {
    let spec = learner_spec(row, now);
    WorkItem {
        id: format!("learner-{}-{}", spec.id_kind, row.progress_id),
        role: WorkRole::Learner,
        kind: spec.kind,
        status: spec.status,
        priority: spec.priority,
        title: spec.title,
        description: spec.description,
        href: learner_href(row.course_id, row.activity_id),
        primary_action: spec.primary_action,
        course_id: row.course_id,
        course_title: row.course_title.clone(),
        activity_id: row.activity_id,
        activity_title: row.activity_title.clone(),
        due_at: row.due_at,
        created_at: spec.created_at,
        allowed_actions: spec.allowed_actions,
    }
}

fn review_href(row: &TeacherWorkRow, review_ref: Option<uuid::Uuid>) -> String {
    let base = format!(
        "/dash/courses/{}/activity/{}/review",
        row.course_id, row.activity_id
    );
    match review_ref {
        Some(id) => format!("{base}?submission={id}"),
        None => base,
    }
}

/// Display name, else username (legacy: first + last name, else username).
fn learner_name(row: &TeacherWorkRow) -> &str {
    let name = row.learner_display_name.trim();
    if name.is_empty() {
        &row.learner_username
    } else {
        name
    }
}

fn teacher_grading_item(row: &TeacherWorkRow, now: i64) -> WorkItem {
    let submitted_at = row.submitted_at.unwrap_or(row.updated_at);
    let breached = now - submitted_at >= SLA_BREACH_SECS;
    WorkItem {
        id: format!("teacher-grade-{}", row.progress_id),
        role: WorkRole::Teacher,
        kind: if breached {
            "sla_breach"
        } else {
            "needs_grading"
        },
        status: "needs_grading",
        priority: if breached {
            WorkPriority::Critical
        } else {
            WorkPriority::High
        },
        title: format!("Grade {}", row.activity_title),
        description: format!(
            "{} submitted work in {}.",
            learner_name(row),
            row.course_title
        ),
        href: review_href(row, row.review_ref),
        primary_action: "Grade submission",
        course_id: row.course_id,
        course_title: row.course_title.clone(),
        activity_id: row.activity_id,
        activity_title: row.activity_title.clone(),
        due_at: row.due_at,
        created_at: Some(submitted_at),
        allowed_actions: vec!["grade", "return", "publish"],
    }
}

/// `None` when nothing graded-but-unreleased backs the row (legacy skip).
fn teacher_release_item(row: &TeacherWorkRow) -> Option<WorkItem> {
    let review_ref = row.review_ref?;
    Some(WorkItem {
        id: format!("teacher-release-{}", row.progress_id),
        role: WorkRole::Teacher,
        kind: "awaiting_release",
        status: "graded_hidden",
        priority: WorkPriority::High,
        title: format!("Release {}", row.activity_title),
        description: format!(
            "{}'s grade in {} is saved but not visible.",
            learner_name(row),
            row.course_title
        ),
        href: review_href(row, Some(review_ref)),
        primary_action: "Review and release",
        course_id: row.course_id,
        course_title: row.course_title.clone(),
        activity_id: row.activity_id,
        activity_title: row.activity_title.clone(),
        due_at: None,
        created_at: row.graded_at.or(Some(row.updated_at)),
        allowed_actions: vec!["review", "publish"],
    })
}

// ── Ordering, cursor, paging (legacy `_sort_key`, `_encode_cursor`) ─────────

fn sort_key(item: &WorkItem) -> SortKey {
    (
        item.priority.rank(),
        item.due_at.or(item.created_at).unwrap_or(i64::MAX),
        item.id.clone(),
    )
}

/// base64url (no padding) of the JSON array `[rank, at, id]`; `at` is
/// `null` for items without any timestamp.
fn encode_cursor(item: &WorkItem) -> String {
    let (rank, at, id) = sort_key(item);
    let at = (at != i64::MAX).then_some(at);
    let json = serde_json::to_vec(&(rank, at, id)).unwrap_or_default();
    URL_SAFE_NO_PAD.encode(json)
}

fn decode_cursor(cursor: &str) -> Result<SortKey> {
    let invalid = || {
        Error::validation(vec![FieldError {
            field: "cursor".into(),
            code: "invalid".into(),
            message: "invalid work queue cursor".into(),
        }])
    };
    let bytes = URL_SAFE_NO_PAD
        .decode(cursor.trim_end_matches('='))
        .map_err(|_| invalid())?;
    let (rank, at, id): (u8, Option<i64>, String) =
        serde_json::from_slice(&bytes).map_err(|_| invalid())?;
    Ok((rank, at.unwrap_or(i64::MAX), id))
}

/// Sort, skip everything at or before `after`, cut to `limit`.
fn page(mut items: Vec<WorkItem>, after: Option<&SortKey>, limit: i64) -> WorkQueue {
    let total = i64::try_from(items.len()).unwrap_or(i64::MAX);
    items.sort_by_cached_key(sort_key);
    if let Some(after) = after {
        items.retain(|item| sort_key(item) > *after);
    }
    let limit = usize::try_from(limit).unwrap_or(usize::MAX);
    let has_more = items.len() > limit;
    items.truncate(limit);
    let next_cursor = if has_more {
        items.last().map(encode_cursor)
    } else {
        None
    };
    WorkQueue {
        items,
        total,
        next_cursor,
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    fn item(id: &str, priority: WorkPriority, due_at: Option<i64>) -> WorkItem {
        WorkItem {
            id: id.to_owned(),
            role: WorkRole::Learner,
            kind: "in_progress",
            status: "in_progress",
            priority,
            title: String::new(),
            description: String::new(),
            href: String::new(),
            primary_action: "Continue",
            course_id: CourseId::new(),
            course_title: String::new(),
            activity_id: ActivityId::new(),
            activity_title: String::new(),
            due_at,
            created_at: None,
            allowed_actions: vec![],
        }
    }

    fn ids(queue: &WorkQueue) -> Vec<&str> {
        queue.items.iter().map(|i| i.id.as_str()).collect()
    }

    #[test]
    fn orders_by_priority_then_time_then_id_with_missing_time_last() {
        let items = vec![
            item("d", WorkPriority::Low, Some(10)),
            item("c", WorkPriority::High, None),
            item("b", WorkPriority::High, Some(20)),
            item("a", WorkPriority::High, Some(20)),
            item("e", WorkPriority::Critical, Some(99)),
        ];
        let queue = page(items, None, 100);
        assert_eq!(ids(&queue), ["e", "a", "b", "c", "d"]);
        assert_eq!(queue.total, 5);
        assert!(queue.next_cursor.is_none());
    }

    #[test]
    fn cursor_pages_through_the_whole_queue_once() {
        let items = vec![
            item("a", WorkPriority::High, Some(20)),
            item("b", WorkPriority::High, Some(20)),
            item("c", WorkPriority::High, None),
        ];
        let first = page(items.clone(), None, 2);
        assert_eq!(ids(&first), ["a", "b"]);
        assert_eq!(first.total, 3);
        let cursor = first.next_cursor.as_deref().unwrap();
        let after = decode_cursor(cursor).unwrap();
        assert_eq!(after, (1, 20, "b".to_owned()));
        let second = page(items, Some(&after), 2);
        assert_eq!(ids(&second), ["c"]);
        assert_eq!(second.total, 3, "total ignores the cursor");
        assert!(second.next_cursor.is_none());
    }

    #[test]
    fn cursor_round_trips_missing_timestamps() {
        let last = item("z", WorkPriority::Low, None);
        let cursor = encode_cursor(&last);
        assert_eq!(decode_cursor(&cursor).unwrap(), sort_key(&last));
        assert_eq!(
            decode_cursor(&format!("{cursor}==")).unwrap(),
            sort_key(&last),
            "padding tolerated"
        );
    }

    #[test]
    fn garbage_cursor_is_a_validation_error_on_the_cursor_field() {
        for bad in ["not base64!", "bm90IGpzb24", "WzEsMl0"] {
            let err = decode_cursor(bad).unwrap_err();
            assert_eq!(err.code(), ab_core::ErrorCode::ValidationFailed, "{bad}");
        }
    }

    fn learner_row(state: ActivityProgressState, due_at: Option<i64>) -> LearnerWorkRow {
        LearnerWorkRow {
            progress_id: ab_core::id::ActivityProgressId::new(),
            state,
            course_id: CourseId::new(),
            course_title: "Course".to_owned(),
            activity_id: ActivityId::new(),
            activity_title: "Quiz".to_owned(),
            started_at: Some(100),
            submitted_at: Some(200),
            graded_at: Some(300),
            due_at,
            updated_at: 400,
        }
    }

    #[test]
    fn learner_items_follow_the_legacy_kind_table() {
        let now = 1_000;
        let open = learner_item(&learner_row(ActivityProgressState::InProgress, None), now);
        assert_eq!(
            (open.kind, open.priority),
            ("in_progress", WorkPriority::High)
        );
        assert_eq!(open.created_at, Some(100), "started_at");
        assert!(open.id.starts_with("learner-progress-"));
        let late = learner_item(
            &learner_row(ActivityProgressState::InProgress, Some(999)),
            now,
        );
        assert_eq!(
            (late.kind, late.priority),
            ("overdue", WorkPriority::Critical)
        );
        let waiting = learner_item(&learner_row(ActivityProgressState::NeedsGrading, None), now);
        assert_eq!(
            (waiting.kind, waiting.status, waiting.created_at),
            ("waiting_for_grade", "needs_grading", Some(200))
        );
        let returned = learner_item(&learner_row(ActivityProgressState::Returned, None), now);
        assert_eq!(returned.priority, WorkPriority::Critical);
        assert_eq!(returned.allowed_actions, ["revise", "view_feedback"]);
        let failed = learner_item(&learner_row(ActivityProgressState::Failed, None), now);
        assert_eq!(
            (failed.kind, failed.priority),
            ("feedback_released", WorkPriority::High)
        );
        assert_eq!(failed.created_at, Some(300), "graded_at");
        let passed = learner_item(&learner_row(ActivityProgressState::Passed, None), now);
        assert_eq!(passed.priority, WorkPriority::Normal);
    }

    fn teacher_row(submitted_at: Option<i64>, review_ref: Option<uuid::Uuid>) -> TeacherWorkRow {
        TeacherWorkRow {
            progress_id: ab_core::id::ActivityProgressId::new(),
            course_id: CourseId::new(),
            course_title: "Course".to_owned(),
            activity_id: ActivityId::new(),
            activity_title: "Essay".to_owned(),
            learner_display_name: "  ".to_owned(),
            learner_username: "alice".to_owned(),
            submitted_at,
            graded_at: None,
            due_at: None,
            updated_at: 400,
            review_ref,
        }
    }

    #[test]
    fn teacher_items_breach_the_sla_after_three_days() {
        let now = 10 * 86_400;
        let fresh = teacher_grading_item(&teacher_row(Some(now - 86_400), None), now);
        assert_eq!(
            (fresh.kind, fresh.priority),
            ("needs_grading", WorkPriority::High)
        );
        assert!(fresh.href.ends_with("/review"), "{}", fresh.href);
        assert_eq!(fresh.description, "alice submitted work in Course.");
        let stale = teacher_grading_item(&teacher_row(Some(now - SLA_BREACH_SECS), None), now);
        assert_eq!(
            (stale.kind, stale.priority),
            ("sla_breach", WorkPriority::Critical)
        );
        let no_time = teacher_grading_item(&teacher_row(None, None), now);
        assert_eq!(no_time.created_at, Some(400), "updated_at fallback");
    }

    #[test]
    fn release_items_need_a_graded_target() {
        assert!(teacher_release_item(&teacher_row(None, None)).is_none());
        let target = uuid::Uuid::nil();
        let item = teacher_release_item(&teacher_row(None, Some(target))).unwrap();
        assert_eq!(item.kind, "awaiting_release");
        assert_eq!(item.status, "graded_hidden");
        assert!(item.href.ends_with(&format!("?submission={target}")));
        assert!(item.id.starts_with("teacher-release-"));
    }
}
