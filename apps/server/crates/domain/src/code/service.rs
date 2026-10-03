//! Actor-facing code runs: visible-test and custom-input runs for learners
//! (and teachers previewing), run lookup, the author's reference check, the
//! language list.

use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use ab_core::assessments::{CodeRunPurpose, CodeRunStatus, ItemKind};
use ab_core::id::{AssessmentId, AssessmentItemId, CodeRunId, SubmissionId};
use ab_core::{Error, ErrorCode, Result};
use serde::Serialize;
use utoipa::ToSchema;

use crate::assessments::items::{CodeBody, ItemBody};
use crate::assessments::service::{AssessmentsService, Item};
use crate::code::runner::{CaseResult, CodeRun, CodeRunner, RunSpec};
use crate::code::sandbox;
use crate::identity::Actor;
use crate::identity::rate_limit::RateLimiter;

/// Code runs per learner per minute.
const RUN_LIMIT: u32 = 20;
const RUN_WINDOW: Duration = Duration::from_secs(60);
const LANGUAGES_TTL: Duration = Duration::from_secs(600);

pub struct RunInput<'a> {
    pub language_id: i32,
    pub source: &'a str,
    pub custom_input: Option<&'a str>,
    pub idempotency_key: Option<&'a str>,
}

/// Filter of [`CodeRunsService::my_runs`].
#[derive(Debug, Clone, Copy)]
pub struct RunListFilter {
    pub submission_id: Option<SubmissionId>,
    pub purpose: Option<CodeRunPurpose>,
    pub limit: i64,
}

/// Runs per list call.
pub const MAX_RUN_LIST: i64 = 50;

/// A Judge0 language the platform allows.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct LanguageInfo {
    pub id: i32,
    pub name: String,
    /// Monaco editor language id.
    pub monaco_language: &'static str,
}

/// A reference check's per-language outcome: the run status, or why
/// nothing ran.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ReferenceCheckStatus {
    Queued,
    Running,
    Accepted,
    WrongAnswer,
    CompileError,
    RuntimeError,
    TimeLimit,
    InternalError,
    Degraded,
    MissingSolution,
    LanguageNotAllowed,
}

/// One language's verdict from the author's reference check.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ReferenceCheck {
    pub language_id: i32,
    /// Every test passed.
    pub ok: bool,
    /// Run status, or `missing_solution` / `language_not_allowed` when
    /// nothing ran.
    #[schema(value_type = ReferenceCheckStatus)]
    pub status: String,
    pub passed: i32,
    pub total: i32,
    pub score: Option<f64>,
    pub compile_output: Option<String>,
    pub message: Option<String>,
    pub cases: Vec<CaseResult>,
}

type LanguagesCache = Arc<Mutex<Option<(Instant, Vec<LanguageInfo>)>>>;

#[derive(Clone)]
pub struct CodeRunsService {
    runner: CodeRunner,
    assessments: AssessmentsService,
    limiter: RateLimiter,
    languages: LanguagesCache,
}

impl CodeRunsService {
    #[must_use]
    pub fn new(runner: CodeRunner, assessments: AssessmentsService, limiter: RateLimiter) -> Self {
        Self {
            runner,
            assessments,
            limiter,
            languages: Arc::new(Mutex::new(None)),
        }
    }

    #[must_use]
    pub const fn runner(&self) -> &CodeRunner {
        &self.runner
    }

    fn code_body(item: &Item) -> Result<&CodeBody> {
        match &item.body {
            ItemBody::Code(body) if item.kind == ItemKind::Code => Ok(body),
            _ => Err(Error::validation(vec![ab_core::FieldError {
                field: "item".into(),
                code: "not-code".into(),
                message: "only code items can be run".into(),
            }])),
        }
    }

    fn require_language(&self, body: &CodeBody, language_id: i32) -> Result<()> {
        if !self.runner.language_allowed(language_id) {
            return Err(Error::app_with_details(
                ErrorCode::LanguageNotAllowed,
                "this language is not enabled on the platform",
                serde_json::json!({
                    "language_id": language_id,
                    "allowed_language_ids": self.runner.limits().allowed_language_ids,
                }),
            ));
        }
        if !body.languages.is_empty() && !body.languages.contains(&language_id) {
            return Err(Error::app_with_details(
                ErrorCode::LanguageNotAllowed,
                "this language is not allowed for this item",
                serde_json::json!({
                    "language_id": language_id,
                    "allowed_language_ids": body.languages,
                }),
            ));
        }
        Ok(())
    }

    /// The item, its assessment and whether the caller is its author -
    /// submit access to the assessment (404 unknown/invisible).
    async fn runnable(
        &self,
        actor: &Actor,
        item_id: AssessmentItemId,
    ) -> Result<(
        ab_db::assessments::ItemRow,
        ab_db::assessments::AssessmentRow,
        bool,
    )> {
        let item_row = ab_db::assessments::get_item(self.runner.pool(), item_id)
            .await?
            .ok_or_else(|| Error::not_found("assessment item"))?;
        let assessment = self.assessments.load(item_row.assessment_id).await?;
        let course = self
            .assessments
            .courses
            .get(actor, assessment.course_id)
            .await?;
        let teacher = self
            .assessments
            .require_submit_access(actor, &assessment, &course)
            .await?;
        // Judge0 time is never spent on an archived course (previews too).
        course.ensure_not_archived()?;
        Ok((item_row, assessment, teacher))
    }

    /// UX-311: [`Self::run_item`]'s access gate on its own, before the body
    /// is read.
    pub async fn require_runnable(&self, actor: &Actor, item_id: AssessmentItemId) -> Result<()> {
        self.runnable(actor, item_id).await.map(drop)
    }

    /// Run the learner's code on the item's visible tests, or on one custom
    /// input (unscored). Needs submit access to the assessment; authors
    /// previewing see hidden-test data, learners never do.
    pub async fn run_item(
        &self,
        actor: &Actor,
        item_id: AssessmentItemId,
        input: RunInput<'_>,
    ) -> Result<CodeRun> {
        let (item_row, assessment, teacher) = self.runnable(actor, item_id).await?;
        let item = Item::try_from(item_row)?;
        let body = Self::code_body(&item)?;
        self.require_language(body, input.language_id)?;
        self.runner
            .validate_payload(input.source, input.custom_input)?;
        if !self
            .limiter
            .check(
                &format!("code_run_rl:{}", actor.user_id),
                RUN_LIMIT,
                RUN_WINDOW,
            )
            .await?
        {
            return Err(Error::app(
                ErrorCode::RateLimited,
                "too many code runs; slow down",
            ));
        }
        let visible: Vec<_> = body
            .tests
            .iter()
            .filter(|t| t.is_visible)
            .cloned()
            .collect();
        let draft =
            ab_db::submissions::open_draft(self.runner.pool(), assessment.id, actor.user_id)
                .await?;
        let run = self
            .runner
            .execute(RunSpec {
                assessment_id: assessment.id,
                item_id,
                submission_id: draft.map(|d| d.id),
                user_id: actor.user_id,
                purpose: if input.custom_input.is_some() {
                    CodeRunPurpose::Custom
                } else {
                    CodeRunPurpose::Visible
                },
                language_id: input.language_id,
                source: input.source,
                custom_input: input.custom_input,
                tests: &visible,
                body,
                idempotency_key: input.idempotency_key,
            })
            .await?;
        Ok(if teacher { run } else { run.masked() })
    }

    /// A run by id: its owner (masked) or an author of the assessment.
    pub async fn get_run(&self, actor: &Actor, id: CodeRunId) -> Result<CodeRun> {
        let run = self
            .runner
            .load(id)
            .await?
            .ok_or_else(|| Error::not_found("code run"))?;
        if run.user_id == actor.user_id {
            let assessment = self.assessments.load(run.assessment_id).await?;
            let course = self
                .assessments
                .courses
                .get(actor, assessment.course_id)
                .await?;
            let teacher = AssessmentsService::require_scoped(
                actor,
                &course,
                ab_core::permission::Action::Author,
                "preview",
            )
            .is_ok();
            return Ok(if teacher { run } else { run.masked() });
        }
        // Someone else's run: only the assessment's authors, and no leak.
        self.assessments
            .load_for_author(actor, run.assessment_id)
            .await
            .map_err(|_| Error::not_found("code run"))?;
        Ok(run)
    }

    /// Run every reference solution against the full test set (authors).
    /// The legacy exposed this to anyone with submit access.
    pub async fn reference_check(
        &self,
        actor: &Actor,
        assessment_id: AssessmentId,
    ) -> Result<Vec<ReferenceCheck>> {
        let assessment = self.assessments.load_for_edit(actor, assessment_id).await?;
        let item = ab_db::assessments::list_items(self.runner.pool(), assessment.id)
            .await?
            .into_iter()
            .map(Item::try_from)
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .find(|i| i.kind == ItemKind::Code)
            .ok_or_else(|| Error::not_found("code item"))?;
        self.check_references(actor, assessment.id, &item).await
    }

    /// [`Self::reference_check`] for one code item (L-6: an assessment may
    /// hold several). Authors only; unknown, foreign or non-code is 404.
    pub async fn reference_check_item(
        &self,
        actor: &Actor,
        item_id: AssessmentItemId,
    ) -> Result<Vec<ReferenceCheck>> {
        let row = ab_db::assessments::get_item(self.runner.pool(), item_id)
            .await?
            .ok_or_else(|| Error::not_found("code item"))?;
        let assessment = self
            .assessments
            .load_for_edit(actor, row.assessment_id)
            .await?;
        let item = Item::try_from(row)?;
        if item.kind != ItemKind::Code {
            return Err(Error::not_found("code item"));
        }
        self.check_references(actor, assessment.id, &item).await
    }

    /// The learner's own runs of an item, newest first (at most `limit`),
    /// optionally of one submission and purpose - `purpose=final` with the
    /// submission is the run its grade came from. Masked like
    /// [`Self::get_run`] unless the caller authors the assessment.
    pub async fn my_runs(
        &self,
        actor: &Actor,
        item_id: AssessmentItemId,
        filter: RunListFilter,
    ) -> Result<Vec<CodeRun>> {
        let Some(row) = ab_db::assessments::get_item(self.runner.pool(), item_id).await? else {
            return Ok(Vec::new());
        };
        let assessment = self.assessments.load(row.assessment_id).await?;
        let course = self
            .assessments
            .courses
            .get(actor, assessment.course_id)
            .await?;
        let teacher = AssessmentsService::require_scoped(
            actor,
            &course,
            ab_core::permission::Action::Author,
            "preview",
        )
        .is_ok();
        let limit = ab_core::page_limit(filter.limit, MAX_RUN_LIST)?;
        let ids = ab_db::submissions::list_user_code_runs(
            self.runner.pool(),
            item_id,
            actor.user_id,
            filter.submission_id,
            filter.purpose,
            limit,
        )
        .await?;
        let mut out = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(run) = self.runner.load(id).await? {
                out.push(if teacher { run } else { run.masked() });
            }
        }
        Ok(out)
    }

    async fn check_references(
        &self,
        actor: &Actor,
        assessment_id: AssessmentId,
        item: &Item,
    ) -> Result<Vec<ReferenceCheck>> {
        let body = Self::code_body(item)?;
        let mut out = Vec::with_capacity(body.languages.len());
        for &language_id in &body.languages {
            let Some(solution) = body
                .reference_solutions
                .get(&language_id.to_string())
                .filter(|s| !s.trim().is_empty())
            else {
                out.push(ReferenceCheck {
                    language_id,
                    ok: false,
                    status: "missing_solution".into(),
                    passed: 0,
                    total: i32::try_from(body.tests.len()).unwrap_or(i32::MAX),
                    score: None,
                    compile_output: None,
                    message: Some("no reference solution for this language".into()),
                    cases: Vec::new(),
                });
                continue;
            };
            if !self.runner.language_allowed(language_id) {
                out.push(ReferenceCheck {
                    language_id,
                    ok: false,
                    status: "language_not_allowed".into(),
                    passed: 0,
                    total: i32::try_from(body.tests.len()).unwrap_or(i32::MAX),
                    score: None,
                    compile_output: None,
                    message: Some("language is not enabled on the platform".into()),
                    cases: Vec::new(),
                });
                continue;
            }
            let run = self
                .runner
                .execute(RunSpec {
                    assessment_id,
                    item_id: item.id,
                    submission_id: None,
                    user_id: actor.user_id,
                    purpose: CodeRunPurpose::ReferenceCheck,
                    language_id,
                    source: solution,
                    custom_input: None,
                    tests: &body.tests,
                    body,
                    idempotency_key: None,
                })
                .await?;
            out.push(ReferenceCheck {
                language_id,
                ok: run.status == CodeRunStatus::Accepted,
                status: run.status.as_str().to_owned(),
                passed: run.passed,
                total: run.total,
                score: run.score,
                compile_output: run.compile_output,
                message: run.error_message,
                cases: run.cases,
            });
        }
        Ok(out)
    }

    /// Whether a Judge0 endpoint is configured at all.
    #[must_use]
    pub const fn runner_configured(&self) -> bool {
        self.runner.judge0().is_some()
    }

    /// Allowed, non-archived Judge0 languages (cached 10 minutes).
    pub async fn languages(&self) -> Result<Vec<LanguageInfo>> {
        if let Some((at, cached)) = &*self
            .languages
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            && at.elapsed() < LANGUAGES_TTL
        {
            return Ok(cached.clone());
        }
        let Some(client) = self.runner.judge0() else {
            return Err(Error::app(
                ErrorCode::CodeRunnerDegraded,
                "code runner is not configured",
            ));
        };
        let languages = client.languages().await.map_err(|err| {
            // UX-291: upstream URLs and transport errors stay in the log.
            tracing::warn!(%err, "listing judge0 languages failed");
            Error::app(ErrorCode::CodeRunnerDegraded, err.public_message())
        })?;
        let list: Vec<LanguageInfo> = languages
            .into_iter()
            .filter(|l| !l.is_archived && self.runner.language_allowed(l.id))
            .map(|l| LanguageInfo {
                id: l.id,
                monaco_language: sandbox::monaco_language(&l.name),
                name: l.name,
            })
            .collect();
        *self
            .languages
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = Some((Instant::now(), list.clone()));
        Ok(list)
    }
}
