//! Submission / grading transforms (MIGRATION §2.4). Answers become the one
//! canonical `{"<item_id>": ItemAnswer}` shape, breakdowns re-key their items
//! to v2 ids, `metadata_json` scalars become columns, snapshots are rebuilt
//! in the v2 shape, and code runs leave the metadata blob for `code_runs`.

use ab_domain::grading::answers::ItemAnswer;
use serde_json::{Map, Value};
use uuid::Uuid;

use crate::transform::assessments::iso_epoch;
use crate::transform::common::{array, int_setting, object, snake, str_setting};

/// Legacy `SubmissionStatus` → v2 (`DRAFT|PENDING|GRADED|PUBLISHED|RETURNED`).
#[must_use]
pub fn status(raw: &str) -> Option<&'static str> {
    match snake(raw, None).as_str() {
        "draft" => Some("draft"),
        "pending" => Some("pending"),
        "graded" => Some("graded"),
        "published" => Some("published"),
        "returned" => Some("returned"),
        _ => None,
    }
}

/// Outcome of re-keying an answers/breakdown blob.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Rekeyed {
    pub value: Value,
    /// Legacy item ids that no v2 item resolves (entries dropped).
    pub unresolved: Vec<String>,
}

fn normalize_answer(mut answer: Map<String, Value>) -> Option<Value> {
    if let Some(Value::String(k)) = answer.get_mut("kind") {
        *k = k.to_ascii_lowercase();
    }
    // Code answers carried `latest_run` (now a `code_runs` row).
    answer.remove("latest_run");
    let parsed: ItemAnswer = serde_json::from_value(Value::Object(answer)).ok()?;
    serde_json::to_value(parsed).ok()
}

/// `answers_json` came in two shapes: `{"answers": {item_uuid: answer}}`
/// (quiz/exam) and `{"answers": [{item_uuid, answer}]}` (code challenge) —
/// plus the bare `{}` of an untouched draft. Unparsable answers are dropped
/// with the item id reported.
#[must_use]
pub fn answers(raw: Option<&Value>, resolve: impl Fn(&str) -> Option<Uuid>) -> Rekeyed {
    let root = object(raw);
    let mut out = Map::new();
    let mut unresolved = Vec::new();
    let mut push = |item_uuid: &str, answer: Value| {
        let Some(id) = resolve(item_uuid) else {
            unresolved.push(item_uuid.to_owned());
            return;
        };
        match answer {
            Value::Object(m) => match normalize_answer(m) {
                Some(v) => {
                    out.insert(id.to_string(), v);
                }
                None => unresolved.push(format!("{item_uuid} (unparsable answer)")),
            },
            _ => unresolved.push(format!("{item_uuid} (answer not an object)")),
        }
    };
    match root.get("answers") {
        Some(Value::Object(by_item)) => {
            for (item_uuid, answer) in by_item {
                push(item_uuid, answer.clone());
            }
        }
        Some(Value::Array(list)) => {
            for entry in list {
                let Some(e) = entry.as_object() else { continue };
                if let (Some(item_uuid), Some(answer)) =
                    (str_setting(e, "item_uuid"), e.get("answer"))
                {
                    push(item_uuid, answer.clone());
                }
            }
        }
        _ => {}
    }
    Rekeyed {
        value: Value::Object(out),
        unresolved,
    }
}

/// A `GradingBreakdown` blob with `items[].item_id` re-keyed to v2 ids;
/// items whose legacy id resolves nowhere are dropped and reported.
#[must_use]
pub fn breakdown(raw: Option<&Value>, resolve: impl Fn(&str) -> Option<Uuid>) -> Rekeyed {
    let src = object(raw);
    let mut unresolved = Vec::new();
    let mut items = Vec::new();
    for item in array(src.get("items")) {
        let Some(mut m) = item.as_object().cloned() else {
            continue;
        };
        let legacy_id = str_setting(&m, "item_id").unwrap_or("").to_owned();
        let Some(id) = resolve(&legacy_id) else {
            unresolved.push(legacy_id);
            continue;
        };
        m.insert("item_id".into(), Value::String(id.to_string()));
        for key in ["score", "max_score"] {
            if let Some(v) = m.get(key).and_then(Value::as_f64) {
                // Python serialised `-0.0`; keep the number, drop the sign.
                m.insert(key.into(), Value::from(if v == 0.0 { 0.0 } else { v }));
            }
        }
        // Legacy rounded the score (0.67) but not the max (0.6667): an item
        // above its max fails every v2 grading form.
        if let (Some(score), Some(max)) = (
            m.get("score").and_then(Value::as_f64),
            m.get("max_score").and_then(Value::as_f64),
        ) && score > max
        {
            m.insert("score".into(), Value::from(max));
        }
        if !m.contains_key("feedback_code")
            && let Some((code, params)) = str_setting(&m, "feedback").and_then(feedback_code)
        {
            m.insert("feedback_code".into(), Value::String(code.into()));
            if let Some(params) = params {
                m.insert("feedback_params".into(), params);
            }
        }
        items.push(Value::Object(m));
    }
    let value = serde_json::json!({
        "items": items,
        "needs_manual_review": src.get("needs_manual_review").and_then(Value::as_bool).unwrap_or(false),
        "auto_graded": src.get("auto_graded").and_then(Value::as_bool).unwrap_or(false),
        "feedback": str_setting(&src, "feedback").unwrap_or(""),
    });
    Rekeyed { value, unresolved }
}

/// The v2 verdict code (and `{correct, total}`) of a legacy English grader
/// text, so migrated reviews localize like new ones (`grading::grader`).
fn feedback_code(text: &str) -> Option<(&'static str, Option<Value>)> {
    let ratio = |s: &str| {
        let (hits, total) = s.split_once('/')?;
        Some(serde_json::json!({
            "correct": hits.trim().parse::<u32>().ok()?,
            "total": total.trim().parse::<u32>().ok()?,
        }))
    };
    match text.trim() {
        "No answer provided" => Some(("no-answer", None)),
        "Correct" => Some(("correct", None)),
        "Incorrect" => Some(("incorrect", None)),
        "Partially correct (no partial credit)" => Some(("partially-correct-no-credit", None)),
        t => {
            if let Some(inner) = t
                .strip_prefix("Partially correct (")
                .and_then(|r| r.strip_suffix(')'))
            {
                return Some(("partially-correct", Some(ratio(inner)?)));
            }
            let inner = t
                .strip_prefix("Matched ")
                .and_then(|r| r.strip_suffix(" pairs"))
                .or_else(|| t.strip_suffix(" pairs matched"))?;
            Some(("pairs-matched", Some(ratio(inner)?)))
        }
    }
}

/// `metadata_json` scalars that became columns (DECISIONS P4.1).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Metadata {
    pub violation_count: i32,
    pub violations: Value,
    pub auto_submit_reason: Option<&'static str>,
    pub auto_submitted_at: Option<f64>,
    pub duration_seconds: Option<i32>,
    /// Keys dropped: `latest_run` / `runs` (→ `code_runs`), plagiarism
    /// fields (Q4: not carried), `attempt_uuid`, `idempotency_key`.
    pub dropped_keys: Vec<String>,
}

#[must_use]
pub fn metadata(raw: Option<&Value>) -> Metadata {
    let m = object(raw);
    let violations = match m.get("violations") {
        Some(Value::Array(a)) => Value::Array(a.clone()),
        _ => Value::Array(Vec::new()),
    };
    let violation_count = int_setting(&m, "violation_count")
        .and_then(|v| i32::try_from(v).ok())
        .filter(|v| *v >= 0)
        .unwrap_or(0);
    let auto_submit_reason = match str_setting(&m, "auto_submit_reason")
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("time_expired") => Some("time_expired"),
        Some("integrity_violation") => Some("integrity_violation"),
        _ => None,
    };
    let mut dropped_keys: Vec<String> = m
        .keys()
        .filter(|k| {
            !matches!(
                k.as_str(),
                "violations"
                    | "violation_count"
                    | "auto_submit_reason"
                    | "auto_submitted_at"
                    | "duration_seconds"
            )
        })
        .cloned()
        .collect();
    dropped_keys.sort();
    Metadata {
        violation_count,
        violations,
        auto_submit_reason,
        auto_submitted_at: iso_epoch(m.get("auto_submitted_at")),
        duration_seconds: int_setting(&m, "duration_seconds")
            .and_then(|v| i32::try_from(v).ok())
            .filter(|v| *v >= 0),
        dropped_keys,
    }
}

/// Rebuild `items_snapshot` in the v2 shape from the legacy
/// `{"items": [{item_uuid, kind, title, body_json, max_score, order}]}`;
/// bodies re-type through the assessment item transform. Items that no
/// longer resolve are kept with their legacy id (a snapshot is history).
#[must_use]
pub fn items_snapshot(
    raw: Option<&Value>,
    resolve: impl Fn(&str) -> Option<Uuid>,
) -> Option<Value> {
    let src = object(raw);
    let items = array(src.get("items"));
    if items.is_empty() {
        return None;
    }
    let mut out = Vec::new();
    for (i, item) in items.iter().enumerate() {
        let Some(m) = item.as_object() else { continue };
        let legacy_id = str_setting(m, "item_uuid").unwrap_or("");
        let kind = str_setting(m, "kind")
            .map(str::to_ascii_lowercase)
            .unwrap_or_default();
        let body = crate::transform::assessments::item_body(
            &kind,
            m.get("body_json").or_else(|| m.get("body")),
        )
        .unwrap_or_else(|_| {
            m.get("body_json")
                .cloned()
                .unwrap_or_else(|| Value::Object(Map::new()))
        });
        let position = int_setting(m, "order")
            .or_else(|| int_setting(m, "position"))
            .map_or_else(|| i64::try_from(i).unwrap_or(i64::MAX) + 1, |o| o + 1);
        out.push(serde_json::json!({
            "id": resolve(legacy_id).map_or_else(|| legacy_id.to_owned(), |u| u.to_string()),
            "kind": kind,
            "title": str_setting(m, "title").unwrap_or(""),
            "max_score": m.get("max_score").and_then(Value::as_f64).unwrap_or(0.0),
            "position": position,
            "body": body,
        }));
    }
    Some(serde_json::json!({ "items": out }))
}

/// Rebuild `policy_snapshot` in the v2 shape (`grading::submissions::snapshots`).
#[must_use]
pub fn policy_snapshot(raw: Option<&Value>) -> Option<Value> {
    let src = object(raw);
    if src.is_empty() {
        return None;
    }
    let lower = |key: &str| str_setting(&src, key).map(str::to_ascii_lowercase);
    Some(serde_json::json!({
        "max_attempts": src.get("max_attempts").cloned().unwrap_or(Value::Null),
        "time_limit_seconds": src.get("time_limit_seconds").cloned().unwrap_or(Value::Null),
        "due_at": iso_epoch(src.get("due_at")),
        "allow_late": src.get("allow_late").and_then(Value::as_bool).unwrap_or(true),
        "passing_score": src.get("passing_score").and_then(Value::as_f64).unwrap_or(60.0),
        "grading_mode": lower("grading_mode").unwrap_or_else(|| "auto".into()),
        "grade_release_mode": lower("grade_release_mode").unwrap_or_else(|| "immediate".into()),
        "completion_rule": lower("completion_rule").unwrap_or_else(|| "graded".into()),
        "attempt_penalty_percent": 0.0,
    }))
}

/// Legacy `code_run.purpose` → v2.
#[must_use]
pub fn run_purpose(raw: &str) -> Option<&'static str> {
    match snake(raw, None).as_str() {
        "custom" => Some("custom"),
        "visible" => Some("visible"),
        "final" => Some("final"),
        "reference_check" => Some("reference_check"),
        _ => None,
    }
}

/// Legacy `code_run.status` → v2.
#[must_use]
pub fn run_status(raw: &str) -> Option<&'static str> {
    match snake(raw, None).as_str() {
        "queued" => Some("queued"),
        "running" => Some("running"),
        "accepted" => Some("accepted"),
        "wrong_answer" => Some("wrong_answer"),
        "compile_error" => Some("compile_error"),
        "runtime_error" => Some("runtime_error"),
        "time_limit" => Some("time_limit"),
        "internal_error" => Some("internal_error"),
        "degraded" => Some("degraded"),
        _ => None,
    }
}

/// `file_submission_attempt.feedback_json` → (`feedback`, `rubric_scores`).
#[must_use]
pub fn attempt_feedback(raw: Option<&Value>) -> (String, Value) {
    let m = object(raw);
    let feedback = str_setting(&m, "feedback").unwrap_or("").to_owned();
    let rubric = match m.get("rubric_scores") {
        Some(Value::Object(r)) => Value::Object(r.clone()),
        _ => Value::Object(Map::new()),
    };
    (feedback, rubric)
}

/// `allowed_mime_types` JSON list → `text[]` (case-folded, deduped).
#[must_use]
pub fn mime_list(raw: Option<&Value>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for v in array(raw) {
        if let Some(s) = v.as_str() {
            let s = s.trim().to_ascii_lowercase();
            if !s.is_empty() && !out.contains(&s) {
                out.push(s);
            }
        }
    }
    out
}

/// `bulk_action.target_user_ids` JSON list of legacy int ids.
#[must_use]
pub fn int_list(raw: Option<&Value>) -> Vec<i64> {
    array(raw).into_iter().filter_map(|v| v.as_i64()).collect()
}

/// Legacy annotation_type / scan_status / bulk status / action type.
#[must_use]
pub fn lower_in(raw: &str, allowed: &[&'static str], fallback: &'static str) -> &'static str {
    let v = snake(raw, None);
    allowed
        .iter()
        .copied()
        .find(|a| *a == v)
        .unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resolver<'a>(known: &'a [(&'a str, Uuid)]) -> impl Fn(&str) -> Option<Uuid> + 'a {
        move |k| known.iter().find(|(l, _)| *l == k).map(|(_, u)| *u)
    }

    #[test]
    fn answers_by_item_and_as_list() {
        let a = Uuid::now_v7();
        let known = [("question_1", a)];
        let exam = serde_json::json!({"answers": {"question_1": {"kind": "CHOICE", "selected": ["1"]}, "question_x": {"kind":"CHOICE","selected":[]}}});
        let r = answers(Some(&exam), resolver(&known));
        assert_eq!(r.value[a.to_string()]["kind"], "choice");
        assert_eq!(r.value[a.to_string()]["selected"], serde_json::json!(["1"]));
        assert_eq!(r.unresolved, vec!["question_x"]);

        let code = serde_json::json!({"answers": [{"item_uuid": "question_1", "answer": {"kind": "CODE", "language": 71, "source": "cHJp", "latest_run": {"passed": 0}}}]});
        let r = answers(Some(&code), resolver(&known));
        assert_eq!(
            r.value[a.to_string()],
            serde_json::json!({"kind":"code","language":71,"source":"cHJp"})
        );
        assert!(r.unresolved.is_empty());

        let bad = serde_json::json!({"answers": {"question_1": {"kind": "CODE"}}});
        assert_eq!(
            answers(Some(&bad), resolver(&known)).unresolved.len(),
            1,
            "code without language is unparsable"
        );
        assert_eq!(answers(None, resolver(&known)).value, serde_json::json!({}));
    }

    #[test]
    fn breakdown_rekeys_items_and_fixes_negative_zero() {
        let a = Uuid::now_v7();
        let known = [("q1", a)];
        let raw = serde_json::json!({"items": [
            {"item_id": "q1", "item_text": "t", "score": -0.0, "max_score": 33.3, "correct": false, "feedback": "Incorrect", "needs_manual_review": false, "user_answer": ["1"], "correct_answer": ["2"]},
            {"item_id": "gone", "score": 1.0, "max_score": 1.0}
        ], "needs_manual_review": false, "auto_graded": true, "feedback": ""});
        let r = breakdown(Some(&raw), resolver(&known));
        assert_eq!(r.value["items"].as_array().unwrap().len(), 1);
        assert_eq!(r.value["items"][0]["item_id"], a.to_string());
        assert_eq!(r.value["items"][0]["score"], 0.0);
        assert!(!r.value["items"][0]["score"].to_string().contains('-'));
        assert_eq!(r.value["auto_graded"], true);
        assert_eq!(r.unresolved, vec!["gone"]);
        let parsed = ab_domain::grading::breakdown::GradingBreakdown::from_value(&r.value);
        assert_eq!(parsed.items.len(), 1);
    }

    #[test]
    fn breakdown_clamps_rounded_scores_and_codes_legacy_feedback() {
        let a = Uuid::now_v7();
        let known = [("q1", a), ("q2", a), ("q3", a)];
        let raw = serde_json::json!({"items": [
            {"item_id": "q1", "score": 0.67, "max_score": 0.6667, "feedback": "Correct"},
            {"item_id": "q2", "score": 0.5, "max_score": 1.0, "feedback": "Matched 2/4 pairs"},
            {"item_id": "q3", "score": 0.0, "max_score": 1.0, "feedback": "Something else"}
        ]});
        let r = breakdown(Some(&raw), resolver(&known));
        let items = &r.value["items"];
        assert_eq!(items[0]["score"], 0.6667);
        assert_eq!(items[0]["feedback_code"], "correct");
        assert_eq!(items[1]["feedback_code"], "pairs-matched");
        assert_eq!(
            items[1]["feedback_params"],
            serde_json::json!({"correct": 2, "total": 4})
        );
        assert!(items[2].get("feedback_code").is_none());
        assert_eq!(
            feedback_code("Partially correct (1/2)").map(|c| c.0),
            Some("partially-correct")
        );
        assert_eq!(
            feedback_code("No answer provided").map(|c| c.0),
            Some("no-answer")
        );
    }

    #[test]
    fn metadata_scalars_and_dropped_keys() {
        let raw = serde_json::json!({"latest_run": {"run_id": "x"}, "runs": [], "violations": [{"kind":"TAB_SWITCH"}], "violation_count": 2,
            "auto_submit_reason": "TIME_EXPIRED", "auto_submitted_at": "2026-06-29T11:28:23.141216+00:00", "plagiarism_status": "skipped"});
        let m = metadata(Some(&raw));
        assert_eq!(m.violation_count, 2);
        assert_eq!(m.violations.as_array().unwrap().len(), 1);
        assert_eq!(m.auto_submit_reason, Some("time_expired"));
        assert!(m.auto_submitted_at.is_some_and(|t| t > 1.7e9));
        assert_eq!(
            m.dropped_keys,
            vec!["latest_run", "plagiarism_status", "runs"]
        );
        assert_eq!(
            metadata(None),
            Metadata {
                violations: Value::Array(vec![]),
                ..Metadata::default()
            }
        );
    }

    #[test]
    fn snapshots_rebuild_in_v2_shape() {
        let a = Uuid::now_v7();
        let known = [("q1", a)];
        let raw = serde_json::json!({"items": [{"item_uuid": "q1", "kind": "CHOICE", "title": "T", "max_score": 1.0, "order": 0,
            "body_json": {"kind": "CHOICE", "prompt": "p", "options": [{"id":"0","text":"a","is_correct":true}], "variant": "SINGLE_CHOICE"}}]});
        let snap = items_snapshot(Some(&raw), resolver(&known)).unwrap();
        assert_eq!(snap["items"][0]["id"], a.to_string());
        assert_eq!(snap["items"][0]["position"], 1);
        assert_eq!(snap["items"][0]["body"]["variant"], "single_choice");
        assert_eq!(snap["items"][0]["body"]["schema_version"], 1);
        assert!(items_snapshot(None, resolver(&known)).is_none());

        let pol = policy_snapshot(Some(&serde_json::json!({"max_attempts": null, "time_limit_seconds": 60, "due_at": null, "allow_late": true,
            "late_policy_json": {}, "passing_score": 60.0, "grading_mode": "AUTO_THEN_MANUAL", "completion_rule": "PASSED",
            "grade_release_mode": "IMMEDIATE", "settings_json": {}}))).unwrap();
        assert_eq!(pol["grading_mode"], "auto_then_manual");
        assert_eq!(pol["time_limit_seconds"], 60);
        assert_eq!(pol["attempt_penalty_percent"], 0.0);
        assert!(policy_snapshot(None).is_none());
    }

    #[test]
    fn small_enums() {
        assert_eq!(status("PUBLISHED"), Some("published"));
        assert_eq!(status("WEIRD"), None);
        assert_eq!(run_purpose("FINAL"), Some("final"));
        assert_eq!(run_status("DEGRADED"), Some("degraded"));
        assert_eq!(run_status("nope"), None);
        assert_eq!(
            attempt_feedback(Some(
                &serde_json::json!({"feedback":"ok","rubric_scores":{"a":1}})
            )),
            ("ok".into(), serde_json::json!({"a":1}))
        );
        assert_eq!(
            mime_list(Some(&serde_json::json!([
                "Application/PDF",
                " image/png",
                "application/pdf"
            ]))),
            vec!["application/pdf", "image/png"]
        );
        assert_eq!(int_list(Some(&serde_json::json!([1, "x", 2]))), vec![1, 2]);
        assert_eq!(
            lower_in("TEXT", &["text", "highlight", "audio"], "text"),
            "text"
        );
        assert_eq!(
            lower_in("VIDEO", &["text", "highlight", "audio"], "text"),
            "text"
        );
    }
}
