//! Context assembly for the agents (legacy `services/ai/context/*`): the
//! course outline with activity content and assessment items, or one
//! submission with its answers and grading, rendered as text plus a list of
//! citable sources. Citations the model returns are checked against those
//! sources; unknown ones are dropped from the evidence.

use ab_core::Result;
use ab_core::id::{ActivityId, CourseId};
use ab_db::ai as db;
use ab_db::submissions::SubmissionRow;
use sqlx::PgPool;

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
        if self.sources.is_empty() {
            return self.text.clone();
        }
        let mut lines = vec![
            String::new(),
            "Citation sources:".to_owned(),
            "Use only these authoritative sources for the selected scope.".to_owned(),
        ];
        for source in &self.sources {
            lines.push(format!(
                "[{}] {} | {} | {}",
                source.citation_id,
                source.source_type,
                source.source_ref.as_deref().unwrap_or("untracked"),
                source.label
            ));
            lines.push(format!("Excerpt: {}", source.excerpt));
        }
        format!("{}\n{}", self.text, lines.join("\n"))
    }
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

    let lines = vec![
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
        let Some(assessment) = assessments.iter().find(|a| a.activity_id == activity.id) else {
            continue;
        };
        let settings = serde_json::json!({
            "kind": assessment.kind,
            "grading_mode": assessment.grading_mode,
            "passing_score": assessment.passing_score,
            "max_attempts": assessment.max_attempts,
            "time_limit_seconds": assessment.time_limit_seconds,
            "due_at": assessment.due_at,
        });
        let assessment_lines = [
            format!("Assessment: {}", assessment.title),
            format!("Assessment settings: {}", json_snippet(&settings, 1800)),
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
    }
    Ok(ContextBundle {
        text: lines.join("\n"),
        sources,
    })
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
pub async fn submission_bundle(
    pool: &PgPool,
    submission: &SubmissionRow,
) -> Result<(ContextBundle, serde_json::Value)> {
    let assessment = ab_db::assessments::get_assessment(pool, submission.assessment_id).await?;
    let activity = match &assessment {
        Some(a) => db::activity_context(pool, a.activity_id).await?,
        None => None,
    };
    let items = match &assessment {
        Some(a) => db::items_context(pool, a.id).await?,
        None => Vec::new(),
    };
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
        format!("Final score: {}", opt_num(submission.final_score)),
        format!("Auto score: {}", opt_num(submission.auto_score)),
        format!("Status: {}", submission.status),
        format!("Answers: {}", json_snippet(&submission.answers, 1800)),
        format!("Grading: {}", json_snippet(&submission.grading, 1800)),
    ];
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
            result.valid.push(citation.clone());
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
