//! Writer tests (spec 8.1, 15.1): `parse(write(t)).test == Some(t)`.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::case_sensitive_file_extension_comparisons
)]

mod common;

use ab_xlsx::{DotKind, DotOption, DotQuestion, DotTest, Image, Severity, Skipped, write};
use common::*;
use rust_xlsxwriter::Image as XlsxImage;
use sha2::{Digest, Sha256};

fn image(bytes: Vec<u8>, mime: &'static str, width: u32, height: u32) -> Image {
    Image {
        sha256: Sha256::digest(&bytes).into(),
        bytes,
        mime,
        width,
        height,
    }
}

fn opt(text: &str, image: Option<usize>) -> DotOption {
    DotOption {
        text: text.to_owned(),
        image,
    }
}

fn round_trip(test: &DotTest, skipped: &[Skipped]) -> ab_xlsx::Parsed {
    let bytes = write(test, skipped).unwrap();
    let parsed = read(&bytes);
    assert!(!parsed.has_errors(), "{:#?}", parsed.issues);
    assert_eq!(parsed.sheet, "Test");
    assert_eq!(parsed.test.as_ref(), Some(test));
    parsed
}

/// Spec 15.1: 60 questions on three levels, every type, pictures over and in cells.
#[test]
fn full_format_fixture_round_trips() {
    let pictures: Vec<Vec<u8>> = (1..=4).map(|seed| png(40 * seed, 30, seed)).collect();
    let bytes = book(|sheet| {
        header(sheet, 3, 45, 30, true);
        for i in 0..60u32 {
            let r = i + 2;
            let level = format!("#{}", i % 3 + 1);
            let text = format!("Вопрос {r}\n  с отступом");
            match i % 6 {
                0 => row(sheet, r, &[&text, "#1", "2", &level, "a", "310", "310.0"]),
                1 => row(sheet, r, &[&text, "#2", "1;3", &level, "x", "y", "z"]),
                2 => row(sheet, r, &[&text, "#3", "Ответ", &level]),
                3 => row(
                    sheet,
                    r,
                    &[
                        &text,
                        "#4",
                        "1-2;2-0;3-2",
                        "3;2",
                        &level,
                        "l1",
                        "l2",
                        "l3",
                        "r1",
                        "r2",
                    ],
                ),
                4 => row(sheet, r, &[&text, "#5", "", &level]),
                _ => row(sheet, r, &["", "#1", "1", &level, "", "b"]),
            }
        }
        let pic = |n: usize| XlsxImage::new_from_buffer(&pictures[n]).unwrap();
        sheet.insert_image(1, 0, &pic(0)).unwrap();
        sheet
            .insert_image_with_offset(1, 0, &pic(1), 0, 10)
            .unwrap();
        sheet.insert_image(1, 5, &pic(2)).unwrap();
        sheet.embed_image(6, 0, &pic(3)).unwrap(); // row 7: picture-only question
        sheet.embed_image(6, 4, &pic(0)).unwrap(); // its option 1 is only a picture
        sheet.insert_image(4, 9, &pic(1)).unwrap(); // row 5: right item r2 of a matching
        for r in [13u32, 19, 25, 31, 37, 43, 49, 55, 61] {
            sheet.insert_image(r - 1, 0, &pic(2)).unwrap();
            sheet.insert_image(r - 1, 4, &pic(3)).unwrap();
        }
    });
    let parsed = read(&bytes);
    assert!(!parsed.has_errors(), "{:#?}", parsed.issues);
    let test = parsed.test.unwrap();
    assert_eq!(test.questions.len(), 60);
    assert_eq!((test.limit, test.leveling), (30, true));
    for level in 1..=3 {
        assert_eq!(
            test.questions.iter().filter(|q| q.level == level).count(),
            20
        );
    }
    assert_eq!(test.images.len(), 4);
    assert_eq!(test.questions[0].images, [0, 1]);
    assert!(
        matches!(&test.questions[3].kind, DotKind::Matching { right, .. } if right[1].image.is_some())
    );
    assert_eq!(test.questions[5].text, "");
    round_trip(&test, &[]);
}

#[test]
fn every_format_and_edge_text_round_trips() {
    let images = vec![
        image(webp(20, 10), "image/webp", 20, 10),
        image(gif(30, 30), "image/gif", 30, 30),
        image(jpeg(8000, 4000), "image/jpeg", 8000, 4000),
        image(png(10, 600, 1), "image/png", 10, 600),
    ];
    let q = |row: u32, text: &str, images: Vec<usize>, kind: DotKind| DotQuestion {
        row,
        text: text.to_owned(),
        images,
        level: 0,
        kind,
    };
    let test = DotTest {
        title: "Экспорт «тест»".to_owned(),
        attempts: 0,
        time_minutes: 90,
        limit: 0,
        leveling: false,
        questions: vec![
            q(
                2,
                "Картинки",
                vec![0, 1, 2, 3, 0],
                DotKind::Single {
                    options: vec![
                        opt("=1+1", None),
                        opt("", Some(2)),
                        opt("_x000D_ & <b>", Some(0)),
                    ],
                    correct: 2,
                },
            ),
            q(
                3,
                "многострочный\n  код",
                vec![],
                DotKind::Multiple {
                    options: vec![
                        opt("1", None),
                        opt("1.0", None),
                        opt("TRUE", None),
                        opt("0.1", None),
                    ],
                    correct: vec![0, 3],
                },
            ),
            q(
                4,
                "Коротко",
                vec![],
                DotKind::Short {
                    answer: "  внутри  пробелы".trim().to_owned(),
                },
            ),
            q(
                5,
                "Пары",
                vec![],
                DotKind::Matching {
                    left: vec![opt("a", None), opt("b", Some(1))],
                    right: vec![opt("1", None), opt("2", None), opt("3", None)],
                    pairs: vec![Some(2), Some(2)],
                },
            ),
            q(6, "", vec![3], DotKind::Essay),
        ],
        images,
    };
    let skipped = [Skipped {
        position: 7,
        title: "Форма".to_owned(),
        reason: "вид form не переносится".to_owned(),
    }];
    let parsed = round_trip(&test, &skipped);
    let info = parsed
        .issues
        .iter()
        .find(|i| i.code == "other_sheets")
        .unwrap();
    assert_eq!(info.severity, Severity::Info);
    assert_eq!(info.params["names"], serde_json::json!(["Пропущено"]));
    // The WebP keeps its own part and content type.
    let bytes = write(&test, &[]).unwrap();
    let parts = unzip(&bytes);
    assert!(
        parts
            .iter()
            .any(|(n, d)| n.ends_with(".webp") && d == &test.images[0].bytes)
    );
    let types = &parts
        .iter()
        .find(|(n, _)| n == "[Content_Types].xml")
        .unwrap()
        .1;
    assert!(String::from_utf8_lossy(types).contains("image/webp"));
}

#[test]
fn settings_row_uses_dot_labels() {
    let test = DotTest {
        title: "T".to_owned(),
        attempts: 1,
        time_minutes: 55,
        limit: 1,
        leveling: true,
        questions: vec![DotQuestion {
            row: 2,
            text: "Q".to_owned(),
            images: vec![],
            level: 201,
            kind: DotKind::Essay,
        }],
        images: vec![],
    };
    round_trip(&test, &[]);
    let parts = unzip(&write(&test, &[]).unwrap());
    let styles = String::from_utf8(
        parts
            .iter()
            .find(|(n, _)| n == "xl/styles.xml")
            .unwrap()
            .1
            .clone(),
    )
    .unwrap();
    for label in [
        "[количество попыток]",
        "[время на выполнение в минутах]",
        "[лимит вопросов]",
        "[распределение по сложности: включено]",
        "[эссе]",
    ] {
        assert!(styles.contains(label), "{label}");
    }
    assert!(parts.iter().any(|(n, _)| n.contains("comments")));
}

#[test]
fn the_template_reads_back_clean() {
    let bytes = ab_xlsx::template().unwrap();
    let parsed = ab_xlsx::parse(&bytes, ab_xlsx::ParseOptions::default());
    assert!(!parsed.has_errors(), "{:?}", parsed.issues);
    assert_eq!(parsed.sheet, "Test");
    let mut test = parsed.test.unwrap();
    for q in &mut test.questions {
        q.row = 0;
    }
    assert_eq!(test, ab_xlsx::template_test());
    // The instructions sheet is noted, not read.
    assert!(parsed.issues.iter().any(|i| i.code == "other_sheets"));
}
