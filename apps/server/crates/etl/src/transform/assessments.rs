//! Assessment transforms (MIGRATION §2.3): the legacy `assessment` +
//! `assessment_policy` pair folds into one v2 row (DECISIONS 2026-09-05,
//! P3.1) with every `settings_json` / `anti_cheat_json` / `late_policy_json`
//! scalar as a CHECKed column; item bodies re-parse through the v2
//! `ItemBody` enum (strict — a bad body is a hard error with the row id).

use ab_domain::assessments::items::ItemBody;
use serde_json::{Map, Value};

use crate::legacy;
use crate::transform::common::{
    array, bool_setting, float_setting, int_setting, object, snake, str_setting,
};

/// Epoch seconds from an ISO-8601 string (legacy JSON timestamps).
#[must_use]
pub fn iso_epoch(value: Option<&Value>) -> Option<f64> {
    let s = value?.as_str()?.trim();
    if s.is_empty() {
        return None;
    }
    // "2026-06-29T11:28:23.141216+00:00", "2026-06-29T11:28:29.849759Z" and
    // the naive "2026-06-29 11:28:23" (assumed UTC, like Postgres did).
    if let Ok(ts) = s.parse::<jiff::Timestamp>() {
        return Some(ts.as_second() as f64 + f64::from(ts.subsec_nanosecond()) / 1e9);
    }
    let naive = s.replace(' ', "T");
    naive
        .parse::<jiff::civil::DateTime>()
        .ok()
        .and_then(|dt| dt.to_zoned(jiff::tz::TimeZone::UTC).ok())
        .map(|z| z.timestamp().as_second() as f64)
}

#[derive(Debug, Clone, PartialEq)]
pub struct LatePolicy {
    pub kind: &'static str,
    pub percent_per_day: Option<f64>,
    pub max_days: Option<i32>,
    pub cutoff_at: Option<f64>,
}

impl LatePolicy {
    pub const NONE: Self = Self {
        kind: "none",
        percent_per_day: None,
        max_days: None,
        cutoff_at: None,
    };
}

/// `late_policy_json` (`{kind: NONE|PENALTY|CUTOFF, …}`, `{}` = none).
/// A malformed penalty/cutoff (missing its scalars) degrades to `none` and
/// is reported by the caller.
#[must_use]
pub fn late_policy(value: Option<&Value>) -> (LatePolicy, Option<String>) {
    let m = object(value);
    match str_setting(&m, "kind").map(str::to_ascii_uppercase).as_deref() {
        None | Some("NONE") => (LatePolicy::NONE, None),
        Some("PENALTY") => {
            let pct = float_setting(&m, "percent_per_day");
            let days = int_setting(&m, "max_days").and_then(|d| i32::try_from(d).ok());
            match (pct, days) {
                (Some(p), Some(d)) if (0.0..=100.0).contains(&p) && d >= 1 => (
                    LatePolicy {
                        kind: "penalty",
                        percent_per_day: Some(p),
                        max_days: Some(d),
                        cutoff_at: None,
                    },
                    None,
                ),
                _ => (
                    LatePolicy::NONE,
                    Some("late policy PENALTY without valid percent_per_day/max_days → none".into()),
                ),
            }
        }
        Some("CUTOFF") => match iso_epoch(m.get("cutoff_at")) {
            Some(at) => (
                LatePolicy {
                    kind: "cutoff",
                    percent_per_day: None,
                    max_days: None,
                    cutoff_at: Some(at),
                },
                None,
            ),
            None => (
                LatePolicy::NONE,
                Some("late policy CUTOFF without a parsable cutoff_at → none".into()),
            ),
        },
        Some(other) => (
            LatePolicy::NONE,
            Some(format!("unknown late policy kind '{other}' → none")),
        ),
    }
}

/// Port of `_review_visibility` (services/assessments/_shared.py).
#[must_use]
pub fn review_visibility(settings: &Map<String, Value>) -> &'static str {
    match str_setting(settings, "review_visibility") {
        Some("NONE") => return "none",
        Some("SCORE_ONLY") => return "score_only",
        Some("FULL") => return "full",
        _ => {}
    }
    if matches!(settings.get("allow_result_review"), Some(Value::Bool(false))) {
        return "none";
    }
    if matches!(settings.get("show_correct_answers"), Some(Value::Bool(false))) {
        return "score_only";
    }
    "full"
}

/// The folded v2 `assessments` row (everything except ids and timestamps).
#[derive(Debug, Clone, PartialEq)]
pub struct AssessmentFold {
    pub kind: String,
    pub lifecycle: String,
    pub grading_type: String,
    pub grading_mode: String,
    pub grade_release_mode: String,
    pub completion_rule: String,
    pub passing_score: f64,
    pub max_attempts: Option<i32>,
    pub time_limit_seconds: Option<i32>,
    pub due_at: Option<f64>,
    pub allow_late: bool,
    pub late: LatePolicy,
    pub required: bool,
    pub review_visibility: &'static str,
    pub randomize_questions: bool,
    pub randomize_options: bool,
    pub partial_credit: bool,
    pub negative_marking_percent: f64,
    pub grace_period_minutes: i32,
    pub copy_paste_protection: bool,
    pub tab_switch_detection: bool,
    pub devtools_detection: bool,
    pub right_click_disabled: bool,
    pub fullscreen_required: bool,
    pub violation_threshold: i32,
    pub attempt_penalty_percent: f64,
    pub policy_version: i32,
    /// Legacy settings keys that no v2 column carries (reported once).
    pub dropped_setting_keys: Vec<String>,
    pub notes: Vec<String>,
}

const KNOWN_SETTING_KEYS: &[&str] = &[
    "required",
    "review_visibility",
    "allow_result_review",
    "show_correct_answers",
    "randomize_questions",
    "shuffle_questions",
    "randomize_options",
    "shuffle_answers",
    "partial_credit",
    "negative_marking_percent",
    "grace_period_minutes",
    "max_score_penalty_per_attempt",
    // duplicates of real policy columns written by the legacy exam migration
    "time_limit",
    "attempt_limit",
    "passing_score",
    "kind",
    // anti-cheat keys the legacy also mirrored into settings_json
    "copy_paste_protection",
    "tab_switch_detection",
    "devtools_detection",
    "right_click_disable",
    "right_click_disabled",
    "fullscreen_enforcement",
    "fullscreen_required",
    "violation_threshold",
];

const VALID_GRADING_MODES: [&str; 3] = ["auto", "manual", "auto_then_manual"];
const VALID_RELEASE_MODES: [&str; 2] = ["immediate", "batch"];
const VALID_COMPLETION_RULES: [&str; 5] =
    ["viewed", "submitted", "graded", "passed", "teacher_verified"];
const VALID_LIFECYCLES: [&str; 4] = ["draft", "scheduled", "published", "archived"];

fn checked<'a>(value: &str, allowed: &[&'a str], fallback: &'a str, what: &str, notes: &mut Vec<String>) -> String {
    let v = snake(value, None);
    if allowed.contains(&v.as_str()) {
        v
    } else {
        notes.push(format!("{what} '{value}' unknown → '{fallback}'"));
        fallback.to_owned()
    }
}

/// Fold `assessment` + its `assessment_policy` (+ the activity's settings
/// blob for the attempt-penalty knob) into v2 columns. `None` policy = the
/// legacy lazy-creation defaults (`AssessmentCanonicalPolicy()`).
#[must_use]
pub fn fold(
    a: &legacy::Assessment,
    p: Option<&legacy::AssessmentPolicy>,
    activity_settings: &Map<String, Value>,
) -> AssessmentFold {
    let mut notes = Vec::new();
    let settings = p.map(|p| object(p.settings_json.as_ref())).unwrap_or_default();
    let anti = p.map(|p| object(p.anti_cheat_json.as_ref())).unwrap_or_default();
    let (late, late_note) = late_policy(p.and_then(|p| p.late_policy_json.as_ref()));
    notes.extend(late_note);
    if p.is_none() {
        notes.push("no assessment_policy row: legacy defaults applied".into());
    }

    let kind = match snake(&a.kind, None).as_str() {
        "quiz" => "quiz",
        "exam" => "exam",
        "code_challenge" => "code_challenge",
        other => {
            notes.push(format!("kind '{other}' unknown → exam"));
            "exam"
        }
    }
    .to_owned();
    let lifecycle = checked(&a.lifecycle, &VALID_LIFECYCLES, "draft", "lifecycle", &mut notes);
    let grading_type = if snake(&a.grading_type, None) == "numeric" {
        "numeric"
    } else {
        "percentage"
    }
    .to_owned();

    let attempt_penalty_percent = float_setting(activity_settings, "max_score_penalty_per_attempt")
        .or_else(|| float_setting(&settings, "max_score_penalty_per_attempt"))
        .filter(|v| (0.0..=100.0).contains(v))
        .unwrap_or(0.0);

    let mut dropped_setting_keys: Vec<String> = settings
        .keys()
        .filter(|k| !KNOWN_SETTING_KEYS.contains(&k.as_str()))
        .cloned()
        .collect();
    dropped_setting_keys.sort();

    AssessmentFold {
        kind,
        lifecycle,
        grading_type,
        grading_mode: p.map_or_else(
            || "auto".to_owned(),
            |p| checked(&p.grading_mode, &VALID_GRADING_MODES, "auto", "grading_mode", &mut notes),
        ),
        grade_release_mode: p.map_or_else(
            || "immediate".to_owned(),
            |p| checked(&p.grade_release_mode, &VALID_RELEASE_MODES, "immediate", "grade_release_mode", &mut notes),
        ),
        completion_rule: p.map_or_else(
            || "graded".to_owned(),
            |p| checked(&p.completion_rule, &VALID_COMPLETION_RULES, "graded", "completion_rule", &mut notes),
        ),
        passing_score: p.map_or(60.0, |p| p.passing_score.clamp(0.0, 100.0)),
        max_attempts: p.and_then(|p| p.max_attempts).filter(|n| *n >= 1),
        time_limit_seconds: p.and_then(|p| p.time_limit_seconds).filter(|n| *n >= 1),
        due_at: p.and_then(|p| p.due_at),
        allow_late: p.is_none_or(|p| p.allow_late),
        late,
        required: bool_setting(&settings, &["required"]),
        review_visibility: review_visibility(&settings),
        randomize_questions: bool_setting(&settings, &["randomize_questions", "shuffle_questions"]),
        randomize_options: bool_setting(&settings, &["randomize_options", "shuffle_answers"]),
        // The legacy grader never read `partial_credit` (it always gave
        // choice partial credit); v2 grades with the column, so the v2
        // default `true` preserves legacy scoring unless explicitly false.
        partial_credit: !matches!(settings.get("partial_credit"), Some(Value::Bool(false))),
        negative_marking_percent: float_setting(&settings, "negative_marking_percent")
            .filter(|v| (0.0..=100.0).contains(v))
            .unwrap_or(0.0),
        grace_period_minutes: int_setting(&settings, "grace_period_minutes")
            .and_then(|v| i32::try_from(v).ok())
            .filter(|v| *v >= 0)
            .unwrap_or(0),
        copy_paste_protection: bool_setting(&anti, &["copy_paste_protection"]),
        tab_switch_detection: bool_setting(&anti, &["tab_switch_detection"]),
        devtools_detection: bool_setting(&anti, &["devtools_detection"]),
        right_click_disabled: bool_setting(&anti, &["right_click_disabled", "right_click_disable"]),
        fullscreen_required: bool_setting(&anti, &["fullscreen_required", "fullscreen_enforcement"]),
        violation_threshold: int_setting(&anti, "violation_threshold")
            .and_then(|v| i32::try_from(v).ok())
            .filter(|v| *v >= 1)
            .unwrap_or(3),
        attempt_penalty_percent,
        policy_version: p.map_or(1, |p| p.policy_version.max(1)),
        dropped_setting_keys,
        notes,
    }
}

/// `assessment_access_policy.mode` → v2 `access_mode`.
#[must_use]
pub fn access_mode(raw: Option<&str>) -> &'static str {
    match raw.map(str::to_ascii_uppercase).as_deref() {
        Some("RESTRICTED") => "restricted",
        _ => "all_course_learners",
    }
}

/// v2 `assessment_items.kind` from the legacy `ItemKind` StrEnum.
#[must_use]
pub fn item_kind(raw: &str) -> Option<&'static str> {
    match snake(raw, None).as_str() {
        "choice" => Some("choice"),
        "open_text" => Some("open_text"),
        "form" => Some("form"),
        "code" => Some("code"),
        "matching" => Some("matching"),
        _ => None,
    }
}

/// Lower-case the enum-valued strings the legacy wrote in UPPER_SNAKE so the
/// body parses through the v2 `ItemBody` (`kind`, `variant`,
/// `scoring_strategy`, `tests[].match_mode`).
fn lowercase_enum_fields(body: &mut Map<String, Value>) {
    for key in ["kind", "variant", "scoring_strategy"] {
        if let Some(Value::String(s)) = body.get_mut(key) {
            *s = s.to_ascii_lowercase();
        }
    }
    if let Some(Value::Array(tests)) = body.get_mut("tests") {
        for t in tests.iter_mut() {
            if let Some(Value::String(s)) = t.get_mut("match_mode") {
                *s = s.to_ascii_lowercase();
            }
        }
    }
    if let Some(Value::Array(fields)) = body.get_mut("fields") {
        for f in fields.iter_mut() {
            if let Some(Value::String(s)) = f.get_mut("field_type") {
                *s = s.to_ascii_lowercase();
            }
        }
    }
}

/// Re-type a legacy `body_json` into the v2 storage form
/// (`{schema_version, kind, …}`). Strict: a body that does not parse is an
/// error naming the problem — never a silent skip (MIGRATION §2).
pub fn item_body(kind: &str, body_json: Option<&Value>) -> Result<Value, String> {
    let mut body = object(body_json);
    if !body.contains_key("kind") {
        body.insert("kind".into(), Value::String(kind.to_owned()));
    }
    lowercase_enum_fields(&mut body);
    // Every option/field/test id is a string on the v2 side; the legacy
    // choice options used string ids already, but numbers appeared in
    // hand-edited bodies.
    for list_key in ["options", "fields", "tests"] {
        if let Some(Value::Array(items)) = body.get_mut(list_key) {
            for item in items.iter_mut() {
                if let Some(obj) = item.as_object_mut()
                    && let Some(Value::Number(n)) = obj.get("id").cloned()
                {
                    obj.insert("id".into(), Value::String(n.to_string()));
                }
            }
        }
    }
    let parsed = ItemBody::from_stored(&Value::Object(body)).map_err(|e| format!("item body: {e}"))?;
    if parsed.kind().as_str() != kind {
        return Err(format!(
            "item body kind '{}' disagrees with column kind '{kind}'",
            parsed.kind().as_str()
        ));
    }
    Ok(parsed.to_stored())
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ItemMetadata {
    pub section_label: Option<String>,
    pub difficulty: Option<String>,
    pub tags: Vec<String>,
    pub outcome_ids: Vec<String>,
    pub estimated_minutes: Option<i32>,
}

/// `metadata_json` scalars → columns (legacy `AssessmentItemMetadata`).
#[must_use]
pub fn item_metadata(value: Option<&Value>) -> ItemMetadata {
    let m = object(value);
    let strings = |key: &str| -> Vec<String> {
        array(m.get(key))
            .into_iter()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect()
    };
    ItemMetadata {
        section_label: str_setting(&m, "section_label").map(str::to_owned),
        difficulty: str_setting(&m, "difficulty")
            .map(str::to_ascii_lowercase)
            .filter(|d| ["easy", "medium", "hard"].contains(&d.as_str())),
        tags: strings("tags"),
        outcome_ids: strings("outcome_ids"),
        estimated_minutes: int_setting(&m, "estimated_minutes")
            .and_then(|v| i32::try_from(v).ok())
            .filter(|v| *v >= 0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assessment() -> legacy::Assessment {
        legacy::Assessment {
            id: 1,
            assessment_uuid: "assessment_01A".into(),
            activity_id: 10,
            kind: "EXAM".into(),
            title: "T".into(),
            description: String::new(),
            lifecycle: "PUBLISHED".into(),
            scheduled_at: None,
            published_at: Some(1.0),
            archived_at: None,
            weight: 1.0,
            grading_type: "PERCENTAGE".into(),
            policy_id: Some(5),
            content_version: 2,
            created_at: Some(1.0),
            updated_at: Some(2.0),
        }
    }

    fn policy() -> legacy::AssessmentPolicy {
        legacy::AssessmentPolicy {
            id: 5,
            policy_uuid: "policy_01A".into(),
            activity_id: 10,
            assessment_type: "EXAM".into(),
            grading_mode: "AUTO_THEN_MANUAL".into(),
            completion_rule: "PASSED".into(),
            passing_score: 60.0,
            max_attempts: Some(2),
            time_limit_seconds: Some(900),
            due_at: None,
            allow_late: true,
            late_policy_json: Some(serde_json::json!({})),
            settings_json: Some(serde_json::json!({
                "time_limit": 15, "attempt_limit": 2, "shuffle_questions": true, "shuffle_answers": false,
                "question_limit": null, "access_mode": "ALL_ENROLLED", "whitelist_user_ids": [],
                "allow_result_review": true, "show_correct_answers": false,
                "copy_paste_protection": true, "violation_threshold": 3
            })),
            grade_release_mode: "IMMEDIATE".into(),
            anti_cheat_json: Some(serde_json::json!({
                "copy_paste_protection": true, "tab_switch_detection": true, "devtools_detection": false,
                "right_click_disable": true, "fullscreen_enforcement": false, "violation_threshold": 5
            })),
            policy_version: 3,
        }
    }

    #[test]
    fn fold_maps_every_scalar_with_legacy_precedence() {
        let f = fold(&assessment(), Some(&policy()), &Map::new());
        assert_eq!(f.kind, "exam");
        assert_eq!(f.lifecycle, "published");
        assert_eq!(f.grading_mode, "auto_then_manual");
        assert_eq!(f.completion_rule, "passed");
        assert_eq!(f.grade_release_mode, "immediate");
        assert_eq!(f.max_attempts, Some(2));
        assert_eq!(f.time_limit_seconds, Some(900), "the column wins over settings.time_limit minutes");
        assert_eq!(f.late, LatePolicy::NONE);
        assert!(f.randomize_questions);
        assert!(!f.randomize_options);
        assert_eq!(f.review_visibility, "score_only");
        assert!(f.partial_credit);
        assert!(f.copy_paste_protection && f.tab_switch_detection && f.right_click_disabled);
        assert!(!f.devtools_detection && !f.fullscreen_required);
        assert_eq!(f.violation_threshold, 5);
        assert_eq!(f.policy_version, 3);
        assert_eq!(f.attempt_penalty_percent, 0.0);
        assert_eq!(f.dropped_setting_keys, vec!["access_mode", "question_limit", "whitelist_user_ids"]);
        assert!(f.notes.is_empty());
    }

    #[test]
    fn fold_without_policy_uses_legacy_defaults() {
        let mut a = assessment();
        a.lifecycle = "WEIRD".into();
        let s: Map<String, Value> = serde_json::from_str(r#"{"max_score_penalty_per_attempt": 10}"#).unwrap();
        let f = fold(&a, None, &s);
        assert_eq!(f.lifecycle, "draft");
        assert_eq!(f.grading_mode, "auto");
        assert_eq!(f.completion_rule, "graded");
        assert_eq!(f.passing_score, 60.0);
        assert!(f.allow_late);
        assert_eq!(f.violation_threshold, 3);
        assert_eq!(f.review_visibility, "full");
        assert_eq!(f.attempt_penalty_percent, 10.0);
        assert_eq!(f.notes.len(), 2);
    }

    #[test]
    fn late_policies() {
        let (p, note) = late_policy(Some(&serde_json::json!({"kind":"PENALTY","percent_per_day":10,"max_days":3})));
        assert_eq!(p.kind, "penalty");
        assert_eq!(p.percent_per_day, Some(10.0));
        assert_eq!(p.max_days, Some(3));
        assert!(note.is_none());
        let (c, _) = late_policy(Some(&serde_json::json!({"kind":"CUTOFF","cutoff_at":"2026-01-02T00:00:00Z"})));
        assert_eq!(c.kind, "cutoff");
        assert_eq!(c.cutoff_at, Some(1_767_312_000.0));
        let (bad, note) = late_policy(Some(&serde_json::json!({"kind":"PENALTY"})));
        assert_eq!(bad, LatePolicy::NONE);
        assert!(note.is_some());
        assert_eq!(late_policy(None).0, LatePolicy::NONE);
        assert_eq!(iso_epoch(Some(&Value::String("2026-06-29 11:28:23".into()))), Some(1_782_732_503.0));
    }

    #[test]
    fn item_bodies_retype_strictly() {
        let choice = serde_json::json!({
            "kind":"CHOICE","prompt":"p","options":[{"id":0,"text":"a","is_correct":true},{"id":"1","text":"b","is_correct":false}],
            "multiple":false,"variant":"SINGLE_CHOICE","explanation":""
        });
        let stored = item_body("choice", Some(&choice)).unwrap();
        assert_eq!(stored["kind"], "choice");
        assert_eq!(stored["variant"], "single_choice");
        assert_eq!(stored["schema_version"], 1);
        assert_eq!(stored["options"][0]["id"], "0");

        let code = serde_json::json!({
            "kind":"CODE","prompt":"","languages":[71],"starter_code":{},
            "tests":[{"id":"t1","input":"x","weight":1,"is_visible":true,"description":"d","expected_output":"y","match_mode":"TRIMMED"}],
            "time_limit_seconds":5,"memory_limit_mb":256
        });
        let stored = item_body("code", Some(&code)).unwrap();
        assert_eq!(stored["tests"][0]["match_mode"], "trimmed");
        assert_eq!(stored["scoring_strategy"], "partial_credit");

        assert!(item_body("choice", Some(&serde_json::json!({"kind":"MATCHING","pairs":[]}))).is_err());
        assert!(item_body("code", Some(&serde_json::json!({"kind":"CODE","tests":[{"input":"x"}]}))).is_err(), "test without id");
        assert_eq!(item_kind("OPEN_TEXT"), Some("open_text"));
        assert_eq!(item_kind("ESSAY"), None);
        assert_eq!(access_mode(Some("RESTRICTED")), "restricted");
        assert_eq!(access_mode(None), "all_course_learners");
    }

    #[test]
    fn item_metadata_scalars() {
        let m = item_metadata(Some(&serde_json::json!({"section_label":"S","difficulty":"HARD","tags":["a",1],"estimated_minutes":4.0})));
        assert_eq!(m.section_label.as_deref(), Some("S"));
        assert_eq!(m.difficulty.as_deref(), Some("hard"));
        assert_eq!(m.tags, vec!["a"]);
        assert_eq!(m.estimated_minutes, Some(4));
        assert_eq!(item_metadata(None), ItemMetadata::default());
    }
}
