//! The teacher surface.
//!
//! Review queue, stats, item analytics, CSV export, grade save under an
//! optimistic lock, releases, grading history, the course gradebook.
//! Ported from `grading/teacher.py` + `assessments/review_service.py` +
//! `grading/gradebook_cursor.py`.
//!
//! Grading needs `assessment:grade` (platform, or own = course creator);
//! every method resolves the assessment's course first so an invisible
//! course stays a 404.

use std::collections::{BTreeMap, HashMap};

use ab_core::assessments::{AssessmentKind, AutoSubmitReason, ItemKind, SubmissionStatus};
use ab_core::id::{AssessmentId, AssessmentItemId, CourseId, GradingEntryId, SubmissionId, UserId};
use ab_core::permission::Action;
use ab_core::{Error, ErrorCode, FieldError, Result};
use ab_db::submissions::{NewGradingEntry, NewItemFeedback, SubmissionRow};
use serde::Serialize;
use sqlx::PgPool;
use utoipa::ToSchema;

use crate::assessments::service::{Assessment, AssessmentsService, Item};
use crate::catalog::courses::Course;
use crate::events::GradingEvents;
use crate::grading::answers::{Answers, parse_answers};
use crate::grading::breakdown::{GradedItem, GradingBreakdown, round2};
use crate::grading::penalties::apply_late;
use crate::grading::submissions::{ReleaseState, release_state};
use crate::identity::Actor;

/// Review-queue page cap.
pub const MAX_REVIEW_PAGE: i64 = 100;
/// Gradebook page cap (cells).
pub const MAX_GRADEBOOK_PAGE: i64 = 500;
/// Discrimination index needs at least this many graded attempts.
const MIN_DISCRIMINATION_SAMPLE: usize = 6;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct UserSummary {
    pub id: UserId,
    pub username: String,
    pub display_name: String,
    pub email: String,
}

/// Queue filter. `NeedsGrading` is the legacy virtual filter for `pending`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReviewStatus {
    NeedsGrading,
    Pending,
    Graded,
    Published,
    Returned,
}

impl ReviewStatus {
    const fn as_submission_status(self) -> SubmissionStatus {
        match self {
            Self::NeedsGrading | Self::Pending => SubmissionStatus::Pending,
            Self::Graded => SubmissionStatus::Graded,
            Self::Published => SubmissionStatus::Published,
            Self::Returned => SubmissionStatus::Returned,
        }
    }
}

pub struct ReviewFilter<'a> {
    pub status: Option<ReviewStatus>,
    pub late_only: bool,
    pub search: Option<&'a str>,
    pub cursor: Option<SubmissionId>,
    pub limit: i64,
}

#[derive(Debug, Clone)]
pub struct ReviewItem {
    pub id: SubmissionId,
    pub user: UserSummary,
    pub status: SubmissionStatus,
    pub attempt_number: i32,
    pub auto_score: Option<f64>,
    pub final_score: Option<f64>,
    pub is_late: bool,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
    pub version: i64,
}

#[derive(Debug, Clone)]
pub struct ReviewPage {
    pub items: Vec<ReviewItem>,
    pub next_cursor: Option<SubmissionId>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ScoreBucket {
    /// `"0-10"`, …, `"90-100"`.
    pub range: String,
    pub count: i64,
}

#[derive(Debug, Clone)]
pub struct Stats {
    pub total: i64,
    pub needs_grading: i64,
    pub graded: i64,
    pub published: i64,
    pub returned: i64,
    pub late: i64,
    pub avg_score: Option<f64>,
    /// Percent of graded work at or above the passing score.
    pub pass_rate: Option<f64>,
    pub distribution: Vec<ScoreBucket>,
}

/// A submission as the grader sees it: everything, unredacted.
#[derive(Debug, Clone)]
pub struct TeacherSubmission {
    pub id: SubmissionId,
    pub assessment_id: AssessmentId,
    pub user: UserSummary,
    pub status: SubmissionStatus,
    pub release_state: ReleaseState,
    pub attempt_number: i32,
    pub answers: Answers,
    pub grading: GradingBreakdown,
    pub auto_score: Option<f64>,
    pub final_score: Option<f64>,
    pub is_late: bool,
    pub late_penalty_pct: f64,
    pub violation_count: i32,
    pub violations: serde_json::Value,
    pub auto_submit_reason: Option<AutoSubmitReason>,
    pub duration_seconds: Option<i32>,
    pub started_at: Option<i64>,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
    /// Teacher optimistic lock — send back as `If-Match`.
    pub version: i64,
    pub content_version: i32,
    pub policy_version: i32,
    pub feedback: Vec<ItemFeedbackView>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ItemFeedbackView {
    pub item_id: Option<AssessmentItemId>,
    pub comment: String,
    pub score: Option<f64>,
    pub max_score: Option<f64>,
    pub created_at_unix: i64,
}

/// Where a grade save lands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GradeAction {
    /// Teacher-only (`graded`).
    Save,
    /// Visible to the learner (`published`).
    Publish,
    /// Back to the learner for revision (`returned`).
    Return,
}

impl GradeAction {
    const fn target(self) -> SubmissionStatus {
        match self {
            Self::Save => SubmissionStatus::Graded,
            Self::Publish => SubmissionStatus::Published,
            Self::Return => SubmissionStatus::Returned,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ItemGrade {
    pub item_id: AssessmentItemId,
    pub score: Option<f64>,
    pub feedback: String,
}

pub struct GradeInput {
    pub action: GradeAction,
    /// Raw 0..100 before the late penalty. `None` = computed from the item
    /// scores (earned / possible × 100).
    pub final_score: Option<f64>,
    pub feedback: String,
    pub item_grades: Vec<ItemGrade>,
    /// From `If-Match`; the current `version`.
    pub expected_version: i64,
}

#[derive(Debug, Clone)]
pub struct GradingEntry {
    pub id: GradingEntryId,
    pub graded_by: Option<UserId>,
    pub raw_score: f64,
    pub penalty_pct: f64,
    pub final_score: f64,
    pub overall_feedback: String,
    pub published_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ItemAnalytics {
    pub item_id: AssessmentItemId,
    pub title: String,
    pub kind: ItemKind,
    pub max_score: f64,
    pub response_count: i64,
    pub avg_score_pct: Option<f64>,
    pub correct_pct: Option<f64>,
    /// Classic (top 27% − bottom 27%) / n, from six attempts up.
    pub discrimination_index: Option<f64>,
}

#[derive(Debug, Clone, Copy, Serialize, ToSchema)]
pub struct PublishSummary {
    pub published_count: i64,
    pub already_published_count: i64,
}

#[derive(Debug, Clone)]
pub struct GradebookCell {
    pub user_id: UserId,
    pub assessment_id: AssessmentId,
    pub submission_id: SubmissionId,
    pub status: SubmissionStatus,
    pub attempt_number: i32,
    pub attempts: i64,
    pub final_score: Option<f64>,
    pub is_late: bool,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct GradebookAssessment {
    pub id: AssessmentId,
    pub title: String,
    pub kind: AssessmentKind,
    pub due_at: Option<i64>,
    pub passing_score: f64,
}

#[derive(Debug, Clone)]
pub struct GradebookPage {
    pub cells: Vec<GradebookCell>,
    pub users: Vec<UserSummary>,
    pub assessments: Vec<GradebookAssessment>,
    pub next_cursor: Option<String>,
}

#[derive(Clone)]
pub struct GradingService {
    pub(crate) pool: PgPool,
    pub(crate) assessments: AssessmentsService,
    /// SSE fan-out; `None` in processes without Redis (the worker).
    pub(crate) events: Option<GradingEvents>,
}

/// Teacher transitions (legacy `_ALLOWED_TEACHER_TRANSITIONS`); a re-save
/// into the current status is always allowed. Drafts are never gradable.
const fn transition_allowed(from: SubmissionStatus, to: SubmissionStatus) -> bool {
    use SubmissionStatus as S;
    if matches!(from, S::Draft) {
        return false;
    }
    if from as u8 == to as u8 {
        return true;
    }
    match from {
        S::Pending | S::Graded => matches!(to, S::Graded | S::Published | S::Returned),
        S::Returned => matches!(to, S::Graded | S::Pending | S::Published),
        S::Published | S::Draft => false,
    }
}

fn summary(row: ab_db::identity::UserSummaryRow) -> UserSummary {
    UserSummary {
        id: row.id,
        username: row.username,
        display_name: row.display_name,
        email: row.email,
    }
}

/// Batch-load user summaries keyed by id (unknown ids get a placeholder —
/// a deleted account must not hide a submission from the grader).
async fn users_by_id(pool: &PgPool, ids: &[UserId]) -> Result<HashMap<UserId, UserSummary>> {
    let rows = ab_db::identity::list_user_summaries(pool, ids).await?;
    Ok(rows.into_iter().map(|r| (r.id, summary(r))).collect())
}

fn user_or_placeholder(map: &HashMap<UserId, UserSummary>, id: UserId) -> UserSummary {
    map.get(&id).cloned().unwrap_or_else(|| UserSummary {
        id,
        username: String::new(),
        display_name: "(deleted user)".into(),
        email: String::new(),
    })
}

/// RFC 3339 for the CSV export.
fn iso8601(unix: i64) -> String {
    jiff::Timestamp::from_second(unix).map_or_else(|_| unix.to_string(), |t| t.to_string())
}

/// Quote a CSV field when it needs it (RFC 4180).
fn csv_field(value: &str) -> String {
    if value.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_owned()
    }
}

fn csv_row(fields: &[String]) -> String {
    let mut line = fields
        .iter()
        .map(|f| csv_field(f))
        .collect::<Vec<_>>()
        .join(",");
    line.push_str("\r\n");
    line
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

fn count(n: usize) -> f64 {
    f64::from(u32::try_from(n).unwrap_or(u32::MAX))
}

impl GradingService {
    #[must_use]
    pub const fn new(
        pool: PgPool,
        assessments: AssessmentsService,
        events: Option<GradingEvents>,
    ) -> Self {
        Self {
            pool,
            assessments,
            events,
        }
    }

    /// Who may follow a submission's event stream: its owner, or a grader
    /// of its assessment (404 for everyone else - no existence leak).
    pub async fn stream_access(&self, actor: &Actor, id: SubmissionId) -> Result<()> {
        let row = self.load_submission(id).await?;
        if row.user_id == actor.user_id {
            return Ok(());
        }
        self.grader_context(actor, row.assessment_id)
            .await
            .map(|_| ())
            .map_err(|_| Error::not_found("submission"))
    }

    async fn emit(&self, submission_id: SubmissionId, event: &str, payload: serde_json::Value) {
        if let Some(events) = &self.events {
            events
                .publish_best_effort(submission_id, event, payload)
                .await;
        }
    }

    /// Visible course (404 otherwise) + grading grant.
    pub(crate) async fn grader_context(
        &self,
        actor: &Actor,
        assessment_id: AssessmentId,
    ) -> Result<(Assessment, Course)> {
        let assessment = self.assessments.load(assessment_id).await?;
        let course = self
            .assessments
            .courses
            .get(actor, assessment.course_id)
            .await?;
        AssessmentsService::require_scoped(actor, &course, Action::Grade, "grading")?;
        Ok((assessment, course))
    }

    async fn load_submission(&self, id: SubmissionId) -> Result<SubmissionRow> {
        ab_db::submissions::get_submission(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("submission"))
    }

    // ── Reads ───────────────────────────────────────────────────────────

    /// Non-draft submissions, newest first, keyset on id.
    pub async fn review_queue(
        &self,
        actor: &Actor,
        assessment_id: AssessmentId,
        filter: ReviewFilter<'_>,
    ) -> Result<ReviewPage> {
        self.grader_context(actor, assessment_id).await?;
        let limit = filter.limit.clamp(1, MAX_REVIEW_PAGE);
        let mut rows = ab_db::submissions::list_for_review(
            &self.pool,
            assessment_id,
            filter.status.map(ReviewStatus::as_submission_status),
            filter.late_only,
            filter.search,
            filter.cursor,
            limit + 1,
        )
        .await?;
        let next_cursor = if rows.len() > usize::try_from(limit).unwrap_or(usize::MAX) {
            rows.truncate(usize::try_from(limit).unwrap_or(usize::MAX));
            rows.last().map(|r| r.id)
        } else {
            None
        };
        let items = rows
            .into_iter()
            .map(|r| ReviewItem {
                id: r.id,
                user: UserSummary {
                    id: r.user_id,
                    username: r.username,
                    display_name: r.display_name,
                    email: String::new(),
                },
                status: r.status,
                attempt_number: r.attempt_number,
                auto_score: r.auto_score,
                final_score: r.final_score,
                is_late: r.is_late,
                submitted_at: r.submitted_at,
                graded_at: r.graded_at,
                version: r.version,
            })
            .collect();
        Ok(ReviewPage { items, next_cursor })
    }

    /// Dashboard counts, average, pass rate and a 10-bucket distribution.
    pub async fn stats(&self, actor: &Actor, assessment_id: AssessmentId) -> Result<Stats> {
        let (assessment, _) = self.grader_context(actor, assessment_id).await?;
        let counts = ab_db::submissions::stats(&self.pool, assessment_id).await?;
        let scores = ab_db::submissions::graded_scores(&self.pool, assessment_id).await?;
        let mut buckets = [0i64; 10];
        for score in &scores {
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let index = ((score / 10.0).floor().clamp(0.0, 9.0)) as usize;
            buckets[index] += 1;
        }
        let (avg_score, pass_rate) = if scores.is_empty() {
            (None, None)
        } else {
            let n = count(scores.len());
            let passing = scores
                .iter()
                .filter(|s| **s >= assessment.passing_score)
                .count();
            (
                Some(round2(scores.iter().sum::<f64>() / n)),
                Some((count(passing) / n * 1000.0).round() / 10.0),
            )
        };
        Ok(Stats {
            total: counts.total,
            needs_grading: counts.pending,
            graded: counts.graded,
            published: counts.published,
            returned: counts.returned,
            late: counts.late,
            avg_score,
            pass_rate,
            distribution: buckets
                .iter()
                .enumerate()
                .map(|(i, c)| ScoreBucket {
                    range: format!("{}-{}", i * 10, i * 10 + 10),
                    count: *c,
                })
                .collect(),
        })
    }

    /// Per-item statistics over graded/published work (legacy
    /// `get_item_analytics`).
    pub async fn item_analytics(
        &self,
        actor: &Actor,
        assessment_id: AssessmentId,
    ) -> Result<Vec<ItemAnalytics>> {
        self.grader_context(actor, assessment_id).await?;
        let items = self.items(assessment_id).await?;
        let graded = ab_db::submissions::list_releasable(&self.pool, assessment_id).await?;
        let breakdowns: Vec<(Option<f64>, GradingBreakdown)> = graded
            .iter()
            .map(|s| (s.final_score, GradingBreakdown::from_value(&s.grading)))
            .collect();

        let mut score_pcts: HashMap<AssessmentItemId, Vec<f64>> = HashMap::new();
        let mut corrects: HashMap<AssessmentItemId, Vec<bool>> = HashMap::new();
        for (_, breakdown) in &breakdowns {
            for gi in &breakdown.items {
                let pct = if gi.max_score > 0.0 {
                    gi.score / gi.max_score * 100.0
                } else {
                    0.0
                };
                score_pcts.entry(gi.item_id).or_default().push(pct);
                if let Some(c) = gi.correct {
                    corrects.entry(gi.item_id).or_default().push(c);
                }
            }
        }

        // Discrimination: correct counts in the top vs bottom 27% by total.
        let mut discrimination: HashMap<AssessmentItemId, f64> = HashMap::new();
        if breakdowns.len() >= MIN_DISCRIMINATION_SAMPLE {
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let cutoff = ((count(breakdowns.len()) * 0.27) as usize).max(1);
            let mut order: Vec<usize> = (0..breakdowns.len()).collect();
            order.sort_by(|a, b| {
                let sa = breakdowns[*a].0.unwrap_or(0.0);
                let sb = breakdowns[*b].0.unwrap_or(0.0);
                sa.total_cmp(&sb)
            });
            let bottom = &order[..cutoff];
            let top = &order[order.len() - cutoff..];
            let mut top_correct: HashMap<AssessmentItemId, i64> = HashMap::new();
            let mut bottom_correct: HashMap<AssessmentItemId, i64> = HashMap::new();
            for (group, tally) in [(top, &mut top_correct), (bottom, &mut bottom_correct)] {
                for &index in group {
                    for gi in &breakdowns[index].1.items {
                        if let Some(c) = gi.correct {
                            *tally.entry(gi.item_id).or_default() += i64::from(c);
                        }
                    }
                }
            }
            for item in &items {
                if top_correct.contains_key(&item.id) || bottom_correct.contains_key(&item.id) {
                    let diff = top_correct.get(&item.id).copied().unwrap_or(0)
                        - bottom_correct.get(&item.id).copied().unwrap_or(0);
                    #[allow(clippy::cast_precision_loss)]
                    let value = (diff as f64 / count(cutoff) * 1000.0).round() / 1000.0;
                    discrimination.insert(item.id, value);
                }
            }
        }

        Ok(items
            .into_iter()
            .map(|item| {
                let scores = score_pcts.get(&item.id);
                let correct = corrects.get(&item.id);
                ItemAnalytics {
                    response_count: i64::try_from(scores.map_or(0, Vec::len)).unwrap_or(i64::MAX),
                    avg_score_pct: scores
                        .filter(|s| !s.is_empty())
                        .map(|s| (s.iter().sum::<f64>() / count(s.len()) * 10.0).round() / 10.0),
                    correct_pct: correct.filter(|c| !c.is_empty()).map(|c| {
                        let hits = c.iter().filter(|x| **x).count();
                        (count(hits) / count(c.len()) * 1000.0).round() / 10.0
                    }),
                    discrimination_index: discrimination.get(&item.id).copied(),
                    item_id: item.id,
                    title: item.title,
                    kind: item.kind,
                    max_score: item.max_score,
                }
            })
            .collect())
    }

    /// Every non-draft submission as CSV: learner, email, attempt, status,
    /// late, submitted, auto score, final score, one column per item.
    pub async fn export_csv(&self, actor: &Actor, assessment_id: AssessmentId) -> Result<String> {
        self.grader_context(actor, assessment_id).await?;
        let items = self.items(assessment_id).await?;
        let rows = ab_db::submissions::list_non_draft(&self.pool, assessment_id).await?;
        let ids: Vec<UserId> = rows.iter().map(|r| r.user_id).collect();
        let users = users_by_id(&self.pool, &ids).await?;

        let mut header = vec![
            "student".to_owned(),
            "email".to_owned(),
            "attempt".to_owned(),
            "status".to_owned(),
            "late".to_owned(),
            "submitted_at".to_owned(),
            "auto_score".to_owned(),
            "final_score".to_owned(),
        ];
        header.extend(items.iter().map(|i| format!("item: {}", i.title)));
        let mut out = csv_row(&header);
        for row in rows {
            let user = user_or_placeholder(&users, row.user_id);
            let breakdown = GradingBreakdown::from_value(&row.grading);
            // Item columns on the item's own scale (the breakdown holds
            // share-of-100 points).
            let by_item: BTreeMap<AssessmentItemId, f64> = breakdown
                .items
                .iter()
                .map(|gi| {
                    let item_scale = items
                        .iter()
                        .find(|i| i.id == gi.item_id)
                        .map_or(gi.max_score, |i| i.max_score);
                    let score = if gi.max_score > 0.0 && item_scale > 0.0 {
                        round2(gi.score / gi.max_score * item_scale)
                    } else {
                        gi.score
                    };
                    (gi.item_id, score)
                })
                .collect();
            let mut fields = vec![
                if user.display_name.is_empty() {
                    user.username.clone()
                } else {
                    user.display_name.clone()
                },
                user.email.clone(),
                row.attempt_number.to_string(),
                row.status.as_str().to_owned(),
                if row.is_late { "yes" } else { "no" }.to_owned(),
                row.submitted_at.map(iso8601).unwrap_or_default(),
                row.auto_score.map(|s| s.to_string()).unwrap_or_default(),
                row.final_score.map(|s| s.to_string()).unwrap_or_default(),
            ];
            fields.extend(items.iter().map(|i| {
                by_item
                    .get(&i.id)
                    .map(ToString::to_string)
                    .unwrap_or_default()
            }));
            out.push_str(&csv_row(&fields));
        }
        Ok(out)
    }

    async fn items(&self, assessment_id: AssessmentId) -> Result<Vec<Item>> {
        ab_db::assessments::list_items(&self.pool, assessment_id)
            .await?
            .into_iter()
            .map(Item::try_from)
            .collect()
    }

    async fn view(&self, row: SubmissionRow, assessment: &Assessment) -> Result<TeacherSubmission> {
        let users = users_by_id(&self.pool, &[row.user_id]).await?;
        let release = release_state(&self.pool, &row).await?;
        let feedback = ab_db::submissions::list_item_feedback(&self.pool, row.id, false)
            .await?
            .into_iter()
            .map(|f| ItemFeedbackView {
                item_id: f.item_id,
                comment: f.comment,
                score: f.score,
                max_score: f.max_score,
                created_at_unix: f.created_at,
            })
            .collect();
        Ok(TeacherSubmission {
            id: row.id,
            assessment_id: row.assessment_id,
            user: user_or_placeholder(&users, row.user_id),
            status: row.status,
            release_state: release,
            attempt_number: row.attempt_number,
            answers: parse_answers(&row.answers)?,
            grading: GradingBreakdown::from_value(&row.grading),
            auto_score: row.auto_score,
            final_score: row.final_score,
            is_late: row.is_late,
            late_penalty_pct: row.late_penalty_pct,
            violation_count: row.violation_count,
            violations: row.violations,
            auto_submit_reason: row.auto_submit_reason,
            duration_seconds: row.duration_seconds,
            started_at: row.started_at,
            submitted_at: row.submitted_at,
            graded_at: row.graded_at,
            version: row.version,
            content_version: assessment.content_version,
            policy_version: assessment.policy_version,
            feedback,
        })
    }

    /// One submission with answers, breakdown, versions and feedback.
    pub async fn submission(&self, actor: &Actor, id: SubmissionId) -> Result<TeacherSubmission> {
        let row = self.load_submission(id).await?;
        let (assessment, _) = self.grader_context(actor, row.assessment_id).await?;
        self.view(row, &assessment).await
    }

    /// The append-only grading ledger, newest first.
    pub async fn grading_history(
        &self,
        actor: &Actor,
        id: SubmissionId,
    ) -> Result<Vec<GradingEntry>> {
        let row = self.load_submission(id).await?;
        self.grader_context(actor, row.assessment_id).await?;
        Ok(ab_db::submissions::list_grading_entries(&self.pool, id)
            .await?
            .into_iter()
            .map(|e| GradingEntry {
                id: e.id,
                graded_by: e.graded_by,
                raw_score: e.raw_score,
                penalty_pct: e.penalty_pct,
                final_score: e.final_score,
                overall_feedback: e.overall_feedback,
                published_at: e.published_at,
                created_at: e.created_at,
            })
            .collect())
    }

    /// Item feedback the learner may see: everything once the grade is
    /// released (or the work returned), nothing before. Ownership is the gate.
    pub async fn learner_feedback(
        &self,
        actor: &Actor,
        id: SubmissionId,
    ) -> Result<Vec<ItemFeedbackView>> {
        let row = self.load_submission(id).await?;
        if row.user_id != actor.user_id {
            return Err(Error::not_found("submission"));
        }
        // Feedback is released with the grade as a whole, whichever save
        // wrote it — the grader may comment first and publish later.
        let released = matches!(
            release_state(&self.pool, &row).await?,
            ReleaseState::Visible | ReleaseState::ReturnedForRevision
        );
        if !released {
            return Ok(Vec::new());
        }
        Ok(
            ab_db::submissions::list_item_feedback(&self.pool, id, false)
                .await?
                .into_iter()
                .map(|f| ItemFeedbackView {
                    item_id: f.item_id,
                    comment: f.comment,
                    score: f.score,
                    max_score: f.max_score,
                    created_at_unix: f.created_at,
                })
                .collect(),
        )
    }

    // ── Writes ──────────────────────────────────────────────────────────

    /// Save / publish / return a grade under the `version` lock.
    ///
    /// Item grades merge into the breakdown (a score clears the item's
    /// manual-review flag); the raw score is either given or computed from
    /// item scores; the late penalty recorded at submit applies on top.
    /// Every save appends a grading entry and its item feedback rows.
    pub async fn save_grade(
        &self,
        actor: &Actor,
        id: SubmissionId,
        input: GradeInput,
    ) -> Result<TeacherSubmission> {
        let row = self.load_submission(id).await?;
        let (assessment, _) = self.grader_context(actor, row.assessment_id).await?;
        if row.status == SubmissionStatus::Draft {
            return Err(Error::conflict("an open draft cannot be graded"));
        }
        if row.version != input.expected_version {
            return Err(stale_version(input.expected_version, row.version));
        }
        let target = input.action.target();
        if !transition_allowed(row.status, target) {
            return Err(Error::validation(vec![FieldError {
                field: "action".into(),
                code: "transition-not-allowed".into(),
                message: format!("cannot move a {} submission to {}", row.status, target),
            }]));
        }
        if let Some(score) = input.final_score
            && !(0.0..=100.0).contains(&score)
        {
            return Err(Error::validation(vec![FieldError {
                field: "final_score".into(),
                code: "range".into(),
                message: "final_score must be within 0..=100".into(),
            }]));
        }

        let items = self.items(assessment.id).await?;
        let answers = parse_answers(&row.answers)?;
        let previous = row.grading.clone();
        let mut breakdown = GradingBreakdown::from_value(&row.grading);
        merge_item_grades(&mut breakdown, &input.item_grades, &items, &answers);
        breakdown.needs_manual_review = breakdown.items.iter().any(|i| i.needs_manual_review);
        breakdown.feedback.clone_from(&input.feedback);

        let raw = input.final_score.map_or_else(
            || {
                let possible: f64 = breakdown.items.iter().map(|i| i.max_score).sum();
                let earned: f64 = breakdown.items.iter().map(|i| i.score).sum();
                if possible > 0.0 {
                    round2(earned / possible * 100.0)
                } else {
                    0.0
                }
            },
            round2,
        );
        let final_score = apply_late(raw, row.late_penalty_pct);
        let effective = breakdown.to_value();
        let written = ab_db::submissions::teacher_save(
            &self.pool,
            id,
            input.expected_version,
            target,
            &effective,
            final_score,
        )
        .await?;
        if !written {
            let latest = self.load_submission(id).await?;
            return Err(stale_version(input.expected_version, latest.version));
        }
        self.record_grade(
            actor,
            &row,
            &items,
            &input,
            LedgerEntry {
                target,
                raw,
                final_score,
                previous: &previous,
                effective: &effective,
            },
        )
        .await?;
        match target {
            SubmissionStatus::Published => {
                self.emit(
                    id,
                    "grade.published",
                    serde_json::json!({ "final_score": final_score, "published_at": now_unix() }),
                )
                .await;
            }
            SubmissionStatus::Returned => {
                self.emit(
                    id,
                    "submission.returned",
                    serde_json::json!({ "feedback": input.feedback, "returned_at": now_unix() }),
                )
                .await;
            }
            _ => {}
        }
        let fresh = self.load_submission(id).await?;
        self.view(fresh, &assessment).await
    }

    /// The ledger side of a save: grading entry, item feedback rows, audit.
    async fn record_grade(
        &self,
        actor: &Actor,
        row: &SubmissionRow,
        items: &[Item],
        input: &GradeInput,
        ledger: LedgerEntry<'_>,
    ) -> Result<()> {
        let entry = ab_db::submissions::insert_grading_entry(
            &self.pool,
            NewGradingEntry {
                submission_id: row.id,
                graded_by: Some(actor.user_id),
                raw_score: ledger.raw,
                penalty_pct: row.late_penalty_pct,
                final_score: ledger.final_score,
                raw_breakdown: ledger.previous,
                effective_breakdown: ledger.effective,
                overall_feedback: &input.feedback,
                published: ledger.target == SubmissionStatus::Published,
            },
        )
        .await?;
        let by_id: HashMap<AssessmentItemId, &Item> = items.iter().map(|i| (i.id, i)).collect();
        for grade in &input.item_grades {
            if grade.feedback.trim().is_empty() && grade.score.is_none() {
                continue;
            }
            ab_db::submissions::insert_item_feedback(
                &self.pool,
                NewItemFeedback {
                    grading_entry_id: entry,
                    submission_id: row.id,
                    item_id: Some(grade.item_id),
                    item_ref: &grade.item_id.to_string(),
                    comment: grade.feedback.trim(),
                    score: grade.score,
                    max_score: by_id.get(&grade.item_id).map(|i| i.max_score),
                    annotation_type: ab_core::assessments::AnnotationType::Text,
                    annotation_key: None,
                    graded_by: actor.user_id,
                },
            )
            .await?;
        }
        ab_db::assessments::insert_audit_event(
            &self.pool,
            row.assessment_id,
            Some(actor.user_id),
            "grade-saved",
            serde_json::json!({
                "submission_id": row.id, "status": ledger.target, "raw_score": ledger.raw,
                "final_score": ledger.final_score, "learner_id": row.user_id,
            }),
        )
        .await?;
        Ok(())
    }

    /// Release every graded submission of a batch-mode assessment: each one
    /// without a published entry gets one (copied from its latest entry or
    /// from the stored breakdown) and flips to `published`.
    pub async fn publish_all(
        &self,
        actor: &Actor,
        assessment_id: AssessmentId,
    ) -> Result<PublishSummary> {
        self.grader_context(actor, assessment_id).await?;
        let rows = ab_db::submissions::list_releasable(&self.pool, assessment_id).await?;
        let mut published = 0;
        let mut already = 0;
        for row in rows {
            if ab_db::submissions::has_published_entry(&self.pool, row.id).await? {
                already += 1;
                continue;
            }
            let latest = ab_db::submissions::latest_grading_entry(&self.pool, row.id).await?;
            let fallback_score = row.final_score.or(row.auto_score).unwrap_or(0.0);
            let breakdown = GradingBreakdown::from_value(&row.grading);
            let (raw_score, penalty_pct, final_score, feedback, raw_breakdown, effective) =
                match &latest {
                    Some(e) => (
                        e.raw_score,
                        e.penalty_pct,
                        e.final_score,
                        e.overall_feedback.clone(),
                        e.raw_breakdown.clone(),
                        e.effective_breakdown.clone(),
                    ),
                    None => (
                        fallback_score,
                        row.late_penalty_pct,
                        fallback_score,
                        breakdown.feedback.clone(),
                        row.grading.clone(),
                        row.grading.clone(),
                    ),
                };
            ab_db::submissions::insert_grading_entry(
                &self.pool,
                NewGradingEntry {
                    submission_id: row.id,
                    graded_by: Some(actor.user_id),
                    raw_score,
                    penalty_pct,
                    final_score,
                    raw_breakdown: &raw_breakdown,
                    effective_breakdown: &effective,
                    overall_feedback: &feedback,
                    published: true,
                },
            )
            .await?;
            ab_db::submissions::mark_published(&self.pool, row.id, final_score).await?;
            published += 1;
            self.emit(
                row.id,
                "grade.published",
                serde_json::json!({ "final_score": final_score, "published_at": now_unix() }),
            )
            .await;
        }
        if published > 0 {
            ab_db::assessments::insert_audit_event(
                &self.pool,
                assessment_id,
                Some(actor.user_id),
                "grades-published",
                serde_json::json!({ "published": published, "already_published": already }),
            )
            .await?;
        }
        Ok(PublishSummary {
            published_count: published,
            already_published_count: already,
        })
    }

    // ── Course gradebook ────────────────────────────────────────────────

    /// Latest non-draft submission per (learner, assessment) of a course,
    /// keyset on that pair. Progress projections replace this in P6.
    pub async fn gradebook(
        &self,
        actor: &Actor,
        course_id: CourseId,
        cursor: Option<&str>,
        limit: i64,
    ) -> Result<GradebookPage> {
        let course = self.assessments.courses.get(actor, course_id).await?;
        AssessmentsService::require_scoped(actor, &course, Action::Grade, "gradebook")?;
        let after = cursor.map(parse_gradebook_cursor).transpose()?;
        let limit = limit.clamp(1, MAX_GRADEBOOK_PAGE);
        let mut rows =
            ab_db::submissions::gradebook_cells(&self.pool, course_id, after, limit + 1).await?;
        let page = usize::try_from(limit).unwrap_or(usize::MAX);
        let next_cursor = if rows.len() > page {
            rows.truncate(page);
            rows.last()
                .map(|r| format!("{}:{}", r.user_id, r.assessment_id))
        } else {
            None
        };
        let mut ids: Vec<UserId> = rows.iter().map(|r| r.user_id).collect();
        ids.sort();
        ids.dedup();
        let users = ab_db::identity::list_user_summaries(&self.pool, &ids)
            .await?
            .into_iter()
            .map(summary)
            .collect();
        let assessments = ab_db::assessments::list_assessments_for_course(&self.pool, course_id)
            .await?
            .into_iter()
            .map(|a| GradebookAssessment {
                id: a.id,
                title: a.title,
                kind: a.kind,
                due_at: a.due_at,
                passing_score: a.passing_score,
            })
            .collect();
        Ok(GradebookPage {
            cells: rows
                .into_iter()
                .map(|r| GradebookCell {
                    user_id: r.user_id,
                    assessment_id: r.assessment_id,
                    submission_id: r.submission_id,
                    status: r.status,
                    attempt_number: r.attempt_number,
                    attempts: r.attempts,
                    final_score: r.final_score,
                    is_late: r.is_late,
                    submitted_at: r.submitted_at,
                    graded_at: r.graded_at,
                })
                .collect(),
            users,
            assessments,
            next_cursor,
        })
    }
}

/// What one save writes to the grading ledger.
struct LedgerEntry<'a> {
    target: SubmissionStatus,
    raw: f64,
    final_score: f64,
    previous: &'a serde_json::Value,
    effective: &'a serde_json::Value,
}

fn stale_version(expected: i64, actual: i64) -> Error {
    Error::app_with_details(
        ErrorCode::PreconditionFailed,
        "submission changed since you loaded it",
        serde_json::json!({ "expected": expected, "actual": actual }),
    )
}

/// `"<user_id>:<assessment_id>"`.
fn parse_gradebook_cursor(cursor: &str) -> Result<(UserId, AssessmentId)> {
    let invalid = || {
        Error::validation(vec![FieldError {
            field: "cursor".into(),
            code: "invalid".into(),
            message: "cursor must be <user_id>:<assessment_id>".into(),
        }])
    };
    let (user, assessment) = cursor.split_once(':').ok_or_else(invalid)?;
    Ok((
        UserId(uuid::Uuid::parse_str(user).map_err(|_| invalid())?),
        AssessmentId(uuid::Uuid::parse_str(assessment).map_err(|_| invalid())?),
    ))
}

/// Legacy merge: a score sets the item and clears manual review; feedback
/// replaces the item feedback; unknown items are appended (with the real
/// max score when the item still exists — the legacy wrote 0).
fn merge_item_grades(
    breakdown: &mut GradingBreakdown,
    grades: &[ItemGrade],
    items: &[Item],
    answers: &Answers,
) {
    for grade in grades {
        let item = items.iter().find(|i| i.id == grade.item_id);
        if let Some(existing) = breakdown
            .items
            .iter_mut()
            .find(|i| i.item_id == grade.item_id)
        {
            if let Some(score) = grade.score {
                // Teachers score on the item's own scale; the breakdown keeps
                // points as a share of 100 (the auto-grader's unit).
                existing.score = match item {
                    Some(i) if i.max_score > 0.0 && existing.max_score > 0.0 => {
                        round2(score / i.max_score * existing.max_score)
                    }
                    _ => score,
                };
                existing.needs_manual_review = false;
            }
            if !grade.feedback.trim().is_empty() {
                grade.feedback.trim().clone_into(&mut existing.feedback);
            }
            continue;
        }
        breakdown.items.push(GradedItem {
            item_id: grade.item_id,
            item_text: item.map(|i| i.title.clone()).unwrap_or_default(),
            score: grade.score.unwrap_or(0.0),
            max_score: item.map_or(0.0, |i| i.max_score),
            correct: None,
            feedback: grade.feedback.trim().to_owned(),
            needs_manual_review: false,
            user_answer: answers
                .get(&grade.item_id)
                .and_then(|a| serde_json::to_value(a).ok())
                .unwrap_or(serde_json::Value::Null),
            correct_answer: serde_json::Value::Null,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn teacher_transitions_follow_legacy_table() {
        use SubmissionStatus as S;
        assert!(transition_allowed(S::Pending, S::Graded));
        assert!(transition_allowed(S::Pending, S::Published));
        assert!(transition_allowed(S::Pending, S::Returned));
        assert!(transition_allowed(S::Graded, S::Graded));
        assert!(transition_allowed(S::Graded, S::Published));
        assert!(transition_allowed(S::Returned, S::Pending));
        assert!(transition_allowed(S::Published, S::Published));
        assert!(!transition_allowed(S::Published, S::Returned));
        assert!(!transition_allowed(S::Published, S::Graded));
        assert!(!transition_allowed(S::Draft, S::Graded));
        assert!(!transition_allowed(S::Draft, S::Draft));
    }

    #[test]
    fn csv_fields_are_quoted_when_needed() {
        assert_eq!(csv_field("plain"), "plain");
        assert_eq!(csv_field("a,b"), "\"a,b\"");
        assert_eq!(csv_field("say \"hi\""), "\"say \"\"hi\"\"\"");
        assert_eq!(csv_row(&["a".into(), "b,c".into()]), "a,\"b,c\"\r\n");
    }
}
