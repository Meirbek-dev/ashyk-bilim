//! Tests from DOT spreadsheets (docs/XLSX-TEST-IMPORT.md).
//!
//! Upload an `.xlsx`, see what it holds (questions, pictures, every problem with its cell), fix
//! the file or the settings, create the test in one step. Also the pictures
//! of item bodies (`MediaRef`): who may attach them and who may see them.
//!
//! The file is parsed in the request (a 1000-question workbook takes well
//! under a second): no job, no polling.

use std::sync::Arc;
use std::time::Duration;

use ab_clients::storage::{Bucket, StorageClient};
use ab_core::assessments::{AssessmentKind, AuditEventKind, GradingType, ItemKind, Lifecycle};
use ab_core::id::{ActivityId, AssessmentId, ChapterId, CourseId};
use ab_core::{Error, ErrorCode, FieldError, Result};
use ab_xlsx::{DotKind, DotOption, DotQuestion, DotTest, ParseOptions, Severity};
use serde::{Deserialize, Serialize};
use sha2::Digest;
use sqlx::PgPool;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::assessments::AssessmentsService;
use crate::assessments::draw::dot_quotas;
use crate::assessments::items::{
    ChoiceBody, ChoiceOption, ChoiceVariant, ItemBody, MatchingBody, MatchingPair, MediaRef,
    OpenTextBody, TextFormat,
};
use crate::assessments::service::{
    CreateAssessment, DrawStratum, Item, MAX_ATTEMPTS, MAX_BANK_ITEMS, MAX_DRAW, PolicyInput,
    ensure_editable,
};
use crate::identity::Actor;
use crate::identity::rate_limit::RateLimiter;

pub const IMPORT_PURPOSE: &str = "assessment-import";
pub const IMAGE_PURPOSE: &str = "assessment-image";
/// An import nobody committed goes after a day (spec Q-7)...
const UNCOMMITTED_TTL: Duration = Duration::from_hours(24);
/// Imports one person may create per minute: each reads a workbook of up
/// to 20 MB (docs/XLSX-TEST-IMPORT.md 8).
const CREATE_LIMIT: u32 = 10;
const CREATE_WINDOW: Duration = Duration::from_mins(1);
/// ...a committed one after 30 days (the audit event stays).
const COMMITTED_TTL: Duration = Duration::from_hours(24 * 30);
/// Staged pictures: their import row holds them; this clock only runs once
/// nothing names them.
const IMAGE_GRACE: Duration = Duration::from_hours(24);
const MEDIA_URL_TTL: Duration = Duration::from_mins(5);
/// DOT's pass mark (`Test::RATING_REQUIREMENT`).
const DOT_PASSING_SCORE: f64 = 50.0;

/// The settings row of the file, as Ashyq will apply them.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ImportSettings {
    /// A1.
    pub title: String,
    /// C1 (`null`: unlimited; above 10 capped to 10).
    pub max_attempts: Option<i32>,
    /// D1 in seconds (`null`: no limit).
    pub time_limit_seconds: Option<i32>,
    /// E1 (`null`: every question).
    pub draw_count: Option<i32>,
    /// F1.
    pub leveling: bool,
    /// The DOT level quotas for `draw_count` (F1 = 1).
    pub draw_strata: Vec<DrawStratum>,
}

/// One question as it will be created.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct PlannedItem {
    /// Sheet row it came from.
    pub row: i32,
    pub kind: ItemKind,
    pub title: String,
    pub body: ItemBody,
    pub max_score: f64,
    /// DOT level, the bank quota group.
    pub draw_group: Option<String>,
}

/// Counts for the preview header.
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct ImportSummary {
    pub questions: usize,
    pub single: usize,
    pub multiple: usize,
    pub short: usize,
    pub matching: usize,
    pub essay: usize,
    pub images: usize,
    pub errors: usize,
    pub warnings: usize,
    pub infos: usize,
}

/// The stored `parsed` value.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Plan {
    settings: ImportSettings,
    items: Vec<PlannedItem>,
    summary: ImportSummary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum IssueSeverity {
    Error,
    Warning,
    Info,
}

/// A problem found in the file, located by cell. The client words it from
/// `code` and `params` (codes: docs/XLSX-TEST-IMPORT.md section 10).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ImportIssue {
    pub severity: IssueSeverity,
    pub code: String,
    /// `F12`; absent for the whole file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub cell: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub row: Option<u32>,
    #[serde(default)]
    pub params: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ImportStatus {
    /// Parsed without errors: may be committed.
    Ready,
    /// Parsed with errors: fix the file and upload it again.
    Invalid,
    /// Created the test (`result`).
    Committed,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ImportResult {
    pub assessment_id: AssessmentId,
    pub activity_id: ActivityId,
}

/// An uploaded spreadsheet on its way to a test.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AssessmentImport {
    pub id: Uuid,
    pub course_id: CourseId,
    pub status: ImportStatus,
    pub file_name: String,
    /// The sheet that was read (the active one).
    pub sheet: String,
    /// DOT mode: the two characters `\n` were read as a line break.
    pub unescape_newlines: bool,
    /// `null` when the file could not be read at all.
    pub settings: Option<ImportSettings>,
    pub summary: ImportSummary,
    pub items: Vec<PlannedItem>,
    /// Errors first, then warnings, then notes; at most 100.
    pub issues: Vec<ImportIssue>,
    /// Issues left out past the 100.
    pub issues_truncated: i32,
    pub result: Option<ImportResult>,
    pub created_at_unix: i64,
    pub expires_at_unix: i64,
}

/// Where the questions go.
#[derive(Debug, Clone, Copy)]
pub enum CommitTarget {
    /// A new test in this chapter.
    New {
        chapter_id: ChapterId,
        kind: AssessmentKind,
    },
    /// Every question of this test replaced (it must be editable).
    Replace { assessment_id: AssessmentId },
    /// Added after this test's questions.
    Append { assessment_id: AssessmentId },
}

/// The teacher's choices on commit (every field optional: the file's
/// settings otherwise).
#[derive(Debug, Clone, Default)]
pub struct CommitOptions {
    pub title: Option<String>,
    /// Replace/append: also apply the file's settings (always for a new test).
    pub apply_settings: bool,
    pub max_attempts: Option<Option<i32>>,
    pub time_limit_seconds: Option<Option<i32>>,
    pub draw_count: Option<Option<i32>>,
    pub draw_strata: Option<Vec<DrawStratum>>,
    pub partial_credit: Option<bool>,
    pub passing_score: Option<f64>,
}

fn import_gone() -> Error {
    Error::app(
        ErrorCode::AssessmentImportExpired,
        "the uploaded spreadsheet has expired; upload it again",
    )
}

/// The plan's items as bodies: the pure mapping DOT → Ashyq (spec 5.1).
#[allow(clippy::too_many_lines, reason = "one match over the DOT types")]
fn plan_items(test: &DotTest, media: &[MediaRef]) -> (Vec<PlannedItem>, Vec<ImportIssue>) {
    let mut issues = Vec::new();
    let picture = |index: usize| media.get(index).cloned();
    let pictures = |q: &DotQuestion| -> Vec<MediaRef> {
        q.images.iter().filter_map(|i| picture(*i)).collect()
    };
    let options = |opts: &[DotOption], correct: &dyn Fn(usize) -> bool| -> Vec<ChoiceOption> {
        opts.iter()
            .enumerate()
            .map(|(i, o)| ChoiceOption {
                id: (i + 1).to_string(),
                text: o.text.clone(),
                is_correct: correct(i),
                media: o.image.and_then(picture),
            })
            .collect()
    };
    let items = test
        .questions
        .iter()
        .enumerate()
        .map(|(n, q)| {
            let prompt = q.text.clone();
            let body = match &q.kind {
                DotKind::Single {
                    options: opts,
                    correct,
                } => ItemBody::Choice(ChoiceBody {
                    prompt,
                    options: options(opts, &|i| i == *correct),
                    multiple: false,
                    variant: Some(ChoiceVariant::SingleChoice),
                    explanation: None,
                    prompt_format: TextFormat::Plain,
                    media: pictures(q),
                }),
                DotKind::Multiple {
                    options: opts,
                    correct,
                } => ItemBody::Choice(ChoiceBody {
                    prompt,
                    options: options(opts, &|i| correct.contains(&i)),
                    multiple: true,
                    variant: Some(ChoiceVariant::MultipleChoice),
                    explanation: None,
                    prompt_format: TextFormat::Plain,
                    media: pictures(q),
                }),
                DotKind::Short { answer } => ItemBody::OpenText(OpenTextBody {
                    prompt,
                    prompt_format: TextFormat::Plain,
                    media: pictures(q),
                    short_answer: true,
                    accepted_answers: vec![answer.clone()],
                    case_sensitive: true,
                    ..Default::default()
                }),
                DotKind::Matching { left, right, pairs } => {
                    if left.iter().chain(right).any(|o| o.image.is_some()) {
                        issues.push(ImportIssue {
                            severity: IssueSeverity::Warning,
                            code: "matching_image_dropped".into(),
                            cell: None,
                            row: Some(q.row),
                            params: serde_json::Map::new(),
                        });
                    }
                    let used: Vec<usize> = pairs.iter().flatten().copied().collect();
                    ItemBody::Matching(MatchingBody {
                        prompt,
                        pairs: left
                            .iter()
                            .zip(pairs)
                            .map(|(l, r)| MatchingPair {
                                left: l.text.clone(),
                                right: r.and_then(|r| right.get(r)).map(|o| o.text.clone()),
                            })
                            .collect(),
                        distractors: right
                            .iter()
                            .enumerate()
                            .filter(|(i, _)| !used.contains(i))
                            .map(|(_, o)| o.text.clone())
                            .collect(),
                        explanation: None,
                        prompt_format: TextFormat::Plain,
                        media: pictures(q),
                    })
                }
                DotKind::Essay => ItemBody::OpenText(OpenTextBody {
                    prompt,
                    prompt_format: TextFormat::Plain,
                    media: pictures(q),
                    ..Default::default()
                }),
            };
            PlannedItem {
                row: i32::try_from(q.row).unwrap_or(i32::MAX),
                kind: body.kind(),
                title: item_title(&q.text, n + 1),
                body,
                max_score: 1.0,
                draw_group: (q.level > 0).then(|| q.level.to_string()),
            }
        })
        .collect();
    (items, issues)
}

/// An item title from the question: its first line, cut at 80 characters;
/// `№ n` for a picture-only question.
fn item_title(text: &str, n: usize) -> String {
    let line = text.lines().map(str::trim).find(|l| !l.is_empty());
    match line {
        None => format!("№ {n}"),
        Some(line) if line.chars().count() > 80 => {
            let cut: String = line.chars().take(79).collect();
            format!("{}…", cut.trim_end())
        }
        Some(line) => line.to_owned(),
    }
}

fn settings_of(test: &DotTest, issues: &mut Vec<ImportIssue>) -> ImportSettings {
    let positive = |n: u32| (n > 0).then(|| i32::try_from(n).unwrap_or(i32::MAX));
    let mut max_attempts = positive(test.attempts);
    if max_attempts.is_some_and(|n| n > MAX_ATTEMPTS) {
        max_attempts = Some(MAX_ATTEMPTS);
        issues.push(ImportIssue {
            severity: IssueSeverity::Warning,
            code: "attempts_capped".into(),
            cell: Some("C1".into()),
            row: Some(1),
            params: serde_json::Map::from_iter([("max".into(), MAX_ATTEMPTS.into())]),
        });
    }
    let questions = test.questions.len();
    let draw_count = positive(test.limit)
        .filter(|n| usize::try_from(*n).unwrap_or(usize::MAX) < questions)
        .map(|n| n.min(MAX_DRAW));
    let draw_strata = match draw_count {
        Some(limit) if test.leveling => {
            let mut groups: Vec<(String, usize)> = Vec::new();
            for q in &test.questions {
                let level = q.level.to_string();
                match groups.iter_mut().find(|(g, _)| *g == level) {
                    Some((_, n)) => *n += 1,
                    None => groups.push((level, 1)),
                }
            }
            dot_quotas(limit, &groups)
        }
        _ => Vec::new(),
    };
    ImportSettings {
        title: test.title.clone(),
        max_attempts,
        time_limit_seconds: positive(test.time_minutes).map(|m| m.saturating_mul(60)),
        draw_count,
        leveling: test.leveling,
        draw_strata,
    }
}

fn summarize(items: &[PlannedItem], images: usize, issues: &[ImportIssue]) -> ImportSummary {
    let mut s = ImportSummary {
        questions: items.len(),
        images,
        ..ImportSummary::default()
    };
    for item in items {
        match &item.body {
            ItemBody::Choice(b) if b.multiple => s.multiple += 1,
            ItemBody::Choice(_) => s.single += 1,
            ItemBody::OpenText(b) if b.short_answer => s.short += 1,
            ItemBody::OpenText(_) => s.essay += 1,
            ItemBody::Matching(_) => s.matching += 1,
            _ => {}
        }
    }
    for issue in issues {
        match issue.severity {
            IssueSeverity::Error => s.errors += 1,
            IssueSeverity::Warning => s.warnings += 1,
            IssueSeverity::Info => s.infos += 1,
        }
    }
    s
}

fn issue_of(issue: ab_xlsx::Issue) -> ImportIssue {
    ImportIssue {
        severity: match issue.severity {
            Severity::Error => IssueSeverity::Error,
            Severity::Warning => IssueSeverity::Warning,
            Severity::Info => IssueSeverity::Info,
        },
        code: issue.code.to_owned(),
        cell: issue.cell,
        row: issue.row,
        params: issue.params,
    }
}

#[derive(Clone)]
pub struct ImportsService {
    pool: PgPool,
    storage: Arc<StorageClient>,
    assessments: AssessmentsService,
    limiter: Option<RateLimiter>,
}

impl ImportsService {
    #[must_use]
    pub const fn new(
        pool: PgPool,
        storage: Arc<StorageClient>,
        assessments: AssessmentsService,
    ) -> Self {
        Self {
            pool,
            storage,
            assessments,
            limiter: None,
        }
    }

    /// Caps imports per person ([`CREATE_LIMIT`] a minute); without it
    /// (unit tests) nothing is counted.
    #[must_use]
    pub fn with_limiter(mut self, limiter: RateLimiter) -> Self {
        self.limiter = Some(limiter);
        self
    }

    async fn check_rate(&self, actor: &Actor) -> Result<()> {
        let Some(limiter) = &self.limiter else {
            return Ok(());
        };
        let key = format!("assessment_import_rl:{}", actor.user_id);
        if limiter.check(&key, CREATE_LIMIT, CREATE_WINDOW).await? {
            return Ok(());
        }
        let retry = limiter.retry_after(&key, CREATE_WINDOW).await?;
        Err(Error::app_with_details(
            ErrorCode::RateLimited,
            "too many spreadsheet imports; wait a minute",
            serde_json::json!({ "retry_after_seconds": retry }),
        ))
    }

    /// UX-311: the authoring gate on its own, before the handler reads a body.
    pub async fn require_course(&self, actor: &Actor, course_id: CourseId) -> Result<()> {
        self.assessments
            .authorable_course(actor, course_id)
            .await?
            .ensure_not_archived()
    }

    /// The import, through its course's authoring gate (404 when gone).
    pub async fn require_import(&self, actor: &Actor, id: Uuid) -> Result<()> {
        self.row(actor, id).await.map(drop)
    }

    async fn row(&self, actor: &Actor, id: Uuid) -> Result<ab_db::assessment_imports::ImportRow> {
        let row = ab_db::assessment_imports::get_import(&self.pool, id)
            .await?
            .ok_or_else(|| Error::not_found("assessment import"))?;
        self.assessments
            .authorable_course(actor, row.course_id)
            .await?;
        Ok(row)
    }

    /// Take an uploaded `.xlsx` (an `assessment-import` upload of the actor)
    /// and parse it.
    pub async fn create(
        &self,
        actor: &Actor,
        course_id: CourseId,
        upload_id: Uuid,
        file_name: &str,
        unescape_newlines: bool,
    ) -> Result<AssessmentImport> {
        self.require_course(actor, course_id).await?;
        self.check_rate(actor).await?;
        let file_name = ab_core::required_str("file_name", file_name)?;
        let file_name: String = file_name.chars().take(255).collect();
        let id = Uuid::now_v7();
        let mut tx = self.pool.begin().await?;
        let key = crate::files::uploads::claim_upload(
            &mut tx,
            actor,
            upload_id,
            IMPORT_PURPOSE,
            "upload_id",
        )
        .await?;
        let bytes = self
            .storage
            .get(Bucket::Private, &key)
            .await?
            .ok_or_else(|| Error::conflict("no object received for this upload"))?;
        let sha = sha2::Sha256::digest(&bytes);
        ab_db::assessment_imports::insert_import(
            &mut *tx,
            ab_db::assessment_imports::NewImport {
                id,
                course_id,
                created_by: actor.user_id,
                upload_id,
                file_name: &file_name,
                file_sha256: sha.as_slice(),
                unescape_newlines,
                ttl_secs: UNCOMMITTED_TTL.as_secs_f64(),
            },
        )
        .await?;
        self.parse_into(&mut tx, actor, id, &bytes, unescape_newlines, &[])
            .await?;
        tx.commit().await?;
        self.get(actor, id).await
    }

    /// Read the file again with the other `\n` mode.
    pub async fn reparse(
        &self,
        actor: &Actor,
        id: Uuid,
        unescape_newlines: bool,
    ) -> Result<AssessmentImport> {
        self.row(actor, id).await?;
        let mut tx = self.pool.begin().await?;
        let row = ab_db::assessment_imports::lock_import(&mut tx, id)
            .await?
            .ok_or_else(|| Error::not_found("assessment import"))?;
        if row.status == "committed" {
            return Err(Error::conflict(
                "this spreadsheet was already turned into a test",
            ));
        }
        let upload_id = row.upload_id.ok_or_else(import_gone)?;
        let upload = ab_db::uploads::get_upload(&mut *tx, upload_id)
            .await?
            .ok_or_else(import_gone)?;
        let bytes = self
            .storage
            .get(Bucket::Private, &upload.key)
            .await?
            .ok_or_else(import_gone)?;
        self.parse_into(
            &mut tx,
            actor,
            id,
            &bytes,
            unescape_newlines,
            &row.image_upload_ids,
        )
        .await?;
        tx.commit().await?;
        self.get(actor, id).await
    }

    /// Parse `bytes`, stage the pictures, store the plan. `previous`: the
    /// pictures an earlier parse of the same file staged; the same file
    /// holds the same pictures in the same order, so they are reused.
    #[allow(clippy::too_many_lines, reason = "parse, stage pictures, plan, store")]
    async fn parse_into(
        &self,
        tx: &mut sqlx::PgConnection,
        actor: &Actor,
        id: Uuid,
        bytes: &[u8],
        unescape_newlines: bool,
        previous: &[Uuid],
    ) -> Result<()> {
        let owned = bytes.to_vec();
        let parsed = tokio::task::spawn_blocking(move || {
            ab_xlsx::parse(
                &owned,
                ParseOptions {
                    unescape_newlines,
                    max_questions: usize::try_from(MAX_BANK_ITEMS).unwrap_or(1000),
                },
            )
        })
        .await
        .map_err(|e| Error::internal("spreadsheet parse", e))?;
        let invalid = parsed.has_errors();
        let mut issues: Vec<ImportIssue> = parsed.issues.into_iter().map(issue_of).collect();
        let truncated = i32::try_from(parsed.truncated).unwrap_or(i32::MAX);
        let mut image_ids = Vec::new();
        let plan = match parsed.test {
            None => None,
            Some(test) => {
                // Staged for the preview too, so a file with errors still
                // shows where its pictures are.
                let mut media = Vec::with_capacity(test.images.len());
                let reuse = previous.len() == test.images.len();
                for (n, image) in test.images.iter().enumerate() {
                    if reuse {
                        image_ids.push(previous[n]);
                        media.push(MediaRef {
                            upload_id: previous[n],
                            width: image.width,
                            height: image.height,
                            alt: String::new(),
                        });
                        continue;
                    }
                    let key = format!(
                        "{IMAGE_PURPOSE}/{}.{}",
                        Uuid::now_v7().simple(),
                        image.extension()
                    );
                    self.storage
                        .put(Bucket::Private, &key, image.bytes.clone())
                        .await?;
                    let upload_id = ab_db::uploads::insert_stored(
                        &mut *tx,
                        actor.user_id,
                        IMAGE_PURPOSE,
                        "private",
                        &key,
                        image.mime,
                        i64::try_from(image.bytes.len()).unwrap_or(i64::MAX),
                        IMAGE_GRACE.as_secs_f64(),
                    )
                    .await?;
                    image_ids.push(upload_id);
                    media.push(MediaRef {
                        upload_id,
                        width: image.width,
                        height: image.height,
                        alt: String::new(),
                    });
                }
                let settings = settings_of(&test, &mut issues);
                let (items, more) = plan_items(&test, &media);
                issues.extend(more);
                let essays = items
                    .iter()
                    .filter(|i| matches!(&i.body, ItemBody::OpenText(b) if !b.short_answer))
                    .count();
                if essays > 0 {
                    issues.push(ImportIssue {
                        severity: IssueSeverity::Warning,
                        code: "manual_grading".into(),
                        cell: None,
                        row: None,
                        params: serde_json::Map::from_iter([("n".into(), essays.into())]),
                    });
                }
                issues.sort_by_key(|i| (i.severity as u8, i.row.unwrap_or(0)));
                let summary = summarize(&items, test.images.len(), &issues);
                Some(Plan {
                    settings,
                    items,
                    summary,
                })
            }
        };
        let plan_value = plan
            .as_ref()
            .map(serde_json::to_value)
            .transpose()
            .map_err(|e| Error::internal("import plan", e))?;
        let issues_value =
            serde_json::to_value(&issues).map_err(|e| Error::internal("import issues", e))?;
        ab_db::assessment_imports::set_parsed(
            &mut *tx,
            id,
            ab_db::assessment_imports::ParsedImport {
                status: if invalid { "invalid" } else { "ready" },
                unescape_newlines,
                sheet_name: &parsed.sheet,
                parsed: plan_value.as_ref(),
                issues: &issues_value,
                issues_truncated: truncated,
                image_upload_ids: &image_ids,
            },
        )
        .await?;
        let dropped: Vec<Uuid> = previous
            .iter()
            .filter(|id| !image_ids.contains(id))
            .copied()
            .collect();
        ab_db::uploads::release_references(&mut *tx, &dropped, IMAGE_GRACE.as_secs_f64()).await?;
        Ok(())
    }

    pub async fn get(&self, actor: &Actor, id: Uuid) -> Result<AssessmentImport> {
        let row = self.row(actor, id).await?;
        let plan: Option<Plan> = row
            .parsed
            .as_ref()
            .map(|v| serde_json::from_value(v.clone()))
            .transpose()
            .map_err(|e| Error::internal("import plan", e))?;
        let issues: Vec<ImportIssue> = serde_json::from_value(row.issues.clone())
            .map_err(|e| Error::internal("import issues", e))?;
        let result = match row.result_assessment_id {
            Some(assessment_id) => ab_db::assessments::get_assessment(&self.pool, assessment_id)
                .await?
                .map(|a| ImportResult {
                    assessment_id,
                    activity_id: a.activity_id,
                }),
            None => None,
        };
        let status = match row.status.as_str() {
            "committed" => ImportStatus::Committed,
            "ready" => ImportStatus::Ready,
            _ => ImportStatus::Invalid,
        };
        let (settings, items, summary) = match plan {
            Some(p) => (Some(p.settings), p.items, p.summary),
            None => (None, Vec::new(), summarize(&[], 0, &issues)),
        };
        Ok(AssessmentImport {
            id: row.id,
            course_id: row.course_id,
            status,
            file_name: row.file_name,
            sheet: row.sheet_name.unwrap_or_default(),
            unescape_newlines: row.unescape_newlines,
            settings,
            summary,
            items,
            issues,
            issues_truncated: row.issues_truncated,
            result,
            created_at_unix: row.created_at,
            expires_at_unix: row.expires_at,
        })
    }

    /// Drop an import: the file and the pictures no test took go.
    pub async fn discard(&self, actor: &Actor, id: Uuid) -> Result<()> {
        self.row(actor, id).await?;
        let mut tx = self.pool.begin().await?;
        Self::delete_in(&mut tx, id).await?;
        tx.commit().await?;
        Ok(())
    }

    async fn delete_in(tx: &mut sqlx::PgConnection, id: Uuid) -> Result<()> {
        let Some(row) = ab_db::assessment_imports::lock_import(&mut *tx, id).await? else {
            return Ok(());
        };
        ab_db::assessment_imports::delete_import(&mut *tx, id).await?;
        let mut held: Vec<Uuid> = row.image_upload_ids;
        held.extend(row.upload_id);
        ab_db::uploads::release_references(&mut *tx, &held, IMAGE_GRACE.as_secs_f64()).await?;
        Ok(())
    }

    /// Retention sweep: expired imports and their files (maintenance job).
    pub async fn purge_expired(pool: &PgPool) -> Result<u64> {
        let mut purged = 0;
        for id in ab_db::assessment_imports::expired(pool, 200).await? {
            let mut tx = pool.begin().await?;
            Self::delete_in(&mut tx, id).await?;
            tx.commit().await?;
            purged += 1;
        }
        Ok(purged)
    }

    /// Create the questions. Idempotent: a committed import answers with
    /// the test it made.
    #[allow(
        clippy::too_many_lines,
        reason = "one transaction: target, settings, items, audit"
    )]
    pub async fn commit(
        &self,
        actor: &Actor,
        id: Uuid,
        target: CommitTarget,
        options: CommitOptions,
    ) -> Result<AssessmentImport> {
        let row = self.row(actor, id).await?;
        if row.status == "committed" {
            return self.get(actor, id).await;
        }
        let mut tx = self.pool.begin().await?;
        let row = ab_db::assessment_imports::lock_import(&mut tx, id)
            .await?
            .ok_or_else(import_gone)?;
        match row.status.as_str() {
            "committed" => {
                drop(tx);
                return self.get(actor, id).await;
            }
            "ready" => {}
            _ => {
                return Err(Error::app(
                    ErrorCode::AssessmentImportInvalid,
                    "the spreadsheet has errors; fix them and upload it again",
                ));
            }
        }
        let plan: Plan = row
            .parsed
            .as_ref()
            .map(|v| serde_json::from_value(v.clone()))
            .transpose()
            .map_err(|e| Error::internal("import plan", e))?
            .ok_or_else(|| Error::app(ErrorCode::AssessmentImportInvalid, "nothing parsed"))?;
        let title = options
            .title
            .as_deref()
            .unwrap_or(&plan.settings.title)
            .to_owned();
        let policy_for = |base: PolicyInput| -> PolicyInput {
            let s = &plan.settings;
            PolicyInput {
                max_attempts: options.max_attempts.unwrap_or(s.max_attempts),
                time_limit_seconds: options.time_limit_seconds.unwrap_or(s.time_limit_seconds),
                draw_count: options.draw_count.unwrap_or(s.draw_count),
                draw_strata: options
                    .draw_strata
                    .clone()
                    .unwrap_or_else(|| s.draw_strata.clone()),
                randomize_questions: true,
                randomize_options: true,
                partial_credit: options.partial_credit.unwrap_or(false),
                passing_score: options.passing_score.unwrap_or(DOT_PASSING_SCORE),
                ..base
            }
        };
        let assessment_id = match target {
            CommitTarget::New { chapter_id, kind } => {
                if !matches!(kind, AssessmentKind::Quiz | AssessmentKind::Exam) {
                    return Err(Error::validation(vec![FieldError {
                        field: "target.kind".into(),
                        code: "invalid".into(),
                        message: "a spreadsheet makes a quiz or an exam".into(),
                    }]));
                }
                let created = self
                    .assessments
                    .create_in(
                        &mut tx,
                        actor,
                        CreateAssessment {
                            chapter_id,
                            kind,
                            title: &title,
                            description: "",
                            weight: 1.0,
                            grading_type: GradingType::Percentage,
                            policy: Some(policy_for(PolicyInput::preset(kind))),
                        },
                    )
                    .await?;
                // The chapter must be of the import's course.
                let made = ab_db::assessments::get_assessment(&mut *tx, created)
                    .await?
                    .ok_or_else(|| Error::not_found("assessment"))?;
                if made.course_id != row.course_id {
                    return Err(Error::not_found("chapter"));
                }
                created
            }
            CommitTarget::Replace { assessment_id } | CommitTarget::Append { assessment_id } => {
                let assessment = self.assessments.load_for_edit(actor, assessment_id).await?;
                if assessment.course_id != row.course_id {
                    return Err(Error::not_found("assessment"));
                }
                let detail = AssessmentsService::lock_detail(&mut tx, assessment_id).await?;
                ensure_editable(&mut *tx, &detail.assessment).await?;
                AssessmentsService::ensure_content_unlocked(&mut *tx, &detail.assessment).await?;
                if detail.assessment.lifecycle != Lifecycle::Draft {
                    return Err(Error::conflict(
                        "unpublish the test before loading questions into it",
                    ));
                }
                if matches!(target, CommitTarget::Replace { .. }) {
                    for item in &detail.items {
                        ab_db::assessments::delete_item(&mut *tx, item.id).await?;
                    }
                    let gone: Vec<Uuid> = detail
                        .items
                        .iter()
                        .flat_map(|i| i.body.upload_ids())
                        .collect();
                    ab_db::uploads::release_references(&mut tx, &gone, IMAGE_GRACE.as_secs_f64())
                        .await?;
                }
                if options.apply_settings {
                    let policy = policy_for(PolicyInput::from_row(&detail.assessment));
                    policy.validate()?;
                    ab_db::assessments::update_policy(&mut *tx, assessment_id, &policy.to_values())
                        .await?;
                }
                assessment_id
            }
        };
        let rows: Vec<ab_db::assessments::ImportedItem<'_>> = plan
            .items
            .iter()
            .map(|i| ab_db::assessments::ImportedItem {
                kind: i.kind,
                title: &i.title,
                body: i.body.to_stored(),
                max_score: i.max_score,
                draw_group: i.draw_group.as_deref(),
                source_row: i.row,
            })
            .collect();
        let created = ab_db::assessments::insert_imported_items(
            &mut tx,
            assessment_id,
            &row.file_name,
            &rows,
        )
        .await?;
        let count = ab_db::assessments::count_items(&mut *tx, assessment_id).await?;
        if count > MAX_BANK_ITEMS {
            return Err(Error::validation(vec![FieldError {
                field: "items".into(),
                code: "limit-exceeded".into(),
                message: format!("a test holds at most {MAX_BANK_ITEMS} questions"),
            }]));
        }
        // The pictures now belong to the items (the trigger links them).
        ab_db::uploads::hold(&mut *tx, &row.image_upload_ids).await?;
        ab_db::assessments::bump_content_version(&mut *tx, assessment_id).await?;
        ab_db::assessments::insert_audit_event(
            &mut *tx,
            assessment_id,
            Some(actor.user_id),
            AuditEventKind::ImportedFromXlsx,
            serde_json::json!({
                "import_id": id, "file_name": row.file_name, "items": created,
            }),
        )
        .await?;
        ab_db::assessment_imports::mark_committed(
            &mut *tx,
            id,
            assessment_id,
            COMMITTED_TTL.as_secs_f64(),
        )
        .await?;
        tx.commit().await?;
        self.get(actor, id).await
    }

    // ── Pictures of items ───────────────────────────────────────────────

    /// A short-lived URL of a picture `assessment_id` shows the actor (an
    /// item they can read names it).
    pub async fn assessment_media_url(
        &self,
        actor: &Actor,
        assessment_id: AssessmentId,
        upload_id: Uuid,
    ) -> Result<String> {
        let detail = self.assessments.get(actor, assessment_id).await?;
        if !detail
            .items
            .iter()
            .any(|i| i.body.upload_ids().contains(&upload_id))
        {
            return Err(Error::not_found("picture"));
        }
        self.presign(upload_id).await
    }

    /// A picture of an import's preview.
    pub async fn import_media_url(
        &self,
        actor: &Actor,
        id: Uuid,
        upload_id: Uuid,
    ) -> Result<String> {
        let row = self.row(actor, id).await?;
        if !row.image_upload_ids.contains(&upload_id) {
            return Err(Error::not_found("picture"));
        }
        self.presign(upload_id).await
    }

    async fn presign(&self, upload_id: Uuid) -> Result<String> {
        let upload = ab_db::uploads::get_upload(&self.pool, upload_id)
            .await?
            .ok_or_else(|| Error::not_found("picture"))?;
        self.storage.presign_get(
            Bucket::Private,
            &upload.key,
            None,
            Some(&upload.mime),
            true,
            MEDIA_URL_TTL,
        )
    }
}

/// One line of the «Пропущено» sheet: what the spreadsheet could not hold
/// (Russian, like the rest of the file).
fn skip(position: usize, title: &str, reason: &str) -> ab_xlsx::Skipped {
    ab_xlsx::Skipped {
        position: u32::try_from(position).unwrap_or(u32::MAX),
        title: title.to_owned(),
        reason: reason.to_owned(),
    }
}

/// The DOT levels a `draw_group` may name.
const DOT_LEVELS: [u32; 7] = [1, 2, 3, 101, 102, 201, 202];

/// A picture's place in the workbook's image list.
type Pictures = std::collections::HashMap<Uuid, usize>;

impl ImportsService {
    /// The test as a DOT spreadsheet (spec 8.1): edit it in Excel and upload
    /// it back with «replace». Authors only.
    pub async fn export(
        &self,
        actor: &Actor,
        assessment_id: AssessmentId,
    ) -> Result<(String, Vec<u8>)> {
        let assessment = self
            .assessments
            .load_for_author(actor, assessment_id)
            .await?;
        let detail = self.assessments.detail(assessment_id).await?;
        let policy = PolicyInput::from_row(&assessment);
        let mut images: Vec<ab_xlsx::Image> = Vec::new();
        let mut by_upload = Pictures::new();
        let mut skipped = Vec::new();
        let mut questions = Vec::new();
        for (n, item) in detail.items.iter().enumerate() {
            let position = n + 1;
            for id in item.body.upload_ids() {
                if by_upload.contains_key(&id) {
                    continue;
                }
                if let Some(index) = self.export_picture(&item.body, id, &mut images).await? {
                    by_upload.insert(id, index);
                }
            }
            match export_item(item, &by_upload) {
                Ok((question, notes)) => {
                    skipped.extend(notes.into_iter().map(|r| skip(position, &item.title, r)));
                    questions.push(question);
                }
                Err(reason) => skipped.push(skip(position, &item.title, reason)),
            }
        }
        if questions.is_empty() {
            return Err(Error::app(
                ErrorCode::AssessmentExportEmpty,
                "no question of this test fits the spreadsheet format",
            ));
        }
        let leveling = !policy.draw_strata.is_empty();
        if !leveling {
            for q in &mut questions {
                q.level = 0;
            }
        }
        let to_u32 = |n: Option<i32>| n.and_then(|n| u32::try_from(n).ok()).unwrap_or(0);
        let test = DotTest {
            title: assessment.title.clone(),
            attempts: to_u32(policy.max_attempts),
            time_minutes: to_u32(policy.time_limit_seconds.map(|s| (s + 59) / 60)),
            limit: to_u32(policy.draw_count),
            leveling,
            questions,
            images,
        };
        let bytes = tokio::task::spawn_blocking(move || ab_xlsx::write(&test, &skipped))
            .await
            .map_err(|e| Error::internal("spreadsheet export", e))?
            .map_err(|ab_xlsx::WriteError::Xlsx(e)| {
                Error::internal("spreadsheet export", std::io::Error::other(e))
            })?;
        Ok((export_file_name(&assessment.title), bytes))
    }

    /// Downloads one picture into the workbook's list (deduplicated by
    /// SHA-256); `None` when the upload or its object is gone.
    async fn export_picture(
        &self,
        body: &ItemBody,
        id: Uuid,
        images: &mut Vec<ab_xlsx::Image>,
    ) -> Result<Option<usize>> {
        let Some(upload) = ab_db::uploads::get_upload(&self.pool, id).await? else {
            return Ok(None);
        };
        let Some(bytes) = self.storage.get(Bucket::Private, &upload.key).await? else {
            return Ok(None);
        };
        let sha: [u8; 32] = sha2::Sha256::digest(&bytes).into();
        if let Some(i) = images.iter().position(|i| i.sha256 == sha) {
            return Ok(Some(i));
        }
        let (width, height) = media_size(body, id);
        images.push(ab_xlsx::Image {
            sha256: sha,
            mime: match upload.mime.as_str() {
                "image/jpeg" => "image/jpeg",
                "image/gif" => "image/gif",
                "image/webp" => "image/webp",
                _ => "image/png",
            },
            bytes,
            width,
            height,
        });
        Ok(Some(images.len() - 1))
    }
}

/// One item as a DOT question plus the notes on what did not carry over,
/// or why it cannot be a DOT question at all.
fn export_item(
    item: &Item,
    pictures: &Pictures,
) -> std::result::Result<(DotQuestion, Vec<&'static str>), &'static str> {
    let picture = |m: &MediaRef| pictures.get(&m.upload_id).copied();
    let all = |media: &[MediaRef]| media.iter().filter_map(picture).collect::<Vec<_>>();
    let option = |text: &str, media: Option<&MediaRef>| DotOption {
        text: text.to_owned(),
        image: media.and_then(picture),
    };
    let mut notes = Vec::new();
    let mut format = |f: TextFormat| {
        if f == TextFormat::Markdown {
            notes.push("форматирование Markdown не переносится: текст выгружен как есть");
        }
    };
    let (text, images, kind) = match &item.body {
        ItemBody::Choice(b) => {
            format(b.prompt_format);
            let options: Vec<DotOption> = b
                .options
                .iter()
                .map(|o| option(&o.text, o.media.as_ref()))
                .collect();
            let correct: Vec<usize> = b
                .options
                .iter()
                .enumerate()
                .filter(|(_, o)| o.is_correct)
                .map(|(i, _)| i)
                .collect();
            let kind = match (b.multiple, correct.first()) {
                (_, None) => return Err("нет правильного варианта"),
                (true, Some(_)) => DotKind::Multiple { options, correct },
                (false, Some(first)) => DotKind::Single {
                    options,
                    correct: *first,
                },
            };
            (b.prompt.clone(), all(&b.media), kind)
        }
        ItemBody::OpenText(b) => {
            format(b.prompt_format);
            let kind = if b.short_answer {
                let Some(first) = b.accepted_answers.first() else {
                    return Err("нет правильного ответа");
                };
                if b.accepted_answers.len() > 1 {
                    notes.push("в DOT один правильный ответ: выгружен первый");
                }
                if !b.case_sensitive {
                    notes.push("DOT сравнивает ответ с учётом регистра");
                }
                DotKind::Short {
                    answer: first.clone(),
                }
            } else {
                DotKind::Essay
            };
            (b.prompt.clone(), all(&b.media), kind)
        }
        ItemBody::Matching(b) => {
            format(b.prompt_format);
            let right = b.right_values();
            let pairs = b
                .pairs
                .iter()
                .map(|p| {
                    p.right
                        .as_deref()
                        .and_then(|r| right.iter().position(|x| *x == r))
                })
                .collect();
            let kind = DotKind::Matching {
                left: b.pairs.iter().map(|p| option(&p.left, None)).collect(),
                right: right.iter().map(|r| option(r, None)).collect(),
                pairs,
            };
            (b.prompt.clone(), all(&b.media), kind)
        }
        ItemBody::Form(_) | ItemBody::Code(_) | ItemBody::MatchingLearner(_) => {
            return Err("такой вид вопроса в DOT не поддерживается");
        }
    };
    if (item.max_score - 1.0).abs() > f64::EPSILON {
        notes.push("в DOT все вопросы стоят одинаково: балл не перенесён");
    }
    let level = item
        .draw_group
        .as_deref()
        .and_then(|g| g.parse::<u32>().ok())
        .filter(|l| DOT_LEVELS.contains(l))
        .unwrap_or(0);
    Ok((
        DotQuestion {
            row: 0,
            text,
            images,
            level,
            kind,
        },
        notes,
    ))
}

/// `<title>.xlsx` with anything a file system may refuse replaced by `_`.
fn export_file_name(title: &str) -> String {
    let name: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .take(100)
        .collect();
    let name = name.trim();
    if name.is_empty() {
        "test.xlsx".to_owned()
    } else {
        format!("{name}.xlsx")
    }
}

/// The size an item body records for one of its pictures.
fn media_size(body: &ItemBody, id: Uuid) -> (u32, u32) {
    let found = match body {
        ItemBody::Choice(b) => b
            .media
            .iter()
            .chain(b.options.iter().filter_map(|o| o.media.as_ref()))
            .find(|m| m.upload_id == id),
        ItemBody::OpenText(b) => b.media.iter().find(|m| m.upload_id == id),
        ItemBody::Matching(b) => b.media.iter().find(|m| m.upload_id == id),
        _ => None,
    };
    found.map_or((0, 0), |m| (m.width, m.height))
}

/// An item write's pictures: every new one must be an `assessment-image`
/// upload of the actor, or one this course already shows; they are held,
/// and the ones no longer named start their grace clock. Call after the
/// item row is written (the link trigger has run), in its transaction.
pub(crate) async fn sync_media(
    tx: &mut sqlx::PgConnection,
    actor: &Actor,
    course_id: CourseId,
    before: &[Uuid],
    after: &[Uuid],
) -> Result<()> {
    let added: Vec<Uuid> = after
        .iter()
        .filter(|id| !before.contains(id))
        .copied()
        .collect();
    if !added.is_empty() {
        let found = ab_db::uploads::owned_of_purpose(&mut *tx, &added, IMAGE_PURPOSE).await?;
        let shown = ab_db::uploads::shown_in_course(&mut *tx, &added, course_id).await?;
        let refused: Vec<String> = added
            .iter()
            .filter(|id| {
                let mine = found
                    .iter()
                    .any(|(f, owner)| f == *id && *owner == actor.user_id);
                let known = found.iter().any(|(f, _)| f == *id) && shown.contains(id);
                !(mine || known)
            })
            .map(ToString::to_string)
            .collect();
        if !refused.is_empty() {
            return Err(Error::validation(vec![FieldError {
                field: "body.media".into(),
                code: "wrong-purpose".into(),
                message: format!(
                    "not an assessment picture you uploaded: {}",
                    refused.join(", ")
                ),
            }]));
        }
        ab_db::uploads::hold(&mut *tx, &added).await?;
    }
    let removed: Vec<Uuid> = before
        .iter()
        .filter(|id| !after.contains(id))
        .copied()
        .collect();
    ab_db::uploads::release_references(&mut *tx, &removed, IMAGE_GRACE.as_secs_f64()).await?;
    Ok(())
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    fn question(row: u32, text: &str, level: u32, kind: DotKind) -> DotQuestion {
        DotQuestion {
            row,
            text: text.into(),
            images: Vec::new(),
            level,
            kind,
        }
    }

    fn opt(text: &str) -> DotOption {
        DotOption {
            text: text.into(),
            image: None,
        }
    }

    fn test(questions: Vec<DotQuestion>, limit: u32, leveling: bool) -> DotTest {
        DotTest {
            title: "Java".into(),
            attempts: 12,
            time_minutes: 55,
            limit,
            leveling,
            questions,
            images: Vec::new(),
        }
    }

    #[test]
    fn every_dot_type_maps_to_an_item() {
        let t = test(
            vec![
                question(
                    2,
                    "Pick\nsecond line",
                    0,
                    DotKind::Single {
                        options: vec![opt("a"), opt("b")],
                        correct: 1,
                    },
                ),
                question(
                    3,
                    "Several",
                    0,
                    DotKind::Multiple {
                        options: vec![opt("a"), opt("b"), opt("c")],
                        correct: vec![0, 2],
                    },
                ),
                question(
                    4,
                    "Type",
                    0,
                    DotKind::Short {
                        answer: "310".into(),
                    },
                ),
                question(
                    5,
                    "Match",
                    0,
                    DotKind::Matching {
                        left: vec![opt("x"), opt("y")],
                        right: vec![opt("1"), opt("2"), opt("3")],
                        pairs: vec![Some(1), None],
                    },
                ),
                question(6, "", 0, DotKind::Essay),
            ],
            0,
            false,
        );
        let (items, issues) = plan_items(&t, &[]);
        assert!(issues.is_empty());
        let kinds: Vec<ItemKind> = items.iter().map(|i| i.kind).collect();
        assert_eq!(
            kinds,
            [
                ItemKind::Choice,
                ItemKind::Choice,
                ItemKind::OpenText,
                ItemKind::Matching,
                ItemKind::OpenText
            ]
        );
        assert_eq!(items[0].title, "Pick");
        assert_eq!(items[4].title, "№ 5");
        let ItemBody::Choice(single) = &items[0].body else {
            panic!("choice");
        };
        assert_eq!(single.prompt_format, TextFormat::Plain);
        assert!(single.options[1].is_correct && !single.options[0].is_correct);
        let ItemBody::Choice(multi) = &items[1].body else {
            panic!("choice");
        };
        assert!(multi.multiple);
        let ItemBody::OpenText(short) = &items[2].body else {
            panic!("open text");
        };
        assert!(short.short_answer && short.case_sensitive);
        assert_eq!(short.accepted_answers, ["310"]);
        let ItemBody::Matching(m) = &items[3].body else {
            panic!("matching");
        };
        assert_eq!(m.pairs[0].right.as_deref(), Some("2"));
        assert_eq!(m.pairs[1].right, None);
        assert_eq!(m.distractors, ["1", "3"]);
        for item in &items {
            assert!(item.body.validate().is_ok());
        }
    }

    #[test]
    fn settings_cap_attempts_and_compute_quotas() {
        let qs: Vec<DotQuestion> = (0..90)
            .map(|n| {
                question(
                    n + 2,
                    "q",
                    1 + n % 3,
                    DotKind::Single {
                        options: vec![opt("a"), opt("b")],
                        correct: 0,
                    },
                )
            })
            .collect();
        let mut issues = Vec::new();
        let s = settings_of(&test(qs, 30, true), &mut issues);
        assert_eq!(s.max_attempts, Some(10));
        assert_eq!(issues[0].code, "attempts_capped");
        assert_eq!(s.time_limit_seconds, Some(3300));
        assert_eq!(s.draw_count, Some(30));
        let counts: Vec<i32> = s.draw_strata.iter().map(|d| d.count).collect();
        assert_eq!(counts, [9, 12, 9]);
    }

    #[test]
    fn a_limit_covering_every_question_draws_them_all() {
        let qs = vec![question(
            2,
            "q",
            0,
            DotKind::Single {
                options: vec![opt("a"), opt("b")],
                correct: 0,
            },
        )];
        let s = settings_of(&test(qs, 1, false), &mut Vec::new());
        assert_eq!(s.draw_count, None);
    }

    #[test]
    fn long_titles_are_cut() {
        let long = "x".repeat(200);
        assert_eq!(item_title(&long, 1).chars().count(), 80);
        assert_eq!(item_title("  \n  second", 3), "second");
    }
}
