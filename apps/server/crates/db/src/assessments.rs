//! Assessment queries (compile-checked).
//!
//! Enum columns decode through the `ab_core::assessments` text enums via
//! column overrides and are bound as `as_str()` — see that module.
//! Timestamps travel as epoch seconds like everywhere else in this crate.

use ab_core::Result;
use ab_core::assessments::{
    AccessMode, AssessmentKind, CompletionRule, Difficulty, GradeReleaseMode, GradingMode,
    GradingType, ItemKind, LatePolicyKind, Lifecycle, ReviewVisibility,
};
use ab_core::id::{ActivityId, AssessmentId, AssessmentItemId, CourseId, UserId, UsergroupId};
use sqlx::PgPool;

/// Epoch seconds → `to_timestamp()` argument. Exact below 2^53 (year ~285M).
#[allow(clippy::cast_precision_loss)]
const fn epoch(t: Option<i64>) -> Option<f64> {
    match t {
        Some(t) => Some(t as f64),
        None => None,
    }
}

// Flat mirror of the table (query_as! needs flat fields); the flags are
// genuinely independent columns, not a state machine in disguise.
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone)]
pub struct AssessmentRow {
    pub id: AssessmentId,
    pub activity_id: ActivityId,
    pub course_id: CourseId,
    pub kind: AssessmentKind,
    pub title: String,
    pub description: String,
    pub lifecycle: Lifecycle,
    pub scheduled_at: Option<i64>,
    pub published_at: Option<i64>,
    pub archived_at: Option<i64>,
    pub weight: f64,
    pub grading_type: GradingType,
    pub content_version: i32,
    pub policy_version: i32,
    pub grading_mode: GradingMode,
    pub grade_release_mode: GradeReleaseMode,
    pub completion_rule: CompletionRule,
    pub passing_score: f64,
    pub max_attempts: Option<i32>,
    pub time_limit_seconds: Option<i32>,
    pub due_at: Option<i64>,
    pub allow_late: bool,
    pub late_policy_kind: LatePolicyKind,
    pub late_penalty_percent_per_day: Option<f64>,
    pub late_penalty_max_days: Option<i32>,
    pub late_cutoff_at: Option<i64>,
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
    pub attempt_penalty_percent: f64,
    pub access_mode: AccessMode,
    pub creator_id: Option<UserId>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// The full policy block, used for create and for policy patches (every
/// field is written; the service merges the patch over the current row).
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone)]
pub struct PolicyValues {
    pub grading_mode: GradingMode,
    pub grade_release_mode: GradeReleaseMode,
    pub completion_rule: CompletionRule,
    pub passing_score: f64,
    pub max_attempts: Option<i32>,
    pub time_limit_seconds: Option<i32>,
    pub due_at: Option<i64>,
    pub allow_late: bool,
    pub late_policy_kind: LatePolicyKind,
    pub late_penalty_percent_per_day: Option<f64>,
    pub late_penalty_max_days: Option<i32>,
    pub late_cutoff_at: Option<i64>,
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
    pub attempt_penalty_percent: f64,
}

impl AssessmentRow {
    /// The current policy block (patch base).
    #[must_use]
    pub const fn policy(&self) -> PolicyValues {
        PolicyValues {
            grading_mode: self.grading_mode,
            grade_release_mode: self.grade_release_mode,
            completion_rule: self.completion_rule,
            passing_score: self.passing_score,
            max_attempts: self.max_attempts,
            time_limit_seconds: self.time_limit_seconds,
            due_at: self.due_at,
            allow_late: self.allow_late,
            late_policy_kind: self.late_policy_kind,
            late_penalty_percent_per_day: self.late_penalty_percent_per_day,
            late_penalty_max_days: self.late_penalty_max_days,
            late_cutoff_at: self.late_cutoff_at,
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

pub struct NewAssessment<'a> {
    pub activity_id: ActivityId,
    pub course_id: CourseId,
    pub kind: AssessmentKind,
    pub title: &'a str,
    pub description: &'a str,
    pub weight: f64,
    pub grading_type: GradingType,
    pub creator_id: UserId,
    pub policy: &'a PolicyValues,
}

pub async fn insert_assessment(pool: &PgPool, new: NewAssessment<'_>) -> Result<AssessmentId> {
    let p = new.policy;
    let id = sqlx::query_scalar!(
        r#"INSERT INTO assessments (
               activity_id, course_id, kind, title, description, weight, grading_type,
               creator_id,
               grading_mode, grade_release_mode, completion_rule, passing_score,
               max_attempts, time_limit_seconds, due_at, allow_late,
               late_policy_kind, late_penalty_percent_per_day, late_penalty_max_days,
               late_cutoff_at,
               required, review_visibility, randomize_questions, randomize_options,
               partial_credit, negative_marking_percent, grace_period_minutes,
               copy_paste_protection, tab_switch_detection, devtools_detection,
               right_click_disabled, fullscreen_required, violation_threshold,
               attempt_penalty_percent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                   $9, $10, $11, $12, $13, $14, to_timestamp($15), $16,
                   $17, $18, $19, to_timestamp($20),
                   $21, $22, $23, $24, $25, $26, $27,
                   $28, $29, $30, $31, $32, $33, $34)
           RETURNING id"#,
        new.activity_id.0,
        new.course_id.0,
        new.kind.as_str(),
        new.title,
        new.description,
        new.weight,
        new.grading_type.as_str(),
        new.creator_id.0,
        p.grading_mode.as_str(),
        p.grade_release_mode.as_str(),
        p.completion_rule.as_str(),
        p.passing_score,
        p.max_attempts,
        p.time_limit_seconds,
        epoch(p.due_at),
        p.allow_late,
        p.late_policy_kind.as_str(),
        p.late_penalty_percent_per_day,
        p.late_penalty_max_days,
        epoch(p.late_cutoff_at),
        p.required,
        p.review_visibility.as_str(),
        p.randomize_questions,
        p.randomize_options,
        p.partial_credit,
        p.negative_marking_percent,
        p.grace_period_minutes,
        p.copy_paste_protection,
        p.tab_switch_detection,
        p.devtools_detection,
        p.right_click_disabled,
        p.fullscreen_required,
        p.violation_threshold,
        p.attempt_penalty_percent
    )
    .fetch_one(pool)
    .await?;
    Ok(AssessmentId(id))
}

pub async fn get_assessment(pool: &PgPool, id: AssessmentId) -> Result<Option<AssessmentRow>> {
    let row = sqlx::query_as!(
        AssessmentRow,
        r#"SELECT id AS "id: AssessmentId", activity_id AS "activity_id: ActivityId",
                  course_id AS "course_id: CourseId", kind AS "kind: AssessmentKind",
                  title, description, lifecycle AS "lifecycle: Lifecycle",
                  (extract(epoch FROM scheduled_at))::bigint AS "scheduled_at?",
                  (extract(epoch FROM published_at))::bigint AS "published_at?",
                  (extract(epoch FROM archived_at))::bigint AS "archived_at?",
                  weight, grading_type AS "grading_type: GradingType",
                  content_version, policy_version,
                  grading_mode AS "grading_mode: GradingMode",
                  grade_release_mode AS "grade_release_mode: GradeReleaseMode",
                  completion_rule AS "completion_rule: CompletionRule",
                  passing_score, max_attempts, time_limit_seconds,
                  (extract(epoch FROM due_at))::bigint AS "due_at?",
                  allow_late, late_policy_kind AS "late_policy_kind: LatePolicyKind",
                  late_penalty_percent_per_day, late_penalty_max_days,
                  (extract(epoch FROM late_cutoff_at))::bigint AS "late_cutoff_at?",
                  required, review_visibility AS "review_visibility: ReviewVisibility",
                  randomize_questions, randomize_options, partial_credit,
                  negative_marking_percent, grace_period_minutes,
                  copy_paste_protection, tab_switch_detection, devtools_detection,
                  right_click_disabled, fullscreen_required, violation_threshold,
                  attempt_penalty_percent,
                  access_mode AS "access_mode: AccessMode",
                  creator_id AS "creator_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM assessments WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn get_assessment_by_activity(
    pool: &PgPool,
    activity_id: ActivityId,
) -> Result<Option<AssessmentRow>> {
    let row = sqlx::query_as!(
        AssessmentRow,
        r#"SELECT id AS "id: AssessmentId", activity_id AS "activity_id: ActivityId",
                  course_id AS "course_id: CourseId", kind AS "kind: AssessmentKind",
                  title, description, lifecycle AS "lifecycle: Lifecycle",
                  (extract(epoch FROM scheduled_at))::bigint AS "scheduled_at?",
                  (extract(epoch FROM published_at))::bigint AS "published_at?",
                  (extract(epoch FROM archived_at))::bigint AS "archived_at?",
                  weight, grading_type AS "grading_type: GradingType",
                  content_version, policy_version,
                  grading_mode AS "grading_mode: GradingMode",
                  grade_release_mode AS "grade_release_mode: GradeReleaseMode",
                  completion_rule AS "completion_rule: CompletionRule",
                  passing_score, max_attempts, time_limit_seconds,
                  (extract(epoch FROM due_at))::bigint AS "due_at?",
                  allow_late, late_policy_kind AS "late_policy_kind: LatePolicyKind",
                  late_penalty_percent_per_day, late_penalty_max_days,
                  (extract(epoch FROM late_cutoff_at))::bigint AS "late_cutoff_at?",
                  required, review_visibility AS "review_visibility: ReviewVisibility",
                  randomize_questions, randomize_options, partial_credit,
                  negative_marking_percent, grace_period_minutes,
                  copy_paste_protection, tab_switch_detection, devtools_detection,
                  right_click_disabled, fullscreen_required, violation_threshold,
                  attempt_penalty_percent,
                  access_mode AS "access_mode: AccessMode",
                  creator_id AS "creator_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM assessments WHERE activity_id = $1"#,
        activity_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_assessments_for_course(
    pool: &PgPool,
    course_id: CourseId,
) -> Result<Vec<AssessmentRow>> {
    let rows = sqlx::query_as!(
        AssessmentRow,
        r#"SELECT id AS "id: AssessmentId", activity_id AS "activity_id: ActivityId",
                  course_id AS "course_id: CourseId", kind AS "kind: AssessmentKind",
                  title, description, lifecycle AS "lifecycle: Lifecycle",
                  (extract(epoch FROM scheduled_at))::bigint AS "scheduled_at?",
                  (extract(epoch FROM published_at))::bigint AS "published_at?",
                  (extract(epoch FROM archived_at))::bigint AS "archived_at?",
                  weight, grading_type AS "grading_type: GradingType",
                  content_version, policy_version,
                  grading_mode AS "grading_mode: GradingMode",
                  grade_release_mode AS "grade_release_mode: GradeReleaseMode",
                  completion_rule AS "completion_rule: CompletionRule",
                  passing_score, max_attempts, time_limit_seconds,
                  (extract(epoch FROM due_at))::bigint AS "due_at?",
                  allow_late, late_policy_kind AS "late_policy_kind: LatePolicyKind",
                  late_penalty_percent_per_day, late_penalty_max_days,
                  (extract(epoch FROM late_cutoff_at))::bigint AS "late_cutoff_at?",
                  required, review_visibility AS "review_visibility: ReviewVisibility",
                  randomize_questions, randomize_options, partial_credit,
                  negative_marking_percent, grace_period_minutes,
                  copy_paste_protection, tab_switch_detection, devtools_detection,
                  right_click_disabled, fullscreen_required, violation_threshold,
                  attempt_penalty_percent,
                  access_mode AS "access_mode: AccessMode",
                  creator_id AS "creator_id: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM assessments WHERE course_id = $1 ORDER BY id"#,
        course_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Title/description/weight/grading type (the non-policy scalars).
pub async fn update_assessment_details(
    pool: &PgPool,
    id: AssessmentId,
    title: Option<&str>,
    description: Option<&str>,
    weight: Option<f64>,
    grading_type: Option<GradingType>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE assessments SET
               title = COALESCE($2, title),
               description = COALESCE($3, description),
               weight = COALESCE($4, weight),
               grading_type = COALESCE($5, grading_type)
           WHERE id = $1"#,
        id.0,
        title,
        description,
        weight,
        grading_type.map(GradingType::as_str)
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Replace the whole policy block and bump `policy_version`.
pub async fn update_policy(pool: &PgPool, id: AssessmentId, p: &PolicyValues) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE assessments SET
               grading_mode = $2, grade_release_mode = $3, completion_rule = $4,
               passing_score = $5, max_attempts = $6, time_limit_seconds = $7,
               due_at = to_timestamp($8), allow_late = $9,
               late_policy_kind = $10, late_penalty_percent_per_day = $11,
               late_penalty_max_days = $12, late_cutoff_at = to_timestamp($13),
               required = $14, review_visibility = $15, randomize_questions = $16,
               randomize_options = $17, partial_credit = $18,
               negative_marking_percent = $19, grace_period_minutes = $20,
               copy_paste_protection = $21, tab_switch_detection = $22,
               devtools_detection = $23, right_click_disabled = $24,
               fullscreen_required = $25, violation_threshold = $26,
               attempt_penalty_percent = $27,
               policy_version = policy_version + 1
           WHERE id = $1"#,
        id.0,
        p.grading_mode.as_str(),
        p.grade_release_mode.as_str(),
        p.completion_rule.as_str(),
        p.passing_score,
        p.max_attempts,
        p.time_limit_seconds,
        epoch(p.due_at),
        p.allow_late,
        p.late_policy_kind.as_str(),
        p.late_penalty_percent_per_day,
        p.late_penalty_max_days,
        epoch(p.late_cutoff_at),
        p.required,
        p.review_visibility.as_str(),
        p.randomize_questions,
        p.randomize_options,
        p.partial_credit,
        p.negative_marking_percent,
        p.grace_period_minutes,
        p.copy_paste_protection,
        p.tab_switch_detection,
        p.devtools_detection,
        p.right_click_disabled,
        p.fullscreen_required,
        p.violation_threshold,
        p.attempt_penalty_percent
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Lifecycle write. Timestamps are set explicitly by the service per the
/// legacy field-effect table (keep vs clear vs stamp-if-missing).
pub async fn set_lifecycle(
    pool: &PgPool,
    id: AssessmentId,
    lifecycle: Lifecycle,
    scheduled_at: Option<i64>,
    published_at: Option<i64>,
    archived_at: Option<i64>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE assessments SET
               lifecycle = $2,
               scheduled_at = to_timestamp($3),
               published_at = to_timestamp($4),
               archived_at = to_timestamp($5)
           WHERE id = $1"#,
        id.0,
        lifecycle.as_str(),
        epoch(scheduled_at),
        epoch(published_at),
        epoch(archived_at)
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Auto-publish sweep: every scheduled assessment whose time has come.
pub async fn publish_due(pool: &PgPool) -> Result<Vec<AssessmentId>> {
    let ids = sqlx::query_scalar!(
        r#"UPDATE assessments
           SET lifecycle = 'published', published_at = now(), scheduled_at = NULL
           WHERE lifecycle = 'scheduled' AND scheduled_at <= now()
           RETURNING id AS "id: AssessmentId""#
    )
    .fetch_all(pool)
    .await?;
    Ok(ids)
}

pub async fn bump_content_version(pool: &PgPool, id: AssessmentId) -> Result<()> {
    sqlx::query!(
        "UPDATE assessments SET content_version = content_version + 1 WHERE id = $1",
        id.0
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_access_mode(pool: &PgPool, id: AssessmentId, mode: AccessMode) -> Result<()> {
    sqlx::query!(
        "UPDATE assessments SET access_mode = $2 WHERE id = $1",
        id.0,
        mode.as_str()
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Items ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ItemRow {
    pub id: AssessmentItemId,
    pub assessment_id: AssessmentId,
    pub position: i32,
    pub kind: ItemKind,
    pub title: String,
    pub body: serde_json::Value,
    pub max_score: f64,
    pub section_label: Option<String>,
    pub difficulty: Option<Difficulty>,
    pub tags: Vec<String>,
    pub outcome_ids: Vec<String>,
    pub estimated_minutes: Option<i32>,
}

pub struct ItemMetadata<'a> {
    pub section_label: Option<&'a str>,
    pub difficulty: Option<Difficulty>,
    pub tags: &'a [String],
    pub outcome_ids: &'a [String],
    pub estimated_minutes: Option<i32>,
}

pub async fn insert_item(
    pool: &PgPool,
    assessment_id: AssessmentId,
    kind: ItemKind,
    title: &str,
    body: &serde_json::Value,
    max_score: f64,
    meta: ItemMetadata<'_>,
) -> Result<AssessmentItemId> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO assessment_items
               (assessment_id, position, kind, title, body, max_score,
                section_label, difficulty, tags, outcome_ids, estimated_minutes)
           VALUES ($1,
                   (SELECT COALESCE(MAX(position), 0) + 1
                    FROM assessment_items WHERE assessment_id = $1),
                   $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id"#,
        assessment_id.0,
        kind.as_str(),
        title,
        body,
        max_score,
        meta.section_label,
        meta.difficulty.map(Difficulty::as_str),
        meta.tags,
        meta.outcome_ids,
        meta.estimated_minutes
    )
    .fetch_one(pool)
    .await?;
    Ok(AssessmentItemId(id))
}

pub async fn get_item(pool: &PgPool, id: AssessmentItemId) -> Result<Option<ItemRow>> {
    let row = sqlx::query_as!(
        ItemRow,
        r#"SELECT id AS "id: AssessmentItemId",
                  assessment_id AS "assessment_id: AssessmentId",
                  position, kind AS "kind: ItemKind", title, body, max_score,
                  section_label, difficulty AS "difficulty: Difficulty",
                  tags, outcome_ids, estimated_minutes
           FROM assessment_items WHERE id = $1"#,
        id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_items(pool: &PgPool, assessment_id: AssessmentId) -> Result<Vec<ItemRow>> {
    let rows = sqlx::query_as!(
        ItemRow,
        r#"SELECT id AS "id: AssessmentItemId",
                  assessment_id AS "assessment_id: AssessmentId",
                  position, kind AS "kind: ItemKind", title, body, max_score,
                  section_label, difficulty AS "difficulty: Difficulty",
                  tags, outcome_ids, estimated_minutes
           FROM assessment_items WHERE assessment_id = $1 ORDER BY position, id"#,
        assessment_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn count_items(pool: &PgPool, assessment_id: AssessmentId) -> Result<i64> {
    let count = sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM assessment_items WHERE assessment_id = $1"#,
        assessment_id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(count)
}

/// Partial update; `body` (when given) also rewrites `kind`; `meta` (when
/// given) replaces the whole metadata block.
pub async fn update_item(
    pool: &PgPool,
    id: AssessmentItemId,
    title: Option<&str>,
    body: Option<(ItemKind, &serde_json::Value)>,
    max_score: Option<f64>,
    meta: Option<ItemMetadata<'_>>,
) -> Result<bool> {
    let (kind, body) = match body {
        Some((kind, body)) => (Some(kind.as_str()), Some(body)),
        None => (None, None),
    };
    let empty: &[String] = &[];
    let updated = sqlx::query!(
        r#"UPDATE assessment_items SET
               title = COALESCE($2, title),
               kind = COALESCE($3, kind),
               body = COALESCE($4, body),
               max_score = COALESCE($5, max_score),
               section_label = CASE WHEN $6 THEN $7 ELSE section_label END,
               difficulty = CASE WHEN $6 THEN $8 ELSE difficulty END,
               tags = CASE WHEN $6 THEN $9 ELSE tags END,
               outcome_ids = CASE WHEN $6 THEN $10 ELSE outcome_ids END,
               estimated_minutes = CASE WHEN $6 THEN $11 ELSE estimated_minutes END
           WHERE id = $1"#,
        id.0,
        title,
        kind,
        body,
        max_score,
        meta.is_some(),
        meta.as_ref().and_then(|m| m.section_label),
        meta.as_ref()
            .and_then(|m| m.difficulty)
            .map(Difficulty::as_str),
        meta.as_ref().map_or(empty, |m| m.tags),
        meta.as_ref().map_or(empty, |m| m.outcome_ids),
        meta.as_ref().and_then(|m| m.estimated_minutes)
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

pub async fn delete_item(pool: &PgPool, id: AssessmentItemId) -> Result<bool> {
    let deleted = sqlx::query!("DELETE FROM assessment_items WHERE id = $1", id.0)
        .execute(pool)
        .await?;
    Ok(deleted.rows_affected() == 1)
}

pub async fn list_item_ids(
    pool: &PgPool,
    assessment_id: AssessmentId,
) -> Result<Vec<AssessmentItemId>> {
    let ids = sqlx::query_scalar!(
        r#"SELECT id AS "id: AssessmentItemId" FROM assessment_items
           WHERE assessment_id = $1 ORDER BY position, id"#,
        assessment_id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(ids)
}

/// Rewrite positions 1..n in one transaction.
pub async fn renumber_items(pool: &PgPool, ordered_ids: &[AssessmentItemId]) -> Result<()> {
    let mut tx = pool.begin().await?;
    for (index, id) in ordered_ids.iter().enumerate() {
        let position = i32::try_from(index).unwrap_or(i32::MAX).saturating_add(1);
        sqlx::query!(
            "UPDATE assessment_items SET position = $2 WHERE id = $1",
            id.0,
            position
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

// ── Audit ───────────────────────────────────────────────────────────────────

pub async fn insert_audit_event(
    pool: &PgPool,
    assessment_id: AssessmentId,
    actor_id: Option<UserId>,
    event: &str,
    payload: serde_json::Value,
) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO assessment_audit_events (assessment_id, actor_id, event, payload)
           VALUES ($1, $2, $3, $4)"#,
        assessment_id.0,
        actor_id.map(|u| u.0),
        event,
        payload
    )
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct AuditEventRow {
    pub id: uuid::Uuid,
    pub actor_id: Option<UserId>,
    pub event: String,
    pub payload: serde_json::Value,
    pub created_at: i64,
}

pub async fn list_audit_events(
    pool: &PgPool,
    assessment_id: AssessmentId,
    limit: i64,
) -> Result<Vec<AuditEventRow>> {
    let rows = sqlx::query_as!(
        AuditEventRow,
        r#"SELECT id, actor_id AS "actor_id: UserId", event, payload,
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM assessment_audit_events
           WHERE assessment_id = $1
           ORDER BY id DESC
           LIMIT $2"#,
        assessment_id.0,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// ── Submission activity (lock rules) ────────────────────────────────────────

/// Whether any submission exists for the assessment, and whether any of
/// them has left the draft state. Both legacy lock rules hang off these.
#[derive(Debug, Clone, Copy, Default)]
pub struct SubmissionActivity {
    pub any: bool,
    pub non_draft: bool,
}

pub async fn submission_activity(pool: &PgPool, id: AssessmentId) -> Result<SubmissionActivity> {
    let row = sqlx::query!(
        r#"SELECT EXISTS (SELECT 1 FROM submissions WHERE assessment_id = $1) AS "any!",
                  EXISTS (SELECT 1 FROM submissions
                          WHERE assessment_id = $1 AND status <> 'draft') AS "non_draft!""#,
        id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(SubmissionActivity {
        any: row.any,
        non_draft: row.non_draft,
    })
}
// ── Access lists ────────────────────────────────────────────────────────────

pub struct AccessUserRow {
    pub id: UserId,
    pub username: String,
    pub display_name: String,
    pub avatar_key: Option<String>,
}

pub struct AccessGroupRow {
    pub id: UsergroupId,
    pub name: String,
    pub member_count: i64,
}

pub async fn list_access_users(pool: &PgPool, id: AssessmentId) -> Result<Vec<AccessUserRow>> {
    let rows = sqlx::query_as!(
        AccessUserRow,
        r#"SELECT u.id AS "id: UserId", u.username, u.display_name, u.avatar_key
           FROM assessment_access_users a JOIN users u ON u.id = a.user_id
           WHERE a.assessment_id = $1 ORDER BY u.username"#,
        id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn list_access_usergroups(
    pool: &PgPool,
    id: AssessmentId,
) -> Result<Vec<AccessGroupRow>> {
    let rows = sqlx::query_as!(
        AccessGroupRow,
        r#"SELECT g.id AS "id: UsergroupId", g.name,
                  (SELECT count(*) FROM usergroup_members m
                   WHERE m.usergroup_id = g.id) AS "member_count!"
           FROM assessment_access_usergroups a JOIN usergroups g ON g.id = a.usergroup_id
           WHERE a.assessment_id = $1 ORDER BY g.name"#,
        id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Replace both allowlists wholesale (legacy delete-then-insert).
pub async fn replace_access_lists(
    pool: &PgPool,
    id: AssessmentId,
    user_ids: &[UserId],
    usergroup_ids: &[UsergroupId],
) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query!(
        "DELETE FROM assessment_access_users WHERE assessment_id = $1",
        id.0
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "DELETE FROM assessment_access_usergroups WHERE assessment_id = $1",
        id.0
    )
    .execute(&mut *tx)
    .await?;
    for user_id in user_ids {
        sqlx::query!(
            r#"INSERT INTO assessment_access_users (assessment_id, user_id)
               VALUES ($1, $2) ON CONFLICT DO NOTHING"#,
            id.0,
            user_id.0
        )
        .execute(&mut *tx)
        .await?;
    }
    for group_id in usergroup_ids {
        sqlx::query!(
            r#"INSERT INTO assessment_access_usergroups (assessment_id, usergroup_id)
               VALUES ($1, $2) ON CONFLICT DO NOTHING"#,
            id.0,
            group_id.0
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Distinct people reachable through the allowlists (direct + via groups).
pub async fn effective_access_count(pool: &PgPool, id: AssessmentId) -> Result<i64> {
    let count = sqlx::query_scalar!(
        r#"SELECT count(DISTINCT reach.user_id) AS "count!" FROM (
               SELECT user_id FROM assessment_access_users WHERE assessment_id = $1
               UNION
               SELECT m.user_id FROM assessment_access_usergroups g
               JOIN usergroup_members m ON m.usergroup_id = g.usergroup_id
               WHERE g.assessment_id = $1
           ) reach"#,
        id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(count)
}

/// Direct entry or membership of an allowlisted group.
pub async fn access_allows(pool: &PgPool, id: AssessmentId, user_id: UserId) -> Result<bool> {
    let allowed = sqlx::query_scalar!(
        r#"SELECT (
               EXISTS (SELECT 1 FROM assessment_access_users
                       WHERE assessment_id = $1 AND user_id = $2)
               OR EXISTS (SELECT 1 FROM assessment_access_usergroups g
                          JOIN usergroup_members m ON m.usergroup_id = g.usergroup_id
                          WHERE g.assessment_id = $1 AND m.user_id = $2)
           ) AS "allowed!""#,
        id.0,
        user_id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(allowed)
}

pub async fn usergroup_linked_to_course(
    pool: &PgPool,
    course_id: CourseId,
    usergroup_id: UsergroupId,
) -> Result<bool> {
    let linked = sqlx::query_scalar!(
        r#"SELECT EXISTS (
               SELECT 1 FROM usergroup_courses WHERE course_id = $1 AND usergroup_id = $2
           ) AS "linked!""#,
        course_id.0,
        usergroup_id.0
    )
    .fetch_one(pool)
    .await?;
    Ok(linked)
}

// ── Per-student overrides ───────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct OverrideRow {
    pub id: uuid::Uuid,
    pub assessment_id: AssessmentId,
    pub user_id: UserId,
    pub max_attempts_override: Option<i32>,
    pub due_at_override: Option<i64>,
    pub waive_late_penalty: bool,
    pub note: String,
    pub expires_at: Option<i64>,
    pub granted_by: Option<UserId>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct OverrideValues<'a> {
    pub max_attempts_override: Option<i32>,
    pub due_at_override: Option<i64>,
    pub waive_late_penalty: bool,
    pub note: &'a str,
    pub expires_at: Option<i64>,
    pub granted_by: UserId,
}

/// `None` when the (assessment, user) pair already has an override.
pub async fn insert_override(
    pool: &PgPool,
    id: AssessmentId,
    user_id: UserId,
    v: OverrideValues<'_>,
) -> Result<Option<uuid::Uuid>> {
    let row = sqlx::query_scalar!(
        r#"INSERT INTO assessment_overrides
               (assessment_id, user_id, max_attempts_override, due_at_override,
                waive_late_penalty, note, expires_at, granted_by)
           VALUES ($1, $2, $3, to_timestamp($4), $5, $6, to_timestamp($7), $8)
           ON CONFLICT (assessment_id, user_id) DO NOTHING
           RETURNING id"#,
        id.0,
        user_id.0,
        v.max_attempts_override,
        epoch(v.due_at_override),
        v.waive_late_penalty,
        v.note,
        epoch(v.expires_at),
        v.granted_by.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn update_override(
    pool: &PgPool,
    id: AssessmentId,
    user_id: UserId,
    v: OverrideValues<'_>,
) -> Result<bool> {
    let updated = sqlx::query!(
        r#"UPDATE assessment_overrides SET
               max_attempts_override = $3, due_at_override = to_timestamp($4),
               waive_late_penalty = $5, note = $6, expires_at = to_timestamp($7),
               granted_by = $8
           WHERE assessment_id = $1 AND user_id = $2"#,
        id.0,
        user_id.0,
        v.max_attempts_override,
        epoch(v.due_at_override),
        v.waive_late_penalty,
        v.note,
        epoch(v.expires_at),
        v.granted_by.0
    )
    .execute(pool)
    .await?;
    Ok(updated.rows_affected() == 1)
}

pub async fn delete_override(pool: &PgPool, id: AssessmentId, user_id: UserId) -> Result<bool> {
    let deleted = sqlx::query!(
        "DELETE FROM assessment_overrides WHERE assessment_id = $1 AND user_id = $2",
        id.0,
        user_id.0
    )
    .execute(pool)
    .await?;
    Ok(deleted.rows_affected() == 1)
}

pub async fn get_override(
    pool: &PgPool,
    id: AssessmentId,
    user_id: UserId,
) -> Result<Option<OverrideRow>> {
    let row = sqlx::query_as!(
        OverrideRow,
        r#"SELECT id, assessment_id AS "assessment_id: AssessmentId",
                  user_id AS "user_id: UserId", max_attempts_override,
                  (extract(epoch FROM due_at_override))::bigint AS "due_at_override?",
                  waive_late_penalty, note,
                  (extract(epoch FROM expires_at))::bigint AS "expires_at?",
                  granted_by AS "granted_by: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM assessment_overrides WHERE assessment_id = $1 AND user_id = $2"#,
        id.0,
        user_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_overrides(pool: &PgPool, id: AssessmentId) -> Result<Vec<OverrideRow>> {
    let rows = sqlx::query_as!(
        OverrideRow,
        r#"SELECT id, assessment_id AS "assessment_id: AssessmentId",
                  user_id AS "user_id: UserId", max_attempts_override,
                  (extract(epoch FROM due_at_override))::bigint AS "due_at_override?",
                  waive_late_penalty, note,
                  (extract(epoch FROM expires_at))::bigint AS "expires_at?",
                  granted_by AS "granted_by: UserId",
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM assessment_overrides WHERE assessment_id = $1 ORDER BY id"#,
        id.0
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
