//! CSV exports (legacy `services/analytics/exports.py`).
//!
//! RFC 4180, CRLF, UTF-8 with BOM; headers and enum cells follow
//! `Accept-Language` through the shared [`CsvLanguage`] (UX-114).
//! Diagnostic codes (`reason_codes`, `recommended_action`, `signals`) stay
//! stable identifiers.

use super::assessments::build_assessment_rows;
use super::context::{AnalyticsContext, is_reviewable, progress_snapshots, submitted_at};
use super::filters::AnalyticsFilters;
use super::risk::build_risk_rows;
use super::types::RiskLevel;
use crate::grading::teacher::CsvLanguage;

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
    let mut out = String::from("\u{feff}");
    out.push_str(&csv_row(
        &header.iter().map(|h| (*h).to_owned()).collect::<Vec<_>>(),
    ));
    for row in rows.take(MAX_EXPORT_ROWS) {
        out.push_str(&csv_row(&row));
    }
    out
}

const fn risk_level(language: CsvLanguage, level: RiskLevel) -> &'static str {
    use CsvLanguage as L;
    match (language, level) {
        (L::Ru, RiskLevel::Low) => "Низкий",
        (L::Ru, RiskLevel::Medium) => "Средний",
        (L::Ru, RiskLevel::High) => "Высокий",
        (L::Kk, RiskLevel::Low) => "Төмен",
        (L::Kk, RiskLevel::Medium) => "Орташа",
        (L::Kk, RiskLevel::High) => "Жоғары",
        (L::En, RiskLevel::Low) => "Low",
        (L::En, RiskLevel::Medium) => "Medium",
        (L::En, RiskLevel::High) => "High",
    }
}

const fn at_risk_header(language: CsvLanguage) -> [&'static str; 10] {
    match language {
        CsvLanguage::Ru => [
            "ID учащегося",
            "Учащийся",
            "ID курса",
            "Курс",
            "Прогресс, %",
            "Дней без активности",
            "Балл риска",
            "Уровень риска",
            "Причины",
            "Рекомендуемое действие",
        ],
        CsvLanguage::Kk => [
            "Білім алушы ID",
            "Білім алушы",
            "Курс ID",
            "Курс",
            "Прогресс, %",
            "Белсенділіксіз күндер",
            "Тәуекел баллы",
            "Тәуекел деңгейі",
            "Себептер",
            "Ұсынылатын әрекет",
        ],
        CsvLanguage::En => [
            "Learner id",
            "Learner",
            "Course id",
            "Course",
            "Progress, %",
            "Days inactive",
            "Risk score",
            "Risk level",
            "Reasons",
            "Recommended action",
        ],
    }
}

const fn grading_backlog_header(language: CsvLanguage) -> [&'static str; 9] {
    match language {
        CsvLanguage::Ru => [
            "ID учащегося",
            "Логин",
            "ID курса",
            "Курс",
            "ID оценивания",
            "Тип оценивания",
            "Название",
            "Статус",
            "Отправлено",
        ],
        CsvLanguage::Kk => [
            "Білім алушы ID",
            "Логин",
            "Курс ID",
            "Курс",
            "Бағалау ID",
            "Бағалау түрі",
            "Атауы",
            "Мәртебе",
            "Тапсырылған",
        ],
        CsvLanguage::En => [
            "Learner id",
            "Username",
            "Course id",
            "Course",
            "Assessment id",
            "Assessment type",
            "Title",
            "Status",
            "Submitted at",
        ],
    }
}

const fn course_progress_header(language: CsvLanguage) -> [&'static str; 9] {
    match language {
        CsvLanguage::Ru => [
            "ID курса",
            "Курс",
            "ID учащегося",
            "Логин",
            "Прогресс, %",
            "Пройдено шагов",
            "Всего шагов",
            "Последняя активность",
            "Сертификат",
        ],
        CsvLanguage::Kk => [
            "Курс ID",
            "Курс",
            "Білім алушы ID",
            "Логин",
            "Прогресс, %",
            "Өтілген қадамдар",
            "Барлық қадамдар",
            "Соңғы белсенділік",
            "Сертификат",
        ],
        CsvLanguage::En => [
            "Course id",
            "Course",
            "Learner id",
            "Username",
            "Progress, %",
            "Completed steps",
            "Total steps",
            "Last activity",
            "Certificate",
        ],
    }
}

const fn assessment_outcomes_header(language: CsvLanguage) -> [&'static str; 10] {
    match language {
        CsvLanguage::Ru => [
            "Тип оценивания",
            "ID оценивания",
            "ID курса",
            "Курс",
            "Название",
            "Доля отправок, %",
            "Доля успешных, %",
            "Медианный балл",
            "Сложность",
            "Сигналы",
        ],
        CsvLanguage::Kk => [
            "Бағалау түрі",
            "Бағалау ID",
            "Курс ID",
            "Курс",
            "Атауы",
            "Тапсыру үлесі, %",
            "Өту үлесі, %",
            "Медианалық балл",
            "Күрделілік",
            "Сигналдар",
        ],
        CsvLanguage::En => [
            "Assessment type",
            "Assessment id",
            "Course id",
            "Course",
            "Title",
            "Submission rate, %",
            "Pass rate, %",
            "Median score",
            "Difficulty",
            "Signals",
        ],
    }
}

#[must_use]
pub fn at_risk_csv(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
    language: CsvLanguage,
) -> String {
    let rows = build_risk_rows(ctx, filters);
    document(
        &at_risk_header(language),
        rows.into_iter().map(|r| {
            vec![
                r.user_id.to_string(),
                r.user_display_name,
                r.course_id.to_string(),
                r.course_name,
                r.progress_pct.to_string(),
                opt(r.days_since_last_activity),
                r.risk_score.to_string(),
                risk_level(language, r.risk_level).to_owned(),
                r.reason_codes.join(";"),
                r.recommended_action.to_owned(),
            ]
        }),
    )
}

#[must_use]
pub fn grading_backlog_csv(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
    language: CsvLanguage,
) -> String {
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
                language.assessment_kind(a.kind).to_owned(),
                a.title.clone(),
                language.submission_status(s.status).to_owned(),
                iso8601(submitted_at(s)),
            ])
        });
    document(&grading_backlog_header(language), rows)
}

#[must_use]
pub fn course_progress_csv(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
    language: CsvLanguage,
) -> String {
    let allowed = ctx.cohort_user_ids(&filters.cohort_ids);
    let snapshots = progress_snapshots(ctx, allowed.as_ref());
    document(
        &course_progress_header(language),
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
                language.yes_no(s.has_certificate).to_owned(),
            ]
        }),
    )
}

#[must_use]
pub fn assessment_outcomes_csv(
    ctx: &AnalyticsContext,
    filters: &AnalyticsFilters,
    language: CsvLanguage,
) -> String {
    document(
        &assessment_outcomes_header(language),
        build_assessment_rows(ctx, filters).into_iter().map(|r| {
            vec![
                language.assessment_kind(r.assessment_type).to_owned(),
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
        assert_eq!(doc, "\u{feff}h1,h2\r\n1,2\r\n");
    }

    #[test]
    fn enum_cells_follow_the_language() {
        assert_eq!(risk_level(CsvLanguage::Ru, RiskLevel::Low), "Низкий");
        assert_eq!(risk_level(CsvLanguage::Kk, RiskLevel::High), "Жоғары");
        assert_eq!(CsvLanguage::En.yes_no(true), "Yes");
        assert_eq!(CsvLanguage::Ru.yes_no(false), "Нет");
        assert_eq!(at_risk_header(CsvLanguage::Kk)[7], "Тәуекел деңгейі");
    }
}
