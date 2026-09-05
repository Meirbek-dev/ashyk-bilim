//! Actor-facing code runs: visible-test and custom-input runs for learners
//! (and teachers previewing), run lookup, the author's reference check, the
//! language list.

use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use ab_core::assessments::{CodeRunPurpose, CodeRunStatus, ItemKind};
use ab_core::id::{AssessmentId, AssessmentItemId, CodeRunId};
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

/// A Judge0 language the platform allows.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct LanguageInfo {
    pub id: i32,
    pub name: String,
    /// Monaco editor language id.
    pub monaco_language: &'static str,
}

/// One language's verdict from the author's reference check.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ReferenceCheck {
    pub language_id: i32,
    /// Every test passed.
    pub ok: bool,
    /// Run status, or `missing_solution` when no reference exists.
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

    /// Run the learner's code on the item's visible tests, or on one custom
    /// input (unscored). Needs submit access to the assessment; authors
    /// previewing see hidden-test data, learners never do.
    pub async fn run_item(
        &self,
        actor: &Actor,
        item_id: AssessmentItemId,
        input: RunInput<'_>,
    ) -> Result<CodeRun> {
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
        let assessment = self
            .assessments
            .load_for_author(actor, assessment_id)
            .await?;
        let item = ab_db::assessments::list_items(self.runner.pool(), assessment.id)
            .await?
            .into_iter()
            .map(Item::try_from)
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .find(|i| i.kind == ItemKind::Code)
            .ok_or_else(|| Error::not_found("code item"))?;
        let body = Self::code_body(&item)?;
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
                    assessment_id: assessment.id,
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
        let languages = client
            .languages()
            .await
            .map_err(|err| Error::app(ErrorCode::CodeRunnerDegraded, err.to_string()))?;
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
