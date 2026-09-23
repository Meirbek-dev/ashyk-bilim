//! Assessment authoring: create (with the backing activity), detail reads,
//! wholesale policy replacement, lifecycle transitions gated by readiness,
//! item CRUD with the legacy lock rules, audit trail.
//!
//! Access (ported from `_shared.py`): author = `assessment:author:platform`
//! or course creator with `assessment:author:own`; publish likewise with
//! `publish`; read = author, or a published assessment on a course the actor
//! can see plus `assessment:read:assigned`.

use ab_core::assessments::{
    AssessmentKind, CompletionRule, GradeReleaseMode, GradingMode, GradingType, ItemKind,
    LatePolicyKind, Lifecycle, ReviewVisibility,
};
use ab_core::id::{ActivityId, AssessmentId, AssessmentItemId, ChapterId, CourseId, UserId};
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, FieldError, Result};
use ab_db::assessments::{ItemMetadata, NewAssessment, PolicyValues};
use sqlx::PgPool;

pub use ab_db::assessments::{AssessmentRow as Assessment, AuditEventRow as AuditEvent};

use crate::assessments::items::{self, ItemBody, ReadinessIssue, normalize_tags};
use crate::catalog::courses::{Course, CoursesService};
use crate::identity::Actor;
use crate::progress::ProgressProjector;

/// Legacy `ITEM_LIMIT_EXCEEDED` ceiling.
pub const MAX_ITEMS: i64 = 200;
/// BUG-208: per-item score ceiling (the DTO enforces it too); readiness
/// catches legacy rows. `!(x > 0 && x <= MAX)` also rejects NaN.
pub const MAX_ITEM_SCORE: f64 = 10_000.0;

/// Archived and scheduled assessments are read-only; a published one with
/// any submission cannot be edited (BUG-162). Shared with the curriculum
/// rename path (UX-120), which writes the title through the activity.
pub(crate) async fn ensure_editable(pool: &PgPool, assessment: &Assessment) -> Result<()> {
    match assessment.lifecycle {
        Lifecycle::Archived => Err(Error::conflict("archived assessments are read-only")),
        Lifecycle::Published => {
            let activity = ab_db::assessments::submission_activity(pool, assessment.id).await?;
            if activity.any {
                return Err(Error::conflict(
                    "published assessment already has submissions; unpublish first",
                ));
            }
            Ok(())
        }
        // BUG-162: a schedule was readiness-checked at schedule time;
        // edits would bypass that gate, so it is read-only until unscheduled.
        Lifecycle::Scheduled => Err(Error::conflict(
            "scheduled assessments are read-only; unschedule first",
        )),
        Lifecycle::Draft => Ok(()),
    }
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// The viewer and an item/assessment id folded into 64 bits: enough for a
/// per-learner order that survives reloads.
#[allow(clippy::cast_possible_truncation, reason = "a seed, not a value")]
const fn shuffle_seed(user_id: UserId, id: uuid::Uuid) -> u64 {
    let mix = user_id.0.as_u128() ^ id.as_u128().rotate_left(64);
    (mix ^ (mix >> 64)) as u64
}

pub(crate) const fn perm(action: Action, scope: Scope) -> Permission {
    Permission {
        resource: ResourceType::Assessment,
        action,
        scope: Some(scope),
    }
}

/// An item with its body parsed (corrupt rows are an internal error — the
/// write path validates every body).
#[derive(Debug, Clone)]
pub struct Item {
    pub id: AssessmentItemId,
    pub position: i32,
    pub kind: ItemKind,
    pub title: String,
    pub body: ItemBody,
    pub max_score: f64,
    pub section_label: Option<String>,
    pub difficulty: Option<ab_core::assessments::Difficulty>,
    pub tags: Vec<String>,
    pub outcome_ids: Vec<String>,
    pub estimated_minutes: Option<i32>,
}

impl TryFrom<ab_db::assessments::ItemRow> for Item {
    type Error = Error;

    fn try_from(row: ab_db::assessments::ItemRow) -> Result<Self> {
        let body = ItemBody::from_stored(&row.body)
            .map_err(|err| Error::internal(format!("corrupt body on item {}", row.id), err))?;
        Ok(Self {
            id: row.id,
            position: row.position,
            kind: row.kind,
            title: row.title,
            body,
            max_score: row.max_score,
            section_label: row.section_label,
            difficulty: row.difficulty,
            tags: row.tags,
            outcome_ids: row.outcome_ids,
            estimated_minutes: row.estimated_minutes,
        })
    }
}

#[derive(Debug, Clone)]
pub struct AssessmentDetail {
    pub assessment: Assessment,
    pub items: Vec<Item>,
}

/// Late-submission handling, the typed face of the four `late_*` columns.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LatePolicy {
    None,
    Penalty { percent_per_day: f64, max_days: i32 },
    Cutoff { cutoff_at: i64 },
}

impl LatePolicy {
    #[must_use]
    pub const fn from_columns(
        kind: LatePolicyKind,
        percent_per_day: Option<f64>,
        max_days: Option<i32>,
        cutoff_at: Option<i64>,
    ) -> Self {
        match (kind, percent_per_day, max_days, cutoff_at) {
            (LatePolicyKind::Penalty, Some(percent_per_day), Some(max_days), _) => Self::Penalty {
                percent_per_day,
                max_days,
            },
            (LatePolicyKind::Cutoff, _, _, Some(cutoff_at)) => Self::Cutoff { cutoff_at },
            _ => Self::None,
        }
    }

    const fn columns(self) -> (LatePolicyKind, Option<f64>, Option<i32>, Option<i64>) {
        match self {
            Self::None => (LatePolicyKind::None, None, None, None),
            Self::Penalty {
                percent_per_day,
                max_days,
            } => (
                LatePolicyKind::Penalty,
                Some(percent_per_day),
                Some(max_days),
                None,
            ),
            Self::Cutoff { cutoff_at } => (LatePolicyKind::Cutoff, None, None, Some(cutoff_at)),
        }
    }
}

/// The complete policy block — replaced wholesale (no partial patch: the
/// legacy patch model could not tell "unset" from "set to null" for the
/// nullable limits).
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone)]
pub struct PolicyInput {
    pub grading_mode: GradingMode,
    pub grade_release_mode: GradeReleaseMode,
    pub completion_rule: CompletionRule,
    pub passing_score: f64,
    pub max_attempts: Option<i32>,
    pub time_limit_seconds: Option<i32>,
    pub due_at: Option<i64>,
    pub allow_late: bool,
    pub late_policy: LatePolicy,
    pub required: bool,
    pub review_visibility: ReviewVisibility,
    pub randomize_questions: bool,
    pub randomize_options: bool,
    pub partial_credit: bool,
    pub negative_marking_percent: f64,
    pub grace_period_minutes: i32,
    pub copy_paste_protection: bool,
    pub tab_switch_detection: bool,
    pub devtools_detection: bool,
    pub right_click_disabled: bool,
    pub fullscreen_required: bool,
    pub violation_threshold: i32,
    /// Cap on the max score for attempt n: 100 - pct * (n - 1). 0 = off.
    pub attempt_penalty_percent: f64,
}

impl PolicyInput {
    /// Legacy `policy_defaults.py` presets.
    #[must_use]
    pub const fn preset(kind: AssessmentKind) -> Self {
        let base = Self {
            grading_mode: GradingMode::Auto,
            grade_release_mode: GradeReleaseMode::Immediate,
            completion_rule: CompletionRule::Passed,
            passing_score: 60.0,
            max_attempts: None,
            time_limit_seconds: None,
            due_at: None,
            allow_late: true,
            late_policy: LatePolicy::None,
            required: false,
            review_visibility: ReviewVisibility::ScoreOnly,
            randomize_questions: false,
            randomize_options: false,
            partial_credit: true,
            negative_marking_percent: 0.0,
            grace_period_minutes: 0,
            copy_paste_protection: false,
            tab_switch_detection: false,
            devtools_detection: false,
            right_click_disabled: false,
            fullscreen_required: false,
            violation_threshold: 3,
            attempt_penalty_percent: 0.0,
        };
        match kind {
            AssessmentKind::Exam => Self {
                grade_release_mode: GradeReleaseMode::Batch,
                grading_mode: GradingMode::AutoThenManual,
                max_attempts: Some(1),
                time_limit_seconds: Some(3600),
                allow_late: false,
                copy_paste_protection: true,
                tab_switch_detection: true,
                devtools_detection: true,
                right_click_disabled: true,
                fullscreen_required: true,
                ..base
            },
            AssessmentKind::Quiz => Self {
                review_visibility: ReviewVisibility::Full,
                ..base
            },
            AssessmentKind::CodeChallenge => base,
        }
    }

    #[must_use]
    pub const fn from_row(row: &Assessment) -> Self {
        Self {
            grading_mode: row.grading_mode,
            grade_release_mode: row.grade_release_mode,
            completion_rule: row.completion_rule,
            passing_score: row.passing_score,
            max_attempts: row.max_attempts,
            time_limit_seconds: row.time_limit_seconds,
            due_at: row.due_at,
            allow_late: row.allow_late,
            late_policy: LatePolicy::from_columns(
                row.late_policy_kind,
                row.late_penalty_percent_per_day,
                row.late_penalty_max_days,
                row.late_cutoff_at,
            ),
            required: row.required,
            review_visibility: row.review_visibility,
            randomize_questions: row.randomize_questions,
            randomize_options: row.randomize_options,
            partial_credit: row.partial_credit,
            negative_marking_percent: row.negative_marking_percent,
            grace_period_minutes: row.grace_period_minutes,
            copy_paste_protection: row.copy_paste_protection,
            tab_switch_detection: row.tab_switch_detection,
            devtools_detection: row.devtools_detection,
            right_click_disabled: row.right_click_disabled,
            fullscreen_required: row.fullscreen_required,
            violation_threshold: row.violation_threshold,
            attempt_penalty_percent: row.attempt_penalty_percent,
        }
    }

    /// Range rules (the DB CHECKs back every one of these; this turns them
    /// into 422s with field names instead of 500s).
    fn validate(&self) -> Result<()> {
        let mut errors = Vec::new();
        let mut check = |ok: bool, field: &str, message: &str| {
            if !ok {
                errors.push(FieldError {
                    field: field.into(),
                    code: "invalid".into(),
                    message: message.into(),
                });
            }
        };
        check(
            (0.0..=100.0).contains(&self.passing_score),
            "passing_score",
            "must be between 0 and 100",
        );
        check(
            self.max_attempts.is_none_or(|n| n >= 1),
            "max_attempts",
            "must be at least 1 (or null for unlimited)",
        );
        check(
            self.time_limit_seconds.is_none_or(|n| n >= 1),
            "time_limit_seconds",
            "must be at least 1 (or null for none)",
        );
        check(
            (0.0..=100.0).contains(&self.negative_marking_percent),
            "negative_marking_percent",
            "must be between 0 and 100",
        );
        check(
            self.grace_period_minutes >= 0,
            "grace_period_minutes",
            "cannot be negative",
        );
        check(
            self.violation_threshold >= 1,
            "violation_threshold",
            "must be at least 1",
        );
        check(
            (0.0..=100.0).contains(&self.attempt_penalty_percent),
            "attempt_penalty_percent",
            "must be between 0 and 100",
        );
        if let LatePolicy::Penalty {
            percent_per_day,
            max_days,
        } = self.late_policy
        {
            check(
                (0.0..=100.0).contains(&percent_per_day),
                "late_policy.percent_per_day",
                "must be between 0 and 100",
            );
            check(max_days >= 1, "late_policy.max_days", "must be at least 1");
        }
        if errors.is_empty() {
            Ok(())
        } else {
            Err(Error::validation(errors))
        }
    }

    const fn to_values(&self) -> PolicyValues {
        let (late_policy_kind, late_penalty_percent_per_day, late_penalty_max_days, late_cutoff_at) =
            self.late_policy.columns();
        PolicyValues {
            grading_mode: self.grading_mode,
            grade_release_mode: self.grade_release_mode,
            completion_rule: self.completion_rule,
            passing_score: self.passing_score,
            max_attempts: self.max_attempts,
            time_limit_seconds: self.time_limit_seconds,
            due_at: self.due_at,
            allow_late: self.allow_late,
            late_policy_kind,
            late_penalty_percent_per_day,
            late_penalty_max_days,
            late_cutoff_at,
            required: self.required,
            review_visibility: self.review_visibility,
            randomize_questions: self.randomize_questions,
            randomize_options: self.randomize_options,
            partial_credit: self.partial_credit,
            negative_marking_percent: self.negative_marking_percent,
            grace_period_minutes: self.grace_period_minutes,
            copy_paste_protection: self.copy_paste_protection,
            tab_switch_detection: self.tab_switch_detection,
            devtools_detection: self.devtools_detection,
            right_click_disabled: self.right_click_disabled,
            fullscreen_required: self.fullscreen_required,
            violation_threshold: self.violation_threshold,
            attempt_penalty_percent: self.attempt_penalty_percent,
        }
    }
}

pub struct CreateAssessment<'a> {
    pub chapter_id: ChapterId,
    pub kind: AssessmentKind,
    pub title: &'a str,
    pub description: &'a str,
    pub weight: f64,
    pub grading_type: GradingType,
    /// `None` → the kind's preset.
    pub policy: Option<PolicyInput>,
}

#[derive(Debug, Default)]
pub struct AssessmentChanges<'a> {
    pub title: Option<&'a str>,
    pub description: Option<&'a str>,
    pub weight: Option<f64>,
    pub grading_type: Option<GradingType>,
}

/// Full-replacement item metadata.
#[derive(Debug, Clone, Default)]
pub struct ItemMetadataInput {
    pub section_label: Option<String>,
    pub difficulty: Option<ab_core::assessments::Difficulty>,
    pub tags: Vec<String>,
    pub outcome_ids: Vec<String>,
    pub estimated_minutes: Option<i32>,
}

impl ItemMetadataInput {
    /// Legacy normalization: blank section label → null; tags/outcomes
    /// trimmed and de-duplicated.
    fn normalized(self) -> Self {
        Self {
            section_label: self
                .section_label
                .map(|s| s.trim().to_owned())
                .filter(|s| !s.is_empty()),
            difficulty: self.difficulty,
            tags: normalize_tags(&self.tags),
            outcome_ids: normalize_tags(&self.outcome_ids),
            estimated_minutes: self.estimated_minutes,
        }
    }

    fn as_db(&self) -> ItemMetadata<'_> {
        ItemMetadata {
            section_label: self.section_label.as_deref(),
            difficulty: self.difficulty,
            tags: &self.tags,
            outcome_ids: &self.outcome_ids,
            estimated_minutes: self.estimated_minutes,
        }
    }
}

#[derive(Debug, Default)]
pub struct ItemChanges {
    pub title: Option<String>,
    pub body: Option<ItemBody>,
    pub max_score: Option<f64>,
    pub metadata: Option<ItemMetadataInput>,
}

#[derive(Debug, Clone, serde::Serialize, utoipa::ToSchema)]
pub struct Readiness {
    pub ok: bool,
    pub issues: Vec<ReadinessIssue>,
    pub blocker_count: usize,
    pub warning_count: usize,
}

#[derive(Clone)]
pub struct AssessmentsService {
    pub(crate) pool: PgPool,
    pub(crate) courses: CoursesService,
}

impl AssessmentsService {
    #[must_use]
    pub const fn new(pool: PgPool, courses: CoursesService) -> Self {
        Self { pool, courses }
    }

    // ── Gates ───────────────────────────────────────────────────────────

    pub(crate) fn require_scoped(
        actor: &Actor,
        course: &Course,
        action: Action,
        what: &str,
    ) -> Result<()> {
        // Authorship is the `:own` scope (see `CoursesService::require_write`).
        if actor.has(perm(action, Scope::Platform)) || course.is_author(actor.user_id) {
            return Ok(());
        }
        Err(Error::forbidden(format!("no {what} access to this course")))
    }

    /// Course-visible (404 otherwise) + authoring grant.
    async fn authorable_course(&self, actor: &Actor, course_id: CourseId) -> Result<Course> {
        let course = self.courses.get(actor, course_id).await?;
        Self::require_scoped(actor, &course, Action::Author, "authoring")?;
        Ok(course)
    }

    /// The chapter, when its course is visible and authorable. BUG-209 /
    /// UX-145: an invisible course's chapter reads exactly like an unknown
    /// one — the detail must not leak that the chapter exists.
    pub(crate) async fn authorable_chapter(
        &self,
        actor: &Actor,
        chapter_id: ChapterId,
    ) -> Result<ab_db::catalog::ChapterRow> {
        let chapter = ab_db::catalog::get_chapter(&self.pool, chapter_id)
            .await?
            .ok_or_else(|| Error::not_found("chapter"))?;
        self.authorable_course(actor, chapter.course_id)
            .await
            .map_err(|err| match err.code() {
                ab_core::ErrorCode::NotFound => Error::not_found("chapter"),
                _ => err,
            })?;
        Ok(chapter)
    }

    pub(crate) async fn load(&self, id: AssessmentId) -> Result<Assessment> {
        ab_db::assessments::get_assessment(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("assessment"))
    }

    /// Load + author gate.
    pub(crate) async fn load_for_author(
        &self,
        actor: &Actor,
        id: AssessmentId,
    ) -> Result<Assessment> {
        let assessment = self.load(id).await?;
        self.authorable_course(actor, assessment.course_id).await?;
        Ok(assessment)
    }

    /// Existence for non-authors: published AND the activity is live — the
    /// curriculum toggle can hide a published assessment (same 404 as the
    /// activity read).
    pub(crate) async fn live_for_learners(&self, assessment: &Assessment) -> Result<bool> {
        Ok(assessment.lifecycle == Lifecycle::Published
            && ab_db::catalog::get_activity(&self.pool, assessment.activity_id)
                .await?
                .is_some_and(|a| a.published))
    }

    /// Legacy `_ensure_authorable`: archived is read-only; a published
    /// assessment with any submission cannot be edited.
    async fn ensure_editable(&self, assessment: &Assessment) -> Result<()> {
        ensure_editable(&self.pool, assessment).await
    }

    /// Legacy `ASSESSMENT_LOCKED`: content (body/kind/max score) freezes once
    /// a published assessment has a non-draft submission.
    async fn ensure_content_unlocked(&self, assessment: &Assessment) -> Result<()> {
        if assessment.lifecycle == Lifecycle::Published
            && ab_db::assessments::submission_activity(&self.pool, assessment.id)
                .await?
                .non_draft
        {
            return Err(Error::conflict(
                "assessment content is locked by graded submissions",
            ));
        }
        Ok(())
    }

    /// BUG-207: a live assessment passed the readiness gate at publish time;
    /// an edit that would undo it (blank prompt, no options, no correct
    /// option, …) is refused with the would-be readiness codes — 409, like
    /// the delete-last-item guard. `items` is the post-edit item list.
    fn ensure_stays_ready(assessment: &Assessment, items: &[Item]) -> Result<()> {
        if assessment.lifecycle != Lifecycle::Published {
            return Ok(());
        }
        let readiness = Self::build_readiness(assessment, items, None);
        if readiness.ok {
            return Ok(());
        }
        let codes: Vec<&str> = readiness
            .issues
            .iter()
            .filter(|i| i.severity == "blocker")
            .map(|i| i.code.as_str())
            .collect();
        Err(Error::app_with_details(
            ab_core::ErrorCode::Conflict,
            "the change would make a published assessment unready; unpublish first",
            serde_json::json!({ "readiness": codes }),
        ))
    }

    fn check_kind_allowed(assessment_kind: AssessmentKind, item_kind: ItemKind) -> Result<()> {
        if assessment_kind.allowed_item_kinds().contains(&item_kind) {
            Ok(())
        } else {
            Err(Error::validation(vec![FieldError {
                field: "kind".into(),
                code: "unsupported".into(),
                message: format!(
                    "{item_kind} items are not allowed in a {assessment_kind}; allowed: {}",
                    assessment_kind
                        .allowed_item_kinds()
                        .iter()
                        .map(|k| k.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            }]))
        }
    }

    // ── Authoring ───────────────────────────────────────────────────────

    /// Create the assessment and its backing activity (appended to the
    /// chapter). Code challenges start with one default code item, like the
    /// legacy did lazily on first read.
    pub async fn create(
        &self,
        actor: &Actor,
        input: CreateAssessment<'_>,
    ) -> Result<AssessmentDetail> {
        let chapter = self.authorable_chapter(actor, input.chapter_id).await?;
        // BUG-177: titles are trimmed and never blank (shared rule, BUG-168).
        let title = ab_core::required_str("title", input.title)?;
        let kind = input.kind;
        let policy = input.policy.unwrap_or_else(|| PolicyInput::preset(kind));
        policy.validate()?;

        let (activity_type, sub_type) = kind.activity_type();
        // BUG-233: activity + assessment (+ default item) land together — a
        // dropped socket or a concurrent chapter DELETE (FK → 404) leaves no
        // orphan activity behind.
        let mut tx = self.pool.begin().await?;
        let activity_id = ab_db::catalog::insert_activity(
            &mut *tx,
            input.chapter_id,
            chapter.course_id,
            title,
            activity_type,
            sub_type,
            actor.user_id,
        )
        .await?;
        let id = ab_db::assessments::insert_assessment(
            &mut *tx,
            NewAssessment {
                activity_id,
                course_id: chapter.course_id,
                kind,
                title,
                description: input.description,
                weight: input.weight,
                grading_type: input.grading_type,
                creator_id: actor.user_id,
                policy: &policy.to_values(),
            },
        )
        .await?;
        if kind == AssessmentKind::CodeChallenge {
            let body = ItemBody::default_code();
            ab_db::assessments::insert_item(
                &mut *tx,
                id,
                ItemKind::Code,
                "",
                &body.to_stored(),
                100.0,
                ItemMetadataInput::default().as_db(),
            )
            .await?;
        }
        tx.commit().await?;
        self.detail(id).await
    }

    async fn detail(&self, id: AssessmentId) -> Result<AssessmentDetail> {
        let assessment = self.load(id).await?;
        let items = ab_db::assessments::list_items(&self.pool, id)
            .await?
            .into_iter()
            .map(Item::try_from)
            .collect::<Result<Vec<_>>>()?;
        Ok(AssessmentDetail { assessment, items })
    }

    /// BUG-218: the row lock plus a fresh read inside `tx`. Publish and the
    /// item/policy writes serialize on it, so each gate sees the other's
    /// committed result instead of the state it loaded before the lock.
    async fn lock_detail(
        tx: &mut sqlx::PgConnection,
        id: AssessmentId,
    ) -> Result<AssessmentDetail> {
        let assessment = ab_db::assessments::lock_assessment(&mut *tx, id)
            .await?
            .ok_or_else(|| Error::not_found("assessment"))?;
        let items = ab_db::assessments::list_items(&mut *tx, id)
            .await?
            .into_iter()
            .map(Item::try_from)
            .collect::<Result<Vec<_>>>()?;
        Ok(AssessmentDetail { assessment, items })
    }

    /// Read: authors always; otherwise a published assessment on a visible
    /// course for holders of `assessment:read:assigned` (course access
    /// itself is the assignment until 3.4 adds allowlists).
    pub async fn get(&self, actor: &Actor, id: AssessmentId) -> Result<AssessmentDetail> {
        let assessment = self.load(id).await?;
        let course = self.courses.get(actor, assessment.course_id).await?;
        let author = Self::require_scoped(actor, &course, Action::Author, "read").is_ok();
        if !author {
            let readable = self.live_for_learners(&assessment).await?
                && (actor.has(perm(Action::Read, Scope::Assigned))
                    || actor.has(perm(Action::Read, Scope::Platform)));
            if !readable {
                return Err(Error::not_found("assessment"));
            }
        }
        let mut detail = self.detail(id).await?;
        if !author {
            let shuffle_options = detail.assessment.randomize_options;
            for item in &mut detail.items {
                // Stable per (viewer, item): a reload keeps the order.
                item.body
                    .redact_for_learner(shuffle_seed(actor.user_id, item.id.0), shuffle_options);
            }
            if detail.assessment.randomize_questions {
                items::shuffle(&mut detail.items, shuffle_seed(actor.user_id, id.0));
            }
        }
        Ok(detail)
    }

    /// Same visibility rule as [`Self::get`] but with the full item bodies:
    /// for the grading pipeline, which needs the answer key for the very
    /// learner the redaction hides it from. Never hand the result to a client.
    pub async fn get_for_grading(
        &self,
        actor: &Actor,
        id: AssessmentId,
    ) -> Result<AssessmentDetail> {
        self.get(actor, id).await?;
        self.detail(id).await
    }

    pub async fn get_by_activity(
        &self,
        actor: &Actor,
        activity_id: ActivityId,
    ) -> Result<AssessmentDetail> {
        let assessment = ab_db::assessments::get_assessment_by_activity(&self.pool, activity_id)
            .await?
            .ok_or_else(|| Error::not_found("assessment"))?;
        self.get(actor, assessment.id).await
    }

    /// Course overview: authors see everything, others only published.
    pub async fn list_for_course(
        &self,
        actor: &Actor,
        course_id: CourseId,
    ) -> Result<Vec<Assessment>> {
        let course = self.courses.get(actor, course_id).await?;
        let author = Self::require_scoped(actor, &course, Action::Author, "read").is_ok();
        let rows = ab_db::assessments::list_assessments_for_course(&self.pool, course_id).await?;
        Ok(rows
            .into_iter()
            .filter(|a| author || a.lifecycle == Lifecycle::Published)
            .collect())
    }

    pub async fn update(
        &self,
        actor: &Actor,
        id: AssessmentId,
        changes: AssessmentChanges<'_>,
    ) -> Result<AssessmentDetail> {
        let assessment = self.load_for_author(actor, id).await?;
        self.ensure_editable(&assessment).await?;
        let title = changes
            .title
            .map(|t| ab_core::required_str("title", t))
            .transpose()?;
        ab_db::assessments::update_assessment_details(
            &self.pool,
            id,
            title,
            changes.description,
            changes.weight,
            changes.grading_type,
        )
        .await?;
        if let Some(title) = title {
            // The activity carries the title into the curriculum.
            ab_db::catalog::update_activity(&self.pool, assessment.activity_id, Some(title), None)
                .await?;
        }
        self.detail(id).await
    }

    /// Replace the policy block (bumps `policy_version`).
    pub async fn set_policy(
        &self,
        actor: &Actor,
        id: AssessmentId,
        policy: PolicyInput,
    ) -> Result<AssessmentDetail> {
        self.load_for_author(actor, id).await?;
        policy.validate()?;
        let mut tx = self.pool.begin().await?;
        let AssessmentDetail { assessment, items } = Self::lock_detail(&mut tx, id).await?;
        self.ensure_editable(&assessment).await?;
        // BUG-207: the readiness gate publish took, re-run on the would-be
        // policy (no policy rule blocks today — they warn — but the gate
        // stays one function).
        let (late_kind, _, _, late_cutoff_at) = policy.late_policy.columns();
        let would_be = Assessment {
            due_at: policy.due_at,
            allow_late: policy.allow_late,
            late_policy_kind: late_kind,
            late_cutoff_at,
            ..assessment
        };
        Self::ensure_stays_ready(&would_be, &items)?;
        ab_db::assessments::update_policy(&mut *tx, id, &policy.to_values()).await?;
        tx.commit().await?;

        self.detail(id).await
    }

    // ── Readiness + lifecycle ───────────────────────────────────────────

    /// Legacy `build_readiness`, minus the rules the schema now enforces.
    fn build_readiness(
        assessment: &Assessment,
        items: &[Item],
        scheduled_at: Option<i64>,
    ) -> Readiness {
        let mut issues = Vec::new();
        let blocker = |code: &str, message: &str, area: &'static str| ReadinessIssue {
            code: code.into(),
            message: message.into(),
            severity: "blocker",
            area,
            item_id: None,
        };
        if assessment.title.trim().is_empty() {
            issues.push(blocker(
                "assessment.title_missing",
                "title is empty",
                "details",
            ));
        }
        if items.is_empty() {
            issues.push(blocker(
                "assessment.empty",
                "add at least one item",
                "questions",
            ));
        }
        if let (Some(scheduled), Some(due)) = (scheduled_at, assessment.due_at)
            && scheduled >= due
        {
            issues.push(blocker(
                "schedule.after_due_at",
                "scheduled opening is after the due date",
                "publish",
            ));
        }
        // UX-137: policy combinations that are legal but almost certainly
        // not what the teacher meant — warnings, never blockers.
        let warning = |code: &str, message: &str| ReadinessIssue {
            severity: "warning",
            ..blocker(code, message, "policy")
        };
        if matches!(
            assessment.lifecycle,
            Lifecycle::Draft | Lifecycle::Scheduled
        ) && assessment.due_at.is_some_and(|due| due < now_unix())
        {
            issues.push(warning(
                "policy.due_at_past",
                "the due date is already in the past",
            ));
        }
        if let (Some(due), Some(cutoff)) = (assessment.due_at, assessment.late_cutoff_at)
            && cutoff < due
        {
            issues.push(warning(
                "policy.cutoff_before_due",
                "the late cutoff is before the due date",
            ));
        }
        if assessment.late_policy_kind == LatePolicyKind::Penalty && !assessment.allow_late {
            issues.push(warning(
                "policy.penalty_without_late",
                "a late penalty has no effect while late submissions are not allowed",
            ));
        }
        for item in items {
            let mut item_issues = Vec::new();
            if !assessment.kind.allowed_item_kinds().contains(&item.kind) {
                item_issues.push(blocker(
                    "item.kind_forbidden",
                    "item kind is not allowed in this assessment",
                    "questions",
                ));
            }
            if item.title.trim().is_empty() {
                item_issues.push(blocker(
                    "item.title_missing",
                    "item title is empty",
                    "questions",
                ));
            }
            if !(item.max_score > 0.0 && item.max_score <= MAX_ITEM_SCORE) {
                item_issues.push(blocker(
                    "item.max_score_invalid",
                    "max score must be positive and at most 10000",
                    "questions",
                ));
            }
            item_issues.extend(item.body.readiness_issues(&item.title));
            for mut issue in item_issues {
                issue.item_id = Some(item.id);
                issues.push(issue);
            }
        }
        let blocker_count = issues.iter().filter(|i| i.severity == "blocker").count();
        let warning_count = issues.iter().filter(|i| i.severity == "warning").count();
        Readiness {
            ok: blocker_count == 0,
            issues,
            blocker_count,
            warning_count,
        }
    }

    pub async fn readiness(&self, actor: &Actor, id: AssessmentId) -> Result<Readiness> {
        self.load_for_author(actor, id).await?;
        self.readiness_of(id).await
    }

    /// Readiness without an access gate — for callers that already hold
    /// course write access (course readiness).
    pub(crate) async fn readiness_of(&self, id: AssessmentId) -> Result<Readiness> {
        let detail = self.detail(id).await?;
        Ok(Self::build_readiness(
            &detail.assessment,
            &detail.items,
            detail.assessment.scheduled_at,
        ))
    }

    /// Lifecycle transition (legacy table + field effects). Scheduling and
    /// publishing require readiness; scheduling needs a future time.
    pub async fn transition(
        &self,
        actor: &Actor,
        id: AssessmentId,
        to: Lifecycle,
        scheduled_at: Option<i64>,
        note: Option<&str>,
    ) -> Result<AssessmentDetail> {
        let assessment = self.load(id).await?;
        let course = self.courses.get(actor, assessment.course_id).await?;
        Self::require_scoped(actor, &course, Action::Publish, "publish")?;

        let mut tx = self.pool.begin().await?;
        let AssessmentDetail { assessment, items } = Self::lock_detail(&mut tx, id).await?;
        let from = assessment.lifecycle;
        if !from.can_transition_to(to) {
            let allowed: Vec<_> = Lifecycle::ALL
                .iter()
                .filter(|t| from.can_transition_to(**t))
                .map(|t| t.as_str())
                .collect();
            return Err(Error::conflict(format!(
                "cannot move from {from} to {to}; allowed: {}",
                allowed.join(", ")
            )));
        }

        let now = now_unix();
        if matches!(to, Lifecycle::Scheduled | Lifecycle::Published) {
            let readiness = Self::build_readiness(&assessment, &items, scheduled_at);
            if !readiness.ok {
                return Err(Error::validation(
                    readiness
                        .issues
                        .into_iter()
                        .map(|issue| FieldError {
                            field: issue
                                .item_id
                                .map_or_else(|| "assessment".to_owned(), |i| i.to_string()),
                            code: issue.code,
                            message: issue.message,
                        })
                        .collect(),
                ));
            }
        }

        let (scheduled, published, archived, activity_live) = match to {
            Lifecycle::Scheduled => {
                let Some(at) = scheduled_at else {
                    return Err(Error::validation(vec![FieldError {
                        field: "scheduled_at".into(),
                        code: "required".into(),
                        message: "scheduling needs a time".into(),
                    }]));
                };
                if at <= now {
                    return Err(Error::validation(vec![FieldError {
                        field: "scheduled_at".into(),
                        code: "in-past".into(),
                        message: "scheduled time must be in the future".into(),
                    }]));
                }
                (Some(at), None, None, false)
            }
            // published_at is stamped once and survives later transitions.
            Lifecycle::Published => (None, assessment.published_at.or(Some(now)), None, true),
            Lifecycle::Archived => (
                None,
                assessment.published_at,
                assessment.archived_at.or(Some(now)),
                false,
            ),
            Lifecycle::Draft => (None, assessment.published_at, assessment.archived_at, false),
        };
        ab_db::assessments::set_lifecycle(&mut *tx, id, to, scheduled, published, archived).await?;
        // BUG-232: the activity flag flips with the lifecycle, under the same
        // lock the curriculum toggle takes — never a torn pair.
        ab_db::catalog::update_activity(
            &mut *tx,
            assessment.activity_id,
            None,
            Some(activity_live),
        )
        .await?;
        tx.commit().await?;
        ProgressProjector::new(self.pool.clone())
            .recalculate_course_for_all(assessment.course_id)
            .await?;
        ab_db::assessments::insert_audit_event(
            &self.pool,
            id,
            Some(actor.user_id),
            "lifecycle-transition",
            serde_json::json!({
                "from": from, "to": to, "scheduled_at": scheduled, "note": note,
            }),
        )
        .await?;
        self.detail(id).await
    }

    /// Called by the auto-publish job: re-checks readiness (BUG-162 — the
    /// schedule was gated at schedule time, the world may have moved since),
    /// flips due schedules and brings their activities live (the legacy cron
    /// forgot the activity flag). A blocked one stays `scheduled`, logged and
    /// audited with its readiness codes.
    pub async fn publish_due(pool: &PgPool) -> Result<usize> {
        let mut published = 0;
        for id in ab_db::assessments::list_due(pool).await? {
            let Some(assessment) = ab_db::assessments::get_assessment(pool, id).await? else {
                continue;
            };
            let items = ab_db::assessments::list_items(pool, id)
                .await?
                .into_iter()
                .map(Item::try_from)
                .collect::<Result<Vec<_>>>()?;
            let readiness = Self::build_readiness(&assessment, &items, assessment.scheduled_at);
            if !readiness.ok {
                let codes: Vec<&str> = readiness
                    .issues
                    .iter()
                    .filter(|i| i.severity == "blocker")
                    .map(|i| i.code.as_str())
                    .collect();
                tracing::warn!(%id, ?codes, "scheduled assessment not ready; left scheduled");
                ab_db::assessments::insert_audit_event(
                    pool,
                    id,
                    None,
                    "auto-publish-skipped",
                    serde_json::json!({ "by": "scheduler", "readiness": codes }),
                )
                .await?;
                continue;
            }
            let mut tx = pool.begin().await?;
            if !ab_db::assessments::publish_due(&mut *tx, id).await? {
                continue;
            }
            ab_db::catalog::update_activity(&mut *tx, assessment.activity_id, None, Some(true))
                .await?;
            tx.commit().await?;
            ProgressProjector::new(pool.clone())
                .recalculate_course_for_all(assessment.course_id)
                .await?;
            ab_db::assessments::insert_audit_event(
                pool,
                id,
                None,
                "lifecycle-transition",
                serde_json::json!({ "from": "scheduled", "to": "published", "by": "scheduler" }),
            )
            .await?;
            published += 1;
        }
        Ok(published)
    }

    /// Deep copy as a fresh draft: new activity appended to the (same or
    /// given) chapter, the whole policy, every item with fresh ids in the
    /// same order. Access lists and per-student overrides are not copied
    /// (legacy semantics). Unlike legacy, due date / lateness / anti-cheat
    /// travel with the copy — dropping them silently was a data-loss bug.
    pub async fn duplicate(
        &self,
        actor: &Actor,
        id: AssessmentId,
        title: Option<&str>,
        chapter_id: Option<ChapterId>,
    ) -> Result<AssessmentDetail> {
        let source = self.load_for_author(actor, id).await?;
        let source_activity = ab_db::catalog::get_activity(&self.pool, source.activity_id)
            .await?
            .ok_or_else(|| Error::not_found("activity"))?;
        let target_chapter = chapter_id.unwrap_or(source_activity.chapter_id);
        // BUG-208: an invisible course's chapter is a 404, not a 422 oracle.
        let chapter = self.authorable_chapter(actor, target_chapter).await?;
        if chapter.course_id != source.course_id {
            return Err(Error::validation(vec![FieldError {
                field: "chapter_id".into(),
                code: "invalid".into(),
                message: "copies stay within the source course".into(),
            }]));
        }
        // BUG-201 (BUG-177 class): a given title is trimmed and never blank.
        let copy_title = match title {
            Some(title) => ab_core::required_str("title", title)?.to_owned(),
            None => format!("{} (copy)", source.title),
        };

        let (activity_type, sub_type) = source.kind.activity_type();
        let activity_id = ab_db::catalog::insert_activity(
            &self.pool,
            target_chapter,
            source.course_id,
            &copy_title,
            activity_type,
            sub_type,
            actor.user_id,
        )
        .await?;
        let new_id = ab_db::assessments::insert_assessment(
            &self.pool,
            NewAssessment {
                activity_id,
                course_id: source.course_id,
                kind: source.kind,
                title: &copy_title,
                description: &source.description,
                weight: source.weight,
                grading_type: source.grading_type,
                creator_id: actor.user_id,
                policy: &source.policy(),
            },
        )
        .await?;
        for item in ab_db::assessments::list_items(&self.pool, id).await? {
            ab_db::assessments::insert_item(
                &self.pool,
                new_id,
                item.kind,
                &item.title,
                &item.body,
                item.max_score,
                ItemMetadata {
                    section_label: item.section_label.as_deref(),
                    difficulty: item.difficulty,
                    tags: &item.tags,
                    outcome_ids: &item.outcome_ids,
                    estimated_minutes: item.estimated_minutes,
                },
            )
            .await?;
        }
        ab_db::assessments::insert_audit_event(
            &self.pool,
            new_id,
            Some(actor.user_id),
            "duplicated-from",
            serde_json::json!({ "source": id }),
        )
        .await?;
        self.detail(new_id).await
    }

    pub async fn audit_trail(
        &self,
        actor: &Actor,
        id: AssessmentId,
        limit: i64,
    ) -> Result<Vec<AuditEvent>> {
        self.load_for_author(actor, id).await?;
        ab_db::assessments::list_audit_events(&self.pool, id, ab_core::page_limit(limit, 200)?)
            .await
    }

    // ── Items ───────────────────────────────────────────────────────────

    pub async fn add_item(
        &self,
        actor: &Actor,
        id: AssessmentId,
        title: &str,
        body: ItemBody,
        max_score: f64,
        metadata: ItemMetadataInput,
    ) -> Result<Item> {
        let assessment = self.load_for_author(actor, id).await?;
        self.ensure_editable(&assessment).await?;
        // BUG-217: a new item reweights every graded attempt, like a max
        // score change does.
        self.ensure_content_unlocked(&assessment).await?;
        Self::check_kind_allowed(assessment.kind, body.kind())?;
        body.validate()?;
        if ab_db::assessments::count_items(&self.pool, id).await? >= MAX_ITEMS {
            return Err(Error::validation(vec![FieldError {
                field: "items".into(),
                code: "limit-exceeded".into(),
                message: format!("an assessment holds at most {MAX_ITEMS} items"),
            }]));
        }
        if max_score < 0.0 {
            return Err(Error::validation(vec![FieldError {
                field: "max_score".into(),
                code: "invalid".into(),
                message: "cannot be negative".into(),
            }]));
        }
        // UX-139: an item title is trimmed and never blank, like the assessment's.
        let title = ab_core::required_str("title", title)?;
        let metadata = metadata.normalized();
        // BUG-218: the readiness gate runs on the locked state, in the same
        // transaction as the insert, so a concurrent publish cannot slip in.
        let mut tx = self.pool.begin().await?;
        let AssessmentDetail {
            assessment,
            mut items,
        } = Self::lock_detail(&mut tx, id).await?;
        // BUG-231: a schedule (or publish) that landed since the load above
        // makes the row read-only — the same gates, on the locked row.
        self.ensure_editable(&assessment).await?;
        self.ensure_content_unlocked(&assessment).await?;
        if assessment.lifecycle == Lifecycle::Published {
            items.push(Item {
                id: AssessmentItemId::default(),
                position: 0,
                kind: body.kind(),
                title: title.to_owned(),
                body: body.clone(),
                max_score,
                section_label: None,
                difficulty: None,
                tags: Vec::new(),
                outcome_ids: Vec::new(),
                estimated_minutes: None,
            });
            Self::ensure_stays_ready(&assessment, &items)?;
        }
        let item_id = ab_db::assessments::insert_item(
            &mut *tx,
            id,
            body.kind(),
            title,
            &body.to_stored(),
            max_score,
            metadata.as_db(),
        )
        .await?;
        ab_db::assessments::bump_content_version(&mut *tx, id).await?;
        tx.commit().await?;
        self.item(item_id).await
    }

    async fn item(&self, item_id: AssessmentItemId) -> Result<Item> {
        ab_db::assessments::get_item(&self.pool, item_id)
            .await?
            .ok_or_else(|| Error::not_found("assessment item"))
            .and_then(Item::try_from)
    }

    /// Load the item and its assessment through the author gate.
    async fn item_for_author(
        &self,
        actor: &Actor,
        item_id: AssessmentItemId,
    ) -> Result<(Assessment, ab_db::assessments::ItemRow)> {
        let row = ab_db::assessments::get_item(&self.pool, item_id)
            .await?
            .ok_or_else(|| Error::not_found("assessment item"))?;
        let assessment = self.load_for_author(actor, row.assessment_id).await?;
        Ok((assessment, row))
    }

    pub async fn update_item(
        &self,
        actor: &Actor,
        item_id: AssessmentItemId,
        changes: ItemChanges,
    ) -> Result<Item> {
        let (_, row) = self.item_for_author(actor, item_id).await?;
        let mut tx = self.pool.begin().await?;
        let AssessmentDetail {
            assessment,
            mut items,
        } = Self::lock_detail(&mut tx, row.assessment_id).await?;
        self.ensure_editable(&assessment).await?;
        if changes.body.is_some() || changes.max_score.is_some() {
            self.ensure_content_unlocked(&assessment).await?;
        }
        if let Some(body) = &changes.body {
            Self::check_kind_allowed(assessment.kind, body.kind())?;
            body.validate()?;
        }
        if changes.max_score.is_some_and(|s| s < 0.0) {
            return Err(Error::validation(vec![FieldError {
                field: "max_score".into(),
                code: "invalid".into(),
                message: "cannot be negative".into(),
            }]));
        }
        let title = changes
            .title
            .as_deref()
            .map(|t| ab_core::required_str("title", t))
            .transpose()?;
        if assessment.lifecycle == Lifecycle::Published {
            if let Some(item) = items.iter_mut().find(|i| i.id == item_id) {
                if let Some(title) = title {
                    title.clone_into(&mut item.title);
                }
                if let Some(body) = &changes.body {
                    item.kind = body.kind();
                    item.body = body.clone();
                }
                if let Some(max_score) = changes.max_score {
                    item.max_score = max_score;
                }
            }
            Self::ensure_stays_ready(&assessment, &items)?;
        }
        let stored = changes.body.as_ref().map(|b| (b.kind(), b.to_stored()));
        let metadata = changes.metadata.map(ItemMetadataInput::normalized);
        ab_db::assessments::update_item(
            &mut *tx,
            item_id,
            title,
            stored.as_ref().map(|(kind, value)| (*kind, value)),
            changes.max_score,
            metadata.as_ref().map(ItemMetadataInput::as_db),
        )
        .await?;
        ab_db::assessments::bump_content_version(&mut *tx, row.assessment_id).await?;
        tx.commit().await?;
        self.item(item_id).await
    }

    pub async fn delete_item(&self, actor: &Actor, item_id: AssessmentItemId) -> Result<()> {
        let (_, row) = self.item_for_author(actor, item_id).await?;
        let mut tx = self.pool.begin().await?;
        let AssessmentDetail { assessment, items } =
            Self::lock_detail(&mut tx, row.assessment_id).await?;
        self.ensure_editable(&assessment).await?;
        self.ensure_content_unlocked(&assessment).await?;
        // A live (or scheduled) assessment keeps at least one item: readiness
        // gated the publish, a delete must not undo it.
        if matches!(
            assessment.lifecycle,
            Lifecycle::Published | Lifecycle::Scheduled
        ) && items.len() == 1
        {
            return Err(Error::conflict(
                "a published assessment needs at least one item; unpublish first",
            ));
        }
        ab_db::assessments::delete_item(&mut *tx, item_id).await?;
        let remaining: Vec<AssessmentItemId> = items
            .iter()
            .map(|i| i.id)
            .filter(|i| *i != item_id)
            .collect();
        ab_db::assessments::renumber_items(&mut tx, &remaining).await?;
        ab_db::assessments::bump_content_version(&mut *tx, row.assessment_id).await?;
        Ok(tx.commit().await?)
    }

    /// Reorder: `ordered` lists item ids in the desired order; items it
    /// omits keep their relative order after the listed ones. Positions
    /// come out 1..n contiguous (legacy wrote client integers verbatim).
    pub async fn reorder_items(
        &self,
        actor: &Actor,
        id: AssessmentId,
        ordered: &[AssessmentItemId],
    ) -> Result<Vec<Item>> {
        let assessment = self.load_for_author(actor, id).await?;
        self.ensure_editable(&assessment).await?;
        let existing = ab_db::assessments::list_item_ids(&self.pool, id).await?;
        let unknown: Vec<_> = ordered
            .iter()
            .filter(|i| !existing.contains(i))
            .map(ToString::to_string)
            .collect();
        if !unknown.is_empty() {
            return Err(Error::validation(vec![FieldError {
                field: "items".into(),
                code: "unknown".into(),
                message: format!("not items of this assessment: {}", unknown.join(", ")),
            }]));
        }
        let mut final_order: Vec<AssessmentItemId> = Vec::with_capacity(existing.len());
        for item in ordered {
            if !final_order.contains(item) {
                final_order.push(*item);
            }
        }
        let remainder: Vec<AssessmentItemId> = existing
            .into_iter()
            .filter(|i| !final_order.contains(i))
            .collect();
        final_order.extend(remainder);
        let mut tx = self.pool.begin().await?;
        // BUG-231: the lifecycle gate re-runs on the locked row.
        let AssessmentDetail { assessment, .. } = Self::lock_detail(&mut tx, id).await?;
        self.ensure_editable(&assessment).await?;
        ab_db::assessments::renumber_items(&mut tx, &final_order).await?;
        ab_db::assessments::bump_content_version(&mut *tx, id).await?;
        tx.commit().await?;
        Ok(self.detail(id).await?.items)
    }
}
