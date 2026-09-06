//! Extraction from the legacy `openu` schema (apps/api/src/db/** SQLModel
//! tables as restored from production).
//!
//! Plain runtime `sqlx::query_as` — the legacy database is not ours to
//! compile against. Conventions: PG enum columns are cast to `text`,
//! timestamps come out as epoch seconds (`float8`, sub-second kept for
//! UUIDv7 ordering), `json` columns as `serde_json::Value`. A missing table
//! (partial restore, test fixture) extracts as empty and is noted.

use ab_core::Result;
use sqlx::postgres::PgRow;
use sqlx::{AssertSqlSafe, FromRow, PgPool};

/// Epoch-seconds expression for a timestamp column.
macro_rules! ts {
    ($col:literal) => {
        concat!("extract(epoch FROM ", $col, ")::float8 AS ", $col)
    };
    ($col:literal AS $alias:literal) => {
        concat!("extract(epoch FROM ", $col, ")::float8 AS ", $alias)
    };
}

/// Epoch seconds from a `character varying` date column (legacy `activity`
/// stored dates as strings in four formats): NULL when unparsable.
macro_rules! ts_text {
    ($col:literal) => {
        concat!(
            "CASE WHEN pg_input_is_valid(",
            $col,
            ", 'timestamptz') THEN extract(epoch FROM ",
            $col,
            "::timestamptz)::float8 END AS ",
            $col
        )
    };
}

pub async fn table_exists(pool: &PgPool, table: &str) -> Result<bool> {
    let exists: Option<bool> = sqlx::query_scalar("SELECT to_regclass($1) IS NOT NULL")
        .bind(format!("public.\"{table}\""))
        .fetch_one(pool)
        .await?;
    Ok(exists.unwrap_or(false))
}

pub async fn count(pool: &PgPool, table: &str) -> Result<i64> {
    if !table_exists(pool, table).await? {
        return Ok(0);
    }
    // SAFETY: `table` is one of the constant legacy table names in this
    // module, quoted as an identifier; never user input.
    let sql = AssertSqlSafe(format!("SELECT count(*) FROM public.\"{table}\""));
    let n: i64 = sqlx::query_scalar(sql).fetch_one(pool).await?;
    Ok(n)
}

/// Fetch every row of `table` through `select` (a complete `SELECT … ORDER BY`)
/// honouring `--limit`.
pub async fn fetch<T>(
    pool: &PgPool,
    table: &str,
    select: &str,
    limit: Option<i64>,
) -> Result<Vec<T>>
where
    T: for<'r> FromRow<'r, PgRow> + Send + Unpin,
{
    if !table_exists(pool, table).await? {
        tracing::warn!(table, "legacy table missing — extracting nothing");
        return Ok(Vec::new());
    }
    let sql = match limit {
        Some(n) => format!("{select} LIMIT {n}"),
        None => select.to_owned(),
    };
    // SAFETY: `select` is a constant in this module; `limit` is an integer.
    let rows = sqlx::query_as::<_, T>(AssertSqlSafe(sql))
        .fetch_all(pool)
        .await?;
    Ok(rows)
}

// ── Identity ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, FromRow)]
pub struct User {
    pub id: i32,
    pub user_uuid: String,
    pub username: String,
    pub first_name: String,
    pub last_name: String,
    pub middle_name: Option<String>,
    pub email: String,
    pub avatar_image: Option<String>,
    pub bio: Option<String>,
    pub locale: Option<String>,
    pub theme: Option<String>,
    pub hashed_password: Option<String>,
    pub auth_provider: String,
    pub google_sub: Option<String>,
    pub is_active: bool,
    pub is_superuser: bool,
    pub is_verified: bool,
    pub has_details: bool,
    pub has_profile: bool,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
}

pub async fn users(pool: &PgPool, limit: Option<i64>) -> Result<Vec<User>> {
    fetch(pool, "user", concat!(
        "SELECT id, user_uuid, username, first_name, last_name, middle_name, email, avatar_image, bio, locale, theme, ",
        "hashed_password, auth_provider, google_sub, is_active, is_superuser, is_verified, ",
        "(details IS NOT NULL AND details::text NOT IN ('{}', 'null')) AS has_details, ",
        "(profile IS NOT NULL AND profile::text NOT IN ('{}', 'null')) AS has_profile, ",
        ts!("created_at"), ", ", ts!("updated_at"),
        " FROM public.\"user\" ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct Role {
    pub id: i32,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub is_system: bool,
    pub priority: i32,
}

pub async fn roles(pool: &PgPool) -> Result<Vec<Role>> {
    fetch(
        pool,
        "roles",
        "SELECT id, slug, name, description, is_system, priority FROM roles ORDER BY id",
        None,
    )
    .await
}

#[derive(Debug, Clone, FromRow)]
pub struct RoleGrant {
    pub slug: String,
    pub permission: String,
}

pub async fn role_grants(pool: &PgPool) -> Result<Vec<RoleGrant>> {
    if !table_exists(pool, "role_permissions").await? || !table_exists(pool, "permissions").await? {
        return Ok(Vec::new());
    }
    fetch(pool, "roles", concat!(
        "SELECT r.slug, p.name AS permission FROM role_permissions rp ",
        "JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id ORDER BY r.slug, p.name"), None).await
}

#[derive(Debug, Clone, FromRow)]
pub struct UserRole {
    pub id: i32,
    pub user_id: i32,
    pub role_id: i32,
    pub assigned_at: Option<f64>,
}

pub async fn user_roles(pool: &PgPool, limit: Option<i64>) -> Result<Vec<UserRole>> {
    fetch(pool, "user_roles", concat!(
        "SELECT id, user_id, role_id, ", ts!("assigned_at"), " FROM user_roles ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AuthAudit {
    pub id: i32,
    pub created_at: Option<f64>,
    pub user_id: Option<String>,
    pub event_type: String,
    pub session_id: Option<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub severity: String,
}

pub async fn auth_audit(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AuthAudit>> {
    fetch(pool, "auth_audit_log", concat!(
        "SELECT id, ", ts!("created_at"), ", user_id, event_type, session_id, ip_address, user_agent, metadata, severity ",
        "FROM auth_audit_log ORDER BY id"), limit).await
}

// ── Catalog ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, FromRow)]
pub struct Platform {
    pub name: String,
    pub description: Option<String>,
    pub about: Option<String>,
    pub logo_image: Option<String>,
    pub thumbnail_image: Option<String>,
    pub label: Option<String>,
    pub email: String,
}

pub async fn platform(pool: &PgPool) -> Result<Option<Platform>> {
    let rows: Vec<Platform> = fetch(pool, "platform", concat!(
        "SELECT name, description, about, logo_image, thumbnail_image, label, email FROM platform ORDER BY id"), Some(1)).await?;
    Ok(rows.into_iter().next())
}

#[derive(Debug, Clone, FromRow)]
pub struct Course {
    pub id: i32,
    pub course_uuid: String,
    pub name: String,
    pub description: Option<String>,
    pub about: Option<String>,
    pub learnings: Option<String>,
    pub tags: Option<String>,
    pub thumbnail_type: Option<String>,
    pub thumbnail_image: Option<String>,
    pub thumbnail_video: Option<String>,
    pub public: bool,
    pub open_to_contributors: bool,
    pub creator_id: Option<i64>,
    pub creation_date: Option<f64>,
    pub update_date: Option<f64>,
}

pub async fn courses(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Course>> {
    fetch(pool, "course", concat!(
        "SELECT id, course_uuid, name, description, about, learnings, tags, thumbnail_type::text AS thumbnail_type, ",
        "thumbnail_image, thumbnail_video, public, open_to_contributors, creator_id, ",
        ts!("creation_date"), ", ", ts!("update_date"), " FROM course ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct Chapter {
    pub id: i32,
    pub chapter_uuid: String,
    pub name: String,
    pub description: Option<String>,
    pub thumbnail_image: Option<String>,
    pub course_id: Option<i32>,
    pub creator_id: Option<i64>,
    pub order: i32,
    pub creation_date: Option<f64>,
    pub update_date: Option<f64>,
}

pub async fn chapters(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Chapter>> {
    fetch(pool, "chapter", concat!(
        "SELECT id, chapter_uuid, name, description, thumbnail_image, course_id, creator_id, \"order\" AS \"order\", ",
        ts!("creation_date"), ", ", ts!("update_date"), " FROM chapter ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct Activity {
    pub id: i32,
    pub activity_uuid: String,
    pub name: String,
    pub activity_type: String,
    pub activity_sub_type: String,
    pub content: Option<serde_json::Value>,
    pub details: Option<serde_json::Value>,
    pub settings: Option<serde_json::Value>,
    pub published: bool,
    pub creator_id: Option<i64>,
    pub chapter_id: i32,
    pub course_id: Option<i32>,
    pub order: i32,
    pub creation_date: Option<f64>,
    pub update_date: Option<f64>,
}

pub async fn activities(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Activity>> {
    fetch(pool, "activity", concat!(
        "SELECT id, activity_uuid, name, activity_type::text AS activity_type, activity_sub_type::text AS activity_sub_type, ",
        "content, details, settings, published, creator_id, chapter_id, course_id, \"order\" AS \"order\", ",
        ts_text!("creation_date"), ", ", ts_text!("update_date"), " FROM activity ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct Block {
    pub id: i32,
    pub block_uuid: String,
    pub block_type: String,
    pub content: Option<serde_json::Value>,
    pub activity_id: Option<i32>,
    pub creation_date: Option<f64>,
    pub update_date: Option<f64>,
}

pub async fn blocks(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Block>> {
    fetch(pool, "block", concat!(
        "SELECT id, block_uuid, block_type::text AS block_type, content, activity_id, ",
        ts!("creation_date"), ", ", ts!("update_date"), " FROM block ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct Collection {
    pub id: i32,
    pub collection_uuid: String,
    pub name: String,
    pub description: Option<String>,
    pub public: bool,
    pub creator_id: Option<i64>,
    pub creation_date: Option<f64>,
    pub update_date: Option<f64>,
}

pub async fn collections(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Collection>> {
    fetch(pool, "collection", concat!(
        "SELECT id, collection_uuid, name, description, public, creator_id, ",
        ts!("creation_date"), ", ", ts!("update_date"), " FROM collection ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct CollectionCourse {
    pub id: i32,
    pub collection_id: Option<i32>,
    pub course_id: Option<i32>,
    pub creation_date: Option<f64>,
}

pub async fn collection_courses(pool: &PgPool, limit: Option<i64>) -> Result<Vec<CollectionCourse>> {
    fetch(pool, "collectioncourse", concat!(
        "SELECT id, collection_id, course_id, ", ts!("creation_date"), " FROM collectioncourse ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct CourseUpdate {
    pub id: i32,
    pub courseupdate_uuid: String,
    pub title: String,
    pub content: String,
    pub course_id: Option<i32>,
    pub linked_activity_uuids: Option<String>,
    pub creation_date: Option<f64>,
    pub update_date: Option<f64>,
}

pub async fn course_updates(pool: &PgPool, limit: Option<i64>) -> Result<Vec<CourseUpdate>> {
    fetch(pool, "courseupdate", concat!(
        "SELECT id, courseupdate_uuid, title, content, course_id, linked_activity_uuids, ",
        ts!("creation_date"), ", ", ts!("update_date"), " FROM courseupdate ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct Certification {
    pub id: i32,
    pub certification_uuid: String,
    pub course_id: Option<i32>,
    pub config: Option<serde_json::Value>,
    pub creation_date: Option<f64>,
    pub update_date: Option<f64>,
}

pub async fn certifications(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Certification>> {
    fetch(pool, "certifications", concat!(
        "SELECT id, certification_uuid, course_id, config, ",
        ts!("creation_date"), ", ", ts!("update_date"), " FROM certifications ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct CertificateUser {
    pub id: i32,
    pub user_certification_uuid: String,
    pub user_id: Option<i32>,
    pub certification_id: Option<i32>,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
}

pub async fn certificate_users(pool: &PgPool, limit: Option<i64>) -> Result<Vec<CertificateUser>> {
    fetch(pool, "certificateuser", concat!(
        "SELECT id, user_certification_uuid, user_id, certification_id, ",
        ts!("created_at"), ", ", ts!("updated_at"), " FROM certificateuser ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct ResourceAuthor {
    pub id: i32,
    pub resource_uuid: String,
    pub user_id: Option<i32>,
    pub authorship: String,
    pub authorship_status: String,
    pub creation_date: Option<f64>,
    pub update_date: Option<f64>,
}

pub async fn resource_authors(pool: &PgPool, limit: Option<i64>) -> Result<Vec<ResourceAuthor>> {
    fetch(pool, "resourceauthor", concat!(
        "SELECT id, resource_uuid, user_id, authorship::text AS authorship, authorship_status::text AS authorship_status, ",
        ts!("creation_date"), ", ", ts!("update_date"), " FROM resourceauthor ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct Usergroup {
    pub id: i32,
    pub usergroup_uuid: String,
    pub name: String,
    pub description: String,
    pub creator_id: Option<i64>,
    pub creation_date: Option<f64>,
    pub update_date: Option<f64>,
}

pub async fn usergroups(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Usergroup>> {
    fetch(pool, "usergroup", concat!(
        "SELECT id, usergroup_uuid, name, description, creator_id, ",
        ts!("creation_date"), ", ", ts!("update_date"), " FROM usergroup ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct UsergroupUser {
    pub id: i32,
    pub usergroup_id: Option<i32>,
    pub user_id: Option<i32>,
    pub creation_date: Option<f64>,
}

pub async fn usergroup_users(pool: &PgPool, limit: Option<i64>) -> Result<Vec<UsergroupUser>> {
    fetch(pool, "usergroupuser", concat!(
        "SELECT id, usergroup_id, user_id, ", ts!("creation_date"), " FROM usergroupuser ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct UsergroupResource {
    pub id: i32,
    pub usergroup_id: Option<i32>,
    pub resource_uuid: String,
    pub creation_date: Option<f64>,
}

pub async fn usergroup_resources(pool: &PgPool, limit: Option<i64>) -> Result<Vec<UsergroupResource>> {
    fetch(pool, "usergroupresource", concat!(
        "SELECT id, usergroup_id, resource_uuid, ", ts!("creation_date"), " FROM usergroupresource ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct Discussion {
    pub id: i32,
    pub discussion_uuid: String,
    pub content: String,
    pub kind: String,
    pub status: String,
    pub course_id: Option<i32>,
    pub user_id: Option<i32>,
    pub parent_discussion_id: Option<i32>,
    pub likes_count: i32,
    pub dislikes_count: i32,
    pub replies_count: i32,
    pub creation_date: Option<f64>,
    pub update_date: Option<f64>,
}

pub async fn discussions(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Discussion>> {
    fetch(pool, "coursediscussion", concat!(
        "SELECT id, discussion_uuid, content, type::text AS kind, status::text AS status, course_id, user_id, ",
        "parent_discussion_id, likes_count, dislikes_count, replies_count, ",
        ts!("creation_date"), ", ", ts!("update_date"), " FROM coursediscussion ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct Reaction {
    pub id: i32,
    pub discussion_id: Option<i32>,
    pub user_id: Option<i32>,
    pub creation_date: Option<f64>,
}

pub async fn discussion_likes(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Reaction>> {
    fetch(pool, "discussionlike", concat!(
        "SELECT id, discussion_id, user_id, ", ts!("creation_date"), " FROM discussionlike ORDER BY id"), limit).await
}

pub async fn discussion_dislikes(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Reaction>> {
    fetch(pool, "discussiondislike", concat!(
        "SELECT id, discussion_id, user_id, ", ts!("creation_date"), " FROM discussiondislike ORDER BY id"), limit).await
}

// ── Assessments ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, FromRow)]
pub struct Assessment {
    pub id: i32,
    pub assessment_uuid: String,
    pub activity_id: i32,
    pub kind: String,
    pub title: String,
    pub description: String,
    pub lifecycle: String,
    pub scheduled_at: Option<f64>,
    pub published_at: Option<f64>,
    pub archived_at: Option<f64>,
    pub weight: f64,
    pub grading_type: String,
    pub policy_id: Option<i32>,
    pub content_version: i32,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
}

pub async fn assessments(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Assessment>> {
    fetch(pool, "assessment", concat!(
        "SELECT id, assessment_uuid, activity_id, kind, title, description, lifecycle, ",
        ts!("scheduled_at"), ", ", ts!("published_at"), ", ", ts!("archived_at"),
        ", weight, grading_type, policy_id, content_version, ",
        ts!("created_at"), ", ", ts!("updated_at"), " FROM assessment ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AssessmentPolicy {
    pub id: i32,
    pub policy_uuid: String,
    pub activity_id: i32,
    pub assessment_type: String,
    pub grading_mode: String,
    pub completion_rule: String,
    pub passing_score: f64,
    pub max_attempts: Option<i32>,
    pub time_limit_seconds: Option<i32>,
    pub due_at: Option<f64>,
    pub allow_late: bool,
    pub late_policy_json: Option<serde_json::Value>,
    pub settings_json: Option<serde_json::Value>,
    pub grade_release_mode: String,
    pub anti_cheat_json: Option<serde_json::Value>,
    pub policy_version: i32,
}

pub async fn assessment_policies(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AssessmentPolicy>> {
    fetch(pool, "assessment_policy", concat!(
        "SELECT id, policy_uuid, activity_id, assessment_type, grading_mode, completion_rule, passing_score, ",
        "max_attempts, time_limit_seconds, ", ts!("due_at"), ", allow_late, late_policy_json, settings_json, ",
        "grade_release_mode, anti_cheat_json, policy_version FROM assessment_policy ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AssessmentItem {
    pub id: i32,
    pub item_uuid: String,
    pub assessment_id: i32,
    pub order: i32,
    pub kind: String,
    pub title: String,
    pub body_json: Option<serde_json::Value>,
    pub metadata_json: Option<serde_json::Value>,
    pub max_score: f64,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
}

pub async fn assessment_items(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AssessmentItem>> {
    fetch(pool, "assessment_item", concat!(
        "SELECT id, item_uuid, assessment_id, \"order\" AS \"order\", kind, title, body_json, metadata_json, max_score, ",
        ts!("created_at"), ", ", ts!("updated_at"), " FROM assessment_item ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AccessPolicy {
    pub id: i32,
    pub assessment_id: i32,
    pub mode: String,
}

pub async fn access_policies(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AccessPolicy>> {
    fetch(pool, "assessment_access_policy",
        "SELECT id, assessment_id, mode FROM assessment_access_policy ORDER BY id", limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AccessUser {
    pub id: i32,
    pub policy_id: i32,
    pub user_id: i32,
    pub created_at: Option<f64>,
}

pub async fn access_users(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AccessUser>> {
    fetch(pool, "assessment_access_user", concat!(
        "SELECT id, policy_id, user_id, ", ts!("created_at"), " FROM assessment_access_user ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AccessUsergroup {
    pub id: i32,
    pub policy_id: i32,
    pub usergroup_id: i32,
    pub created_at: Option<f64>,
}

pub async fn access_usergroups(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AccessUsergroup>> {
    fetch(pool, "assessment_access_usergroup", concat!(
        "SELECT id, policy_id, usergroup_id, ", ts!("created_at"), " FROM assessment_access_usergroup ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct PolicyOverride {
    pub id: i32,
    pub policy_id: i32,
    pub user_id: i32,
    pub max_attempts_override: Option<i32>,
    pub due_at_override: Option<f64>,
    pub waive_late_penalty: bool,
    pub note: String,
    pub expires_at: Option<f64>,
    pub granted_by: Option<i32>,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
}

pub async fn policy_overrides(pool: &PgPool, limit: Option<i64>) -> Result<Vec<PolicyOverride>> {
    fetch(pool, "student_policy_override", concat!(
        "SELECT id, policy_id, user_id, max_attempts_override, ", ts!("due_at_override"),
        ", waive_late_penalty, note, ", ts!("expires_at"), ", granted_by, ",
        ts!("created_at"), ", ", ts!("updated_at"), " FROM student_policy_override ORDER BY id"), limit).await
}

// ── Submissions & grading ───────────────────────────────────────────────────

#[derive(Debug, Clone, FromRow)]
pub struct Submission {
    pub id: i32,
    pub submission_uuid: String,
    pub assessment_type: String,
    pub activity_id: i32,
    pub user_id: i32,
    pub auto_score: Option<f64>,
    pub final_score: Option<f64>,
    pub status: String,
    pub attempt_number: i32,
    pub answers_json: Option<serde_json::Value>,
    pub grading_json: Option<serde_json::Value>,
    pub submitted_at: Option<f64>,
    pub graded_at: Option<f64>,
    pub started_at: Option<f64>,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
    pub grading_version: i32,
    pub is_late: bool,
    pub late_penalty_pct: f64,
    pub version: i32,
    pub metadata_json: Option<serde_json::Value>,
    pub content_version: i32,
    pub policy_version: i32,
    pub items_snapshot: Option<serde_json::Value>,
    pub policy_snapshot: Option<serde_json::Value>,
    pub draft_version: i32,
}

pub async fn submissions(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Submission>> {
    fetch(pool, "submission", concat!(
        "SELECT id, submission_uuid, assessment_type, activity_id, user_id, auto_score, final_score, status, attempt_number, ",
        "answers_json, grading_json, ", ts!("submitted_at"), ", ", ts!("graded_at"), ", ", ts!("started_at"), ", ",
        ts!("created_at"), ", ", ts!("updated_at"), ", grading_version, is_late, late_penalty_pct, version, metadata_json, ",
        "content_version, policy_version, items_snapshot, policy_snapshot, draft_version FROM submission ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct GradingEntry {
    pub id: i32,
    pub entry_uuid: String,
    pub submission_id: i32,
    pub graded_by: Option<i32>,
    pub raw_score: f64,
    pub penalty_pct: f64,
    pub final_score: f64,
    pub overall_feedback: String,
    pub grading_version: i32,
    pub created_at: Option<f64>,
    pub published_at: Option<f64>,
    pub raw_breakdown: Option<serde_json::Value>,
    pub effective_breakdown: Option<serde_json::Value>,
}

pub async fn grading_entries(pool: &PgPool, limit: Option<i64>) -> Result<Vec<GradingEntry>> {
    fetch(pool, "grading_entry", concat!(
        "SELECT id, entry_uuid, submission_id, graded_by, raw_score, penalty_pct, final_score, overall_feedback, grading_version, ",
        ts!("created_at"), ", ", ts!("published_at"), ", raw_breakdown, effective_breakdown FROM grading_entry ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct ItemFeedback {
    pub id: i32,
    pub grading_entry_id: i32,
    pub submission_id: i32,
    pub item_ref: String,
    pub comment: String,
    pub score: Option<f64>,
    pub max_score: Option<f64>,
    pub annotation_type: String,
    pub annotation_data_key: Option<String>,
    pub graded_by: Option<i32>,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
}

pub async fn item_feedback(pool: &PgPool, limit: Option<i64>) -> Result<Vec<ItemFeedback>> {
    fetch(pool, "item_feedback", concat!(
        "SELECT id, grading_entry_id, submission_id, item_ref, comment, score, max_score, annotation_type, annotation_data_key, graded_by, ",
        ts!("created_at"), ", ", ts!("updated_at"), " FROM item_feedback ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct BulkAction {
    pub id: i32,
    pub action_uuid: String,
    pub performed_by: i32,
    pub action_type: String,
    pub params: Option<serde_json::Value>,
    pub target_user_ids: Option<serde_json::Value>,
    pub activity_id: i32,
    pub status: String,
    pub affected_count: i32,
    pub error_log: String,
    pub created_at: Option<f64>,
    pub completed_at: Option<f64>,
}

pub async fn bulk_actions(pool: &PgPool, limit: Option<i64>) -> Result<Vec<BulkAction>> {
    fetch(pool, "bulk_action", concat!(
        "SELECT id, action_uuid, performed_by, action_type, params, target_user_ids, activity_id, status, affected_count, error_log, ",
        ts!("created_at"), ", ", ts!("completed_at"), " FROM bulk_action ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct CodeRun {
    pub id: i32,
    pub run_uuid: String,
    pub assessment_uuid: String,
    pub item_uuid: String,
    pub submission_uuid: Option<String>,
    pub user_id: i32,
    pub purpose: String,
    pub status: String,
    pub language_id: i32,
    pub source_sha256: String,
    pub stdin_sha256: Option<String>,
    pub idempotency_key: Option<String>,
    pub passed: i32,
    pub total: i32,
    pub score: Option<f64>,
    pub error_message: Option<String>,
    pub started_at: Option<f64>,
    pub finished_at: Option<f64>,
    pub created_at: Option<f64>,
}

pub async fn code_runs(pool: &PgPool, limit: Option<i64>) -> Result<Vec<CodeRun>> {
    fetch(pool, "code_run", concat!(
        "SELECT id, run_uuid, assessment_uuid, item_uuid, submission_uuid, user_id, purpose, status, language_id, source_sha256, ",
        "stdin_sha256, idempotency_key, passed, total, score, error_message, ",
        ts!("started_at"), ", ", ts!("finished_at"), ", ", ts!("created_at"), " FROM code_run ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct CodeRunCase {
    pub id: i32,
    pub run_uuid: String,
    pub test_id: String,
    pub judge0_token: Option<String>,
    pub stdin: Option<String>,
    pub expected_output: Option<String>,
    pub description: String,
    pub weight: f64,
    pub is_visible: bool,
    pub status_id: Option<i32>,
    pub status_description: String,
    pub passed: bool,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub compile_output: Option<String>,
    pub message: Option<String>,
    pub time_seconds: Option<f64>,
    pub memory_kb: Option<i32>,
}

pub async fn code_run_cases(pool: &PgPool, limit: Option<i64>) -> Result<Vec<CodeRunCase>> {
    fetch(pool, "code_run_case", concat!(
        "SELECT id, run_uuid, test_id, judge0_token, stdin, expected_output, description, weight, is_visible, status_id, ",
        "status_description, passed, stdout, stderr, compile_output, message, time_seconds, memory_kb FROM code_run_case ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct FileSubmissionActivity {
    pub id: i32,
    pub file_submission_uuid: String,
    pub activity_id: i32,
    pub instructions: String,
    pub rubric_json: Option<serde_json::Value>,
    pub allowed_mime_types: Option<serde_json::Value>,
    pub max_files: i32,
    pub max_file_size_mb: Option<i32>,
    pub due_at: Option<f64>,
    pub allow_late: bool,
    pub late_policy_json: Option<serde_json::Value>,
    pub max_attempts: Option<i32>,
    pub grade_release_mode: String,
    pub lifecycle: String,
    pub published_at: Option<f64>,
    pub archived_at: Option<f64>,
    pub settings_json: Option<serde_json::Value>,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
}

pub async fn file_submission_activities(pool: &PgPool, limit: Option<i64>) -> Result<Vec<FileSubmissionActivity>> {
    fetch(pool, "file_submission_activity", concat!(
        "SELECT id, file_submission_uuid, activity_id, instructions, rubric_json, allowed_mime_types, max_files, max_file_size_mb, ",
        ts!("due_at"), ", allow_late, late_policy_json, max_attempts, grade_release_mode, lifecycle, ",
        ts!("published_at"), ", ", ts!("archived_at"), ", settings_json, ",
        ts!("created_at"), ", ", ts!("updated_at"), " FROM file_submission_activity ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct FileSubmissionAttempt {
    pub id: i32,
    pub attempt_uuid: String,
    pub file_submission_id: i32,
    pub user_id: i32,
    pub status: String,
    pub attempt_number: i32,
    pub started_at: Option<f64>,
    pub submitted_at: Option<f64>,
    pub graded_at: Option<f64>,
    pub is_late: bool,
    pub late_penalty_pct: f64,
    pub final_score: Option<f64>,
    pub feedback_json: Option<serde_json::Value>,
    pub version: i32,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
}

pub async fn file_submission_attempts(pool: &PgPool, limit: Option<i64>) -> Result<Vec<FileSubmissionAttempt>> {
    fetch(pool, "file_submission_attempt", concat!(
        "SELECT id, attempt_uuid, file_submission_id, user_id, status, attempt_number, ",
        ts!("started_at"), ", ", ts!("submitted_at"), ", ", ts!("graded_at"),
        ", is_late, late_penalty_pct, final_score, feedback_json, version, ",
        ts!("created_at"), ", ", ts!("updated_at"), " FROM file_submission_attempt ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct FileSubmissionFile {
    pub id: i32,
    pub attempt_file_uuid: String,
    pub attempt_id: i32,
    pub upload_id: i32,
    pub display_name: String,
    pub content_type: String,
    pub size_bytes: Option<i32>,
    pub storage_key: Option<String>,
    pub position: i32,
    pub scan_status: String,
    pub created_at: Option<f64>,
}

pub async fn file_submission_files(pool: &PgPool, limit: Option<i64>) -> Result<Vec<FileSubmissionFile>> {
    fetch(pool, "file_submission_attempt_file", concat!(
        "SELECT id, attempt_file_uuid, attempt_id, upload_id, display_name, content_type, size_bytes, storage_key, ",
        "\"position\" AS \"position\", scan_status, ", ts!("created_at"), " FROM file_submission_attempt_file ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct Upload {
    pub id: i32,
    pub upload_uuid: String,
    pub user_id: i32,
    pub filename: String,
    pub content_type: String,
    pub size_bytes: Option<i32>,
    pub storage_key: Option<String>,
    pub status: String,
    pub referenced_count: i32,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
}

pub async fn uploads(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Upload>> {
    fetch(pool, "upload", concat!(
        "SELECT id, upload_uuid, user_id, filename, content_type, size_bytes, storage_key, status, referenced_count, ",
        ts!("created_at"), ", ", ts!("updated_at"), " FROM upload ORDER BY id"), limit).await
}

// ── Analytics ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, FromRow)]
pub struct SavedView {
    pub id: i32,
    pub teacher_user_id: i32,
    pub name: String,
    pub view_type: String,
    pub query: Option<serde_json::Value>,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
}

pub async fn saved_views(pool: &PgPool, limit: Option<i64>) -> Result<Vec<SavedView>> {
    fetch(pool, "analytics_saved_view", concat!(
        "SELECT id, teacher_user_id, name, view_type, query, ",
        ts!("created_at"), ", ", ts!("updated_at"), " FROM analytics_saved_view ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct Intervention {
    pub id: i32,
    pub teacher_user_id: i32,
    pub user_id: i32,
    pub course_id: i32,
    pub intervention_type: String,
    pub status: String,
    pub outcome: Option<String>,
    pub notes: Option<String>,
    pub risk_score_before: Option<f64>,
    pub risk_score_after: Option<f64>,
    pub payload: Option<serde_json::Value>,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
    pub resolved_at: Option<f64>,
}

pub async fn interventions(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Intervention>> {
    fetch(pool, "teacher_intervention", concat!(
        "SELECT id, teacher_user_id, user_id, course_id, intervention_type, status, outcome, notes, ",
        "risk_score_before::float8 AS risk_score_before, risk_score_after::float8 AS risk_score_after, payload, ",
        ts!("created_at"), ", ", ts!("updated_at"), ", ", ts!("resolved_at"), " FROM teacher_intervention ORDER BY id"), limit).await
}

// ── AI ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, FromRow)]
pub struct AiThread {
    pub id: i32,
    pub thread_uuid: String,
    pub user_id: Option<i32>,
    pub role: String,
    pub course_id: Option<i32>,
    pub activity_id: Option<i32>,
    pub title: Option<String>,
    pub retention_class: String,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
}

pub async fn ai_threads(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AiThread>> {
    fetch(pool, "ai_thread", concat!(
        "SELECT id, thread_uuid, user_id, role, course_id, activity_id, title, retention_class, ",
        ts!("created_at"), ", ", ts!("updated_at"), " FROM ai_thread ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AiRun {
    pub id: i32,
    pub run_uuid: String,
    pub thread_id: i32,
    pub model_name: Option<String>,
    pub status: String,
    pub duration_ms: Option<i32>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cost_estimate: Option<f64>,
    pub safety_state: Option<String>,
    pub error_code: Option<String>,
    pub run_metadata: Option<serde_json::Value>,
    pub started_at: Option<f64>,
    pub completed_at: Option<f64>,
}

pub async fn ai_runs(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AiRun>> {
    fetch(pool, "ai_run", concat!(
        "SELECT id, run_uuid, thread_id, model_name, status, duration_ms, input_tokens, output_tokens, ",
        "cost_estimate::float8 AS cost_estimate, safety_state, error_code, run_metadata, ",
        ts!("started_at"), ", ", ts!("completed_at"), " FROM ai_run ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AiEvent {
    pub id: i32,
    pub run_id: i32,
    pub event_type: String,
    pub sequence: i32,
    pub payload_json: Option<serde_json::Value>,
    pub created_at: Option<f64>,
}

pub async fn ai_events(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AiEvent>> {
    fetch(pool, "ai_event", concat!(
        "SELECT id, run_id, event_type, sequence, payload_json, ", ts!("created_at"), " FROM ai_event ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AiArtifact {
    pub id: i32,
    pub artifact_uuid: String,
    pub run_id: i32,
    pub kind: String,
    pub content_json: Option<serde_json::Value>,
    pub is_final: bool,
    pub created_at: Option<f64>,
}

pub async fn ai_artifacts(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AiArtifact>> {
    fetch(pool, "ai_artifact", concat!(
        "SELECT id, artifact_uuid, run_id, kind, content_json, final AS is_final, ", ts!("created_at"),
        " FROM ai_artifact ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AiEvidence {
    pub id: i32,
    pub run_id: i32,
    pub artifact_id: Option<i32>,
    pub citation_id: String,
    pub label: String,
    pub source_type: String,
    pub excerpt: String,
    pub score: Option<f64>,
    pub evidence_metadata: Option<serde_json::Value>,
    pub created_at: Option<f64>,
}

pub async fn ai_evidence(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AiEvidence>> {
    fetch(pool, "ai_evidence", concat!(
        "SELECT id, run_id, artifact_id, citation_id, label, source_type, excerpt, score::float8 AS score, evidence_metadata, ",
        ts!("created_at"), " FROM ai_evidence ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AiApproval {
    pub id: i32,
    pub approval_uuid: String,
    pub run_id: i32,
    pub action_type: String,
    pub status: String,
    pub requested_by_user_id: Option<i32>,
    pub resolved_by_user_id: Option<i32>,
    pub payload_json: Option<serde_json::Value>,
    pub created_at: Option<f64>,
    pub resolved_at: Option<f64>,
    pub expires_at: Option<f64>,
}

pub async fn ai_approvals(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AiApproval>> {
    fetch(pool, "ai_approval", concat!(
        "SELECT id, approval_uuid, run_id, action_type, status, requested_by_user_id, resolved_by_user_id, payload_json, ",
        ts!("created_at"), ", ", ts!("resolved_at"), ", ", ts!("expires_at"), " FROM ai_approval ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AiEvalResult {
    pub id: i32,
    pub eval_uuid: String,
    pub run_id: Option<i32>,
    pub dataset: String,
    pub evaluator: String,
    pub score: Option<f64>,
    pub passed: Option<bool>,
    pub details_json: Option<serde_json::Value>,
    pub created_at: Option<f64>,
}

pub async fn ai_eval_results(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AiEvalResult>> {
    fetch(pool, "ai_eval_result", concat!(
        "SELECT id, eval_uuid, run_id, dataset, evaluator, score::float8 AS score, passed, details_json, ",
        ts!("created_at"), " FROM ai_eval_result ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AiQaMessage {
    pub id: i32,
    pub message_uuid: String,
    pub thread_id: i32,
    pub course_id: i32,
    pub user_id: Option<i32>,
    pub role: String,
    pub content: String,
    pub confidence: Option<String>,
    pub citations_json: Option<serde_json::Value>,
    pub message_metadata: Option<serde_json::Value>,
    pub client_turn_id: Option<String>,
    pub created_at: Option<f64>,
}

pub async fn ai_qa_messages(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AiQaMessage>> {
    fetch(pool, "ai_qa_message", concat!(
        "SELECT id, message_uuid, thread_id, course_id, user_id, role, content, confidence, citations_json, message_metadata, ",
        "client_turn_id, ", ts!("created_at"), " FROM ai_qa_message ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AiSubmissionAnalysis {
    pub id: i32,
    pub analysis_uuid: String,
    pub submission_id: i32,
    pub run_id: Option<i32>,
    pub triggered_by_user_id: Option<i32>,
    pub status: String,
    pub language: String,
    pub gap_count: i32,
    pub analysis_json: Option<serde_json::Value>,
    pub evidence_json: Option<serde_json::Value>,
    pub model_name: Option<String>,
    pub created_at: Option<f64>,
}

pub async fn ai_submission_analyses(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AiSubmissionAnalysis>> {
    fetch(pool, "ai_submission_analysis", concat!(
        "SELECT id, analysis_uuid, submission_id, run_id, triggered_by_user_id, status, language, gap_count, analysis_json, ",
        "evidence_json, model_name, ", ts!("created_at"), " FROM ai_submission_analysis ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AiCourseAnalysis {
    pub id: i32,
    pub analysis_uuid: String,
    pub course_id: i32,
    pub run_id: Option<i32>,
    pub triggered_by_user_id: Option<i32>,
    pub status: String,
    pub language: String,
    pub public_score: i32,
    pub report_json: Option<serde_json::Value>,
    pub evidence_json: Option<serde_json::Value>,
    pub model_name: Option<String>,
    pub content_hash: Option<String>,
    pub created_at: Option<f64>,
    pub published_at: Option<f64>,
}

pub async fn ai_course_analyses(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AiCourseAnalysis>> {
    fetch(pool, "ai_course_analysis", concat!(
        "SELECT id, analysis_uuid, course_id, run_id, triggered_by_user_id, status, language, public_score, report_json, ",
        "evidence_json, model_name, content_hash, ", ts!("created_at"), ", ", ts!("published_at"),
        " FROM ai_course_analysis ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AiLectureReview {
    pub id: i32,
    pub review_uuid: String,
    pub course_id: i32,
    pub activity_id: Option<i32>,
    pub run_id: Option<i32>,
    pub triggered_by_user_id: Option<i32>,
    pub status: String,
    pub language: String,
    pub suggestions_json: Option<serde_json::Value>,
    pub dismissed_json: Option<serde_json::Value>,
    pub created_at: Option<f64>,
    pub superseded_at: Option<f64>,
}

pub async fn ai_lecture_reviews(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AiLectureReview>> {
    fetch(pool, "ai_lecture_review", concat!(
        "SELECT id, review_uuid, course_id, activity_id, run_id, triggered_by_user_id, status, language, suggestions_json, ",
        "dismissed_json, ", ts!("created_at"), ", ", ts!("superseded_at"), " FROM ai_lecture_review ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AiRemediation {
    pub id: i32,
    pub session_uuid: String,
    pub submission_id: i32,
    pub activity_id: i32,
    pub student_user_id: i32,
    pub analysis_id: Option<i32>,
    pub run_id: Option<i32>,
    pub status: String,
    pub gate_mode: bool,
    pub language: String,
    pub lecture_json: Option<serde_json::Value>,
    pub test_json: Option<serde_json::Value>,
    pub score: Option<i32>,
    pub passed_at: Option<f64>,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
}

pub async fn ai_remediations(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AiRemediation>> {
    fetch(pool, "ai_remediation_session", concat!(
        "SELECT id, session_uuid, submission_id, activity_id, student_user_id, analysis_id, run_id, status, gate_mode, language, ",
        "lecture_json, test_json, score, ", ts!("passed_at"), ", ", ts!("created_at"), ", ", ts!("updated_at"),
        " FROM ai_remediation_session ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct AiStudentMemory {
    pub id: i32,
    pub student_user_id: i32,
    pub course_id: Option<i32>,
    pub source_type: String,
    pub source_id: String,
    pub memory_text: String,
    pub language: String,
    pub memory_metadata: Option<serde_json::Value>,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
}

pub async fn ai_student_memory(pool: &PgPool, limit: Option<i64>) -> Result<Vec<AiStudentMemory>> {
    fetch(pool, "ai_student_memory", concat!(
        "SELECT id, student_user_id, course_id, source_type, source_id, memory_text, language, memory_metadata, ",
        ts!("created_at"), ", ", ts!("updated_at"), " FROM ai_student_memory ORDER BY id"), limit).await
}

// ── Gamification & trail ────────────────────────────────────────────────────

#[derive(Debug, Clone, FromRow)]
pub struct GamificationProfile {
    pub id: i32,
    pub user_id: i32,
    pub total_xp: i32,
    pub level: i32,
    pub daily_xp_earned: i32,
    pub login_streak: i32,
    pub learning_streak: i32,
    pub longest_login_streak: i32,
    pub longest_learning_streak: i32,
    pub total_activities_completed: i32,
    pub total_courses_completed: i32,
    pub last_xp_award_date: Option<f64>,
    pub last_login_date: Option<f64>,
    pub last_learning_date: Option<f64>,
    pub preferences: Option<serde_json::Value>,
    pub created_at: Option<f64>,
    pub updated_at: Option<f64>,
}

pub async fn gamification_profiles(pool: &PgPool, limit: Option<i64>) -> Result<Vec<GamificationProfile>> {
    fetch(pool, "gamification_profiles", concat!(
        "SELECT id, user_id, total_xp, level, daily_xp_earned, login_streak, learning_streak, longest_login_streak, ",
        "longest_learning_streak, total_activities_completed, total_courses_completed, ",
        ts!("last_xp_award_date"), ", ", ts!("last_login_date"), ", ", ts!("last_learning_date"), ", preferences, ",
        ts!("created_at"), ", ", ts!("updated_at"), " FROM gamification_profiles ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct XpTransaction {
    pub id: i32,
    pub user_id: i32,
    pub amount: i32,
    pub source: String,
    pub source_id: Option<String>,
    pub reason: Option<String>,
    pub idempotency_key: Option<String>,
    pub created_at: Option<f64>,
}

pub async fn xp_transactions(pool: &PgPool, limit: Option<i64>) -> Result<Vec<XpTransaction>> {
    fetch(pool, "xp_transactions", concat!(
        "SELECT id, user_id, amount, source::text AS source, source_id, reason, idempotency_key, ",
        ts!("created_at"), " FROM xp_transactions ORDER BY created_at, id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct GamificationConfig {
    pub daily_xp_limit: Option<i32>,
    pub rewards: Option<serde_json::Value>,
}

pub async fn gamification_config(pool: &PgPool) -> Result<Option<GamificationConfig>> {
    let rows: Vec<GamificationConfig> = fetch(pool, "org_gamification_config",
        "SELECT daily_xp_limit, rewards FROM org_gamification_config ORDER BY id", Some(1)).await?;
    Ok(rows.into_iter().next())
}

#[derive(Debug, Clone, FromRow)]
pub struct Trail {
    pub id: i32,
    pub trail_uuid: String,
    pub user_id: Option<i32>,
    pub creation_date: Option<f64>,
    pub update_date: Option<f64>,
}

pub async fn trails(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Trail>> {
    fetch(pool, "trail", concat!(
        "SELECT id, trail_uuid, user_id, ", ts!("creation_date"), ", ", ts!("update_date"), " FROM trail ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct TrailRun {
    pub id: i32,
    pub data: Option<serde_json::Value>,
    pub status: String,
    pub trail_id: Option<i32>,
    pub course_id: Option<i32>,
    pub user_id: Option<i32>,
    pub creation_date: Option<f64>,
    pub update_date: Option<f64>,
}

pub async fn trail_runs(pool: &PgPool, limit: Option<i64>) -> Result<Vec<TrailRun>> {
    fetch(pool, "trailrun", concat!(
        "SELECT id, data, status::text AS status, trail_id, course_id, user_id, ",
        ts!("creation_date"), ", ", ts!("update_date"), " FROM trailrun ORDER BY id"), limit).await
}

#[derive(Debug, Clone, FromRow)]
pub struct TrailStep {
    pub id: i32,
    pub complete: bool,
    pub teacher_verified: bool,
    pub grade: Option<i32>,
    pub data: Option<serde_json::Value>,
    pub trailrun_id: Option<i32>,
    pub trail_id: Option<i32>,
    pub activity_id: Option<i32>,
    pub course_id: Option<i32>,
    pub user_id: Option<i32>,
    pub creation_date: Option<f64>,
    pub update_date: Option<f64>,
}

pub async fn trail_steps(pool: &PgPool, limit: Option<i64>) -> Result<Vec<TrailStep>> {
    fetch(pool, "trailstep", concat!(
        "SELECT id, complete, teacher_verified, grade, data, trailrun_id, trail_id, activity_id, course_id, user_id, ",
        ts!("creation_date"), ", ", ts!("update_date"), " FROM trailstep ORDER BY id"), limit).await
}

/// Legacy tables the ETL deliberately does not carry (MIGRATION §2.x
/// "dropped tables"); their row counts go into the report so a non-empty one
/// is visible, never silent.
pub const DROPPED_TABLES: &[(&str, &str)] = &[
    ("exam", "superseded by assessment (legacy migrated exams in place; FINDINGS #26)"),
    ("examattempt", "pre-assessment exam attempts, unreadable by the legacy app (FINDINGS #26)"),
    ("auth_sessions", "sessions live in Redis; all users re-login at cutover (MIGRATION §1)"),
    ("activity_progress", "projection — rebuilt by ProgressProjector::backfill"),
    ("course_progress", "projection — rebuilt by ProgressProjector::backfill"),
    ("analytics_event", "never written by the legacy (FINDINGS #20); v2 records fresh events"),
    ("daily_teacher_metrics", "rollup — rebuilt by admin analytics-rollup"),
    ("daily_course_metrics", "rollup — rebuilt by admin analytics-rollup"),
    ("daily_course_engagement", "rollup — rebuilt by admin analytics-rollup"),
    ("daily_assessment_metrics", "rollup — rebuilt by admin analytics-rollup"),
    ("daily_user_course_progress", "rollup — rebuilt by admin analytics-rollup"),
    ("learner_risk_snapshot", "rollup — rebuilt by admin analytics-rollup"),
    ("audit_event", "legacy generic audit — no v2 table; assessment audit is emitted by v2 itself"),
    ("role", "pre-RBAC role table (rights json), dead since the roles/permissions tables"),
    ("permissions", "permission catalog encoded in code (ab_core::permission)"),
    ("role_permissions", "system-role grants are seeded by migration 0003 (verbatim SYSTEM_ROLES)"),
    ("document_chunks", "pgvector chunks: no legacy writer, semantic memory not built"),
    ("hint_usage", "dead feature (no model in apps/api/src/db)"),
    ("install", "installer wizard state"),
    ("paymentsconfig", "payments never enabled"),
    ("paymentsproduct", "payments never enabled"),
    ("paymentscourse", "payments never enabled"),
    ("paymentsuser", "payments never enabled"),
    ("alembic_version", "legacy migration history (MIGRATION §1)"),
    ("submissions", "Judge0's own table (shares the legacy DB) — Judge0 stays as-is"),
    ("languages", "Judge0's own table — Judge0 stays as-is"),
    ("clients", "Judge0's own table — Judge0 stays as-is"),
    ("schema_migrations", "Judge0's own table — Judge0 stays as-is"),
    ("ar_internal_metadata", "Judge0's own table — Judge0 stays as-is"),
];

/// Epoch seconds → epoch micros for UUIDv7 minting.
#[must_use]
pub fn micros(ts: Option<f64>) -> Option<i64> {
    // Legacy timestamps are far below the f64 integer limit; truncation is
    // the intended rounding.
    #[allow(clippy::cast_possible_truncation)]
    ts.map(|t| (t * 1_000_000.0) as i64)
}
