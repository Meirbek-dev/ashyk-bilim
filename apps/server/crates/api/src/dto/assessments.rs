use ab_core::assessments::{
    AccessMode, AssessmentKind, CompletionRule, Difficulty, GradeReleaseMode, GradingMode,
    GradingType, ItemKind, Lifecycle, ReviewVisibility,
};
use ab_core::id::{ActivityId, AssessmentId, AssessmentItemId, ChapterId, CourseId, UserId};
use ab_domain::assessments::items::ItemBody;
use ab_domain::assessments::service::{self, LatePolicy as DomainLatePolicy, PolicyInput};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Late-submission handling.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LatePolicy {
    None,
    Penalty { percent_per_day: f64, max_days: i32 },
    Cutoff { cutoff_at_unix: i64 },
}

impl From<DomainLatePolicy> for LatePolicy {
    fn from(p: DomainLatePolicy) -> Self {
        match p {
            DomainLatePolicy::None => Self::None,
            DomainLatePolicy::Penalty {
                percent_per_day,
                max_days,
            } => Self::Penalty {
                percent_per_day,
                max_days,
            },
            DomainLatePolicy::Cutoff { cutoff_at } => Self::Cutoff {
                cutoff_at_unix: cutoff_at,
            },
        }
    }
}

impl From<LatePolicy> for DomainLatePolicy {
    fn from(p: LatePolicy) -> Self {
        match p {
            LatePolicy::None => Self::None,
            LatePolicy::Penalty {
                percent_per_day,
                max_days,
            } => Self::Penalty {
                percent_per_day,
                max_days,
            },
            LatePolicy::Cutoff { cutoff_at_unix } => Self::Cutoff {
                cutoff_at: cutoff_at_unix,
            },
        }
    }
}

/// The complete policy block. Replaced wholesale via `PUT`; the same shape
/// is returned on every assessment read. Ranges are validated server-side
/// (422 with field errors).
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone, Serialize, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    #[garde(skip)]
    pub grading_mode: GradingMode,
    #[garde(skip)]
    pub grade_release_mode: GradeReleaseMode,
    #[garde(skip)]
    pub completion_rule: CompletionRule,
    #[garde(skip)]
    pub passing_score: f64,
    /// `null` = unlimited.
    #[garde(skip)]
    pub max_attempts: Option<i32>,
    /// `null` = no limit.
    #[garde(skip)]
    pub time_limit_seconds: Option<i32>,
    #[garde(skip)]
    pub due_at_unix: Option<i64>,
    #[garde(skip)]
    pub allow_late: bool,
    #[garde(skip)]
    pub late_policy: LatePolicy,
    #[garde(skip)]
    pub required: bool,
    #[garde(skip)]
    pub review_visibility: ReviewVisibility,
    #[garde(skip)]
    pub randomize_questions: bool,
    #[garde(skip)]
    pub randomize_options: bool,
    #[garde(skip)]
    pub partial_credit: bool,
    #[garde(skip)]
    pub negative_marking_percent: f64,
    #[garde(skip)]
    pub grace_period_minutes: i32,
    #[garde(skip)]
    pub copy_paste_protection: bool,
    #[garde(skip)]
    pub tab_switch_detection: bool,
    #[garde(skip)]
    pub devtools_detection: bool,
    #[garde(skip)]
    pub right_click_disabled: bool,
    #[garde(skip)]
    pub fullscreen_required: bool,
    #[garde(skip)]
    pub violation_threshold: i32,
    /// Max-score cap per extra attempt (0 = off).
    #[garde(skip)]
    pub attempt_penalty_percent: f64,
}

impl From<PolicyInput> for Policy {
    fn from(p: PolicyInput) -> Self {
        Self {
            grading_mode: p.grading_mode,
            grade_release_mode: p.grade_release_mode,
            completion_rule: p.completion_rule,
            passing_score: p.passing_score,
            max_attempts: p.max_attempts,
            time_limit_seconds: p.time_limit_seconds,
            due_at_unix: p.due_at,
            allow_late: p.allow_late,
            late_policy: p.late_policy.into(),
            required: p.required,
            review_visibility: p.review_visibility,
            randomize_questions: p.randomize_questions,
            randomize_options: p.randomize_options,
            partial_credit: p.partial_credit,
            negative_marking_percent: p.negative_marking_percent,
            grace_period_minutes: p.grace_period_minutes,
            copy_paste_protection: p.copy_paste_protection,
            tab_switch_detection: p.tab_switch_detection,
            devtools_detection: p.devtools_detection,
            right_click_disabled: p.right_click_disabled,
            fullscreen_required: p.fullscreen_required,
            violation_threshold: p.violation_threshold,
            attempt_penalty_percent: p.attempt_penalty_percent,
        }
    }
}

impl From<Policy> for PolicyInput {
    fn from(p: Policy) -> Self {
        Self {
            grading_mode: p.grading_mode,
            grade_release_mode: p.grade_release_mode,
            completion_rule: p.completion_rule,
            passing_score: p.passing_score,
            max_attempts: p.max_attempts,
            time_limit_seconds: p.time_limit_seconds,
            due_at: p.due_at_unix,
            allow_late: p.allow_late,
            late_policy: p.late_policy.into(),
            required: p.required,
            review_visibility: p.review_visibility,
            randomize_questions: p.randomize_questions,
            randomize_options: p.randomize_options,
            partial_credit: p.partial_credit,
            negative_marking_percent: p.negative_marking_percent,
            grace_period_minutes: p.grace_period_minutes,
            copy_paste_protection: p.copy_paste_protection,
            tab_switch_detection: p.tab_switch_detection,
            devtools_detection: p.devtools_detection,
            right_click_disabled: p.right_click_disabled,
            fullscreen_required: p.fullscreen_required,
            violation_threshold: p.violation_threshold,
            attempt_penalty_percent: p.attempt_penalty_percent,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct Assessment {
    pub id: AssessmentId,
    pub activity_id: ActivityId,
    pub course_id: CourseId,
    pub kind: AssessmentKind,
    pub title: String,
    pub description: String,
    pub lifecycle: Lifecycle,
    pub scheduled_at_unix: Option<i64>,
    pub published_at_unix: Option<i64>,
    pub archived_at_unix: Option<i64>,
    pub weight: f64,
    pub grading_type: GradingType,
    pub content_version: i32,
    pub policy_version: i32,
    pub policy: Policy,
    pub access_mode: AccessMode,
    pub creator_id: Option<UserId>,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl From<service::Assessment> for Assessment {
    fn from(a: service::Assessment) -> Self {
        let policy = PolicyInput::from_row(&a).into();
        Self {
            id: a.id,
            activity_id: a.activity_id,
            course_id: a.course_id,
            kind: a.kind,
            title: a.title,
            description: a.description,
            lifecycle: a.lifecycle,
            scheduled_at_unix: a.scheduled_at,
            published_at_unix: a.published_at,
            archived_at_unix: a.archived_at,
            weight: a.weight,
            grading_type: a.grading_type,
            content_version: a.content_version,
            policy_version: a.policy_version,
            policy,
            access_mode: a.access_mode,
            creator_id: a.creator_id,
            created_at_unix: a.created_at,
            updated_at_unix: a.updated_at,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ItemMetadata {
    #[garde(inner(length(max = 200)))]
    pub section_label: Option<String>,
    #[garde(skip)]
    pub difficulty: Option<Difficulty>,
    #[garde(length(max = 50), inner(length(max = 64)))]
    #[serde(default)]
    pub tags: Vec<String>,
    #[garde(length(max = 50), inner(length(max = 64)))]
    #[serde(default)]
    pub outcome_ids: Vec<String>,
    #[garde(inner(range(min = 0)))]
    pub estimated_minutes: Option<i32>,
}

impl From<ItemMetadata> for service::ItemMetadataInput {
    fn from(m: ItemMetadata) -> Self {
        Self {
            section_label: m.section_label,
            difficulty: m.difficulty,
            tags: m.tags,
            outcome_ids: m.outcome_ids,
            estimated_minutes: m.estimated_minutes,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AssessmentItem {
    pub id: AssessmentItemId,
    /// 1-based, contiguous.
    pub position: i32,
    pub kind: ItemKind,
    pub title: String,
    pub body: ItemBody,
    pub max_score: f64,
    pub metadata: ItemMetadata,
}

impl From<service::Item> for AssessmentItem {
    fn from(i: service::Item) -> Self {
        Self {
            id: i.id,
            position: i.position,
            kind: i.kind,
            title: i.title,
            body: i.body,
            max_score: i.max_score,
            metadata: ItemMetadata {
                section_label: i.section_label,
                difficulty: i.difficulty,
                tags: i.tags,
                outcome_ids: i.outcome_ids,
                estimated_minutes: i.estimated_minutes,
            },
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AssessmentDetail {
    #[serde(flatten)]
    pub assessment: Assessment,
    pub items: Vec<AssessmentItem>,
}

impl From<service::AssessmentDetail> for AssessmentDetail {
    fn from(d: service::AssessmentDetail) -> Self {
        Self {
            assessment: d.assessment.into(),
            items: d.items.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateAssessmentRequest {
    /// The activity is appended to this chapter.
    #[garde(skip)]
    pub chapter_id: ChapterId,
    #[garde(skip)]
    pub kind: AssessmentKind,
    #[garde(length(min = 1, max = 500))]
    pub title: String,
    #[garde(length(max = 20_000))]
    pub description: Option<String>,
    #[garde(inner(range(min = 0.0)))]
    pub weight: Option<f64>,
    #[garde(skip)]
    pub grading_type: Option<GradingType>,
    /// Omit to start from the kind's preset.
    #[garde(dive)]
    pub policy: Option<Policy>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateAssessmentRequest {
    #[garde(inner(length(min = 1, max = 500)))]
    pub title: Option<String>,
    #[garde(inner(length(max = 20_000)))]
    pub description: Option<String>,
    #[garde(inner(range(min = 0.0)))]
    pub weight: Option<f64>,
    #[garde(skip)]
    pub grading_type: Option<GradingType>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct LifecycleRequest {
    #[garde(skip)]
    pub to: Lifecycle,
    /// Required when `to` is `scheduled`; must be in the future.
    #[garde(skip)]
    pub scheduled_at_unix: Option<i64>,
    #[garde(inner(length(max = 1000)))]
    pub note: Option<String>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateItemRequest {
    #[garde(inner(length(max = 500)))]
    pub title: Option<String>,
    /// Tagged on `kind`; must be a kind the assessment allows.
    #[garde(skip)]
    pub body: ItemBody,
    #[garde(inner(range(min = 0.0)))]
    pub max_score: Option<f64>,
    #[garde(dive)]
    pub metadata: Option<ItemMetadata>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateItemRequest {
    #[garde(inner(length(max = 500)))]
    pub title: Option<String>,
    #[garde(skip)]
    pub body: Option<ItemBody>,
    #[garde(inner(range(min = 0.0)))]
    pub max_score: Option<f64>,
    /// Replaces the whole metadata block when present.
    #[garde(dive)]
    pub metadata: Option<ItemMetadata>,
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReorderItemsRequest {
    /// Item ids in the desired order; omitted items follow in their
    /// current order.
    #[garde(length(min = 1, max = 200))]
    pub items: Vec<AssessmentItemId>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AuditEvent {
    pub id: uuid::Uuid,
    pub actor_id: Option<UserId>,
    pub event: String,
    pub payload: serde_json::Value,
    pub created_at_unix: i64,
}

impl From<service::AuditEvent> for AuditEvent {
    fn from(e: service::AuditEvent) -> Self {
        Self {
            id: e.id,
            actor_id: e.actor_id,
            event: e.event,
            payload: e.payload,
            created_at_unix: e.created_at,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DuplicateRequest {
    /// Defaults to `"<title> (copy)"`.
    #[garde(inner(length(min = 1, max = 500)))]
    pub title: Option<String>,
    /// Target chapter in the same course; defaults to the source's chapter.
    #[garde(skip)]
    pub chapter_id: Option<ChapterId>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct AuditQuery {
    /// 1..=200, default 50.
    pub limit: Option<i64>,
}

// ── Access lists ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, ToSchema)]
pub struct AccessUser {
    pub id: UserId,
    pub username: String,
    pub display_name: String,
    pub avatar_key: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AccessGroup {
    pub id: ab_core::id::UsergroupId,
    pub name: String,
    pub member_count: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AccessView {
    pub mode: AccessMode,
    /// Only meaningful while `mode` is `restricted`.
    pub users: Vec<AccessUser>,
    pub usergroups: Vec<AccessGroup>,
    /// Distinct people reachable through both lists.
    pub effective_user_count: i64,
}

impl From<ab_domain::assessments::access::AccessView> for AccessView {
    fn from(v: ab_domain::assessments::access::AccessView) -> Self {
        Self {
            mode: v.mode,
            users: v
                .users
                .into_iter()
                .map(|u| AccessUser {
                    id: u.id,
                    username: u.username,
                    display_name: u.display_name,
                    avatar_key: u.avatar_key,
                })
                .collect(),
            usergroups: v
                .usergroups
                .into_iter()
                .map(|g| AccessGroup {
                    id: g.id,
                    name: g.name,
                    member_count: g.member_count,
                })
                .collect(),
            effective_user_count: v.effective_user_count,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SetAccessRequest {
    #[garde(skip)]
    pub mode: AccessMode,
    /// Direct allowlist (restricted mode); each must already have course access.
    #[garde(length(max = 500))]
    #[serde(default)]
    pub user_ids: Vec<UserId>,
    /// Group allowlist (restricted mode); each must be linked to the course.
    #[garde(length(max = 100))]
    #[serde(default)]
    pub usergroup_ids: Vec<ab_core::id::UsergroupId>,
}

// ── Per-student overrides ───────────────────────────────────────────────────

#[derive(Debug, Serialize, ToSchema)]
pub struct StudentOverride {
    pub id: uuid::Uuid,
    pub user_id: UserId,
    pub max_attempts_override: Option<i32>,
    pub due_at_override_unix: Option<i64>,
    pub waive_late_penalty: bool,
    pub note: String,
    pub expires_at_unix: Option<i64>,
    pub granted_by: Option<UserId>,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl From<ab_domain::assessments::access::Override> for StudentOverride {
    fn from(o: ab_domain::assessments::access::Override) -> Self {
        Self {
            id: o.id,
            user_id: o.user_id,
            max_attempts_override: o.max_attempts_override,
            due_at_override_unix: o.due_at_override,
            waive_late_penalty: o.waive_late_penalty,
            note: o.note,
            expires_at_unix: o.expires_at,
            granted_by: o.granted_by,
            created_at_unix: o.created_at,
            updated_at_unix: o.updated_at,
        }
    }
}

/// Full override block (create and update share it).
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct OverrideRequest {
    /// 1..=10; `null` keeps the assessment's limit.
    #[garde(skip)]
    pub max_attempts_override: Option<i32>,
    #[garde(skip)]
    pub due_at_override_unix: Option<i64>,
    #[garde(skip)]
    #[serde(default)]
    pub waive_late_penalty: bool,
    #[garde(length(max = 1000))]
    #[serde(default)]
    pub note: String,
    /// After this the override is ignored.
    #[garde(skip)]
    pub expires_at_unix: Option<i64>,
}

impl From<OverrideRequest> for ab_domain::assessments::access::OverrideInput {
    fn from(r: OverrideRequest) -> Self {
        Self {
            max_attempts_override: r.max_attempts_override,
            due_at_override: r.due_at_override_unix,
            waive_late_penalty: r.waive_late_penalty,
            note: r.note,
            expires_at: r.expires_at_unix,
        }
    }
}

// ── Student-facing ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, ToSchema)]
pub struct EffectivePolicy {
    pub max_attempts: Option<i32>,
    pub due_at_unix: Option<i64>,
    pub time_limit_seconds: Option<i32>,
    pub allow_late: bool,
    pub passing_score: f64,
    pub late_policy: LatePolicy,
    pub waive_late_penalty: bool,
    /// An unexpired per-student override shaped this.
    pub override_applied: bool,
}

/// What the learner may do right now.
#[derive(Debug, Serialize, ToSchema)]
pub struct AttemptState {
    pub lifecycle: Lifecycle,
    pub opens_at_unix: Option<i64>,
    pub is_teacher_preview: bool,
    pub effective: EffectivePolicy,
    pub disabled_reasons: Vec<ab_domain::assessments::access::DisabledReason>,
    /// No open draft and nothing blocks a new attempt.
    pub can_start: bool,
    /// An open draft exists and may still be worked on.
    pub can_continue: bool,
    pub draft_id: Option<ab_core::id::SubmissionId>,
    pub attempts_used: i64,
    /// `null` = unlimited.
    pub attempts_remaining: Option<i64>,
}

impl From<ab_domain::assessments::access::AttemptState> for AttemptState {
    fn from(s: ab_domain::assessments::access::AttemptState) -> Self {
        Self {
            can_continue: s.can_continue,
            draft_id: s.draft_id,
            attempts_used: s.attempts_used,
            attempts_remaining: s.attempts_remaining,
            lifecycle: s.lifecycle,
            opens_at_unix: s.opens_at,
            is_teacher_preview: s.is_teacher_preview,
            effective: EffectivePolicy {
                max_attempts: s.effective.max_attempts,
                due_at_unix: s.effective.due_at,
                time_limit_seconds: s.effective.time_limit_seconds,
                allow_late: s.effective.allow_late,
                passing_score: s.effective.passing_score,
                late_policy: s.effective.late_policy.into(),
                waive_late_penalty: s.effective.waive_late_penalty,
                override_applied: s.effective.override_applied,
            },
            disabled_reasons: s.disabled_reasons,
            can_start: s.can_start,
        }
    }
}
