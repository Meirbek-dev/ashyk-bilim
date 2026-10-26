//! Context assembly for the agents.
//!
//! Context assembly for the agents (legacy `services/ai/context/*`): the
//! course outline with activity content and assessment items, or one
//! submission with its answers and grading, rendered as text plus a list of
//! citable sources. Citations the model returns are checked against those
//! sources; unknown ones are dropped from the evidence.

use ab_core::Result;
use ab_core::assessments::FileAttemptStatus;
use ab_core::id::{ActivityId, CourseId};
use ab_db::ai as db;
use ab_db::file_submissions::{AttemptRow, FileRow};
use ab_db::submissions::SubmissionRow;
use sqlx::PgPool;

use crate::ai::prompts::{CONTEXT_CLIP_LIMIT, clipped_at};
use crate::assessments::items::ItemBody;
use crate::grading::breakdown::GradingBreakdown;
use crate::grading::submissions::{ReleaseState, redact_grading, release_state};

/// One citable source (legacy `AIContextSource`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextSource {
    pub citation_id: String,
    pub label: String,
    pub source_type: String,
    pub source_ref: Option<String>,
    pub excerpt: String,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Default)]
pub struct ContextBundle {
    pub text: String,
    pub sources: Vec<ContextSource>,
}

impl ContextBundle {
    /// Legacy `render_context_bundle`.
    #[must_use]
    pub fn render(&self) -> String {
        render_parts(&self.text, &self.sources)
    }

    /// The rendering cut to fit the prompt (BUG-325): whole sources, in
    /// order, while it stays within a character limit - `CONTEXT_CLIP_LIMIT`
    /// first, shrinking until `fits` accepts it. Returns the rendering and
    /// the sources it lists; the dropped ones are not citable, the model
    /// never saw them.
    #[must_use]
    pub fn fitted(self, fits: impl Fn(&str) -> bool) -> (String, Vec<ContextSource>) {
        const MIN_CHARS: usize = 1000;
        let Self { text, mut sources } = self;
        let entries: Vec<usize> = sources
            .iter()
            .map(|s| source_entry(s).chars().count())
            .collect();
        let fixed = text.chars().count() + CITATION_HEADER.chars().count();
        let mut limit = CONTEXT_CLIP_LIMIT;
        loop {
            let mut used = fixed;
            let kept = entries
                .iter()
                .take_while(|&&len| {
                    used += 1 + len;
                    used <= limit
                })
                .count();
            let rendered = clipped_at(&render_parts(&text, &sources[..kept]), limit);
            if limit <= MIN_CHARS || fits(&rendered) {
                sources.truncate(kept);
                return (rendered, sources);
            }
            limit = limit * 3 / 4;
        }
    }
}

const CITATION_HEADER: &str =
    "\n\nCitation sources:\nUse only these authoritative sources for the selected scope.";

fn source_entry(source: &ContextSource) -> String {
    format!(
        "[{}] {} | {} | {}\nExcerpt: {}",
        source.citation_id,
        source.source_type,
        source.source_ref.as_deref().unwrap_or("untracked"),
        source.label,
        source.excerpt
    )
}

fn render_parts(text: &str, sources: &[ContextSource]) -> String {
    if sources.is_empty() {
        return text.to_owned();
    }
    let mut rendered = format!("{text}{CITATION_HEADER}");
    for source in sources {
        rendered.push('\n');
        rendered.push_str(&source_entry(source));
    }
    rendered
}

/// Legacy `_json_snippet`: compact JSON cut at `limit` characters.
#[must_use]
pub fn json_snippet(value: &serde_json::Value, limit: usize) -> String {
    let text = value.to_string();
    if text.chars().count() <= limit {
        text
    } else {
        text.chars().take(limit).collect()
    }
}

fn source(
    citation_id: String,
    label: String,
    source_type: &str,
    source_ref: Option<String>,
    excerpt: &str,
    metadata: serde_json::Value,
) -> ContextSource {
    ContextSource {
        citation_id,
        label,
        source_type: source_type.to_owned(),
        source_ref,
        excerpt: excerpt.chars().take(1200).collect(),
        metadata,
    }
}

/// The course outline (published activities only for learners), optionally
/// narrowed to one activity.
pub async fn course_bundle(
    pool: &PgPool,
    course_id: CourseId,
    include_unpublished: bool,
    only_activity: Option<ActivityId>,
) -> Result<ContextBundle> {
    let Some(course) = db::course_context(pool, course_id).await? else {
        return Ok(ContextBundle::default());
    };
    let chapters = db::chapter_names(pool, course_id).await?;
    let activities = db::activities_with_content(pool, course_id)
        .await?
        .into_iter()
        .filter(|a| include_unpublished || a.published)
        .filter(|a| only_activity.is_none_or(|id| a.id == id))
        .collect::<Vec<_>>();
    let assessments = db::assessments_context(pool, course_id).await?;

    let lines = [
        format!("Course: {}", course.name),
        format!("Description: {}", course.description),
        format!("About: {}", course.about),
        format!("Learning outcomes: {}", learnings_text(&course.learnings)),
        format!("Tags: {}", course.tags.join(", ")),
    ];
    let mut sources = vec![source(
        format!("course:{}", course.id),
        course.name.clone(),
        "course",
        Some(course.id.to_string()),
        &lines.join("\n"),
        serde_json::json!({ "course_id": course.id }),
    )];
    for activity in &activities {
        let chapter_title = chapters
            .iter()
            .find(|c| c.id == activity.chapter_id)
            .map_or("Unassigned", |c| c.name.as_str());
        let activity_lines = [
            format!("Chapter: {chapter_title}"),
            format!("Activity: {} ({})", activity.name, activity.activity_type),
            format!(
                "Published: {}",
                if activity.published { "True" } else { "False" }
            ),
            format!("Content: {}", json_snippet(&activity.content, 1800)),
            format!("Details: {}", json_snippet(&activity.details, 1800)),
        ];
        sources.push(source(
            format!("activity:{}", activity.id),
            activity.name.clone(),
            "activity",
            Some(activity.id.to_string()),
            &activity_lines.join("\n"),
            serde_json::json!({
                "course_id": course.id,
                "activity_id": activity.id,
                "chapter_id": activity.chapter_id,
                "published": activity.published,
            }),
        ));
        if let Some(assessment) = assessments.iter().find(|a| a.activity_id == activity.id) {
            push_assessment_sources(pool, activity, assessment, &mut sources).await?;
        }
    }
    Ok(ContextBundle {
        text: lines.join("\n"),
        sources,
    })
}

/// The assessment of one activity and its items, as citable sources.
async fn push_assessment_sources(
    pool: &PgPool,
    activity: &db::ActivityContextRow,
    assessment: &db::AssessmentContextRow,
    sources: &mut Vec<ContextSource>,
) -> Result<()> {
    let assessment_lines = [
        format!("Assessment: {}", assessment.title),
        format!("Assessment settings: {}", settings_text(assessment)),
    ];
    sources.push(source(
        format!("assessment:{}", assessment.id),
        assessment.title.clone(),
        "assessment",
        Some(assessment.id.to_string()),
        &assessment_lines.join("\n"),
        serde_json::json!({ "activity_id": activity.id, "assessment_id": assessment.id }),
    ));
    for item in db::items_context(pool, assessment.id).await? {
        let line = format!(
            "Assessment item: {} {} {}",
            item.title,
            item.kind,
            json_snippet(&item.body, 700)
        );
        let label = if item.title.is_empty() {
            format!("Item {}", item.id)
        } else {
            item.title.clone()
        };
        sources.push(source(
            format!("assessment_item:{}", item.id),
            label,
            "assessment_item",
            Some(item.id.to_string()),
            &line,
            serde_json::json!({ "assessment_id": assessment.id, "activity_id": activity.id }),
        ));
    }
    Ok(())
}

/// An assessment's policy in words, not JSON: the model quoted `auto_then_manual`, `passing_score: 60.0` and
/// `time_limit_seconds` into teachers' reports and citations.
fn settings_text(assessment: &db::AssessmentContextRow) -> String {
    let grading = match assessment.grading_mode.as_str() {
        "auto" => "graded automatically",
        "manual" => "graded by the teacher",
        "auto_then_manual" => "graded automatically, then reviewed by the teacher",
        other => other,
    };
    let attempts = assessment.max_attempts.map_or_else(
        || "unlimited attempts".to_owned(),
        |n| format!("{n} attempt(s)"),
    );
    let time = assessment.time_limit_seconds.map_or_else(
        || "no time limit".to_owned(),
        |s| format!("time limit {} min", (s + 59) / 60),
    );
    let due = assessment
        .due_at
        .and_then(|at| jiff::Timestamp::from_second(at).ok())
        .map_or_else(
            || "no deadline".to_owned(),
            |at| format!("due {}", at.strftime("%Y-%m-%d %H:%M UTC")),
        );
    format!(
        "{} ({}); pass mark {}%; {attempts}; {time}; {due}",
        assessment.kind, grading, assessment.passing_score
    )
}

fn learnings_text(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Array(items) => items
            .iter()
            .map(|v| v.as_str().map_or_else(|| v.to_string(), str::to_owned))
            .collect::<Vec<_>>()
            .join("; "),
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// One submission: answers, grading, the activity and its assessment items.
/// Returns the bundle and the legacy run metadata
/// (`activity_id`, `assessment_id`, `item_count`).
///
/// `learner_view` (BUG-182, the owner triggered the run) renders what the
/// owner's submission read shows: scores and grading only once released,
/// the grading redacted by the assessment's `review_visibility`, and item
/// bodies without the answer key.
pub async fn submission_bundle(
    pool: &PgPool,
    submission: &SubmissionRow,
    learner_view: bool,
) -> Result<(ContextBundle, serde_json::Value)> {
    let assessment = ab_db::assessments::get_assessment(pool, submission.assessment_id).await?;
    let (mut activity, mut items) = (None, Vec::new());
    if let Some(a) = &assessment {
        activity = db::activity_context(pool, a.activity_id).await?;
        items = db::items_context(pool, a.id).await?;
    }
    let (released, grading) = if learner_view {
        for item in &mut items {
            item.body = learner_item_body(&item.body);
        }
        learner_grading(pool, submission, assessment.as_ref()).await?
    } else {
        (true, Some(submission.grading.clone()))
    };
    let shown = |score: Option<f64>| opt_num(score.filter(|_| released));
    let activity_label = activity.as_ref().map_or_else(
        || {
            assessment
                .as_ref()
                .map_or_else(|| "unknown".to_owned(), |a| a.activity_id.to_string())
        },
        |a| a.name.clone(),
    );
    let mut lines = vec![
        format!("Activity: {activity_label}"),
        format!("Submission UUID: {}", submission.id),
        format!(
            "Assessment type: {}",
            assessment
                .as_ref()
                .map_or_else(|| "unknown".to_owned(), |a| a.kind.to_string())
        ),
        format!("Final score: {} (percent)", shown(submission.final_score)),
        format!("Auto score: {} (percent)", shown(submission.auto_score)),
        format!("Status: {}", submission.status),
        format!("Answers: {}", json_snippet(&submission.answers, 1800)),
    ];
    lines.extend(question_scores(pool, assessment.as_ref(), grading.as_ref()).await?);
    lines.extend(grading.map(|g| format!("Grading: {}", json_snippet(&g, 1800))));
    let mut sources = vec![source(
        format!("submission:{}", submission.id),
        format!("Submission {}", submission.id),
        "submission",
        Some(submission.id.to_string()),
        &lines.join("\n"),
        serde_json::json!({
            "activity_id": activity.as_ref().map(|a| a.id),
            "student_user_id": submission.user_id,
        }),
    )];
    if let Some(activity) = &activity {
        sources.push(source(
            format!("activity:{}", activity.id),
            activity.name.clone(),
            "activity",
            Some(activity.id.to_string()),
            &format!(
                "Activity: {}\nContent: {}",
                activity.name,
                json_snippet(&activity.content, 1800)
            ),
            serde_json::json!({ "activity_id": activity.id, "course_id": submission.course_id }),
        ));
    }
    for item in &items {
        let line = format!(
            "Item: {} {} {}",
            item.title,
            item.kind,
            json_snippet(&item.body, 700)
        );
        lines.push(line.clone());
        let label = if item.title.is_empty() {
            format!("Item {}", item.id)
        } else {
            item.title.clone()
        };
        sources.push(source(
            format!("assessment_item:{}", item.id),
            label,
            "assessment_item",
            Some(item.id.to_string()),
            &line,
            serde_json::json!({ "assessment_id": item.assessment_id }),
        ));
    }
    let metadata = serde_json::json!({
        "activity_id": activity.as_ref().map(|a| a.id),
        "assessment_id": assessment.as_ref().map(|a| a.id),
        "item_count": items.len(),
    });
    Ok((
        ContextBundle {
            text: lines.join("\n"),
            sources,
        },
        metadata,
    ))
}

/// What the owner's submission read shows of the grade: `(released,
/// grading)` - scores only once released, the breakdown redacted by the
/// assessment's `review_visibility` (`None` = hidden).
async fn learner_grading(
    pool: &PgPool,
    submission: &SubmissionRow,
    assessment: Option<&ab_db::assessments::AssessmentRow>,
) -> Result<(bool, Option<serde_json::Value>)> {
    let released = matches!(
        release_state(pool, submission).await?,
        ReleaseState::Visible | ReleaseState::ReturnedForRevision
    );
    let grading = assessment
        .filter(|_| released)
        .and_then(|a| {
            redact_grading(
                GradingBreakdown::from_value(&submission.grading),
                a.review_visibility,
            )
        })
        .map(|g| g.to_value());
    Ok((released, grading))
}

/// The item body as the learner reads it: no answer key, rubric, reference
/// solution or hidden tests. An unparsable body is dropped rather than
/// shown.
fn learner_item_body(body: &serde_json::Value) -> serde_json::Value {
    serde_json::from_value::<ItemBody>(body.clone()).map_or(serde_json::Value::Null, |mut b| {
        b.redact_for_learner(0, false);
        serde_json::to_value(b).unwrap_or(serde_json::Value::Null)
    })
}

/// One file-submission attempt as context.
///
/// The activity, the teacher's instructions and rubric, the attempt's
/// status/grade/feedback, and its files - `texts[i]` is the read-back
/// content of `files[i]` when it is a text file (else the file is described
/// by name, type and size). `learner_view` hides the grade and feedback
/// until the attempt is published or returned (BUG-182).
pub async fn attempt_bundle(
    pool: &PgPool,
    attempt: &AttemptRow,
    files: &[FileRow],
    texts: &[Option<String>],
    learner_view: bool,
) -> Result<(ContextBundle, serde_json::Value)> {
    let released = !learner_view
        || matches!(
            attempt.status,
            FileAttemptStatus::Published | FileAttemptStatus::Returned
        );
    let file_submission =
        ab_db::file_submissions::get_file_submission(pool, attempt.file_submission_id).await?;
    let activity = match &file_submission {
        Some(f) => db::activity_context(pool, f.activity_id).await?,
        None => None,
    };
    let activity_label = activity.as_ref().map_or_else(
        || {
            file_submission
                .as_ref()
                .map_or_else(|| "unknown".to_owned(), |f| f.activity_id.to_string())
        },
        |a| a.name.clone(),
    );
    let mut lines = vec![
        format!("Activity: {activity_label}"),
        format!("File submission attempt UUID: {}", attempt.id),
        "Assessment type: file_submission".to_owned(),
        format!("Attempt number: {}", attempt.attempt_number),
        format!("Status: {}", attempt.status),
        format!(
            "Final score: {}",
            opt_num(attempt.final_score.filter(|_| released))
        ),
        format!("Late: {}", attempt.is_late),
    ];
    if released {
        lines.push(format!("Teacher feedback: {}", attempt.feedback));
        lines.push(format!(
            "Rubric scores: {}",
            json_snippet(&attempt.rubric_scores, 1800)
        ));
    }
    if let Some(f) = &file_submission {
        lines.push(format!("Instructions: {}", f.instructions));
        lines.push(format!("Rubric: {}", json_snippet(&f.rubric, 1800)));
    }
    let mut sources = vec![source(
        format!("file_submission_attempt:{}", attempt.id),
        format!("File submission attempt {}", attempt.id),
        "file_submission_attempt",
        Some(attempt.id.to_string()),
        &lines.join("\n"),
        serde_json::json!({
            "activity_id": activity.as_ref().map(|a| a.id),
            "student_user_id": attempt.user_id,
        }),
    )];
    if let Some(activity) = &activity {
        sources.push(source(
            format!("activity:{}", activity.id),
            activity.name.clone(),
            "activity",
            Some(activity.id.to_string()),
            &format!(
                "Activity: {}\nContent: {}",
                activity.name,
                json_snippet(&activity.content, 1800)
            ),
            serde_json::json!({ "activity_id": activity.id, "course_id": attempt.course_id }),
        ));
    }
    for (file, text) in files.iter().zip(texts) {
        let line = file_line(file, text.as_deref());
        lines.push(line.clone());
        sources.push(source(
            format!("file:{}", file.id),
            file.display_name.clone(),
            "file",
            Some(file.id.to_string()),
            &line,
            serde_json::json!({ "attempt_id": attempt.id, "content_type": file.content_type }),
        ));
    }
    let metadata = serde_json::json!({
        "activity_id": activity.as_ref().map(|a| a.id),
        "file_submission_id": attempt.file_submission_id,
        "file_count": files.len(),
    });
    Ok((
        ContextBundle {
            text: lines.join("\n"),
            sources,
        },
        metadata,
    ))
}

fn file_line(file: &FileRow, text: Option<&str>) -> String {
    let mut line = format!(
        "File: {} ({}, {} bytes)",
        file.display_name,
        file.content_type,
        file.size_bytes.unwrap_or(0)
    );
    if let Some(text) = text {
        line.push_str("\nContent:\n");
        line.push_str(text);
    }
    line
}

/// The «Question scores» line of a graded submission; `None` without an assessment or a grading to read.
async fn question_scores(
    pool: &PgPool,
    assessment: Option<&ab_db::assessments::AssessmentRow>,
    grading: Option<&serde_json::Value>,
) -> Result<Option<String>> {
    let (Some(assessment), Some(grading)) = (assessment, grading) else {
        return Ok(None);
    };
    let scales = ab_db::assessments::list_items(pool, assessment.id).await?;
    Ok(item_points_line(
        &GradingBreakdown::from_value(grading),
        &scales,
    ))
}

/// Each question's score as the teacher grades it, «0.5 of 1 points»: the grading JSON keeps an item's share of the
/// 100-point final score («7.14 of 14.29»), which the model quoted to teachers whose review form reads «(из 1)».
fn item_points_line(
    grading: &GradingBreakdown,
    items: &[ab_db::assessments::ItemRow],
) -> Option<String> {
    let points = |v: f64| format!("{}", (v * 100.0).round() / 100.0);
    let parts: Vec<String> = items
        .iter()
        .filter_map(|item| {
            let graded = grading.items.iter().find(|g| g.item_id == item.id)?;
            let earned = if graded.max_score > 0.0 {
                graded.score / graded.max_score * item.max_score
            } else {
                0.0
            };
            let waiting = if graded.needs_manual_review {
                " (awaiting the teacher's score)"
            } else {
                ""
            };
            Some(format!(
                "«{}»: {} of {} points{waiting}",
                item.title,
                points(earned),
                points(item.max_score)
            ))
        })
        .collect();
    (!parts.is_empty()).then(|| {
        format!(
            "Question scores: {} (each on the question's own scale: quote these, not the Grading shares of 100)",
            parts.join("; ")
        )
    })
}

fn opt_num(value: Option<f64>) -> String {
    value.map_or_else(|| "None".to_owned(), |v| v.to_string())
}

/// Legacy `validate_citations`: a citation is trusted when its id or
/// `source_uuid` names a supplied source.
#[derive(Debug, Clone, Default)]
pub struct CitationValidation {
    pub valid: Vec<serde_json::Value>,
    pub invalid: Vec<serde_json::Value>,
    pub source_count: usize,
}

impl CitationValidation {
    #[must_use]
    pub fn metadata(&self) -> serde_json::Value {
        serde_json::json!({
            "valid_count": self.valid.len(),
            "invalid_count": self.invalid.len(),
            "source_count": self.source_count,
            "invalid_citation_ids": self.invalid.iter().map(|c| {
                c.get("citation_id").or_else(|| c.get("source_uuid"))
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("unknown").to_owned()
            }).collect::<Vec<_>>(),
        })
    }
}

/// The labels of the context lines the model is fed (`Activity: name (type)`...): English and raw enums that must
/// not reach a learner when a citation quotes them.
const CONTEXT_LABELS: &[&str] = &[
    "Course:",
    "Chapter:",
    "Activity:",
    "Published:",
    "Details:",
    "Tags:",
    "Description:",
    "About:",
    "Learnings:",
    "Submission UUID:",
    "Assessment type:",
    "Final score:",
    "Auto score:",
    "Status:",
    "Question scores:",
    "Grading:",
];

/// Labels whose value is the course's own words (its description, about text, outcomes): quoted, the value stays and
/// only the English label goes, also where the model ran two of them into one line ("Description: X About: Y").
const CONTENT_LABELS: &[&str] = &[
    "Description:",
    "About:",
    "Learning outcomes:",
    "Learnings:",
    "Details:",
];

fn without_content_labels(line: &str) -> String {
    let mut text = line.to_owned();
    for label in CONTENT_LABELS {
        text = text.replace(&format!("{label} "), "");
        // An empty field quoted at the end ("... Learning outcomes:").
        if let Some(rest) = text.trim_end().strip_suffix(label) {
            text = rest.to_owned();
        }
    }
    text.trim().to_owned()
}

/// The report's own `citations` (what the teacher's «Источники» list shows) cleaned like the trusted evidence: the
/// stored artifact kept the model's raw excerpts («About: … Learning outcomes:»).
pub fn clean_report_citations(artifact: &mut serde_json::Value) {
    let Some(citations) = artifact
        .get_mut("citations")
        .and_then(serde_json::Value::as_array_mut)
    else {
        return;
    };
    for citation in citations {
        if let Some(excerpt) = citation.get_mut("excerpt").filter(|e| e.is_string()) {
            *excerpt = clean_excerpt(excerpt.as_str().unwrap_or_default()).into();
        }
    }
}

/// A citation's excerpt without the context headers it may quote.
///
/// The text after a `Content: ` label when there is one, else every line that is not a header (a header joined to
/// the quote with " ... " keeps the quote).
#[must_use]
/// The question-scores line (`item_points_line`), «"Q": 0 of 1 points (awaiting the teacher's score)»: English made
/// for the model, quoted back as a source it read to teachers as an untranslated line.
fn is_points_line(raw: &str) -> bool {
    raw.contains("(awaiting the teacher's score)")
        || raw.split("»: ").skip(1).any(|rest| {
            let mut words = rest.split_whitespace();
            matches!(
                (words.next(), words.next(), words.next(), words.next()),
                (Some(earned), Some("of"), Some(max), Some(unit))
                    if earned.parse::<f64>().is_ok() && max.parse::<f64>().is_ok() && unit.starts_with("point")
            )
        })
}

pub fn clean_excerpt(raw: &str) -> String {
    // An assessment's settings line (`settings_text`) is the model's English summary, not a quote for a reader:
    // the citation keeps its label only.
    if raw.contains("; pass mark ") || is_points_line(raw) {
        return String::new();
    }
    if let Some(at) = raw.rfind("Content: ") {
        let content = raw[at + "Content: ".len()..].trim();
        if !content.is_empty() {
            return content.to_owned();
        }
    }
    let kept: Vec<String> = raw
        .lines()
        .map(str::trim)
        .filter_map(|line| {
            if CONTENT_LABELS.iter().any(|label| line.starts_with(label)) {
                Some(without_content_labels(line))
            } else if CONTEXT_LABELS.iter().any(|label| line.starts_with(label)) {
                line.split_once(" ... ")
                    .or_else(|| line.split_once(" … "))
                    .map(|(_, quote)| quote.trim().to_owned())
            } else {
                Some(line.to_owned())
            }
        })
        .filter(|line| !line.is_empty())
        .collect();
    if kept.is_empty() {
        raw.trim().to_owned()
    } else {
        kept.join("\n")
    }
}

#[must_use]
pub fn validate_citations(
    citations: &[serde_json::Value],
    sources: &[ContextSource],
) -> CitationValidation {
    let mut result = CitationValidation {
        source_count: sources.len(),
        ..CitationValidation::default()
    };
    for citation in citations {
        let id = citation
            .get("citation_id")
            .and_then(serde_json::Value::as_str);
        let source_ref = citation
            .get("source_uuid")
            .and_then(serde_json::Value::as_str);
        let known = sources.iter().any(|s| {
            id.is_some_and(|i| i == s.citation_id)
                || (source_ref.is_some() && source_ref == s.source_ref.as_deref())
        });
        if known {
            let mut trusted = citation.clone();
            if let Some(excerpt) = trusted.get_mut("excerpt").filter(|e| e.is_string()) {
                *excerpt = clean_excerpt(excerpt.as_str().unwrap_or_default()).into();
            }
            result.valid.push(trusted);
        } else {
            let mut flagged = citation.clone();
            if let Some(map) = flagged.as_object_mut() {
                map.insert("validation_error".into(), "citation_not_in_context".into());
            }
            result.invalid.push(flagged);
        }
    }
    result
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn question_scores_are_on_each_questions_own_scale() {
        let item = |title: &str, max_score: f64| ab_db::assessments::ItemRow {
            id: ab_core::id::AssessmentItemId::new(),
            assessment_id: ab_core::id::AssessmentId::new(),
            position: 0,
            kind: ab_core::assessments::ItemKind::OpenText,
            title: title.into(),
            body: serde_json::Value::Null,
            max_score,
            section_label: None,
            difficulty: None,
            tags: vec![],
            outcome_ids: vec![],
            estimated_minutes: None,
        };
        let items = [item("Discriminant", 2.0), item("Explain", 1.0)];
        let grading = GradingBreakdown::from_value(&serde_json::json!({ "items": [
            { "item_id": items[0].id, "score": 0.0, "max_score": 28.57 },
            { "item_id": items[1].id, "score": 7.14, "max_score": 14.29, "needs_manual_review": true },
        ]}));
        let line = item_points_line(&grading, &items).unwrap();
        assert!(line.starts_with("Question scores: «Discriminant»: 0 of 2 points; «Explain»: 0.5 of 1 points (awaiting"), "{line}");
        assert!(item_points_line(&GradingBreakdown::default(), &items).is_none());
    }

    #[test]
    fn assessment_settings_read_as_words_not_json() {
        let row = db::AssessmentContextRow {
            id: ab_core::id::AssessmentId::new(),
            activity_id: ActivityId::new(),
            title: "Exam".into(),
            kind: "exam".into(),
            grading_mode: "auto_then_manual".into(),
            passing_score: 60.0,
            max_attempts: Some(1),
            time_limit_seconds: Some(3600),
            due_at: None,
        };
        assert_eq!(
            settings_text(&row),
            "exam (graded automatically, then reviewed by the teacher); pass mark 60%; 1 attempt(s); time limit 60 min; no deadline"
        );
    }

    #[test]
    fn citation_excerpts_drop_the_context_headers() {
        assert_eq!(
            clean_excerpt("Activity: Dynamic page (dynamic) ... «Welcome to the course.»"),
            "«Welcome to the course.»"
        );
        assert_eq!(
            clean_excerpt(
                "Chapter: Intro\nActivity: Page (dynamic)\nContent: Welcome to the course."
            ),
            "Welcome to the course."
        );
        assert_eq!(
            clean_excerpt("Activity: Page (dynamic)\nВведение в курс"),
            "Введение в курс"
        );
        assert_eq!(clean_excerpt("Plain quote"), "Plain quote");
        // The course's own words keep, their English labels go (OPEN-A-2), even run together on one line.
        assert_eq!(
            clean_excerpt("Description: Fixture course. About: One activity of every type."),
            "Fixture course. One activity of every type."
        );
        assert_eq!(
            clean_excerpt(
                "Course: Python
Learning outcomes: Циклы, функции"
            ),
            "Циклы, функции"
        );
        assert_eq!(
            clean_excerpt("About: Квадратные уравнения. Learning outcomes:"),
            "Квадратные уравнения."
        );
        assert_eq!(
            clean_excerpt("quiz (graded automatically); pass mark 60%; unlimited attempts"),
            ""
        );
        assert_eq!(
            clean_excerpt(
                "«Объясните решение»: 0 of 1 points (awaiting the teacher's score); «Анкета»: 0 of 1 points"
            ),
            ""
        );
        assert_eq!(clean_excerpt("«Корни»: 0.5 of 1 points"), "");
        assert_eq!(
            clean_excerpt("«Корни»: ответ 3 и 4"),
            "«Корни»: ответ 3 и 4"
        );
        let mut report = serde_json::json!({ "citations": [{ "excerpt": "Description: Курс. About: Для 9 класса." }] });
        clean_report_citations(&mut report);
        assert_eq!(report["citations"][0]["excerpt"], "Курс. Для 9 класса.");
        // Nothing but a header: kept rather than an empty quote.
        assert_eq!(
            clean_excerpt("Activity: Page (dynamic)"),
            "Activity: Page (dynamic)"
        );
        let valid = validate_citations(
            &[
                serde_json::json!({ "citation_id": "a", "excerpt": "Activity: P (dynamic) ... «Hi»" }),
            ],
            &[src("a", None)],
        );
        assert_eq!(valid.valid[0]["excerpt"], "«Hi»");
    }

    fn src(id: &str, source_ref: Option<&str>) -> ContextSource {
        ContextSource {
            citation_id: id.into(),
            label: "L".into(),
            source_type: "activity".into(),
            source_ref: source_ref.map(str::to_owned),
            excerpt: "e".into(),
            metadata: serde_json::json!({}),
        }
    }

    #[test]
    fn render_lists_sources_after_the_text() {
        let bundle = ContextBundle {
            text: "Course: X".into(),
            sources: vec![src("activity:1", None)],
        };
        let rendered = bundle.render();
        assert!(rendered.starts_with("Course: X\n\nCitation sources:"));
        assert!(rendered.contains("[activity:1] activity | untracked | L"));
        assert!(rendered.ends_with("Excerpt: e"));
        assert_eq!(ContextBundle::default().render(), "");
    }

    #[test]
    fn fitted_keeps_whole_leading_sources_that_fit() {
        let bundle = ContextBundle {
            text: "Course: X".into(),
            sources: (0..40)
                .map(|i| ContextSource {
                    excerpt: "x".repeat(1000),
                    ..src(&format!("activity:{i}"), None)
                })
                .collect(),
        };
        assert!(bundle.render().chars().count() > CONTEXT_CLIP_LIMIT);
        let (rendered, kept) = bundle.clone().fitted(|_| true);
        assert!(
            rendered.chars().count() <= CONTEXT_CLIP_LIMIT,
            "{}",
            rendered.len()
        );
        assert!(!kept.is_empty() && kept.len() < 40);
        assert_eq!(rendered, render_parts("Course: X", &kept));
        let (small, fewer) = bundle.fitted(|text| text.chars().count() <= 3000);
        assert!(small.chars().count() <= 3000 && fewer.len() < kept.len());
    }

    #[test]
    fn citations_are_trusted_by_id_or_source_ref() {
        let sources = [src("activity:1", Some("a1")), src("course:9", Some("c9"))];
        let citations = vec![
            serde_json::json!({ "citation_id": "activity:1" }),
            serde_json::json!({ "citation_id": "made-up", "source_uuid": "c9" }),
            serde_json::json!({ "citation_id": "ghost" }),
        ];
        let validation = validate_citations(&citations, &sources);
        assert_eq!(validation.valid.len(), 2);
        assert_eq!(validation.invalid.len(), 1);
        assert_eq!(
            validation.invalid[0]["validation_error"],
            "citation_not_in_context"
        );
        assert_eq!(validation.metadata()["invalid_citation_ids"][0], "ghost");
        assert_eq!(validation.metadata()["source_count"], 2);
    }

    #[test]
    fn snippets_cut_by_characters() {
        let value = serde_json::json!({ "k": "яяяяяяяяяяяяяяяя" });
        assert_eq!(json_snippet(&value, 8).chars().count(), 8);
    }
}
