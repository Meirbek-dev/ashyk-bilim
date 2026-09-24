//! File-submission activities (legacy `services/file_submissions.py`).
//!
//! Authoring, the learner's attempt (attach finalized uploads, submit), the
//! grader's queue and grade, signed downloads, CSV export.
//!
//! Gates mirror the legacy: authors (`assessment:author`, course creator
//! own / platform) manage; learners need course access +
//! `assessment:submit:assigned`; graders need `assessment:grade`. Read of a
//! published activity on a visible course needs `assessment:read:assigned`
//! (authors always).

use std::sync::Arc;
use std::time::Duration;

use ab_clients::storage::{Bucket, StorageClient};
use ab_core::assessments::{
    FileAttemptStatus, FileSubmissionLifecycle, GradeReleaseMode, LatePolicyKind, SubmissionStatus,
};
use ab_core::id::{
    ActivityId, ChapterId, FileAttemptFileId, FileAttemptId, FileSubmissionId, UserId,
};
use ab_core::permission::{Action, Scope};
use ab_core::{Error, ErrorCode, FieldError, Result};
use ab_db::file_submissions::{
    AttemptRow, FileRow, FileSubmissionRow, FileSubmissionValues, GradeWrite, NewFile,
};
use ab_db::uploads::UploadRow;
use serde::Serialize;
use sqlx::PgPool;
use utoipa::ToSchema;

use crate::assessments::access::DisabledReason;
use crate::assessments::service::{AssessmentsService, LatePolicy, perm};
use crate::catalog::courses::Course;
use crate::events::GradingEvents;
use crate::files::uploads::UNREFERENCED_GRACE;
use crate::grading::breakdown::round2;
use crate::grading::penalties::{apply_late, late_penalty_pct};
use crate::grading::teacher::{CsvLanguage, UserSummary, course_event_name, csv_row, iso8601};
use crate::identity::Actor;
use crate::progress::ProgressProjector;

/// Presigned download validity (legacy 1h).
pub const DOWNLOAD_TTL: Duration = Duration::from_secs(3600);
/// The upload purpose learners must use.
pub const UPLOAD_PURPOSE: &str = "file-submission";
pub const MAX_REVIEW_PAGE: i64 = 100;

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// The configuration block; `None` in a patch means "keep".
#[derive(Debug, Clone, Default)]
pub struct ConfigPatch {
    pub title: Option<String>,
    pub instructions: Option<String>,
    pub rubric: Option<serde_json::Value>,
    pub allowed_mime_types: Option<Vec<String>>,
    pub max_files: Option<i32>,
    /// `Some(None)` clears the limit.
    pub max_file_size_mb: Option<Option<i32>>,
    pub due_at: Option<Option<i64>>,
    pub allow_late: Option<bool>,
    pub late_policy: Option<LatePolicy>,
    pub max_attempts: Option<Option<i32>>,
    pub grade_release_mode: Option<GradeReleaseMode>,
    pub settings: Option<serde_json::Value>,
}

/// The activity as returned to clients (config + activity facts).
#[derive(Debug, Clone)]
pub struct FileSubmission {
    pub row: FileSubmissionRow,
    pub title: String,
    pub chapter_id: ChapterId,
    pub published: bool,
    pub late_policy: LatePolicy,
    /// The caller's attempts (newest first) when they are a learner here.
    pub attempts: Vec<Attempt>,
    /// Why the caller may not open or submit right now (quiz vocabulary;
    /// empty for authors).
    pub disabled_reasons: Vec<DisabledReason>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AttachedFile {
    pub id: FileAttemptFileId,
    pub upload_id: uuid::Uuid,
    pub filename: String,
    pub content_type: String,
    pub size_bytes: Option<i64>,
    pub position: i32,
    pub scan_status: ab_core::assessments::ScanStatus,
    pub created_at_unix: i64,
}

#[derive(Debug, Clone)]
pub struct Attempt {
    pub row: AttemptRow,
    pub files: Vec<AttachedFile>,
    pub user: Option<UserSummary>,
    /// Grade fields are visible (owner sees them only once released).
    pub grade_visible: bool,
}

#[derive(Debug, Clone)]
pub struct FileRef {
    pub upload_id: uuid::Uuid,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileGradeAction {
    Save,
    Publish,
    Return,
}

pub struct FileGradeInput {
    pub action: FileGradeAction,
    pub final_score: Option<f64>,
    /// `None` keeps the stored feedback.
    pub feedback: Option<String>,
    /// `None` keeps the stored rubric scores.
    pub rubric_scores: Option<serde_json::Value>,
    /// From `If-Match`; checked after the grading gate (UX-108).
    pub expected_version: Option<i64>,
}

pub struct ReviewFilter<'a> {
    pub status: Option<FileAttemptStatus>,
    pub search: Option<&'a str>,
    pub cursor: Option<FileAttemptId>,
    pub limit: i64,
}

#[derive(Debug, Clone)]
pub struct ReviewItem {
    pub id: FileAttemptId,
    pub user: UserSummary,
    pub status: FileAttemptStatus,
    pub attempt_number: i32,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
    pub is_late: bool,
    pub final_score: Option<f64>,
    pub version: i64,
    pub file_count: i64,
}

#[derive(Debug, Clone)]
pub struct ReviewPage {
    pub items: Vec<ReviewItem>,
    pub next_cursor: Option<FileAttemptId>,
}

#[derive(Debug, Clone)]
pub struct SignedDownload {
    pub url: String,
    pub expires_at: i64,
    pub filename: String,
    pub content_type: String,
}

#[derive(Clone)]
pub struct FileSubmissionsService {
    pool: PgPool,
    assessments: AssessmentsService,
    storage: Arc<StorageClient>,
    projector: ProgressProjector,
    /// Course-stream fan-out of hand-ins and grades; `None` without Redis.
    events: Option<GradingEvents>,
}

fn stale(expected: i64, actual: i64) -> Error {
    Error::app_with_details(
        ErrorCode::PreconditionFailed,
        "attempt changed since you loaded it",
        serde_json::json!({ "expected": expected, "actual": actual }),
    )
}

fn field(field: &str, code: &str, message: impl Into<String>) -> FieldError {
    FieldError {
        field: field.into(),
        code: code.into(),
        message: message.into(),
    }
}

fn normalize_mimes(values: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for value in values {
        let mime = value.trim().to_ascii_lowercase();
        if !mime.is_empty() && !out.contains(&mime) {
            out.push(mime);
        }
    }
    out
}

const fn late_policy_of(row: &FileSubmissionRow) -> LatePolicy {
    LatePolicy::from_columns(
        row.late_policy_kind,
        row.late_penalty_percent_per_day,
        row.late_penalty_max_days,
        row.late_cutoff_at,
    )
}

/// Legacy `FileSubmissionConfig` ranges.
fn validate_config(v: &FileSubmissionValues<'_>) -> Result<()> {
    let mut errors = Vec::new();
    if !(1..=25).contains(&v.max_files) {
        errors.push(field("max_files", "range", "between 1 and 25"));
    }
    if v.max_file_size_mb.is_some_and(|m| !(1..=500).contains(&m)) {
        errors.push(field("max_file_size_mb", "range", "between 1 and 500"));
    }
    if v.max_attempts.is_some_and(|m| !(1..=50).contains(&m)) {
        errors.push(field("max_attempts", "range", "between 1 and 50"));
    }
    if v.late_policy_kind == LatePolicyKind::Penalty {
        if v.late_penalty_percent_per_day
            .is_none_or(|p| !(0.0..=100.0).contains(&p))
        {
            errors.push(field("late_policy.percent_per_day", "range", "0..=100"));
        }
        if v.late_penalty_max_days.is_none_or(|d| d < 1) {
            errors.push(field("late_policy.max_days", "range", "at least 1"));
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(Error::validation(errors))
    }
}

impl FileSubmissionsService {
    #[must_use]
    pub fn new(pool: PgPool, assessments: AssessmentsService, storage: Arc<StorageClient>) -> Self {
        Self {
            projector: ProgressProjector::new(pool.clone()),
            pool,
            assessments,
            storage,
            events: None,
        }
    }

    #[must_use]
    pub fn with_events(mut self, events: Option<GradingEvents>) -> Self {
        self.events = events;
        self
    }

    /// Course-stream event for an attempt landing in `status`
    /// (`submission.submitted`, `grade.saved`, `grade.published`,
    /// `submission.returned`).
    async fn emit_course(&self, row: &FileSubmissionRow, attempt: &AttemptRow) {
        let Some(events) = &self.events else {
            return;
        };
        let status = match attempt.status {
            FileAttemptStatus::Submitted => SubmissionStatus::Pending,
            FileAttemptStatus::Graded => SubmissionStatus::Graded,
            FileAttemptStatus::Published => SubmissionStatus::Published,
            FileAttemptStatus::Returned => SubmissionStatus::Returned,
            FileAttemptStatus::Draft => return,
        };
        events
            .publish_best_effort(
                row.course_id,
                course_event_name(status),
                serde_json::json!({
                    "attempt_id": attempt.id, "activity_id": row.activity_id,
                    "user_id": attempt.user_id, "status": status,
                    "final_score": attempt.final_score,
                }),
            )
            .await;
    }

    // ── Loading + gates ─────────────────────────────────────────────────

    async fn load(&self, id: FileSubmissionId) -> Result<FileSubmissionRow> {
        ab_db::file_submissions::get_file_submission(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("file submission"))
    }

    /// Visible course (404 otherwise) + the given scoped action.
    async fn scoped(
        &self,
        actor: &Actor,
        row: &FileSubmissionRow,
        action: Action,
        what: &str,
    ) -> Result<Course> {
        let course = self.assessments.courses.get(actor, row.course_id).await?;
        AssessmentsService::require_scoped(actor, &course, action, what)?;
        Ok(course)
    }

    fn is_author(actor: &Actor, course: &Course) -> bool {
        AssessmentsService::require_scoped(actor, course, Action::Author, "authoring").is_ok()
    }

    /// Learner gate (legacy `_require_submit_access`): course access and
    /// `assessment:submit:assigned`; authors pass as previewers.
    async fn require_submit_access(
        &self,
        actor: &Actor,
        row: &FileSubmissionRow,
    ) -> Result<(Course, bool)> {
        let course = self.assessments.courses.get(actor, row.course_id).await?;
        if Self::is_author(actor, &course) {
            return Ok((course, true));
        }
        if !self
            .assessments
            .user_has_course_access(&course, actor.user_id)
            .await?
        {
            return Err(Error::forbidden("no access to this course"));
        }
        if !(actor.has(perm(Action::Submit, Scope::Assigned))
            || actor.has(perm(Action::Submit, Scope::Platform)))
        {
            return Err(Error::forbidden("missing permission assessment:submit"));
        }
        Ok((course, false))
    }

    /// Authors always; others only a published activity, with
    /// `assessment:read:assigned` (404 either way — no existence leak).
    async fn require_read(&self, actor: &Actor, row: &FileSubmissionRow) -> Result<Course> {
        let course = self
            .assessments
            .courses
            .get(actor, row.course_id)
            .await
            .map_err(|_| Error::not_found("file submission"))?;
        if Self::is_author(actor, &course) {
            return Ok(course);
        }
        // The curriculum toggle can hide a published config: same 404 as
        // the activity read.
        let readable = row.lifecycle == FileSubmissionLifecycle::Published
            && self.activity_published(row).await?
            && (actor.has(perm(Action::Read, Scope::Assigned))
                || actor.has(perm(Action::Read, Scope::Platform))
                || actor.has(perm(Action::Read, Scope::All)));
        if readable {
            Ok(course)
        } else {
            Err(Error::not_found("file submission"))
        }
    }

    async fn view(
        &self,
        actor: Option<&Actor>,
        row: FileSubmissionRow,
        disabled_reasons: Vec<DisabledReason>,
    ) -> Result<FileSubmission> {
        let activity = ab_db::catalog::get_activity(&self.pool, row.activity_id)
            .await?
            .ok_or_else(|| Error::not_found("activity"))?;
        let attempts = match actor {
            Some(actor) => {
                let rows =
                    ab_db::file_submissions::list_user_attempts(&self.pool, row.id, actor.user_id)
                        .await?;
                self.attempts_with_files(rows, false, true).await?
            }
            None => Vec::new(),
        };
        Ok(FileSubmission {
            late_policy: late_policy_of(&row),
            title: activity.name,
            chapter_id: activity.chapter_id,
            published: activity.published,
            row,
            attempts,
            disabled_reasons,
        })
    }

    async fn attempts_with_files(
        &self,
        rows: Vec<AttemptRow>,
        with_user: bool,
        owner_view: bool,
    ) -> Result<Vec<Attempt>> {
        let ids: Vec<FileAttemptId> = rows.iter().map(|r| r.id).collect();
        let files = ab_db::file_submissions::list_files_for_attempts(&self.pool, &ids).await?;
        let users = if with_user {
            let user_ids: Vec<UserId> = rows.iter().map(|r| r.user_id).collect();
            ab_db::identity::list_user_summaries(&self.pool, &user_ids).await?
        } else {
            Vec::new()
        };
        Ok(rows
            .into_iter()
            .map(|row| {
                let user = users
                    .iter()
                    .find(|u| u.id == row.user_id)
                    .map(|u| UserSummary {
                        id: u.id,
                        username: u.username.clone(),
                        display_name: u.display_name.clone(),
                        email: u.email.clone(),
                    });
                let grade_visible = !owner_view
                    || matches!(
                        row.status,
                        FileAttemptStatus::Published | FileAttemptStatus::Returned
                    );
                Attempt {
                    files: files
                        .iter()
                        .filter(|f| f.attempt_id == row.id)
                        .map(attached)
                        .collect(),
                    user,
                    grade_visible,
                    row,
                }
            })
            .collect())
    }

    async fn attempt_view(
        &self,
        row: AttemptRow,
        with_user: bool,
        owner_view: bool,
    ) -> Result<Attempt> {
        self.attempts_with_files(vec![row], with_user, owner_view)
            .await?
            .pop()
            .ok_or_else(|| Error::not_found("attempt"))
    }

    // ── Authoring ───────────────────────────────────────────────────────

    /// Create the activity + configuration in a chapter (authors).
    pub async fn create(
        &self,
        actor: &Actor,
        chapter_id: ChapterId,
        title: &str,
        patch: ConfigPatch,
    ) -> Result<FileSubmission> {
        let chapter = self
            .assessments
            .authorable_chapter(actor, chapter_id)
            .await?;
        let title = ab_core::required_str("title", title)?;
        let defaults = FileSubmissionRow {
            id: FileSubmissionId::default(),
            activity_id: ActivityId::default(),
            course_id: chapter.course_id,
            instructions: String::new(),
            rubric: serde_json::json!({}),
            allowed_mime_types: Vec::new(),
            max_files: 1,
            max_file_size_mb: None,
            due_at: None,
            allow_late: true,
            late_policy_kind: LatePolicyKind::None,
            late_penalty_percent_per_day: None,
            late_penalty_max_days: None,
            late_cutoff_at: None,
            max_attempts: None,
            grade_release_mode: GradeReleaseMode::Immediate,
            lifecycle: FileSubmissionLifecycle::Draft,
            published_at: None,
            archived_at: None,
            settings: serde_json::json!({}),
            creator_id: Some(actor.user_id),
            created_at: 0,
            updated_at: 0,
        };
        let merged = merge(&defaults, &patch);
        let values = values_of(&merged);
        validate_config(&values)?;
        // BUG-233: activity + config in one tx (see `AssessmentsService::create`).
        let mut tx = self.pool.begin().await?;
        let activity_id = ab_db::catalog::insert_activity(
            &mut *tx,
            chapter_id,
            chapter.course_id,
            title,
            "file_submission",
            "file_submission_standard",
            actor.user_id,
        )
        .await?;
        let id = ab_db::file_submissions::insert_file_submission(
            &mut *tx,
            activity_id,
            chapter.course_id,
            actor.user_id,
            values,
        )
        .await?;
        tx.commit().await?;
        let row = self.load(id).await?;
        self.view(None, row, Vec::new()).await
    }

    /// Authors always; learners a published activity on a visible course.
    pub async fn get(&self, actor: &Actor, id: FileSubmissionId) -> Result<FileSubmission> {
        let row = self.load(id).await?;
        let course = self.require_read(actor, &row).await?;
        let reasons = self.disabled_reasons(actor, &course, &row).await?;
        self.view(Some(actor), row, reasons).await
    }

    pub async fn get_by_activity(
        &self,
        actor: &Actor,
        activity_id: ActivityId,
    ) -> Result<FileSubmission> {
        let row = ab_db::file_submissions::get_file_submission_by_activity(&self.pool, activity_id)
            .await?
            .ok_or_else(|| Error::not_found("file submission"))?;
        let course = self.require_read(actor, &row).await?;
        let reasons = self.disabled_reasons(actor, &course, &row).await?;
        self.view(Some(actor), row, reasons).await
    }

    /// Partial update (authors); archived activities are read-only.
    ///
    /// BUG-229/230: every gate reads the config row under its lock (a
    /// concurrent publish sees this edit or refuses on it), and the title
    /// and config land in one transaction — a refused PATCH writes nothing.
    pub async fn update(
        &self,
        actor: &Actor,
        id: FileSubmissionId,
        patch: ConfigPatch,
    ) -> Result<FileSubmission> {
        let row = self.load(id).await?;
        self.scoped(actor, &row, Action::Author, "authoring")
            .await?;
        let title = patch
            .title
            .as_deref()
            .map(|t| ab_core::required_str("title", t))
            .transpose()?;
        let mut tx = self.pool.begin().await?;
        let row = self.lock(&mut tx, id).await?;
        if row.lifecycle == FileSubmissionLifecycle::Archived {
            return Err(Error::conflict("archived file submissions are read-only"));
        }
        let merged = merge(&row, &patch);
        let values = values_of(&merged);
        validate_config(&values)?;
        // BUG-219: a published config passed the publish gate (title +
        // instructions); an edit must not undo it — 409 like BUG-207. The
        // title patch above is already non-blank.
        if row.lifecycle == FileSubmissionLifecycle::Published
            && ab_core::trim_blank(&merged.instructions).is_empty()
        {
            return Err(Error::app_with_details(
                ErrorCode::Conflict,
                "the change would make a published file submission unready; unpublish first",
                serde_json::json!({ "readiness": ["file-submission.instructions_missing"] }),
            ));
        }
        if let Some(title) = title {
            ab_db::catalog::update_activity(&mut *tx, row.activity_id, Some(title), None).await?;
        }
        ab_db::file_submissions::update_file_submission(&mut *tx, id, values).await?;
        tx.commit().await?;
        let row = self.load(id).await?;
        self.view(None, row, Vec::new()).await
    }

    async fn lock(
        &self,
        tx: &mut sqlx::PgConnection,
        id: FileSubmissionId,
    ) -> Result<FileSubmissionRow> {
        ab_db::file_submissions::lock_file_submission(tx, id)
            .await?
            .ok_or_else(|| Error::not_found("file submission"))
    }

    /// Publish: title and instructions required; the activity goes live.
    ///
    /// The gate runs on the locked row (BUG-229) and the lifecycle and the
    /// activity flag flip in the same transaction (BUG-232): a client that
    /// hangs up never leaves them disagreeing.
    pub async fn publish(&self, actor: &Actor, id: FileSubmissionId) -> Result<FileSubmission> {
        let row = self.load(id).await?;
        self.scoped(actor, &row, Action::Author, "publishing")
            .await?;
        let activity = ab_db::catalog::get_activity(&self.pool, row.activity_id)
            .await?
            .ok_or_else(|| Error::not_found("activity"))?;
        let mut tx = self.pool.begin().await?;
        let row = self.lock(&mut tx, id).await?;
        let mut errors = Vec::new();
        if ab_core::trim_blank(&activity.name).is_empty() {
            errors.push(field("title", "required", "title is required to publish"));
        }
        if ab_core::trim_blank(&row.instructions).is_empty() {
            errors.push(field(
                "instructions",
                "required",
                "instructions are required to publish",
            ));
        }
        if !errors.is_empty() {
            return Err(Error::validation(errors));
        }
        ab_db::file_submissions::set_file_submission_lifecycle(
            &mut *tx,
            id,
            FileSubmissionLifecycle::Published,
        )
        .await?;
        ab_db::catalog::update_activity(&mut *tx, row.activity_id, None, Some(true)).await?;
        tx.commit().await?;
        self.projector
            .recalculate_course_for_all(row.course_id)
            .await?;
        let row = self.load(id).await?;
        self.view(None, row, Vec::new()).await
    }

    // ── Learner attempts ────────────────────────────────────────────────

    /// Learner-write gate: an unpublished config is a 409 (BUG-114); a
    /// published one whose activity the curriculum toggle hid is 404 for
    /// non-authors, same as the read (UX-105).
    async fn require_open(&self, row: &FileSubmissionRow, is_author: bool) -> Result<()> {
        if row.lifecycle != FileSubmissionLifecycle::Published {
            return Err(Error::conflict("file submission is not published"));
        }
        self.require_visible(row, is_author).await
    }

    /// A hidden activity does not exist for learners — reads and writes
    /// alike (UX-108).
    async fn require_visible(&self, row: &FileSubmissionRow, is_author: bool) -> Result<()> {
        if !is_author && !self.activity_published(row).await? {
            return Err(Error::not_found("file submission"));
        }
        Ok(())
    }

    /// Why a learner cannot open or submit right now — the quiz rules
    /// (`attempt_state`): a closed deadline (BUG-166) and an unpassed
    /// gate-mode remediation (BUG-140 / UX-105). Authors are never blocked.
    async fn disabled_reasons(
        &self,
        actor: &Actor,
        course: &Course,
        row: &FileSubmissionRow,
    ) -> Result<Vec<DisabledReason>> {
        if Self::is_author(actor, course) {
            return Ok(Vec::new());
        }
        let mut reasons = Vec::new();
        if !row.allow_late && row.due_at.is_some_and(|due| now_unix() > due) {
            reasons.push(DisabledReason::PastDue);
        }
        if ab_db::ai::active_remediation_gate(&self.pool, actor.user_id, row.activity_id)
            .await?
            .is_some()
        {
            reasons.push(DisabledReason::RemediationRequired);
        }
        Ok(reasons)
    }

    /// 403 `cannot start: <REASONS>` — the same vocabulary as the quiz
    /// start/submit, so the web renders the localized blocked card.
    async fn require_can_act(
        &self,
        actor: &Actor,
        course: &Course,
        row: &FileSubmissionRow,
    ) -> Result<()> {
        let reasons = self.disabled_reasons(actor, course, row).await?;
        if reasons.is_empty() {
            return Ok(());
        }
        Err(Error::forbidden(format!(
            "cannot start: {}",
            reasons
                .iter()
                .map(|r| r.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )))
    }

    async fn activity_published(&self, row: &FileSubmissionRow) -> Result<bool> {
        Ok(ab_db::catalog::get_activity(&self.pool, row.activity_id)
            .await?
            .is_some_and(|a| a.published))
    }

    /// The learner's open attempt (draft or returned), if any.
    pub async fn draft(&self, actor: &Actor, id: FileSubmissionId) -> Result<Option<Attempt>> {
        let row = self.load(id).await?;
        let (_, is_author) = self.require_submit_access(actor, &row).await?;
        self.require_visible(&row, is_author).await?;
        match ab_db::file_submissions::open_attempt(&self.pool, id, actor.user_id).await? {
            Some(attempt) => Ok(Some(self.attempt_view(attempt, false, true).await?)),
            None => Ok(None),
        }
    }

    /// Open a draft (idempotent). Returns (attempt, created).
    pub async fn start(&self, actor: &Actor, id: FileSubmissionId) -> Result<(Attempt, bool)> {
        let row = self.load(id).await?;
        let (course, is_author) = self.require_submit_access(actor, &row).await?;
        self.require_open(&row, is_author).await?;
        // Blocked learners neither open nor resume a draft (the web shows
        // the blocked card / remediation gate on this 403).
        self.require_can_act(actor, &course, &row).await?;
        if let Some(open) =
            ab_db::file_submissions::open_attempt(&self.pool, id, actor.user_id).await?
        {
            return Ok((self.attempt_view(open, false, true).await?, false));
        }
        let attempt = self.open_new_attempt(&row, actor).await?;
        self.projector
            .after_file_attempt(row.id, actor.user_id)
            .await;
        Ok((self.attempt_view(attempt, false, true).await?, true))
    }

    async fn open_new_attempt(&self, row: &FileSubmissionRow, actor: &Actor) -> Result<AttemptRow> {
        let user_id = actor.user_id;
        let completed =
            ab_db::file_submissions::count_completed_attempts(&self.pool, row.id, user_id).await?;
        if let Some(max) = row.max_attempts
            && completed >= i64::from(max)
        {
            return Err(Error::app_with_details(
                ErrorCode::Conflict,
                "maximum number of attempts reached",
                serde_json::json!({ "completed_attempts": completed, "max_attempts": max }),
            ));
        }
        let number = i32::try_from(completed)
            .unwrap_or(i32::MAX)
            .saturating_add(1);
        let id = ab_db::file_submissions::insert_attempt(
            &self.pool,
            row.id,
            row.course_id,
            user_id,
            number,
        )
        .await?;
        let Some(id) = id else {
            return ab_db::file_submissions::open_attempt(&self.pool, row.id, user_id)
                .await?
                .ok_or_else(|| Error::not_found("attempt"));
        };
        ab_db::file_submissions::get_attempt(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("attempt"))
    }

    /// Replace the draft's files (opens a draft when there is none).
    pub async fn save_draft(
        &self,
        actor: &Actor,
        id: FileSubmissionId,
        files: &[FileRef],
        expected_version: Option<i64>,
    ) -> Result<Attempt> {
        let row = self.load(id).await?;
        let (course, is_author) = self.require_submit_access(actor, &row).await?;
        self.require_open(&row, is_author).await?;
        // UX-115: an open draft is frozen too once the deadline closed or a
        // gate is active — 403, the stored files untouched.
        self.require_can_act(actor, &course, &row).await?;
        let uploads = self.validate_files(&row, actor, files).await?;
        let attempt =
            match ab_db::file_submissions::open_attempt(&self.pool, id, actor.user_id).await? {
                Some(a) => a,
                None => self.open_new_attempt(&row, actor).await?,
            };
        if let Some(expected) = expected_version
            && expected != attempt.version
        {
            return Err(stale(expected, attempt.version));
        }
        self.replace_files(&attempt, files, &uploads).await?;
        self.projector
            .after_file_attempt(row.id, actor.user_id)
            .await;
        let fresh = ab_db::file_submissions::get_attempt(&self.pool, attempt.id)
            .await?
            .ok_or_else(|| Error::not_found("attempt"))?;
        self.attempt_view(fresh, false, true).await
    }

    /// Validate uploads (legacy `_replace_attempt_files`): count, duplicates,
    /// ownership + finalized + purpose, mime allowlist, size cap. Runs before
    /// an attempt is opened so a rejected body never spends one (BUG-204).
    async fn validate_files(
        &self,
        row: &FileSubmissionRow,
        actor: &Actor,
        files: &[FileRef],
    ) -> Result<Vec<UploadRow>> {
        let count = i32::try_from(files.len()).unwrap_or(i32::MAX);
        if count > row.max_files {
            return Err(Error::validation(vec![field(
                "files",
                "too-many",
                format!("at most {} file(s)", row.max_files),
            )]));
        }
        let mut seen = Vec::new();
        let mut uploads = Vec::with_capacity(files.len());
        for file in files {
            if seen.contains(&file.upload_id) {
                return Err(Error::validation(vec![field(
                    "files",
                    "duplicate",
                    format!("upload {} is attached twice", file.upload_id),
                )]));
            }
            seen.push(file.upload_id);
            let upload = ab_db::uploads::get_upload(&self.pool, file.upload_id).await?;
            let Some(upload) = upload.filter(|u| {
                u.created_by == actor.user_id
                    && u.status == "finalized"
                    && u.purpose == UPLOAD_PURPOSE
            }) else {
                return Err(Error::validation(vec![field(
                    "files",
                    "upload-not-ready",
                    format!(
                        "upload {} is not a finalized file-submission upload of yours",
                        file.upload_id
                    ),
                )]));
            };
            if !row.allowed_mime_types.is_empty()
                && !row
                    .allowed_mime_types
                    .contains(&upload.mime.to_ascii_lowercase())
            {
                return Err(Error::app_with_details(
                    ErrorCode::ValidationFailed,
                    "this file type is not allowed here",
                    serde_json::json!({
                        "content_type": upload.mime, "allowed_mime_types": row.allowed_mime_types,
                    }),
                ));
            }
            if let Some(max_mb) = row.max_file_size_mb
                && upload.size_bytes > i64::from(max_mb) * 1024 * 1024
            {
                return Err(Error::app_with_details(
                    ErrorCode::PayloadTooLarge,
                    "the uploaded file is too large for this activity",
                    serde_json::json!({ "size_bytes": upload.size_bytes, "max_file_size_mb": max_mb }),
                ));
            }
            uploads.push(upload);
        }
        Ok(uploads)
    }

    /// Attach validated uploads; reference counts move from the old set to
    /// the new one. BUG-241: the version bump (the attempt's lock), the file
    /// rows and the counts land in one transaction — a dropped request or a
    /// lost race leaves no file row without its reference. Returns the new
    /// version; a stale one is 412 with nothing changed.
    async fn replace_files(
        &self,
        attempt: &AttemptRow,
        files: &[FileRef],
        uploads: &[UploadRow],
    ) -> Result<i64> {
        let mut tx = self.pool.begin().await?;
        if !ab_db::file_submissions::touch_attempt(&mut *tx, attempt.id, attempt.version).await? {
            tx.rollback().await?;
            let latest = ab_db::file_submissions::get_attempt(&self.pool, attempt.id)
                .await?
                .ok_or_else(|| Error::not_found("attempt"))?;
            return Err(stale(attempt.version, latest.version));
        }
        let previous = ab_db::file_submissions::list_files(&mut *tx, attempt.id).await?;
        // BUG-258: every upload this swap touches is locked in key order
        // before the file rows (FK) and the counts move — two drafts
        // swapping shared uploads otherwise lock them in list order.
        let touched: Vec<uuid::Uuid> = previous
            .iter()
            .map(|f| f.upload_id)
            .chain(uploads.iter().map(|u| u.id))
            .collect();
        ab_db::uploads::lock_in_key_order(&mut tx, &touched).await?;
        let new_files: Vec<NewFile<'_>> = files
            .iter()
            .zip(uploads)
            .map(|(file, upload)| NewFile {
                upload_id: upload.id,
                display_name: file
                    .display_name
                    .as_deref()
                    .filter(|n| !n.trim().is_empty())
                    .unwrap_or_else(|| upload.key.rsplit('/').next().unwrap_or(&upload.key)),
                content_type: &upload.mime,
                size_bytes: Some(upload.size_bytes),
                storage_key: &upload.key,
            })
            .collect();
        ab_db::file_submissions::replace_files(&mut tx, attempt.id, &new_files).await?;
        for old in &previous {
            if !uploads.iter().any(|u| u.id == old.upload_id) {
                ab_db::uploads::release_reference(
                    &mut *tx,
                    old.upload_id,
                    UNREFERENCED_GRACE.as_secs_f64(),
                )
                .await?;
            }
        }
        for upload in uploads {
            if !previous.iter().any(|p| p.upload_id == upload.id) {
                ab_db::uploads::add_reference(&mut *tx, upload.id).await?;
            }
        }
        tx.commit().await?;
        Ok(attempt.version + 1)
    }

    /// Submit the open attempt (optionally replacing files first). At least
    /// one file; late work refused when `allow_late` is off, penalised by the
    /// late policy otherwise.
    pub async fn submit(
        &self,
        actor: &Actor,
        id: FileSubmissionId,
        files: Option<&[FileRef]>,
        expected_version: Option<i64>,
    ) -> Result<Attempt> {
        let row = self.load(id).await?;
        let (course, is_author) = self.require_submit_access(actor, &row).await?;
        self.require_open(&row, is_author).await?;
        // BUG-166: a closed deadline (or a gate) refuses the submit with the
        // quiz's 403 vocabulary; the draft stays intact.
        self.require_can_act(actor, &course, &row).await?;
        let files_required =
            || Error::validation(vec![field("files", "required", "attach at least one file")]);
        let uploads = match files {
            Some(files) => Some(self.validate_files(&row, actor, files).await?),
            None => None,
        };
        let mut attempt =
            match ab_db::file_submissions::open_attempt(&self.pool, id, actor.user_id).await? {
                Some(a) => a,
                // A bare submit must not spend an attempt on an empty draft (BUG-137).
                None if files.is_none_or(<[FileRef]>::is_empty) => return Err(files_required()),
                None => self.open_new_attempt(&row, actor).await?,
            };
        if let Some(expected) = expected_version
            && expected != attempt.version
        {
            return Err(stale(expected, attempt.version));
        }
        let version = match (files, &uploads) {
            (Some(files), Some(uploads)) => self.replace_files(&attempt, files, uploads).await?,
            _ => attempt.version,
        };
        if ab_db::file_submissions::list_files(&self.pool, attempt.id)
            .await?
            .is_empty()
        {
            return Err(files_required());
        }
        let now = now_unix();
        let is_late = row.due_at.is_some_and(|due| now > due);
        let penalty = late_penalty_pct(late_policy_of(&row), row.due_at, now, row.allow_late);
        if !ab_db::file_submissions::submit_attempt(
            &self.pool, attempt.id, version, is_late, penalty,
        )
        .await?
        {
            let latest = ab_db::file_submissions::get_attempt(&self.pool, attempt.id)
                .await?
                .ok_or_else(|| Error::not_found("attempt"))?;
            return Err(stale(version, latest.version));
        }
        self.projector
            .after_file_attempt(row.id, actor.user_id)
            .await;
        attempt = ab_db::file_submissions::get_attempt(&self.pool, attempt.id)
            .await?
            .ok_or_else(|| Error::not_found("attempt"))?;
        self.emit_course(&row, &attempt).await;
        self.attempt_view(attempt, false, true).await
    }

    /// Every attempt of the caller, newest first.
    pub async fn my_attempts(&self, actor: &Actor, id: FileSubmissionId) -> Result<Vec<Attempt>> {
        let row = self.load(id).await?;
        let (_, is_author) = self.require_submit_access(actor, &row).await?;
        self.require_visible(&row, is_author).await?;
        let rows =
            ab_db::file_submissions::list_user_attempts(&self.pool, id, actor.user_id).await?;
        self.attempts_with_files(rows, false, true).await
    }

    // ── Grading ─────────────────────────────────────────────────────────

    pub async fn review_queue(
        &self,
        actor: &Actor,
        id: FileSubmissionId,
        filter: ReviewFilter<'_>,
    ) -> Result<ReviewPage> {
        let row = self.load(id).await?;
        self.scoped(actor, &row, Action::Grade, "grading").await?;
        let limit = ab_core::page_limit(filter.limit, MAX_REVIEW_PAGE)?;
        let mut rows = ab_db::file_submissions::list_for_review(
            &self.pool,
            id,
            filter.status,
            filter.search,
            filter.cursor,
            limit + 1,
        )
        .await?;
        let page = usize::try_from(limit).unwrap_or(usize::MAX);
        let next_cursor = if rows.len() > page {
            rows.truncate(page);
            rows.last().map(|r| r.id)
        } else {
            None
        };
        Ok(ReviewPage {
            items: rows
                .into_iter()
                .map(|r| ReviewItem {
                    id: r.id,
                    user: UserSummary {
                        id: r.user_id,
                        username: r.username,
                        display_name: r.display_name,
                        email: r.email,
                    },
                    status: r.status,
                    attempt_number: r.attempt_number,
                    submitted_at: r.submitted_at,
                    graded_at: r.graded_at,
                    is_late: r.is_late,
                    final_score: r.final_score,
                    version: r.version,
                    file_count: r.file_count,
                })
                .collect(),
            next_cursor,
        })
    }

    /// One attempt: its owner (grade redacted until released) or a grader.
    pub async fn attempt(&self, actor: &Actor, id: FileAttemptId) -> Result<Attempt> {
        let attempt = ab_db::file_submissions::get_attempt(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("attempt"))?;
        let row = self.load(attempt.file_submission_id).await?;
        if attempt.user_id == actor.user_id {
            self.require_submit_access(actor, &row).await?;
            return self.attempt_view(attempt, false, true).await;
        }
        self.scoped(actor, &row, Action::Grade, "grading")
            .await
            .map_err(|_| Error::not_found("attempt"))?;
        self.attempt_view(attempt, true, false).await
    }

    /// Save / publish / return a grade under the `version` lock. A score is
    /// required unless the work is returned.
    pub async fn grade(
        &self,
        actor: &Actor,
        id: FileAttemptId,
        input: FileGradeInput,
    ) -> Result<Attempt> {
        let attempt = ab_db::file_submissions::get_attempt(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("attempt"))?;
        let row = self.load(attempt.file_submission_id).await?;
        // UX-134: a stranger gets the unknown-id 404, not a 403 that
        // confirms another learner's attempt id (the owner keeps the 403).
        self.scoped(actor, &row, Action::Grade, "grading")
            .await
            .map_err(|err| match err {
                Error::App {
                    code: ErrorCode::Forbidden,
                    ..
                } if attempt.user_id != actor.user_id => Error::not_found("attempt"),
                other => other,
            })?;
        // UX-108: the grading gate answers before the header is validated.
        let expected_version = input.expected_version.ok_or_else(|| {
            Error::validation(vec![field(
                "If-Match",
                "required",
                "If-Match with the attempt's current version is required",
            )])
        })?;
        if attempt.status == FileAttemptStatus::Draft {
            return Err(Error::conflict("an open draft cannot be graded"));
        }
        if attempt.version != expected_version {
            return Err(stale(expected_version, attempt.version));
        }
        let status = match input.action {
            FileGradeAction::Save => FileAttemptStatus::Graded,
            FileGradeAction::Publish => FileAttemptStatus::Published,
            FileGradeAction::Return => FileAttemptStatus::Returned,
        };
        // Same rule as assessment submissions: a released grade is final
        // (re-publishing is allowed, retracting it is not).
        if attempt.status == FileAttemptStatus::Published && status != FileAttemptStatus::Published
        {
            return Err(Error::validation(vec![field(
                "action",
                "transition-not-allowed",
                format!("cannot move a published attempt to {status}"),
            )]));
        }
        if status != FileAttemptStatus::Returned && input.final_score.is_none() {
            return Err(Error::validation(vec![field(
                "final_score",
                "required",
                "a final score is required to save or publish a grade",
            )]));
        }
        if input
            .final_score
            .is_some_and(|s| !(0.0..=100.0).contains(&s))
        {
            return Err(Error::validation(vec![field(
                "final_score",
                "range",
                "0..=100",
            )]));
        }
        // UX-121: the stored late penalty applies like on quizzes; the raw
        // score is kept (to the cent, like a quiz grade) so a re-save of the
        // form never penalises twice.
        let raw_score = input.final_score.map(round2);
        let write = GradeWrite {
            status,
            raw_score,
            final_score: raw_score.map(|s| apply_late(s, attempt.late_penalty_pct)),
            feedback: input.feedback.as_deref().map(str::trim),
            rubric_scores: input.rubric_scores.as_ref(),
            graded_by: actor.user_id,
        };
        if !ab_db::file_submissions::grade_attempt(&self.pool, id, expected_version, write).await? {
            let latest = ab_db::file_submissions::get_attempt(&self.pool, id)
                .await?
                .ok_or_else(|| Error::not_found("attempt"))?;
            return Err(stale(expected_version, latest.version));
        }
        self.projector
            .reproject_file_attempt(attempt.file_submission_id, attempt.user_id)
            .await;
        let fresh = ab_db::file_submissions::get_attempt(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("attempt"))?;
        self.emit_course(&row, &fresh).await;
        self.attempt_view(fresh, true, false).await
    }

    /// CSV of every attempt (graders); header and status / yes-no words
    /// follow `language`, BOM first (UX-108, like the grading exports).
    pub async fn export_csv(
        &self,
        actor: &Actor,
        id: FileSubmissionId,
        language: CsvLanguage,
    ) -> Result<String> {
        let row = self.load(id).await?;
        self.scoped(actor, &row, Action::Grade, "grading").await?;
        let attempts = ab_db::file_submissions::list_attempts(&self.pool, id).await?;
        let views = self.attempts_with_files(attempts, true, false).await?;
        let header: Vec<String> = language
            .file_header()
            .iter()
            .map(|s| (*s).to_owned())
            .collect();
        let mut out = String::from("\u{feff}");
        out.push_str(&csv_row(&header));
        for a in views {
            let user = a.user.unwrap_or(UserSummary {
                id: a.row.user_id,
                username: String::new(),
                display_name: String::new(),
                email: String::new(),
            });
            let fields = [
                a.row.id.to_string(),
                if user.display_name.is_empty() {
                    user.username
                } else {
                    user.display_name
                },
                user.email,
                language.file_status(a.row.status).to_owned(),
                a.row.attempt_number.to_string(),
                a.row.submitted_at.map(iso8601).unwrap_or_default(),
                language.yes_no(a.row.is_late).to_owned(),
                a.row.late_penalty_pct.to_string(),
                a.row.final_score.map(|s| s.to_string()).unwrap_or_default(),
                a.files.len().to_string(),
            ];
            out.push_str(&csv_row(&fields));
        }
        Ok(out)
    }

    /// Short-lived download URL for an attached file: its owner or a grader.
    pub async fn download(&self, actor: &Actor, id: FileAttemptFileId) -> Result<SignedDownload> {
        let file = ab_db::file_submissions::get_file(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("file"))?;
        let attempt = ab_db::file_submissions::get_attempt(&self.pool, file.attempt_id)
            .await?
            .ok_or_else(|| Error::not_found("attempt"))?;
        let row = self.load(attempt.file_submission_id).await?;
        if attempt.user_id == actor.user_id {
            self.require_submit_access(actor, &row).await?;
        } else {
            self.scoped(actor, &row, Action::Grade, "grading")
                .await
                .map_err(|_| Error::not_found("file"))?;
        }
        let url = self.storage.presign_get(
            Bucket::Private,
            &file.storage_key,
            Some(&file.display_name),
            DOWNLOAD_TTL,
        )?;
        Ok(SignedDownload {
            url,
            expires_at: now_unix() + i64::try_from(DOWNLOAD_TTL.as_secs()).unwrap_or(3600),
            filename: file.display_name,
            content_type: file.content_type,
        })
    }
}

fn attached(f: &FileRow) -> AttachedFile {
    AttachedFile {
        id: f.id,
        upload_id: f.upload_id,
        filename: f.display_name.clone(),
        content_type: f.content_type.clone(),
        size_bytes: f.size_bytes,
        position: f.position,
        scan_status: f.scan_status,
        created_at_unix: f.created_at,
    }
}

/// Apply a patch on top of the current row.
fn merge(row: &FileSubmissionRow, patch: &ConfigPatch) -> FileSubmissionRow {
    let mut out = row.clone();
    if let Some(v) = &patch.instructions {
        out.instructions.clone_from(v);
    }
    if let Some(v) = &patch.rubric {
        out.rubric.clone_from(v);
    }
    if let Some(v) = &patch.allowed_mime_types {
        out.allowed_mime_types = normalize_mimes(v);
    }
    if let Some(v) = patch.max_files {
        out.max_files = v;
    }
    if let Some(v) = patch.max_file_size_mb {
        out.max_file_size_mb = v;
    }
    if let Some(v) = patch.due_at {
        out.due_at = v;
    }
    if let Some(v) = patch.allow_late {
        out.allow_late = v;
    }
    if let Some(policy) = patch.late_policy {
        let (kind, percent, days, cutoff) = match policy {
            LatePolicy::None => (LatePolicyKind::None, None, None, None),
            LatePolicy::Penalty {
                percent_per_day,
                max_days,
            } => (
                LatePolicyKind::Penalty,
                Some(percent_per_day),
                Some(max_days),
                None,
            ),
            LatePolicy::Cutoff { cutoff_at } => {
                (LatePolicyKind::Cutoff, None, None, Some(cutoff_at))
            }
        };
        out.late_policy_kind = kind;
        out.late_penalty_percent_per_day = percent;
        out.late_penalty_max_days = days;
        out.late_cutoff_at = cutoff;
    }
    if let Some(v) = patch.max_attempts {
        out.max_attempts = v;
    }
    if let Some(v) = patch.grade_release_mode {
        out.grade_release_mode = v;
    }
    if let Some(v) = &patch.settings {
        out.settings.clone_from(v);
    }
    out
}

fn values_of(row: &FileSubmissionRow) -> FileSubmissionValues<'_> {
    FileSubmissionValues {
        instructions: &row.instructions,
        rubric: &row.rubric,
        allowed_mime_types: &row.allowed_mime_types,
        max_files: row.max_files,
        max_file_size_mb: row.max_file_size_mb,
        due_at: row.due_at,
        allow_late: row.allow_late,
        late_policy_kind: row.late_policy_kind,
        late_penalty_percent_per_day: row.late_penalty_percent_per_day,
        late_penalty_max_days: row.late_penalty_max_days,
        late_cutoff_at: row.late_cutoff_at,
        max_attempts: row.max_attempts,
        grade_release_mode: row.grade_release_mode,
        settings: &row.settings,
    }
}
