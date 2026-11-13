//! Spec 15.2 items 1-3 on the real exam file (never committed): run with
//! `DOT_SAMPLE_XLSX=<path> cargo test -p ab-xlsx -- --ignored`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_xlsx::{DotKind, ParseOptions, Severity, parse};

fn located(parsed: &ab_xlsx::Parsed) -> Vec<(Severity, &str, String)> {
    parsed
        .issues
        .iter()
        .map(|i| {
            let at = i.cell.clone().unwrap_or_else(|| {
                let cells = i
                    .params
                    .get("cells")
                    .and_then(|c| c.as_array())
                    .cloned()
                    .unwrap_or_default();
                cells
                    .iter()
                    .filter_map(|c| c.as_str())
                    .collect::<Vec<_>>()
                    .join(",")
            });
            (i.severity, i.code, at)
        })
        .collect()
}

#[test]
#[ignore = "needs DOT_SAMPLE_XLSX"]
fn java_exam_sample() {
    let path = std::env::var("DOT_SAMPLE_XLSX").expect("DOT_SAMPLE_XLSX");
    let bytes = std::fs::read(path).unwrap();
    let parsed = parse(&bytes, ParseOptions::default());
    let test = parsed.test.as_ref().expect("readable");
    let issues = located(&parsed);
    assert!(!parsed.has_errors(), "{issues:#?}");
    assert_eq!(test.questions.len(), 64);
    assert_eq!(test.questions.first().map(|q| q.row), Some(2));
    assert_eq!(test.questions.last().map(|q| q.row), Some(65));
    assert!(
        test.questions
            .iter()
            .all(|q| matches!(q.kind, DotKind::Single { .. }))
    );
    let with_images: Vec<u32> = test
        .questions
        .iter()
        .filter(|q| !q.images.is_empty())
        .map(|q| q.row)
        .collect();
    assert_eq!(with_images, [29, 30, 31, 32, 33, 34]);
    assert_eq!(test.images.len(), 6);
    assert_eq!(
        (test.attempts, test.time_minutes, test.limit, test.leveling),
        (1, 55, 30, false)
    );
    assert_eq!(
        issues,
        [
            (Severity::Warning, "suspicious_escape", "A53".to_owned()),
            (Severity::Warning, "suspicious_escape", "A54".to_owned()),
            (Severity::Warning, "duplicate_question", "A60".to_owned()),
            (
                Severity::Info,
                "unescaped_newlines",
                "A53,A54,A55,A62".to_owned()
            ),
            (Severity::Info, "trimmed", "E5,F5,G5".to_owned()),
            (Severity::Info, "shapes_skipped", "A23,A24".to_owned()),
        ]
    );
    let duplicate = parsed
        .issues
        .iter()
        .find(|i| i.code == "duplicate_question")
        .unwrap();
    assert_eq!(
        duplicate
            .params
            .get("row")
            .and_then(serde_json::Value::as_u64),
        Some(51)
    );
    let option_texts = |row: u32| match &test.questions.iter().find(|q| q.row == row).unwrap().kind
    {
        DotKind::Single { options, .. } => {
            options.iter().map(|o| o.text.clone()).collect::<Vec<_>>()
        }
        _ => panic!("single"),
    };
    let row32 = option_texts(32);
    // Options differing only in case are distinct (person.age / Person.age).
    let case_twins = row32.iter().enumerate().any(|(i, a)| {
        row32[i + 1..]
            .iter()
            .any(|b| a != b && a.to_lowercase() == b.to_lowercase())
    });
    assert!(case_twins);
    let row34 = option_texts(34);
    assert_eq!(&row34[..2], ["310", "310.0"]);
}
