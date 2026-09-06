//! CSV exports (legacy `services/analytics/exports.py`): RFC 4180, CRLF,
//! English snake_case headers and code values (the legacy emitted Russian
//! headers and labels; the client localises codes).

use super::assessments::build_assessment_rows;
use super::context::{AnalyticsContext, is_reviewable, progress_snapshots, submitted_at};
use super::filters::AnalyticsFilters;
use super::risk::build_risk_rows;

pub const MAX_EXPORT_ROWS: usize = 50_000;

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

fn opt<T: ToString>(v: Option<T>) -> String {
    v.map(|v| v.to_string()).unwrap_or_default()
}

fn iso8601(unix: i64) -> String {
    jiff::Timestamp::from_second(unix).map_or_else(|_| unix.to_string(), |t| t.to_string())
}

fn document(header: &[&str], rows: impl Iterator<Item = Vec<String>>) -> String {
    let mut out = csv_row(&header.iter().map(|h| (*h).to_owned()).collect::<Vec<_>>());
    for row in rows.take(MAX_EXPORT_ROWS) {
        out.push_str(&csv_row(&row));
    }
    out
}

#[must_use]
pub fn at_risk_csv(ctx: &AnalyticsContext, filters: &AnalyticsFilters) -> String {
    let rows = build_risk_rows(ctx, filters);
    document(
        &[
            "user_id",
            "user_display_name",
            "course_id",
            "course_name",
            "progress_pct",
            "days_since_last_activity",
            "risk_score",
            "risk_level",
            "reason_codes",
            "recommended_action",
        ],
        rows.into_iter().map(|r| {
            vec![
                r.user_id.to_string(),
                r.user_display_name,
                r.course_id.to_string(),
                r.course_name,
                r.progress_pct.to_string(),
                opt(r.days_since_last_activity),
                r.risk_score.to_string(),
                r.risk_level.as_str().to_owned(),
                r.reason_codes.join(";"),
                r.recommended_action.to_owned(),
            ]
        }),
    )
}

#[must_use]
pub fn grading_backlog_csv(ctx: &AnalyticsContext, filters: &AnalyticsFilters) -> String {
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let rows = ctx
        .submissions
        .iter()
        .filter(|s| is_reviewable(s))
        .filter(|s| allowed.as_ref().is_none_or(|set| set.contains(&s.user_id)))
        .filter_map(|s| {
            let a = ctx.assessment(s.assessment_id)?;
            Some(vec![
                s.user_id.to_string(),
                ctx.username(s.user_id),
                a.course_id.to_string(),
                ctx.course_name(a.course_id),
                a.id.to_string(),
                a.kind.as_str().to_owned(),
                a.title.clone(),
                s.status.as_str().to_owned(),
                iso8601(submitted_at(s)),
            ])
        });
    document(
        &[
            "user_id",
            "username",
            "course_id",
            "course_name",
            "assessment_id",
            "assessment_type",
            "assessment_title",
            "status",
            "submitted_at",
        ],
        rows,
    )
}

#[must_use]
pub fn course_progress_csv(ctx: &AnalyticsContext, filters: &AnalyticsFilters) -> String {
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let snapshots = progress_snapshots(ctx, allowed.as_ref());
    document(
        &[
            "course_id",
            "course_name",
            "user_id",
            "username",
            "progress_pct",
            "completed_steps",
            "total_steps",
            "last_activity_at",
            "has_certificate",
        ],
        snapshots.values().map(|s| {
            vec![
                s.course_id.to_string(),
                ctx.course_name(s.course_id),
                s.user_id.to_string(),
                ctx.username(s.user_id),
                s.progress_pct.to_string(),
                s.completed_steps.to_string(),
                s.total_steps.to_string(),
                s.last_activity_at.map(iso8601).unwrap_or_default(),
                if s.has_certificate { "yes" } else { "no" }.to_owned(),
            ]
        }),
    )
}

#[must_use]
pub fn assessment_outcomes_csv(ctx: &AnalyticsContext, filters: &AnalyticsFilters) -> String {
    document(
        &[
            "assessment_type",
            "assessment_id",
            "course_id",
            "course_name",
            "title",
            "submission_rate",
            "pass_rate",
            "median_score",
            "difficulty_score",
            "signals",
        ],
        build_assessment_rows(ctx, filters).into_iter().map(|r| {
            vec![
                r.assessment_type.as_str().to_owned(),
                r.assessment_id.to_string(),
                r.course_id.to_string(),
                r.course_name,
                r.title,
                opt(r.submission_rate),
                opt(r.pass_rate),
                opt(r.median_score),
                opt(r.difficulty_score),
                r.outlier_reason_codes.join(";"),
            ]
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fields_are_quoted_per_rfc_4180() {
        assert_eq!(csv_field("plain"), "plain");
        assert_eq!(csv_field("a,b"), "\"a,b\"");
        assert_eq!(csv_field("say \"hi\""), "\"say \"\"hi\"\"\"");
        assert_eq!(csv_row(&["a".into(), "b\nc".into()]), "a,\"b\nc\"\r\n");
        let doc = document(&["h1", "h2"], std::iter::once(vec!["1".into(), "2".into()]));
        assert_eq!(doc, "h1,h2\r\n1,2\r\n");
    }
}
