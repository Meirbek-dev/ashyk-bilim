//! CSV exports (legacy `services/analytics/exports.py`).
//!
//! RFC 4180, CRLF, UTF-8 with BOM; headers and enum cells follow
//! `Accept-Language` through the shared [`CsvLanguage`] (UX-114); the
//! at-risk `reason_codes` / `recommended_action` cells carry the same labels
//! the watchlist shows (UX-123). Other diagnostic codes (`signals`,
//! `outlier_reason_codes`) stay stable identifiers.

use super::assessments::build_assessment_rows;
use super::context::{AnalyticsContext, is_reviewable, progress_snapshots, submitted_at};
use super::filters::AnalyticsFilters;
use super::risk::build_risk_rows;
use super::types::RiskLevel;
use crate::csv::csv_row;
use crate::grading::teacher::CsvLanguage;

pub const MAX_EXPORT_ROWS: usize = 50_000;

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

/// The watchlist's label for an at-risk reason or recommended action
/// (`labels.reasonCode.*` / `labels.recommendedAction.*` in the web
/// catalogs); an unknown code is written as-is.
fn code_label(language: CsvLanguage, code: &str) -> String {
    use CsvLanguage as L;
    let label = match (language, code) {
        (L::Ru, "inactive_7d") => "Нет активности 7 дней",
        (L::Ru, "low_progress") => "Низкий прогресс",
        (L::Ru, "repeated_failures") => "Повторяющиеся неудачи",
        (L::Ru, "missing_required_assessments") => "Пропущены обязательные оценивания",
        (L::Ru, "grading_block") => "Ожидает проверки",
        (L::Ru, "review_submissions_first") => "Сначала проверить работы",
        (L::Ru, "contact_learner_this_week") => "Связаться с учащимся на этой неделе",
        (L::Ru, "offer_targeted_help") => "Предложить адресную помощь",
        (L::Ru, "remind_missing_work") => "Напомнить о пропущенных работах",
        (L::Ru, "schedule_pace_meeting") => "Назначить встречу о темпе",
        (L::Ru, "send_personal_message") => "Отправить личное сообщение",
        (L::Kk, "inactive_7d") => "7 күн белсенділік жоқ",
        (L::Kk, "low_progress") => "Төмен прогресс",
        (L::Kk, "repeated_failures") => "Қайталанатын сәтсіздіктер",
        (L::Kk, "missing_required_assessments") => "Міндетті бағалаулар өтпеген",
        (L::Kk, "grading_block") => "Бағалауды күтіп тұр",
        (L::Kk, "review_submissions_first") => "Алдымен жұмыстарды тексеру",
        (L::Kk, "contact_learner_this_week") => "Осы аптада оқушымен байланысу",
        (L::Kk, "offer_targeted_help") => "Мақсатты көмек ұсыну",
        (L::Kk, "remind_missing_work") => "Өткізілген жұмыстар туралы еске салу",
        (L::Kk, "schedule_pace_meeting") => "Қарқын туралы кездесу тағайындау",
        (L::Kk, "send_personal_message") => "Жеке хабарлама жіберу",
        (L::En, "inactive_7d") => "Inactive for 7 days",
        (L::En, "low_progress") => "Low progress",
        (L::En, "repeated_failures") => "Repeated failures",
        (L::En, "missing_required_assessments") => "Missing required assessments",
        (L::En, "grading_block") => "Waiting on grading",
        (L::En, "review_submissions_first") => "Review submissions first",
        (L::En, "contact_learner_this_week") => "Contact the learner this week",
        (L::En, "offer_targeted_help") => "Offer targeted help",
        (L::En, "remind_missing_work") => "Remind about missing work",
        (L::En, "schedule_pace_meeting") => "Schedule a pace meeting",
        (L::En, "send_personal_message") => "Send a personal message",
        (_, other) => other,
    };
    label.to_owned()
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
                r.reason_codes
                    .iter()
                    .map(|c| code_label(language, c))
                    .collect::<Vec<_>>()
                    .join("; "),
                code_label(language, r.recommended_action),
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
        // UX-123: reason / action cells are labels, unknown codes pass through.
        assert_eq!(
            code_label(CsvLanguage::Ru, "low_progress"),
            "Низкий прогресс"
        );
        assert_eq!(
            code_label(CsvLanguage::En, "schedule_pace_meeting"),
            "Schedule a pace meeting"
        );
        assert_eq!(code_label(CsvLanguage::Kk, "new_code"), "new_code");
    }
}
