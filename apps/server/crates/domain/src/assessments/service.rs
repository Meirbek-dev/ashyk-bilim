//! Assessment authoring: create (with the backing activity), detail reads,
//! wholesale policy replacement, lifecycle transitions gated by readiness,
//! item CRUD with the legacy lock rules, audit trail.
//!
//! Access (ported from `_shared.py`): author = `assessment:author:platform`
//! or course creator with `assessment:author:own`; publish likewise with
//! `publish`; read = author, or a published assessment on a course the actor
//! can see plus `assessment:read:assigned`.

use ab_core::assessments::{
    AccessMode, AssessmentKind, CompletionRule, GradeReleaseMode, GradingMode, GradingType,
    ItemKind, LatePolicyKind, Lifecycle, ReviewVisibility,
};
use ab_core::id::{ActivityId, AssessmentId, AssessmentItemId, ChapterId, CourseId};
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, FieldError, Result};
use ab_db::assessments::{ItemMetadata, NewAssessment, PolicyValues};
use sqlx::PgPool;

pub use ab_db::assessments::{AssessmentRow as Assessment, AuditEventRow as AuditEvent};

use crate::assessments::items::{ItemBody, ReadinessIssue, normalize_tags};
use crate::catalog::courses::{Course, CoursesService};
use crate::identity::Actor;

/// Legacy `ITEM_LIMIT_EXCEEDED` ceiling.
pub const MAX_ITEMS: i64 = 200;

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
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
        if actor.has(perm(action, Scope::Platform)) {
            return Ok(());
        }
        if course.creator_id == Some(actor.user_id) && actor.has(perm(action, Scope::Own)) {
            return Ok(());
        }
        Err(Error::forbidden(format!(
            "no {what} access to this assessment"
        )))
    }

    /// Course-visible (404 otherwise) + authoring grant.
    async fn authorable_course(&self, actor: &Actor, course_id: CourseId) -> Result<Course> {
        let course = self.courses.get(actor, course_id).await?;
        Self::require_scoped(actor, &course, Action::Author, "authoring")?;
        Ok(course)
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

    /// Legacy `_ensure_authorable`: archived is read-only; a published
    /// assessment with any submission cannot be edited.
    async fn ensure_editable(&self, assessment: &Assessment) -> Result<()> {
        match assessment.lifecycle {
            Lifecycle::Archived => Err(Error::conflict("archived assessments are read-only")),
            Lifecycle::Published => {
                let activity =
                    ab_db::assessments::submission_activity(&self.pool, assessment.id).await?;
                if activity.any {
                    return Err(Error::conflict(
                        "published assessment already has submissions; unpublish first",
                    ));
                }
                Ok(())
            }
            Lifecycle::Draft | Lifecycle::Scheduled => Ok(()),
        }
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
        let chapter = ab_db::catalog::get_chapter(&self.pool, input.chapter_id)
            .await?
            .ok_or_else(|| Error::not_found("chapter"))?;
        self.authorable_course(actor, chapter.course_id).await?;
        let kind = input.kind;
        let policy = input.policy.unwrap_or_else(|| PolicyInput::preset(kind));
        policy.validate()?;

        let (activity_type, sub_type) = kind.activity_type();
        let activity_id = ab_db::catalog::insert_activity(
            &self.pool,
            input.chapter_id,
            chapter.course_id,
            input.title,
            activity_type,
            sub_type,
            actor.user_id,
        )
        .await?;
        let id = ab_db::assessments::insert_assessment(
            &self.pool,
            NewAssessment {
                activity_id,
                course_id: chapter.course_id,
                kind,
                title: input.title,
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
                &self.pool,
                id,
                ItemKind::Code,
                "",
                &body.to_stored(),
                100.0,
                ItemMetadataInput::default().as_db(),
            )
            .await?;
        }
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

    /// Read: authors always; otherwise a published assessment on a visible
    /// course for holders of `assessment:read:assigned` (course access
    /// itself is the assignment until 3.4 adds allowlists).
    pub async fn get(&self, actor: &Actor, id: AssessmentId) -> Result<AssessmentDetail> {
        let assessment = self.load(id).await?;
        let course = self.courses.get(actor, assessment.course_id).await?;
        if Self::require_scoped(actor, &course, Action::Author, "read").is_err() {
            let readable = assessment.lifecycle == Lifecycle::Published
                && (actor.has(perm(Action::Read, Scope::Assigned))
                    || actor.has(perm(Action::Read, Scope::Platform)));
            if !readable {
                return Err(Error::not_found("assessment"));
            }
        }
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
        ab_db::assessments::update_assessment_details(
            &self.pool,
            id,
            changes.title,
            changes.description,
            changes.weight,
            changes.grading_type,
        )
        .await?;
        if let Some(title) = changes.title {
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
        let assessment = self.load_for_author(actor, id).await?;
        self.ensure_editable(&assessment).await?;
        policy.validate()?;
        ab_db::assessments::update_policy(&self.pool, id, &policy.to_values()).await?;
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
            if item.max_score <= 0.0 {
                item_issues.push(blocker(
                    "item.max_score_invalid",
                    "max score must be positive",
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
            let items = self.detail(id).await?.items;
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
        ab_db::assessments::set_lifecycle(&self.pool, id, to, scheduled, published, archived)
            .await?;
        ab_db::catalog::update_activity(
            &self.pool,
            assessment.activity_id,
            None,
            Some(activity_live),
        )
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

    /// Called by the auto-publish job: flips due schedules and brings their
    /// activities live (the legacy cron forgot the activity flag).
    pub async fn publish_due(pool: &PgPool) -> Result<usize> {
        let ids = ab_db::assessments::publish_due(pool).await?;
        for id in &ids {
            if let Some(assessment) = ab_db::assessments::get_assessment(pool, *id).await? {
                ab_db::catalog::update_activity(pool, assessment.activity_id, None, Some(true))
                    .await?;
            }
            ab_db::assessments::insert_audit_event(
                pool,
                *id,
                None,
                "lifecycle-transition",
                serde_json::json!({ "from": "scheduled", "to": "published", "by": "scheduler" }),
            )
            .await?;
        }
        Ok(ids.len())
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
        let chapter = ab_db::catalog::get_chapter(&self.pool, target_chapter)
            .await?
            .ok_or_else(|| Error::not_found("chapter"))?;
        if chapter.course_id != source.course_id {
            return Err(Error::validation(vec![FieldError {
                field: "chapter_id".into(),
                code: "invalid".into(),
                message: "copies stay within the source course".into(),
            }]));
        }
        let copy_title = title.map_or_else(|| format!("{} (copy)", source.title), str::to_owned);

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
        ab_db::assessments::list_audit_events(&self.pool, id, limit.clamp(1, 200)).await
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
        Self::check_kind_allowed(assessment.kind, body.kind())?;
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
        let metadata = metadata.normalized();
        let item_id = ab_db::assessments::insert_item(
            &self.pool,
            id,
            body.kind(),
            title,
            &body.to_stored(),
            max_score,
            metadata.as_db(),
        )
        .await?;
        ab_db::assessments::bump_content_version(&self.pool, id).await?;
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
        let (assessment, row) = self.item_for_author(actor, item_id).await?;
        self.ensure_editable(&assessment).await?;
        if changes.body.is_some() || changes.max_score.is_some() {
            self.ensure_content_unlocked(&assessment).await?;
        }
        if let Some(body) = &changes.body {
            Self::check_kind_allowed(assessment.kind, body.kind())?;
        }
        if changes.max_score.is_some_and(|s| s < 0.0) {
            return Err(Error::validation(vec![FieldError {
                field: "max_score".into(),
                code: "invalid".into(),
                message: "cannot be negative".into(),
            }]));
        }
        let stored = changes.body.as_ref().map(|b| (b.kind(), b.to_stored()));
        let metadata = changes.metadata.map(ItemMetadataInput::normalized);
        ab_db::assessments::update_item(
            &self.pool,
            item_id,
            changes.title.as_deref(),
            stored.as_ref().map(|(kind, value)| (*kind, value)),
            changes.max_score,
            metadata.as_ref().map(ItemMetadataInput::as_db),
        )
        .await?;
        ab_db::assessments::bump_content_version(&self.pool, row.assessment_id).await?;
        self.item(item_id).await
    }

    pub async fn delete_item(&self, actor: &Actor, item_id: AssessmentItemId) -> Result<()> {
        let (assessment, row) = self.item_for_author(actor, item_id).await?;
        self.ensure_editable(&assessment).await?;
        self.ensure_content_unlocked(&assessment).await?;
        ab_db::assessments::delete_item(&self.pool, item_id).await?;
        let remaining = ab_db::assessments::list_item_ids(&self.pool, row.assessment_id).await?;
        ab_db::assessments::renumber_items(&self.pool, &remaining).await?;
        ab_db::assessments::bump_content_version(&self.pool, row.assessment_id).await
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
        ab_db::assessments::renumber_items(&self.pool, &final_order).await?;
        ab_db::assessments::bump_content_version(&self.pool, id).await?;
        Ok(self.detail(id).await?.items)
    }

    // ── Access mode (3.4 adds the allowlists) ───────────────────────────

    pub async fn set_access_mode(
        &self,
        actor: &Actor,
        id: AssessmentId,
        mode: AccessMode,
    ) -> Result<()> {
        self.load_for_author(actor, id).await?;
        ab_db::assessments::set_access_mode(&self.pool, id, mode).await
    }
}
