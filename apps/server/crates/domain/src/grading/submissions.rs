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
    AssessmentKind, AutoSubmitReason, CodeRunStatus, GradeReleaseMode, ItemKind, ReviewVisibility,
    SubmissionStatus,
};
use ab_core::id::{AssessmentId, SubmissionId};
use ab_core::{Error, ErrorCode, Result};
use ab_db::submissions::{NewGradingEntry, SubmitOutcome};
use serde::Serialize;
use sqlx::PgPool;

pub use ab_db::submissions::SubmissionRow as Submission;

use crate::assessments::access::{
    DisabledReason, EffectivePolicy, attempt_gates, cap_bars_new_attempt,
};
use crate::assessments::items::ItemBody;
use crate::assessments::service::{Assessment, AssessmentsService, Item};
use crate::code::{CodeRunner, FinalRun, FinalTarget};
use crate::events::GradingEvents;
use crate::grading::answers::{
    self, Answers, ItemAnswer, ItemShape, answers_to_value, parse_answers,
};
use crate::grading::breakdown::GradingBreakdown;
use crate::grading::grader::{self, AutoGrade, CaseOutcome, GraderPolicy};
use crate::grading::penalties::{self, PenaltyInput};
use crate::identity::Actor;
use crate::identity::rate_limit::RateLimiter;
use crate::progress::ProgressProjector;

/// Legacy `SUBMIT_GRACE_SECONDS`.
pub const SUBMIT_GRACE_SECONDS: i64 = 30;
/// How far ahead of the server a learner's timer may run out (clock skew + latency).
const CLIENT_TIMER_SLACK_SECONDS: i64 = 2;
/// Draft saves: one per submission per this window (legacy 5s throttle).
pub const DRAFT_SAVE_WINDOW: Duration = Duration::from_secs(5);
/// Submits: 3 per learner per 10s (legacy rate limit dependency).
pub const SUBMIT_LIMIT: u32 = 3;
pub const SUBMIT_WINDOW: Duration = Duration::from_secs(10);
/// BUG-344: how many times a hand-in re-grades a draft that changed under it.
const FINALIZE_ATTEMPTS: usize = 3;
/// Timer backoff: 120s · 2^n capped at an hour; the fifth failure hands
/// the draft in ungraded for manual review (BUG-379).
pub const AUTO_SUBMIT_MAX_ATTEMPTS: i32 = 5;
/// Violation events kept per draft (the count itself is unbounded).
const MAX_VIOLATION_EVENTS: i32 = 200;

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
            score_override: None,
        },
    }
}

/// Every test failed - a blank answer or one no runner will accept.
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

/// The attempt cap over a learner's attempts (newest first) - the
/// `attempt-state` rule: a returned attempt lifts it for its revision.
fn cap_reached(prior: &[Submission], max_attempts: Option<i32>) -> bool {
    let mut completed = prior
        .iter()
        .filter(|s| s.status != SubmissionStatus::Draft)
        .peekable();
    let revision = completed
        .peek()
        .is_some_and(|s| s.status == SubmissionStatus::Returned);
    cap_bars_new_attempt(
        i64::try_from(completed.count()).unwrap_or(i64::MAX),
        revision,
        max_attempts,
    )
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

/// The learner-facing breakdown under `review_visibility`: `full` keeps
/// everything, `score_only` keeps per-item scores and teacher prose but
/// drops correctness and the correct answers, `none` hides the items.
pub(crate) fn redact_grading(
    mut grading: GradingBreakdown,
    visibility: ReviewVisibility,
) -> Option<GradingBreakdown> {
    match visibility {
        ReviewVisibility::Full => Some(grading),
        ReviewVisibility::None => None,
        ReviewVisibility::ScoreOnly => {
            for item in &mut grading.items {
                item.correct = None;
                item.correct_answer = serde_json::Value::Null;
                // An auto verdict (coded) says right/wrong; teacher prose stays.
                // The code runner's «n/m tests passed» is the result itself, not a key.
                if item.feedback_code.as_deref() != Some("tests-passed") {
                    if item.feedback_code.take().is_some() {
                        item.feedback.clear();
                    }
                    item.feedback_params = None;
                }
            }
            Some(grading)
        }
    }
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
    /// Why the server closed the attempt (`None` = the learner submitted).
    pub auto_submit_reason: Option<AutoSubmitReason>,
    /// When the learner accepted the exam rules (EXAM-CONSENT).
    pub rules_accepted_at: Option<i64>,
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
    /// The attempt is a staff preview (UX-182) - its row flag (BUG-285).
    preview: bool,
}

struct FinalizeOptions {
    skip_constraints: bool,
    violation_count: i32,
    auto_submit_reason: Option<AutoSubmitReason>,
    /// The hand-in moment lateness is judged at; `None` is now (BUG-315).
    submitted_at: Option<i64>,
    /// When the manual submit arrived (BUG-381): the gates and lateness are
    /// judged at arrival, so a hand-in that re-grades or waits for Judge0
    /// past the due date is still on time. `None` is now.
    arrived_at: Option<i64>,
}

#[derive(Clone)]
pub struct SubmissionsService {
    pool: PgPool,
    assessments: AssessmentsService,
    limiter: RateLimiter,
    /// Runs code-challenge tests at submit time.
    runner: CodeRunner,
    projector: ProgressProjector,
    /// Course-stream fan-out of hand-ins; `None` without Redis.
    events: Option<GradingEvents>,
}

impl SubmissionsService {
    #[must_use]
    pub fn new(
        pool: PgPool,
        assessments: AssessmentsService,
        limiter: RateLimiter,
        runner: CodeRunner,
    ) -> Self {
        Self {
            projector: ProgressProjector::new(pool.clone()),
            pool,
            assessments,
            limiter,
            runner,
            events: None,
        }
    }

    #[must_use]
    pub fn with_events(mut self, events: Option<GradingEvents>) -> Self {
        self.events = events;
        self
    }

    // ── Reads ───────────────────────────────────────────────────────────

    /// UX-311: the attempt writes' gate on its own (the caller's own
    /// submission, else 404), before the handler reads the body.
    pub async fn require_owned(&self, actor: &Actor, id: SubmissionId) -> Result<()> {
        self.owned(actor, id).await.map(drop)
    }

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
            .get_for_grading(actor, submission.assessment_id)
            .await?;
        // BUG-295: a learner never resumes a preview draft made while
        // staff - it does not exist for them (`start` discards it).
        if submission.preview && !state.staff {
            return Err(Error::not_found("submission"));
        }
        // BUG-285/294: the attempt's own preview flag decides, as in the
        // timer sweep (BUG-279) - a role change mid-attempt changes neither
        // its policy, its gates nor whether it counts.
        let preview = submission.preview;
        let effective = if preview == state.is_teacher_preview {
            state.effective
        } else {
            AssessmentsService::effective_policy_for(
                &self.pool,
                &detail.assessment,
                submission.user_id,
                preview,
            )
            .await?
        };
        Ok(Context {
            submission,
            assessment: detail.assessment,
            items: detail.items,
            effective,
            preview,
        })
    }

    /// The owner's view, redacted by release state and, for the grading
    /// breakdown, by the policy's `review_visibility`.
    pub async fn student_view(
        &self,
        submission: Submission,
        effective: &EffectivePolicy,
        total_items: usize,
    ) -> Result<StudentSubmission> {
        let release_state = release_state(&self.pool, &submission).await?;
        let visible = matches!(
            release_state,
            ReleaseState::Visible | ReleaseState::ReturnedForRevision
        );
        let answers = parse_answers(&submission.answers)?;
        let answered_count = answers.values().filter(|a| !a.is_blank()).count();
        let time_remaining_seconds = match (submission.status, submission.started_at) {
            (SubmissionStatus::Draft, Some(started)) => effective
                .timer_deadline(started)
                .map(|deadline| (deadline - now_unix()).max(0)),
            _ => None,
        };
        Ok(StudentSubmission {
            id: submission.id,
            assessment_id: submission.assessment_id,
            attempt_number: submission.attempt_number,
            status: submission.status,
            release_state,
            answers,
            grading: visible
                .then(|| GradingBreakdown::from_value(&submission.grading))
                .and_then(|g| redact_grading(g, effective.review_visibility)),
            auto_score: visible.then_some(submission.auto_score).flatten(),
            final_score: visible.then_some(submission.final_score).flatten(),
            is_late: submission.is_late,
            late_penalty_pct: visible.then_some(submission.late_penalty_pct),
            started_at: submission.started_at,
            submitted_at: submission.submitted_at,
            graded_at: visible.then_some(submission.graded_at).flatten(),
            auto_submit_reason: submission.auto_submit_reason,
            rules_accepted_at: submission.rules_accepted_at,
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
        // The draft attempt-state judged (never a learner's preview, BUG-295).
        let Some(draft) = (match state.draft_id {
            Some(id) => ab_db::submissions::get_submission(&self.pool, id).await?,
            None => None,
        }) else {
            return Ok(None);
        };
        let total = ab_db::assessments::count_items(&self.pool, assessment_id).await?;
        Ok(Some(
            self.student_view(draft, &state.effective, usize::try_from(total).unwrap_or(0))
                .await?,
        ))
    }

    /// Every attempt, newest first. A learner's list hides the previews
    /// made while they were staff (BUG-285).
    pub async fn my_submissions(
        &self,
        actor: &Actor,
        assessment_id: AssessmentId,
    ) -> Result<Vec<StudentSubmission>> {
        let state = self.assessments.reading_state(actor, assessment_id).await?;
        let total =
            usize::try_from(ab_db::assessments::count_items(&self.pool, assessment_id).await?)
                .unwrap_or(0);
        let rows = ab_db::submissions::list_user_submissions(
            &self.pool,
            assessment_id,
            actor.user_id,
            state.staff,
        )
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(self.student_view(row, &state.effective, total).await?);
        }
        Ok(out)
    }

    /// One attempt the caller owns (404 otherwise - no existence leak).
    pub async fn my_submission(
        &self,
        actor: &Actor,
        id: SubmissionId,
    ) -> Result<StudentSubmission> {
        let submission = self.owned(actor, id).await?;
        let state = self
            .assessments
            .reading_state(actor, submission.assessment_id)
            .await?;
        let total = usize::try_from(
            ab_db::assessments::count_items(&self.pool, submission.assessment_id).await?,
        )
        .unwrap_or(0);
        self.student_view(submission, &state.effective, total).await
    }

    // ── Lifecycle ───────────────────────────────────────────────────────

    /// UX-311: [`Self::start`]'s gate on its own (attempt state, archive
    /// freeze), so the route checks it before reading the body.
    pub async fn require_startable(
        &self,
        actor: &Actor,
        assessment_id: AssessmentId,
    ) -> Result<crate::assessments::access::AttemptState> {
        let state = self.assessments.attempt_state(actor, assessment_id).await?;
        // An archived course is a 409 for everyone - the staff preview
        // bypasses the attempt gates, so it is checked here explicitly.
        let course_id = self.assessments.load(assessment_id).await?.course_id;
        self.assessments.require_course_open(course_id).await?;
        if !state.can_start && !state.can_continue {
            // Same vocabulary as `attempt-state.disabled_reasons`.
            return Err(DisabledReason::refusal(
                &state.disabled_reasons,
                format!(
                    "cannot start: {}",
                    state
                        .disabled_reasons
                        .iter()
                        .map(|r| r.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            ));
        }
        Ok(state)
    }

    /// Open (or return the existing) draft. Legacy `start_submission_v2`.
    /// `rules_accepted` (EXAM-CONSENT) stamps `rules_accepted_at` on the draft.
    pub async fn start(
        &self,
        actor: &Actor,
        assessment_id: AssessmentId,
        rules_accepted: bool,
    ) -> Result<Started> {
        let state = self.require_startable(actor, assessment_id).await?;
        // Visibility gate only; the versions come from the locked row below.
        self.assessments.get(actor, assessment_id).await?;
        // BUG-224: the draft and the assessment row lock (`FOR SHARE`) land
        // in one transaction - an item write (`FOR UPDATE`, BUG-218) either
        // committed before (the draft gets its content version) or waits
        // and then sees the draft (409 «already has submissions»).
        // BUG-239: starts of one learner serialize on `lock_attempts`, and
        // the open draft is row-locked by the re-sync, so the count and the
        // cap below are read after any submit of it committed. Every read
        // until commit goes through `tx` (no second pool connection, BUG-235).
        let mut tx = self.pool.begin().await?;
        let assessment = ab_db::submissions::share_assessment(&mut tx, assessment_id)
            .await?
            .ok_or_else(|| Error::not_found("assessment"))?;
        ab_db::submissions::lock_attempts(&mut tx, assessment_id, actor.user_id).await?;
        // BUG-295: a preview draft opened while staff is never resumed by a
        // learner - it goes, and a counted attempt opens under their rules
        // (attempt-state already judged without it).
        if !state.staff {
            ab_db::submissions::discard_preview_draft(&mut tx, assessment_id, actor.user_id)
                .await?;
        }
        // Idempotent: the open draft follows the content being loaded now.
        let resynced = ab_db::submissions::resync_draft(
            &mut tx,
            assessment_id,
            actor.user_id,
            assessment.content_version,
            assessment.policy_version,
        )
        .await?;
        let (id, created) = if let Some(id) = resynced {
            (id, false)
        } else {
            // BUG-285: a learner's cap and numbering never count previews.
            let prior = ab_db::submissions::list_user_submissions(
                &mut *tx,
                assessment_id,
                actor.user_id,
                state.staff,
            )
            .await?;
            if cap_reached(&prior, state.effective.max_attempts) {
                return Err(Error::forbidden("cannot start: MAX_ATTEMPTS_REACHED"));
            }
            let completed = prior
                .iter()
                .filter(|s| s.status != SubmissionStatus::Draft)
                .count();
            let attempt_number = i32::try_from(completed)
                .unwrap_or(i32::MAX)
                .saturating_add(1);
            let id = ab_db::submissions::insert_draft(
                &mut *tx,
                assessment_id,
                assessment.course_id,
                actor.user_id,
                attempt_number,
                assessment.content_version,
                assessment.policy_version,
                state.staff,
            )
            .await?
            // Unreachable under `lock_attempts`; never a second draft.
            .ok_or_else(|| Error::conflict("an attempt is already open"))?;
            (id, true)
        };
        if rules_accepted {
            ab_db::submissions::accept_rules(&mut tx, id).await?;
        }
        // Read before commit: a submit racing this start cannot turn the
        // reply into a 404.
        let draft = ab_db::submissions::get_submission(&mut *tx, id)
            .await?
            .ok_or_else(|| Error::not_found("submission"))?;
        tx.commit().await?;
        let total =
            usize::try_from(ab_db::assessments::count_items(&self.pool, assessment_id).await?)
                .unwrap_or(0);
        let preview = draft.preview;
        let submission = self.student_view(draft, &state.effective, total).await?;
        self.projector
            .after_submission(assessment_id, actor.user_id, preview)
            .await;
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
        self.assessments
            .require_course_open(assessment.course_id)
            .await?;
        // BUG-240: one atomic increment - parallel reports all count, and
        // none lands once the draft is submitted.
        let event = serde_json::json!({ "kind": kind, "detail": detail, "at": now_unix() });
        let violation_count =
            ab_db::submissions::record_violation(&self.pool, id, &event, MAX_VIOLATION_EVENTS)
                .await?
                .ok_or_else(|| Error::conflict("submission is no longer a draft"))?;
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
        self.assessments
            .require_course_open(ctx.assessment.course_id)
            .await?;
        // BUG-290: the submit gates freeze the draft too - past a hard due
        // date (or the time limit, or under a gate remediation) nothing more
        // is saved, so the timer sweep scores only what landed in time. A
        // preview has none (BUG-278).
        let gates = attempt_gates(
            &self.pool,
            ctx.preview,
            &ctx.effective,
            ctx.assessment.activity_id,
            ctx.submission.user_id,
            ctx.submission.started_at,
            0,
            now_unix(),
        )
        .await?;
        if let Some(gate) = gates.first() {
            return Err(DisabledReason::refusal(&gates, gate.as_str()));
        }
        let merged = Self::merge(&ctx, patch)?;
        // Only a save that would otherwise succeed spends the throttle
        // budget; a rejected one must not lock the client out for 5s.
        let throttle_key = format!("draft_throttle:{id}");
        if !self
            .limiter
            .check(&throttle_key, 1, DRAFT_SAVE_WINDOW)
            .await?
        {
            // `Retry-After` from the live window (at most 5 s), not the
            // generic 60 s default.
            let retry_after = self
                .limiter
                .retry_after(&throttle_key, DRAFT_SAVE_WINDOW)
                .await?;
            return Err(Error::app_with_details(
                ErrorCode::RateLimited,
                "draft saves are limited to one per 5 seconds",
                serde_json::json!({ "retry_after_seconds": retry_after }),
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
        self.projector
            .after_submission(fresh.assessment_id, fresh.user_id, ctx.preview)
            .await;
        let total = ctx.items.len();
        self.student_view(fresh, &ctx.effective, total).await
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
        let arrived_at = now_unix();
        let mut limited = false;
        // BUG-344: a save or violation report landing while this submit
        // grades leaves the row alone (`finalize` → `None`); grade the draft
        // as it is now. The version check below makes a moved draft a 409
        // when the client pinned one.
        for _ in 0..FINALIZE_ATTEMPTS {
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
            self.assessments
                .require_course_open(ctx.assessment.course_id)
                .await?;
            // BUG-224: a draft opened against older content never scores items
            // the learner did not see - `start` again re-syncs it to the current
            // version once the items are reloaded.
            if ctx.submission.content_version < ctx.assessment.content_version {
                return Err(Error::app_with_details(
                    ErrorCode::Conflict,
                    "assessment content changed since the draft was opened; reopen it",
                    serde_json::json!({
                        "field": "content_version",
                        "expected": ctx.submission.content_version,
                        "actual": ctx.assessment.content_version,
                    }),
                ));
            }
            let answers = Self::merge(&ctx, patch.clone().unwrap_or_default())?;
            // UX-111: like `save_draft`, only a submit that passed validation
            // spends the budget - a 409/422 must not lock the learner out.
            if !limited {
                let submit_key = format!("submit_rl:{}", actor.user_id);
                if !self
                    .limiter
                    .check(&submit_key, SUBMIT_LIMIT, SUBMIT_WINDOW)
                    .await?
                {
                    let retry_after = self.limiter.retry_after(&submit_key, SUBMIT_WINDOW).await?;
                    return Err(Error::app_with_details(
                        ErrorCode::RateLimited,
                        "too many submit attempts; slow down",
                        serde_json::json!({ "retry_after_seconds": retry_after }),
                    ));
                }
                limited = true;
            }
            let preview = ctx.preview;
            // The learner's timer hands the attempt in when it reaches zero: a submit arriving
            // then is that auto-submit (or a click racing it). Record it like the sweeper does,
            // so the result says the time ran out. ponytail: fixed slack for the client clock
            // running ahead; a contract field from the client would be exact.
            let timed_out = ctx
                .submission
                .started_at
                .and_then(|started| ctx.effective.timer_deadline(started))
                .is_some_and(|deadline| arrived_at >= deadline - CLIENT_TIMER_SLACK_SECONDS);
            let Some((fresh, effective, total)) = Self::finalize(
                &self.runner,
                self.events.as_ref(),
                ctx,
                Some(answers),
                FinalizeOptions {
                    skip_constraints: false,
                    violation_count,
                    auto_submit_reason: timed_out.then_some(AutoSubmitReason::TimeExpired),
                    submitted_at: None,
                    arrived_at: Some(arrived_at),
                },
            )
            .await?
            else {
                continue;
            };
            self.projector
                .after_submission(fresh.assessment_id, fresh.user_id, preview)
                .await;
            return self.student_view(fresh, &effective, total).await;
        }
        Err(Error::conflict(
            "the draft kept changing while it was submitted; try again",
        ))
    }

    /// The pipeline proper. Returns (row, effective policy, item count);
    /// `None` when the draft changed while it was graded (BUG-344) - the
    /// caller re-reads and grades it again. `answers: None` hands the draft
    /// in ungraded, its stored answers kept as they are, for a teacher to
    /// score (BUG-379: the timer's last try on a draft it cannot grade).
    #[allow(
        clippy::too_many_lines,
        reason = "the submit pipeline order is the contract; kept in one place"
    )]
    async fn finalize(
        runner: &CodeRunner,
        events: Option<&GradingEvents>,
        ctx: Context,
        answers: Option<Answers>,
        opts: FinalizeOptions,
    ) -> Result<Option<(Submission, EffectivePolicy, usize)>> {
        let pool = runner.pool();
        let now = opts.arrived_at.unwrap_or_else(now_unix);
        let Context {
            submission,
            assessment,
            items,
            effective,
            preview,
        } = ctx;

        // BUG-256: no cap check here - the cap bars opening an attempt
        // (`start`, under `lock_attempts`, BUG-239), and an open draft may
        // always be finished, as `attempt-state` promises.
        if !opts.skip_constraints {
            let gates = attempt_gates(
                pool,
                preview,
                &effective,
                assessment.activity_id,
                submission.user_id,
                submission.started_at,
                SUBMIT_GRACE_SECONDS,
                now,
            )
            .await?;
            if let Some(gate) = gates.first() {
                return Err(DisabledReason::refusal(&gates, gate.as_str()));
            }
        }
        let violation_exceeded = violation_exceeded(&assessment, opts.violation_count);

        let mut grade = match &answers {
            Some(answers) => {
                Self::auto_grade(
                    runner,
                    &submission,
                    &assessment,
                    &items,
                    answers,
                    opts.skip_constraints,
                )
                .await?
            }
            None => manual_review(),
        };
        // BUG-237: a draft behind the assessment's content never publishes
        // an auto score - items it never showed would score `no-answer`.
        // `submit` refuses it earlier (409, reopen); the timer sweep, which
        // cannot ask, hands it to a teacher (pending review).
        if submission.content_version < assessment.content_version {
            grade.breakdown.needs_manual_review = true;
        }
        let at = opts.submitted_at.unwrap_or(now);
        let late_pct = penalties::late_penalty_pct(
            effective.late_policy,
            effective.due_at,
            at,
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
        // BUG-215: the annulled 0 is an explicit override - the score of
        // record for `save_grade` / `publish_all` however many manual items
        // are still unscored (UX-117: only a typed override changes it).
        if penalty.violation_zeroed {
            grade.breakdown.score_override = Some(0.0);
        }
        let breakdown = grade.breakdown.to_value();
        let answers_value = answers
            .as_ref()
            .map_or_else(|| submission.answers.clone(), answers_to_value);
        // UX-260: a `start` racing this hand-in waits on `lock_attempts`
        // (BUG-239) until the row is written, so it answers the settled
        // state - never the attempt being submitted as a draft. BUG-377:
        // the lock and the write share one connection, taken only now -
        // gates and grading (Judge0 included) ran on the pool before it, so
        // a hand-in never holds a connection while waiting for a second one
        // (N concurrent hand-ins used to deadlock an N-connection pool). A
        // start landing during the grade itself precedes the hand-in, as if
        // it had been issued before the submit.
        let mut attempts = pool.begin().await?;
        ab_db::submissions::lock_attempts(&mut attempts, assessment.id, submission.user_id).await?;
        let written = ab_db::submissions::persist_submit(
            &mut *attempts,
            submission.id,
            SubmitOutcome {
                status: verdict.status,
                answers: &answers_value,
                grading: &breakdown,
                auto_score: Some(verdict.auto_score),
                final_score: verdict.final_score,
                is_late: effective.is_late(at),
                late_penalty_pct: penalty.late_penalty_pct,
                violation_count: opts.violation_count,
                auto_submit_reason: verdict.auto_submit_reason,
                graded: !verdict.manual,
                duration_seconds: submission
                    .started_at
                    .map(|s| i32::try_from((at - s).max(0)).unwrap_or(i32::MAX)),
                submitted_at: opts.submitted_at,
                read_draft_version: submission.draft_version,
                read_violation_count: submission.violation_count,
            },
        )
        .await?;
        attempts.commit().await?;
        if !written {
            let row = ab_db::submissions::get_submission(pool, submission.id).await?;
            if row.is_some_and(|row| row.status == SubmissionStatus::Draft) {
                return Ok(None);
            }
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
                    final_score: Some(penalty.final_score),
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
            ab_core::assessments::AuditEventKind::SubmissionSubmitted,
            serde_json::json!({
                "submission_id": submission.id, "attempt": submission.attempt_number,
                "status": verdict.status, "auto_submit_reason": verdict.auto_submit_reason,
            }),
        )
        .await?;
        let fresh = ab_db::submissions::get_submission(pool, submission.id)
            .await?
            .ok_or_else(|| Error::not_found("submission"))?;
        crate::analytics::events::hooks::submission_submitted(
            pool,
            fresh.id,
            fresh.assessment_id,
            fresh.course_id,
            fresh.user_id,
            fresh.status,
        )
        .await;
        if let Some(events) = events {
            events
                .publish_best_effort(
                    fresh.course_id,
                    "submission.submitted",
                    serde_json::json!({
                        "submission_id": fresh.id, "activity_id": assessment.activity_id,
                        "user_id": fresh.user_id, "status": fresh.status,
                        "final_score": fresh.final_score,
                    }),
                )
                .await;
        }
        crate::events::user::grading(
            pool,
            crate::events::user::GradingUpdated {
                course_id: fresh.course_id,
                activity_id: assessment.activity_id,
                user_id: fresh.user_id,
                submission_id: Some(fresh.id),
                attempt_id: None,
                status: fresh.status,
                final_score: fresh.final_score,
            },
        )
        .await;
        // The owner's own copy (an auto-submit by the worker, an immediate
        // release); the score only once released.
        crate::events::user::submission(
            fresh.user_id,
            crate::events::user::SubmissionUpdated {
                course_id: fresh.course_id,
                activity_id: assessment.activity_id,
                submission_id: Some(fresh.id),
                attempt_id: None,
                status: fresh.status,
                final_score: fresh.final_score,
            },
        )
        .await;
        Ok(Some((fresh, effective, items.len())))
    }

    /// Kind-dispatched auto grade. Code challenges grade from the newest
    /// final run; without one they wait for a human.
    /// Kind-dispatched auto grade. Code challenges run their tests on Judge0
    /// here (a `final` run, replayed if the submit is retried). `lenient` is
    /// the timer path: it cannot show the learner an error, so a compile
    /// error scores what it earned (nothing) and a run it cannot finish
    /// hands the attempt to a human. On both paths a busy or unreachable
    /// runner (`Degraded`) hands it to a human too (BUG-381).
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
        // BUG-370: the timer cannot show an error and must not retry for an
        // hour: a run it cannot finish hands the attempt to a teacher.
        let outcome = match runner.final_run(target, body, language_id, source).await {
            Ok(outcome) => outcome,
            Err(err) if lenient => {
                tracing::error!(submission_id = %submission.id, %err,
                    "final code run failed; handing the attempt to manual review");
                return Ok(manual_review());
            }
            Err(err) => return Err(err),
        };
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
                // BUG-381: a busy or unreachable runner is never the
                // learner's fault, and a 503 on a deadline rush turned into
                // PAST_DUE on the retry - the hand-in lands for review.
                tracing::warn!(submission_id = %submission.id, %message,
                    "final code run degraded; handing the attempt to manual review");
                return Ok(manual_review());
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
    pub async fn sweep_expired_drafts(
        runner: &CodeRunner,
        events: Option<&GradingEvents>,
        limit: i64,
    ) -> Result<usize> {
        let pool = runner.pool();
        let ids = ab_db::submissions::list_expired_drafts(pool, limit).await?;
        let mut done = 0;
        for id in ids {
            let Err(err) = Self::auto_submit_one(runner, events, id, false).await else {
                done += 1;
                continue;
            };
            let attempts = ab_db::submissions::get_submission(pool, id)
                .await?
                .map_or(0, |s| s.auto_submit_attempts);
            // BUG-379: the last try never abandons the draft - it is handed
            // in ungraded, as stored, for a teacher to score. Should even
            // that fail (the database), it retries hourly until it lands.
            if attempts + 1 >= AUTO_SUBMIT_MAX_ATTEMPTS {
                match Self::auto_submit_one(runner, events, id, true).await {
                    Ok(()) => {
                        tracing::error!(%id, %err, attempts,
                            "auto-submit failed for the last time; handed in for manual review");
                        done += 1;
                        continue;
                    }
                    Err(review_err) => tracing::error!(%id, %err, %review_err, attempts,
                        "auto-submit failed and the hand-in for manual review failed too"),
                }
            }
            let backoff = (120.0 * 2f64.powi(attempts)).min(3600.0);
            tracing::error!(%id, %err, attempts, "auto-submit failed; backing off");
            ab_db::submissions::record_auto_submit_failure(pool, id, backoff).await?;
        }
        Ok(done)
    }

    /// `for_review`: hand the draft in ungraded, as stored (BUG-379).
    async fn auto_submit_one(
        runner: &CodeRunner,
        events: Option<&GradingEvents>,
        id: SubmissionId,
        for_review: bool,
    ) -> Result<()> {
        // BUG-344: a save or violation report racing the hand-in re-grades.
        for _ in 0..FINALIZE_ATTEMPTS {
            if Self::auto_submit_once(runner, events, id, for_review).await? {
                return Ok(());
            }
        }
        Err(Error::conflict(
            "the draft kept changing while it was handed in",
        ))
    }

    /// `false` when the draft changed while it was graded.
    async fn auto_submit_once(
        runner: &CodeRunner,
        events: Option<&GradingEvents>,
        id: SubmissionId,
        for_review: bool,
    ) -> Result<bool> {
        let pool = runner.pool();
        let submission = ab_db::submissions::get_submission(pool, id)
            .await?
            .ok_or_else(|| Error::not_found("submission"))?;
        if submission.status != SubmissionStatus::Draft {
            return Ok(true);
        }
        let assessment = ab_db::assessments::get_assessment(pool, submission.assessment_id)
            .await?
            .ok_or_else(|| Error::not_found("assessment"))?;
        let items = ab_db::assessments::list_items(pool, assessment.id)
            .await?
            .into_iter()
            .map(Item::try_from)
            .collect::<Result<Vec<_>>>()?;
        // BUG-315: the hand-in is the moment the clock ran out, not when the
        // sweep got to it - lateness, the override in force (BUG-307) and
        // `submitted_at` (what settling re-judges) all use it.
        // BUG-326: the clock runs out after the grace period.
        let submitted_at = match (submission.started_at, assessment.time_limit_seconds) {
            (Some(started), Some(limit)) => {
                (started + i64::from(limit) + i64::from(assessment.grace_period_minutes) * 60)
                    .min(now_unix())
            }
            _ => now_unix(),
        };
        // BUG-279: the attempt's own preview flag - the same policy rule as
        // a manual submit (a preview carries no late penalty).
        let preview = submission.preview;
        let row = if preview {
            None
        } else {
            ab_db::assessments::get_override(pool, assessment.id, submission.user_id).await?
        };
        let effective =
            AssessmentsService::policy_at(&assessment, row.as_ref(), preview, submitted_at);
        let answers = if for_review {
            None
        } else {
            let shapes: Vec<ItemShape> = items
                .iter()
                .map(|i| ItemShape {
                    id: i.id,
                    kind: i.kind,
                })
                .collect();
            Some(answers::canonicalize(
                &parse_answers(&submission.answers)?,
                Answers::new(),
                &shapes,
            )?)
        };
        let violation_count = submission.violation_count;
        let (assessment_id, user_id) = (submission.assessment_id, submission.user_id);
        if Self::finalize(
            runner,
            events,
            Context {
                submission,
                assessment,
                items,
                effective,
                preview,
            },
            answers,
            FinalizeOptions {
                skip_constraints: true,
                violation_count,
                auto_submit_reason: Some(AutoSubmitReason::TimeExpired),
                submitted_at: Some(submitted_at),
                arrived_at: None,
            },
        )
        .await?
        .is_none()
        {
            return Ok(false);
        }
        ProgressProjector::new(pool.clone())
            .reproject_submission(assessment_id, user_id)
            .await;
        Ok(true)
    }
}
