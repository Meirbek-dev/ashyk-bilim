//! Learner submissions: start → draft → submit, the auto-grading pipeline
//! (validate → enforce → grade → penalize → persist → audit), the timer
//! sweep, and the student-facing redacted view.
//!
//! Ported from `attempt_service.py` + `pipeline/*`. What changed: one
//! attempt-limit check instead of three, a DB-enforced single draft, real
//! backoff columns for the timer, late penalties that survive manual
//! review, and code challenges that go to manual review until a final run
//! exists (4.4 runs Judge0 at submit).

use std::time::Duration;

use ab_core::assessments::{
    AssessmentKind, AutoSubmitReason, CodeRunStatus, GradeReleaseMode, ItemKind, SubmissionStatus,
};
use ab_core::id::{AssessmentId, SubmissionId};
use ab_core::{Error, ErrorCode, Result};
use ab_db::submissions::{NewGradingEntry, SubmitOutcome};
use serde::Serialize;
use sqlx::PgPool;

pub use ab_db::submissions::SubmissionRow as Submission;

use crate::assessments::access::EffectivePolicy;
use crate::assessments::items::ItemBody;
use crate::assessments::service::{Assessment, AssessmentsService, Item};
use crate::code::{CodeRunner, FinalRun, FinalTarget};
use crate::grading::answers::{
    self, Answers, ItemAnswer, ItemShape, answers_to_value, parse_answers,
};
use crate::grading::breakdown::GradingBreakdown;
use crate::grading::grader::{self, AutoGrade, CaseOutcome, GraderPolicy};
use crate::grading::penalties::{self, PenaltyInput};
use crate::identity::Actor;
use crate::identity::rate_limit::RateLimiter;

/// Legacy `SUBMIT_GRACE_SECONDS`.
pub const SUBMIT_GRACE_SECONDS: i64 = 30;
/// Draft saves: one per submission per this window (legacy 5s throttle).
pub const DRAFT_SAVE_WINDOW: Duration = Duration::from_secs(5);
/// Submits: 3 per learner per 10s (legacy rate limit dependency).
pub const SUBMIT_LIMIT: u32 = 3;
pub const SUBMIT_WINDOW: Duration = Duration::from_secs(10);
/// Timer backoff: 120s · 2^n capped at an hour, five attempts.
pub const AUTO_SUBMIT_MAX_ATTEMPTS: i32 = 5;
/// Violation events kept per draft (the count itself is unbounded).
const MAX_VIOLATION_EVENTS: usize = 200;

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// 409 with the versions, so a client can reload and retry.
fn stale_draft(expected: i64, actual: i64) -> Error {
    Error::app_with_details(
        ErrorCode::Conflict,
        "draft changed since you loaded it",
        serde_json::json!({ "expected": expected, "actual": actual }),
    )
}

/// The outcome of `start`: the draft, and whether this call opened it.
#[derive(Debug, Clone)]
pub struct Started {
    pub submission: StudentSubmission,
    pub created: bool,
}

#[derive(Debug, Clone, Copy, Serialize, utoipa::ToSchema)]
pub struct ViolationState {
    pub violation_count: i32,
    pub threshold: i32,
    /// Submitting now zeroes the attempt.
    pub exceeded: bool,
}

/// The post-grading decision: where the attempt lands and what it scores.
struct Verdict {
    status: SubmissionStatus,
    manual: bool,
    auto_score: f64,
    final_score: Option<f64>,
    auto_submit_reason: Option<AutoSubmitReason>,
}

impl Verdict {
    /// Manual review → pending; code challenges and immediate release publish
    /// straight away; batch release waits as graded. A blocking integrity
    /// violation overrides manual review and zeroes the attempt.
    fn decide(
        assessment: &Assessment,
        grade: &AutoGrade,
        penalty: &penalties::PenaltyOutcome,
        requested_reason: Option<AutoSubmitReason>,
    ) -> Self {
        let manual = grade.breakdown.needs_manual_review && !penalty.violation_zeroed;
        let status = if manual {
            SubmissionStatus::Pending
        } else if assessment.kind == AssessmentKind::CodeChallenge
            || assessment.grade_release_mode == GradeReleaseMode::Immediate
        {
            SubmissionStatus::Published
        } else {
            SubmissionStatus::Graded
        };
        Self {
            status,
            manual,
            auto_score: if penalty.violation_zeroed {
                0.0
            } else {
                grade.auto_score
            },
            final_score: (!manual).then_some(penalty.final_score),
            auto_submit_reason: if penalty.violation_zeroed {
                Some(AutoSubmitReason::IntegrityViolation)
            } else {
                requested_reason
            },
        }
    }
}

/// No automatic grade: a teacher must score this attempt.
const fn manual_review() -> AutoGrade {
    AutoGrade {
        auto_score: 0.0,
        breakdown: GradingBreakdown {
            items: Vec::new(),
            needs_manual_review: true,
            auto_graded: false,
            feedback: String::new(),
        },
    }
}

/// Every test failed — a blank answer or one no runner will accept.
fn failed_cases(body: &crate::assessments::items::CodeBody) -> Vec<CaseOutcome> {
    body.tests
        .iter()
        .map(|t| CaseOutcome {
            test_id: t.id.clone(),
            weight: f64::from(t.weight.max(1)),
            passed: false,
        })
        .collect()
}

/// Anti-cheat blocks only when a detector is enabled and the threshold is hit.
const fn violation_exceeded(assessment: &Assessment, violation_count: i32) -> bool {
    let detection_on = assessment.copy_paste_protection
        || assessment.tab_switch_detection
        || assessment.devtools_detection
        || assessment.right_click_disabled
        || assessment.fullscreen_required;
    detection_on
        && assessment.violation_threshold > 0
        && violation_count >= assessment.violation_threshold
}

/// Write-once copies of the items and the effective policy as they were at
/// submit time, so later edits never change what a learner was graded on.
fn snapshots(
    items: &[Item],
    assessment: &Assessment,
    effective: &EffectivePolicy,
) -> (serde_json::Value, serde_json::Value) {
    let items = items
        .iter()
        .map(|i| {
            serde_json::json!({
                "id": i.id, "kind": i.kind, "title": i.title, "max_score": i.max_score,
                "position": i.position, "body": i.body.to_stored(),
            })
        })
        .collect::<Vec<_>>();
    (
        serde_json::json!({ "items": items }),
        serde_json::json!({
            "max_attempts": effective.max_attempts,
            "time_limit_seconds": effective.time_limit_seconds,
            "due_at": effective.due_at,
            "allow_late": effective.allow_late,
            "passing_score": effective.passing_score,
            "grading_mode": assessment.grading_mode,
            "grade_release_mode": assessment.grade_release_mode,
            "completion_rule": assessment.completion_rule,
            "attempt_penalty_percent": assessment.attempt_penalty_percent,
        }),
    )
}

/// What the learner may see of a grade (legacy `release_state`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ReleaseState {
    Hidden,
    AwaitingRelease,
    Visible,
    ReturnedForRevision,
}

/// What the learner may see (legacy `_release_state_for_submission`):
/// returned work shows the revision request, published work is visible,
/// graded work only once a published entry exists.
pub(crate) async fn release_state(pool: &PgPool, submission: &Submission) -> Result<ReleaseState> {
    Ok(match submission.status {
        SubmissionStatus::Returned => ReleaseState::ReturnedForRevision,
        SubmissionStatus::Published => ReleaseState::Visible,
        SubmissionStatus::Graded => {
            if ab_db::submissions::has_published_entry(pool, submission.id).await? {
                ReleaseState::Visible
            } else {
                ReleaseState::AwaitingRelease
            }
        }
        SubmissionStatus::Draft | SubmissionStatus::Pending => ReleaseState::Hidden,
    })
}

/// A submission as its owner sees it: scores and grading only once
/// released (the legacy also leaked `late_penalty_pct`; we hide it too).
#[derive(Debug, Clone)]
pub struct StudentSubmission {
    pub id: SubmissionId,
    pub assessment_id: AssessmentId,
    pub attempt_number: i32,
    pub status: SubmissionStatus,
    pub release_state: ReleaseState,
    pub answers: Answers,
    pub grading: Option<GradingBreakdown>,
    pub auto_score: Option<f64>,
    pub final_score: Option<f64>,
    pub is_late: bool,
    pub late_penalty_pct: Option<f64>,
    pub started_at: Option<i64>,
    pub submitted_at: Option<i64>,
    pub graded_at: Option<i64>,
    pub draft_version: i64,
    pub violation_count: i32,
    pub answered_count: usize,
    pub total_items: usize,
    /// Seconds left on an open timed draft.
    pub time_remaining_seconds: Option<i64>,
}

/// Everything the pipeline needs about the attempt.
struct Context {
    submission: Submission,
    assessment: Assessment,
    items: Vec<Item>,
    effective: EffectivePolicy,
}

struct FinalizeOptions {
    skip_constraints: bool,
    violation_count: i32,
    auto_submit_reason: Option<AutoSubmitReason>,
}

#[derive(Clone)]
pub struct SubmissionsService {
    pool: PgPool,
    assessments: AssessmentsService,
    limiter: RateLimiter,
    /// Runs code-challenge tests at submit time.
    runner: CodeRunner,
}

impl SubmissionsService {
    #[must_use]
    pub const fn new(
        pool: PgPool,
        assessments: AssessmentsService,
        limiter: RateLimiter,
        runner: CodeRunner,
    ) -> Self {
        Self {
            pool,
            assessments,
            limiter,
            runner,
        }
    }

    // ── Reads ───────────────────────────────────────────────────────────

    async fn owned(&self, actor: &Actor, id: SubmissionId) -> Result<Submission> {
        let submission = ab_db::submissions::get_submission(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("submission"))?;
        if submission.user_id != actor.user_id {
            return Err(Error::not_found("submission"));
        }
        Ok(submission)
    }

    async fn context(&self, actor: &Actor, submission: Submission) -> Result<Context> {
        let state = self
            .assessments
            .attempt_state(actor, submission.assessment_id)
            .await?;
        let detail = self
            .assessments
            .get(actor, submission.assessment_id)
            .await?;
        Ok(Context {
            submission,
            assessment: detail.assessment,
            items: detail.items,
            effective: state.effective,
        })
    }

    /// The owner's view, redacted by release state.
    pub async fn student_view(
        &self,
        submission: Submission,
        time_limit_seconds: Option<i32>,
        total_items: usize,
    ) -> Result<StudentSubmission> {
        let release_state = release_state(&self.pool, &submission).await?;
        let visible = matches!(
            release_state,
            ReleaseState::Visible | ReleaseState::ReturnedForRevision
        );
        let answers = parse_answers(&submission.answers)?;
        let answered_count = answers.values().filter(|a| !a.is_blank()).count();
        let time_remaining_seconds =
            match (submission.status, submission.started_at, time_limit_seconds) {
                (SubmissionStatus::Draft, Some(started), Some(limit)) => {
                    Some((started + i64::from(limit) - now_unix()).max(0))
                }
                _ => None,
            };
        Ok(StudentSubmission {
            id: submission.id,
            assessment_id: submission.assessment_id,
            attempt_number: submission.attempt_number,
            status: submission.status,
            release_state,
            answers,
            grading: visible.then(|| GradingBreakdown::from_value(&submission.grading)),
            auto_score: visible.then_some(submission.auto_score).flatten(),
            final_score: visible.then_some(submission.final_score).flatten(),
            is_late: submission.is_late,
            late_penalty_pct: visible.then_some(submission.late_penalty_pct),
            started_at: submission.started_at,
            submitted_at: submission.submitted_at,
            graded_at: visible.then_some(submission.graded_at).flatten(),
            draft_version: submission.draft_version,
            violation_count: submission.violation_count,
            answered_count,
            total_items,
            time_remaining_seconds,
        })
    }

    /// The learner's open draft, if any.
    pub async fn current_draft(
        &self,
        actor: &Actor,
        assessment_id: AssessmentId,
    ) -> Result<Option<StudentSubmission>> {
        let state = self.assessments.attempt_state(actor, assessment_id).await?;
        let Some(draft) =
            ab_db::submissions::open_draft(&self.pool, assessment_id, actor.user_id).await?
        else {
            return Ok(None);
        };
        let total = ab_db::assessments::count_items(&self.pool, assessment_id).await?;
        Ok(Some(
            self.student_view(
                draft,
                state.effective.time_limit_seconds,
                usize::try_from(total).unwrap_or(0),
            )
            .await?,
        ))
    }

    /// Every attempt, newest first.
    pub async fn my_submissions(
        &self,
        actor: &Actor,
        assessment_id: AssessmentId,
    ) -> Result<Vec<StudentSubmission>> {
        let state = self.assessments.attempt_state(actor, assessment_id).await?;
        let total =
            usize::try_from(ab_db::assessments::count_items(&self.pool, assessment_id).await?)
                .unwrap_or(0);
        let rows =
            ab_db::submissions::list_user_submissions(&self.pool, assessment_id, actor.user_id)
                .await?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(
                self.student_view(row, state.effective.time_limit_seconds, total)
                    .await?,
            );
        }
        Ok(out)
    }

    /// One attempt the caller owns (404 otherwise — no existence leak).
    pub async fn my_submission(
        &self,
        actor: &Actor,
        id: SubmissionId,
    ) -> Result<StudentSubmission> {
        let submission = self.owned(actor, id).await?;
        let state = self
            .assessments
            .attempt_state(actor, submission.assessment_id)
            .await?;
        let total = usize::try_from(
            ab_db::assessments::count_items(&self.pool, submission.assessment_id).await?,
        )
        .unwrap_or(0);
        self.student_view(submission, state.effective.time_limit_seconds, total)
            .await
    }

    // ── Lifecycle ───────────────────────────────────────────────────────

    /// Open (or return the existing) draft. Legacy `start_submission_v2`.
    pub async fn start(&self, actor: &Actor, assessment_id: AssessmentId) -> Result<Started> {
        let state = self.assessments.attempt_state(actor, assessment_id).await?;
        if !state.can_start && !state.can_continue {
            return Err(Error::forbidden(format!(
                "cannot start: {}",
                state
                    .disabled_reasons
                    .iter()
                    .map(|r| format!("{r:?}"))
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
        }
        let assessment = self.assessments.get(actor, assessment_id).await?.assessment;
        let completed =
            ab_db::submissions::count_completed_attempts(&self.pool, assessment_id, actor.user_id)
                .await?;
        let attempt_number = i32::try_from(completed)
            .unwrap_or(i32::MAX)
            .saturating_add(1);
        let inserted = ab_db::submissions::insert_draft(
            &self.pool,
            assessment_id,
            assessment.course_id,
            actor.user_id,
            attempt_number,
            assessment.content_version,
            assessment.policy_version,
        )
        .await?;
        let created = inserted.is_some();
        let draft = match inserted {
            Some(id) => ab_db::submissions::get_submission(&self.pool, id).await?,
            // Idempotent: the open draft already exists.
            None => {
                ab_db::submissions::open_draft(&self.pool, assessment_id, actor.user_id).await?
            }
        }
        .ok_or_else(|| Error::not_found("submission"))?;
        let total =
            usize::try_from(ab_db::assessments::count_items(&self.pool, assessment_id).await?)
                .unwrap_or(0);
        let submission = self
            .student_view(draft, state.effective.time_limit_seconds, total)
            .await?;
        Ok(Started {
            submission,
            created,
        })
    }

    /// Record one anti-cheat event on the open draft (legacy stored these
    /// in `metadata_json.violations`). The server-side count is what the
    /// submit path trusts; the client's number can only raise it.
    pub async fn report_violation(
        &self,
        actor: &Actor,
        id: SubmissionId,
        kind: &str,
        detail: Option<&str>,
    ) -> Result<ViolationState> {
        let submission = self.owned(actor, id).await?;
        if submission.status != SubmissionStatus::Draft {
            return Err(Error::conflict("submission is no longer a draft"));
        }
        let assessment = self
            .assessments
            .get(actor, submission.assessment_id)
            .await?
            .assessment;
        let mut events = submission
            .violations
            .as_array()
            .cloned()
            .unwrap_or_default();
        if events.len() >= MAX_VIOLATION_EVENTS {
            events.remove(0);
        }
        events.push(serde_json::json!({
            "kind": kind, "detail": detail, "at": now_unix(),
        }));
        let violation_count = submission.violation_count.saturating_add(1);
        ab_db::submissions::record_violations(
            &self.pool,
            id,
            violation_count,
            &serde_json::Value::Array(events),
        )
        .await?;
        Ok(ViolationState {
            violation_count,
            threshold: assessment.violation_threshold,
            exceeded: violation_exceeded(&assessment, violation_count),
        })
    }

    /// Merge answers into the open draft under the learner's optimistic
    /// lock. Throttled to one save per 5s per draft.
    pub async fn save_draft(
        &self,
        actor: &Actor,
        id: SubmissionId,
        patch: Answers,
        expected_draft_version: i64,
    ) -> Result<StudentSubmission> {
        let submission = self.owned(actor, id).await?;
        if submission.status != SubmissionStatus::Draft {
            return Err(Error::conflict("submission is no longer a draft"));
        }
        // A stale client is told so before it spends its throttle budget;
        // the compare-and-set below still catches the race.
        if submission.draft_version != expected_draft_version {
            return Err(stale_draft(
                expected_draft_version,
                submission.draft_version,
            ));
        }
        let ctx = self.context(actor, submission).await?;
        Self::check_time_limit(&ctx, 0)?;
        let merged = Self::merge(&ctx, patch)?;
        // Only a save that would otherwise succeed spends the throttle
        // budget; a rejected one must not lock the client out for 5s.
        if !self
            .limiter
            .check(&format!("draft_throttle:{id}"), 1, DRAFT_SAVE_WINDOW)
            .await?
        {
            return Err(Error::app(
                ErrorCode::RateLimited,
                "draft saves are limited to one per 5 seconds",
            ));
        }
        if !ab_db::submissions::save_draft_answers(
            &self.pool,
            id,
            &answers_to_value(&merged),
            expected_draft_version,
        )
        .await?
        {
            let latest = ab_db::submissions::get_submission(&self.pool, id)
                .await?
                .ok_or_else(|| Error::not_found("submission"))?;
            return Err(stale_draft(expected_draft_version, latest.draft_version));
        }
        let fresh = ab_db::submissions::get_submission(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("submission"))?;
        let total = ctx.items.len();
        self.student_view(fresh, ctx.effective.time_limit_seconds, total)
            .await
    }

    fn merge(ctx: &Context, patch: Answers) -> Result<Answers> {
        let current = parse_answers(&ctx.submission.answers)?;
        let shapes: Vec<ItemShape> = ctx
            .items
            .iter()
            .map(|i| ItemShape {
                id: i.id,
                kind: i.kind,
            })
            .collect();
        answers::canonicalize(&current, patch, &shapes)
    }

    fn check_time_limit(ctx: &Context, grace: i64) -> Result<()> {
        if let (Some(limit), Some(started)) =
            (ctx.effective.time_limit_seconds, ctx.submission.started_at)
            && now_unix() > started + i64::from(limit) + grace
        {
            return Err(Error::forbidden("TIME_LIMIT_EXPIRED"));
        }
        Ok(())
    }

    /// Submit the draft (optionally saving a last patch first).
    ///
    /// `reported_violations` is the client's count; the stored count from
    /// [`Self::report_violation`] wins when higher.
    pub async fn submit(
        &self,
        actor: &Actor,
        id: SubmissionId,
        patch: Option<Answers>,
        reported_violations: i32,
        expected_draft_version: Option<i64>,
    ) -> Result<StudentSubmission> {
        if !self
            .limiter
            .check(
                &format!("submit_rl:{}", actor.user_id),
                SUBMIT_LIMIT,
                SUBMIT_WINDOW,
            )
            .await?
        {
            return Err(Error::app(
                ErrorCode::RateLimited,
                "too many submit attempts; slow down",
            ));
        }
        let submission = self.owned(actor, id).await?;
        if submission.status != SubmissionStatus::Draft {
            return Err(Error::conflict("submission was already submitted"));
        }
        if let Some(expected) = expected_draft_version
            && expected != submission.draft_version
        {
            return Err(stale_draft(expected, submission.draft_version));
        }
        let violation_count = submission.violation_count.max(reported_violations);
        let ctx = self.context(actor, submission).await?;
        let answers = match patch {
            Some(patch) => Self::merge(&ctx, patch)?,
            None => Self::merge(&ctx, Answers::new())?,
        };
        let fresh = Self::finalize(
            &self.runner,
            ctx,
            answers,
            FinalizeOptions {
                skip_constraints: false,
                violation_count,
                auto_submit_reason: None,
            },
        )
        .await?;
        let time_limit = fresh.1;
        let total = fresh.2;
        self.student_view(fresh.0, time_limit, total).await
    }

    /// The pipeline proper. Returns (row, time limit, item count).
    async fn finalize(
        runner: &CodeRunner,
        ctx: Context,
        answers: Answers,
        opts: FinalizeOptions,
    ) -> Result<(Submission, Option<i32>, usize)> {
        let pool = runner.pool();
        let now = now_unix();
        let Context {
            submission,
            assessment,
            items,
            effective,
        } = ctx;

        if !opts.skip_constraints {
            Self::enforce_constraints(pool, &submission, &assessment, &effective, now).await?;
        }
        let violation_exceeded = violation_exceeded(&assessment, opts.violation_count);

        let grade = Self::auto_grade(
            runner,
            &submission,
            &assessment,
            &items,
            &answers,
            opts.skip_constraints,
        )
        .await?;
        let late_pct = penalties::late_penalty_pct(
            effective.late_policy,
            effective.due_at,
            now,
            effective.allow_late,
        );
        let penalty = penalties::apply(&PenaltyInput {
            auto_score: grade.auto_score,
            needs_manual_review: grade.breakdown.needs_manual_review,
            violation_exceeded,
            attempt_number: submission.attempt_number,
            attempt_penalty_percent: assessment.attempt_penalty_percent,
            late_pct,
            waive_late_penalty: effective.waive_late_penalty,
        });
        let verdict = Verdict::decide(&assessment, &grade, &penalty, opts.auto_submit_reason);
        let breakdown = grade.breakdown.to_value();
        let answers_value = answers_to_value(&answers);
        let written = ab_db::submissions::persist_submit(
            pool,
            submission.id,
            SubmitOutcome {
                status: verdict.status,
                answers: &answers_value,
                grading: &breakdown,
                auto_score: Some(verdict.auto_score),
                final_score: verdict.final_score,
                is_late: effective.due_at.is_some_and(|due| now > due),
                late_penalty_pct: penalty.late_penalty_pct,
                violation_count: opts.violation_count,
                auto_submit_reason: verdict.auto_submit_reason,
                graded: !verdict.manual,
                duration_seconds: submission
                    .started_at
                    .map(|s| i32::try_from((now - s).max(0)).unwrap_or(i32::MAX)),
            },
        )
        .await?;
        if !written {
            return Err(Error::conflict("submission was already submitted"));
        }
        let (items_snapshot, policy_snapshot) = snapshots(&items, &assessment, &effective);
        ab_db::submissions::set_snapshots(pool, submission.id, &items_snapshot, &policy_snapshot)
            .await?;
        if !verdict.manual {
            ab_db::submissions::insert_grading_entry(
                pool,
                NewGradingEntry {
                    submission_id: submission.id,
                    graded_by: None,
                    raw_score: verdict.auto_score,
                    penalty_pct: penalty.late_penalty_pct,
                    final_score: penalty.final_score,
                    raw_breakdown: &breakdown,
                    effective_breakdown: &breakdown,
                    overall_feedback: "",
                    published: verdict.status == SubmissionStatus::Published,
                },
            )
            .await?;
        }
        ab_db::assessments::insert_audit_event(
            pool,
            assessment.id,
            Some(submission.user_id),
            "submission-submitted",
            serde_json::json!({
                "submission_id": submission.id, "attempt": submission.attempt_number,
                "status": verdict.status, "auto_submit_reason": verdict.auto_submit_reason,
            }),
        )
        .await?;
        let fresh = ab_db::submissions::get_submission(pool, submission.id)
            .await?
            .ok_or_else(|| Error::not_found("submission"))?;
        Ok((fresh, effective.time_limit_seconds, items.len()))
    }

    /// The submit-time gates (legacy `_validate_submission_constraints`).
    async fn enforce_constraints(
        pool: &PgPool,
        submission: &Submission,
        assessment: &Assessment,
        effective: &EffectivePolicy,
        now: i64,
    ) -> Result<()> {
        if let Some(max) = effective.max_attempts {
            let completed = ab_db::submissions::count_completed_attempts(
                pool,
                assessment.id,
                submission.user_id,
            )
            .await?;
            if completed >= i64::from(max) {
                return Err(Error::forbidden("MAX_ATTEMPTS_REACHED"));
            }
        }
        if let (Some(limit), Some(started)) = (effective.time_limit_seconds, submission.started_at)
            && now > started + i64::from(limit) + SUBMIT_GRACE_SECONDS
        {
            return Err(Error::forbidden("TIME_LIMIT_EXPIRED"));
        }
        if !effective.allow_late && effective.due_at.is_some_and(|due| now > due) {
            return Err(Error::forbidden("PAST_DUE"));
        }
        Ok(())
    }

    /// Kind-dispatched auto grade. Code challenges grade from the newest
    /// final run; without one they wait for a human.
    /// Kind-dispatched auto grade. Code challenges run their tests on Judge0
    /// here (a `final` run, replayed if the submit is retried). `lenient` is
    /// the timer path: it cannot show the learner an error, so a compile
    /// error scores what it earned (nothing) and an unavailable runner
    /// hands the attempt to a human instead of blocking the deadline.
    async fn auto_grade(
        runner: &CodeRunner,
        submission: &Submission,
        assessment: &Assessment,
        items: &[Item],
        answers: &Answers,
        lenient: bool,
    ) -> Result<AutoGrade> {
        if assessment.kind != AssessmentKind::CodeChallenge {
            return Ok(grader::grade_quiz(
                items,
                answers,
                GraderPolicy {
                    partial_credit: assessment.partial_credit,
                    negative_marking_percent: assessment.negative_marking_percent,
                },
            ));
        }
        let Some(item) = items.iter().find(|i| i.kind == ItemKind::Code) else {
            return Ok(manual_review());
        };
        let ItemBody::Code(body) = &item.body else {
            return Ok(manual_review());
        };
        let answer = answers.get(&item.id);
        let (language_id, source) = match answer {
            Some(ItemAnswer::Code { language, source }) => (*language, source.as_str()),
            _ => (0, ""),
        };
        if source.trim().is_empty() {
            // Nothing to run: every test fails (legacy scored 0 with no run).
            return Ok(grader::grade_code(item, &failed_cases(body), answer));
        }
        let target = FinalTarget {
            submission_id: submission.id,
            assessment_id: assessment.id,
            item_id: item.id,
            user_id: submission.user_id,
        };
        let outcome = runner.final_run(target, body, language_id, source).await?;
        let cases: Vec<CaseOutcome> = match outcome {
            FinalRun::Ran(run) => {
                if run.status == CodeRunStatus::InternalError {
                    if lenient {
                        return Ok(manual_review());
                    }
                    return Err(Error::app_with_details(
                        ErrorCode::CodeRunnerDegraded,
                        run.error_message
                            .unwrap_or_else(|| "code runner rejected the submission".into()),
                        serde_json::json!({ "is_retryable": false, "item_id": item.id }),
                    ));
                }
                if run.status == CodeRunStatus::CompileError && !lenient {
                    return Err(Error::app_with_details(
                        ErrorCode::CompileError,
                        "source code does not compile",
                        serde_json::json!({
                            "item_id": item.id, "run_id": run.id,
                            "compile_output": run.compile_output,
                        }),
                    ));
                }
                run.cases
                    .iter()
                    .map(|c| CaseOutcome {
                        test_id: c.test_id.clone(),
                        weight: c.weight,
                        passed: c.passed,
                    })
                    .collect()
            }
            FinalRun::Degraded(message) => {
                if lenient {
                    return Ok(manual_review());
                }
                return Err(Error::app_with_details(
                    ErrorCode::CodeRunnerDegraded,
                    message,
                    serde_json::json!({ "is_retryable": true, "item_id": item.id }),
                ));
            }
            FinalRun::LanguageNotAllowed { allowed } => {
                if !lenient {
                    return Err(Error::app_with_details(
                        ErrorCode::LanguageNotAllowed,
                        "the answer's language is not allowed for this item",
                        serde_json::json!({ "item_id": item.id, "allowed_language_ids": allowed }),
                    ));
                }
                failed_cases(body)
            }
        };
        Ok(grader::grade_code(item, &cases, answer))
    }

    // ── Timer sweep (system actor) ──────────────────────────────────────

    /// Auto-submit every open timed draft past its deadline. Constraints
    /// are skipped (the deadline IS the reason); penalties still apply.
    pub async fn sweep_expired_drafts(runner: &CodeRunner, limit: i64) -> Result<usize> {
        let pool = runner.pool();
        let ids = ab_db::submissions::list_expired_drafts(pool, limit).await?;
        let mut done = 0;
        for id in ids {
            match Self::auto_submit_one(runner, id).await {
                Ok(()) => done += 1,
                Err(err) => {
                    let attempts = ab_db::submissions::get_submission(pool, id)
                        .await?
                        .map_or(0, |s| s.auto_submit_attempts);
                    let backoff = (120.0 * 2f64.powi(attempts)).min(3600.0);
                    tracing::error!(%id, %err, attempts, "auto-submit failed; backing off");
                    ab_db::submissions::record_auto_submit_failure(pool, id, backoff).await?;
                }
            }
        }
        Ok(done)
    }

    async fn auto_submit_one(runner: &CodeRunner, id: SubmissionId) -> Result<()> {
        let pool = runner.pool();
        let submission = ab_db::submissions::get_submission(pool, id)
            .await?
            .ok_or_else(|| Error::not_found("submission"))?;
        if submission.status != SubmissionStatus::Draft {
            return Ok(());
        }
        let assessment = ab_db::assessments::get_assessment(pool, submission.assessment_id)
            .await?
            .ok_or_else(|| Error::not_found("assessment"))?;
        let items = ab_db::assessments::list_items(pool, assessment.id)
            .await?
            .into_iter()
            .map(Item::try_from)
            .collect::<Result<Vec<_>>>()?;
        let effective =
            AssessmentsService::effective_policy_for(pool, &assessment, submission.user_id, false)
                .await?;
        let shapes: Vec<ItemShape> = items
            .iter()
            .map(|i| ItemShape {
                id: i.id,
                kind: i.kind,
            })
            .collect();
        let answers = answers::canonicalize(
            &parse_answers(&submission.answers)?,
            Answers::new(),
            &shapes,
        )?;
        let violation_count = submission.violation_count;
        Self::finalize(
            runner,
            Context {
                submission,
                assessment,
                items,
                effective,
            },
            answers,
            FinalizeOptions {
                skip_constraints: true,
                violation_count,
                auto_submit_reason: Some(AutoSubmitReason::TimeExpired),
            },
        )
        .await?;
        Ok(())
    }
}
